import * as L from '../world/CityLayout';
import { District } from '../world/CityLayout';
import type { Blip } from '../world/Markers';

const SIZE = 1024; // base map px for the 3200 m world
const S = SIZE / (L.HALF * 2);
const DCOL: Partial<Record<District, string>> = {
  [District.Downtown]: '#2b3140', [District.Midtown]: '#272d3a', [District.Luxury]: '#2a3a33', [District.Resort]: '#36322e', [District.Beach]: '#6d6248',
  [District.Suburb]: '#24372a', [District.Poor]: '#33292b', [District.Industrial]: '#2e2e32', [District.Shopping]: '#3a3342', [District.Airport]: '#2f3a2d',
  [District.Rural]: '#2f3b25', [District.Park]: '#2f5a33', [District.River]: '#16446a', [District.Ocean]: '#0f3556', [District.Marina]: '#6d6248', [District.Island]: '#2f5a4a',
};

/** Pre-renders the whole city once; minimap & full map just blit parts of it. */
export class MapRender {
  base: HTMLCanvasElement;
  constructor() {
    const c = this.base = document.createElement('canvas'); c.width = c.height = SIZE;
    const g = c.getContext('2d')!;
    const cell = 8; // sample px
    for (let py = 0; py < SIZE; py += cell) for (let px = 0; px < SIZE; px += cell) {
      const x = px / S - L.HALF, z = py / S - L.HALF;
      const water = L.groundY(x + 4 / S, z + 4 / S) < -0.5;
      g.fillStyle = water ? '#0f3a5e' : (DCOL[L.districtAt(x + 4 / S, z + 4 / S)] ?? '#2a2f3a');
      g.fillRect(px, py, cell, cell);
    }
    // roads
    g.lineCap = 'butt';
    for (let i = 0; i <= L.N; i++) for (let j = 0; j <= L.N; j++) {
      const x = (L.lineCoord(i) + L.HALF) * S, z = (L.lineCoord(j) + L.HALF) * S;
      if (L.vSegment(i, j)) { g.strokeStyle = L.isHighway('x', i) ? '#e7b04a' : '#9aa4b4'; g.lineWidth = L.isHighway('x', i) ? 3.2 : 1.9; g.beginPath(); g.moveTo(x, z); g.lineTo(x, z + L.CELL * S); g.stroke(); }
      if (L.hSegment(i, j)) { g.strokeStyle = L.isHighway('z', j) ? '#e7b04a' : '#9aa4b4'; g.lineWidth = L.isHighway('z', j) ? 3.2 : 1.9; g.beginPath(); g.moveTo(x, z); g.lineTo(x + L.CELL * S, z); g.stroke(); }
    }
    // runways
    g.strokeStyle = '#d0d4da'; g.lineWidth = 5; g.beginPath(); g.moveTo((-1600 + L.HALF) * S, (-1480 + L.HALF) * S); g.lineTo((-900 + L.HALF) * S, (-1480 + L.HALF) * S); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
    for (const [name, x, z] of [['DOWNTOWN', 250, -150], ['BELLAVISTA', 1000, -700], ['OCEAN MILE', 1100, 250], ['PALM HOLLOW', -750, -450], ['IRONSIDE', -700, 900], ['SALTWORKS', 450, 1250], ['GALLERIA', 150, 700], ['AIRPORT', -1250, -1250], ['CYPRESS FLATS', -1400, 300], ['MIDTOWN', -150, 150], ['CORAL KEY', 1400, -500]] as [string, number, number][]) g.fillText(name, (x + L.HALF) * S, (z + L.HALF) * S);
  }

  /** Draw a circular, player-centred, heading-up minimap. */
  drawMini(ctx: CanvasRenderingContext2D, size: number, px: number, pz: number, yaw: number, blips: Blip[], route: { x: number; z: number }[], zoomM: number, cops: { x: number; z: number }[], enemies: { x: number; z: number }[]) {
    const half = size / 2;
    const scale = size / (zoomM * 2);   // px per metre
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(half, half, half - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, size, size);
    ctx.translate(half, half); ctx.rotate(yaw + Math.PI); // heading-up: forward maps to screen up
    const s = scale / S; // base px -> screen px
    ctx.drawImage(this.base, -(px + L.HALF) * S * s, -(pz + L.HALF) * S * s, SIZE * s, SIZE * s);
    // route
    if (route.length > 1) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); route.forEach((p, i) => { const x = (p.x - px) * scale, y = (p.z - pz) * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
    const dot = (x: number, z: number, col: string, r: number, ring = false) => {
      let dx = (x - px) * scale, dy = (z - pz) * scale; const d = Math.hypot(dx, dy), lim = half - 8;
      if (d > lim) { dx = dx / d * lim; dy = dy / d * lim; }
      ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(dx, dy, d > lim ? r * 0.8 : r, 0, 6.28); ctx.fill(); if (ring) ctx.stroke(); else ctx.stroke();
    };
    for (const b of blips) { const d = Math.hypot(b.x - px, b.z - pz); if (d > zoomM * 5 && b.kind !== 'waypoint' && b.kind !== 'mission') continue; dot(b.x, b.z, b.color, b.kind === 'waypoint' ? 6 : 5, true); }
    for (const c of cops) dot(c.x, c.z, '#4d8dff', 3.5);
    for (const c of enemies) dot(c.x, c.z, '#ff4d4d', 3.2);
    ctx.restore();
    // player arrow (always up)
    ctx.save(); ctx.translate(half, half); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(half, half, half - 1, 0, 6.28); ctx.stroke();
  }

  /** Full-map draw with pan/zoom: view = {cx,cz,mpp (metres per px)} */
  drawFull(ctx: CanvasRenderingContext2D, w: number, h: number, view: { cx: number; cz: number; mpp: number }, px: number, pz: number, yaw: number, blips: Blip[], route: { x: number; z: number }[]) {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#081019'; ctx.fillRect(0, 0, w, h);
    const k = 1 / view.mpp; // px per metre
    const s = k / S;
    ctx.save(); ctx.translate(w / 2, h / 2);
    ctx.drawImage(this.base, (-L.HALF - view.cx) * k * 1 - 0 + (L.HALF - L.HALF) , (-L.HALF - view.cz) * k, L.HALF * 2 * k, L.HALF * 2 * k);
    void s;
    if (route.length > 1) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.beginPath(); route.forEach((p, i) => { const x = (p.x - view.cx) * k, y = (p.z - view.cz) * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    for (const b of blips) {
      const x = (b.x - view.cx) * k, y = (b.z - view.cz) * k;
      ctx.fillStyle = b.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, b.kind === 'mission' ? 8 : 6, 0, 6.28); ctx.fill(); ctx.stroke();
      if (b.icon) { ctx.fillStyle = '#111'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(b.icon, x, y + 3.5); ctx.textAlign = 'left'; ctx.font = '11px sans-serif'; }
      if (view.mpp < 3.2 || b.kind === 'mission' || b.kind === 'waypoint') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(b.label, x + 9, y + 4); ctx.fillText(b.label, x + 9, y + 4); }
    }
    const ppx = (px - view.cx) * k, ppz = (pz - view.cz) * k;
    ctx.translate(ppx, ppz); ctx.rotate(-yaw); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(7, -8); ctx.lineTo(0, -3); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
