import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth';

/**
 * Guard Funcional para proteger rutas.
 * Verifica si el usuario está autenticado usando AuthService.
 */

/**
 * Tiempo máximo que se permite que una sesión persista en IndexedDB sin verificar
 * la actividad, antes de forzar un signOut (en milisegundos).
 * * Actualmente configurado para 1 hora.
 * * EJEMPLOS:
 * - 30 minutos: 30 * 60 * 1000
 * - 24 horas (1 día): 24 * 60 * 60 * 1000
 */
const MAX_SESSION_TIME_MS = 5 * 60 * 1000;

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {

  // 1. Inyecta los servicios necesarios
  const authService = inject(AuthService);
  const router = inject(Router);
  const redirect = router.createUrlTree(['/login']);


  // 2. Observa el estado de autenticación de Firebase
  // Usamos un pipe para transformar el estado de autenticación en un booleano o una redirección.
  return authService.firebaseUser$.pipe(
    take(1), // Solo toma el primer valor y se desuscribe
    map(firebaseUser => {
      // Si firebaseUser existe (el usuario está logueado)
      if (firebaseUser && !firebaseUser.isAnonymous) {
        console.log('AuthGuard: Usuario autenticado. Acceso concedido.', firebaseUser);
        return true;
      }

      if (!firebaseUser) {

        // Si firebaseUser es null (el usuario no está logueado)
        console.log('AuthGuard: Usuario NO autenticado. Redirigiendo a login.');
        return redirect;

      }

      if (firebaseUser?.isAnonymous) {
        console.warn('Guard: Token anónimo detectado. Forzando cierre para limpiar persistencia.');
        authService.logout();
        return redirect;
      }

      // --- Lógica de Expiración Forzada para Usuarios Registrados ---
      const lastLoginTimeStr = localStorage.getItem('lastLoginTime');
      const currentTime = Date.now();

      if (lastLoginTimeStr) {
        const lastLoginTime = parseInt(lastLoginTimeStr, 10);
        const elapsed = currentTime - lastLoginTime;

        if (elapsed > MAX_SESSION_TIME_MS) {
          // Caso 2: Usuario registrado restaurado, pero ha pasado demasiado tiempo.
          // El token en IndexedDB es válido para Firebase, pero no para nuestra App.
          console.warn('Guard: Sesión registrada expirada por tiempo (' + (elapsed / 1000 / 60) + ' min). Limpiando IndexedDB...');

          // **ACCIÓN CLAVE:** Forzar el cierre de sesión para limpiar el token de IndexedDB
          authService.logout()
            .then(() => localStorage.removeItem('lastLoginTime'))
            .catch(error => console.error('Fallo al limpiar el token:', error));

          return redirect;
        } else {
          // Caso 3: Sesión registrada válida y dentro del tiempo.
          // Se actualiza la marca de tiempo para extender la sesión (mantenerla viva).
          localStorage.setItem('lastLoginTime', currentTime.toString());
          console.log('Guard: Acceso permitido. Sesión válida y renovada.');
          return true;
        }
      } else {
        // Caso 4: Usuario registrado restaurado, pero sin marca de tiempo (la marca se perdió o el login no la puso).
        // Por seguridad, forzamos la limpieza y el re-login.
        console.error('Guard: Usuario restaurado sin marca de tiempo de sesión. Forzando cierre por seguridad.');
        authService.logout();
        return redirect;
      }

    })
  );
};