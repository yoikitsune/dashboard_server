import { WebSocket } from './webSocket';
import { PhoneHandler } from "./phone/phoneHandler";
import { MediaDownloader } from './media/mediaDownloader';

new WebSocket (3000, {
  download : MediaDownloader,
  phone : PhoneHandler
});
