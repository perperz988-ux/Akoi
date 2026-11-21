import { hash2, smoothstep } from '../core/MathUtil';

/**
 * Port Solano — an original fictional coastal city.
 * The world is a 3.2 km x 3.2 km square divided into 100 m cells (32x32 = 1024 blocks),
 * with a road network on the cell boundaries, a river, an ocean coast, a luxury island,
 * an airport, a port, rural outskirts and a dense downtown.
 */
export const HALF = 1600;
export const CELL = 100;
export const N = 32; // cells per axis
export const WATER_Y = -0.8;
export const SIDEWALK = 4;

export enum District {
  Downtown, Midtown, Luxury, Resort, Beach, Suburb, Poor, Industrial, Shopping, Airport, Rural, Park, River, Ocean, Marina, Island,
}
export const DISTRICT_NAMES: Record<District, string> = {
  [District.Downtown]: 'Downtown Solano', [District.Midtown]: 'Midtown', [District.Luxury]: 'Bellavista Heights',
  [District.Resort]: 'Ocean Mile', [District.Beach]: 'Sunreef Beach', [District.Suburb]: 'Palm Hollow',
  [District.Poor]: 'Ironside', [District.Industrial]: 'Saltworks Port', [District.Shopping]: 'Galleria District',
  [District.Airport]: 'Solano International', [District.Rural]: 'Cypress Flats', [District.Park]: 'Mirador Park',
  [District.River]: 'Rio Lento', [District.Ocean]: 'Atlantic Waters', [District.Marina]: 'Vela Marina', [District.Island]: 'Coral Key',
};

export const lineCoord = (i: number) => -HALF + i * CELL;
export const cellOf = (v: number) => Math.floor((v + HALF) / CELL);
export const cellCenter = (c: number) => -HALF + c * CELL + CELL / 2;
export const inBounds = (c: number) => c >= 0 && c < N;

const ISLAND = { x0: 1290, x1: 1510, z0: -710, z1: -290 };
const AIRPORT = { x0: -1600, x1: -900, z0: -1600, z1: -1000 };
const PARK = { x0: 100, x1: 400, z0: -1100, z1: -900 };
const SMALL_PARKS = [[-700, -300], [-500, 800], [600, 200], [-100, -1300], [800, 700]];
export const RIVER_Z0 = 410, RIVER_Z1 = 490;
export const SHORE_X = 1212;

export function isIsland(x: number, z: number) { return x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1; }
export function inAirport(x: number, z: number) { return x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1; }
export function inPark(x: number, z: number) { return x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1; }

export function districtAt(x: number, z: number): District {
  if (isIsland(x, z)) return District.Island;
  if (x >= 1200) {
    if (z > 600 && z < 900 && x < 1300) return District.Marina;
    return District.Ocean;
  }
  if (z > 400 && z < 500) return District.River;
  if (x >= 1100) return z > 600 && z < 900 ? District.Marina : District.Beach;
  if (inAirport(x, z)) return District.Airport;
  if (x < -1100) return District.Rural;
  if (inPark(x, z)) return District.Park;
  for (const [px, pz] of SMALL_PARKS) if (x > px && x < px + CELL && z > pz && z < pz + CELL) return District.Park;
  if (x >= 1000 && z > -200) return District.Resort;
  if (x > -200 && x < 700 && z > -700 && z < 400) return District.Downtown;
  if (x >= 700 && z < -200) return District.Luxury;
  if (z > 900 && x > -200) return District.Industrial;
  if (x > -200 && x < 500 && z > 500 && z < 900) return District.Shopping;
  if (x < -200 && z > 500) return District.Poor;
  if (x < -200 && z < 400) return District.Suburb;
  return District.Midtown;
}
export function cellDistrict(ci: number, cj: number) { return districtAt(cellCenter(ci), cellCenter(cj)); }

/** Highways: wider multi-lane roads. */
export function lineHalfWidth(axis: 'x' | 'z', idx: number) {
  if (axis === 'x' && idx === 12) return 12; // Route 9 (x = -400)
  if (axis === 'z' && idx === 5) return 12;  // Bayshore Expressway (z = -1100)
  return 7;
}
export function isHighway(axis: 'x' | 'z', idx: number) { return lineHalfWidth(axis, idx) > 7; }

