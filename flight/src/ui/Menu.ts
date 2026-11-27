// Aviation-style menus. Every option leads to a working screen or starts a real flight.
import { AIRCRAFT, aircraftById, LIVERIES, defaultLivery, AircraftSpec } from '../data/aircraft';
import { airports, airportByIcao, cities, countryNames, countryName, Airport, RunwayEnd, nearestAirports } from '../data/world';
import { WEATHER, weatherById } from '../world/Weather';
import { bestRunwayEnd } from '../world/AirportLayout';
import { planFlight } from '../sim/Route';
import { MapView } from './MapView';
import { FlightConfig } from '../sim/Flight';
import { CAREER, CHALLENGES } from '../game/Modes';
import { settings, saveSettings, career, resetCareer, isTouch } from '../game/Save';
import { haversine, fmtTime, NM, FT } from '../core/geo';
import { Showcase } from './Showcase';
import { Engine } from '../core/Engine';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ftm = (m: number) => `${Math.round(m).toLocaleString()} m / ${Math.round(m / FT).toLocaleString()} ft`;

interface Draft { dep: Airport | null; depEnd: RunwayEnd | null; arr: Airport | null; arrEnd: RunwayEnd | null; aircraft: string; livery: string; weather: string; dynamic: boolean; hour: number; spawn: FlightConfig['spawn']; fuel: number; payload: number }

