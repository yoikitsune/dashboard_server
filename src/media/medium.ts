import fs  from "fs";
import { Config } from '../config';
import { MediaDownloader } from "./mediaDownloader";
const BEST_AUDIO_FORMAT =  {
  "resolution" : "Meilleure piste audio",
  "type" : "audio",
  "format_id" : "__special__bestaudio"
};



export class Medium {
  parent:any;
  title:string = "";
  thumbnail:string = "";
  formats:any[] = [];
  format:any;
  file = "";
  status:any = {
    state : "noformat",
    label : "Format non selectionné",
    percentage : 0,
    size : "N/A",
    speed : "0",
    ETA : ""
  };

  constructor (parent:MediaDownloader, public url:string)  {
    Object.defineProperty(this, "parent", {
      enumerable : false,
      value : parent
    });
  }

  parseYtdlpData (data:any) {
    this.thumbnail = data.thumbnail;
    this.title = data.title;

    if (!data.formats) {
      data.formats = [{
        "format_id" : data.format_id,
        "resolution" : data.resolution,
        "filesize" : data.filesize,
        "video_ext" : data.ext,
        "audio_ext" : data.audio_ext,
      }];
    }
    let check = (val:any) => (val == "none") ? false : val;
    data.formats.forEach((el:any) => {
      let prop;
      let o = {
        "format_id" : el.format_id,
        "resolution" : el.resolution||"",
        "filesize" : el.filesize||el.filesize_approx,
        "ext" : undefined,
        "type" : "video"
      }
      prop = check (el.video_ext);
      if (prop)
        o.ext = prop;
      else {
        prop = check (el.audio_ext);
        if (prop) {
          o.ext = prop;
          o.type = "audio";
        }
      }
      if (o.ext) {
        if (check (el.vcodec) && !check (el.acodec))
          o.resolution += " (video_only)";
        this.formats.push (o);
      }
    });
  }

  check () {
    if (this.status.state == "downloaded") {
      let file = this.parent.conf.getPath("local", this.format.type) + "/" + this.file;
      if (!fs.existsSync(file)) {
        this.status.state = "error";
        this.status.label = "Le fichier téléchargé est manquant.";
      }
    }
  }

/*  toJSON (key:any) {
    return ["url"];
    if (key) {
      return (key!="parent"this[key]
      console.log ("key :", key);
    }
    else
      return this;
  }
  */
}
