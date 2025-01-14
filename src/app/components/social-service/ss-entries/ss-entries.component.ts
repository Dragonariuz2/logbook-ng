import { Component, ViewChild, Inject, LOCALE_ID } from '@angular/core';
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, Subject } from 'rxjs';
import { EntriesService } from 'src/app/services/entries.service';
import { ReportsService } from 'src/app/services/reports.service';
import { formatDate } from '@angular/common';

// Tipado de objeto para la busqueda de alumnos registrados
type RegisteredStudent = { registryId: string; studentId: string; name: string; start_time: string; end_time?: string; hours: number; checked: boolean}
type AlertMessage = { message: string; type: string }


@Component({
  selector: 'app-ss-entries',
  templateUrl: './ss-entries.component.html',
  styleUrls: ['./ss-entries.component.css', './ss-entries.component.scss']
})
export class SsEntriesComponent {
  public studentId?: string;
  private requestInProgress: boolean = false;
  public registeredStudents: Array<RegisteredStudent> = [];
  private user: any;
  public c_User: any;

  @ViewChild('selfClosingAlert', { static: false }) selfClosingAlert?: NgbAlert;
  private _message = new Subject<string>();
  alertMessage: AlertMessage = {
    message: '',
    type: ''
  };

  constructor(@Inject(LOCALE_ID) private locale: string, private entriesService: EntriesService, private reportsService: ReportsService) { }

  ngOnInit(): void {
    this.c_User = localStorage.getItem('user');
    if (this.c_User) {
      this.c_User = JSON.parse(this.c_User);
    }
    // Tomamos el usuario actual
    this.user = localStorage.getItem('user');
    if (this.user) {
      this.user = JSON.parse(this.user);
    }
    // Almacenamos los alumnos que ya se han registrado al curso
    this.getSSReports();
    // Tiempo de duración y mensaje de la alerta
		this._message.subscribe((message) => (this.alertMessage.message = message));
		this._message.pipe(debounceTime(4000)).subscribe(() => {
			if (this.selfClosingAlert) {
				this.selfClosingAlert.close();
			}
		});
  }

  // Get data from database
  getSSReports() {
    // Set today and tomorrow dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Set parameters
    const parameters = {
      lab: this.user.user.lab,
      startDate: today,
      endDate: tomorrow,
    };
  
    // Get data from database
    this.reportsService.getSSReport(parameters).subscribe(
      (res) => {
        let aux: any = [];
        res.forEach((element: any) => {
          aux.push({
            registryId: element._id,
            studentId: element.student._id,
            name: element.student.name,
            start_time: element.start_time,
            end_time: element.end_time,
            hours: element.hours,
            checked: element.end_time ? true : false,
          });
        });
        this.registeredStudents = aux;

        this.registeredStudents = [...this.registeredStudents];
        localStorage.setItem('SS-register', JSON.stringify(this.registeredStudents));
      },
      (err) => {
        console.log(err);
      },
    );
  }
  
