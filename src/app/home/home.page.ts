import { Component, OnInit  } from '@angular/core';
import { FirestoreService } from '../services/firestore';
import { User } from '../interfaces/user';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,})
export class HomePage implements OnInit {

  tittle = this.firestore.getCollectionName();
  users: User[] = [];
  
  constructor(private firestore: FirestoreService) {
    
  }

  ngOnInit(){

    this.firestore.getUsers().subscribe(res => {
        this.users.push(...res);
        console.log('Usuarios obtenidos:', this.users);
      });
        
    }

}


