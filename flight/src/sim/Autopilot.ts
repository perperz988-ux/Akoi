// Autopilot / autothrottle: HDG, LNAV (flight-plan legs), ALT hold, V/S, SPD and approach
// (localizer + 3° glideslope to the planned arrival runway, with autoland flare).
import { FlightModel } from './FlightModel';
import { FlightPlan } from './Route';
import { origin, haversine, bearing, crossTrack, wrap180, clamp, DEG, KT, FT, NM, G0 } from '../core/geo';

export type LatMode = 'HDG' | 'LNAV' | 'LOC' | 'ROLL';
export type VertMode = 'ALT' | 'VS' | 'GS' | 'FLARE' | 'PITCH';

export class Autopilot {
  engaged = false; athr = false;
  lat: LatMode = 'HDG'; vert: VertMode = 'ALT';
  hdg = 0; altFt = 5000; vsFpm = 0; spdKt = 250;
  appArmed = false; locCaptured = false; gsCaptured = false;
  plan: FlightPlan | null = null; active = 1;
  private thrInt = 0; msg = '';
  constructor(private fm: FlightModel) {}

  engage(on = !this.engaged) {
    this.engaged = on;
    const st = this.fm.st;
    if (on) {
      this.hdg = Math.round(st.heading); this.altFt = Math.round(st.altMSL / FT / 100) * 100;
      if (Math.abs(st.vs) > 2) { this.vert = 'VS'; this.vsFpm = Math.round(st.vs / FT * 60 / 100) * 100; } else this.vert = 'ALT';
      if (this.plan && this.lat !== 'LOC') this.lat = 'LNAV';
    } else { this.fm.apCmd.pitchRate = null; this.fm.apCmd.rollRate = null; this.appArmed = false; this.locCaptured = this.gsCaptured = false; }
  }
  setAthr(on = !this.athr) { this.athr = on; if (on) this.spdKt = Math.round(this.fm.st.ias / KT); else this.fm.apThrottle = null; this.thrInt = 0; }

  activeLeg() {
    if (!this.plan) return null;
    const w = this.plan.waypoints; const i = clamp(this.active, 1, w.length - 1);
    return { from: w[i - 1], to: w[i], idx: i };
  }

