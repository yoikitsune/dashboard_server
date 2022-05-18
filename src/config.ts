import { Database } from './db'

export class Config {
  db:Database;
  path:String = "/config";

  constructor (db:Database) {
    this.db = db;
  }
  get (name:string) {
    return this.db.get (this.path + "/" + name);
  }
  set (name:string, value:any) {
    this.db.set (this.path + "/" + name, value)
  }

  getPath (location:string, type:string) {
    try {
      return this.get ("storage/"+ location + "/rootPath") + "/"
        + this.get ("storage/"+ location + "/" + type + "Path");
    }
    catch (e) {
      console.log (e);
    }
  }
}
