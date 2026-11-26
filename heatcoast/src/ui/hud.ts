import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Actor } from '../actors/actor';
import { EDGES, NODES, HALF, SIZE, zoneAt, Zone, POIS, coastX, isWater, districtName, streetName, route, AIRPORT, isParkBlockAt } from '../world/layout';
import { WEAPONS } from '../combat/weapons';
import { fmtMoney, fmtTime, clamp } from '../core/math';
import { WEATHER_LABEL } from '../render/env';

const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
const POI_ICON: Record<string, [string, string]> = { safehouse: ['🏠', '#4dff7a'], gas: ['⛽', '#ffd34d'], store: ['🛒', '#7ad0ff'], diner: ['🍳', '#ff9a4d'], gunshop: ['🔫', '#ff6a6a'], clothes: ['👕', '#e08aff'], garage: ['🔧', '#ffc14d'], hotel: ['🏨', '#5ff3ff'], club: ['🍸', '#ff4fe0'], police: ['🚓', '#5a8aff'], hospital: ['✚', '#ff4d4d'], bank: ['$', '#4dff7a'], restaurant: ['🍽', '#ff9a4d'], airport: ['✈', '#e0e0e0'], bar: ['🍺', '#ffb84d'] };

/** HUD: minimap with GPS, health/armour/special, money, wanted stars, weapon, speedo, objectives, subtitles, bubbles, full map. */
export class Hud {
  root: HTMLElement; private el: Record<string, HTMLElement> = {};
  private mapImg: HTMLCanvasElement; private mini: CanvasRenderingContext2D; private full: CanvasRenderingContext2D;
  private routePts: { x: number; z: number }[] = []; private routeTarget: { x: number; z: number } | null = null; private routeT = 0;
  waypoint: { x: number; z: number } | null = null;
  mapOpen = false; private mapView = { cx: 0, cz: 0, scale: 0.35 };
  private bubbles: { a: Actor; el: HTMLElement; t: number }[] = [];
  private moneyShown = 0; private subT = 0; private lastPlace = ''; private placeT = 0; private bigT = 0; private bannerT = 0;
  private framesT = 0;
  constructor(private g: Game, ui: HTMLElement) {
    this.root = h(`<div id="hud" class="hidden">
      <canvas id="minimap" width="256" height="256"></canvas>
      <div id="bars"><div class="bar hp"><i id="hpb"></i></div><div class="bar ar"><i id="arb"></i></div><div class="bar sp"><i id="spb"></i></div></div>
      <div id="topright"><div id="money">$0</div><div id="moneyfx"></div><div id="stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><div id="weapon"></div><div id="clock"></div></div>
      <div id="place"><div class="z"></div><div class="s"></div></div>
      <div id="speedo"><div class="v">0</div><div class="u">KM/H · <span id="gear">1</span></div></div>
      <div id="objective"></div><div id="timer"></div><div id="progress" class="bar sp"><i></i></div>
      <div id="crosshair"></div><div id="hitmark"></div><div id="damage"></div>
      <div id="ctx"></div><div id="subtitle"></div><div id="toasts"></div>
      <div id="bigmsg"><h1></h1><p></p></div><div id="banner"><div class="c"></div><div class="t"></div></div>
      <div id="bubbles"></div><div id="fps"></div><div id="err"></div>
      <div id="letterT"></div><div id="letterB"></div><div id="switchfx"></div>
    </div>`);
    ui.appendChild(this.root);
    ui.appendChild(h(`<div id="fade"></div>`));
    ui.appendChild(h(`<div id="mapov"><canvas id="fullmap"></canvas><div class="bar2"><b style="font-family:Georgia;font-style:italic;font-size:22px">Bahía Verde</b><div style="display:flex;gap:8px"><span class="btn" id="mapWp">Clear GPS</span><span class="btn" id="mapZoomOut">−</span><span class="btn" id="mapZoomIn">+</span><span class="btn primary" id="mapClose">Close</span></div></div><div class="legend">Tap to set a GPS waypoint · Drag to pan · Pinch to zoom<br>🟡 Story mission · 🔵 Side job · 🏠 Safehouse</div></div>`));
    for (const id of ['minimap', 'hpb', 'arb', 'spb', 'money', 'moneyfx', 'stars', 'weapon', 'clock', 'place', 'speedo', 'gear', 'objective', 'timer', 'progress', 'crosshair', 'hitmark', 'damage', 'ctx', 'subtitle', 'toasts', 'bigmsg', 'banner', 'bubbles', 'fps', 'err', 'switchfx', 'fade', 'mapov', 'fullmap']) this.el[id] = document.getElementById(id)!;
    this.mini = (this.el.minimap as HTMLCanvasElement).getContext('2d')!;
    this.full = (this.el.fullmap as HTMLCanvasElement).getContext('2d')!;
    this.mapImg = this.renderMapImage();
    this.el.minimap.addEventListener('click', () => this.openMap(true));
    document.getElementById('mapClose')!.addEventListener('click', () => this.openMap(false));
    document.getElementById('mapWp')!.addEventListener('click', () => { this.waypoint = null; this.setRoute(null); });
    document.getElementById('mapZoomIn')!.addEventListener('click', () => { this.mapView.scale = Math.min(2, this.mapView.scale * 1.4); });
    document.getElementById('mapZoomOut')!.addEventListener('click', () => { this.mapView.scale = Math.max(0.15, this.mapView.scale / 1.4); });
    this.setupMapInput();
  }
  show(on: boolean) { this.root.classList.toggle('hidden', !on); }

