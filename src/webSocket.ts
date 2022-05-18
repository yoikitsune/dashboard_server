import express from 'express';
import { Server } from 'ws';
import { Observable } from 'rxjs';
import { Database } from "./db";
import { Config } from "./config";

export class WebSocket {
  app = express();
  commands:{[key:string]:Command} = {};

  constructor (port:number, commands: {[key:string]:any}) {
    let db = new Database ("myDataBase");
    let config = new Config (db);
    for (var key in commands)
      this.commands [key] = new commands [key] (db, config);
    var clientId = 0;
    const wsServer = new Server({ noServer: true });
    wsServer.on('connection', socket => {
      socket.send (++clientId);
      let observers : any[] = [];
      socket.on('message', data => {
        try {
          var request = JSON.parse (data.toString());
          console.log (request);
          if (request.command in this.commands) {
            let command = this.commands [request.command];
            let name = request.method as keyof typeof command & keyof Command;
            let method  = command [name] as (...args:any) => Observable<any>;
            let action$ = method.apply (command, request.params);
            observers.push (action$.subscribe ({
              next : (data:any) => {
                socket.send (JSON.stringify ({id:request.id, type:"next", data : data}))
              },
              error : (data:any) => {
                socket.send (JSON.stringify ({id:request.id, type:"error", data : data}))
              },
              complete : () => {
                socket.send (JSON.stringify ({id:request.id, type:"complete", data : data}))
              }
            }));
          }
          else {
            socket.send (JSON.stringify ({id:request.id, type:"error", data : "Command not found"}))
          }
        }
        catch (e) {
          console.log ("ws clientError", e);
          socket.send (JSON.stringify ({id:request.id, type:"error", data : "Internal Error"}))
        }
      });
      socket.on ('close', () => {
        /*for (var command in commands)
          commands[command].close ();*/
        observers.forEach(obs$ => {
          obs$.unsubscribe ();
        });
        console.log ('close');
      });
    });

    wsServer.on('close', () => {
      console.log ('server stopped');
    } );

    this.app.use(express.static('../dashboard/dist/dashboard'))

    var server = this.app.listen(port, () => {
      console.log(`Websocket listening on port ${port}`)
    })
    server.on('upgrade', (request, socket, head) => {
      wsServer.handleUpgrade(request, socket, head, socket => {
        wsServer.emit('connection', socket, request);
      });
    });
  }
}

export class Command {
  constructor (public db:Database, public conf:Config) {

  }

  exec () {

  }
}
