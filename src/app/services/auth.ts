import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';
import { catchError, firstValueFrom, map, Observable, of, shareReplay, switchMap, tap } from 'rxjs';
import { User } from '../interfaces/user'; // Tu interfaz de usuario
import { FirestoreService } from './firestore';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { LoadingController } from '@ionic/angular';
import { getAuth, GoogleAuthProvider, signInWithRedirect } from 'firebase/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  // Usuario de Firebase (solo la información de autenticación)
  public firebaseUser$ = this.afAuth.authState;
  isLoading: boolean = false;
  private usersCollectionName = 'users';
  private actionCodeSettings = {
    // URL a la que se redirigirá al usuario después de la confirmación
    // Asegúrate de que esta URL esté en la lista de dominios autorizados de Firebase
    url: 'http://localhost:8100/login', // <-- AJUSTA ESTA URL A TU DOMINIO REAL (ej. https://tudominio.com/login)
    handleCodeInApp: true, // Debe ser 'true' para aplicaciones Ionic/Angular
  };
  private injector = inject(Injector);

  public currentUser$: Observable<User | null> = this.firebaseUser$.pipe(

    switchMap(user => {
      if (user) {
        // 🔑 ERROR CORREGIDO: Usamos runInInjectionContext para envolver
        // la llamada a AngularFirestore.doc() y darle el contexto de inyección.
        return runInInjectionContext(this.injector, () => {
          return this.afst.doc<User>(`${this.usersCollectionName}/${user.uid}`).valueChanges().pipe(

            map(profile => {
              if (profile) {
                return { ...profile, uid: user.uid } as User;
              } else {
                console.warn(`Perfil de usuario no encontrado para UID: ${user.uid}`);
                return { uid: user.uid, role: 'client', name: 'Usuario sin Perfil', email: user.email || 'N/A' } as unknown as User;
              }
            }),
            catchError(error => {
              console.error('Error al obtener perfil de Firestore:', error);
              return of(null);
            })
          );
        });
      } else {
        // Usuario NO autenticado
        return of(null);
      }
    }),

    // Asegura que el resultado de la tubería sea compartido
    tap(user => console.log('Estado de usuario actualizado:', user?.role || 'Desconectado')),
    shareReplay({ bufferSize: 1, refCount: true }),
    catchError(error => {
      console.error('Error general en el flujo de autenticación:', error);
      return of(null);
    })
  );

  constructor(
    private afAuth: AngularFireAuth,
    private afs: FirestoreService,
    private afst: AngularFirestore,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private loadingController: LoadingController
  ) {
    this.handleSignInLink();
  }


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
      return null; // NO HAY USUARIO LOGUEADO
    }

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
  private async checkAndCreateUserProfile(user: firebase.User | null, bId: string | undefined): Promise<void> {
    if (!user) {
      return;
    }

    try {
      // 1. Intentar obtener el perfil de Firestore por su UID
      const firestoreUser = await this.afs.getUserById(user.uid);
      const barbers = await firstValueFrom(this.afs.barbersUserData$(bId));
      const selectedBarber = (await barbers).find(b => b.id === bId);
      if (firestoreUser) {
        // El perfil ya existe, no hacer nada.
        return;
      }

      // 2. Si el perfil NO existe, crearlo con un rol por defecto
      const newProfile: User = {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || '',
        photoUrl: user.photoURL || '',
        role: 'client',
        barberId: selectedBarber?.id || '',
        barberName: selectedBarber?.name || '',
        phone: undefined,
        isSubscribed: false
      };

      // Usa el método addUser del servicio de Firestore para guardar el documento
      await this.afs.setUsers(user.uid, newProfile);

      //await this.afs.setUsers(newProfile); // O el método que uses para añadir/actualizar


    } catch (error) {
      console.error('Error al verificar o crear el perfil de Firestore:', error);
    }
  }


  // --- MÉTODOS DE AUTENTICACIÓN ---

  /**
   * Inicia sesión con correo electrónico y contraseña.
   */
  async signIn(email: string, password: string): Promise<firebase.auth.UserCredential> {
    const result = await this.afAuth.signInWithEmailAndPassword(email, password);

    // await this.checkAndCreateUserProfile(result.user);

    // **Acción Requerida por el Guard:** Guarda el timestamp en el login.
    localStorage.setItem('lastLoginTime', Date.now().toString());

    // Redirige al dashboard o agenda después de que el usuario se autentica
    this.router.navigateByUrl('/usuarios', { replaceUrl: true });
    return result;
  }

  async registerUserEmail(email: string): Promise<string> {

    // Enviar el enlace de inicio de sesión al correo
    await this.afAuth.sendSignInLinkToEmail(email, this.actionCodeSettings);
    return email;
  }

  async handleSignInLink(email: string | null = null): Promise<void> {
    // 1. Verificar si la URL es un enlace de inicio de sesión por correo
    if (await this.afAuth.isSignInWithEmailLink(this.router.url)) {
      if (!email) {
        console.error('Email no encontrado para completar el inicio de sesión.');
        this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }

      // Mostrar loading
      const loading = await this.loadingController.create({
        message: 'Comprobando enlace de acceso...',
        spinner: 'crescent'
      });
      await loading.present();
      try {
        const result = await this.afAuth.signInWithEmailLink(email, this.router.url);

        if (result.user) {
          await this.checkAndCreateUserProfile(result.user, undefined);

          this.router.navigateByUrl('/appointment', { replaceUrl: true });
        }

      } catch (error: any) {
        console.log('Error al iniciar sesión con enlace de correo:', error);
        // Manejar errores de enlace inválido o expirado
        // Navegar al login
        this.router.navigateByUrl('/login', { replaceUrl: true });
        throw error;
      } finally {
        await loading.dismiss();
      }
    }
  }

  /**
   * Inicia sesión con Google.
   */
  async signInWithGoogle(bId: string | undefined): Promise<firebase.auth.UserCredential> {
    const provider = new firebase.auth.GoogleAuthProvider();
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Autenticando...',
      spinner: 'crescent'
    });
    const result = await this.afAuth.signInWithPopup(provider);
    // const resultR = await this.afAuth.signInWithRedirect(provider);
    // await this.afAuth.getRedirectResult();
    try {
      await this.checkAndCreateUserProfile(result.user, bId);

    } catch (error) {
      console.log('Error autenticando:', error);
    } finally {
      await loading.dismiss();
      this.isLoading = false;
    }
    this.router.navigateByUrl('/usuarios', { replaceUrl: true });

    return result;

  }

  async signInWithGoogleRedirect() {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    const providerr = new firebase.auth.GoogleAuthProvider();
    // Optional: Add scopes or custom parameters if needed
    // provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
    // provider.setCustomParameters({ 'login_hint': 'user@example.com' });

    // console.log("aqui signInWithGoogleRedirect");
    // console.log("aqui signInWithGoogleRedirect", auth);
    // console.log("aqui signInWithGoogleRedirect", provider);
    // console.log("aqui signInWithGoogleRedirect", providerr);
    try {
      const result = await this.afAuth.signInWithRedirect(providerr);
      await signInWithRedirect(auth, provider);
      console.log('autenticación con Google: ', auth, "provider: ", provider);
      console.log('signInWithRedirect: ', result);
    } catch (error) {
      console.log("Error during redirect sign-in:", error);
    }
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

  async forgotPassword(email: string): Promise<void> {

    try {
      await this.afAuth.sendPasswordResetEmail(email);
    } catch (error) {
      console.log('Error enviando enlace de recuperación de contraseña:', error);
    }

  }

  /**
     * Registra usuario y envia link de restablecimiento de contraseña.
     */
  async createAccountAndSendSetupLink(email: string, userData: any, bId: string): Promise<void> {
    //const TEMP_PASSWORD = 'Agendatucita123';
    const TEMP_PASSWORD = userData.password;

    try {
      // 1. Crear la cuenta en Firebase Authentication con la contraseña temporal
      // Esto verifica la unicidad del email y crea el registro de credenciales.
      const result = await this.afAuth.createUserWithEmailAndPassword(email, TEMP_PASSWORD);
      // Usamos firstValueFrom para obtener el primer valor que emita y cerrar la suscripción
      const barbers = await firstValueFrom(this.afs.barbersUserData$(bId));

      // 2. Buscamos el barbero específico en la lista (si el bId es el ID del documento)
      const selectedBarber = barbers.find(b => b.id === bId);
      const uid = result.user!.uid;
      console.log("email ", email);
      console.log("userData ", userData);
      console.log("barber ", selectedBarber);
      // 2. Crear el objeto de perfil en Firestore (usando el UID)
      const newUserProfile: User = {
        ...userData as User,
        id: uid,
        role: userData.role || 'client',
        barberId: selectedBarber?.id || '',
        barberName: selectedBarber?.name || ''
      };

      // 3. Guardar el perfil en Firestore
      await this.afs.setUsers(uid, newUserProfile);

      // 4. Forzar al usuario a definir su contraseña
      // await this.afAuth.sendPasswordResetEmail(email);

      this.router.navigate(['/usuarios']);

    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('El correo electrónico ya está registrado.');
      }
      console.log('Error durante la creación de cuenta administrativa:', error);
      throw error;
    }
  }

}