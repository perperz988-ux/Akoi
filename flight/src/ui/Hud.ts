// Heads-up flight data overlay, warnings, messages and the landing report.
import { FlightModel } from '../sim/FlightModel';
import { Autopilot } from '../sim/Autopilot';
import { FT, KT, NM, origin, haversine, fmtTime } from '../core/geo';

export class Hud {
  root: HTMLElement; private els: Record<string, HTMLElement> = {}; private msgT = 0; private warnEl: HTMLElement; private msgEl: HTMLElement;
  constructor(parent: HTMLElement) {
    const r = this.root = document.createElement('div'); r.className = 'hud'; parent.appendChild(r);
    r.innerHTML = `
      <div class="hud-bar">
        <div class="cell"><b>IAS</b><span data-k="ias">0</span><i>KT</i></div>
        <div class="cell"><b>GS</b><span data-k="gs">0</span><i>KT</i></div>
        <div class="cell"><b>ALT</b><span data-k="alt">0</span><i>FT</i></div>
        <div class="cell"><b>V/S</b><span data-k="vs">0</span><i>FPM</i></div>
        <div class="cell"><b>HDG</b><span data-k="hdg">000</span><i>°</i></div>
        <div class="cell wide"><b>THR</b><span data-k="thr">0</span><i>%</i></div>
        <div class="cell"><b>FLAP</b><span data-k="flap">UP</span></div>
        <div class="cell"><b>GEAR</b><span data-k="gear">DN</span></div>
        <div class="cell ap"><b>AP</b><span data-k="ap">OFF</span></div>
      </div>
      <div class="hud-route"><span data-k="route"></span></div>
      <div class="hud-side"><div data-k="eng"></div><div data-k="extra"></div></div>
      <div class="hud-warn"></div>
      <div class="hud-msg"></div>
      <div class="hud-cam" data-k="cam"></div>
      <div class="hud-tip" data-k="tip"></div>`;
    r.querySelectorAll<HTMLElement>('[data-k]').forEach(e => (this.els[e.dataset.k!] = e));
    this.warnEl = r.querySelector('.hud-warn')!; this.msgEl = r.querySelector('.hud-msg')!;
  }
  set(k: string, v: string) { const e = this.els[k]; if (e && e.textContent !== v) e.textContent = v; }
  message(text: string, sec = 3) { this.msgEl.textContent = text; this.msgEl.classList.add('show'); this.msgT = sec; }
  tip(html: string) { const e = this.els.tip; if (e.innerHTML !== html) e.innerHTML = html; }
  update(dt: number, fm: FlightModel, ap: Autopilot, extra: { cam: string; warnings: string[]; route?: string; compact: boolean }) {
    const st = fm.st;
    this.set('ias', String(Math.round(st.ias / KT)));
    this.set('gs', String(Math.round(st.gs / KT)));
    this.set('alt', String(Math.round(st.altMSL / FT / 10) * 10));
    const vs = Math.round(st.vs / FT * 60 / 10) * 10; this.set('vs', (vs > 0 ? '+' : '') + vs);
    this.set('hdg', String(Math.round(st.heading) % 360).padStart(3, '0'));
    const thr = fm.apThrottle ?? fm.ctl.throttle[0]; this.set('thr', thr < 0 ? 'REV' : String(Math.round(thr * 100)));
    this.set('flap', fm.spec.flapDetents[fm.ctl.flapIdx]);
    this.set('gear', fm.spec.gear.fixed ? 'FIXED' : fm.gear > 0.99 ? 'DOWN' : fm.gear < 0.01 ? 'UP' : 'TRANSIT');
    this.set('ap', ap.engaged ? `${ap.lat} ${ap.vert}${ap.athr ? ' A/T' : ''}` : ap.athr ? 'A/T' : 'OFF');
    this.els.ap.parentElement!.classList.toggle('on', ap.engaged);
    const e = fm.eng.map((x, i) => `E${i + 1} ${x.starting ? 'START' : x.running ? (fm.spec.engines.type === 'piston' ? Math.round(x.rpm) + 'rpm' : 'N1 ' + x.n1.toFixed(0)) : 'OFF'}`).join(' · ');
    this.set('eng', e);
    const ffKgH = fm.eng.reduce((a, x) => a + x.ff, 0) * 3600;
    this.set('extra', `FUEL ${fm.fuel > 2000 ? (fm.fuel / 1000).toFixed(1) + ' t' : Math.round(fm.fuel) + ' kg'} · FF ${Math.round(ffKgH)} kg/h · AGL ${Math.round(st.agl / FT)} ft · AoA ${st.alpha.toFixed(1)}° · G ${st.gload.toFixed(2)}${fm.ctl.parkingBrake ? ' · PARK BRK' : ''}${fm.spoiler > 0.05 ? ' · SPOILERS' : fm.ctl.spoilerArmed ? ' · SPLR ARM' : ''}`);
    this.set('cam', extra.cam);
    if (ap.plan) {
      const lat = origin.latOf(fm.pos.z), lon = origin.lonOf(fm.pos.x);
      const w = ap.plan.waypoints; const nx = w[Math.min(ap.active, w.length - 1)];
      const dNext = haversine(lat, lon, nx.lat, nx.lon) / NM;
      const dArr = haversine(lat, lon, ap.plan.arr.lat, ap.plan.arr.lon) / NM;
      const ete = dArr * NM / Math.max(40, st.gs);
      this.set('route', `${ap.plan.dep.icao} → ${ap.plan.arr.icao} · NEXT ${nx.id} ${dNext.toFixed(1)} NM · DEST ${dArr.toFixed(0)} NM · ETE ${fmtTime(ete)}`);
    } else this.set('route', extra.route ?? '');
    const wtxt = extra.warnings.join('  ');
    if (this.warnEl.textContent !== wtxt) { this.warnEl.textContent = wtxt; this.warnEl.classList.toggle('show', !!wtxt); }
    this.msgT -= dt; if (this.msgT <= 0) this.msgEl.classList.remove('show');
    this.root.classList.toggle('compact', extra.compact);
  }
  show(v: boolean) { this.root.style.display = v ? '' : 'none'; }
  destroy() { this.root.remove(); }
}

