import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-schedules',
  templateUrl: './horarios.page.html',
  styleUrls: ['./horarios.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class HorariosPage implements OnInit {

  days: { label: string, date: Date }[] = [];
  availableHours: string[] = [];
  selectedDate: Date | null = null;
  selectedHour: string | null = null;
  serviceDuration: number = 0; // Duración del servicio que viene de la página anterior.

  // Supongamos que esta es la disponibilidad del barbero, en un proyecto real,
  // esto vendría de tu FirestoreService.
  barberAvailability: string[] = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];

  constructor(private router: Router, private route: ActivatedRoute) { }

  ngOnInit() {
    this.generateNext7Days();
    // Obtiene la duración del servicio de los parámetros de la URL
    this.route.queryParams.subscribe(params => {
      this.serviceDuration = Number(params['duration']) || 0;
      console.log('Duración total del servicio:', this.serviceDuration);
    });
  }

  generateNext7Days() {
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      let label = '';
      if (i === 0) {
        label = 'Hoy';
      } else if (i === 1) {
        label = 'Mañana';
      } else {
        const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
        label = dayFormatter.format(date);
      }

      this.days.push({ label: label, date: date });
    }
  }

  selectDay(day: { label: string, date: Date }) {
    this.selectedDate = day.date;
    this.selectedHour = null; // Reinicia la hora seleccionada al cambiar de día.
    this.loadAvailableHours();
  }

  loadAvailableHours() {
    // Lógica para filtrar las horas disponibles en base a la duración del servicio.
    const filteredHours = this.barberAvailability.filter(hour => {
      // 1. Convertir la hora a un formato numérico para calcular.
      const [h, m] = hour.split(':').map(Number);
      const startTimeInMinutes = h * 60 + m;
      const endTimeInMinutes = startTimeInMinutes + this.serviceDuration;

    // Agrega esta verificación para asegurarte de que selectedDate no es null
    if (this.selectedDate) {
    
      // 2. Simular un check de conflicto con citas existentes.
      // En un proyecto real, aquí harías una llamada a tu FirestoreService.
      const hasConflict = this.checkIfConflicting(this.selectedDate, startTimeInMinutes, endTimeInMinutes);
// 3. Devolver 'true' si la hora está disponible y no tiene conflictos.
      return !hasConflict;
    } else {
      // Opcional: Manejar el caso de que la fecha sea null (aunque no debería pasar en este flujo)
      console.error('Error: No se ha seleccionado una fecha.');
      return;
    }
      
    });

    this.availableHours = filteredHours;
  }
  
  // Este es un método simulado. En el mundo real, esta lógica sería más robusta.
  private checkIfConflicting(date: Date, startTime: number, endTime: number): boolean {
    // Lógica para verificar si la nueva cita se superpone con una ya existente.
    // Aquí se consultaría a la base de datos de Firestore.
    // Por ahora, siempre retorna 'false' para que todas las horas se muestren.
    return false;
  }

  selectHour(hour: string) {
    this.selectedHour = hour;
    
    // Agrega esta verificación para asegurarte de que selectedDate no es null
    if (this.selectedDate) {
      // Si la fecha existe, continúa con la navegación
      const appointmentDate = new Date(this.selectedDate.toISOString().split('T')[0] + 'T' + hour + ':00');
      
      console.log(`Hora seleccionada: ${hour}. Navegando a la página de confirmación con la fecha y duración.`);
      // this.router.navigate(['/confirm-appointment'], { queryParams: { date: appointmentDate.toISOString(), duration: this.serviceDuration } });
    } else {
      // Opcional: Manejar el caso de que la fecha sea null (aunque no debería pasar en este flujo)
      console.error('Error: No se ha seleccionado una fecha.');
    }
    // Aquí navegarías a la página de confirmación, enviando los datos clave
    console.log(`Hora seleccionada: ${hour}. Navegando a la página de confirmación con la fecha y duración.`);
    // this.router.navigate(['/confirm-appointment'], { queryParams: { date: appointmentDate.toISOString(), duration: this.serviceDuration } });
  }
}