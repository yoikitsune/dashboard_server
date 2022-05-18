import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig'

export class Database {
  _db : JsonDB;
  constructor (filename:string) {
    this._db = new JsonDB(new Config(filename, true, true, '/'));
    if (!this._db.exists ("/config")) {
      this._db.push ("/config", {});
    }
  }

  create (path:string, value:any=null) {
    if (!this._db.exists (path))
      this.set (path, value);
    return this.get (path);
  }
  get (path:string) {
    return this._db.getData (path);
  }

  set (path:string, value:any) {
    this._db.push (path, value);
  }
}

export class Table {

}
