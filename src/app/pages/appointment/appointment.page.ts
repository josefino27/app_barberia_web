
import { ChangeDetectorRef, Component, EnvironmentInjector, inject, OnDestroy, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonAlert, IonButton, IonicModule, ModalController } from '@ionic/angular';
import { FirestoreService } from 'src/app/services/firestore';
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, map, Observable, Subscription } from 'rxjs';
import { FormsModule, NgModel } from '@angular/forms';
import { AuthService } from 'src/app/services/auth';
import { Barber } from 'src/app/interfaces/barber';
import { AppointmentFilterPipe } from 'src/app/pipes/appointment-filter-pipe';
import { switchMap, tap, finalize, shareReplay, take } from 'rxjs/operators';
import { of, EMPTY, combineLatest } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { NavbarComponent } from "src/app/components/navbar/navbar.component";

@Component({
  selector: 'app-appointments',
  templateUrl: './appointment.page.html',
  styleUrls: ['./appointment.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterLink, FormsModule, NavbarComponent],
})
export class AppointmentsPage implements OnInit, OnDestroy {

  // Propiedades para el estado de la aplicación
  public isLoading: boolean = true;

  // Propiedades manuales del perfil (se asignan una vez)
  userRole: User | null = null;
  public currentUserName: string = 'Usuario Invitado';

  // Array que contendrá todas las citas cargadas en vivo
  private allAppointments: AppointmentModel[] = [];

  // Observable FINAL que usa el async pipe en la plantilla
  public filteredAppointments$: Observable<AppointmentModel[]> = of([]);

  // Sujetos reactivos para los filtros (necesarios para el combineLatest)
  public selectedBarbersSubject = new BehaviorSubject<string[]>([]);
  public searchInputSubject = new BehaviorSubject<string>('');
  public selectedDateSubject = new BehaviorSubject<Date | null>(null);
  private dateFilterSubject = new BehaviorSubject<Date | undefined>(undefined);

  // 🚨 Propiedades para manejar la confirmación de eliminación (simulando un modal/popup)
  public confirmDeleteId: string | null = null;
  public isDeleting: boolean = false;


  // Contenedor para la limpieza manual de suscripciones
  private subscriptions = new Subscription();

  // Lista de todos los barberos para los filtros de SuperAdmin
  public allBarbers: string[] = [];
  public filtered: AppointmentModel[] = [];
  // Propiedad para el ion-datetime (modelo de la fecha)
  public dateModel: string | undefined;

  constructor(
    private afs: FirestoreService,
    private r: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) { }

  async ngOnInit() {
    this.isLoading = true;

    // 1. Obtener el Perfil del Usuario (solo una vez)
    // Usamos take(1) para garantizar que esta lógica se ejecute solo al iniciar.
    const profileSubscription = this.authService.firebaseUser$.pipe(
      // switchMap para obtener el UID
      switchMap(firebaseUser => {
        if (!firebaseUser) {
          // Si no hay usuario de Auth (aunque el Guard lo impediría, es seguro)
          return of(null);
        }
        // Usar el Observable del servicio para el perfil de Firestore
        return this.afs.getUserByIdObservable(firebaseUser.uid);
      }),
      take(1) // Solo necesitamos el primer valor de Auth+Perfil para configurar el filtro inicial
    ).subscribe(user => {
      // Asignar propiedades del componente manualmente
      this.userRole = user || null ;
      this.currentUserName = user?.name || user?.barberName || 'Usuario Invitado';

      console.log(`Citas cargando para Rol: ${this.userRole?.role}, Nombre: ${this.currentUserName}, Correo: ${this.userRole?.email}`);

      // 🔑 2. INICIAR LA CARGA DE CITAS EN TIEMPO REAL y Filtrado por Rol
      this.loadLiveAppointments(this.userRole, this.currentUserName);

      this.isLoading = false;

    }, error => {
      console.error('Error cargando perfil:', error);
      this.isLoading = false;
    });

    this.subscriptions.add(profileSubscription);
  }

  // Método dedicado a manejar la carga de citas en tiempo real y la reactividad
  private loadLiveAppointments(role: User | null, userName: string): void {

    // Obtener la fuente de citas en tiempo real (ya filtradas por rol/nombre en el servicio)
    const liveAppointments$ = this.afs.getAppointmentsByRoleLive(role!, userName);
    
    // Suscribirse a la fuente de Citas
    const liveSub = liveAppointments$.subscribe(appointments => {
      // Cada vez que Firestore cambia, se actualiza este array en memoria
      this.allAppointments = appointments;
      console.log("fuente de citas: ", this.allAppointments);
      // Si es Super Admin, debemos cargar la lista de todos los barberos para los filtros
      if (role?.role === 'super_admin') {
        const uniqueBarbers = [...new Set(appointments.map(a => a.barber))];
        this.allBarbers = uniqueBarbers;
        // Si no hay filtros seleccionados, selecciona a todos por defecto
        if (this.selectedBarbersSubject.value.length === 0) {
          this.selectedBarbersSubject.next(uniqueBarbers);
        }
      } else {
        // Si no es Super Admin, solo ve su nombre como filtro
        this.allBarbers = [userName];
        console.log("allBarbers: ", this.allBarbers);
        if (this.selectedBarbersSubject.value.length === 0) {
          this.selectedBarbersSubject.next([userName]);
        }
      }

      // 🔑 DISPARAR EL FILTRADO: Emitimos un valor en el subject de búsqueda
      // para forzar la re-evaluación del combineLatest sin cambiar el término de búsqueda.
      this.searchInputSubject.next(this.searchInputSubject.value);
    });

    this.subscriptions.add(liveSub);

    // 3. Definir el Observable Final para la vista (Filtrado por Barbero/Búsqueda)
    // El combineLatest solo se dispara cuando el usuario cambia el filtro o cuando el subject de búsqueda emite.
    this.filteredAppointments$ = combineLatest([
      this.selectedBarbersSubject.asObservable(),
      this.searchInputSubject.asObservable(),
      this.selectedDateSubject.asObservable()
    ]).pipe(
      map(([selectedBarbers, searchTerm, selectedDate]) => {
        // 1. Todas las citas (super_admin)
        if(this.userRole?.role === 'super_admin'){
          this.filtered = this.allAppointments;
        }
        if(this.userRole?.role === 'admin'){
          this.filtered = this.allAppointments.filter(
          (appointment) => selectedBarbers.includes(appointment.barber)
        );
        }
        if(this.userRole?.role === 'client'){
          this.filtered = this.allAppointments.filter(
          (appointment) => selectedBarbers.includes(appointment.clientName)
        );

        }
        
        console.log("Filtrado username | barber too: ", this.filtered);
        // 2. Filtrado por Término de Búsqueda (Nombre de Cliente)
        if (searchTerm) {
          const lowerSearchTerm = searchTerm.toLowerCase();
          this.filtered = this.filtered.filter(
            (appointment) => appointment.clientName.toLowerCase().includes(lowerSearchTerm)
          );
        }

        // 3. Filtrado por Fecha Seleccionada
        if (selectedDate instanceof Date) {

          // Obtener el inicio y fin del día seleccionado
          const startOfDay = new Date(selectedDate);
          startOfDay.setHours(0, 0, 0, 0);

          const endOfDay = new Date(selectedDate);
          endOfDay.setHours(23, 59, 59, 999);

          this.filtered = this.filtered.filter(appointment => {
            // Asegurarse de que appointment.date es un objeto Date
            const appointmentDate = appointment.date instanceof Date ? appointment.date : new Date(appointment.date);

            // Comprobar si la cita cae dentro del rango de startOfDay y endOfDay
            return appointmentDate >= startOfDay && appointmentDate <= endOfDay;
          });
        }

        // Devolver las citas filtradas y ordenarlas por fecha ascendente
        return this.filtered.sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
          const dateB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
          return dateA - dateB;
        });
      })
    );
  }

  // --- MÉTODOS DE MANEJO DE FILTRO DE FECHA ---

  // Método para obtener la fecha de hoy en formato ISO (YYYY-MM-DD)
  getToday(): string {
    // Usamos el DatePipe de Angular para formatear la fecha a ISO
    return new Date().toISOString().split('T')[0];
  }


  // Limpia el filtro de fecha y cierra el modal
  async clearDateFilter(): Promise<void> {
    this.dateModel = undefined;
    this.dateFilterSubject.next(undefined);
    this.selectedDateSubject.next(null);
  }


  // Método para manejar el cambio de selección de barberos (llamado desde el HTML)
  onBarberFilterChange(event: any): void {
    // Asume que el evento trae un array de strings (valores seleccionados)
    const selected = event.detail.value;
    this.selectedBarbersSubject.next(selected);
  }

  // Método para manejar la búsqueda (llamado desde el HTML)
  onSearchChange(event: any): void {
    // ion-searchbar usa event.detail.value
    const searchTerm = event.detail.value;
    this.searchInputSubject.next(searchTerm);

  }

  // Método para manejar el cambio de fecha (llamado desde el HTML)

  onDateChange(event: any): void {
    const selectedValue = event.detail.value;

    if (selectedValue) {
      // Si hay un valor, lo convertimos a Date y lo emitimos
      const selectedDate = new Date(selectedValue);
      this.selectedDateSubject.next(selectedDate);
    } else {
      // Si se borra la selección (por el botón Limpiar), emitimos null para quitar el filtro
      this.selectedDateSubject.next(null);
    }
  }

  // >>> MÉTODOS DE ACCIÓN (EDITAR Y ELIMINAR) <<<

  /**
   * Navega a la ruta de edición de la cita.
   * @param id El ID del documento de la cita.
   */
  editAppointment(id: string) {
    console.log('Editando cita con ID:', id);
    // Redirecciona al formulario, pasando el ID como parámetro de ruta
    this.r.navigate(['/appointment/form', id]);
  }

  /**
   * Inicializa la confirmación de eliminación.
   * @param id El ID del documento de la cita a eliminar.
   */
  deleteAppointment(id: string) {
    // Establece el ID de la cita que requiere confirmación.
    this.confirmDeleteId = id;
  }

  /**
   * Cancela la eliminación.
   */
  cancelDelete() {
    this.confirmDeleteId = null;
  }

  /**
   * Confirma y ejecuta la eliminación en Firestore.
   */
  async confirmDelete() {
    if (!this.confirmDeleteId || this.isDeleting) {
      return;
    }

    this.isDeleting = true;
    try {
      // Llama al método de eliminación del servicio
      await this.afs.deleteAppointmentById(this.confirmDeleteId);
      console.log(`Cita ${this.confirmDeleteId} eliminada.`);
      // Opcional: mostrar un Toast de éxito
    } catch (error) {
      console.error('Fallo al eliminar la cita:', error);
      // Opcional: mostrar un Toast de error
    } finally {
      this.confirmDeleteId = null;
      this.isDeleting = false;
    }
  }

  


  // 4. Limpieza de Suscripciones (MANDATORIO)
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.selectedBarbersSubject.complete();
    this.searchInputSubject.complete();
    this.selectedDateSubject.complete();
  }
}
