import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { UsuariosPage } from './usuarios.page';
import { roleGuardGuard } from 'src/app/guards/role-guard-guard';
import { authGuard } from 'src/app/guards/auth-guard';

const routes: Routes = [
  {
    path: '',
    component: UsuariosPage,
    canActivate: [authGuard,roleGuardGuard],
        // definimos los roles requeridos
        data: {
          roles: ['super_admin'] // <-- requiredRoles será ['super_admin']
        }
  },
  {
    path: 'form',
    loadChildren: () => import('./form/form.module').then( m => m.FormPageModule),
    canActivate: [authGuard,roleGuardGuard],
        // definimos los roles requeridos
        data: {
          roles: ['super_admin'] // <-- requiredRoles será ['super_admin']
        }
  },
  {
    path: 'form/:id',
    loadChildren: () => import('./form/form.module').then( m => m.FormPageModule)
  },
    {
    path: 'appointment',
    loadChildren: () => import('../appointment/appointment.module').then( m => m.AppointmentPageModule)
  },

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsuariosPageRoutingModule {}
