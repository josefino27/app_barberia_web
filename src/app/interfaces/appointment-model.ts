export interface AppointmentModel {
  id?: string;
  service: string;
  barber: string;
  date: Date;
  clientName: string;
  clientPhone: string;
  status: 'agendada' | 'completada' | 'cancelada';
}