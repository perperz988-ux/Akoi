// Flight planning: great-circle route with SID/STAR-style terminal fixes, en-route waypoints,
// semicircular-rule cruise altitude, top-of-climb/descent and time estimates.
import { Airport, RunwayEnd } from '../data/world';
import { AircraftSpec } from '../data/aircraft';
import { haversine, bearing, gcInterp, destination, NM, FT, KT, wrap360, hash2 } from '../core/geo';

export interface Waypoint { id: string; lat: number; lon: number; altFt: number; kind: 'rwy' | 'sid' | 'enr' | 'toc' | 'tod' | 'star' | 'iaf' | 'faf' | 'dest' }
export interface FlightPlan {
  dep: Airport; arr: Airport; depEnd: RunwayEnd; arrEnd: RunwayEnd;
  waypoints: Waypoint[]; distNm: number; gcNm: number; cruiseFt: number; initialHdg: number; eteSec: number; blockFuelKg: number;
}

const SYL = ['KA', 'LO', 'MI', 'RU', 'TE', 'SA', 'BO', 'NE', 'VI', 'GO', 'PA', 'DU', 'XO', 'RI', 'ZE', 'MU', 'TA', 'LE', 'NO', 'KI'];
export function fixName(lat: number, lon: number) {
  const h = hash2(Math.round(lat * 60), Math.round(lon * 60)); let x = Math.floor(h * 1e9);
  const a = SYL[x % 20]; x = Math.floor(x / 20); const b = SYL[x % 20]; x = Math.floor(x / 20);
  const c = 'BDGKLMNPRSTVX'[x % 13];
  return (a + b + c).slice(0, 5);
}

export function cruiseAltitude(ac: AircraftSpec, distNm: number, course: number) {
  if (ac.category === 'General Aviation') {
    const base = distNm < 30 ? 3500 : distNm < 80 ? 5500 : 8500;
    return course < 180 ? base + (base % 2000 === 1500 ? 0 : 1000) : base + (base % 2000 === 1500 ? 1000 : 0) - 0;
  }
  let alt = Math.min(ac.cruiseAltFt, Math.max(8000, distNm * 120 + 6000));
  if (distNm > 300) alt = ac.cruiseAltFt;
  let fl = Math.round(alt / 1000);
  // semicircular rule: east (000-179) odd FL, west even
  const east = course < 180; if ((fl % 2 === 1) !== east) fl -= 1;
  return Math.max(fl * 1000, 5000);
}

export function planFlight(dep: Airport, arr: Airport, depEnd: RunwayEnd, arrEnd: RunwayEnd, ac: AircraftSpec): FlightPlan {
  const wps: Waypoint[] = [];
  const gc = haversine(dep.lat, dep.lon, arr.lat, arr.lon) / NM;
  const course = bearing(dep.lat, dep.lon, arr.lat, arr.lon);
  const cruiseFt = cruiseAltitude(ac, gc, course);
  const ga = ac.category === 'General Aviation';
  const thrDep = { lat: depEnd.lat, lon: depEnd.lon };
  wps.push({ id: dep.icao + ' ' + depEnd.ident, lat: thrDep.lat, lon: thrDep.lon, altFt: dep.elevFt, kind: 'rwy' });
  // SID: runway heading climb-out then turn
  const sidDist = Math.min(ga ? 3 : 8, gc * 0.15) * NM;
  const sid = destination(depEnd.lat, depEnd.lon, depEnd.hdg, sidDist + (depEnd.rwy?.lengthM ?? 0));
  wps.push({ id: fixName(sid.lat, sid.lon), ...sid, altFt: dep.elevFt + (ga ? 2000 : 5000), kind: 'sid' });
  // approach: IAF & FAF on extended centreline of arrival runway
  const appHdg = arrEnd.hdg;
  const fafD = (ga ? 4 : 6) * NM, iafD = (ga ? 8 : 15) * NM;
  const faf = destination(arrEnd.lat, arrEnd.lon, wrap360(appHdg + 180), fafD);
  const iaf = destination(arrEnd.lat, arrEnd.lon, wrap360(appHdg + 180), iafD);
  // en-route
  const startE = wps[1]; const endE = iaf;
  const enrNm = haversine(startE.lat, startE.lon, endE.lat, endE.lon) / NM;
  const legNm = ga ? 25 : enrNm > 2000 ? 300 : enrNm > 600 ? 150 : 60;
  const nLeg = Math.max(1, Math.round(enrNm / legNm));
  const climbNm = ga ? (cruiseFt - dep.elevFt) / 700 * (ac.cruiseKtas * 0.8 / 60) : (cruiseFt / 1000) * 2.2;
  const descNm = ga ? (cruiseFt - arr.elevFt) / 500 * (ac.cruiseKtas / 60) : (cruiseFt - arr.elevFt) / 1000 * 3;
  for (let i = 1; i < nLeg; i++) {
    const p = gcInterp(startE.lat, startE.lon, endE.lat, endE.lon, i / nLeg);
    wps.push({ id: fixName(p.lat, p.lon), lat: p.lat, lon: p.lon, altFt: cruiseFt, kind: 'enr' });
  }
  wps.push({ id: fixName(iaf.lat, iaf.lon), ...iaf, altFt: arr.elevFt + (ga ? 2000 : 4000), kind: 'iaf' });
  wps.push({ id: fixName(faf.lat, faf.lon), ...faf, altFt: arr.elevFt + (ga ? 1300 : 1900), kind: 'faf' });
  wps.push({ id: arr.icao + ' ' + arrEnd.ident, lat: arrEnd.lat, lon: arrEnd.lon, altFt: arr.elevFt, kind: 'dest' });
  // assign climb/descent profile altitudes to en-route fixes
  let cum = 0; const cumD: number[] = [0];
  for (let i = 1; i < wps.length; i++) { cum += haversine(wps[i - 1].lat, wps[i - 1].lon, wps[i].lat, wps[i].lon) / NM; cumD.push(cum); }
  const total = cum;
  for (let i = 1; i < wps.length; i++) if (wps[i].kind === 'enr') {
    const d = cumD[i];
    const climbAlt = dep.elevFt + (cruiseFt - dep.elevFt) * Math.min(1, d / Math.max(1, climbNm));
    const descAlt = arr.elevFt + (cruiseFt - arr.elevFt) * Math.min(1, (total - d) / Math.max(1, descNm));
    wps[i].altFt = Math.round(Math.min(cruiseFt, climbAlt, descAlt) / 100) * 100;
  }
  // time: climb at ~75% cruise TAS, cruise TAS, descent ~80%
  const cr = Math.min(climbNm, total * 0.45), de = Math.min(descNm, total * 0.45), cz = Math.max(0, total - cr - de);
  const tas = ac.cruiseKtas;
  const ete = (cr / (tas * 0.72) + cz / tas + de / (tas * 0.78)) * 3600 + (ga ? 120 : 600);
  const burn = ac.tsfc * (ac.mtow * 9.81 / 17) * (ete / 3600) * (ga ? 0 : 1) + (ga ? 32 * ete / 3600 : 0);
  return { dep, arr, depEnd, arrEnd, waypoints: wps, distNm: total, gcNm: gc, cruiseFt, initialHdg: depEnd.hdg, eteSec: ete, blockFuelKg: burn * 1.15 + (ga ? 20 : ac.mtow * 0.02) };
}

export { FT, KT };
