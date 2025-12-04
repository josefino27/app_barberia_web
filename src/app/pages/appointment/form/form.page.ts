import { Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { IonicModule, IonModal, IonDatetime, IonDatetimeButton, IonPicker, IonButton, AlertController, DatetimeCustomEvent } from '@ionic/angular';
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { FirestoreService } from 'src/app/services/firestore';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, firstValueFrom, map, Observable, shareReplay, startWith, Subscription, switchMap, take } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from 'src/app/services/auth';
import { Barber } from 'src/app/interfaces/barber';
import { BarberScheduleModel } from 'src/app/interfaces/horarios';

@Component({
  selector: 'app-appointment-form',
  templateUrl: './form.page.html',
  styleUrls: ['./form.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule,
    ReactiveFormsModule,
  ]
})
export class AppointmentFormPage implements OnInit {

  appointmentForm!: FormGroup;
  today: string;
  oneWeekFromNow: string;
  appointmentId: string | null = null;
  formattedAppointmentDate: string | null = null;
  isViewing: boolean = false;
  isViewingDate = false;
  errorMessage: string | null = null;
  barbero: string | undefined = undefined;
  days: { label: string, date: Date }[] = [];
  availableHours: string[] = [];
  selectedDate: Date | null = null;
  selectedHour: string | null = null;
  serviceDuration: number = 0; // Duración total del servicio
  user: User | null = null;
  public barbers$!: Observable<User[]>;
  // Simulación de la disponibilidad del barbero
  barberAvailability: string[] = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];
  timeSlotInterval: number = 15; // Intervalo de tiempo para los slots (e.g., 15 o 30 minutos)
  datePickerPresentation: 'date' | 'date-time' | 'time' | 'month' | 'month-year' | 'year' = 'date';

  // Mapeo de duración de servicios
  private serviceDurations = {
    'corte-hombre': 60, // en minutos
    'arreglo-barba': 60,
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

  // selectedBarberSchedule: { days: number[], hours: string[] } | null = null;
  selectedBarberSchedule: BarberScheduleModel[] = [];


  private serviceSubscription: Subscription | null | undefined = undefined;
  selectedBarber: string | null = null;
  public firestoreuser = this.afauth.getCurrentUser.name;
  combinedDate: Date = new Date();

  constructor(
    private formBuilder: FormBuilder,
    private firestoreService: FirestoreService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private afauth: AuthService,
    private alertController: AlertController,
    private afst: AngularFirestore
  ) {
    // Asegura que el FormGroup SIEMPRE esté definido antes de que el HTML se renderice
    this.initializeForm();
    // Configuración de las fechas
    const today = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(today.getDate() + 30);

    this.today = today.toISOString();
    this.oneWeekFromNow = oneWeekFromNow.toISOString();

  }

  // Método para encapsular la inicialización del formulario
  initializeForm() {
    this.appointmentForm = this.formBuilder.group({
      barber: ['', Validators.required],
      service: ['', Validators.required],
      date: [this.today, Validators.required],
      clientName: ['', Validators.required],
      clientEmail: ['', [Validators.required, Validators.email]],
      clientPhone: ['', Validators.required],
    });
  }

  private readonly injector = inject(EnvironmentInjector);
  ngOnInit() {

    runInInjectionContext(this.injector, async () => {

      // 1. Obtener ID de la ruta (sincrono)
      this.appointmentId = this.activatedRoute.snapshot.paramMap.get('id');
      console.log("CITAId", this.appointmentId);
      console.log("user", this.afauth.getCurrentUser);
      this.barbers$ = this.firestoreService.barbersUserData$;
      const userData = await this.afauth.getCurrentUser();
      this.user = userData;
      console.log("barbers$: ", this.barbers$);
      console.log("Usuario actual en form cita: ", this.user?.name);
      console.log("selectedBarber: ", this.selectedBarber);

      if (this.appointmentId) {
        console.log('CITA ID recibido:', this.appointmentId);
        this.isViewing = true;
        this.loadAppointmentForm(this.appointmentId);
      } else {

        let getBarberSchedule = this.firestoreService.getBarberSchedule(this.selectedBarber!, '');
        console.log("getBarberSchedule ", getBarberSchedule)
        //this.generateNext7Days();

        // Escuchamos los cambios en el servicio solo si es una nueva cita
        this.listenToFormChanges();

        // Si es una nueva cita, inicializa los valores del usuario actual
        this.patchUserInForm();
      }
    });

  }

  public async onBarberChange(barberId: string | null): Promise<void> {
    if (!barberId) {
      this.selectedBarberSchedule = [];
      return;
    }

    this.selectedBarber = barberId;
    console.log("barberId ", barberId);
    this.selectedBarberSchedule = [];
    //this.isLoading = true;

    try {
      // 1. Obtener los documentos de horario para este barbero
      // NOTA: Asumo que getBarberSchedule devuelve un array de BarberScheduleModel
      const schedules = await this.firestoreService.getBarberSchedule(barberId, this.selectedDate!.toString());

      // 2. Transformar los datos de Firestore al formato que necesitamos
      //this.selectedBarberSchedule = this.transformSchedules(schedules);

      console.log('Horario transformado:', schedules);

    } catch (error) {
      console.error('Error al cargar y transformar horarios:', error);
      this.errorMessage = 'No se pudo cargar el horario del barbero.';
      this.selectedBarberSchedule = [];
    } finally {
      //this.isLoading = false;
    }
  }

  async presentAlertMultipleButtons(id: string) {
    const alert = await this.alertController.create({
      cssClass: 'alert-buttons',
      header: 'Eliminar Cita',
      backdropDismiss: false,
      message: `¿Estas seguro que deseas eliminar esta cita?`,
      buttons: [

        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'modal-button-cancel',
          handler: (blah) => {
            console.log('Cancelar');
          }
        }, {
          text: 'Okay',
          handler: () => {
            try {
              // Llama al método de eliminación del servicio
              this.firestoreService.deleteAppointmentById(id);
              this.router.navigate(['/appointment']);
              // Opcional: mostrar un Toast de éxito

            } catch (error) {
              console.error('Fallo al eliminar la cita:', error);
              // Opcional: mostrar un Toast de error

            }
          }
        }
      ]
    });
    await alert.present();
  }

  private async listenToFormChanges() {
    const serviceControl = this.appointmentForm.get('service');
    const barberControl = this.appointmentForm.get('barber');
    const dateControl = this.appointmentForm.get('date');

    if (serviceControl && barberControl && dateControl) {
      this.serviceSubscription = combineLatest([
        serviceControl.valueChanges.pipe(startWith(serviceControl.value)),
        barberControl.valueChanges.pipe(startWith(barberControl.value)),
        dateControl.valueChanges.pipe(startWith(dateControl.value))
      ])
        .subscribe(async ([selectedService, selectedBarber, selectedDate]) => {
          // Guarda el barbero seleccionado
          this.selectedBarber = selectedBarber;
          this.selectedDate = selectedDate;
          // La duración del servicio se actualiza siempre, pero solo afecta al re-filtrado.
          const serviceKey = selectedService as keyof typeof this.serviceDurations;
          this.serviceDuration = this.serviceDurations[serviceKey] || 0;

          // Si se selecciona un barbero, genera los días y carga las horas.
          // Esta es la parte clave: la carga de horas ya no depende del servicio.
          if (selectedBarber) {
            //this.generateNext7Days();
            this.selectedBarber = barberControl.value;
            console.log("listenToFormChanges barberId ", this.selectedBarber);
            console.log("listenToFormChanges selectedDate ", this.selectedDate);
            this.selectedBarberSchedule = [];
            //this.isLoading = true;
            try {
              if (this.selectedDate) {
                this.selectedDate = dateControl.value;
                console.log("dateControl ", this.selectedDate!.toString().split('T')[0]);
                // 1. Obtener los documentos de horario para este barbero
                this.selectedBarberSchedule = await this.firestoreService.getBarberSchedule(selectedBarber, this.selectedDate!.toString().split('T')[0]);
                // 2. Transformar los datos de Firestore al formato que necesitamos
                //this.selectedBarberSchedule = this.transformSchedules(schedules);
                console.log('listenToFormChanges this.selectedBarberSchedule:', this.selectedBarberSchedule);
                  // Carga las horas disponibles del barbero.
                  this.loadAvailableHours();
                
              }
              console.log('listenToFormChanges Horario transformado: selecteddate ', this.selectedDate);

            } catch (error) {
              console.error('Error al cargar y transformar horarios:', error);
              this.errorMessage = 'No se pudo cargar el horario del barbero.';
              this.selectedBarberSchedule = [];
            } finally {
              //this.isLoading = false;
            }

          }
        });
    }
  }

  // Parchea los datos del usuario en el formulario
  patchUserInForm() {
    if (this.user) {
      this.appointmentForm.patchValue({
        clientName: this.user.name,
        clientEmail: this.user.email,
        clientPhone: this.user.phone
      });
    }
  }

  onHourSelected(event: string) {
    const hour = event;
    this.selectedHour = hour;
    console.log('this.selectedHour', this.selectedHour);
    if (this.selectedDate) {
      const [h, m] = hour.split(':').map(Number);

      // Obtiene los componentes de la fecha seleccionada
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      const day = this.selectedDate.getDate();

      // Crea un nuevo objeto Date usando los componentes locales
      this.combinedDate = new Date(year, month, day, h, m, 0);
      console.log('combinedDate', this.combinedDate);
      const dayFormatter = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true,
      });
      this.formattedAppointmentDate = dayFormatter.format(this.combinedDate);
      this.isViewingDate = true;
    }
  }

  onDaySelected(event: any) {
    const selectedDateStr = event.detail.value;
    console.log("this.selectedDateStr ", selectedDateStr);
    this.selectedDate = new Date(selectedDateStr);
    console.log("this.selectedDate ", this.selectedDate);
    this.selectedHour = null;
    this.loadAvailableHours();
  }

  resetSelection() {
    this.selectedDate = null;
    this.selectedHour = null;
    this.formattedAppointmentDate = null;
    this.appointmentForm.patchValue({ date: null });
    this.isViewingDate = false;
  }
  /**
     * Verifica si un slot de tiempo potencial entra en conflicto con alguna cita agendada.
     * @param bookedAppointments Citas existentes para el día.
     * @param slotStartMinutes Inicio del slot potencial (en minutos).
     * @param slotEndMinutes Fin del slot potencial (en minutos).
     */
  private checkIfConflicting(
    bookedAppointments: AppointmentModel[],
    slotStartMinutes: number,
    slotEndMinutes: number
  ): boolean {
    return bookedAppointments.some(appointment => {
      const appointmentDate = appointment.date as Date;
      const appointmentStartMinutes = appointmentDate.getHours() * 60 + appointmentDate.getMinutes();

      // Asume que la duración de la cita agendada está en el modelo (de lo contrario, usar servicio/duración estándar)
      // Usaremos la duración de servicio actual para simular la duración de la cita agendada si no está disponible.
      const appointmentDuration = this.getServiceDuration(appointment.service);
      const appointmentEndMinutes = appointmentStartMinutes + appointmentDuration;

      // Conflicto si los intervalos se superponen:
      // A inicia antes de que B termine Y A termina después de que B inicie.
      return (
        slotStartMinutes < appointmentEndMinutes &&
        slotEndMinutes > appointmentStartMinutes
      );
    });
  }

  // Función ficticia/simplificada para obtener duración del servicio (debería venir de Firestore)
  getServiceDuration(serviceName: string): number {
    const serviceDurations: { [key: string]: number } = {
      'corte-hombre': 60,
      'Afeitado': 30,
      'Corte + Afeitado': 60,
    };
    return serviceDurations[serviceName] || 30; // 30 minutos por defecto
  }

  /**
   * Helper para convertir "HH:mm" a minutos totales desde la medianoche.
   */
  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Función clave para cargar horas disponibles, corregida para generar y filtrar strings.
   */
  startMin: number = 0;
  endMin: number = 0;

  async loadAvailableHours(): Promise<void> {
    this.availableHours = [];

    // Verificación: Necesitamos barbero, fecha, duración del servicio y horario
    if (!this.selectedBarber || !this.selectedDate || !this.selectedBarberSchedule || this.serviceDuration <= 0) {
      // Si el barbero está seleccionado pero no tiene horario cargado, podemos asumir que está libre o no trabaja.
      if (this.selectedBarber && !this.selectedBarberSchedule) {
        console.log('Barbero seleccionado pero sin horario para este día.');
      }
      return;
    }

    const barberSchedule = this.selectedBarberSchedule;

    // Paso 1: Obtener las citas existentes para el barbero y día seleccionados.
    const bookedAppointments = await this.firestoreService.getAppointmentsForBarberAndDay(
      this.selectedBarber,
      this.selectedDate
    );
    console.log("bookedAppointments ", bookedAppointments);
    const startMinutes = barberSchedule.map(
      start => {
        this.startMin = this.timeToMinutes(start.startTime);

        return this.startMin;
      }

    )
    // Convertir horas de inicio, fin y pausa a minutos
    // NOTA: Asumiendo que las propiedades son 'start', 'end', 'breakStart', 'breakEnd' como strings "HH:mm"
    // const startMinutes = this.timeToMinutes(barberSchedule.start);
    const endMinutes = barberSchedule.map(
      end => {
        this.endMin = this.timeToMinutes(end.endTime);
        return this.endMin;
      }
    )

    let breakStartMinutes = 0;
    let breakEndMinutes = 0;

    // if (barberSchedule.hasBreak && barberSchedule.breakStart && barberSchedule.breakEnd) {
    //   breakStartMinutes = this.timeToMinutes(barberSchedule.breakStart);
    //   breakEndMinutes = this.timeToMinutes(barberSchedule.breakEnd);
    // }

    const potentialHours: string[] = [];

    // Paso 2: Generar todos los slots de tiempo y filtrar por disponibilidad (incluyendo la duración)
    for (let time = this.startMin; time <= this.endMin - this.serviceDuration; time += this.timeSlotInterval) {
      const slotStartMinutes = time;
      const slotEndMinutes = time + this.serviceDuration;

      // A. Filtro por Horario de Pausa
      let isInBreak = false;
      // if (barberSchedule.hasBreak && breakStartMinutes < breakEndMinutes) {
      //     // El slot entra en conflicto con la pausa si se superpone
      //     isInBreak = slotStartMinutes < breakEndMinutes && slotEndMinutes > breakStartMinutes;
      // }

      if (isInBreak) {
        continue; // Saltar slots que caen en la pausa
      }

      // B. Filtro por Citas Existentes (superposición)
      const hasConflict = this.checkIfConflicting(
        bookedAppointments,
        slotStartMinutes,
        slotEndMinutes
      );

      if (!hasConflict) {
        // C. Formatear y añadir el slot de inicio (string "HH:mm")
        const hour = Math.floor(time / 60);
        const minute = time % 60;
        const formattedHour = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        potentialHours.push(formattedHour);
      }
    }

    // Paso 3: Asignar el resultado (que ahora es string[])
    this.availableHours = potentialHours;
    console.log("this.availableHours ", this.availableHours);
    this.selectedHour = null; // Limpia la hora seleccionada
  }

  async onSubmit() {
    const appointmentData = this.appointmentForm.getRawValue();

    if (this.appointmentForm.valid) {
      const appointment: AppointmentModel = {
        service: this.appointmentForm.value.service,
        barber: this.appointmentForm.value.barber,
        date: this.combinedDate,
        clientName: this.appointmentForm.value.clientName,
        clientPhone: this.appointmentForm.value.clientPhone,
        status: 'agendada',
        clientEmail: 'jodanu19@gmail.com',
        clientId: '1vkew069EMdv4UARyVPzDzkbxhH2',
        barberId: 'ZliXcU4txNSDyLkuzBc6iVJ4v3g1'
      };
      console.log('appoinmentForm', appointment)

      console.log('appoinmentFormdata', appointmentData)

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

      // Parchear valores en el FormGroup INICIALIZADO en el constructor.
      this.appointmentForm.patchValue(userDocRef);
      // 1. Establece el barbero y el servicio de la cita
      // Esto es crucial para que los selectores se muestren correctamente
      this.selectedBarber = userDocRef.barber;
      const serviceKey = userDocRef.service as keyof typeof this.serviceDurations;
      this.serviceDuration = this.serviceDurations[serviceKey] || 0;

      // 2. Establece el horario del barbero para generar los días
      //this.selectedBarberSchedule = this.barberSchedules[this.selectedBarber as keyof typeof this.barberSchedules] || null;

      // 3. Ahora que el barbero y su horario están listos, genera los días
      //this.generateNext7Days();

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

  // async deleteAppointment() {
  //   const user = await this.firestoreService
  //     .deleteAppointmentById(this.appointmentId);
  //   this.router.navigate(['/appointment']);

  // }

  onDateChange(event: any): void {
    const value = event.detail.value;
    console.log("fecha seleccionada: ", value);
    // if (value === 'all' || value === null || value === undefined) {
    //   this.selectedDateSubject.next('all');
    //   this.selectedDateValue = 'all'; 
    // } else {
    //   // El valor es una string ISO de la fecha seleccionada
    //   const dateObject = new Date(value);
    //   this.selectedDateSubject.next(dateObject);
    //   this.selectedDateValue = dateObject.toISOString(); 
  }

  getToday(): string {
    // Usamos el DatePipe de Angular para formatear la fecha a ISO
    return new Date().getDate().toLocaleString();
  }

  ngOnDestroy() {
    // Es importante desuscribirse para evitar fugas de memoria
    if (this.serviceSubscription) {
      this.serviceSubscription.unsubscribe();
    }
  }
}