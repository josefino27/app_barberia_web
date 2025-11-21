import { Pipe, PipeTransform } from '@angular/core';
import { AppointmentModel } from '../interfaces/appointment-model';

@Pipe({
  name: 'appointmentFilter'
})
export class AppointmentFilterPipe implements PipeTransform {

  transform(
    appointments: AppointmentModel[] | null,
    selectedBarbers: string[] | null,
    searchTerm: string | null
  ): AppointmentModel[] {
    if (!appointments) {
      return [];
    }

    // --- MANEJO DE VALORES INICIALES Y NULOS ---
    
    // Si la lista principal es nula (el async pipe aún está esperando), retorna vacío.
    if (!appointments) {
      return [];
    }
    
    // Asignar valores seguros (por defecto) a los filtros nulos
    const activeBarbers = selectedBarbers || [];
    const term = (searchTerm || '').toLowerCase();
    
    // Si no hay filtros activos (o no es admin), retorna el array original
    if (activeBarbers.length === 0 && term === '') {
      return appointments;
    }

    // --- LÓGICA DE FILTRADO ---
    let filteredList = appointments;
    
    // 1. Filtrar por Barbero
    if (activeBarbers.length > 0) {
      filteredList = filteredList.filter(app => activeBarbers.includes(app.barber));
    }

    // 2. Filtrar por Término de búsqueda
    if (term) {
      filteredList = filteredList.filter(app => app.clientName.toLowerCase().includes(term) || app.clientPhone.includes(term));
    }
    
    return filteredList;
  }
}