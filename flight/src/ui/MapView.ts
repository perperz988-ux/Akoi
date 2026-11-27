// Interactive 2D world map (Natural Earth countries, OurAirports airports, great-circle routes).
import { countries, airports, cities, Airport, Country, countryAt } from '../data/world';
import { gcInterp, wrap180 } from '../core/geo';

export class MapView {
  canvas: HTMLCanvasElement; g: CanvasRenderingContext2D;
  lon = 10; lat = 30; scale = 3; // px per degree
  selCountry: string | null = null; dep: Airport | null = null; arr: Airport | null = null;
  aircraft: { lat: number; lon: number; hdg: number } | null = null; routePts: { lat: number; lon: number }[] | null = null;
  onAirport: ((a: Airport) => void) | null = null; onCountry: ((c: Country) => void) | null = null; onPoint: ((lat: number, lon: number) => void) | null = null;
  private dpr = Math.min(2, devicePixelRatio || 1); private raf = 0; private dirty = true;
  constructor(parent: HTMLElement) {
    const c = this.canvas = document.createElement('canvas'); c.className = 'mapcanvas'; parent.appendChild(c); this.g = c.getContext('2d')!;
    const pts = new Map<number, { x: number; y: number }>(); let moved = 0; let pinchD = 0;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; pinchD = 0; });
    c.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY; const a = [...pts.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (pinchD) this.zoomAt(d / pinchD, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2); pinchD = d; moved += 10; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      this.lon = wrap180(this.lon - dx / this.scale); this.lat = Math.max(-80, Math.min(80, this.lat + dy / this.scale)); this.dirty = true;
    });
    const up = (e: PointerEvent) => { if (pts.size === 1 && moved < 6) this.tap(e.clientX, e.clientY); pts.delete(e.pointerId); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY); }, { passive: false });
    const loop = () => { this.raf = requestAnimationFrame(loop); if (this.dirty) { this.dirty = false; this.draw(); } };
    loop();
    new ResizeObserver(() => { this.dirty = true; }).observe(c);
  }
  destroy() { cancelAnimationFrame(this.raf); this.canvas.remove(); }
  invalidate() { this.dirty = true; }
  zoomAt(f: number, cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect(); const [la, lo] = this.unproject(cx - r.left, cy - r.top);
    this.scale = Math.max(1.2, Math.min(600, this.scale * f));
    const [nx, ny] = this.project(la, lo); this.lon = wrap180(this.lon + (nx - (cx - r.left)) / this.scale); this.lat = Math.max(-80, Math.min(80, this.lat - (ny - (cy - r.top)) / this.scale));
    this.dirty = true;
  }
  focus(lat: number, lon: number, scale?: number) { this.lat = lat; this.lon = lon; if (scale) this.scale = scale; this.dirty = true; }
  private size() { const r = this.canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; }
  project(lat: number, lon: number): [number, number] { const { w, h } = this.size(); return [w / 2 + wrap180(lon - this.lon) * this.scale, h / 2 - (lat - this.lat) * this.scale]; }
  unproject(x: number, y: number): [number, number] { const { w, h } = this.size(); return [this.lat - (y - h / 2) / this.scale, wrap180(this.lon + (x - w / 2) / this.scale)]; }
  private visibleAirports() { const min = this.scale > 40 ? 0 : this.scale > 9 ? 1 : 2; return airports.filter(a => a.size >= min); }
  private tap(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect(); const x = cx - r.left, y = cy - r.top;
    let best: Airport | null = null, bd = 16;
    for (const a of this.visibleAirports()) { const [px, py] = this.project(a.lat, a.lon); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = a; } }
    if (best) { this.onAirport?.(best); this.dirty = true; return; }
    const [la, lo] = this.unproject(x, y);
    this.onPoint?.(la, lo);
    const c = countryAt(la, lo); if (c) { this.selCountry = c.iso; this.onCountry?.(c); this.dirty = true; }
  }
  draw() {
    const c = this.canvas; const { w, h } = this.size(); if (!w) return;
    if (c.width !== Math.round(w * this.dpr)) { c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); }
    const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a1724'; g.fillRect(0, 0, w, h);
    // graticule
    g.strokeStyle = 'rgba(120,160,200,0.08)'; g.lineWidth = 1;
    const step = this.scale > 30 ? 1 : this.scale > 8 ? 5 : 15;
    for (let lo = -180; lo <= 180; lo += step) { const [x] = this.project(0, lo); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let la = -90; la <= 90; la += step) { const [, y] = this.project(la, 0); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // countries
    const [la0, lo0] = this.unproject(0, h), [la1, lo1] = this.unproject(w, 0);
    for (const ct of countries) {
      const b = ct.bbox; if (b[3] < la0 || b[1] > la1) continue;
      if (lo1 > lo0 && (b[2] < lo0 - 1 || b[0] > lo1 + 1) && w / this.scale < 300) continue;
      const sel = ct.iso === this.selCountry;
      g.fillStyle = sel ? '#2d4a5f' : '#1b2b38'; g.strokeStyle = sel ? '#7fc4ff' : 'rgba(140,175,205,0.35)'; g.lineWidth = sel ? 1.5 : 0.7;
      for (const r of ct.rings) {
        g.beginPath(); let px = 0;
        for (let i = 0; i < r.length; i += 2) { let [x, y] = this.project(r[i + 1], r[i]); if (i && Math.abs(x - px) > w * 0.5) { g.moveTo(x, y); } else i ? g.lineTo(x, y) : g.moveTo(x, y); px = x; }
        g.closePath(); g.fill(); g.stroke();
      }
    }
    // labels
    if (this.scale > 3.5) {
      g.fillStyle = 'rgba(200,220,235,0.55)'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
      for (const ct of countries) { const [x, y] = this.project(ct.label[1], ct.label[0]); if (x > 0 && x < w && y > 0 && y < h && (ct.bbox[2] - ct.bbox[0]) * this.scale > 60) g.fillText(ct.name.toUpperCase(), x, y); }
    }
    if (this.scale > 14) {
      g.fillStyle = 'rgba(235,240,245,0.75)'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'left';
      const minPop = this.scale > 60 ? 50000 : this.scale > 30 ? 300000 : 1000000;
      for (const ci of cities) { if (ci.pop < minPop) continue; const [x, y] = this.project(ci.lat, ci.lon); if (x < 0 || x > w || y < 0 || y > h) continue; g.fillRect(x - 1.5, y - 1.5, 3, 3); g.fillText(ci.name, x + 4, y - 3); }
    }
    // airports
    for (const a of this.visibleAirports()) {
      const [x, y] = this.project(a.lat, a.lon); if (x < -5 || x > w + 5 || y < -5 || y > h + 5) continue;
      const isSel = a === this.dep || a === this.arr;
      g.fillStyle = isSel ? (a === this.dep ? '#3dff7a' : '#ff4fd8') : a.size === 2 ? '#ffd27a' : a.size === 1 ? '#9fd0ff' : '#cfcfcf';
      const r = isSel ? 5 : a.size === 2 ? 2.6 : 1.8; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (this.scale > 25 || isSel) { g.fillStyle = isSel ? '#fff' : 'rgba(255,230,180,0.8)'; g.font = isSel ? 'bold 12px monospace' : '10px monospace'; g.fillText(a.icao, x + 5, y + 4); }
      if (this.scale > 90 && !isSel) { for (const rw of a.runways) { const [x1, y1] = this.project(rw.ends[0].lat, rw.ends[0].lon), [x2, y2] = this.project(rw.ends[1].lat, rw.ends[1].lon); g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); } }
    }
    // route
    const pts = this.routePts ?? (this.dep && this.arr ? Array.from({ length: 65 }, (_, i) => gcInterp(this.dep!.lat, this.dep!.lon, this.arr!.lat, this.arr!.lon, i / 64)) : null);
    if (pts) {
      g.strokeStyle = '#ff4fd8'; g.lineWidth = 2.5; g.beginPath(); let px = 0;
      pts.forEach((p, i) => { const [x, y] = this.project(p.lat, p.lon); if (i && Math.abs(x - px) > w * 0.5) g.moveTo(x, y); else i ? g.lineTo(x, y) : g.moveTo(x, y); px = x; }); g.stroke();
      if (this.routePts) { g.fillStyle = '#fff'; for (const p of this.routePts) { const [x, y] = this.project(p.lat, p.lon); g.fillRect(x - 2, y - 2, 4, 4); } }
    }
    if (this.aircraft) {
      const [x, y] = this.project(this.aircraft.lat, this.aircraft.lon);
      g.save(); g.translate(x, y); g.rotate(this.aircraft.hdg * Math.PI / 180); g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
    }
    g.fillStyle = 'rgba(190,210,225,0.6)'; g.font = '10px system-ui'; g.textAlign = 'right'; g.fillText('Natural Earth · OurAirports (public domain)', w - 8, h - 8);
  }
}
