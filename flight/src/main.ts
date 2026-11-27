// Skyward Flight Simulator — entry point.
import { loadWorld, buildLandMask, nearestAirports } from './data/world';
import { Engine } from './core/Engine';
import { Input } from './ui/Input';
import { Menu } from './ui/Menu';
import { Showcase } from './ui/Showcase';
import { Flight, FlightConfig, FlightResult } from './sim/Flight';
import { MapView } from './ui/MapView';
import { CAREER } from './game/Modes';
import { settings, career, saveCareer } from './game/Save';
import { origin, NM } from './core/geo';
import { aircraftById } from './data/aircraft';
import { audio } from './audio/Audio';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

async function boot() {
  const bar = $('#bootbar'), msg = $('#bootmsg');
  const prog = (f: number, m: string) => { bar.style.width = `${f * 100}%`; msg.textContent = m; };
  await loadWorld(prog);
  prog(0.85, 'Rasterising coastlines…'); await new Promise(r => setTimeout(r, 0));
  buildLandMask();
  prog(0.92, 'Starting renderer…');
  const canvas = $('#gl') as HTMLCanvasElement;
  const engine = new Engine(canvas);
  const input = new Input(canvas);
  const ui = $('#ui');
  const showcase = new Showcase(engine);
  let flight: Flight | null = null; let lastCfg: FlightConfig | null = null;
  const applySettings = () => { engine.applyQuality(); audio.setVolume(settings.volume); audio.voice = settings.voice; engine.timeScale = flight ? settings.timeScale : 12; };
  const menu = new Menu(ui, engine, showcase, cfg => startFlight(cfg), applySettings);
  engine.tick = dt => { if (flight) flight.update(dt); else showcase.update(dt); };

  function startFlight(cfg: FlightConfig) {
    lastCfg = cfg; menu.hide(); showcase.hide();
    flight?.dispose();
    flight = new Flight(engine, input, cfg, ui, r => endFlight(r));
    (flight as any).mapHook = () => openFlightMap();
    // first user gesture: unlock audio
    audio.resume();
  }
  function endFlight(r: FlightResult & { restart?: boolean }) {
    const cfg = lastCfg!;
    if (r.kind === 'landed' && r.landing) {
      career.landings++; career.hours += r.timeSec / 3600;
      if (cfg.mode === 'career' && cfg.missionId) {
        const m = CAREER.find(x => x.id === cfg.missionId)!;
        const ok = r.completedAt?.icao === cfg.arr?.icao && r.landing.score >= 40;
        if (ok) {
          career.completed[m.id] = Math.max(career.completed[m.id] ?? 0, r.landing.score);
          career.credits += Math.round(m.reward * (0.5 + r.landing.score / 200));
          for (const u of m.unlocks ?? []) if (!career.unlockedAircraft.includes(u)) career.unlockedAircraft.push(u);
          if (!career.unlockedAircraft.includes(m.aircraft)) career.unlockedAircraft.push(m.aircraft);
        }
      }
      if (cfg.mode === 'challenge' && cfg.missionId) { const b = ((career as any).challenges ||= {}); b[cfg.missionId] = Math.max(b[cfg.missionId] ?? 0, r.landing.score); career.credits += r.landing.score * 5; }
      saveCareer();
    }
    flight?.dispose(); flight = null;
    if (r.restart) { startFlight(cfg); return; }
    engine.timeScale = 12;
    showcase.show(true); menu.show();
  }
  function openFlightMap() {
    if (!flight) return;
    const f = flight; const wrap = document.createElement('div'); wrap.className = 'modal mapmodal';
    wrap.innerHTML = `<div class="panel full"><header><h2>NAVIGATION MAP</h2><span class="dim">${f.cfg.mode === 'explore' ? 'Tap anywhere to teleport' : 'Live position and flight plan'}</span><button class="btn" data-x>CLOSE</button></header><div class="mapbox"></div></div>`;
    ui.appendChild(wrap);
    const mv = new MapView(wrap.querySelector('.mapbox')!);
    const ll = f.latLon(); mv.focus(ll.lat, ll.lon, 20);
    mv.aircraft = { lat: ll.lat, lon: ll.lon, hdg: f.fm.st.heading };
    if (f.plan) { mv.routePts = f.plan.waypoints.map(w => ({ lat: w.lat, lon: w.lon })); mv.dep = f.plan.dep; mv.arr = f.plan.arr; }
    const close = () => { mv.destroy(); wrap.remove(); };
    wrap.querySelector('[data-x]')!.addEventListener('click', close);
    if (f.cfg.mode === 'explore') {
      mv.onPoint = (lat, lon) => { close(); f.teleport(lat, lon, Math.max(3000, f.fm.st.altMSL / 0.3048)); };
      mv.onAirport = a => { close(); f.teleport(a.lat, a.lon, a.elevFt + 3000); };
    }
  }
  // auto-pause when app backgrounded
  document.addEventListener('visibilitychange', () => { if (document.hidden && flight && !document.querySelector('.modal.pause')) flight.togglePause(); });
  // expose for debugging / automation
  (window as any).sky = { engine, get flight() { return flight; }, menu, origin, nearestAirports, aircraftById, NM, startFlight };
  prog(1, 'Ready');
  setTimeout(() => $('#boot').classList.add('done'), 300);
}
boot().catch(e => { console.error(e); const m = document.querySelector('#bootmsg'); if (m) m.textContent = 'Failed to start: ' + e.message; });
