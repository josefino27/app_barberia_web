import { Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { IonicModule, IonModal, IonDatetime, IonDatetimeButton, IonPicker, IonButton } from '@ionic/angular';
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { FirestoreService } from 'src/app/services/firestore';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, firstValueFrom, map, startWith, Subscription } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from 'src/app/services/auth';

@Component({
  selector: 'app-appointment-form',
  templateUrl: './form.page.html',
  styleUrls: ['./form.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule,
    ReactiveFormsModule,
  ]
})
export class AppointmentFormPage implements OnInit {

  appointmentForm: FormGroup;
  today: string;
  oneWeekFromNow: string;
  appointmentId: string | null = null;
  formattedAppointmentDate: string | null = null;
  isViewing: boolean = false;
  errorMessage: string | null = null;
  
  days: { label: string, date: Date }[] = [];
  availableHours: string[] = [];
  selectedDate: Date | null = null;
  selectedHour: string | null = null;
  serviceDuration: number = 0; // Duración total del servicio
  user: User | null = null;

  // Simulación de la disponibilidad del barbero
  barberAvailability: string[] = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];

  // Mapeo de duración de servicios
  private serviceDurations = {
    'corte-hombre': 30, // en minutos
    'arreglo-barba': 15,
    'tinte': 60,
  };

  private barberSchedules = {
    'barbero-A': {
      days: [0, 1, 2, 3, 4], // 0 = Domingo, 1 = Lunes, etc.
      hours: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00']
    },
    'barbero-B': {
      days: [2, 3, 4, 5, 6],
      hours: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00']
    },
    'barbero-C': {
      days: [1, 3, 5],
      hours: ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00']
    }
  };

  selectedBarberSchedule: { days: number[], hours: string[] } | null = null;


  private serviceSubscription: Subscription | null | undefined = undefined;
  selectedBarber: string | null = null;
  public firestoreuser = this.afauth.getCurrentUser.name;;

  constructor(
    private formBuilder: FormBuilder,
    private firestoreService: FirestoreService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private afauth: AuthService
  ) {

    // Configuración de las fechas
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 7);

    this.today = today.toISOString();
    this.oneWeekFromNow = oneWeekFromNow.toISOString();

    this.appointmentForm = this.formBuilder.group({
      service: ['', Validators.required],
      barber: ['', Validators.required],
      date: [''],
      clientEmail: ['', [Validators.required, Validators.minLength(10), Validators.email]],
      clientName: ['', Validators.required],
    });
  }

  private readonly injector = inject(EnvironmentInjector);
  ngOnInit() {

    runInInjectionContext(this.injector, async() => {
      this.appointmentId = this.activatedRoute.snapshot.paramMap.get('id');
      console.log("CITAId", this.appointmentId);
      console.log("user", this.afauth.getCurrentUser);
      const userData = await this.afauth.getCurrentUser();
      this.user = userData;
      console.log("Usuario actual en form cita: ", this.user?.name);

      if (this.appointmentId) {
        console.log('CITA ID recibido:', this.appointmentId);
        this.isViewing = true;
        this.loadAppointmentForm(this.appointmentId);
      } else {
        this.generateNext7Days();
        // Escuchamos los cambios en el servicio solo si es una nueva cita
        this.listenToFormChanges();
      }
    });

  }

  private listenToFormChanges() {
    const serviceControl = this.appointmentForm.get('service');
    const barberControl = this.appointmentForm.get('barber');

    if (serviceControl && barberControl) {
      this.serviceSubscription = combineLatest([
        serviceControl.valueChanges.pipe(startWith(serviceControl.value)),
        barberControl.valueChanges.pipe(startWith(barberControl.value))
      ])
        .subscribe(([selectedService, selectedBarber]) => {
          // Guarda el barbero seleccionado
          this.selectedBarber = selectedBarber;

          // La duración del servicio se actualiza siempre, pero solo afecta al re-filtrado.
          const serviceKey = selectedService as keyof typeof this.serviceDurations;
          this.serviceDuration = this.serviceDurations[serviceKey] || 0;

          // Si se selecciona un barbero, genera los días y carga las horas.
          // Esta es la parte clave: la carga de horas ya no depende del servicio.
          if (selectedBarber) {
            this.selectedBarberSchedule = this.barberSchedules[selectedBarber as keyof typeof this.barberSchedules] || null;
            this.generateNext7Days();
            // Carga las horas disponibles del barbero.
            this.loadAvailableHours();
          }
        });
    }
  }

  onDaySelected(event: any) {
    const selectedDateStr = event.detail.value;
    this.selectedDate = new Date(selectedDateStr);
    this.selectedHour = null;
    this.loadAvailableHours();
    console.log('selectedDate', this.selectedDate)
  }

  onHourSelected(event: any) {
    const hour = event.detail.value;
    this.selectedHour = hour;
    console.log('this.selectedHour', this.selectedHour);
    if (this.selectedDate) {
      const [h, m] = hour.split(':').map(Number);

      // Obtiene los componentes de la fecha seleccionada
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      const day = this.selectedDate.getDate();

      // Crea un nuevo objeto Date usando los componentes locales
      const combinedDate = new Date(year, month, day, h, m, 0);
      console.log('combinedDate', combinedDate);
      this.appointmentForm.patchValue({ date: combinedDate });
    }
  }

  generateNext7Days() {
    this.days = [];
    if (!this.selectedBarberSchedule) {
      return; // No hay barbero, no hay días para mostrar
    }
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();// 0 = Domingo, 1 = Lunes, etc.
      if (this.selectedBarberSchedule.days.includes(dayOfWeek)) {

        let label = '';
        if (i === 0) {
          label = 'Hoy';
        } else if (i === 1) {
          label = 'Mañana';
        } else {
          const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
          label = dayFormatter.format(date);
        }
        this.days.push({ label, date });
      }
    }
  }

  selectDay(day: { label: string, date: Date }) {
    this.selectedDate = day.date;
    this.selectedHour = null;
    this.loadAvailableHours();
    console.log('selectedDate', this.selectedDate)
  }

  resetSelection() {
    this.selectedDate = null;
    this.selectedHour = null;
    this.formattedAppointmentDate = null;
    this.appointmentForm.patchValue({ date: null });
  }

  async loadAvailableHours() {
    this.availableHours = [];

    if (!this.selectedBarber || !this.selectedDate) {
      return;
    }

    // Paso 1: Obtener las citas existentes para el barbero y día seleccionados.
    const bookedAppointments = await this.firestoreService.getAppointmentsForBarberAndDay(
      this.selectedBarber,
      this.selectedDate
    );

    const barberHours = this.selectedBarberSchedule!.hours;

    // Paso 2: Filtra las horas del barbero que entran en conflicto con citas existentes.
    const availableBaseHours = barberHours.filter(hour => {
      const [h, m] = hour.split(':').map(Number);
      const startTimeInMinutes = h * 60 + m;
      const endTimeInMinutes = startTimeInMinutes + 1; // Usamos 1 minuto como duración para el chequeo de conflicto inicial

      // El método checkIfConflicting ya se encarga de la lógica de superposición
      const hasConflict = this.checkIfConflicting(
        bookedAppointments,
        startTimeInMinutes,
        endTimeInMinutes
      );
      return !hasConflict;
    });

    // Paso 3: Volver a filtrar las horas disponibles basándose en la duración del servicio.
    const filteredByServiceDuration = availableBaseHours.filter(hour => {
      const [h, m] = hour.split(':').map(Number);
      const startTimeInMinutes = h * 60 + m;

      // Busca la próxima cita agendada después de la hora actual
      const nextBookedAppointment = bookedAppointments
        .filter(app => {
          const bookedAppTime = (app.date as Date).getHours() * 60 + (app.date as Date).getMinutes();
          return bookedAppTime > startTimeInMinutes;
        })
        .sort((a, b) => {
          const aTime = (a.date as Date).getHours() * 60 + (a.date as Date).getMinutes();
          const bTime = (b.date as Date).getHours() * 60 + (b.date as Date).getMinutes();
          return aTime - bTime;
        })[0];

      // Calcula el tiempo disponible en minutos
      let availableTimeSlot = 0;
      if (nextBookedAppointment) {
        const nextAppointmentTime = (nextBookedAppointment.date as Date).getHours() * 60 + (nextBookedAppointment.date as Date).getMinutes();
        availableTimeSlot = nextAppointmentTime - startTimeInMinutes;
      } else {
        // Si no hay más citas, calcula hasta el final del horario del barbero
        const [lastHour, lastMinute] = this.selectedBarberSchedule!.hours[this.selectedBarberSchedule!.hours.length - 1].split(':').map(Number);
        const lastBarberTime = lastHour * 60 + lastMinute;
        availableTimeSlot = lastBarberTime - startTimeInMinutes;
      }

      // Retorna true si la duración del servicio cabe en el espacio disponible
      return this.serviceDuration <= availableTimeSlot;
    });

    this.availableHours = filteredByServiceDuration;
    this.selectedHour = null; // Limpia la hora seleccionada
  }

  private checkIfConflicting(bookedAppointments: any[], newAppointmentStartTime: number, newAppointmentEndTime: number): boolean {
    for (const bookedApp of bookedAppointments) {
      const bookedAppDate = bookedApp.date as Date;
      const bookedAppServiceDuration = this.serviceDurations[bookedApp.service as keyof typeof this.serviceDurations] || 0;

      const bookedAppHour = bookedAppDate.getHours();
      const bookedAppMinutes = bookedAppDate.getMinutes();
      const bookedAppStartTime = bookedAppHour * 60 + bookedAppMinutes;
      const bookedAppEndTime = bookedAppStartTime + bookedAppServiceDuration;

      // Comprueba si hay una superposición de tiempo
      const overlaps = (newAppointmentStartTime < bookedAppEndTime && newAppointmentEndTime > bookedAppStartTime);

      if (overlaps) {
        // Conflicto encontrado
        return true;
      }
    }
    // No se encontraron conflictos
    return false;
  }
  selectHour(hour: string) {
    this.selectedHour = hour;
    if (this.selectedDate) {
      const combinedDate = new Date(this.selectedDate.toISOString().split('T')[0] + 'T' + hour + ':00');
      this.appointmentForm.patchValue({ date: combinedDate });
    }
  }

  async onSubmit() {
    if (this.appointmentForm.valid) {
      const appointment: AppointmentModel = {
        service: this.appointmentForm.value.service,
        barber: this.appointmentForm.value.barber,
        date: this.appointmentForm.value.date, // Convertimos el string a un objeto Date
        clientName: this.appointmentForm.value.clientName,
        clientPhone: this.appointmentForm.value.clientPhone,
        status: 'agendada'
      };
      console.log('appoinmentForm', appointment)

      const appointmentData = this.appointmentForm.getRawValue();

      if (this.appointmentId) {
        await this.firestoreService.updateAppointment(this.appointmentId, appointmentData);
        console.log('Cita actualizada con éxito:', appointmentData);
        this.router.navigate(['/appointment']);
      } else {
        try {
          await this.firestoreService.addAppointment(appointment);
          console.log('Cita agendada con éxito:', appointment);
          this.appointmentForm.reset();
          this.router.navigate(['/appointment']);
        } catch (error) {
          console.error('Error al agendar la cita:', error);
        }
      }
    }
    if (this.appointmentForm.invalid) {
      this.appointmentForm.markAllAsTouched(); // <--- Aquí se usa
      this.errorMessage = 'Por favor, completa los campos correctamente.';
      return;
    }
  }

  async loadAppointmentForm(id: string): Promise<void> {
    const userDocRef = await this.firestoreService.getAppointmentById(id);

    if (userDocRef && userDocRef.date instanceof Date) {
      // 1. Establece el barbero y el servicio de la cita
      // Esto es crucial para que los selectores se muestren correctamente
      this.selectedBarber = userDocRef.barber;
      const serviceKey = userDocRef.service as keyof typeof this.serviceDurations;
      this.serviceDuration = this.serviceDurations[serviceKey] || 0;

      // 2. Establece el horario del barbero para generar los días
      this.selectedBarberSchedule = this.barberSchedules[this.selectedBarber as keyof typeof this.barberSchedules] || null;

      // 3. Ahora que el barbero y su horario están listos, genera los días
      this.generateNext7Days();

      // 4. Establece la fecha y hora seleccionadas
      this.selectedDate = userDocRef.date;
      this.selectedHour = userDocRef.date.toTimeString().slice(0, 5);

      // 5. Carga las horas disponibles para ese día (considerando el nuevo servicio)
      this.loadAvailableHours();

      // 6. Formatea la fecha para la vista
      const dayFormatter = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true,
      });
      this.formattedAppointmentDate = dayFormatter.format(userDocRef.date);

      // 7. Actualiza los valores del formulario
      this.appointmentForm.patchValue(userDocRef);
    }
  }

  async deleteAppointment() {
    const user = await this.firestoreService
      .deleteAppointmentById(this.appointmentId);
    this.router.navigate(['/appointment']);

  }


  ngOnDestroy() {
    // Es importante desuscribirse para evitar fugas de memoria
    if (this.serviceSubscription) {
      this.serviceSubscription.unsubscribe();
    }
  }
}