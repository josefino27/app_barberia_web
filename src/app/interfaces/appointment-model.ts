export interface AppointmentModel {
  id?: string; // ID del documento
  clientId: string; // Nuevo: UID del cliente
  clientName: string; // Mantenemos el nombre para visualización
  clientEmail: string; // Mantenemos el email para visualización (o lo eliminamos si solo usamos ID)
  clientPhone?: number;
  barberId: string; // Nuevo: UID del barbero
  barber: string; // Mantenemos el nombre del barbero para visualización
  service: string;
  date: Date;
  status: 'agendada' | 'completada' | 'cancelada';
}
