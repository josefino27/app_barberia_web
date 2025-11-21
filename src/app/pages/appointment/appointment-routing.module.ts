import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AppointmentsPage } from './appointment.page';

const routes: Routes = [
  {
    path: '',
    component: AppointmentsPage
  },{
    path: 'form/:id',
    loadChildren: () => import('./form/form-routing.module').then( m => m.FormPageRoutingModule)
  },{
    path: 'form',
    loadChildren: () => import('./form/form-routing.module').then( m => m.FormPageRoutingModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppointmentPageRoutingModule {}
