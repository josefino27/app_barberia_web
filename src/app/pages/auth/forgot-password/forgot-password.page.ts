import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  imports: [IonicModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ],
  standalone: true
})
export class ForgotPasswordPage implements OnInit {

  forgotPasswordForm: FormGroup;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private authService: AuthService,
    private alertController: AlertController
  ) { 
    this.forgotPasswordForm = this.fb.group({
      email:['',[Validators.required, Validators.email]]
    })
  }

  ngOnInit() {
  }

  returnLogin(){
    this.router.navigate(['login'], {replaceUrl: true});
  }

  async onSubmit() {
      if (this.forgotPasswordForm.valid) {
  
        const userData = await this.forgotPasswordForm.getRawValue();
        if (userData.email) {
          
          await this.authService.forgotPassword(userData.email);
          this.presentAlert();
          // this.router.navigate(['/login']);
        }
      }
    }
  
  async presentAlert() {
    const alert = await this.alertController.create({
      cssClass: 'alert-buttons',
      header: 'Solicitud de Restablecimiento de Contraseña',
      backdropDismiss: false,
      message: `Si tu correo electronico se encuentra registrado, recibiras un lnk de reestablecimiento de contraseña en tu bandeja de entrada, spam o correos no deseados.`,
      buttons: [{
          text: 'Confirmar',
          handler: () => {
            try {
              // Llama al método de eliminación del servicio
              this.forgotPasswordForm.patchValue({email: null});
              // this.router.navigate(['/login']);
              // Opcional: mostrar un Toast de éxito

            } catch (error) {
              console.error('Fallo al eliminar usuario:', error);
              // Opcional: mostrar un Toast de error

            }
          }
        }
      ]
    });
    await alert.present();
  }

}