export class Menu {
  root: HTMLElement; private mapv: MapView | null = null;
  draft: Draft = { dep: airportByIcao.get('KSFO') ?? null, depEnd: null, arr: airportByIcao.get('KLAX') ?? null, arrEnd: null, aircraft: 'a20n', livery: 'house', weather: 'few', dynamic: false, hour: 10, spawn: 'gate', fuel: 0.6, payload: 0.6 };
  constructor(parent: HTMLElement, private engine: Engine, public showcase: Showcase, private start: (cfg: FlightConfig) => void, private applySettings: () => void) {
    this.root = document.createElement('div'); this.root.className = 'menu'; parent.appendChild(this.root);
    this.main();
  }
  show() { this.root.style.display = ''; this.main(); }
  hide() { this.root.style.display = 'none'; this.mapv?.destroy(); this.mapv = null; }
  private screen(title: string, body: string, back = true, cls = '') {
    this.mapv?.destroy(); this.mapv = null;
    this.root.innerHTML = `<div class="scr ${cls}"><header>${back ? '<button class="back" data-back>‹ BACK</button>' : ''}<h1>${title}</h1><div class="hdr-r">CREDITS <b>${career.credits.toLocaleString()}</b></div></header><div class="body">${body}</div></div>`;
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.main());
    return this.root.querySelector('.body') as HTMLElement;
  }
  private on(sel: string, ev: string, fn: (e: Event, el: HTMLElement) => void) { this.root.querySelectorAll<HTMLElement>(sel).forEach(el => el.addEventListener(ev, e => fn(e, el))); }

  // ---------------- MAIN ----------------
  main() {
    this.mapv?.destroy(); this.mapv = null;
    this.root.innerHTML = `<div class="mainmenu">
      <div class="brand"><div class="logo">SKYWARD</div><div class="tag">FLIGHT SIMULATOR</div><div class="sub">${airports.length.toLocaleString()} real airports · ${Object.keys(countryNames).length} countries · real-world elevation</div></div>
      <nav>
        <button data-go="free"><b>FREE FLIGHT</b><span>Any aircraft, airport, destination, weather and time</span></button>
        <button data-go="career"><b>CAREER</b><span>${Object.keys(career.completed).length}/${CAREER.length} flights completed</span></button>
        <button data-go="challenge"><b>LANDING CHALLENGES</b><span>Fog, storms, crosswinds, mountains</span></button>
        <button data-go="explore"><b>WORLD EXPLORATION</b><span>Fly freely anywhere on Earth</span></button>
        <button data-go="map"><b>WORLD MAP</b><span>Browse countries, cities, airports and routes</span></button>
        <button data-go="aircraft"><b>AIRCRAFT</b><span>${AIRCRAFT.length} aircraft — specs & liveries</span></button>
        <button data-go="airports"><b>AIRPORTS</b><span>Search the airport database</span></button>
        <button data-go="settings"><b>SETTINGS</b><span>Graphics, controls, audio</span></button>
      </nav>
      <footer>Elevation: Mapzen/AWS Terrain Tiles (SRTM, GMTED, ETOPO1) · Vector data: Natural Earth · Airports: OurAirports</footer>
    </div>`;
    this.on('[data-go]', 'click', (_e, el) => (this as any)[el.dataset.go!]());
  }

  // ---------------- FREE FLIGHT ----------------
  free() {
    const d = this.draft;
    if (d.dep && !d.depEnd) d.depEnd = bestRunwayEnd(d.dep, weatherById(d.weather).windDir, weatherById(d.weather).windKt);
    if (d.arr && !d.arrEnd) d.arrEnd = bestRunwayEnd(d.arr, weatherById(d.weather).windDir, weatherById(d.weather).windKt);
    const body = this.screen('FREE FLIGHT', `
      <div class="ff">
        <section class="col">
          <h3>1 · DEPARTURE</h3><div class="picker" data-pick="dep"></div>
          <h3>RUNWAY & START POSITION</h3>
          <div class="row wrap"><select data-rwy="dep"></select>
          <select data-spawn>${[['gate', 'Gate (cold & dark, taxi)'], ['runway', 'Runway — ready for takeoff'], ['approach', 'Final approach (destination)'], ['cruise', 'Cruise (en route)']].map(([v, l]) => `<option value="${v}" ${d.spawn === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <h3>2 · AIRCRAFT</h3>
          <div class="acgrid">${AIRCRAFT.map(a => `<button class="accard ${a.id === d.aircraft ? 'on' : ''}" data-ac="${a.id}"><b>${a.name}</b><span>${a.category} · ${a.cruiseKtas} KTAS · ${a.rangeNm.toLocaleString()} NM</span></button>`).join('')}</div>
          <div class="row wrap"><label>Livery <select data-livery>${LIVERIES.map(l => `<option value="${l.id}" ${l.id === d.livery ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
          <label>Fuel <input type="range" min="0.1" max="1" step="0.05" value="${d.fuel}" data-fuel> <span data-fuelv>${Math.round(d.fuel * 100)}%</span></label>
          <label>Payload <input type="range" min="0" max="1" step="0.05" value="${d.payload}" data-payload> <span data-payv>${Math.round(d.payload * 100)}%</span></label></div>
        </section>
        <section class="col">
          <h3>3 · DESTINATION</h3><div class="picker" data-pick="arr"></div>
          <div class="row wrap"><select data-rwy="arr"></select><button class="btn small" data-local>Local flight (no destination)</button></div>
          <h3>4 · WEATHER</h3>
          <div class="chips">${WEATHER.map(w => `<button class="chip ${w.id === d.weather ? 'on' : ''}" data-wx="${w.id}" title="${esc(w.desc)}">${w.name}</button>`).join('')}<button class="chip ${d.dynamic ? 'on' : ''}" data-dyn>Dynamic</button></div>
          <div class="wxdesc" data-wxd>${esc(weatherById(d.weather).desc)}</div>
          <h3>5 · TIME OF DAY (LOCAL)</h3>
          <div class="row"><input type="range" min="0" max="24" step="0.25" value="${d.hour}" data-hour><b data-hourv>${clock(d.hour)}</b></div>
          <div class="chips">${[['Dawn', 6], ['Morning', 9], ['Noon', 12.5], ['Sunset', 18.6], ['Dusk', 19.6], ['Night', 23]].map(([l, h]) => `<button class="chip" data-hq="${h}">${l}</button>`).join('')}</div>
        </section>
        <section class="col summary"><h3>ROUTE</h3><div data-sum></div><button class="btn primary big" data-start>START FLIGHT</button><button class="btn" data-openmap>PICK ON WORLD MAP</button></section>
      </div>`);
    this.picker(body.querySelector('[data-pick="dep"]')!, d.dep, a => { d.dep = a; d.depEnd = bestRunwayEnd(a, weatherById(d.weather).windDir, weatherById(d.weather).windKt); fillRwy(); summary(); });
    this.picker(body.querySelector('[data-pick="arr"]')!, d.arr, a => { d.arr = a; d.arrEnd = bestRunwayEnd(a, weatherById(d.weather).windDir, weatherById(d.weather).windKt); fillRwy(); summary(); });
    const fillRwy = () => {
      for (const k of ['dep', 'arr'] as const) {
        const sel = body.querySelector<HTMLSelectElement>(`[data-rwy="${k}"]`)!; const ap = d[k]; const cur = k === 'dep' ? d.depEnd : d.arrEnd;
        sel.innerHTML = ap ? ap.runways.flatMap(r => r.ends.map(e => `<option value="${e.ident}" ${e === cur ? 'selected' : ''}>RWY ${e.ident} · ${Math.round(e.hdg)}°T · ${Math.round(r.lengthM)} m</option>`)).join('') : '<option>—</option>';
        sel.onchange = () => { const e = ap!.runways.flatMap(r => r.ends).find(x => x.ident === sel.value)!; if (k === 'dep') d.depEnd = e; else d.arrEnd = e; summary(); };
      }
    };
    const summary = () => {
      const el = body.querySelector('[data-sum]')!; const ac = aircraftById(d.aircraft);
      if (!d.dep || !d.depEnd) { el.innerHTML = '<p>Select a departure airport.</p>'; return; }
      if (!d.arr || !d.arrEnd) { el.innerHTML = `<p><b>${d.dep.icao}</b> local flight from runway ${d.depEnd.ident}.</p>`; return; }
      const p = planFlight(d.dep, d.arr, d.depEnd, d.arrEnd, ac);
      const range = p.distNm > ac.rangeNm ? `<p class="warn">Distance exceeds the ${ac.name} range (${ac.rangeNm} NM).</p>` : '';
      el.innerHTML = `<table class="kv">
        <tr><td>Departure</td><td><b>${d.dep.icao}</b> ${esc(d.dep.name)} — RWY ${d.depEnd.ident}</td></tr>
        <tr><td>Destination</td><td><b>${d.arr.icao}</b> ${esc(d.arr.name)} — RWY ${d.arrEnd.ident}</td></tr>
        <tr><td>Great-circle</td><td>${Math.round(p.gcNm).toLocaleString()} NM (${Math.round(p.gcNm * 1.852).toLocaleString()} km)</td></tr>
        <tr><td>Route distance</td><td>${Math.round(p.distNm).toLocaleString()} NM</td></tr>
        <tr><td>Cruise altitude</td><td>${p.cruiseFt >= 18000 ? 'FL' + Math.round(p.cruiseFt / 100) : p.cruiseFt.toLocaleString() + ' ft'}</td></tr>
        <tr><td>Initial heading</td><td>${Math.round(p.initialHdg)}° true</td></tr>
        <tr><td>Est. flight time</td><td>${fmtTime(p.eteSec)}</td></tr>
        <tr><td>Cruise speed</td><td>${ac.category === 'General Aviation' ? ac.cruiseKtas + ' KTAS' : 'M' + ac.cruiseMach.toFixed(2) + ' (' + ac.cruiseKtas + ' KTAS)'}</td></tr>
      </table>${range}<div class="wps">${p.waypoints.map(w => `<span class="wp ${w.kind}">${w.id}<small>${w.kind === 'enr' ? (w.altFt >= 18000 ? 'FL' + Math.round(w.altFt / 100) : w.altFt) : w.kind.toUpperCase()}</small></span>`).join('<i>›</i>')}</div>`;
    };
    fillRwy(); summary();
    this.on('[data-ac]', 'click', (_e, el) => { d.aircraft = el.dataset.ac!; d.livery = defaultLivery(aircraftById(d.aircraft)); this.root.querySelectorAll('[data-ac]').forEach(x => x.classList.toggle('on', x === el)); (body.querySelector('[data-livery]') as HTMLSelectElement).value = d.livery; this.showcase.setAircraft(d.aircraft, d.livery); summary(); });
    this.on('[data-livery]', 'change', (_e, el) => { d.livery = (el as HTMLSelectElement).value; this.showcase.setAircraft(d.aircraft, d.livery); });
    this.on('[data-spawn]', 'change', (_e, el) => (d.spawn = (el as HTMLSelectElement).value as any));
    this.on('[data-fuel]', 'input', (_e, el) => { d.fuel = +(el as HTMLInputElement).value; body.querySelector('[data-fuelv]')!.textContent = Math.round(d.fuel * 100) + '%'; });
    this.on('[data-payload]', 'input', (_e, el) => { d.payload = +(el as HTMLInputElement).value; body.querySelector('[data-payv]')!.textContent = Math.round(d.payload * 100) + '%'; });
    this.on('[data-wx]', 'click', (_e, el) => { d.weather = el.dataset.wx!; this.root.querySelectorAll('[data-wx]').forEach(x => x.classList.toggle('on', x === el)); body.querySelector('[data-wxd]')!.textContent = weatherById(d.weather).desc; if (d.dep) d.depEnd = bestRunwayEnd(d.dep, weatherById(d.weather).windDir, weatherById(d.weather).windKt); if (d.arr) d.arrEnd = bestRunwayEnd(d.arr, weatherById(d.weather).windDir, weatherById(d.weather).windKt); fillRwy(); summary(); });
    this.on('[data-dyn]', 'click', (_e, el) => { d.dynamic = !d.dynamic; el.classList.toggle('on', d.dynamic); });
    this.on('[data-hour]', 'input', (_e, el) => { d.hour = +(el as HTMLInputElement).value; body.querySelector('[data-hourv]')!.textContent = clock(d.hour); });
    this.on('[data-hq]', 'click', (_e, el) => { d.hour = +el.dataset.hq!; (body.querySelector('[data-hour]') as HTMLInputElement).value = String(d.hour); body.querySelector('[data-hourv]')!.textContent = clock(d.hour); });
    this.on('[data-local]', 'click', () => { d.arr = null; d.arrEnd = null; this.free(); });
    this.on('[data-openmap]', 'click', () => this.mapScreen());
    this.on('[data-start]', 'click', () => {
      if (!d.dep || !d.depEnd) return;
      let spawn = d.spawn;
      if ((spawn === 'approach' || spawn === 'cruise') && !d.arr) spawn = 'runway';
      const arrOk = d.arr && d.arrEnd;
      this.start({ aircraft: d.aircraft, livery: d.livery, dep: d.dep, depEnd: d.depEnd, arr: arrOk ? d.arr : null, arrEnd: arrOk ? d.arrEnd : null, spawn, weather: d.weather, dynamicWeather: d.dynamic, hour: d.hour, fuel: d.fuel, payload: d.payload, mode: 'free', approachNm: 10 });
    });
  }

  /** Country → City → Airport cascading picker. */
  private picker(el: HTMLElement, cur: Airport | null, onPick: (a: Airport) => void) {
    const countriesWithAp = [...new Set(airports.map(a => a.country))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
    el.innerHTML = `<div class="row wrap"><select data-c><option value="">Country…</option>${countriesWithAp.map(c => `<option value="${c}" ${cur?.country === c ? 'selected' : ''}>${esc(countryName(c))}</option>`).join('')}</select>
      <select data-city><option value="">City…</option></select><input data-q placeholder="Search ICAO / IATA / name" /></div>
      <div class="aplist" data-list></div><div class="cur" data-cur>${cur ? `<b>${cur.icao}</b> ${esc(cur.name)} · ${esc(cur.city)}` : ''}</div>`;
    const cSel = el.querySelector<HTMLSelectElement>('[data-c]')!, citySel = el.querySelector<HTMLSelectElement>('[data-city]')!, q = el.querySelector<HTMLInputElement>('[data-q]')!, list = el.querySelector<HTMLElement>('[data-list]')!;
    const render = (aps: Airport[]) => {
      list.innerHTML = aps.slice(0, 60).map(a => `<button data-icao="${a.icao}"><b>${a.icao}</b>${a.iata ? `<i>${a.iata}</i>` : ''}<span>${esc(a.name)}</span><small>${esc(a.city)} · ${Math.round(Math.max(...a.runways.map(r => r.lengthM)))} m</small></button>`).join('') || '<p class="dim">No airports</p>';
      list.querySelectorAll<HTMLElement>('[data-icao]').forEach(b => b.addEventListener('click', () => { const a = airportByIcao.get(b.dataset.icao!)!; el.querySelector('[data-cur]')!.innerHTML = `<b>${a.icao}</b> ${esc(a.name)} · ${esc(a.city)}`; list.innerHTML = ''; onPick(a); }));
    };
    const fillCities = () => {
      const c = cSel.value; if (!c) { citySel.innerHTML = '<option value="">City…</option>'; return; }
      const aps = airports.filter(a => a.country === c);
      const cs = cities.filter(ci => ci.country === c && aps.some(a => haversine(a.lat, a.lon, ci.lat, ci.lon) < 80000)).slice(0, 80);
      citySel.innerHTML = `<option value="">All cities (${aps.length} airports)</option>` + cs.map((ci, i) => `<option value="${i}">${esc(ci.name)}${ci.capital ? ' ★' : ''}</option>`).join('');
      (citySel as any).cs = cs;
      render(aps.sort((a, b) => b.size - a.size));
    };
    cSel.addEventListener('change', fillCities);
    citySel.addEventListener('change', () => {
      const cs = (citySel as any).cs as typeof cities; const c = cSel.value;
      if (citySel.value === '') { render(airports.filter(a => a.country === c).sort((a, b) => b.size - a.size)); return; }
      const ci = cs[+citySel.value];
      render(airports.filter(a => haversine(a.lat, a.lon, ci.lat, ci.lon) < 80000).sort((a, b) => haversine(a.lat, a.lon, ci.lat, ci.lon) - haversine(b.lat, b.lon, ci.lat, ci.lon)));
    });
    q.addEventListener('input', () => {
      const s = q.value.trim().toUpperCase(); if (s.length < 2) { list.innerHTML = ''; return; }
      render(airports.filter(a => a.icao.includes(s) || a.iata === s || a.name.toUpperCase().includes(s) || a.city.toUpperCase().includes(s)).sort((a, b) => (b.icao === s || b.iata === s ? 10 : 0) - (a.icao === s || a.iata === s ? 10 : 0) + b.size - a.size));
    });
    if (cur) { fillCities(); list.innerHTML = ''; }
  }

  // ---------------- CAREER ----------------
  career() {
    const body = this.screen('CAREER', `<div class="list">${CAREER.map((m, i) => {
      const done = career.completed[m.id]; const locked = i > 0 && career.completed[CAREER[i - 1].id] === undefined;
      const ac = aircraftById(m.aircraft); const dep = airportByIcao.get(m.dep), arr = airportByIcao.get(m.arr);
      const dist = dep && arr ? Math.round(haversine(dep.lat, dep.lon, arr.lat, arr.lon) / NM) : 0;
      return `<div class="mission ${locked ? 'locked' : ''} ${done !== undefined ? 'done' : ''}"><div class="num">${i + 1}</div><div class="info"><b>${m.title}</b><p>${esc(m.brief)}</p>
        <small>${ac.name} · ${m.dep} → ${m.arr} · ${dist} NM · ${weatherById(m.weather).name} · ${clock(m.hour)} · reward ${m.reward.toLocaleString()} cr</small></div>
        <div class="act">${done !== undefined ? `<span class="badge">BEST ${done}</span>` : ''}${locked ? '<span class="badge">LOCKED</span>' : `<button class="btn primary" data-m="${m.id}">FLY</button>`}</div></div>`;
    }).join('')}</div><p class="dim">Complete each flight by landing at the destination. Unlocked aircraft: ${career.unlockedAircraft.map(a => aircraftById(a).name).join(', ')}.</p>`);
    body.querySelectorAll<HTMLElement>('[data-m]').forEach(b => b.addEventListener('click', () => {
      const m = CAREER.find(x => x.id === b.dataset.m)!; const dep = airportByIcao.get(m.dep)!, arr = airportByIcao.get(m.arr)!; const wx = weatherById(m.weather);
      this.start({ aircraft: m.aircraft, dep, depEnd: bestRunwayEnd(dep, wx.windDir, wx.windKt), arr, arrEnd: bestRunwayEnd(arr, wx.windDir, wx.windKt), spawn: m.spawn, weather: m.weather, hour: m.hour, mode: 'career', missionId: m.id, title: m.title.toUpperCase(), fuel: 0.55, payload: 0.6 });
    }));
  }

  // ---------------- CHALLENGES ----------------
  challenge() {
    const best = (career as any).challenges ?? {};
    const body = this.screen('LANDING CHALLENGES', `<div class="list">${CHALLENGES.map(c => {
      const ap = airportByIcao.get(c.airport)!;
      return `<div class="mission"><div class="num">✈</div><div class="info"><b>${c.title}</b><p>${esc(c.brief)}</p><small>${aircraftById(c.aircraft).name} · ${c.airport} ${esc(ap?.name ?? '')} RWY ${c.rwy} · ${weatherById(c.weather).name} · ${clock(c.hour)}</small></div>
        <div class="act">${best[c.id] !== undefined ? `<span class="badge">BEST ${best[c.id]}</span>` : ''}<button class="btn primary" data-c="${c.id}">ATTEMPT</button></div></div>`;
    }).join('')}</div>`);
    body.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.addEventListener('click', () => {
      const c = CHALLENGES.find(x => x.id === b.dataset.c)!; const ap = airportByIcao.get(c.airport)!;
      const end = ap.runways.flatMap(r => r.ends).find(e => e.ident === c.rwy) ?? ap.runways[0].ends[0];
      this.start({ aircraft: c.aircraft, dep: ap, depEnd: end, arr: ap, arrEnd: end, spawn: 'approach', weather: c.weather, hour: c.hour, mode: 'challenge', missionId: c.id, approachNm: c.distNm, title: c.title.toUpperCase(), fuel: 0.25, payload: 0.5 });
    }));
  }

  // ---------------- EXPLORE ----------------
  explore() {
    const big = cities.filter(c => c.pop > 2_000_000).slice(0, 60);
    const scenic: [string, number, number, number][] = [['Swiss Alps', 46.55, 8.0, 14000], ['Grand Canyon', 36.1, -112.1, 11000], ['Himalaya / Everest', 27.99, 86.92, 31000], ['Norwegian Fjords', 61.2, 6.8, 6000], ['Hawaiian Islands', 20.75, -156.4, 9000], ['Rio de Janeiro', -22.95, -43.2, 4000], ['Dubai Coast', 25.15, 55.2, 3000], ['Mount Fuji', 35.36, 138.73, 13000], ['Patagonia', -50.95, -73.2, 10000], ['Sahara', 23.5, 10.0, 12000], ['Iceland Glaciers', 64.4, -16.8, 9000], ['New Zealand Alps', -43.6, 170.15, 13000], ['Manhattan', 40.75, -73.98, 3000], ['Strait of Gibraltar', 36.0, -5.6, 7000], ['Nile Delta', 30.7, 31.0, 9000], ['Andes / Aconcagua', -32.65, -70.0, 24000]];
    const body = this.screen('WORLD EXPLORATION', `
      <div class="ff"><section class="col"><h3>SCENIC REGIONS</h3><div class="chips">${scenic.map(([n], i) => `<button class="chip" data-sc="${i}">${n}</button>`).join('')}</div>
      <h3>MAJOR CITIES</h3><div class="chips">${big.map((c, i) => `<button class="chip" data-ci="${i}">${esc(c.name)}</button>`).join('')}</div>
      <h3>OR START FROM ANY AIRPORT</h3><div class="picker" data-pick></div></section>
      <section class="col"><h3>AIRCRAFT</h3><div class="acgrid">${AIRCRAFT.map(a => `<button class="accard ${a.id === this.draft.aircraft ? 'on' : ''}" data-ac="${a.id}"><b>${a.name}</b></button>`).join('')}</div>
      <h3>WEATHER</h3><div class="chips">${WEATHER.map(w => `<button class="chip ${w.id === this.draft.weather ? 'on' : ''}" data-wx="${w.id}">${w.name}</button>`).join('')}</div>
      <h3>TIME</h3><div class="row"><input type="range" min="0" max="24" step="0.25" value="${this.draft.hour}" data-hour><b data-hourv>${clock(this.draft.hour)}</b></div>
      <p class="dim">Exploration starts airborne on autopilot. Open the map (M) any time to teleport.</p></section></div>`);
    const go = (lat: number, lon: number, altFt: number) => {
      const near = nearestAirports(lat, lon, 1)[0].a; const wx = weatherById(this.draft.weather);
      const ac = aircraftById(this.draft.aircraft); const alt = ac.category === 'General Aviation' ? Math.min(altFt, 9500) : Math.max(altFt, 9000);
      this.start({ aircraft: this.draft.aircraft, dep: near, depEnd: bestRunwayEnd(near, wx.windDir, wx.windKt), spawn: 'air', air: { lat, lon, altFt: alt, hdg: Math.random() * 360 }, weather: this.draft.weather, hour: this.draft.hour, mode: 'explore', title: 'WORLD EXPLORATION' });
    };
    this.on('[data-sc]', 'click', (_e, el) => { const s = scenic[+el.dataset.sc!]; go(s[1], s[2], s[3]); });
    this.on('[data-ci]', 'click', (_e, el) => { const c = big[+el.dataset.ci!]; go(c.lat, c.lon, 4500); });
    this.on('[data-ac]', 'click', (_e, el) => { this.draft.aircraft = el.dataset.ac!; this.root.querySelectorAll('[data-ac]').forEach(x => x.classList.toggle('on', x === el)); this.showcase.setAircraft(this.draft.aircraft); });
    this.on('[data-wx]', 'click', (_e, el) => { this.draft.weather = el.dataset.wx!; this.root.querySelectorAll('[data-wx]').forEach(x => x.classList.toggle('on', x === el)); });
    this.on('[data-hour]', 'input', (_e, el) => { this.draft.hour = +(el as HTMLInputElement).value; body.querySelector('[data-hourv]')!.textContent = clock(this.draft.hour); });
    this.picker(body.querySelector('[data-pick]')!, null, a => {
      const wx = weatherById(this.draft.weather);
      this.start({ aircraft: this.draft.aircraft, dep: a, depEnd: bestRunwayEnd(a, wx.windDir, wx.windKt), spawn: 'runway', weather: this.draft.weather, hour: this.draft.hour, mode: 'explore', title: 'WORLD EXPLORATION' });
    });
  }

  // ---------------- WORLD MAP ----------------
  map() { this.mapScreen(); }
  mapScreen() {
    const body = this.screen('WORLD MAP', `<div class="mapwrap"><div class="mapbox"></div><aside class="mapside"><div data-info><p>Tap a country to list its airports, or tap an airport dot. Zoom in for smaller airports, city names and runway layouts.</p></div>
      <div class="sel"><div>DEP <b data-dep>${this.draft.dep?.icao ?? '—'}</b></div><div>ARR <b data-arr>${this.draft.arr?.icao ?? '—'}</b></div><div data-dist></div></div>
      <button class="btn primary" data-plan>PLAN THIS FLIGHT</button></aside></div>`, true, 'mapscr');
    const mv = this.mapv = new MapView(body.querySelector('.mapbox')!);
    mv.dep = this.draft.dep; mv.arr = this.draft.arr;
    if (this.draft.dep) mv.focus(this.draft.dep.lat, this.draft.dep.lon, 4);
    const info = body.querySelector('[data-info]')!;
    const upd = () => { body.querySelector('[data-dep]')!.textContent = this.draft.dep?.icao ?? '—'; body.querySelector('[data-arr]')!.textContent = this.draft.arr?.icao ?? '—'; const d = this.draft; body.querySelector('[data-dist]')!.textContent = d.dep && d.arr ? `${Math.round(haversine(d.dep.lat, d.dep.lon, d.arr.lat, d.arr.lon) / NM).toLocaleString()} NM great-circle` : ''; mv.dep = d.dep; mv.arr = d.arr; mv.invalidate(); };
    const showAp = (a: Airport) => {
      info.innerHTML = `<h3>${a.icao}${a.iata ? ' / ' + a.iata : ''}</h3><p><b>${esc(a.name)}</b><br>${esc(a.city)}, ${esc(countryName(a.country))}<br>Elevation ${a.elevFt.toLocaleString()} ft · ${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}</p>
        <table class="kv">${a.runways.map(r => `<tr><td>${r.id}</td><td>${Math.round(r.lengthM)} × ${Math.round(r.widthM)} m · ${Math.round(r.ends[0].hdg)}°T${r.hard ? '' : ' · unpaved'}</td></tr>`).join('')}</table>
        <div class="row"><button class="btn" data-sd>SET DEPARTURE</button><button class="btn" data-sa>SET DESTINATION</button></div>`;
      info.querySelector('[data-sd]')!.addEventListener('click', () => { this.draft.dep = a; this.draft.depEnd = null; upd(); });
      info.querySelector('[data-sa]')!.addEventListener('click', () => { this.draft.arr = a; this.draft.arrEnd = null; upd(); });
    };
    mv.onAirport = showAp;
    mv.onCountry = c => {
      const aps = airports.filter(a => a.country === c.iso).sort((a, b) => b.size - a.size);
      info.innerHTML = `<h3>${esc(c.name)}</h3><p>${aps.length} airports in database</p><div class="aplist">${aps.slice(0, 40).map(a => `<button data-icao="${a.icao}"><b>${a.icao}</b><span>${esc(a.name)}</span><small>${esc(a.city)}</small></button>`).join('')}</div>`;
      info.querySelectorAll<HTMLElement>('[data-icao]').forEach(b => b.addEventListener('click', () => { const a = airportByIcao.get(b.dataset.icao!)!; mv.focus(a.lat, a.lon, Math.max(mv.scale, 40)); showAp(a); }));
    };
    body.querySelector('[data-plan]')!.addEventListener('click', () => this.free());
    upd();
  }

  // ---------------- AIRCRAFT ----------------
  aircraft() {
    const sel = aircraftById(this.draft.aircraft);
    const body = this.screen('AIRCRAFT', `<div class="hangar"><div class="aclist">${AIRCRAFT.map(a => `<button class="${a.id === sel.id ? 'on' : ''}" data-ac="${a.id}"><b>${a.name}</b><span>${a.maker} · ${a.category}</span></button>`).join('')}</div>
      <div class="acspec" data-spec></div></div>`, true, 'transparent');
    const show = (a: AircraftSpec) => {
      body.querySelector('[data-spec]')!.innerHTML = `<h2>${a.name}</h2><p>${esc(a.description)}</p>
        <div class="specgrid">
          <div><h4>DIMENSIONS</h4><table class="kv"><tr><td>Length</td><td>${a.length} m</td></tr><tr><td>Wingspan</td><td>${a.span} m</td></tr><tr><td>Height</td><td>${a.height} m</td></tr><tr><td>Wing area</td><td>${a.wingArea} m²</td></tr><tr><td>Wing sweep</td><td>${a.sweep}°</td></tr></table></div>
          <div><h4>WEIGHTS</h4><table class="kv"><tr><td>MTOW</td><td>${a.mtow.toLocaleString()} kg</td></tr><tr><td>Empty (OEW)</td><td>${a.oew.toLocaleString()} kg</td></tr><tr><td>Max fuel</td><td>${a.fuelMax.toLocaleString()} kg</td></tr><tr><td>Seats</td><td>${a.seats}</td></tr></table></div>
          <div><h4>POWER</h4><table class="kv"><tr><td>Engines</td><td>${a.engines.count} × ${a.engines.name}</td></tr><tr><td>${a.engines.type === 'piston' ? 'Power' : 'Thrust'}</td><td>${a.engines.type === 'piston' ? Math.round(a.thrustN / 745.7) + ' hp' : (a.thrustN / 1000).toFixed(1) + ' kN each'}</td></tr></table></div>
          <div><h4>PERFORMANCE</h4><table class="kv"><tr><td>Cruise</td><td>${a.category === 'General Aviation' ? '' : 'M' + a.cruiseMach + ' · '}${a.cruiseKtas} KTAS</td></tr><tr><td>Typical cruise alt</td><td>${a.cruiseAltFt.toLocaleString()} ft</td></tr><tr><td>Ceiling</td><td>${a.ceilingFt.toLocaleString()} ft</td></tr><tr><td>Range</td><td>${a.rangeNm.toLocaleString()} NM</td></tr><tr><td>Vr / Vref</td><td>${a.vr} / ${a.vref} kt</td></tr><tr><td>Flight controls</td><td>${a.control === 'fbw' ? 'Fly-by-wire (normal law)' : a.control === 'boeing' ? 'Yoke, yaw damper' : 'Direct mechanical'}</td></tr></table></div>
        </div>
        <h4>LIVERY</h4><div class="chips">${LIVERIES.map(l => `<button class="chip" data-lv="${l.id}"><i style="background:${l.tail}"></i>${l.name}</button>`).join('')}</div>
        <p class="src">Sources: ${a.sources.map(esc).join(' · ')}</p>
        <button class="btn primary" data-fly>FLY THIS AIRCRAFT</button>`;
      body.querySelectorAll<HTMLElement>('[data-lv]').forEach(b => b.addEventListener('click', () => { this.draft.livery = b.dataset.lv!; this.showcase.setAircraft(a.id, this.draft.livery); }));
      body.querySelector('[data-fly]')!.addEventListener('click', () => { this.draft.aircraft = a.id; this.free(); });
    };
    show(sel); this.showcase.setAircraft(sel.id, this.draft.livery);
    this.on('[data-ac]', 'click', (_e, el) => { const a = aircraftById(el.dataset.ac!); this.draft.aircraft = a.id; this.draft.livery = defaultLivery(a); this.root.querySelectorAll('[data-ac]').forEach(x => x.classList.toggle('on', x === el)); show(a); this.showcase.setAircraft(a.id, this.draft.livery); });
  }

  // ---------------- AIRPORTS ----------------
  airports() {
    const body = this.screen('AIRPORTS', `<div class="apdb"><div class="col"><input data-q placeholder="Search ${airports.length.toLocaleString()} airports: ICAO, IATA, name, city, country" /><div class="aplist tall" data-list></div></div><div class="col" data-det><p class="dim">Select an airport.</p></div></div>`);
    const list = body.querySelector<HTMLElement>('[data-list]')!; const det = body.querySelector<HTMLElement>('[data-det]')!;
    const render = (aps: Airport[]) => {
      list.innerHTML = aps.slice(0, 120).map(a => `<button data-icao="${a.icao}"><b>${a.icao}</b>${a.iata ? `<i>${a.iata}</i>` : ''}<span>${esc(a.name)}</span><small>${esc(a.city)}, ${esc(countryName(a.country))}</small></button>`).join('');
      list.querySelectorAll<HTMLElement>('[data-icao]').forEach(b => b.addEventListener('click', () => detail(airportByIcao.get(b.dataset.icao!)!)));
    };
    const detail = (a: Airport) => {
      det.innerHTML = `<h2>${a.icao}${a.iata ? ' · ' + a.iata : ''}</h2><p><b>${esc(a.name)}</b><br>${esc(a.city)}, ${esc(countryName(a.country))}</p>
        <table class="kv"><tr><td>Position</td><td>${a.lat.toFixed(5)}°, ${a.lon.toFixed(5)}°</td></tr><tr><td>Elevation</td><td>${a.elevFt.toLocaleString()} ft (${Math.round(a.elevM)} m)</td></tr><tr><td>Class</td><td>${['General aviation / scenic', 'Regional (scheduled)', 'Major international'][a.size]}</td></tr></table>
        <h4>RUNWAYS</h4><table class="kv rw"><tr><th>RWY</th><th>Heading (T)</th><th>Length</th><th>Width</th><th>Surface</th></tr>${a.runways.map(r => `<tr><td>${r.id}</td><td>${Math.round(r.ends[0].hdg)}° / ${Math.round(r.ends[1].hdg)}°</td><td>${ftm(r.lengthM)}</td><td>${Math.round(r.widthM)} m</td><td>${r.hard ? 'Paved' : 'Unpaved'}${r.lighted ? ', lit' : ''}</td></tr>`).join('')}</table>
        <div class="row"><button class="btn primary" data-fly>FLY FROM HERE</button><button class="btn" data-dest>SET AS DESTINATION</button><button class="btn" data-mapit>SHOW ON MAP</button></div>`;
      det.querySelector('[data-fly]')!.addEventListener('click', () => { this.draft.dep = a; this.draft.depEnd = null; this.free(); });
      det.querySelector('[data-dest]')!.addEventListener('click', () => { this.draft.arr = a; this.draft.arrEnd = null; this.free(); });
      det.querySelector('[data-mapit]')!.addEventListener('click', () => { this.draft.dep = this.draft.dep ?? a; this.mapScreen(); this.mapv?.focus(a.lat, a.lon, 120); });
    };
    const q = body.querySelector<HTMLInputElement>('[data-q]')!;
    q.addEventListener('input', () => {
      const s = q.value.trim().toUpperCase(); if (!s) { render(airports.filter(a => a.size === 2)); return; }
      render(airports.filter(a => a.icao.includes(s) || a.iata === s || a.name.toUpperCase().includes(s) || a.city.toUpperCase().includes(s) || countryName(a.country).toUpperCase().includes(s)).sort((a, b) => ((b.icao === s || b.iata === s) ? 10 : 0) - ((a.icao === s || a.iata === s) ? 10 : 0) + b.size - a.size));
    });
    render(airports.filter(a => a.size === 2));
  }

  // ---------------- SETTINGS ----------------
  settings() {
    const s = settings;
    const opt = (k: string, vals: [string, string][]) => `<div class="chips">${vals.map(([v, l]) => `<button class="chip ${String((s as any)[k]) === v ? 'on' : ''}" data-set="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const body = this.screen('SETTINGS', `<div class="settings">
      <h3>GRAPHICS QUALITY</h3>${opt('quality', [['low', 'Low (phones)'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']])}
      <p class="dim">Controls render resolution, shadow map size, terrain level of detail, cloud density and building density.</p>
      <h3>FLIGHT MODEL</h3>${opt('assist', [['assisted', 'Assisted (attitude hold, auto-trim, protections)'], ['realistic', 'Realistic (direct law except Airbus FBW)']])}
      <h3>CONTROLS</h3>${opt('touch', [['auto', 'Touch controls: Auto'], ['on', 'Always'], ['off', 'Never']])}${opt('tilt', [['false', 'Stick: virtual joystick'], ['true', 'Stick: device tilt']])}${opt('invertPitch', [['false', 'Normal pitch'], ['true', 'Inverted pitch']])}
      <label>Sensitivity <input type="range" min="0.4" max="1.6" step="0.05" value="${s.sensitivity}" data-range="sensitivity"></label>
      <h3>DISPLAY</h3>${opt('hud', [['true', 'HUD on'], ['false', 'HUD off in cockpit']])}${opt('trees', [['true', '3D trees'], ['false', 'No trees']])}
      <h3>SIMULATION RATE</h3>${opt('timeScale', [['1', 'Real time'], ['10', '×10 clock'], ['60', '×60 clock']])}
      <h3>AUDIO</h3><label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume"></label>${opt('voice', [['true', 'Voice callouts'], ['false', 'No callouts']])}
      <h3>CAREER</h3><button class="btn" data-reset>RESET CAREER PROGRESS</button>
      <h3>CREDITS & DATA</h3><p class="dim">Terrain elevation: Mapzen / Amazon Terrain Tiles (SRTM, GMTED2010, ETOPO1, NED and others — see the tile metadata). Coastlines, borders, cities, rivers, lakes, highways and urban areas: Natural Earth (public domain). Airports and runways: OurAirports (public domain). Aircraft are procedurally modelled from published dimensions; liveries are fictional. All code, models, textures and sounds are generated by this game.</p>
      <p class="dim">Keyboard: W/S pitch · A/D roll · Q/E rudder · Shift/Ctrl throttle · G gear · F/V flaps · B brakes · . parking brake · P pushback · Ctrl+E auto-start · L lights · C/1-6 cameras · Tab autopilot · Esc pause · M map.</p>
    </div>`);
    this.on('[data-set]', 'click', (_e, el) => {
      const k = el.dataset.set!, v = el.dataset.v!; const cur = (s as any)[k];
      (s as any)[k] = typeof cur === 'boolean' ? v === 'true' : typeof cur === 'number' ? +v : v;
      el.parentElement!.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === el)); saveSettings(); this.applySettings();
    });
    this.on('[data-range]', 'input', (_e, el) => { (s as any)[el.dataset.range!] = +(el as HTMLInputElement).value; saveSettings(); this.applySettings(); });
    this.on('[data-reset]', 'click', () => { if (confirm('Reset all career progress?')) { resetCareer(); this.settings(); } });
    void isTouch;
  }
}

export function clock(h: number) { const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60) % 60; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
