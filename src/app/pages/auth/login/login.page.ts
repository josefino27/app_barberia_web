import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, LoadingController } from '@ionic/angular';
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
  isLoading: boolean = false;
  errorMessage: string | null = null;
  bId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private r: Router,
    private route: ActivatedRoute,
    private activatedRoute: ActivatedRoute,
    private loadingController: LoadingController,
  ) { }

  ngOnInit() {
     this.bId = this.activatedRoute.snapshot.queryParamMap.get('bId');

    if (this.bId) {
        console.log(`Usuario invitado por barbero: ${this.bId}`);
    }
  }

  async register() {
    this.r.navigate(['usuarios/form'], { replaceUrl: true });
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
      // La redirección también se maneja dentro del AuthService.
    } catch (error: any) {
      this.errorMessage = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
      console.error('Error de autenticación con Google:', error);
    } finally {
      await loading.dismiss();
      this.isLoading = false;
    }
  }

  // --- Helpers para la plantilla ---

  // Obtener el control para validación
  get controlEmail() {
    return this.loginForm.get('email');
  }

  get controlPassword() {
    return this.loginForm.get('password');
  }

}
