import express from 'express';
import { WebSocket } from './webSocket';
import { PhoneHandler } from "./phone/phoneHandler";
import { MediaDownloader } from './media/mediaDownloader';

const app = express();
const port = 3000;
const ngFolder = "../dashboard/dist/dashboard";
//const ngFolder = '../my-app/dist/my-app';

app.get('*.*', express.static(ngFolder, {maxAge: '1y'}));

app.all('*', function (req, res) {
    res.status(200).sendFile(`/`, {root: ngFolder});
});

const ws = new WebSocket ({
  download : MediaDownloader,
  phone : PhoneHandler
});

const server = app.listen(port, () => {
  console.log ("Server is listening on port " + port);
});

server.on('upgrade', (request, socket, head) => {
  ws.handleUpgrade(request, socket, head, socket => {
    ws.emit('connection', socket, request);
  });
});