/** Is there a vertical road segment on x-line i between z-lines j and j+1 ? */
export function vSegment(i: number, j: number): boolean {
  if (i < 0 || i > N || j < 0 || j >= N) return false;
  const x = lineCoord(i), z0 = lineCoord(j), z1 = lineCoord(j + 1), zm = (z0 + z1) / 2;
  if (isIsland(x, zm)) return true;
  if (x > 1150) return false;
  if (zm > 400 && zm < 500) return x % 200 === 0 && x > -1500; // bridges over the river
  if (x > AIRPORT.x0 - 1 && x < AIRPORT.x1 && zm > AIRPORT.z0 && zm < AIRPORT.z1) return false;
  if (x > PARK.x0 && x < PARK.x1 && zm > PARK.z0 && zm < PARK.z1) return false;
  if (x < -1100) return i % 3 === 0 && !(zm < AIRPORT.z1 + 1 && x <= AIRPORT.x1);
  return true;
}
/** Is there a horizontal road segment on z-line j between x-lines i and i+1 ? */
export function hSegment(i: number, j: number): boolean {
  if (i < 0 || i >= N || j < 0 || j > N) return false;
  const z = lineCoord(j), x0 = lineCoord(i), x1 = lineCoord(i + 1), xm = (x0 + x1) / 2;
  if (isIsland(xm, z)) return true;
  if (z === -500 && xm > 1100 && xm < 1300) return true; // Coral Key causeway
  if (xm > 1150) return false;
  if (z === -1300 && xm > -1300 && xm < -900) return true; // airport access road
  if (xm > AIRPORT.x0 && xm < AIRPORT.x1 + 1 && z > AIRPORT.z0 && z < AIRPORT.z1) return false;
  if (xm > PARK.x0 && xm < PARK.x1 && z > PARK.z0 && z < PARK.z1) return false;
  if (xm < -1100) return j % 3 === 0;
  return true;
}
export function nodeExists(i: number, j: number) {
  return vSegment(i, j) || vSegment(i, j - 1) || hSegment(i, j) || hSegment(i - 1, j);
}
export function isBridgeV(i: number, j: number) {
  const zm = lineCoord(j) + CELL / 2;
  return vSegment(i, j) && zm > 400 && zm < 500;
}
export function isBridgeH(i: number, j: number) {
  const xm = lineCoord(i) + CELL / 2, z = lineCoord(j);
  return hSegment(i, j) && z === -500 && xm > 1150 && xm < 1300;
}
export function isDirtRoad(x: number) { return x < -1100; }

/** Returns true if (x,z) lies on a road surface (or bridge deck). */
export function onRoad(x: number, z: number): boolean {
  const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  const lx = lineCoord(i), lz = lineCoord(j);
  const hwx = lineHalfWidth('x', i), hwz = lineHalfWidth('z', j);
  if (Math.abs(x - lx) <= hwx) {
    const sj = Math.floor((z + HALF) / CELL);
    if (vSegment(i, sj) || (Math.abs(z - lz) <= hwz && nodeExists(i, j))) return true;
  }
  if (Math.abs(z - lz) <= hwz) {
    const si = Math.floor((x + HALF) / CELL);
    if (hSegment(si, j)) return true;
  }
  return false;
}

export function onBridge(x: number, z: number): boolean {
  if (z > 400 && z < 500 && x < 1150) {
    const i = Math.round((x + HALF) / CELL);
    if (Math.abs(x - lineCoord(i)) <= lineHalfWidth('x', i) + 1 && isBridgeV(i, cellOf(z))) return true;
  }
  if (Math.abs(z + 500) <= 8 && x > 1140 && x < 1300) return true;
  return false;
}

/** Terrain height (without buildings). Water surface is WATER_Y. */
export function groundY(x: number, z: number): number {
  if (onBridge(x, z)) return 0;
  if (isIsland(x, z)) {
    const e = Math.min(x - ISLAND.x0, ISLAND.x1 - x, z - ISLAND.z0, ISLAND.z1 - z);
    return -6 + smoothstep(0, 22, e) * 6;
  }
  // ocean / beach slope
  let y = 0;
  if (x > 1150) y = -smoothstep(1165, 1280, x) * 6;
  if (x > 1190 && z > 600 && z < 900 && x < 1215) y = Math.max(y, -6); // marina basin edge
  // river channel
  if (z > RIVER_Z0 - 6 && z < RIVER_Z1 + 6 && x < 1250) {
    const e = Math.min(z - (RIVER_Z0 - 6), RIVER_Z1 + 6 - z);
    y = Math.min(y, -smoothstep(0, 12, e) * 5.5);
  }
  // Bounds: everything outside the playable square drops into ocean
  if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) y = Math.min(y, -6);
  return y;
}
export function isWater(x: number, z: number) { return groundY(x, z) < WATER_Y - 0.4; }
export function waterDepth(x: number, z: number) { return Math.max(0, WATER_Y - groundY(x, z)); }

