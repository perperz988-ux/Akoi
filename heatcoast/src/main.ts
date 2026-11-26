import './ui/style.css';
import { Game } from './game/game';

const TIPS = [
  'Witnesses phone in crimes. Take them out of the picture — or just don\'t get seen.',
  'Wet roads mean less grip. Brake earlier in the rain.',
  'Tap ⇄ to switch between Rosa and Jace. Rosa drives better, Jace fights better.',
  'Lose the cops by leaving the flashing search area and staying out of sight.',
  'Use the Camera app for selfies with your partner — then post them on Pulse.',
  'Businesses open and close with the clock. The Velvet Room only opens at night.',
  'Pit Stop Customs repairs, resprays and upgrades your car.',
  'Sit with your partner in the diner or safehouse to talk — it changes your bond.',
];
const bar = document.getElementById('bootBar')!, msg = document.getElementById('bootMsg')!, tip = document.getElementById('bootTip')!;
tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

function fatal(text: string) {
  const b = document.getElementById('boot')!; b.style.display = 'flex';
  msg.innerHTML = `<span style="color:#ff9a9a">${text}</span><br><br><span class="btn" onclick="location.reload()">Reload</span>`;
}
window.addEventListener('error', (e) => { console.error(e.error ?? e.message); (window as any).game?.hud?.error(String(e.message)); });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); (window as any).game?.hud?.error(String(e.reason?.message ?? e.reason)); });

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const test = document.createElement('canvas').getContext('webgl2');
  if (!test) { fatal('Your browser or device does not support WebGL 2, which Heat Coast needs. Try an up-to-date Chrome, Safari or Firefox.'); return; }
  try {
    const g = new Game(canvas, document.getElementById('ui')!);
    (window as any).game = g;
    await g.init((f, m) => { bar.style.width = `${Math.round(f * 100)}%`; msg.textContent = m; });
    document.getElementById('boot')!.style.display = 'none';
    g.menus.showTitle(true);
  } catch (e) { console.error(e); fatal(`Failed to start: ${(e as Error).message}`); }
}
boot();
