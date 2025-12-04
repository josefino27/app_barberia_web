import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FirestoreService } from 'src/app/services/firestore'; 
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, map, Observable, combineLatest, of, tap, shareReplay, filter, take } from 'rxjs'; 
import { FormsModule } from '@angular/forms';
import { Barber } from 'src/app/interfaces/barber';
import { IonicModule, ModalController } from '@ionic/angular'; 
import { NavbarComponent } from 'src/app/components/navbar/navbar.component';
import { Timestamp } from '@firebase/firestore'; 
import { AuthService } from 'src/app/services/auth';
import { User } from 'src/app/interfaces/user';

// Tipo enriquecido
type EnrichedAppointment = AppointmentModel & { barberName: string; serviceName: string; price: number; time: string; };

@Component({
  selector: 'app-appointments',
  templateUrl: './appointment.page.html',
  styleUrls: ['./appointment.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    IonicModule,
    NavbarComponent
  ]
})
export class AppointmentsPage implements OnInit, OnDestroy {

  // Inyecciones de dependencias
  private afs = inject(FirestoreService);
  private router = inject(Router);
  modalController = inject(ModalController);
  private authService = inject(AuthService);

  // --- Estado de la Lista / Filtros ---
  public isLoading: boolean = true;
  public confirmDeleteId: string | null = null;
  public isDeleting: boolean = false;
  
  // ngModel properties (conectados al HTML)
  public searchTerm: string = '';
  public selectedBarberForSlots: string = 'all'; 
  public selectedDateValue: string | 'all' = 'all'; 

  // Sujetos de RxJS para manejar cambios reactivos (usados en combineLatest)
  private searchInputSubject = new BehaviorSubject<string>('');
  private selectedBarberSubject = new BehaviorSubject<string>('all'); 
  // Usa 'string | Date' como estado, donde 'all' es el string y Date el filtro seleccionado.
  private selectedDateSubject = new BehaviorSubject<'all' | Date>('all');
  
  // Lista de citas filtradas y enriquecidas
  public filteredAppointments$!: Observable<EnrichedAppointment[]>;
  
  // Datos de apoyo
  public barbers$!: Observable<Barber[]>;
  public services$!: Observable<any[]>; 
  public userRole: 'client' | 'admin' | 'super_admin' | string = 'client'; 
  public currentUser$: Observable<User | null> = this.authService.currentUser$;
  
  public fechaInicial: Date = new Date();

  constructor() {
    this.barbers$ = this.afs.barbers$.pipe(shareReplay(1));
    this.services$ = this.afs.services$.pipe(shareReplay(1));
  }

  ngOnInit() {
    // Conecta el ngModel del HTML a los Subjects reactivos
    this.searchInputSubject.next(this.searchInputSubject.value);
    this.selectedBarberSubject.next(this.selectedBarberForSlots);

    this.filteredAppointments$ = this.getFilteredAppointmentsStream();
  }

  ngOnDestroy() {
    // Limpieza de Subjects (Buena práctica aunque la app termina)
    this.searchInputSubject.complete();
    this.selectedBarberSubject.complete();
    this.selectedDateSubject.complete();
  }

