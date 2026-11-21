import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
game.init().catch((e) => {
  console.error(e);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;background:#05070b;color:#fff;padding:24px;font:14px system-ui;z-index:999;overflow:auto';
  d.innerHTML = `<h2>Port Solano failed to start</h2><pre style="white-space:pre-wrap;color:#ff9aa8">${String(e && e.stack || e)}</pre>`;
  document.body.appendChild(d);
});
