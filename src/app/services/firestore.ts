import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection, QueryDocumentSnapshot } from '@angular/fire/compat/firestore';
import { BehaviorSubject, firstValueFrom, from, Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { User } from '../interfaces/user';
import { AppointmentModel } from '../interfaces/appointment-model';
import { Barber } from '../interfaces/barber';
import { Service } from '../interfaces/service';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AuthService } from './auth';
import { BarberScheduleModel } from '../interfaces/horarios';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {

  // Colecciones de Firestore
  private usersCollection: AngularFirestoreCollection<User>;
  private appointmentsCollection: AngularFirestoreCollection<AppointmentModel>;
  private barbersCollection: AngularFirestoreCollection<Barber>;
  private servicesCollection: AngularFirestoreCollection<Service>;
  private schedulesCollection: AngularFirestoreCollection<BarberScheduleModel>;

  private dailySchedulesCollectionPath = 'schedules'

  // BehaviorSubjects para almacenar la data en memoria
  private _users = new BehaviorSubject<User[]>([]);
  private _appointments = new BehaviorSubject<AppointmentModel[]>([]);
  private _barbers = new BehaviorSubject<Barber[]>([]);
  private _services = new BehaviorSubject<Service[]>([]);

  // Observables públicos para que los componentes puedan suscribirse
  readonly users$ = this._users.asObservable();
  readonly appointments$ = this._appointments.asObservable();
  readonly barbers$ = this._barbers.asObservable();
  readonly services$ = this._services.asObservable();


  private injector = inject(EnvironmentInjector);
  constructor(

    private afs: AngularFirestore,
    private afa: AngularFireAuth

  ) {
    // Inicializa las conexiones a las colecciones
    this.usersCollection = this.afs.collection<User>('users');
    this.appointmentsCollection = this.afs.collection<AppointmentModel>('appointments');
    this.barbersCollection = this.afs.collection<Barber>('barbers');
    this.servicesCollection = this.afs.collection<Service>('services');
    this.schedulesCollection = this.afs.collection<BarberScheduleModel>('schedules');

    // Carga inicial y suscripciones en el constructor
    this.loadUsers();
    this.loadAppointments();
    this.loadBarbers();
    this.loadServices();
  }

  // --- 1. getBarberSchedule (Obtener Horarios Diarios con lectura única) ---

  /**
   * Obtiene todos los horarios de disponibilidad (documentos) de un barbero.
   * Utiliza la sintaxis de 'firstValueFrom' para una lectura única de datos.
   * @param barberId El UID del barbero.
   * @returns Una Promesa que resuelve en un array de horarios.
   */
  async getBarberSchedule(barberId: string, day: string): Promise<BarberScheduleModel[]> {
    return runInInjectionContext(this.injector, async () => {
      try {
        // 1. Obtiene la referencia a la colección filtrada
        const schedulesCollection = this.afs.collection<BarberScheduleModel>(
          this.dailySchedulesCollectionPath,
          // Agrega el filtro WHERE
          ref => ref.where('barberId', '==', barberId)
            .where('day', '==', day)
        );

        // 2. Ejecuta la consulta y espera el primer/único valor
        const snapshot = await firstValueFrom(schedulesCollection.get());

        // 3. Mapea los documentos, incluyendo el ID
        return snapshot.docs.map(doc => {
          const data = doc.data() as BarberScheduleModel;
          // Aquí puedes añadir la conversión de Timestamp si la propiedad 'day' lo fuera
          return { id: doc.id, ...data } as BarberScheduleModel;
        });

      } catch (error) {
        console.error("Error al obtener el horario del barbero:", error);
        throw error;
      }
    });
  }
  async getAllBarberSchedule(barberId: string): Promise<BarberScheduleModel[]> {
    return runInInjectionContext(this.injector, async () => {
      try {
        // 1. Obtiene la referencia a la colección filtrada
        const schedulesCollection = this.afs.collection<BarberScheduleModel>(
          this.dailySchedulesCollectionPath,
          // Agrega el filtro WHERE
          ref => ref.where('barberId', '==', barberId)
        );

        // 2. Ejecuta la consulta y espera el primer/único valor
        const snapshot = await firstValueFrom(schedulesCollection.get());

        // 3. Mapea los documentos, incluyendo el ID
        return snapshot.docs.map(doc => {
          const data = doc.data() as BarberScheduleModel;
          // Aquí puedes añadir la conversión de Timestamp si la propiedad 'day' lo fuera
          return { id: doc.id, ...data } as BarberScheduleModel;
        });

      } catch (error) {
        console.error("Error al obtener el horario del barbero:", error);
        throw error;
      }
    });
  }

  // --- 2. setBarberSchedule (Guardar o Actualizar un Horario Diario) ---

  /**
   * Guarda o actualiza un único horario diario, buscando por (barberId, day) si el ID no está presente.
   * @param schedule El objeto BarberScheduleModel a guardar.
   * @returns Una Promesa que resuelve a void.
   */
  async setBarberSchedule(schedule: BarberScheduleModel): Promise<void> {
    runInInjectionContext(this.injector, async () => {

      try {
        // Separamos el ID para usarlo solo como referencia del documento, si existe
        const { id, ...dataToSave } = schedule;

        // 1. Caso de actualización por ID existente
        if (id) {
          const docRef = this.afs.doc(`${this.dailySchedulesCollectionPath}/${id}`);
          // set() con { merge: true } funciona como setDoc de v9 para updates
          await docRef.set(dataToSave, { merge: true });
          return;
        }

        // 2. Caso de nueva creación o actualización por (barberId, day)
        // Busca si ya existe un documento para ese barbero y día

        const schedulesCol = this.afs.collection<BarberScheduleModel>(
          this.dailySchedulesCollectionPath,
          ref => ref
            .where('barberId', '==', schedule.barberId)
            .where('day', '==', schedule.day) // Asumo que 'day' es una fecha en formato string
        );

        // Obtiene el snapshot de la búsqueda
        const existingSnapshot = await firstValueFrom(schedulesCol.get());

        if (!existingSnapshot.empty) {
          // Si existe: Actualizar el documento encontrado (usa set con merge)
          const existingId = existingSnapshot.docs[0].id;
          const docRef = this.afs.doc(`${this.dailySchedulesCollectionPath}/${existingId}`);
          await docRef.set(dataToSave, { merge: true });
        } else {
          // Si no existe: Crear un nuevo documento (usa add)
          await this.schedulesCollection.add(dataToSave).then(docRef => docRef.id);
        }
      } catch (error) {
        console.error("Error al guardar/actualizar el horario:", error);
        throw error;
      }

    });

  }

  // --- 3. deleteBarberSchedule (Eliminar un Horario Diario) ---

  /**
   * Elimina un horario diario específico (documento).
   * @param scheduleId El ID del documento de horario a eliminar.
   * @returns Una Promesa que resuelve a void.
   */
  async deleteBarberSchedule(scheduleId: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      try {
        const docRef = this.afs.doc(`${this.dailySchedulesCollectionPath}/${scheduleId}`);
        await docRef.delete();
      } catch (error) {
        console.error("Error al eliminar el horario:", error);
        throw error;
      }
    });
  }

  // Nuevo Método Auxiliar para Consolidar la Conversión de Fechas

  //Convierte el campo 'date' de Firestore Timestamp a JavaScript Date si es necesario.

  private mapTimestampsToDates(appointments: AppointmentModel[]): AppointmentModel[] {
    return appointments.map(app => ({
      ...app,
      // Verifica si el campo 'date' tiene la función 'toDate' (es un Timestamp)
      date: (app.date as any)?.toDate ? (app.date as any).toDate() : app.date
    }));
  }

  // --- Método Principal para Cargar Citas según el Rol ---
  /**
   * Obtiene un Observable de citas filtradas por rol y nombre de barbero.
   * @param userRole Rol del usuario ('super_admin' o 'barbero').
   * @param currentBarberName Nombre del barbero (solo usado si userRole es 'barbero').
   * @returns Observable<AppointmentModel[]>
   */
  getAppointmentsByRole(userRole: string, currentBarberName: string): Observable<AppointmentModel[]> {
    return runInInjectionContext(this.injector, () => {

      if (userRole === 'super_admin') {
        // El admin ve TODAS las citas (retorna el observable BehaviorSubject)
        return this.appointments$; // Su BehaviorSubject
      } else if (userRole === 'barbero') {
        // El barbero ve solo sus citas (retorna una consulta filtrada)
        return this.afs.collection<AppointmentModel>('appointments', ref =>
          ref.where('barber', '==', currentBarberName)
        ).valueChanges({ idField: 'id' }).pipe(
          // Opcional: convertir Timestamps a Date aquí si es necesario
          map(appointments => this.mapTimestampsToDates(appointments))
        );
      } else if (userRole === 'barbero') {
        console.log(`Cargando citas solo para: ${currentBarberName}`);

        // Creamos una referencia a la colección con el filtro 'where'
        const filteredCollection = this.afs.collection<AppointmentModel>(
          'appointments',
          ref =>
            ref.where('barber', '==', currentBarberName)
        );

        // Retorna un Observable de los cambios de la colección filtrada
        return filteredCollection.valueChanges({ idField: 'id' }).pipe(
          map(appointments => this.mapTimestampsToDates(appointments)), // Aplica la conversión
          catchError(error => {
            console.error('Error al cargar las citas del barbero:', error);
            return of([]);
          })
        );

      } else if (userRole === 'client') {
        console.log('Cargando todas client´s appointments.');
        // Creamos una referencia a la colección con el filtro 'where'
        const filteredCollection = this.afs.collection<AppointmentModel>(
          'appointments',
          ref =>
            ref.where('clientName', '==', currentBarberName)
        );
        console.log("filteredCollection: ", currentBarberName);
        // Retorna un Observable de los cambios de la colección filtrada
        return filteredCollection.valueChanges({ idField: 'id' }).pipe(
          map(appointments =>
            this.mapTimestampsToDates(appointments)

          ), // Aplica la conversión
          catchError(error => {
            console.error('Error al cargar las citas del cliente:', error);
            return of([]);
          })
        );

      } else {
        // Rol desconocido o sin permisos para esta vista
        return of([]);
      }

    });

  }

  getCollectionName(): string {
    return this.usersCollection.ref.path;
  }

  private loadAppointments(): void {
    this.appointmentsCollection.valueChanges({ idField: 'id' }).pipe(
      map(appointments => {
        // Mapea y convierte el timestamp a Date
        return appointments.map(app => ({
          ...app,
          date: (app.date as any)?.toDate ? (app.date as any).toDate() : app.date
        }));
      }),
      catchError(error => {
        console.error('Error al cargar las citas:', error);
        return of([]);
      })
    ).subscribe(data => {
      this._appointments.next(data);
    });
  }

  private loadBarbers(): void {
    this.barbersCollection.valueChanges({ idField: 'id' }).pipe(
      catchError(error => {
        console.error('Error al cargar los barberos:', error);
        return of([]);
      })
    ).subscribe(data => {
      this._barbers.next(data);
    });
  }

  private loadServices(): void {
    this.servicesCollection.valueChanges({ idField: 'id' }).pipe(
      catchError(error => {
        console.error('Error al cargar los servicios:', error);
        return of([]);
      })
    ).subscribe(data => {
      this._services.next(data);
    });
  }

  // --- Métodos de CRUD para Usuarios ---
  addUser(user: User): Promise<string> {
    const userToSave = { ...user };

    // Si 'phone' es undefined 
    if (userToSave.phone === undefined) {
      userToSave.phone = null as any; // Usar 'as any' para manejar la  diferencia de tipo
    }

    return this.usersCollection.add(userToSave).then(docRef => docRef.id);
  }

  // --- Métodos de CRUD para Citas ---
  addAppointment(appointment: AppointmentModel): Promise<string> {
    return this.appointmentsCollection.add(appointment).then(docRef => docRef.id);
  }

  // --- Métodos de CRUD para Barberos ---
  addBarber(barber: Barber): Promise<string> {
    return this.barbersCollection.add(barber).then(docRef => docRef.id);
  }

  // --- Métodos de CRUD para Servicios ---
  addService(service: Service): Promise<string> {
    return this.servicesCollection.add(service).then(docRef => docRef.id);
  }
  private loadUsers(): void {
    this.usersCollection.valueChanges({ idField: 'id' }).pipe(
      catchError(error => {
        console.error('Error al cargar los usuarios:', error);
        return of([]);
      })
    ).subscribe(data => {
      this._users.next(data);
    });
  }

  getUsers(): Observable<User[]> {
    return this._users;
  }

  async setUsers(uid: string, data: User): Promise<void> {
    try {

      return runInInjectionContext(this.injector, async () => {
        //const docRef = await this.usersCollection.add(user);
        // Usamos .doc(uid) para establecer el UID como la clave del documento.
        // set(data, { merge: true }) asegura que se cree si no existe o se actualice si ya existe.
        const userToSave = { ...data };

        // Si 'phone' es undefined 
        if (userToSave.phone === undefined) {
          userToSave.phone = null as any; // Usar 'as any' para manejar la  diferencia de tipo
        }
        const docRef = await this.usersCollection.doc(uid).set(userToSave, { merge: true });


      });


    } catch (error) {
      console.error('Error al añadir usuario: ', error);
    }
  }


  async updateUser(id: User['id'], user: User): Promise<void> {

    runInInjectionContext(this.injector, () => {

    const userToSave = { ...user };

        // Si 'phone' es undefined 
        if (userToSave.phone === undefined) {
          userToSave.phone = null as any; // Usar 'as any' para manejar la  diferencia de tipo
        }

      const userDocRef = this.afs.doc<User>(`users/${id}`);
      userDocRef.update(userToSave);
    });
  }
  async updateAppointment(id: AppointmentModel['id'], appointment: AppointmentModel): Promise<void> {

    runInInjectionContext(this.injector, () => {

      const userDocRef = this.afs.doc<AppointmentModel>(`appointments/${id}`);
      userDocRef.update(appointment);
    });
  }

  async getAppointmentsForBarberAndDay(barberId: string, date: Date): Promise<any[]> {

    return runInInjectionContext(this.injector, async () => {

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const q = this.afs.collection('appointments', ref =>
        ref.where('barber', '==', barberId)
          .where('date', '>=', startOfDay)
          .where('date', '<=', endOfDay)
      );

      const snapshot = await q.get().toPromise();

      if (!snapshot || !snapshot.docs) {
        return [];
      }

      // Mapea los documentos y convierte el timestamp a Date
      const appointments = snapshot.docs.map(doc => {
        const data = doc.data() as AppointmentModel;
        const id = doc.id;
        return {
          ...data,
          id,
          date: (data.date as any)?.toDate ? (data.date as any).toDate() : data.date
        };
      });

      return appointments;

    });
  }

  async deleteUserById(id: any): Promise<void> {

    runInInjectionContext(this.injector, async () => {
      try {
        const userDocRef = await this.afs.doc<User>(`users/${id}`);
        
        const userAuth = await this.afa.currentUser;

        if (userAuth && userDocRef) {
          await userDocRef.delete();
          await userAuth?.delete();
          console.log('Usuario eliminado firestore');
          console.log("firebaseauth user eliminado");
        } else {
          console.log('Eror: Usuario No puede ser eliminado');
          return;

        }
      } catch (error: any) {
        if (error.code === 'auth/requires-recent-login') {
          console.error('Re-authentication required before deleting the account.');
          // Prompt the user to re-authenticate, then retry the deletion
        } else {
          console.error('Error deleting user:', error);
        }
      }

    });
  }
  async deleteAppointmentById(id: any): Promise<void> {

    runInInjectionContext(this.injector, () => {

      const userDocRef = this.afs.doc<User>(`appointments/${id}`);
      userDocRef.delete();

    });
  }

  async getUserById(id: string): Promise<User | null> {

    return runInInjectionContext(this.injector, async () => {

      // Obtén la referencia del documento por su ID
      const userDocRef = this.afs.doc<User>(`users/${id}`);
      // firstValueFrom porque es behabior observable
      const snapshot = await firstValueFrom(userDocRef.get());

      // Verifica si el documento existe
      if (snapshot && snapshot.exists) {
        // Obtén los datos del documento
        const userData = snapshot.data() as User;
        return { id: snapshot.id, ...userData } as User;
      } else {
        // Si no se encuentra el documento, retorna null
        return null;
      }

    });

  }

  /**
   * Retorna el perfil de usuario de Firestore como un Observable.
   */
  getUserByIdObservable(id: string): Observable<User | null> {

    return runInInjectionContext(this.injector, () => {

      const userDocRef = this.afs.doc<User>(`users/${id}`);

      // .valueChanges() emite null si el documento no existe y emite cada actualización
      return userDocRef.valueChanges({ idField: 'id' }).pipe(
        map(userData => {
          if (!userData) {
            return null;
          }
          return userData as User;
        }),
        catchError(err => {
          console.error('Error en getUserByIdObservable:', err);
          return of(null);
        })
      );

    });

  }

  /**
   * Obtiene la colección de citas filtrada según el rol del usuario,
   * retornando un Observable que se actualiza en tiempo real.
   * FIX: Se elimina 'async' para que el retorno sea Observable<AppointmentModel[]>
   */
  getAppointmentsByRoleLive(role: User | null, userIdentifier: string): Observable<AppointmentModel[]> {

    return runInInjectionContext(this.injector, () => {
      let collection: AngularFirestoreCollection<AppointmentModel>;
      const collectionPath = 'appointments'; // Nombre de tu colección

      if (role?.role === 'super_admin') {
        // Super Admin: ve todas las citas
        collection = this.afs.collection<AppointmentModel>(collectionPath);

      } else if (role?.role === 'admin') {
        // Admin/Barbero: ve solo las citas donde su ID coincide con el campo 'barberId'
        // UserIdentifier DEBE ser el UID del barbero.
        collection = this.afs.collection<AppointmentModel>(collectionPath, ref =>
          ref.where('barberId', '==', userIdentifier)
        );
      } else if (role?.role === 'client') {
        // Cliente: ve solo sus propias citas donde su ID coincide con 'clientId'
        // UserIdentifier DEBE ser el UID del cliente.
        collection = this.afs.collection<AppointmentModel>(collectionPath, ref =>
          ref.where('clientId', '==', userIdentifier)
        );
      } else {
        // Rol desconocido o no autorizado
        console.log('Rol desconocido o usuario no autenticado. Devolviendo lista vacía.');
        return of([]);
      }

      // Retorna el Observable que escucha los cambios en tiempo real
      return collection.valueChanges({ idField: 'id' }).pipe(
        map(appointments => this.mapTimestampsToDates(appointments)),
        catchError(err => {
          console.error('Error al cargar citas por rol:', err);
          return of([]);
        })
      );
    });

  }


  async getAppointmentById(id: string): Promise<AppointmentModel | null> {
    return runInInjectionContext(this.injector, async () => {
      // Obtén la referencia del documento por su ID
      const userDocRef = this.afs.doc<AppointmentModel>(`appointments/${id}`);
      // firstValueFrom porque es behabior observable
      const snapshot = await firstValueFrom(userDocRef.get());

      // Verifica si el documento existe
      if (snapshot && snapshot.exists) {

        // Obtén los datos del documento
        const userData = snapshot.data() as AppointmentModel;

        // --- Paso clave: Conversión del Timestamp a Date ---
        const convertedData = { ...userData };
        if (convertedData.date && typeof (convertedData.date as any).toDate === 'function') {
          convertedData.date = (convertedData.date as any).toDate();
        }
        // Obtén los datos del documento
        return { id: snapshot.id, ...convertedData } as AppointmentModel;
      } else {
        // Si no se encuentra el documento, retorna null
        return null;
      }
    })
  }

  barbersUserData$: Observable<User[]> = runInInjectionContext(this.injector, () => {

    return this.afs.collection<User>(
      'users',
      ref => ref.where('role', '==', 'admin') // CLAVE: Filtramos por el rol
    ).valueChanges({ idField: 'id' }).pipe( catchError(error => {
        console.error("Error al cargar barberos (rol 'admin'): ", error);
        return of([]);
      }), shareReplay(1));
    });

}