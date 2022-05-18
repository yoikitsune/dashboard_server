import { Database } from "../db";
import { Config } from "../config";
import { Observable, Subject, concat } from 'rxjs';
import { VideoDownloader } from "./videoDownloader";
import { Command } from "../webSocket";
import { Medium } from "./medium";
import { basename } from "path";
import { mergeMap } from 'rxjs/operators';

export class MediaDownloader extends Command {
  media:{ [key:string]:Medium } = {};
  update$:Subject<any> = new Subject();
  processes$:Subject<any> = new Subject();
  processes:any = {};

  constructor (public db:Database, public conf:Config) {
    super (db, conf);
    this.db.create ("/mediadownloader/media", []).forEach((data:any) => {
      this.media [data.url] = Object.assign (new Medium (this, data.url), data);
      this.media [data.url].check ();
    });
    this.processes$.pipe (mergeMap(params => new Observable (sub => {
        params.process.subscribe ({
          next : res => params.sub.next (res),
          error : err => {
            params.sub.error(err);
            sub.complete ();
          },
          complete : () => {
            params.sub.complete();
            sub.complete ();
          }
        });
    }), 1)).subscribe();
  }

  _add (medium:Medium) {
    if (!this.media [medium.url]) {
      this.media[medium.url] = medium;
      this.db.set ("/mediadownloader/media[]", medium);
      this.update$.next ({
        name:"add",
        data:medium
      });
    }
  }

  _change (medium:Medium) {
    if (medium) {
      let index = this.db._db.getIndex("/mediadownloader/media", medium.url, "url");
      this.db.set ("/mediadownloader/media["+index+"]", medium);
      this.update$.next ({
        name:"change",
        data:medium
      });
    }
  }

  _del (url:string) {
    let medium = this.media [url];
    if (medium) {
      delete this.media [url];
      let index = this.db._db.getIndex("/mediadownloader/media", url, "url");
      this.db._db.delete ("/mediadownloader/media["+ index +"]");
      this.update$.next ({
        name:"delete",
        data:url
      });
    }
  }

  loadSync () {
    return new Observable (sub => {
      sub.next ({action:"init", data:this.media});
      this.update$.subscribe ((event) => {
        sub.next ({action:event.name,data:event.data});
      });
    });
  }

  getInfos (url:string):Observable<string> {
    return new Observable (sub => {
      var output = "";
      new VideoDownloader (this.conf).infos(url).subscribe ({
        next : (data:any) => {
          output += data;
        },
        error : (error:any) => {
          console.log ("media error", error)
          sub.error (error);
        },
        complete : () => {
          try {
            let data = JSON.parse (output);
            let medium = new Medium (this, url);
            medium.parseYtdlpData (data);
            this._add (medium);
            sub.complete ();
            console.log ("media complete")
          }
          catch (e:any) {
            sub.error (["Json parse error", e.message, output])
          }
        },
      });
    });
  }

  initDownload (url:string, format:any):Observable<any> {
    return concat (
      new Observable (sub => {
        let medium = this.media [url];
        medium.format = format;
        medium.status.state = "paused";
        this._change (medium);
        sub.complete ();
      }),
      this.startDownload (url)
    );
  }

  startDownload (url:string):Observable<any> {
    return new Observable (sub => {
      let medium = this.media [url];
      try {
        medium.status.state = "init";
        medium.status.label = "En attente";
        this._change (medium);
        let regexp = /\[download\]\s*([^%]*)%\s*of\s*([^ ]*)\s*at\s*([^ ]*)\s*ETA\s*([^ ]*)/;
        new Observable (sub2 => {
          if (!this.processes[url]) {
            this.processes[url] = new VideoDownloader (this.conf);
            let process;
            if (medium.format.type == "audio")
              process = this.processes[url].audio (url, medium.format);
            else
              process = this.processes[url].video (url, medium.format);
            this.processes$.next ({ sub:sub2, process, url });
          }
          else
            sub.error ("ongoing action on " + url);
        }).subscribe ({
          next : (data:any) => {
            var res = data.match (regexp);
            if (res) {
              medium.status.state = "downloading";
              medium.status.percentage = res[1];
              medium.status.size = res[2];
              medium.status.speed = res[3];
              medium.status.ETA = res[4];
            }
            else if (data.startsWith ("[Fixup")) {
              medium.status.state = "finalize";
              medium.status.label = "Finalisation du média";
            }
            else {
              medium.status.state = "init";
              medium.status.label = data;
            }
            this._change (medium);
          },
          error : (error:any) => {
            medium.status.state = "paused";
            this._change (medium);
            if (error != "__internal__stopped") {
              console.log (error);
              sub.error (error);
            }
            else
              sub.complete ();
          },
          complete : () => {
            medium.formats = [];
            medium.file = basename(medium.status.label.substring (0, medium.status.label.length -1));
            medium.status = {
              state : "downloaded",
              "percentage": 100
            }
            medium.check ();
            this._change (medium);
            sub.complete ();
          },
        });
      }
      catch (e) {
        console.log (e);
        if (medium) {
          medium.status.state = "error";
          medium.status.label = "Téléchargement impossible";
          this._change (medium);
        }
        sub.error (e);
      }
    });
  }

  stopDownload (url: string) {
    return new Observable (sub => {
      if (this.processes [url]) {
        if (this.processes[url].kill ()) {
          delete this.processes[url];
          this.media [url].status.state = "paused";
          this._change (this.media [url]);
          sub.complete ();
        }
        else
          sub.error ("Cannot kill process");
      }
      else
        sub.error ("No existing process");
    });
  }

  delete (url:string) {
    return new Observable (sub => {
      this._del (url);
      sub.complete ();
    });
  }

  close () {
    this.update$.complete ();
    Object.keys (this.processes).forEach(element => {
      this.processes[element].kill ();
    });
  }
}
