import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth';
import { inject } from '@angular/core';
import { User } from 'src/app/interfaces/user';

export const roleGuardGuard: CanActivateFn = (route, state): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const redirect = router.createUrlTree(['/login']);

  // 1. Obtener los roles requeridos de la configuración de la ruta (app.routes.ts)
  const requiredRoles = route.data['roles'] as string[];

  // 2. Llama al método asíncrono y maneja la Promesa
  return authService.getCurrentUser().then((user: User | null) => {

    // 3. Verificar si hay un usuario autenticado
    if (!user || !user.role) {
      console.warn('Acceso denegado. Usuario no autenticado.');
      // Redirigir al login si no hay usuario
      return router.createUrlTree(['/appointment']);
    }

    const userRole = user.role.toLowerCase();

    // 4. Verificar si el rol del usuario está en la lista de roles requeridos
    if (requiredRoles.map(r => r.toLowerCase()).includes(userRole)) {
      // Rol permitido: Permitir acceso
      return true;
    } else {
      // Rol no permitido: Redirigir a la página de citas
      console.warn(`Acceso denegado. Rol: ${user.role}. Redirigiendo a citas.`);
      return router.createUrlTree(['/appointment']);
    }
  }).catch(error => {
    // 5. Manejar error en la obtención del usuario (ej. fallo de red o Firebase)
    console.error('Error al obtener el usuario en RoleGuard:', error);
    // Redirigir a login en caso de error
    return router.createUrlTree(['/login']);
  });
};
