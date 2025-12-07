import { AsyncPipe, CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EnvironmentInjector, inject, OnInit, runInInjectionContext, ViewChild } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, PopoverController } from '@ionic/angular';
import { map, Observable, take } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { AuthService } from 'src/app/services/auth';
import { FirestoreService } from 'src/app/services/firestore';
import { NavbarComponent } from "src/app/components/navbar/navbar.component";
@Component({
  selector: 'app-usuarios',
  templateUrl: './usuarios.page.html',
  styleUrls: ['./usuarios.page.scss'],
  imports: [
    IonicModule, AsyncPipe, CommonModule,
    NavbarComponent
],
  standalone: true
})
export class UsuariosPage implements OnInit {
  @ViewChild('popover') popover!: HTMLIonPopoverElement;

  isOpen = false;

  presentPopover(e: Event) {
    this.popover.event = e;
    this.isOpen = true;
  }

  user: User | null = null;
  currentUser: [] = [];

  users$!: Observable<User[]>

  private readonly injector = inject(EnvironmentInjector);
  private readonly authService = inject(AuthService);

  tittle = 'Usuarios';
  async goToForm() {
    this.r.navigate(['form'], { relativeTo: this.route });
  }
  async goToAppointment(id: User['id']) {
    this.popover.isOpen = false;
    this.r.navigate(['appointment'], { replaceUrl: true });
  }
  async goToSchedule(id: User['id']) {
    this.popover.isOpen = false;
    this.r.navigate(['horarios'], { replaceUrl: true });
  }
  async goToEdit(id: User['id']) {
    this.popover.isOpen = false;
    
    this.r.navigate([`form/${id}`], { relativeTo: this.route });
    //console.log('id enviado: ', id);
  }

  

  constructor(
    private firestore: FirestoreService,
    private r: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {

  }

  async ngOnInit() {
    runInInjectionContext(this.injector, async () => {
      this.users$ = this.firestore.getUsers();

      try {
        const userData = await this.authService.getCurrentUser(); 
        
        this.user = userData;

        //console.log("Usuario actual: ", this.user);
        if (this.user) {
            //console.log("Photo URL: ", this.user.photoUrl);
            //console.log("Email: ", this.user.email);
        }

    } catch (error) {
        console.error("Error al obtener el usuario actual:", error);
        this.user = null;
    }


      this.cdr.detectChanges();
      //console.log("usuarios: ",this.users$," currentUser: ");

    });
  }

  async logout(){

    this.isOpen = false;
    await this.authService.logout();

    this.r.navigate(['/login'], { replaceUrl: true });
    
  
  }

  
  
}



