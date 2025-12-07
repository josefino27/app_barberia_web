import { Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import {
  Validators,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Observable } from 'rxjs';
import { AppointmentModel } from 'src/app/interfaces/appointment-model';
import { Barber } from 'src/app/interfaces/barber';
import { Service } from 'src/app/interfaces/service';
import { User } from 'src/app/interfaces/user';
import { AuthService } from 'src/app/services/auth';
import { FirestoreService } from 'src/app/services/firestore';

@Component({
  selector: 'app-form',
  templateUrl: './form.page.html',
  styleUrls: ['./form.page.scss'],
  imports: [IonicModule, ReactiveFormsModule, AngularFirestoreModule
  ],
  standalone: true

})
export class FormPage implements OnInit {

  userId: string | null = null;
  usersId$!: Observable<User[]>
  userForm: FormGroup;
  newuser: User[] = [];
  isViewing: boolean = false;
  user: User | null = null;
  isAuthenticated: User | null = null;

  constructor(
    private afs: FirestoreService,
    private formBuilder: FormBuilder,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private alertController: AlertController
  ) {

    this.userForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [null, [Validators.minLength(10), Validators.maxLength(10)]],
      role: ['', Validators.required],
      isSubscribed: [false, Validators.required],
    });

  }

  private readonly injector = inject(EnvironmentInjector);
  ngOnInit() {
    runInInjectionContext(this.injector, () => {
      this.userId = this.activatedRoute.snapshot.paramMap.get('id');
      //console.log("userId", this.userId);

      this.authService.getCurrentUser().then(fire => this.isAuthenticated = fire)


      if (this.userId) {
        this.isViewing = true;
        this.loadUserForm(this.userId);

      }
    });
  }

  async onSubmit() {
    if (this.userForm.valid) {

      const userData = this.userForm.getRawValue();
      if (this.userId) {
        const updatedUser: User = { id: this.userId, ...userData };
        await this.afs.updateUser(this.userId, userData);
        this.router.navigate(['/usuarios']);
      } else {

        // 1. Crear la cuenta en Firebase Authentication

        // const result = await this.authService.registerUser(userData.email, 'usuario123');

        const result = await this.authService.createAccountAndSendSetupLink(userData.email, userData);
        // const uid = result.user.uid;

        // // 2. Crear el objeto de perfil usando el UID generado
        // const newUserProfile: User = {
        //   ...userData,
        //   id: uid, // CLAVE: Usar el UID de Auth como ID del documento
        //   role: userData.role || 'client', // Asigna el rol desde el formulario
        // };

        // // 3. Guardar el perfil completo en Firestore
        // await this.afs.addUser(newUserProfile)
        //   .then(() => {
        //     console.log('Usuario creado con exito', newUserProfile);
        //     this.userForm.reset({ role: 'client', isSubscribed: false });
        //     this.router.navigate(['/usuarios']);
        //   })
        //   .catch((error) => {
        //     console.error('Error creando usuario:', error);
        //   });
      }
    }

  }





  async loadUserForm(id: string) {
    this.user = await this.afs.getUserById(id);

    if (this.user) {
      // Si el usuario existe, llena el formulario con sus datos
      this.userForm.patchValue(this.user);
    }
  }

  async deleteUser(id: string) {

    await this.afs.deleteUserById(id);
    await this.router.navigateByUrl('/', { skipLocationChange: true });
  }

  async presentAlertMultipleButtons(id: string) {
    const alert = await this.alertController.create({
      cssClass: 'alert-buttons',
      header: 'Eliminar Usuario',
      backdropDismiss: false,
      message: `¿Estas seguro que deseas eliminar esta usuario?`,
      buttons: [

        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'modal-button-cancel',
          handler: () => {
            //console.log('Cancelar');
          }
        }, {
          text: 'Confirmar',
          handler: () => {
            try {
              // Llama al método de eliminación del servicio
              this.deleteUser(id);
              this.router.navigate(['/usuarios']);
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