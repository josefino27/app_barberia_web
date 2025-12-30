import { Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { IonicModule, IonModal, IonDatetime, IonDatetimeButton, IonPicker, IonButton, AlertController, DatetimeCustomEvent, LoadingController, ToastController } from '@ionic/angular';
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { FirestoreService } from 'src/app/services/firestore';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, firstValueFrom, map, Observable, shareReplay, startWith, Subscription, switchMap, take } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from 'src/app/services/auth';
import { BarberScheduleModel } from 'src/app/interfaces/horarios';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-appointment-form',
  templateUrl: './form.page.html',
  styleUrls: ['./form.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule,
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatTimepickerModule
  ]
})
export class AppointmentFormPage implements OnInit {

  appointmentForm!: FormGroup;
  today: string;
  oneWeekFromNow: string;
  appointmentId: string | null = null;
  formattedAppointmentDate: string | null = null;
  isViewing: boolean = false;
  isViewingDispo: boolean = false;
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
  bookedAppointments: AppointmentModel[] = [];
  isSelectDisabled: boolean = false;
  // Mapeo de duración de servicios
  private serviceDurations = {
    'corte-hombre': 60, // en minutos
    'arreglo-barba': 60,
    'tinte': 60,
  };

  // selectedBarberSchedule: { days: number[], hours: string[] } | null = null;
  selectedBarberSchedule: BarberScheduleModel[] = [];
  isLoading: boolean = false;
  lbSelectBarber: string = 'Selecciona un Barbero';
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
    private loadingController: LoadingController,
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
      this.barbers$ = this.firestoreService.barbersUserData$('');
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
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: this.appointmentId ? 'Actualizando cita...' : 'Creando cita...',
      spinner: 'crescent'
    });
    await loading.present();




    try {
      // 1. Obtener los documentos de horario para este barbero
      // NOTA: Asumo que getBarberSchedule devuelve un array de BarberScheduleModel
      // const schedules = await this.firestoreService.getBarberSchedule(barberId, this.selectedDate!.toString());
      if (!barberId) {
        return;
      }
      this.selectedBarber = barberId;
      // 2. Transformar los datos de Firestore al formato que necesitamos
      // this.selectedBarberSchedule = this.transformSchedules(schedules);

      console.log('onBarberChange | getBarberSchedule | Horario transformado:', this.selectedBarber);

    } catch (error) {
      console.error('Error al cargar y transformar horarios:', error);
      this.errorMessage = 'No se pudo cargar el horario del barbero.';
    } finally {
      await loading.dismiss();
      this.isLoading = false; // ⬅️ Finaliza la carga
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
    // this.isLoading = true;
    // const loading = await this.loadingController.create({
    //   message: this.appointmentId ? 'Actualizando cita...' : 'Creando cita...',
    //   spinner: 'crescent'
    // });
    // await loading.present();
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

          // La duración del servicio se actualiza siempre, pero solo afecta al re-filtrado.
          const serviceKey = selectedService as keyof typeof this.serviceDurations;
          this.serviceDuration = this.serviceDurations[serviceKey] || 0;

          // Si se selecciona un barbero, genera los días y carga las horas.
          // Esta es la parte clave: la carga de horas ya no depende del servicio.
          if (selectedBarber) {
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

            if (this.serviceDuration && this.selectedBarber) {
              this.isViewingDate = true;

            }
            if (selectedDate) {
              // Guarda la fecha seleccionada
              this.selectedDate = new Date(selectedDate);
              let day = this.selectedDate?.getDay();
              console.log("this.day", day);
              let dayToString = day?.toString();
              console.log("this.dayToString", dayToString);
              // 1. Obtener los documentos de horario para este barbero
              this.selectedBarberSchedule = await this.firestoreService.getBarberSchedule(selectedBarber, dayToString);
              // // 2. Transformar los datos de Firestore al formato que necesitamos
              // //this.selectedBarberSchedule = this.transformSchedules(schedules);
              // //console.log('listenToFormChanges this.selectedBarberSchedule:', this.selectedBarberSchedule);
              // // Carga las horas disponibles del barbero.
              // // this.isViewingDate = false;
              // // this.isViewing = true;
              console.log("this.selectedBarberSchedule ",this.selectedBarberSchedule);
              this.loadAvailableHours(this.selectedBarberSchedule);

              //console.log("listentoformchages combinedDate",this.selectedDate);

            }
          }
        });
    }
  }

  // Parchea los datos del usuario en el formulario
  async patchUserInForm() {
    if (this.user) {
      this.isLoading = true;
      const loading = await this.loadingController.create({
        message: this.appointmentId ? 'Actualizando cita...' : 'Creando cita...',
        spinner: 'crescent'
      });
      await loading.present();
      try {
        this.appointmentForm.patchValue({
          barber: this.user?.barberId,
          clientName: this.user.name,
          clientEmail: this.user.email,
          clientPhone: this.user.phone!
        });
        // this.appointmentForm.get('barber')?.disable();
        this.lbSelectBarber = 'Barbero';
      } catch (error) {
        console.error('Error al cargar datos del formulario:', error);
        this.errorMessage = 'No se pudo cargar datos del formulario.';
      } finally {
        await loading.dismiss();
        this.isLoading = false; // ⬅️ Finaliza la carga
      }

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
      this.isViewing = true;
      this.isViewingDispo = false;
      //this.isSelectDisabled = true;
      this.appointmentForm.get('barber')?.disable();
      console.log(new Date(this.formattedAppointmentDate));

    }
  }

  async onDaySelected(event: any) {
    const selectedDateStr = event.detail.value;
    //console.log("this.selectedDateStr ", selectedDateStr);
    this.selectedDate = new Date(selectedDateStr);
    let day = this.selectedDate.getDay();
    let dayToString = day.toString();
    console.log("this.selectedDate ", this.selectedDate.getDay());
    this.selectedBarberSchedule = await this.firestoreService.getBarberSchedule(this.selectedBarber!, dayToString);
    //console.log("this.selectedBarber ", this.selectedBarber);
    //console.log("this.selectedBarberSchedule ", this.selectedBarberSchedule);
    //  this.loadAvailableHours(this.selectedBarberSchedule);
    this.selectedHour = null;
    this.isViewingDate = false;
    this.isViewingDispo = true;
    // this.loadAvailableHours();
  }

  resetSelection() {
    this.selectedDate = null;
    this.selectedHour = null;
    this.formattedAppointmentDate = null;
    this.appointmentForm.patchValue({ date: null });
    this.isViewingDate = true;
    this.isViewing = false;
    this.isSelectDisabled = false;
    this.appointmentForm.get('barber')?.enable();
  }
  
  backTime(){
    this.isViewingDispo = false;
    this.isViewingDate = true;
    this.selectedHour = null;
    this.appointmentForm.patchValue({ date: null });
    this.isViewing = false;
    this.isSelectDisabled = false;
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

  async loadAvailableHours(barberSchedule: BarberScheduleModel[]): Promise<void> {
    if (barberSchedule.length === 0) {
      console.log("barberSchedule vacio ", barberSchedule);
      this.startMin = 540;
      this.endMin = 1260;
    } else {
      const startMinutes = barberSchedule.map(
        start => {
          this.startMin = this.timeToMinutes(start.startTime);

          return this.startMin;
        }

      )
      const endMinutes = barberSchedule.map(
        end => {
          this.endMin = this.timeToMinutes(end.endTime);

          return this.endMin;
        }

      )
    }
    // Paso 1: Obtener las citas existentes para el barbero y día seleccionados.
    if (this.selectedBarber && this.selectedDate) {
      this.bookedAppointments = await this.firestoreService.getAppointmentsForBarberAndDay(
        this.selectedBarber,
        this.selectedDate
      );
      console.log("bookedAppointments ", this.bookedAppointments);
      console.log("bookedAppointments ", this.selectedBarber);
      console.log("bookedAppointments ", this.selectedDate);
    }


    // console.log("this.startMin ", this.startMin);
    // Convertir horas de inicio, fin y pausa a minutos
    // NOTA: Asumiendo que las propiedades son 'start', 'end', 'breakStart', 'breakEnd' como strings "HH:mm"

    // console.log("this.endMin ", this.endMin);
    let breakStartMinutes = 0;
    let breakEndMinutes = 0;
    const breakStart = barberSchedule.map(
      end => {
        breakStartMinutes = this.timeToMinutes(end.breakStart!);
        return breakStartMinutes;
      }
    )
    const breakEnd = barberSchedule.map(
      end => {
        
        breakEndMinutes = this.timeToMinutes(end.breakEnd!);
        return breakEndMinutes;
      }
    )

    // if (breakStart && breakEnd) {
    //   breakStartMinutes = this.timeToMinutes(breakStart.toString());
    //   breakEndMinutes = this.timeToMinutes(breakEnd.toString());
    // }
    console.log("breakStart", breakStart);
    console.log("breakEnd", breakEnd);
    const potentialHours: string[] = [];

    // Paso 2: Generar todos los slots de tiempo y filtrar por disponibilidad (incluyendo la duración)
    for (let time = this.startMin; time <= this.endMin - this.serviceDuration; time += this.timeSlotInterval) {
      const slotStartMinutes = time;
      const slotEndMinutes = time + this.serviceDuration;

      // A. Filtro por Horario de Pausa
      let isInBreak = false;
      if (breakStartMinutes < breakEndMinutes) {
        // El slot entra en conflicto con la pausa si se superpone
        isInBreak = slotStartMinutes < breakEndMinutes && slotEndMinutes > breakStartMinutes;
      }

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
    console.log("this.availableHours ", this.availableHours);

    // this.isViewingDate = false;
    // this.isViewing = true;
    this.selectedHour = null; // Limpia la hora seleccionada

  }

  async onSubmit() {
    const appointmentData = this.appointmentForm.getRawValue();

    this.isLoading = true;
    // const loading = await this.loadingController.create({
    //   message: this.appointmentId ? 'Actualizando cita...' : 'Creando cita...',
    //   spinner: 'crescent'
    // });
    // await loading.present();
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
    try {
      if (this.appointmentId) {
        await this.firestoreService.updateAppointment(this.appointmentId, appointmentData);
        //console.log('Cita actualizada con éxito:', appointmentData);
        this.appointmentForm.reset();
        this.resetSelection();
        this.router.navigate(['/appointment']);
      } else {
        //console.log("appointmen",appointment);

        await this.firestoreService.addAppointment(appointment);
        //console.log('Cita agendada con éxito:', appointment);
        this.appointmentForm.reset();
        this.resetSelection();
        this.appointmentForm.patchValue({ date: null });
        this.router.navigateByUrl('/appointment', { replaceUrl: true });
      }
    } catch (error) {
      console.error('Error al guardar la cita:', error);
    } finally {
      // await loading.dismiss();
      this.isLoading = false; // ⬅️ Finaliza la carga
    }
  }

  async loadAppointmentForm(id: string): Promise<void> {
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Cargando datos...',
      spinner: 'crescent'
    });
    await loading.present();
    try {
      this.userDocRef = await this.firestoreService.getAppointmentById(id);
      //console.log("userDocRef", this.userDocRef);
      if (this.userDocRef && this.userDocRef.date instanceof Date) {
        this.appointmentForm.patchValue(this.userDocRef);
        // 1. Establece el barbero y el  de la cita
        // Esto es crucial para que los selectores se muestren correctamente
        this.selectedBarber = this.userDocRef.barberId!;
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
    } catch (error) {
      console.error('Error al cargar la cita:', error);
    } finally {
      await loading.dismiss();
      this.isLoading = false; // ⬅️ Finaliza la carga
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