export function landingReport(parent: HTMLElement, r: { vs: number; g: number; centerline: number; tdz: number; speedErr: number; bank: number; score: number; grade: string; notes: string[] }, onClose: () => void, extraBtn?: { label: string; fn: () => void }) {
  const d = document.createElement('div'); d.className = 'modal report';
  d.innerHTML = `<div class="panel"><h2>LANDING REPORT</h2>
    <div class="grade">${r.grade}<small>${r.score}/100</small></div>
    <table>
      <tr><td>Touchdown rate</td><td>${Math.round(r.vs)} fpm</td></tr>
      <tr><td>G-load</td><td>${r.g.toFixed(2)} g</td></tr>
      <tr><td>Centreline offset</td><td>${r.centerline.toFixed(1)} m</td></tr>
      <tr><td>Touchdown from threshold</td><td>${Math.round(r.tdz)} m</td></tr>
      <tr><td>Speed vs Vref</td><td>${r.speedErr > 0 ? '+' : ''}${Math.round(r.speedErr)} kt</td></tr>
      <tr><td>Bank at touchdown</td><td>${r.bank.toFixed(1)}°</td></tr>
    </table>
    <ul>${r.notes.map(n => `<li>${n}</li>`).join('')}</ul>
    <div class="row"><button class="btn primary" data-c>CONTINUE</button>${extraBtn ? `<button class="btn" data-x>${extraBtn.label}</button>` : ''}</div></div>`;
  parent.appendChild(d);
  d.querySelector('[data-c]')!.addEventListener('click', () => { d.remove(); onClose(); });
  d.querySelector('[data-x]')?.addEventListener('click', () => { d.remove(); extraBtn!.fn(); });
  void fmtTime;
}
