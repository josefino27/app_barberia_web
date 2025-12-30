import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular'; // Importamos AlertController
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirestoreService } from 'src/app/services/firestore';
import { AuthService } from 'src/app/services/auth';
import { BarberScheduleModel } from 'src/app/interfaces/horarios';
import { User } from 'src/app/interfaces/user';
import { firstValueFrom } from 'rxjs';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { provideNativeDateAdapter } from '@angular/material/core';
import { NavbarComponent } from 'src/app/components/navbar/navbar.component';

@Component({
  selector: 'app-schedules',
  templateUrl: './horarios.page.html',
  styleUrls: ['./horarios.page.scss'],
  providers: [provideNativeDateAdapter()],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatTimepickerModule,
    NavbarComponent
  ]
})
export class HorariosPage implements OnInit {
  private firestoreService = inject(FirestoreService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private alertController = inject(AlertController); // Inyectamos el controlador de alertas

  currentUser!: User | null;
  allBarberSchedules: BarberScheduleModel[] = [];
  currentSchedule: BarberScheduleModel | null = null;

  weekDays = [
    { id: '0', name: 'Domingo' }, { id: '1', name: 'Lunes' },
    { id: '2', name: 'Martes' }, { id: '3', name: 'Miércoles' },
    { id: '4', name: 'Jueves' }, { id: '5', name: 'Viernes' },
    { id: '6', name: 'Sábado' }
  ];
  
  selectedDayIndex: string = new Date().getDay().toString();
  scheduleForm!: FormGroup;
  timeForm!: FormGroup;
  hours: string[] = Array.from({ length: 24 }, (_, i) => `${String(i + 0).padStart(2, '0')}:00`);

  isSaving = false;

  constructor() {
    this.initForms();
  }

  private initForms() {
    this.scheduleForm = this.fb.group({
      isWorking: [true],
      start: ['09:00', Validators.required],
      end: ['17:00', Validators.required],
      hasBreak: [false],
      breakStart: ['13:00'],
      breakEnd: ['14:00'],
      id: [null]
    });

    this.timeForm = this.fb.group({
      startTime: [""],
      endTime: [""],
    });
  }

  async ngOnInit() {
    this.currentUser = await firstValueFrom(this.authService.currentUser$);
    if (this.currentUser?.id) {
      // 1. Cargamos todos los horarios guardados
      await this.loadSchedule();
      
      // 2. Sincronizamos el formulario con el día actual seleccionado
      this.updateFormForSelectedDay();
      
      // 3. Cargamos horario por defecto del perfil
      this.timeForm.patchValue({
        startTime: this.convertMinutesToDate(this.currentUser.startTimePred || 480),
        endTime: this.convertMinutesToDate(this.currentUser.endTimePred || 1020)
      });
    }
  }

  // Carga inicial y refresco de datos
  async loadSchedule() {
    if (!this.currentUser?.id) return;
    try {
      this.allBarberSchedules = await this.firestoreService.getBarberSchedule(this.currentUser.id, "");
    // console.log("this.allBarberSchedules",this.allBarberSchedules);
    // console.log("this.current.id",this.currentUser.id);
    } catch (error) {
      console.error("Error cargando horarios:", error);
    }
  }

  onDaySelect(event: any) {
    this.selectedDayIndex = event.detail.value;
    // console.log("this.selectedDayIndex",this.selectedDayIndex);
    this.updateFormForSelectedDay();
  }

  // BUSCA SI EL DÍA YA EXISTE EN LA DB Y CARGA LOS DATOS
  updateFormForSelectedDay() {
    this.currentSchedule = this.allBarberSchedules.find(s =>
      s.day === this.selectedDayIndex
      
) || null;
    // console.log("this.allBarberSchedules",this.allBarberSchedules);
    // console.log("this.selectedDayIndex",this.selectedDayIndex);
    // console.log("this.currentSchedule",this.currentSchedule);
    if (this.currentSchedule) {
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
      // Si no existe, reseteamos el formulario a valores base
      this.scheduleForm.reset({
        isWorking: false,
        start: '09:00',
        end: '17:00',
        hasBreak: false,
        breakStart: '13:00',
        breakEnd: '14:00'
      });
    }
  }

  async saveSchedule() {
    if (this.scheduleForm.invalid || !this.currentUser?.id) return;
    this.isSaving = true;

    const formValue = this.scheduleForm.getRawValue();
    
    // Si el usuario marca que NO trabaja, eliminamos la entrada para que cuente como libre
    if (!formValue.isWorking) {
      await this.clearSchedule();
      return;
    }

    const scheduleToSave: BarberScheduleModel = {
      id: formValue.id || `${this.currentUser.id}_day_${this.selectedDayIndex}`,
      barberId: this.currentUser.id,
      day: this.selectedDayIndex,
      startTime: formValue.start,
      endTime: formValue.end,
      breakStart: formValue.hasBreak ? formValue.breakStart : null,
      breakEnd: formValue.hasBreak ? formValue.breakEnd : null
    };

    try {
      await this.firestoreService.setBarberSchedule(scheduleToSave);
      await this.loadSchedule(); // Refrescamos lista local
      this.updateFormForSelectedDay(); // Aseguramos que el ID se cargue en el form
      this.presentAlert('Éxito', `Horario de los ${this.weekDays[+this.selectedDayIndex].name} actualizado.`);
    } catch (e) {
      this.presentAlert('Error', 'No se pudo guardar el horario.');
    } finally {
      this.isSaving = false;
    }
  }

  async clearSchedule() {
    const id = this.scheduleForm.get('id')?.value;
    try {
      if (id) {
        await this.firestoreService.deleteBarberSchedule(id);
        await this.loadSchedule();
      }
      this.updateFormForSelectedDay();
      this.presentAlert('Día Libre', 'Se ha configurado como día no laborable.');
    } catch (e) {
      this.presentAlert('Error', 'No se pudo eliminar el horario.');
    } finally {
      this.isSaving = false;
    }
  }

  // ALERTA DE IONIC
  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
      mode: 'ios'
    });
    await alert.present();
  }

  // Mantener tu lógica de perfil intacta
  async onDateTime() {
    let start: Date = this.timeForm.get("startTime")!.value;
    let end: Date = this.timeForm.get("endTime")!.value;
    try {
      await this.firestoreService.updateUser(this.currentUser!.id, {
        startTimePred: start.getHours() * 60 + start.getMinutes(),
        endTimePred: end.getHours() * 60 + end.getMinutes()
      });
      this.presentAlert('Horario Actualizado', 'El horario base se ha guardado correctamente.');
    } catch (e) {
      this.presentAlert('Error', 'No se pudo actualizar el horario.');
    }
  }

  private convertMinutesToDate(min: number): Date {
    let date = new Date();
    date.setHours(Math.floor(min / 60), min % 60, 0, 0);
    return date;
  }
}