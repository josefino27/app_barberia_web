import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { User } from 'firebase/auth';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/services/auth';
import { FirestoreService } from 'src/app/services/firestore';

export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  // Solo validar si ambos controles existen y tienen valores (para evitar errores en la inicialización)
  if (!password || !confirmPassword || password.value === '' || confirmPassword.value === '') {
    return null;
  }

  // Si no coinciden, devuelve el error 'passwordMismatch' al FormGroup
  return password.value === confirmPassword.value ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [
    IonicModule, CommonModule, AngularFirestoreModule,
    ReactiveFormsModule
  ],
  standalone: true
})
export class RegisterPage {


  userId: string | null = null;
  usersId$!: Observable<User[]>
  registerUserForm: FormGroup;
  newuser: User[] = [];
  isViewing: boolean = false;
  user: User | null = null;
  isAuthenticated: User | null = null;

  private readonly injector = inject(EnvironmentInjector);


  async goToAppointment() {
    this.router.navigate(['appointment'], { replaceUrl: true });
  }

  returnLogin() {
    this.router.navigate(['login'], { replaceUrl: true });
  }

  constructor(
    private afs: FirestoreService,
    private formBuilder: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {
    this.registerUserForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [null, [Validators.minLength(10), Validators.maxLength(10)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      isSubscribed: [false, Validators.required],
    }, {
      validators: passwordMatchValidator
    });
  }
  get f() { return this.registerUserForm.controls; }

  async onSubmit() {
    if (this.registerUserForm.invalid) {
      this.registerUserForm.markAllAsTouched();
      this.showToast('Por favor, completa correctamente todos los campos.', 'danger');
      return;
    }
    const loading = await this.loadingCtrl.create({ message: 'Registrando...' });
    await loading.present();

    const userData = this.registerUserForm.getRawValue();

    try {
      const result = await this.authService.createAccountAndSendSetupLink(userData.email, userData);
      this.showToast('¡Registro exitoso!', 'success');
      // this.router.navigate(['/login']);
    } catch (error) {
      await loading.dismiss();
       this.showToast('Error, no se puede registrar el usuario.', 'danger');
       console.log(error);
    } finally {
      await loading.dismiss();
    }
  }
  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 3000,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }

}
