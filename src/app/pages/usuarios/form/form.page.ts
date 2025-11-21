import { Component, EnvironmentInjector, inject, OnInit, runInInjectionContext } from '@angular/core';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import {
  Validators,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
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

  constructor(
    private afs: FirestoreService,
    private formBuilder: FormBuilder,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {

    this.userForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.minLength(10)]],
      role: ['', Validators.required],
      isSubscribed: [false, Validators.required],
    });

  }

  private readonly injector = inject(EnvironmentInjector);
  ngOnInit() {
    runInInjectionContext(this.injector, () => {
      this.userId = this.activatedRoute.snapshot.paramMap.get('id');
      console.log("userId", this.userId);

      if (this.userId) {
        this.isViewing = true;
        console.log('ID recibido:', this.userId);
        this.loadUserForm(this.userId);
        
      }
    });
  }

  async onSubmit() {
    if (this.userForm.valid) {

      const userData = this.userForm.getRawValue();
      console.log("userdata", this.userId);
      if (this.userId) {
        const updatedUser: User = { id: this.userId, ...userData };
        console.log('updatedUser-antes', updatedUser);
        await this.afs.updateUser(this.userId, userData);
        console.log('Usuario actualizado:', updatedUser);
        this.router.navigate(['/usuarios']);
      } else {
        console.log('else', userData);

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
    console.log('id-loaduserform', id);
    this.user = await this.afs.getUserById(id);
    console.log('id-user', this.user);

    if (this.user) {
      // Si el usuario existe, llena el formulario con sus datos
      this.userForm.patchValue(this.user);
      console.log('loaduserform', this.user);
    } else {
      console.log('no hay loaduserform', this.user);
    }
  }

  async deleteUser() {
    const user = await this.afs.deleteUserById(this.userId);
    this.router.navigate(['/usuarios']);
  }



}