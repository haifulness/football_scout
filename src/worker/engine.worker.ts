import * as Comlink from 'comlink';
import { GameHost } from './game-host';

Comlink.expose(new GameHost());