  update(dt: number) {
    const fm = this.fm, st = fm.st;
    const lat = origin.latOf(fm.pos.z), lon = origin.lonOf(fm.pos.x);
    // waypoint sequencing (always, so ND shows progress even when hand flying)
    if (this.plan) {
      const w = this.plan.waypoints;
      while (this.active < w.length - 1) {
        const to = w[this.active];
        const d = haversine(lat, lon, to.lat, to.lon);
        const turnR = Math.max(1500, (st.gs * st.gs) / (G0 * Math.tan(25 * DEG)));
        const leg = this.activeLeg()!; const ct = crossTrack(leg.from.lat, leg.from.lon, to.lat, to.lon, lat, lon);
        const legLen = haversine(leg.from.lat, leg.from.lon, to.lat, to.lon);
        if (d < turnR || ct.at > legLen) this.active++; else break;
      }
    }
    if (!this.engaged) { if (this.athr) this.autothrottle(dt); return; }
    if (st.weightOnWheels && st.gs < 30) { this.engage(false); this.msg = 'AP DISCONNECT'; return; }
    const V = Math.max(30, st.tas);
    // ---------- lateral ----------
    let bankCmd = 0; const maxBank = 25;
    let course = this.hdg;
    const arr = this.plan?.arrEnd;
    if (this.appArmed && arr && !this.locCaptured) {
      const far = { lat: arr.other!.lat, lon: arr.other!.lon };
      const ct = crossTrack(arr.lat, arr.lon, far.lat, far.lon, lat, lon);
      const dist = haversine(lat, lon, arr.lat, arr.lon);
      const hdgErr = Math.abs(wrap180(st.track - arr.hdg));
      if (Math.abs(ct.xt) < 2500 && hdgErr < 60 && dist < 30 * NM && ct.at < 0) { this.locCaptured = true; this.lat = 'LOC'; this.msg = 'LOC CAPTURED'; }
    }
    if (this.lat === 'LOC' && arr) {
      const ct = crossTrack(arr.other!.lat, arr.other!.lon, arr.lat, arr.lon, lat, lon); // course from far end towards threshold reversed
      const ct2 = crossTrack(arr.lat, arr.lon, arr.other!.lat, arr.other!.lon, lat, lon);
      const xt = ct2.xt; void ct;
      const intercept = clamp(-xt / 35, -30, 30);
      course = arr.hdg + intercept;
    } else if (this.lat === 'LNAV' && this.plan) {
      const leg = this.activeLeg()!;
      const ct = crossTrack(leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon, lat, lon);
      const dtk = bearing(lat, lon, leg.to.lat, leg.to.lon);
      const legBrg = bearing(leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon);
      const intercept = clamp(-ct.xt / Math.max(300, V * 12) * 45, -45, 45);
      course = haversine(lat, lon, leg.to.lat, leg.to.lon) < 3000 ? dtk : legBrg + intercept;
    }
    const trkErr = wrap180(course - st.track);
    bankCmd = clamp(trkErr * 1.6, -maxBank, maxBank);
    if (this.lat === 'LOC') bankCmd = clamp(trkErr * 2.0, -20, 20);
    fm.apCmd.rollRate = clamp((bankCmd - st.bank) * 0.6, -6, 6) * DEG;

    // ---------- vertical ----------
    const altM = st.altMSL;
    let vsCmd = 0; // m/s
    const tgtAltM = this.altFt * FT;
    if (this.appArmed && this.locCaptured && arr && !this.gsCaptured) {
      const dist = haversine(lat, lon, arr.lat, arr.lon);
      const gsAlt = this.plan!.arr.elevM + 15 + Math.tan(3 * DEG) * dist;
      if (altM >= gsAlt - 30 && dist < 20 * NM) { this.gsCaptured = true; this.vert = 'GS'; this.msg = 'G/S CAPTURED'; }
    }
    if (this.vert === 'GS' && arr) {
      const dist = haversine(lat, lon, arr.lat, arr.lon);
      const elev = this.plan!.arr.elevM;
      const gsAlt = elev + 15 + Math.tan(3 * DEG) * dist;
      vsCmd = -st.gs * Math.tan(3 * DEG) + clamp((gsAlt - altM) * 0.08, -4, 4);
      if (st.agl < 15) { this.vert = 'FLARE'; this.msg = 'FLARE'; }
    }
    if (this.vert === 'FLARE') { vsCmd = -Math.max(0.6, st.agl * 0.12); if (this.athr) { this.spdKt = 0; } }
    else if (this.vert === 'ALT') vsCmd = clamp((tgtAltM - altM) * 0.06, -12, 12);
    else if (this.vert === 'VS') {
      vsCmd = this.vsFpm * FT / 60;
      if ((this.vsFpm > 0 && altM >= tgtAltM - 60) || (this.vsFpm < 0 && altM <= tgtAltM + 60)) { this.vert = 'ALT'; this.msg = 'ALT CAPTURED'; }
    }
    // speed protection in climb
    if (vsCmd > 0 && st.ias / KT < this.spdKt - 15 && this.vert !== 'GS') vsCmd *= clamp(1 - (this.spdKt - 15 - st.ias / KT) / 20, 0.1, 1);
    const gammaCmd = Math.asin(clamp(vsCmd / V, -0.3, 0.3)) / DEG;
    const gamma = Math.asin(clamp(st.vs / V, -1, 1)) / DEG;
    const pitchCmd = clamp(st.pitch + (gammaCmd - gamma) * 1.0, -12, 20);
    fm.apCmd.pitchRate = clamp((pitchCmd - st.pitch) * 0.5, -3, 3) * DEG;
    if (this.athr) this.autothrottle(dt);
  }

  private autothrottle(dt: number) {
    const fm = this.fm, st = fm.st;
    if (this.vert === 'FLARE' && st.agl < 10) { fm.apThrottle = 0; if (st.weightOnWheels) { this.setAthr(false); fm.ctl.throttle.fill(0); } return; }
    const err = this.spdKt - st.ias / KT;
    this.thrInt = clamp(this.thrInt + err * dt * 0.01, -0.5, 0.8);
    const base = fm.apThrottle ?? fm.ctl.throttle[0];
    const tgt = clamp(0.45 + err * 0.03 + this.thrInt + Math.sin(st.pitch * DEG) * 1.5, 0, 1);
    fm.apThrottle = base + clamp(tgt - base, -dt * 0.25, dt * 0.25);
  }
}
