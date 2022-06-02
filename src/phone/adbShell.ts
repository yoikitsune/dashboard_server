import { Observable, interval } from 'rxjs';
import { retry, map, audit } from "rxjs/operators";
import { spawn } from 'child_process';
import fs  from "fs";

export class ADBShell {
  connect () {
    return new Observable (subscriber => {
      let process = spawn('adb', ['wait-for-device', "shell", 'settings', 'get', 'global', 'device_name']);
      let id:string;
      process.stdout.on('data', (data:any) => {
        id = data.toString();
      });
      process.on('close', (code:number) => {
        if (code == 0) {
          let process = spawn('adb', ["shell"]);
          process.stderr.on('data', (data:any) => {
            console.log ("ADBShell Error : " + data.toString ());
          });
          process.on('close', (code:number) => {
            subscriber.error ({id, message : "closing " + code});
          });
          id = id.substring(0, id.length-1);
          subscriber.next (id);
        }
        else
          subscriber.error ({id, message : `adb wait-for-device failed (${code})\n`});
      });

      return () => {
        process.kill ();
      };

    });
  }

  copy (source:string, target:string) {
    return this.exec (["push", source, target]).pipe(audit(() => interval(1000)))
  }

  ls (path:string) {
    return this.shell (['ls', path]).pipe (
      map ((res:any) => res.split("\n"))
    );
  }

  find (path:string) {
    return new Observable<any> (sub => {
      let result = "";
      this.shell ([
        'find', path,
        '-type', 'f',
        '-not', '-path', '"*/\.*"',
        '-printf', '"%P\n"'
      ]).subscribe ({
        next : (data:string) => {
          result += data;
        },
        error : error => {
          console.log ("adbshell find error", error)
        },
        complete : () => {
          sub.next (result.trim().split("\n"));
          sub.complete ();
        }
      });
    });
  }

  getSetting (name:string) {
    return this.shell (['settings', 'get', 'global', name]);
  }

  shell (params:string []) {
    params.unshift ("shell");
    return this.exec (params);
  }

  exec (params:string[]) {
    return new Observable<any> (sub => {
      let process = spawn('adb', params);
      process.on('error', (error:any) => {
        console.log ("adbshell exec failed", error);
        sub.error ("Internal error");
      });
      process.stdout.on('data', (data:any) => {
        sub.next (data.toString ());
      });
      process.stderr.on('data', (error:string) => {
        let message = error.toString()
        sub.error (message);
      });
      process.on('close', (code:number) => {
        if (code == 0) {
          sub.complete ();
        }
        else {
          console.log (params);
          sub.error (`adbshell exec failed (${code})\n`);
        }
      });

      return () => {
        process.kill ();
      }
    });
  }
}
