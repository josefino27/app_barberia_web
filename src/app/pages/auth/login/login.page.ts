import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
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

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private r: Router,
    private route: ActivatedRoute,
  ) { }

  ngOnInit() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async register() {
    this.r.navigate(['usuarios/form'], { replaceUrl: true });
  }

  // --- Lógica de Inicio de Sesión (Correo/Contraseña) ---
  async login() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
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
    this.errorMessage = null;

    try {
      // Llama al método de Google del AuthService
      await this.authService.signInWithGoogle();
      // La redirección también se maneja dentro del AuthService.
    } catch (error: any) {
      this.errorMessage = 'No se pudo iniciar sesión con Google. Intenta de nuevo.';
      console.error('Error de autenticación con Google:', error);
    } finally {
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
