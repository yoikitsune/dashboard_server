import { Database } from "../db";
import { Config } from "../config";
import { Command } from "../webSocket";
import { Observable, Subject, concatWith } from 'rxjs';
import { mergeMap, retry, tap, catchError } from 'rxjs/operators';
import { ADBShell } from "./adbShell";
import fs  from "fs";

export class PhoneHandler extends Command {
  phones:{ [key:string]:Phone } = {};
  update$:Subject<any> = new Subject();
  processes$:Subject<any> = new Subject();

  constructor (public db:Database, public conf:Config) {
    super (db, conf);
    this._initPhones ();
    this.processes$.pipe (mergeMap(params => new Observable (subscriber => {
      params.process$.subscribe ({
        next : res => params.subscriber.next (res),
        error : err => {
          params.subscriber.error(err);
          subscriber.complete ();
        },
        complete : () => {
          params.subscriber.complete();
          subscriber.complete ();
        }
      });
    }), 1)).subscribe();
  }

  _initPhones () {
    const adbshell = new ADBShell ();
    adbshell.connect().pipe (
      tap ((id:any) => {
        if (this.phones[id]) {
          this.phones[id].status = "online";
          this._change (this.phones[id]);
        }
        else
          this._add (id, { adbshell, status:"online" });

        const find = (type:keyof Files) => {
          let device = this.conf.get("storage/device");
          let path = device.rootPath+"/"+device[type+"Path"];
          return adbshell.find (path).pipe (
            tap (files => {
              this.phones[id].files[type] = files;
            })
        )};
        find ("video").pipe (
          concatWith (find("audio"))
        ).subscribe ({
          error : (error) => {
            console.log (error);
          },
          complete : () => {
            this._change (this.phones[id]);
          }
        });
      }),
      catchError ((error:{id,message}, caught) => {
        this.phones[error.id].status = "offline";
        this._change (this.phones[error.id]);
        return caught;
      }),
      retry ()
    ).subscribe ();
  }

  _add (id:string, data:any) {
    if (!this.phones [id]) {
      let phone = new Phone (id);
      phone.setData (data);
      this.phones[id] = phone;
      this.update$.next ({
        name:"add",
        data:phone
      });
    }
  }

  _change (phone:Phone) {
    if (phone) {
      this.update$.next ({
        name:"change",
        data:phone
      });
    }
  }

  _del (id:string) {
    let phone = this.phones [id];
    if (phone) {
      delete this.phones [id];
      this.update$.next ({
        name:"delete",
        data:id
      });
    }
  }

  loadSync () {
    return new Observable (sub => {
      sub.next ({action:"init", data:this.phones});
      this.update$.subscribe ((event) => {
        sub.next ({action:event.name,data:event.data});
      });
    });
  }

  copy (phoneId:string, type:string, file:string) {
    return new Observable (sub => {
      let phone:Phone;
      let key = type + "-" + file;
      let error = message => {
        console.log ("copy error", message);
        phone.processes [key].message = message;
        this._change (phone);
        sub.error (message);
      }
      try {
        phone = this.phones[phoneId];
        if (!phone)
          throw "no device connected";

        if (!(key in phone.processes)) {
          phone.processes [key] = {
            message : "En attente",
            percentage : 0,
            file,
            type
          }
          this._change (phone);
        }
        else
          throw "copy already in progress";

        let source = this.conf.getPath ("local", type) + '/' + file;
        if (!file.length || !fs.existsSync(source) || !fs.lstatSync(source).isFile () )
          throw "'" + file + "'does not exists or is not a file."

        let target = this.conf.getPath ("device", type);
        if (!target)
          throw "cannot copy to location";

        let process$ = phone.copy (source, target);
        if (process$) {
          let regexp = /\[\s([^%]*)%\]/;
          new Observable<string> (subscriber => {
            this.processes$.next ({subscriber, process$});
          }).subscribe ({
            next : data => {
              let res = data.match (regexp);
              if (res) {
                phone.processes [key].percentage = res[1];
                phone.processes [key].message = "Copie en cours...";
              }
              else
                phone.processes [key].message = data;
              this._change (phone);
            },
            error : message => {
              error (message);
            },
            complete : () => {
              phone.processes [key].percentage = 100;
              phone.processes [key].message = "Copie terminée.";
              phone.files [type as keyof Files].push (file);
              this._change (phone);
              sub.complete ();
            }
          });
        }
        else
          throw "Internal error";
      }
      catch (message) {
        error (message);
      }
    });
  }

  list (phoneId:string, type:string) {
    let device = this.conf.get("device");
    let path = device.rootPath+"/"+device[type+"Path"];
    return this.phones[phoneId].ls (path);
  }
}

export class Phone {
  status:string = "offline";
  adbshell:ADBShell|null = null;
  files:Files = new Files ();
  processes:{[key:string]:{message,percentage,file,type}} = {};

  constructor (public id:string) {

  }

  setData (data:any) {
    this.adbshell = data.adbshell;
    this.status = data.status;
  }

  copy (source:string, target:string) {
    if (this.adbshell) {
      return this.adbshell.copy (source, target);
    }
    else
      console.log ("error");
  }

  ls (path:string) {
    if (this.adbshell)
      return this.adbshell.ls (path);
  }
}

class Files {
  audio : string[] = [];
  video : string[] = [];
}