  /**
   * Obtiene la lista de citas, aplica filtros de búsqueda, barbero y fecha, 
   * y enriquece la cita con el nombre del barbero y el servicio.
   */
  getFilteredAppointmentsStream(): Observable<EnrichedAppointment[]> {
    return combineLatest([
      this.afs.appointments$, 
      this.barbers$,
      this.services$,
      // 1. Emite el término de búsqueda transformado
      this.searchInputSubject.asObservable(),
      // 2. Emite el ID del barbero seleccionado
      this.selectedBarberSubject,
      // 3. Emite la fecha seleccionada (Date o 'all')
      this.selectedDateSubject, 
      this.authService.currentUser$.pipe(filter((user): user is User => !!user), take(1)) //  Obtener el usuario autenticado

    ]).pipe(
      tap(() => this.isLoading = true),
      map(([appointments, barbers, services, term, barberFilter, dateFilter, currentUser]) => {

        const userId = currentUser.id;
        const userRole = currentUser.role;
        let roleFilteredAppointments = appointments;
        if (userRole === 'client') {
            // Cliente: Solo sus propias citas
            roleFilteredAppointments = appointments.filter(app => app.clientId === userId);
        } else if (userRole === 'admin') {
            // Admin: Solo citas agendadas para él
            roleFilteredAppointments = appointments.filter(app => app.barberId === userId);
        }
        // Mapas para enriquecer la data
        const barberMap = new Map(barbers.map(b => [b.id, b.userId]));
        const serviceMap = new Map(services.map(s => [s.id, s]));

        const enrichedAppointments = roleFilteredAppointments.map(appointment => {
          const serviceData = serviceMap.get(appointment.service);
          
          // Convertir Timestamp a Date para obtener la hora local
          const appointmentDate = appointment.date instanceof Date 
                ? appointment.date 
                : (appointment.date as Timestamp).toDate();
          
          const timeString = appointmentDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

          return {
            ...appointment,
            barberName: barberMap.get(appointment.barber) || 'Barbero Desconocido',
            serviceName: serviceData?.name || 'Servicio Desconocido',
            price: serviceData?.price || 0,
            time: timeString,
            date: appointmentDate 
          } as EnrichedAppointment;
        });
        
        console.log("enrichedAppointments", enrichedAppointments);
        
        const filteredAppointments = enrichedAppointments.filter(appointment => {
          
          // 1. Filtro por Barbero
          const barberMatch = (barberFilter === 'all' || appointment.barber === barberFilter);
          
          // 2. Filtrado por Término de Búsqueda (Nombre de Cliente)
          const lowerSearchTerm = term.toLowerCase();
          const searchMatch =  appointment.clientName.toLowerCase().includes(lowerSearchTerm)

          // 3. Filtrado por Fecha Seleccionada
          let dateMatch = true;
          
          // AHORA dateFilter ES 'all' o un objeto Date, lo que soluciona el error de tipado.
          if (dateFilter !== 'all') { 
            const selectedDate = dateFilter; // Ya es Date
            
            // Obtener el inicio y fin del día seleccionado
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            
            const appointmentDate = appointment.date as Date;

            // Comprobar si la cita cae dentro del rango
            dateMatch = appointmentDate >= startOfDay && appointmentDate <= endOfDay;
          }
          
          return barberMatch && searchMatch && dateMatch;
        });
        
        // Ordenar las citas filtradas por fecha en orden ascendente
        filteredAppointments.sort((a, b) => {
            // getTime() devuelve el valor numérico de la fecha (milisegundos desde 1970)
            // Esto permite una comparación sencilla y precisa.
            return (a.date as Date).getTime() - (b.date as Date).getTime();
        });

        return filteredAppointments;
      }),
      tap(() => this.isLoading = false),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // --- Manejo de Eventos de Filtro ---

  // Este método maneja el evento de ion-searchbar
  onSearchChange(event: any): void {
    const searchTerm = event.detail.value;
    // La propiedad searchTerm se actualiza via ngModel, pero el Subject lo propaga
    this.searchInputSubject.next(searchTerm);
  }
  

  // Este método maneja el evento de selección de barbero
  onBarberChange(event: any): void {
    this.selectedBarberForSlots = event.detail.value;
    this.selectedBarberSubject.next(event.detail.value); 
  }

  // Este método maneja el evento de ion-datetime
  onDateChange(event: any): void {
    const value = event.detail.value;
    
    if (value === 'all' || value === null || value === undefined) {
      this.selectedDateSubject.next('all');
      this.selectedDateValue = 'all'; 
    } else {
      // El valor es una string ISO de la fecha seleccionada
      const dateObject = new Date(value);
      this.selectedDateSubject.next(dateObject);
      this.selectedDateValue = dateObject.toISOString(); 
    }
  }

  clearDateFilter(): void {
    this.selectedDateSubject.next('all');
    this.selectedDateValue = 'all';
    // Dismiss el modal de fecha si está abierto, si tienes el ID:
    // this.modalController.dismiss(null, 'cancel', 'datetime-modal-id'); 
  }

  // --- MÉTODOS DE CITA ---

  getStatusColor(status: string): string {
    switch (status) {
      case 'Pendiente':
        return 'primary';
      case 'Completada':
        return 'success';
      case 'Cancelada':
        return 'danger';
      default:
        return 'medium';
    }
  }

  editAppointment(id: string) {
    console.log('Editando cita con ID:', id);
    this.router.navigate(['/appointment/form', id]); 
  }

  deleteAppointment(id: string) {
    this.confirmDeleteId = id; 
  }

  cancelDelete() {
    this.confirmDeleteId = null;
  }

  async confirmDelete() {
    if (!this.confirmDeleteId || this.isDeleting) {
      return;
    }

    this.isDeleting = true;
    try {
      await this.afs.deleteAppointmentById(this.confirmDeleteId);
      console.log(`Cita ${this.confirmDeleteId} eliminada.`);
    } catch (error) {
      console.error('Fallo al eliminar la cita:', error);
    } finally {
      this.confirmDeleteId = null;
      this.isDeleting = false;
    }
  }
}