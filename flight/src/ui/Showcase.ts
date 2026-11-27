// Live 3D menu background: a high-detail aircraft parked at a real airport with an orbiting camera.
import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Airport, airportByIcao } from '../data/world';
import { aircraftById, liveryById, defaultLivery } from '../data/aircraft';
import { buildAircraft, animateAircraft, AircraftParts } from '../aircraft/Model';
import { origin, DEG } from '../core/geo';
import { weatherById } from '../world/Weather';
import { layoutOf } from '../world/AirportLayout';

const SPOTS = ['KSFO', 'LOWI', 'EGLL', 'VHHH', 'NZQN', 'LSZH', 'KJFK', 'OMDB', 'TNCM', 'RJTT'];

export class Showcase {
  private parts: AircraftParts | null = null; private ap: Airport; private t = 0; private acId = 'a359'; private livery = 'house';
  private pos = new THREE.Vector3(); private hdg = 0; active = true; private ground = 0;
  constructor(private engine: Engine) {
    this.ap = airportByIcao.get(SPOTS[Math.floor(Math.random() * SPOTS.length)]) ?? airportByIcao.get('KSFO')!;
    this.setup();
  }
  private setup() {
    const ap = this.ap; const e = this.engine;
    origin.set(ap.lat, ap.lon);
    e.airports.clear(); const sc = e.airports.pin(ap);
    e.weather.set(weatherById('few')); e.weather.airportElevM = ap.elevM;
    e.setLocalTime(15.5, ap.lon); e.timeScale = 12;
    const L = layoutOf(ap);
    const p = L.apron.c; const off = L.apron.nrm;
    this.pos.set(sc.group.position.x + p[0] - off[0] * L.apron.depth * 0.25, ap.elevM, sc.group.position.z + p[1] - off[1] * L.apron.depth * 0.25);
    this.hdg = (Math.atan2(L.apron.dir[0], -L.apron.dir[1]) / DEG + 360) % 360;
    e.terrain.prefetch(ap.lat, ap.lon);
    this.setAircraft(this.acId, this.livery);
  }
  setAircraft(id: string, livery?: string) {
    this.acId = id; const spec = aircraftById(id); this.livery = livery ?? defaultLivery(spec);
    if (this.parts) { this.parts.root.removeFromParent(); this.parts.root.traverse(o => (o as THREE.Mesh).geometry?.dispose?.()); }
    this.parts = buildAircraft(spec, { lod: 'high', livery: liveryById(this.livery) });
    this.engine.scene.add(this.parts.root);
  }
  update(dt: number) {
    if (!this.active || !this.parts) return;
    this.t += dt;
    const spec = aircraftById(this.acId); const e = this.engine;
    const gh = e.terrain.heightAt(origin.latOf(this.pos.z), origin.lonOf(this.pos.x)).h;
    this.ground = Math.max(gh, this.ap.elevM) + 0.2;
    this.parts.root.position.set(this.pos.x, this.ground + spec.fuselageD / 2 + spec.gear.height - 0.15, this.pos.z);
    this.parts.root.rotation.set(0, -this.hdg * DEG, 0);
    animateAircraft(this.parts, { flap: 0.4 + 0.4 * Math.sin(this.t * 0.3), spoiler: 0, ail: Math.sin(this.t * 0.5) * 0.3, elev: Math.sin(this.t * 0.4) * 0.3, rud: Math.sin(this.t * 0.35) * 0.3, gear: 1, n1: [22, 22, 22, 22], dt, time: this.t,
      lights: { nav: true, beacon: true, strobe: false, landing: e.sky.night > 0.3, taxi: false, logo: true }, door: 1, steer: 0, wheelSpin: 0, night: e.sky.night, slats: 1, ga: spec.category === 'General Aviation' });
    const R = Math.max(spec.length, spec.span) * 0.95 + 8;
    const a = this.t * 0.07;
    const cam = e.camera;
    cam.position.set(this.pos.x + Math.sin(a) * R, this.ground + spec.height * 0.55 + 2 + Math.sin(this.t * 0.11) * spec.height * 0.25, this.pos.z + Math.cos(a) * R);
    cam.fov = 50; cam.near = 0.5; cam.aspect = innerWidth / innerHeight;
    if (innerWidth > 700) cam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.lookAt(this.parts.root.position.x, this.parts.root.position.y + spec.height * 0.05, this.parts.root.position.z);
    e.focus.copy(this.parts.root.position); e.focusVel.set(0, 0, 0);
    (e as any).shadowRadius = Math.max(spec.span, spec.length) * 0.8;
  }
  show(v: boolean) { this.active = v; if (this.parts) this.parts.root.visible = v; if (v) this.setup(); }
  hide() { this.active = false; this.engine.camera.clearViewOffset(); if (this.parts) { this.parts.root.removeFromParent(); this.parts = null; } }
}