// ---------------- Street names (HUD) ----------------
const AVENUES = ['Cypress', 'Old Mill', 'Juniper', 'Farm Line', 'Pelican', 'Harvest', 'Sawgrass', 'Magnolia', 'Orchid', 'Larkspur',
  'Hibiscus', 'Banyan', 'Route 9', 'Marigold', 'Sable', 'Coquina', 'Verde', 'Alhambra', 'Sol', 'Calle Ocho', 'Mercer', 'Delmar',
  'Biscayne Row', 'Tidewater', 'Corsair', 'Seaview', 'Aquila', 'Ocean Drive', 'Shoreline', 'Coral Key', 'Lagoon', 'Reef', 'Outer'];
export function streetName(x: number, z: number) {
  const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
  const dx = Math.abs(x - lineCoord(i)), dz = Math.abs(z - lineCoord(j));
  const av = `${AVENUES[i] ?? 'Outer'} ${i === 12 ? '' : 'Ave'}`.trim();
  const st = j === 5 ? 'Bayshore Expwy' : `${ordinal(Math.abs(j - 16) + 1)} St`;
  if (dx < dz) return dz < 14 ? `${av} & ${st}` : av;
  return dx < 14 ? `${st} & ${av}` : st;
}
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------- Points of interest ----------------
export type PoiKind = 'safehouse' | 'garage' | 'dealer' | 'gas' | 'restaurant' | 'hotel' | 'hospital' | 'police' | 'clothing'
  | 'gear' | 'club' | 'carwash' | 'taxi' | 'cinema' | 'marina' | 'airport' | 'helipad' | 'metro' | 'construction' | 'realestate' | 'bar' | 'gym';
export interface Poi {
  id: string; name: string; kind: PoiKind; ci: number; cj: number;
  /** door / interaction point, filled by CityData */
  x: number; z: number; open: number; close: number; color: string;
}
const P = (id: string, name: string, kind: PoiKind, x: number, z: number, open = 0, close = 24, color = '#ffd166'): Poi =>
  ({ id, name, kind, ci: cellOf(x), cj: cellOf(z), x: 0, z: 0, open, close, color });

