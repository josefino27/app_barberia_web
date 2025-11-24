// src/app/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';
import { firstValueFrom } from 'rxjs';
import { User } from '../interfaces/user'; // Tu interfaz de usuario
import { FirestoreService } from './firestore';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  // Usuario de Firebase (solo la información de autenticación)
  public firebaseUser$ = this.afAuth.authState;
 
  constructor(
    private afAuth: AngularFireAuth,
    private afs: FirestoreService,
    private router: Router
  ) { }

  // --- MÉTODOS DE ESTADO Y ACCESO ---

  /**
   * Verifica si el usuario está autenticado.
   */
  isLoggedIn(): boolean {
    return !!this.afAuth.currentUser;
  }

async getIdToken(): Promise<string | null> {
  // AngularFireAuth.currentUser is a Promise<firebase.User | null>
  const firebaseCurrentUser = await this.afAuth.currentUser;
  if (!firebaseCurrentUser) {
    return null; 
    console.log("NO HAY USUARIO LOGUEADO");
  }

  console.log('Current User:', firebaseCurrentUser);
  return firebaseCurrentUser.getIdToken();
}

  /**
   * Obtiene el usuario actual de Firebase y fusiona su perfil de Firestore.
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      // Usa el observable de estado de FirebaseAuth
      const firebaseUser = await firstValueFrom(this.firebaseUser$);

      if (!firebaseUser) {
        return null; // NO HAY USUARIO LOGUEADO
      }

      // Obtiene el documento de Firestore por el UID de Firebase
      const firestoreUser = await this.afs.getUserById(firebaseUser.uid);
      return firestoreUser;
    } catch (error) {
      return null;
    }
  }

  // Método auxiliar para garantizar la existencia del perfil en Firestore
  private async checkAndCreateUserProfile(user: firebase.User | null): Promise<void> {
    if (!user) {
      return;
    }

    try {
      // 1. Intentar obtener el perfil de Firestore por su UID
      const firestoreUser = await this.afs.getUserById(user.uid);

      if (firestoreUser) {
        // El perfil ya existe, no hacer nada.
        console.log('Perfil de Firestore ya existe para UID:', user.uid);
        return;
      }

      // 2. Si el perfil NO existe, crearlo con un rol por defecto
      const newProfile: User = {
        id: user.uid,
        email: user.email || 'Ingresar Correo Electronico',
        name: user.displayName || 'Ingresar Usuario',
        photoUrl: user.photoURL || '',
        role: 'client',
        barberName: '',
        phone: 'Ingresar Numero de Telefono',
        isSubscribed: false
      };

      // Usa el método addUser del servicio de Firestore para guardar el documento
      await this.afs.setUsers(user.uid, newProfile);
      
      //await this.afs.setUsers(newProfile); // O el método que uses para añadir/actualizar

      console.log('Perfil de Firestore creado automáticamente para UID:', user.email);

    } catch (error) {
      console.error('Error al verificar o crear el perfil de Firestore:', error);
      // Manejo de errores (ej. mostrar toast)
    }
  }


  // --- MÉTODOS DE AUTENTICACIÓN ---

  /**
   * Inicia sesión con correo electrónico y contraseña.
   */
  async signIn(email: string, password: string): Promise<firebase.auth.UserCredential> {
    const result = await this.afAuth.signInWithEmailAndPassword(email, password);

    await this.checkAndCreateUserProfile(result.user);

    // **Acción Requerida por el Guard:** Guarda el timestamp en el login.
      localStorage.setItem('lastLoginTime', Date.now().toString());

    // Redirige al dashboard o agenda después de que el usuario se autentica
    this.router.navigateByUrl('/appointment', { replaceUrl: true });
    return result;
  }

  /**
   * Inicia sesión con Google.
   */
  async signInWithGoogle(): Promise<firebase.auth.UserCredential> {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await this.afAuth.signInWithPopup(provider);

    await this.checkAndCreateUserProfile(result.user);
    console.log('Autenticación con Google exitosa. ');

    // --- Lógica de PRE-REGISTRO para Firestore (Creación de perfil) ---
    // 1. Verificar si el usuario ya tiene un perfil en Firestore

    const user = result.user;

        if (user) {
          console.log('Usuario de Google autenticado:', user);

            // --- Lógica de PRE-REGISTRO para Firestore (Creación de perfil) ---
            
            // 2. OBTENER EL UID
            const uid = user.uid; 
            
            // 3. DATOS INICIALES DEL PERFIL
            // const profileData: User = {
            //     id: uid, 
            //     email: user.email || 'Ingresar Correo Electronico',
            //     name: user.displayName || 'Ingresar Nombre de Usuario',
            //     photoUrl: user.photoURL || '',
            //     role: 'client',
            //     phone: user.phoneNumber || 'Ingresar Numero de Telefono',
            //     barberName: '',
            //     isSubscribed: false
                
            // };

            // 4. CREACIÓN DEL DOCUMENTO DE FIRESTORE USANDO EL UID COMO ID
            // Esto garantiza la coincidencia.
            // await this.afs.setUsers(uid, profileData); 

            // console.log('Usuario registrado y perfil creado con UID:', uid);
        }
    // --- Lógica de POST-REGISTRO para Firestore (Inicialización de datos) ---
    // Si es un nuevo usuario, asegúrate de crear su documento en la colección 'users'
    // if (result.additionalUserInfo?.isNewUser) {
    //   await this.afs.setUsers({
    //     id: result.user?.uid,
    //     email: result.user?.email || '',
    //     name: result.user?.displayName || 'Usuario' + Date.now(),
    //     role: 'client' // Rol por defecto para un nuevo registro
    //   } as User); // Usamos setUsers de FirestoreService
    // }

    //this.router.navigateByUrl('/appointment');
    this.router.navigateByUrl('/usuarios', {replaceUrl: true});
    console.log("result", result);
    return result;

  }

  /**
   * Cierra la sesión del usuario.
   */
  async logout(): Promise<void> {
    await this.afAuth.signOut();

    // Limpieza adicional, aunque el Guard lo hace si es necesario.
    localStorage.removeItem('lastLoginTime');

    // Redirige al login después de cerrar sesión
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /**
   * Registra usuario.
   */

  async registerUser(email: string, password: string) {
    // Esta función llama a Firebase Auth directamente
    return this.afAuth.createUserWithEmailAndPassword(email, password);
  }

  /**
     * Registra usuario y envia link de restablecimiento de contraseña.
     */
  async createAccountAndSendSetupLink(email: string, userData: any): Promise<void> {
    const TEMP_PASSWORD = 'TemporaryPassword123!'; // Contraseña temporal, debe ser segura

    try {
      // 1. Crear la cuenta en Firebase Authentication con la contraseña temporal
      // Esto verifica la unicidad del email y crea el registro de credenciales.
      const result = await this.afAuth.createUserWithEmailAndPassword(email, TEMP_PASSWORD);
      const uid = result.user!.uid;

      // 2. Crear el objeto de perfil en Firestore (usando el UID)
      const newUserProfile: User = {
        ...userData as User,
        id: uid,
        role: userData.role || 'client',
      };

      // 3. Guardar el perfil en Firestore
      await this.afs.setUsers(uid, newUserProfile);

      // 4. ***PASO CLAVE: Forzar al usuario a definir su contraseña***
      await this.afAuth.sendPasswordResetEmail(email);
      
      console.log(`Usuario creado (UID: ${uid}). Enlace de configuración enviado a ${email}.`);
      this.router.navigate(['/usuarios']);

    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('El correo electrónico ya está registrado.');
      }
      console.error('Error durante la creación de cuenta administrativa:', error);
      throw error;
    }
  }

}