  // ------------------------------------------------------------- map image (2 m per px)
  private renderMapImage() {
    const S = 2048, k = S / SIZE; const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d')!;
    const img = c.createImageData(S / 4, S / 4); // zones at 8 m resolution, scaled up
    for (let j = 0; j < S / 4; j++) for (let i = 0; i < S / 4; i++) {
      const x = -HALF + (i + 0.5) * 8, z = -HALF + (j + 0.5) * 8; const zo = zoneAt(x, z);
      let col = [52, 60, 66];
      if (zo === Zone.Ocean || isWater(x, z)) col = [28, 70, 102]; else if (zo === Zone.Beach) col = [196, 178, 130]; else if (zo === Zone.Park || isParkBlockAt(x, z)) col = [62, 102, 58]; else if (zo === Zone.Rural) col = [78, 96, 60]; else if (zo === Zone.Swamp) col = [56, 74, 50]; else if (zo === Zone.Suburb) col = [70, 82, 70]; else if (zo === Zone.Airport) col = [70, 82, 64]; else if (zo === Zone.Industrial) col = [64, 64, 70]; else if (zo === Zone.Downtown) col = [70, 70, 80];
      const o = (j * (S / 4) + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S / 4; tmp.getContext('2d')!.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(tmp, 0, 0, S, S);
    const P = (x: number) => (x + HALF) * k;
    c.lineCap = 'square';
    for (const pass of [0, 1]) for (const e of EDGES) {
      const A = NODES[e.a], B = NODES[e.b];
      c.strokeStyle = pass === 0 ? '#1a1d22' : e.kind === 'highway' ? '#e8b84a' : e.kind === 'dirt' ? '#a08a62' : '#d8d8d0';
      c.lineWidth = (e.hw * 2 * k) + (pass === 0 ? 2 : 0) + (e.kind === 'highway' ? 1 : 0);
      c.beginPath(); c.moveTo(P(A.x), P(A.z)); c.lineTo(P(B.x), P(B.z)); c.stroke();
    }
    c.fillStyle = '#5a5e66'; c.fillRect(P(-1930), P(-1643), 860 * k, 46 * k);
    return cv;
  }
  private worldToMap(x: number, z: number) { return { x: (x + HALF) / SIZE * 2048, y: (z + HALF) / SIZE * 2048 }; }

  setRoute(x: number | null, z?: number) { if (x === null) { this.routeTarget = null; this.routePts = []; return; } this.routeTarget = { x, z: z! }; this.routeT = 0; }
  private updateRoute(dt: number) {
    const t = this.routeTarget ?? this.waypoint; if (!t) { this.routePts = []; return; }
    this.routeT -= dt; if (this.routeT > 0) return; this.routeT = 1.2;
    const P = this.g.player; this.routePts = route(P.x, P.z, t.x, t.z);
    if (this.waypoint && !this.routeTarget && Math.hypot(P.x - t.x, P.z - t.z) < 25) { this.waypoint = null; this.toast('You have arrived'); }
  }

  // ------------------------------------------------------------- per-frame
  update(dt: number) {
    const g = this.g, P = g.player;
    this.framesT += dt; this.updateRoute(dt);
    (this.el.hpb).style.width = `${(P.hp / P.maxHp) * 100}%`; this.el.arb.style.width = `${P.armor}%`; this.el.spb.style.width = `${P.special}%`;
    this.moneyShown += (g.economy.money - this.moneyShown) * Math.min(1, dt * 8); if (Math.abs(g.economy.money - this.moneyShown) < 1) this.moneyShown = g.economy.money;
    this.el.money.textContent = fmtMoney(this.moneyShown);
    const st = g.police.stars; const stars = this.el.stars.children; for (let i = 0; i < 5; i++) stars[i].classList.toggle('on', i < st); this.el.stars.classList.toggle('flash', g.police.searching); this.el.stars.style.display = st ? 'block' : 'none';
    const w = WEAPONS[P.weapon]; this.el.weapon.innerHTML = `<b>${w.name}</b>${w.kind === 'gun' ? ` &nbsp;${P.mag[w.id] ?? 0} / ${g.cheats.infAmmo ? '∞' : P.ammo[w.id] ?? 0}` : ''}${P.reloading > 0 ? ' · reloading' : ''}`;
    this.el.clock.textContent = `${fmtTime(g.env.hour)} · Day ${g.env.day} · ${WEATHER_LABEL[g.env.weather]}`;
    // place name
    const zn = g.interiorActive ? (g.interiors.active!.poi.name) : districtName(P.x, P.z); if (zn !== this.lastPlace) { this.lastPlace = zn; this.placeT = 5; }
    this.placeT -= dt; const pe = this.el.place; (pe.children[0] as HTMLElement).textContent = zn; (pe.children[1] as HTMLElement).textContent = g.interiorActive ? '' : streetName(P.x, P.z); pe.style.opacity = this.placeT > 0 || P.vehicle ? '1' : '0.55';
    // speedo
    const v = P.vehicle; this.el.speedo.style.display = v ? 'block' : 'none';
    if (v) { (this.el.speedo.children[0] as HTMLElement).textContent = String(Math.round(v.kmh)); this.el.gear.textContent = v.gear < 0 ? 'R' : String(v.gear); }
    // crosshair
    this.el.crosshair.style.display = P.aiming && w.kind === 'gun' && !g.phone.cameraMode ? 'block' : 'none'; this.el.crosshair.classList.toggle('lock', !!P.aimTarget);
    // context prompt
    const ctx = g.contextLabel(); const ce = this.el.ctx;
    if (ctx && !g.paused) { ce.style.display = 'block'; ce.innerHTML = `${document.body.classList.contains('touch') ? '' : '<kbd>E</kbd>'}${ctx}`; } else ce.style.display = 'none';
    g.touch.setContext(ctx);
    // subtitles & timers
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.subtitle.innerHTML = ''; }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.el.bigmsg.style.display = 'none'; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.style.display = 'none'; }
    this.el.damage.style.opacity = String(clamp(1 - P.hp / (P.maxHp * 0.35), 0, 0.8));
    // bubbles over heads
    for (const b of [...this.bubbles]) {
      b.t -= dt; const p = new THREE.Vector3(b.a.x, b.a.y + b.a.hum.height + 0.35, b.a.z).project(g.cam.cam);
      const d = Math.hypot(b.a.x - P.x, b.a.z - P.z);
      if (b.t <= 0 || b.a.dead || d > 40) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); continue; }
      b.el.style.display = p.z < 1 ? 'block' : 'none'; b.el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`; b.el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    }
    if (g.settings.showFps) { this.el.fps.style.display = 'block'; this.el.fps.textContent = `${Math.round(g.fps)} fps · ${g.q.name} · ${Math.round(g.dynScale * 100)}% · ${g.renderer.info.render.calls} calls`; } else this.el.fps.style.display = 'none';
    if (this.framesT > 1 / 30) { this.framesT = 0; this.drawMinimap(); }
    if (this.mapOpen) this.drawFullMap();
  }

  private blipList() {
    const g = this.g; const out: { x: number; z: number; color: string; icon?: string; label?: string; radius?: number }[] = [];
    for (const p of POIS) { const ic = POI_ICON[p.kind]; if (ic) out.push({ x: p.door.x, z: p.door.z, color: ic[1], icon: ic[0], label: p.name }); }
    for (const b of g.missions.blips()) out.push({ ...b, icon: b.color === '#ffd34d' ? '★' : b.color === '#4dd0ff' ? '●' : '●' });
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#ff4fe0', icon: '⬤' });
    for (const c of g.police.cars) if (g.police.stars) out.push({ x: c.x, z: c.z, color: (g.time * 4 | 0) % 2 ? '#ff3030' : '#3060ff', icon: '■' });
    for (const a of g.peds.list) if (!a.dead && (a.faction === 'enemy' || (a.faction === 'cop' && g.police.stars))) out.push({ x: a.x, z: a.z, color: a.faction === 'cop' ? '#5a8aff' : '#ff4d4d', icon: '•' });
    return out;
  }
  private drawMinimap() {
    const g = this.g, P = g.player, c = this.mini, S = 256, R = S / 2;
    const v = P.vehicle; const zoom = v ? clamp(1.6 - v.speed / 40, 0.8, 1.6) : 1.8; // map px per screen px
    const m = this.worldToMap(P.x, P.z); const rot = g.cam.yaw;
    c.save(); c.clearRect(0, 0, S, S); c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#1c3a50'; c.fillRect(0, 0, S, S);
    c.translate(R, R); c.rotate(rot); c.scale(zoom, zoom); c.translate(-m.x, -m.y);
    c.drawImage(this.mapImg, 0, 0);
    // search area
    if (g.police.stars && g.police.searching) { const s = this.worldToMap(g.police.lastSeen.x, g.police.lastSeen.z); c.fillStyle = (g.time * 3 | 0) % 2 ? 'rgba(255,40,40,0.18)' : 'rgba(40,80,255,0.18)'; c.beginPath(); c.arc(s.x, s.y, g.police.searchRadius / 2, 0, 7); c.fill(); }
    // GPS route
    if (this.routePts.length > 1) { c.strokeStyle = this.routeTarget ? '#ffd34d' : '#ff4fe0'; c.lineWidth = 5 / zoom; c.lineJoin = 'round'; c.beginPath(); this.routePts.forEach((p, i) => { const q = this.worldToMap(p.x, p.z); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.stroke(); }
    c.restore();
    // blips (unrotated icons placed at rotated positions)
    c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (const b of this.blipList()) {
      const q = this.worldToMap(b.x, b.z); let dx = (q.x - m.x) * zoom, dy = (q.y - m.y) * zoom; [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs];
      const d = Math.hypot(dx, dy); const edge = d > R - 12; if (edge && !(b.icon === '★' || b.color === '#ff4fe0' || b.color === '#ffd34d' || b.color === '#4dd0ff')) continue;
      if (edge) { dx *= (R - 12) / d; dy *= (R - 12) / d; }
      c.font = b.icon && b.icon.length > 1 ? '15px sans-serif' : 'bold 16px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = b.color; c.strokeStyle = '#000'; c.lineWidth = 3;
      if (b.icon === '•' || b.icon === '■') { c.fillRect(R + dx - 3, R + dy - 3, 6, 6); continue; }
      c.strokeText(b.icon ?? '●', R + dx, R + dy); c.fillText(b.icon ?? '●', R + dx, R + dy);
    }
    c.restore();
    // player arrow
    c.save(); c.translate(R, R); c.rotate(-(P.yaw) + rot + Math.PI); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
    // north marker
    c.save(); c.translate(R + Math.sin(rot) * -(R - 14) * -1, R - Math.cos(rot) * (R - 14)); c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', 0, 0); c.restore();
  }

  // ------------------------------------------------------------- full map
  openMap(on: boolean) {
    this.mapOpen = on; this.el.mapov.style.display = on ? 'block' : 'none';
    this.g.paused = on || this.g.menus?.isOpen(); if (on) { const P = this.g.player; this.mapView.cx = P.x; this.mapView.cz = P.z; this.g.audio.click(); }
  }
  private setupMapInput() {
    const cv = this.el.fullmap as HTMLCanvasElement; const pts = new Map<number, { x: number; y: number }>(); let moved = 0, pinch = 0;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      const k = 2048 / SIZE * this.mapView.scale;
      if (pts.size === 1) { this.mapView.cx -= dx / k; this.mapView.cz -= dy / k; }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) this.mapView.scale = clamp(this.mapView.scale * d / pinch, 0.15, 2); pinch = d; }
    });
    const up = (e: PointerEvent) => {
      if (pts.size === 1 && moved < 8) { const k = 2048 / SIZE * this.mapView.scale; const wx = this.mapView.cx + (e.clientX - innerWidth / 2) / k, wz = this.mapView.cz + (e.clientY - innerHeight / 2) / k; this.waypoint = { x: wx, z: wz }; this.routeT = 0; this.g.audio.click(); this.toast('GPS waypoint set'); }
      pts.delete(e.pointerId); pinch = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { this.mapView.scale = clamp(this.mapView.scale * (e.deltaY > 0 ? 0.85 : 1.18), 0.15, 2); }, { passive: true });
  }
  private drawFullMap() {
    const cv = this.el.fullmap as HTMLCanvasElement; if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    const c = this.full, k = this.mapView.scale, m = this.worldToMap(this.mapView.cx, this.mapView.cz);
    c.fillStyle = '#0e2a3e'; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, cv.height / 2); c.scale(k, k); c.translate(-m.x, -m.y); c.drawImage(this.mapImg, 0, 0);
    if (this.routePts.length > 1) { c.strokeStyle = this.routeTarget ? '#ffd34d' : '#ff4fe0'; c.lineWidth = 5 / k; c.beginPath(); this.routePts.forEach((p, i) => { const q = this.worldToMap(p.x, p.z); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.stroke(); }
    c.restore();
    const toS = (x: number, z: number) => { const q = this.worldToMap(x, z); return { x: (q.x - m.x) * k + cv.width / 2, y: (q.y - m.y) * k + cv.height / 2 }; };
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (k > 0.3) { c.font = 'italic 15px Georgia'; c.fillStyle = 'rgba(255,255,255,0.55)'; for (const [n, x, z] of [['Downtown Bahía', 448, -64], ['Coral Mile', 1250, -300], ['Palm Grove', 300, -1100], ['Port Lázaro', 800, 1150], ['Calle Verde', -200, 300], ['Palmetto Springs', -1540, -320], ['Gator Bend Bayou', -1300, 1300], ['Sawgrass Flats', -1300, -700], ['Bahía Verde Intl.', -1480, -1500], ['Sunline Beach', coastX(600) - 40, 600]] as [string, number, number][]) { const s = toS(x, z); c.fillText(n, s.x, s.y); } }
    for (const b of this.blipList()) { const s = toS(b.x, b.z); c.font = '16px sans-serif'; c.fillStyle = b.color; c.strokeStyle = '#000'; c.lineWidth = 3; if (b.icon === '•' || b.icon === '■') { c.fillRect(s.x - 3, s.y - 3, 6, 6); continue; } c.strokeText(b.icon ?? '●', s.x, s.y); c.fillText(b.icon ?? '●', s.x, s.y); if (k > 0.6 && b.label) { c.font = '11px sans-serif'; c.fillStyle = '#fff'; c.fillText(b.label, s.x, s.y + 14); } }
    const P = this.g.player, s = toS(P.x, P.z); c.save(); c.translate(s.x, s.y); c.rotate(-P.yaw + Math.PI); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
  }

  // ------------------------------------------------------------- feedback API
  toast(text: string, secs = 2.8) { const d = h(`<div class="toast">${text}</div>`); this.el.toasts.appendChild(d); while (this.el.toasts.children.length > 4) this.el.toasts.firstElementChild!.remove(); setTimeout(() => d.remove(), secs * 1000); }
  subtitle(who: string, text: string, ttl = 3) { if (!this.g.settings.subtitles) return; this.el.subtitle.innerHTML = who ? `<b>${who}:</b> ${text}` : text; this.subT = ttl; }
  objective(text: string) { this.el.objective.style.display = text ? 'block' : 'none'; this.el.objective.textContent = text; }
  timer(label: string, left: number) { const e = this.el.timer; if (!label) { e.style.display = 'none'; return; } e.style.display = 'block'; e.textContent = `${label} ${Math.max(0, Math.ceil(left))}s`; e.style.color = left < 10 ? '#ff4d4d' : '#fff'; }
  progress(f: number) { this.el.progress.style.display = f > 0 ? 'block' : 'none'; (this.el.progress.firstElementChild as HTMLElement).style.width = `${f * 100}%`; }
  bigMessage(title: string, sub: string, color = '#fff', secs = 3.5) { const b = this.el.bigmsg; (b.children[0] as HTMLElement).textContent = title; (b.children[0] as HTMLElement).style.color = color; (b.children[1] as HTMLElement).textContent = sub; b.style.display = 'block'; this.bigT = secs; }
  missionBanner(title: string, chapter: string) { const b = this.el.banner; (b.children[0] as HTMLElement).textContent = chapter; (b.children[1] as HTMLElement).textContent = title; b.style.display = 'block'; this.bannerT = 3.5; }
  moneyFx(n: number) { const e = this.el.moneyfx; e.textContent = `${n > 0 ? '+' : '−'}${fmtMoney(Math.abs(n))}`; e.style.color = n > 0 ? '#9ff0b5' : '#ff9a9a'; clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => (e.textContent = ''), 2200); }
  hitMarker(kill: boolean, head: boolean) { const e = this.el.hitmark; e.className = ''; void e.offsetWidth; e.className = 'on' + (kill || head ? ' kill' : ''); }
  damageFlash() { this.el.damage.style.opacity = '1'; }
  weaponChanged() { /* next update reflects */ }
  letterbox(on: boolean) { document.body.classList.toggle('letterbox', on); }
  bubble(a: Actor, text: string) { const old = this.bubbles.find((b) => b.a === a); if (old) { old.el.textContent = text; old.t = 3.5; return; } const el = h(`<div class="bubble"></div>`); el.textContent = text; this.el.bubbles.appendChild(el); this.bubbles.push({ a, el, t: 3.5 }); if (this.bubbles.length > 6) { const b = this.bubbles.shift()!; b.el.remove(); } }
  flashSwitch(name: string) { const e = this.el.switchfx; e.textContent = name; e.style.opacity = '1'; setTimeout(() => (e.style.opacity = '0'), 600); }
  async fade(on: boolean) { this.el.fade.classList.toggle('on', on); await new Promise((r) => setTimeout(r, 380)); }
  error(msg: string) { const e = this.el.err; if (!e) return; e.style.display = 'block'; e.textContent = '⚠ ' + msg.slice(0, 160); clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => (e.style.display = 'none'), 6000); }
  fatal(msg: string, reload = false) { const d = h(`<div class="overlay on" style="z-index:200"><div class="panel"><h2>Something went wrong</h2><div class="sub">${msg}</div><span class="btn primary" id="fatalBtn">${reload ? 'Reload' : 'OK'}</span></div></div>`); document.getElementById('ui')!.appendChild(d); d.querySelector('#fatalBtn')!.addEventListener('click', () => (reload ? location.reload() : d.remove())); }
  static AIRPORT = AIRPORT;
}