export const POIS: Poi[] = [
  P('safe_midtown', 'Calder Apartment', 'safehouse', -150, -850, 0, 24, '#4ade80'),
  P('safe_beach', 'Ocean Mile Condo', 'safehouse', 1050, 350, 0, 24, '#4ade80'),
  P('safe_island', 'Coral Key Villa', 'safehouse', 1450, -450, 0, 24, '#4ade80'),
  P('garage_vance', 'Vance Motorworks', 'garage', -350, 650, 7, 23, '#60a5fa'),
  P('garage_port', 'Dockside Customs', 'garage', 450, 1050, 8, 22, '#60a5fa'),
  P('dealer', 'Solano Motorhaus', 'dealer', 150, 650, 9, 21, '#f472b6'),
  P('marina', 'Vela Marina Boats', 'marina', 1150, 750, 8, 20, '#38bdf8'),
  P('gas1', 'Sunfuel', 'gas', -650, -550, 0, 24, '#facc15'), P('gas2', 'Sunfuel', 'gas', 750, 150, 0, 24, '#facc15'),
  P('gas3', 'Gulfline', 'gas', -850, 1150, 0, 24, '#facc15'), P('gas4', 'Gulfline', 'gas', 350, -1250, 0, 24, '#facc15'),
  P('food_mango', 'Mango Grill', 'restaurant', 1050, -50, 10, 24, '#fb923c'),
  P('food_noodle', 'Lucky Noodle', 'restaurant', 250, -250, 11, 23, '#fb923c'),
  P('food_diner', 'Sunny Side Diner', 'restaurant', -750, -150, 6, 22, '#fb923c'),
  P('food_taco', 'Taqueria Brava', 'restaurant', -550, 950, 9, 24, '#fb923c'),
  P('hotel_azure', 'Hotel Azure', 'hotel', 1050, 150, 0, 24, '#a78bfa'),
  P('hotel_flamingo', 'The Flamingo Crest', 'hotel', 1050, -150, 0, 24, '#a78bfa'),
  P('hospital', 'Mercy Bay General', 'hospital', -50, 250, 0, 24, '#f87171'),
  P('police', 'Port Solano PD', 'police', 550, 250, 0, 24, '#93c5fd'),
  P('clothing', 'Thread & Tide', 'clothing', 50, 750, 9, 21, '#f9a8d4'),
  P('gear', 'Harbor Outfitters', 'gear', -250, 1050, 8, 22, '#fca5a5'),
  P('club', 'Neon Reef', 'club', 850, 50, 20, 4, '#e879f9'),
  P('carwash', 'Bubble Bay Wash', 'carwash', -450, -350, 7, 21, '#67e8f9'),
  P('taxi', 'Sol Cab Co.', 'taxi', -650, 650, 0, 24, '#fde047'),
  P('cinema', 'Palm Cinema', 'cinema', 350, 750, 12, 24, '#fcd34d'),
  P('bar', 'The Rusty Anchor', 'bar', 650, 1150, 16, 3, '#fdba74'),
  P('gym', 'Ironside Boxing Gym', 'gym', -950, 750, 6, 22, '#86efac'),
  P('realestate', 'Bayline Realty', 'realestate', 450, -550, 9, 18, '#5eead4'),
  P('airport', 'Solano International', 'airport', -1050, -1250, 0, 24, '#cbd5e1'),
  P('helipad', 'Skyport Helipad', 'helipad', -950, -1450, 0, 24, '#cbd5e1'),
  P('metro', 'Old Metro: Central', 'metro', 50, -50, 0, 24, '#d6d3d1'),
  P('metro_w', 'Old Metro: Ironside', 'metro', -850, 850, 0, 24, '#d6d3d1'),
  P('metro_e', 'Old Metro: Ocean Mile', 'metro', 950, 350, 0, 24, '#d6d3d1'),
  P('metro_s', 'Old Metro: Saltworks', 'metro', 50, 1250, 0, 24, '#d6d3d1'),
  P('metro_n', 'Old Metro: Bellavista', 'metro', 850, -850, 0, 24, '#d6d3d1'),
];
export function poiById(id: string) { return POIS.find((p) => p.id === id)!; }
export function poiAtCell(ci: number, cj: number) { return POIS.find((p) => p.ci === ci && p.cj === cj); }

export function isConstructionCell(ci: number, cj: number) {
  const d = cellDistrict(ci, cj);
  return (d === District.Downtown || d === District.Midtown) && !poiAtCell(ci, cj) && hash2(ci, cj, 77) < 0.07;
}

/** Lot rectangle inside a cell (excluding roads and sidewalks). */
export function cellLot(ci: number, cj: number) {
  const x0 = lineCoord(ci), x1 = lineCoord(ci + 1), z0 = lineCoord(cj), z1 = lineCoord(cj + 1);
  const left = anyV(ci, cj) ? lineHalfWidth('x', ci) + SIDEWALK : 2;
  const right = anyV(ci + 1, cj) ? lineHalfWidth('x', ci + 1) + SIDEWALK : 2;
  const top = anyH(ci, cj) ? lineHalfWidth('z', cj) + SIDEWALK : 2;
  const bottom = anyH(ci, cj + 1) ? lineHalfWidth('z', cj + 1) + SIDEWALK : 2;
  return { x0: x0 + left, x1: x1 - right, z0: z0 + top, z1: z1 - bottom };
}
function anyV(i: number, j: number) { return vSegment(i, j); }
function anyH(i: number, j: number) { return hSegment(i, j); }

/** Districts where sidewalks & pedestrians exist. */
export function isUrban(d: District) {
  return d !== District.Rural && d !== District.Airport && d !== District.Ocean && d !== District.River && d !== District.Beach && d !== District.Marina;
}
export function hasTrafficLights(i: number, j: number) {
  const x = lineCoord(i), z = lineCoord(j);
  const d = districtAt(x + 1, z + 1);
  const deg = (vSegment(i, j) ? 1 : 0) + (vSegment(i, j - 1) ? 1 : 0) + (hSegment(i, j) ? 1 : 0) + (hSegment(i - 1, j) ? 1 : 0);
  return deg >= 3 && x > -1100 && (d === District.Downtown || d === District.Midtown || d === District.Shopping || d === District.Resort || d === District.Luxury || isHighway('x', i) || isHighway('z', j) || (i + j) % 2 === 0);
}
