import { spawn } from 'child_process';
import { Config } from '../config';
import { Observable, Subject, interval } from 'rxjs';
import { audit, mergeMap, switchMap } from 'rxjs/operators';

export class VideoDownloader {
  private process:any;

  constructor (private conf:Config) {}

  infos (url:string) {
    return this.exec (["-J", url]);
  }

  audio (url:string, format:any):Observable<any> {
    let params:string[] = [];
    if (format.format_id == "__special__bestaudio")
      params.push ("-x", "-f", "ba");
    else
      params.push ('-f', format.format_id);
    params.push (
      '-o', "%(title)s.%(ext)s",
      '-P', this.conf.getPath ("local", "audio")||"",
      '--newline',
      '--exec', 'echo',
      url
    );
    return this.exec (params).pipe(audit(() => interval(1000)));
  }

  video (url:string, format:any):Observable<any> {
    return this.exec ([
      '-f', format.format_id,
      '-o', "%(title)s.%(ext)s",
      '-P', this.conf.getPath ("local", "video"),
      '--newline',
      '--exec', 'echo',
      url
    ]);
  }

  exec (params:string[]) {
    return new Observable (sub => {
      if (!this.process) {
        let errorBuffer : string = "";
        this.process = spawn(this.conf.get ("ytdlpPath"), params);
        this.process.on('error', function(e) {
          sub.error ("Internal Error");
        });
        this.process.stdout.on('data', (data) => {
          sub.next (data.toString());
        });

        this.process.stderr.on('data', (error) => {
          errorBuffer += error.toString();
        });
        this.process.on('close', (code) => {
          if (code == 0) {
            sub.complete ();
          }
          else if (code == null) {
            sub.error ("__internal__stopped");
          }
          else {
            sub.error (`Process return error "${code}"\n${errorBuffer}`);
          }
          this.process = null;
        });
      }
      else
        sub.error ("process already running");
    });
  }

  kill () {
    if (this.process) {
      if (this.process.kill ()) {
        this.process = null;
        return true;
      }
      else
        return false;
    }
    else
      return true;
  }
}
