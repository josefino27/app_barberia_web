import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonDatetime, IonDatetimeButton, IonicModule, IonModal } from '@ionic/angular';

import { FormPageRoutingModule } from './form-routing.module';

import { AppointmentFormPage } from './form.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FormPageRoutingModule,
    AppointmentFormPage,
  ],
})
export class FormPageModule {}
