import * as Comlink from 'comlink';
import type { GameHost } from '../../worker/game-host';

/** Single engine worker for the app's lifetime; all game logic runs off the UI thread. */
const worker = new Worker(new URL('../../worker/engine.worker.ts', import.meta.url), { type: 'module' });
export const engine = Comlink.wrap<GameHost>(worker);
export { Comlink };