  // Revisión que la matrícula se haya ingresado, para posteriormente guardar la matrícula en el almacenamiento local dentro de un arreglo
  registerStudentEntry() {
    // Revisamos que se haya ingresado una matrícula
    if(!this.studentId) {
      this._message.next(`Porfavor ingrese la matrícula del alumno`);
      this.alertMessage.type = 'danger';
      return;
    }

    // Eliminamos los números 4400 de la matrícula escaneada
    if(this.studentId.endsWith('4400') && this.studentId.startsWith('A')) {
      this.studentId = this.studentId.substr(1, 6);
    }

    // Revisa si el alumno ya se ha registrado
    let regStudent: RegisteredStudent | null = null;
    
    this.registeredStudents.forEach((element: RegisteredStudent) => {
      if(element.studentId == this.studentId && !element.checked) {
        regStudent = element;
      }
    });
    // Si ya esta registrado checamos si ya tiene marcada su salida, si no creamos una nueva entrada
    if(regStudent) {
      let aux: RegisteredStudent = regStudent
      if(!aux.end_time) {
        this.checkEndTime(regStudent)
        this.studentId = '';
        return;
      }
    }

    // Revisa si existe una petición en curso
    if(this.requestInProgress) {
      this._message.next(`Porfavor espere a que termine de ser registrada la entrada anterior`);
      this.alertMessage.type = 'warning';
      return;
    }

    // Indicamos que se ha iniciado una petición
    this.requestInProgress = true;

    const date: string = new Date().toISOString();

    const entry = {
      start_time: date,
      student: this.studentId,
      lab: this.user.user.lab,
      hours: 0,
    }
    
    // Registramos la nueva entrada
    this.entriesService.registerSSEntry(entry).subscribe(
      (res) => {
        // Revisamos si existe alumno en la base de datos con dicha matrícula
        if(res.status == 400) {
          this._message.next(`No se tiene alumno registrado con esta matrícula`);
          this.alertMessage.type = 'danger';
          this.studentId = '';
        } else {
          this._message.next(`Hora de entrada registrada correctamente`);
          this.alertMessage.type = 'success';
          this.registeredStudents = [...this.registeredStudents, {
            registryId: res._id,
            studentId: res.student._id,
            name: res.student.name,
            start_time: date,
            hours: 0,
            checked: false
          }];
          localStorage.setItem('SS-register', JSON.stringify(this.registeredStudents));
          this.studentId = '';
        }
        // Indicamos que ha terminado la petición
        this.requestInProgress = false;
      },
      (err) => {
        // Indicamos que ha terminado la petición
        this.requestInProgress = false;
        console.log(err);
      }
    );
  }

  deleteRegistry(registryId: string) {
    // Elimiamos el registro de la base de datos
    this.entriesService.deleteSSEntry(registryId).subscribe(
      (res) => {
        this._message.next(`Registro eliminado correctamente`);
        this.alertMessage.type = 'info';
        // Obtenemos el indice del elemento eliminado con el id del estudiante
        let index = this.registeredStudents.findIndex((element: RegisteredStudent) => element.registryId == res.registryId);
        // Eliminamos el elemento del arreglo
        this.registeredStudents.splice(index, 1);
        this.registeredStudents = [...this.registeredStudents];
        localStorage.setItem('SS-register', JSON.stringify(this.registeredStudents));
      },
      (err) => {
        this._message.next(`No se pudo eliminar el registro debido a un error en el servidor`);
        console.log(err);
      }
    )
  }

  checkEndTime(student: RegisteredStudent) {
    let index = this.registeredStudents.findIndex((element: RegisteredStudent) => (element.studentId == student.studentId && !element.checked));
    // Guardamos el valor de end_time del para tener un respaldo
    let aux = this.registeredStudents[index].end_time

    // Asignamos le hora y dia actual al end_time
    this.registeredStudents[index].end_time = new Date().toISOString();

    // Calculamos las horas que estuvo el alumno en el laboratorio
    let x : string = this.registeredStudents[index].start_time;
    let y: string | undefined = this.registeredStudents[index].end_time;

    if (y !== undefined) {
      let start = new Date(x);
      let end = new Date(y);

      const diffMilliseconds = end.getTime() - start.getTime();
  
      const diffHours = diffMilliseconds / (1000 * 60 * 60);

      this.registeredStudents[index].hours = diffHours;
    }
    
    this.entriesService.updateSSEntry(student.registryId, student).subscribe(
      (res) => {
        this._message.next(`Hora checada correctamente`);
        this.alertMessage.type = 'info';

        this.registeredStudents[index].checked = true;

        this.registeredStudents = [...this.registeredStudents];
        localStorage.setItem('SS-register', JSON.stringify(this.registeredStudents));
      },
      (err) => {
        this.registeredStudents[index].end_time = aux;
        this.registeredStudents[index].hours = 0;
        this._message.next(`No se pudo checar el registro debido a un error en el servidor`);
        console.log(err);
      }
    )
  }
}
