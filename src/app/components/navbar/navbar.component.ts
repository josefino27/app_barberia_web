import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { map, Observable } from 'rxjs';
import { User } from 'src/app/interfaces/user';
import { AuthService } from 'src/app/services/auth';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,],
})
export class NavbarComponent  implements OnInit {

  @ViewChild('popover') popover!: HTMLIonPopoverElement;

  user = false;
  isAuthenticated: User | null = null;
  isOpen = false;

  presentPopover(e: Event) {
    this.popover.event = e;
    this.isOpen = true;
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
    
    this.r.navigate([`usuarios/form/${id}`], { replaceUrl: true });
    //console.log('id enviado: ', id);
  }

  constructor(
    private userAuth: AuthService,
    private route: ActivatedRoute,
    private r: Router,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {

    this.userAuth.getCurrentUser().then(fire=>this.isAuthenticated = fire)
    
    if(this.isAuthenticated){
      
      //console.log("isAuthenticated: ", this.isAuthenticated);
    }
    
    //console.log("NotisAuthenticated: ", this.isAuthenticated);
    this.cdr.detectChanges();

  }

  async logout(){

    this.isOpen = false;
    await this.userAuth.logout();

    this.r.navigate(['/login'], { replaceUrl: true });
    
  
  }

}
