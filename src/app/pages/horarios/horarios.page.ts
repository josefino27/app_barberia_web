import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { NavbarComponent } from 'src/app/components/navbar/navbar.component';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirestoreService } from 'src/app/services/firestore';
import { AuthService } from 'src/app/services/auth';
import { BarberScheduleModel } from 'src/app/interfaces/horarios';
import { User } from 'src/app/interfaces/user';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-schedules',
  templateUrl: './horarios.page.html',
  styleUrls: ['./horarios.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, NavbarComponent, ReactiveFormsModule]
})
export class HorariosPage implements OnInit {

  private firestoreService = inject(FirestoreService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  currentUser!: User | null;
  barberId: string | null = null;
  
  // Horario mensual completo cargado desde Firestore
  currentSchedule: BarberScheduleModel | null = null;

  allBarberSchedules: BarberScheduleModel[] = []; 

  // Propiedades reactivas del calendario
  selectedDate: string = new Date().toISOString(); // Fecha seleccionada en formato ISO
  scheduleForm!: FormGroup;
  isSaving: boolean = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  // Rango de horas para las listas desplegables (simulación)
  hours: string[] = Array.from({ length: 14 }, (_, i) => this.formatTime(i + 8)); // 08:00 a 21:00

  constructor(

  ) {
    // Inicializa el formulario con valores por defecto
    this.scheduleForm = this.fb.group({
      // Habilita/Deshabilita el trabajo en la fecha seleccionada
      isWorking: [true], 
      start: ['09:00', Validators.required],
      end: ['17:00', Validators.required],
      // Opcionales para la pausa
      hasBreak: [false],
      breakStart: ['13:00'],
      breakEnd: ['14:00'],
      id: [null]
    });
  }

  async ngOnInit() {
    // 1. Obtener el usuario actual
    this.currentUser = await firstValueFrom(this.authService.currentUser$);
    if (this.currentUser?.id && this.currentUser.role === 'admin') {
      this.barberId = this.currentUser.id;
      // 2. Suscribirse a los cambios del horario
      this.loadSchedule();
    } else {
      this.errorMessage = 'Debe ser un usuario autenticado para gestionar horarios.';
    }
  }
  
  // Genera horas de 08:00 a 21:00 en formato HH:00
  private formatTime(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

   /**
   * Carga los horarios de disponibilidad del barbero actual.
   * Modificado para usar async/await y consumir la Promise<T> del servicio.
   */
  public async loadSchedule(): Promise<void> {
    if (!this.currentUser?.id) {
      return;
    }
    
    //this.isLoadingSchedule = true;
    try {
      this.allBarberSchedules = await this.firestoreService.getBarberSchedule(this.currentUser?.id!,'');
      console.log(`Horarios cargados:`, this.allBarberSchedules);
    } catch (error) {
      console.error('Error al cargar los horarios del barbero:', error);
      // Limpia el horario en caso de error
      this.allBarberSchedules = [];
    } finally {
      //this.isLoadingSchedule = false;
    }
  }

  /**
   * Convierte un objeto Date ISO String a la clave 'YYYY-MM-DD'.
   */
  private formatDateKey(isoString: string): string {
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`; 
  }

  /**
   * Actualiza la fecha seleccionada por el usuario en el calendario.
   */
  onDateChange(event: any): void {
    const isoString = event.detail.value;
    if (isoString) {
      this.selectedDate = isoString;
      this.updateFormForSelectedDate();
    }
  }

  /**
   * Carga el horario para la 'selectedDate' en el formulario.
   */
  updateFormForSelectedDate(): void {
    if (!this.currentSchedule) return;

    const dateKey = this.formatDateKey(this.selectedDate);
    this.currentSchedule = this.allBarberSchedules.find(s => s.day === dateKey) || null;
    
    // Si hay un horario definido para este día (Override)
     if (this.currentSchedule) {
      // Si hay un horario definido, cargamos sus valores
      this.scheduleForm.patchValue({
        id: this.currentSchedule.id,
        isWorking: true,
        start: this.currentSchedule.startTime,
        end: this.currentSchedule.endTime,
        hasBreak: !!this.currentSchedule.breakStart, 
        breakStart: this.currentSchedule.breakStart || '13:00',
        breakEnd: this.currentSchedule.breakEnd || '14:00',
      });
    } else {
      // Si NO hay horario, limpiamos y establecemos valores por defecto
      this.scheduleForm.reset({
        id: null, // Aseguramos que el ID esté nulo para forzar la creación de un nuevo documento
        isWorking: false, 
        start: '09:00',
        end: '17:00',
        hasBreak: false,
        breakStart: '13:00',
        breakEnd: '14:00',
      });
    }
  }
  
  /**
   * Guarda el horario del día seleccionado en Firestore.
   */
  async saveSchedule(): Promise<void> {
    
     if (!this.scheduleForm.valid || !this.barberId || this.isSaving) return;
    
    this.isSaving = true;
    this.successMessage = null;
    this.errorMessage = null;

    const dateKey = this.formatDateKey(this.selectedDate);
    const formValue = this.scheduleForm.getRawValue();

    // Si el día está marcado como no trabajado, y existe un horario (tiene ID), lo eliminamos.
    if (!formValue.isWorking) {
        return this.clearSchedule(); 
    }
    
    // Si está trabajando, preparamos el objeto para guardar
    const scheduleToSave: BarberScheduleModel = {
        id: formValue.id, // Se usa para actualizar si ya existe
        barberId: this.barberId,
        day: dateKey,
        startTime: formValue.start,
        endTime: formValue.end,
    };

    if (formValue.hasBreak) {
        scheduleToSave.breakStart = formValue.breakStart;
        scheduleToSave.breakEnd = formValue.breakEnd;
    }

    try {
      // Pasamos el objeto scheduleToSave al servicio
      await this.firestoreService.setBarberSchedule(scheduleToSave);
      this.successMessage = `Horario guardado para el día ${dateKey}.`;
    } catch (error) {
      this.errorMessage = 'Error al guardar el horario. Inténtalo de nuevo.';
      console.error('Error saving schedule:', error);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Elimina el horario específico para la fecha seleccionada (lo marca como día libre).
   */
  async clearSchedule(): Promise<void> {
    if (!this.barberId || this.isSaving) return;

    // Solo podemos eliminar si hay un horario cargado y tiene un ID de documento
    if (this.currentSchedule?.id) {
        this.isSaving = true;
        this.successMessage = null;
        this.errorMessage = null;
        
        try {
            // Llamamos al nuevo método de eliminación por ID
            await this.firestoreService.deleteBarberSchedule(this.currentSchedule.id);
            this.successMessage = `Horario eliminado (día libre) para la fecha seleccionada.`;
            // Forzamos la actualización del formulario al estado "No trabajando"
            this.scheduleForm.get('isWorking')?.setValue(false);
            this.currentSchedule = null;
        } catch (error) {
            this.errorMessage = 'Error al eliminar el horario.';
            console.error('Error deleting schedule:', error);
        } finally {
            this.isSaving = false;
        }
    } else {
        // Si no existe un horario para ese día, simplemente reseteamos el formulario
        this.scheduleForm.reset({
            isWorking: false, 
            start: '09:00',
            end: '17:00',
            hasBreak: false,
            breakStart: '13:00',
            breakEnd: '14:00',
        });
        this.successMessage = `El día ya estaba marcado como libre.`;
    }
  }
}