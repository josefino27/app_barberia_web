import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, LoadingController } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
  ]
})
export class LoginPage implements OnInit {

  loginForm!: FormGroup;
  loginFormEmail!: FormGroup;
  isLoading: boolean = false;
  errorMessage: string | null = null;
  bId: string | null = null;
  isMagicLinkFlow: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private afAuth: AngularFireAuth,
    private r: Router,
    private route: ActivatedRoute,
    private activatedRoute: ActivatedRoute,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) {
    this.loginForm = this.fb.group({
      email: ['', Validators.required],
      password: ['', Validators.required]
    })
    this.loginFormEmail = this.fb.group({
      email: ['', Validators.required]
    })
  }

  ngOnInit() {
    // this.handleGoogleRedirectResult();
    this.bId = this.activatedRoute.snapshot.queryParamMap.get('bId');

    this.checkRouteForMagicLink();

    if (this.bId) {
      console.log(`Usuario invitado por barbero: ${this.bId}`);
    }
  }


  private async checkRouteForMagicLink() {
    if (await this.afAuth.isSignInWithEmailLink(this.r.url)) {
      this.isMagicLinkFlow = true;
      console.log('Magic Link detectado. Solicitando email para completar sesión vía Alert.');
      this.presentEmailPromptAlert();
      return;
    }
  }

  async onCompleteMagicLink(email: string) {
    const loading = await this.loadingController.create({
      message: 'Completando inicio de sesión...'
    });
    await loading.present();

    try {
      await this.authService.handleSignInLink(email);
    } catch (error: any) {
      console.error('Error al completar Magic Link:', error);
      console.log(
            'El enlace no es válido o ' +
            'ya fue usado. Vuelve a solicitar uno.'

        );
      this.r.navigateByUrl('/login', { replaceUrl: true }); // Limpiar URL
    } finally {
      await loading.dismiss();
    }
  }

  async presentEmailPromptAlert() {
    const alert = await this.alertController.create({
      header: 'Finalizar Inicio de Sesión',
      message: 'Para confirmar tu identidad y completar el acceso, por favor, ingresa el correo electrónico que utilizaste para el enlace.',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Tu correo electrónico',
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          handler: () => {
            console.log('Usuario canceló la verificación de email.');
            // Redirigir o limpiar la URL si cancela
            this.r.navigateByUrl('/login', { replaceUrl: true });
          },
        },
        {
          text: 'Acceder',
          handler: (data) => {
            if (data.email && data.email.includes('@')) {
              this.onCompleteMagicLink(data.email);
              return true;
            } else {
              this.presentEmailPromptAlert();
              return false;
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async register() {
    this.r.navigate(['/register'], { replaceUrl: true });
  }
  async forgotPassword() {
    this.r.navigate(['/forgot-password'], { replaceUrl: true });
  }

  // --- Lógica de Inicio de Sesión (Correo/Contraseña) ---
  async login() {
    if (this.loginForm.invalid) {
      this.errorMessage = 'Por favor, completa los campos correctamente.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email, password } = this.loginForm.value;

    try {
      // Llama al método signIn del AuthService
      await this.authService.signIn(email, password);
      // La redirección a /home se maneja dentro del AuthService al ser exitoso.
    } catch (error: any) {
      // Manejo de errores específicos de autenticación de Firebase
      this.errorMessage = 'Credenciales incorrectas o usuario no encontrado. Verifica tu correo y contraseña.';
      console.error('Error de autenticación:', error);
    } finally {
      this.isLoading = false;
    }
  }
  async loginEmail() {
    if (this.loginFormEmail.invalid) {
      this.errorMessage = 'Por favor, completa los campos correctamente.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email } = this.loginFormEmail.value;
    const loading = await this.loadingController.create({
      message: 'Enviando enlace de verificación...',
      spinner: 'dots'
    });
    await loading.present();
    try {
      const sentEmail = await this.authService.registerUserEmail(email);


      await this.showAlert(
        'Revisa tu Correo',
        `Hemos enviado un enlace de inicio de sesión mágico a <strong>${sentEmail}</strong>. ¡Haz clic para ingresar!`,
        ['Entendido']
      );
    } catch (error: any) {
      console.error('Error de autenticación:', error);
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  // --- Lógica de Inicio de Sesión con Google ---
  async signInWithGoogle() {
    this.isLoading = true;
    const loading = await this.loadingController.create({
      message: 'Ingresando...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // Llama al método de Google del AuthService
      await this.authService.signInWithGoogle(this.bId!);
      // await this.authService.signInWithGoogleRedirect();
      // La redirección también se maneja dentro del AuthService.
    } catch (error: any) {
      this.errorMessage = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
      console.error('Error de autenticación con Google:', error);
    } finally {
      await loading.dismiss();
      this.isLoading = false;
    }
  }
  // async signInWithGoogleIOS() {
  //   this.isLoading = true;
  //   const loading = await this.loadingController.create({
  //     message: 'Ingresando...',
  //     spinner: 'crescent'
  //   });
  //   await loading.present();

  //   try {
  //     // Llama al método de Google del AuthService
  //     await this.authService.signInWithGoogleRedirect();
  //     console.log('Google:');
  //     // La redirección también se maneja dentro del AuthService.
  //   } catch (error: any) {
  //     this.errorMessage = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
  //     console.error('Error de autenticación con Google:', error);
  //   } finally {
  //     await loading.dismiss();
  //     this.isLoading = false;
  //   }
  // }

  // async handleGoogleRedirectResult() {
  //   const auth = getAuth();
  //   console.log("aqui auth", auth);
  //   try {
  //     const result = await getRedirectResult(auth);
  //     console.log("aqui sin result", result);
  //     if (result) {
  //       console.log("aqui con result");
  //       // User successfully signed in
  //       const credential = GoogleAuthProvider.credentialFromResult(result);
  //       const token = credential!.accessToken; // Google Access Token
  //       const user = result.user; // Firebase User object
  //       console.log("Google sign-in successful:", user);
  //       // Navigate or update UI based on successful login
  //     }
  //   } catch (error) {
  //     console.error("Error handling redirect result:", error);
  //     // Handle errors (e.g., display error message to user)
  //   }
  // }

  // --- Helpers para la plantilla ---

  // Obtener el control para validación
  get controlEmail() {
    return this.loginForm.get('email');
  }

  get controlPassword() {
    return this.loginForm.get('password');
  }

  private async showAlert(header: string, message: string, buttons: string[]) {
    const alert = await this.alertController.create({ header, message, buttons });
    await alert.present();
  }

}
