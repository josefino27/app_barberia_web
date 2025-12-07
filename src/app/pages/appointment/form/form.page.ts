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
  selectedPhone: string | undefined = undefined;
  serviceDuration: number = 0; // Duración total del servicio
  user: User | null = null;
  public barbers$!: Observable<User[]>;
  timeSlotInterval: number = 15; // Intervalo de tiempo para los slots (e.g., 15 o 30 minutos)
  barberName: string | null = null;
  userDocRef: AppointmentModel | null = null;
  bookedAppointments: AppointmentModel[] = []
  // Mapeo de duración de servicios
  private serviceDurations = {
    'corte-hombre': 60, // en minutos
    'arreglo-barba': 60,
    'tinte': 60,
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
      clientPhone: [null, [Validators.required, Validators.minLength(10), Validators.maxLength(10)]],
    });
  }

  private readonly injector = inject(EnvironmentInjector);
  ngOnInit() {

    runInInjectionContext(this.injector, async () => {

      // 1. Obtener ID de la ruta (sincrono)
      this.appointmentId = this.activatedRoute.snapshot.paramMap.get('id');
      this.barbers$ = this.firestoreService.barbersUserData$;
      const userData = await this.afauth.getCurrentUser();
      this.user = userData;

      if (this.appointmentId) {
        this.isViewing = true;
        this.loadAppointmentForm(this.appointmentId);
      } else {
        this.listenToFormChanges();
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
    //console.log("barberId ", barberId);
    this.selectedBarberSchedule = [];
    // this.isLoading = true;

    try {
      // 1. Obtener los documentos de horario para este barbero
      // NOTA: Asumo que getBarberSchedule devuelve un array de BarberScheduleModel
      // const schedules = await this.firestoreService.getBarberSchedule(barberId, this.selectedDate!.toString());

      // 2. Transformar los datos de Firestore al formato que necesitamos
      // this.selectedBarberSchedule = this.transformSchedules(schedules);

      // console.log('onBarberChange | getBarberSchedule | Horario transformado:', schedules);

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
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'modal-button-cancel',
          handler: () => {
            return;
          }
        }, {
          text: 'Confirmar',
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
        dateControl.valueChanges.pipe(startWith(dateControl.value)),
      ])
        .subscribe(async ([selectedService, selectedBarber, selectedDate]) => {
          // Guarda el barbero seleccionado
          this.selectedBarber = selectedBarber;
          // Guarda la fecha seleccionada
          this.selectedDate = selectedDate;
          // La duración del servicio se actualiza siempre, pero solo afecta al re-filtrado.
          const serviceKey = selectedService as keyof typeof this.serviceDurations;
          this.serviceDuration = this.serviceDurations[serviceKey] || 0;

          // Si se selecciona un barbero, genera los días y carga las horas.
          // Esta es la parte clave: la carga de horas ya no depende del servicio.
          if (selectedBarber) {
            //this.generateNext7Days();
            this.selectedBarber = barberControl.value;
            this.barbers$.pipe(
              map(barbers => ({ selectedBarber, barbers })), take(1)
            ).subscribe(({ selectedBarber, barbers }) => {
              if (selectedBarber) {
                // Buscar el objeto Barbero completo por su ID
                const selectedBarberObject = barbers.find(b => b.id === selectedBarber);

                // 3. Capturar y almacenar el nombre
                this.barberName = selectedBarberObject?.name || null;
                this.selectedBarber = selectedBarber;
                this.onBarberChange(selectedBarber);
              } else {
                this.barberName = null;
                this.selectedBarber = null;
                this.availableHours = [];
              }
            })
            //console.log("listenToFormChanges barberId ", this.selectedBarber);
            //console.log("listenToFormChanges barberName ", this.barberName);
            //console.log("listenToFormChanges selectedDate ", this.selectedDate);
            this.selectedBarberSchedule = [];
            //this.isLoading = true;
            try {
              if (this.serviceDuration && this.selectedBarber) this.isViewingDate = true;
              if (this.selectedBarber && this.selectedDate) {
                this.selectedDate = dateControl.value;
                // 1. Obtener los documentos de horario para este barbero
                this.selectedBarberSchedule = await this.firestoreService.getBarberSchedule(selectedBarber, this.selectedDate!.toString().split('T')[0]);
                // 2. Transformar los datos de Firestore al formato que necesitamos
                //this.selectedBarberSchedule = this.transformSchedules(schedules);
                //console.log('listenToFormChanges this.selectedBarberSchedule:', this.selectedBarberSchedule);
                // Carga las horas disponibles del barbero.
                this.isViewingDate = false;

                this.loadAvailableHours();
                
                //console.log("listentoformchages combinedDate",this.selectedDate);

              }

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
        clientPhone: this.user.phone!
      });
    }
  }

  onHourSelected(event: string) {
    const hour = event;
    this.selectedHour = hour;
    //console.log('this.selectedHour', this.selectedHour);
    if (this.selectedDate) {
      const [h, m] = hour.split(':').map(Number);

      // Obtiene los componentes de la fecha seleccionada
      const year = this.selectedDate.getFullYear();
      const month = this.selectedDate.getMonth();
      const day = this.selectedDate.getDate();

      // Crea un nuevo objeto Date usando los componentes locales
      this.combinedDate = new Date(year, month, day, h, m, 0);

      //console.log('hournselected combinedDate', this.combinedDate);
      const dayFormatter = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true,
      });
      this.formattedAppointmentDate = dayFormatter.format(this.combinedDate);
      this.isViewingDate = true;
      this.isViewing = true;
      //console.log(new Date(this.formattedAppointmentDate));
      
    }
  }

  onDaySelected(event: any) {
    const selectedDateStr = event.detail.value;
    //console.log("this.selectedDateStr ", selectedDateStr);
    this.selectedDate = new Date(selectedDateStr);
    //console.log("this.selectedDate ", this.selectedDate);
    this.selectedHour = null;
    this.isViewingDate = true
    this.loadAvailableHours();
  }

  resetSelection() {
    this.selectedDate = null;
    this.selectedHour = null;
    this.formattedAppointmentDate = null;
    this.appointmentForm.patchValue({ date: null });
    this.isViewingDate = true;
    this.isViewing = false;
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


    const barberSchedule = this.selectedBarberSchedule;
    //console.log("barberSchedule ", barberSchedule);
    // Paso 1: Obtener las citas existentes para el barbero y día seleccionados.
    if (this.selectedBarber && this.selectedDate) {
      this.bookedAppointments = await this.firestoreService.getAppointmentsForBarberAndDay(
        this.selectedBarber,
        this.selectedDate
      );
      //console.log("bookedAppointments ", this.bookedAppointments);
    }

    const startMinutes = barberSchedule.map(
      start => {
        this.startMin = this.timeToMinutes(start.startTime);

        return this.startMin;
      }

    )
    // console.log("startMinutes ", startMinutes);
    // console.log("this.startMin ", this.startMin);
    // Convertir horas de inicio, fin y pausa a minutos
    // NOTA: Asumiendo que las propiedades son 'start', 'end', 'breakStart', 'breakEnd' como strings "HH:mm"
    const endMinutes = barberSchedule.map(
      end => {
        this.endMin = this.timeToMinutes(end.endTime);
        return this.endMin;
      }
    )
    // console.log("endMinutes ", endMinutes);
    // console.log("this.endMin ", this.endMin);
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

      // console.log(" slotStartMinutes", slotStartMinutes);
      // console.log("slotEndMinutes ", slotEndMinutes);
      // B. Filtro por Citas Existentes (superposición)
      const hasConflict = this.checkIfConflicting(
        this.bookedAppointments,
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
    // console.log("this.availableHours ", this.availableHours);
    
    this.isViewing = false;
    this.selectedHour = null; // Limpia la hora seleccionada

  }

  async onSubmit() {
    const appointmentData = this.appointmentForm.getRawValue();

    if (this.appointmentForm.valid) {
      const appointment: AppointmentModel = {
        service: this.appointmentForm.value.service,
        barber: this.barberName!,
        date: this.combinedDate,
        clientName: this.appointmentForm.value.clientName,
        clientPhone: this.appointmentForm.value.clientPhone,
        status: 'agendada',
        clientEmail: this.appointmentForm.value.clientEmail,
        clientId: this.user?.id!,
        barberId: this.selectedBarber!
      };

      if (this.appointmentId) {
        await this.firestoreService.updateAppointment(this.appointmentId, appointmentData);
        //console.log('Cita actualizada con éxito:', appointmentData);
        this.router.navigate(['/appointment']);
      } else {
        //console.log("appointmen",appointment);
        // try {
        //   await this.firestoreService.addAppointment(appointment);
        //   //console.log('Cita agendada con éxito:', appointment);
        //   this.appointmentForm.reset();
        //   this.router.navigate(['/appointment']);
        // } catch (error) {
        //   console.error('Error al agendar la cita:', error);
        // }
      }
    }
    if (this.appointmentForm.invalid) {
      this.errorMessage = 'Por favor, completa los campos correctamente.';
      return;
    }
  }

  async loadAppointmentForm(id: string): Promise<void> {
    this.userDocRef = await this.firestoreService.getAppointmentById(id);
    //console.log("userDocRef", this.userDocRef);
    if (this.userDocRef && this.userDocRef.date instanceof Date) {
      this.appointmentForm.patchValue(this.userDocRef);
      // 1. Establece el barbero y el  de la cita
      // Esto es crucial para que los selectores se muestren correctamente
      this.selectedBarber = this.userDocRef.barberId;
      const serviceKey = this.userDocRef.service as keyof typeof this.serviceDurations;
      this.serviceDuration = this.serviceDurations[serviceKey] || 0;
      // 6. Formatea la fecha para la vista
      const dayFormatter = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true,
      });
      this.formattedAppointmentDate = dayFormatter.format(this.userDocRef.date);

      // 7. Actualiza los valores del formulario
      //this.appointmentForm.patchValue(this.userDocRef);
      this.appointmentForm.patchValue({
        barber: this.userDocRef.barberId,
        service: this.userDocRef.service,
        clientName: this.userDocRef.clientName,
        clientEmail: this.userDocRef.clientEmail,
        clientPhone: this.userDocRef.clientPhone
      });
    }
  }

  // async deleteAppointment() {
  //   const user = await this.firestoreService
  //     .deleteAppointmentById(this.appointmentId);
  //   this.router.navigate(['/appointment']);

  // }

  onDateChange(event: any): void {
    const value = event.detail.value;
    //console.log("fecha seleccionada: ", value);
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