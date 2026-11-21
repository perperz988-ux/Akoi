export type VClass = 'sports' | 'super' | 'muscle' | 'sedan' | 'compact' | 'suv' | 'pickup' | 'van' | 'bus' | 'truck' | 'bike' | 'boat' | 'jetski' | 'heli' | 'police' | 'swat' | 'ambulance' | 'taxi';
export type EngineKind = 'i4' | 'v6' | 'v8' | 'v12' | 'ev' | 'diesel' | 'bike' | 'bike2' | 'boat' | 'heli';

export interface VehicleDef {
  id: string; name: string; maker: string; cls: VClass; price: number;
  mass: number; len: number; wid: number; hei: number; wheelbase: number; track: number; wheelR: number;
  power: number;     // W
  topSpeed: number;  // m/s
  grip: number;      // tyre mu
  brake: number;     // N
  cda: number;       // Cd*A
  steer: number;     // max steering angle rad
  drive: 'rwd' | 'fwd' | 'awd';
  front: number;     // static weight fraction on front axle
  cabin: [number, number]; roofY: number; beltY: number; noseY: number; // shape params (fractions)
  engine: EngineKind; gears: number; maxRpm: number;
  seats: number; colors: number[]; hp: number; // health
  turbo?: boolean; nitro?: boolean;
  /** upgrade headroom */
  tuning?: number;
}

const C = {
  std: [0xc0392b, 0x1f3a5f, 0xe8e8e8, 0x1a1a1d, 0x7f8c8d, 0x2e7d4f, 0xe0b020, 0x8e44ad, 0xd35400],
  muted: [0x222428, 0x8a8f96, 0xdcdcdc, 0x3b4b63, 0x6a2f2f, 0x2f4a3a, 0xa89a7a],
  bright: [0xff5a1f, 0xffd23f, 0x2ec4b6, 0xe71d36, 0x3a86ff, 0xf5f5f5, 0x111111, 0xb5179e],
};

const D = (d: Partial<VehicleDef> & Pick<VehicleDef, 'id' | 'name' | 'maker' | 'cls' | 'price'>): VehicleDef => ({
  mass: 1500, len: 4.6, wid: 1.85, hei: 1.4, wheelbase: 2.7, track: 1.55, wheelR: 0.34, power: 120000, topSpeed: 55, grip: 1.15, brake: 16000,
  cda: 0.7, steer: 0.55, drive: 'rwd', front: 0.52, cabin: [0.3, -0.55], roofY: 1.0, beltY: 0.58, noseY: 0.45, engine: 'i4', gears: 6, maxRpm: 7000,
  seats: 4, colors: C.std, hp: 1000, ...d,
});

export const VEHICLES: VehicleDef[] = [
  // ---- sports
  D({ id: 'vexa_gt', name: 'GT-4', maker: 'Vexa', cls: 'sports', price: 68000, mass: 1450, len: 4.4, wid: 1.9, hei: 1.25, wheelbase: 2.6, track: 1.6, power: 300000, topSpeed: 80, grip: 1.45, brake: 21000, cda: 0.62, steer: 0.5, cabin: [0.15, -0.5], roofY: 0.92, beltY: 0.56, noseY: 0.38, engine: 'v6', seats: 2, colors: C.bright, tuning: 3, nitro: true }),
  D({ id: 'kestrel_rs', name: 'RS Quattro', maker: 'Kestrel', cls: 'sports', price: 84000, mass: 1600, len: 4.5, wid: 1.9, hei: 1.3, wheelbase: 2.65, track: 1.62, power: 340000, topSpeed: 84, grip: 1.55, brake: 23000, drive: 'awd', cabin: [0.2, -0.55], roofY: 0.96, noseY: 0.4, engine: 'v6', seats: 4, colors: C.muted.concat(C.bright), tuning: 3, turbo: true }),
  D({ id: 'marlin_s', name: 'S Roadster', maker: 'Marlin', cls: 'sports', price: 52000, mass: 1250, len: 4.1, wid: 1.8, hei: 1.2, wheelbase: 2.45, track: 1.52, power: 190000, topSpeed: 70, grip: 1.35, brake: 17000, cabin: [0.1, -0.35], roofY: 0.9, noseY: 0.38, engine: 'i4', seats: 2, colors: C.bright, tuning: 2 }),
  // ---- super
  D({ id: 'halcyon_zero', name: 'Zero', maker: 'Halcyon', cls: 'super', price: 395000, mass: 1350, len: 4.6, wid: 2.0, hei: 1.12, wheelbase: 2.7, track: 1.7, wheelR: 0.36, power: 560000, topSpeed: 98, grip: 1.75, brake: 28000, cda: 0.58, steer: 0.45, drive: 'awd', front: 0.44, cabin: [0.05, -0.4], roofY: 0.9, beltY: 0.55, noseY: 0.3, engine: 'v12', gears: 7, maxRpm: 9000, seats: 2, colors: C.bright, tuning: 4, turbo: true, nitro: true }),
  D({ id: 'orsa_v12', name: 'Diavolo V12', maker: 'Orsa', cls: 'super', price: 310000, mass: 1480, len: 4.7, wid: 2.0, hei: 1.15, wheelbase: 2.75, track: 1.7, wheelR: 0.36, power: 490000, topSpeed: 94, grip: 1.65, brake: 26000, cda: 0.6, steer: 0.45, front: 0.42, cabin: [0.0, -0.45], roofY: 0.9, noseY: 0.3, engine: 'v12', gears: 7, maxRpm: 8800, seats: 2, colors: C.bright, tuning: 4, nitro: true }),
  D({ id: 'volt_ev', name: 'Pulse EV', maker: 'Voltaic', cls: 'super', price: 220000, mass: 1900, len: 4.8, wid: 1.95, hei: 1.3, wheelbase: 2.9, track: 1.65, power: 520000, topSpeed: 80, grip: 1.45, brake: 25000, drive: 'awd', cabin: [0.25, -0.6], roofY: 0.95, noseY: 0.38, engine: 'ev', gears: 1, maxRpm: 14000, seats: 4, colors: C.muted.concat(C.bright), tuning: 3 }),
  // ---- muscle
  D({ id: 'bruiser_70', name: 'Bruiser 70', maker: 'Garrett', cls: 'muscle', price: 46000, mass: 1750, len: 4.9, wid: 1.95, hei: 1.3, wheelbase: 2.8, track: 1.6, power: 320000, topSpeed: 76, grip: 1.1, brake: 17000, cda: 0.75, steer: 0.5, cabin: [0.1, -0.5], roofY: 0.95, noseY: 0.45, engine: 'v8', gears: 4, maxRpm: 6200, seats: 2, colors: C.bright.concat(C.std), tuning: 3 }),
  D({ id: 'stallion_ss', name: 'Stallion SS', maker: 'Garrett', cls: 'muscle', price: 38000, mass: 1650, len: 4.8, wid: 1.9, hei: 1.3, wheelbase: 2.75, track: 1.58, power: 270000, topSpeed: 71, grip: 1.08, brake: 16000, cda: 0.74, cabin: [0.15, -0.55], roofY: 0.96, noseY: 0.45, engine: 'v8', gears: 4, maxRpm: 6000, seats: 4, colors: C.std, tuning: 3 }),
  // ---- sedans
  D({ id: 'avanti_lx', name: 'Avanti LX', maker: 'Tessera', cls: 'sedan', price: 28000, mass: 1550, len: 4.9, wid: 1.85, hei: 1.45, wheelbase: 2.9, power: 150000, topSpeed: 58, drive: 'fwd', front: 0.58, colors: C.muted.concat(C.std), engine: 'v6', tuning: 2 }),
  D({ id: 'tern_200', name: 'Tern 200', maker: 'Nordam', cls: 'sedan', price: 21000, mass: 1350, len: 4.5, wid: 1.8, hei: 1.45, wheelbase: 2.7, power: 105000, topSpeed: 52, drive: 'fwd', front: 0.6, colors: C.std, engine: 'i4', tuning: 2 }),
  D({ id: 'comet', name: 'Comet', maker: 'Pico', cls: 'compact', price: 12000, mass: 1050, len: 3.7, wid: 1.65, hei: 1.5, wheelbase: 2.35, track: 1.42, wheelR: 0.3, power: 62000, topSpeed: 44, drive: 'fwd', front: 0.6, cabin: [0.35, -0.7], roofY: 1.0, colors: C.bright.concat(C.std), engine: 'i4', seats: 4, grip: 1.05, steer: 0.62 }),
  // ---- suv
  D({ id: 'ridgeback', name: 'Ridgeback', maker: 'Karoo', cls: 'suv', price: 44000, mass: 2250, len: 4.9, wid: 2.0, hei: 1.85, wheelbase: 2.95, track: 1.68, wheelR: 0.4, power: 210000, topSpeed: 58, drive: 'awd', cabin: [0.35, -0.9], roofY: 1.0, beltY: 0.52, noseY: 0.5, colors: C.muted, engine: 'v8', seats: 5, grip: 1.05, hp: 1400, tuning: 2 }),
  D({ id: 'mesa_x', name: 'Mesa X', maker: 'Karoo', cls: 'suv', price: 31000, mass: 1850, len: 4.6, wid: 1.9, hei: 1.7, wheelbase: 2.75, track: 1.6, wheelR: 0.37, power: 150000, topSpeed: 52, drive: 'awd', cabin: [0.3, -0.9], roofY: 1.0, noseY: 0.48, colors: C.std, engine: 'v6', seats: 5, grip: 1.05, hp: 1300 }),
  // ---- pickups
  D({ id: 'haul_150', name: 'Haul 150', maker: 'Brannock', cls: 'pickup', price: 36000, mass: 2100, len: 5.5, wid: 2.0, hei: 1.9, wheelbase: 3.4, track: 1.7, wheelR: 0.4, power: 220000, topSpeed: 56, cabin: [0.5, 0.0], roofY: 1.0, beltY: 0.52, noseY: 0.5, colors: C.std, engine: 'v8', seats: 3, grip: 1.0, hp: 1500, drive: 'awd', tuning: 2 }),
  D({ id: 'dune_runner', name: 'Dune Runner', maker: 'Brannock', cls: 'pickup', price: 29000, mass: 1700, len: 4.9, wid: 1.9, hei: 1.8, wheelbase: 3.0, track: 1.62, wheelR: 0.38, power: 150000, topSpeed: 50, cabin: [0.45, -0.1], roofY: 1.0, noseY: 0.5, colors: C.bright, engine: 'v6', seats: 2, grip: 1.0, hp: 1300 }),
  // ---- service / city
  D({ id: 'pd_cruiser', name: 'Interceptor', maker: 'PSPD', cls: 'police', price: 0, mass: 1750, len: 5.0, wid: 1.9, hei: 1.45, wheelbase: 2.95, power: 230000, topSpeed: 68, grip: 1.25, brake: 19000, colors: [0xf0f0f0], engine: 'v8', seats: 4, hp: 1200 }),
  D({ id: 'pd_suv', name: 'Enforcer', maker: 'PSPD', cls: 'police', price: 0, mass: 2200, len: 4.9, wid: 2.0, hei: 1.85, wheelbase: 2.95, wheelR: 0.4, power: 250000, topSpeed: 66, grip: 1.15, drive: 'awd', cabin: [0.35, -0.9], noseY: 0.5, colors: [0x15181d], engine: 'v8', seats: 5, hp: 1700 }),
  D({ id: 'swat_van', name: 'Bearcat', maker: 'PSPD', cls: 'swat', price: 0, mass: 5200, len: 5.6, wid: 2.3, hei: 2.4, wheelbase: 3.4, track: 1.9, wheelR: 0.48, power: 260000, topSpeed: 50, grip: 1.0, brake: 28000, cabin: [0.5, -0.95], roofY: 1.0, beltY: 0.55, noseY: 0.5, colors: [0x20242a], engine: 'diesel', seats: 6, hp: 3500 }),
  D({ id: 'ambulance', name: 'MedVan', maker: 'Rescue', cls: 'ambulance', price: 0, mass: 3200, len: 5.7, wid: 2.1, hei: 2.5, wheelbase: 3.6, track: 1.75, wheelR: 0.4, power: 170000, topSpeed: 46, cabin: [0.55, -0.9], roofY: 1.0, noseY: 0.55, colors: [0xf4f4f4], engine: 'diesel', seats: 3, hp: 1800 }),
  D({ id: 'taxi', name: 'Sol Cab', maker: 'Tessera', cls: 'taxi', price: 0, mass: 1550, len: 4.8, wid: 1.85, hei: 1.5, wheelbase: 2.85, power: 140000, topSpeed: 52, drive: 'fwd', front: 0.58, colors: [0xf2c200], engine: 'v6' }),
  D({ id: 'city_bus', name: 'Metro Bus', maker: 'Transit', cls: 'bus', price: 0, mass: 11000, len: 11.5, wid: 2.55, hei: 3.1, wheelbase: 6.0, track: 2.1, wheelR: 0.5, power: 220000, topSpeed: 28, grip: 0.9, brake: 40000, cabin: [0.9, -0.95], roofY: 1.0, beltY: 0.28, noseY: 0.3, colors: [0x2f6fb0, 0xc0502a], engine: 'diesel', seats: 30, hp: 4000, steer: 0.5 }),
  D({ id: 'delivery_van', name: 'Parcel Van', maker: 'Nordam', cls: 'van', price: 24000, mass: 2400, len: 5.4, wid: 2.0, hei: 2.4, wheelbase: 3.4, track: 1.7, wheelR: 0.38, power: 130000, topSpeed: 44, cabin: [0.55, -0.95], roofY: 1.0, noseY: 0.5, colors: [0xe8e8e8, 0x3a6ea5, 0xb0382a], engine: 'diesel', seats: 3, grip: 1.0, hp: 1500 }),
  D({ id: 'box_truck', name: 'Hauler', maker: 'Brannock', cls: 'truck', price: 33000, mass: 6500, len: 7.5, wid: 2.4, hei: 3.1, wheelbase: 4.6, track: 1.9, wheelR: 0.48, power: 200000, topSpeed: 36, cabin: [0.75, 0.35], roofY: 0.8, noseY: 0.5, colors: [0xe8e8e8, 0x8a8f96], engine: 'diesel', seats: 2, grip: 0.95, brake: 34000, hp: 2600, steer: 0.5 }),
  // ---- bikes
  D({ id: 'sparrow_600', name: 'Sparrow 600', maker: 'Kasumi', cls: 'bike', price: 14000, mass: 210, len: 2.05, wid: 0.75, hei: 1.1, wheelbase: 1.4, track: 0, wheelR: 0.31, power: 85000, topSpeed: 70, grip: 1.5, brake: 5500, cda: 0.4, steer: 0.5, front: 0.5, engine: 'bike', gears: 6, maxRpm: 12500, seats: 2, colors: C.bright, hp: 500, tuning: 2 }),
  D({ id: 'rook_1000', name: 'Rook 1000', maker: 'Kasumi', cls: 'bike', price: 26000, mass: 200, len: 2.1, wid: 0.75, hei: 1.1, wheelbase: 1.45, track: 0, wheelR: 0.31, power: 135000, topSpeed: 88, grip: 1.6, brake: 6000, cda: 0.38, steer: 0.45, front: 0.5, engine: 'bike', gears: 6, maxRpm: 13500, seats: 2, colors: C.bright, hp: 500, tuning: 3, nitro: true }),
  D({ id: 'mule_cruiser', name: 'Mule Cruiser', maker: 'Garrett', cls: 'bike', price: 18000, mass: 330, len: 2.4, wid: 0.85, hei: 1.15, wheelbase: 1.65, track: 0, wheelR: 0.33, power: 65000, topSpeed: 52, grip: 1.3, brake: 5000, cda: 0.55, steer: 0.5, front: 0.5, engine: 'bike2', gears: 5, maxRpm: 5800, seats: 2, colors: C.muted, hp: 600 }),
  // ---- water
  D({ id: 'skipper', name: 'Skipper 24', maker: 'Reef', cls: 'boat', price: 42000, mass: 1200, len: 7.2, wid: 2.4, hei: 1.8, wheelbase: 5, track: 0, wheelR: 0, power: 220000, topSpeed: 34, grip: 1, brake: 0, cda: 1, steer: 0.5, engine: 'boat', seats: 4, colors: [0xf4f4f4, 0x1f3a5f, 0xc0392b], hp: 900 }),
  D({ id: 'wavebreaker', name: 'Wavebreaker', maker: 'Reef', cls: 'boat', price: 180000, mass: 3800, len: 11, wid: 3.4, hei: 3, wheelbase: 8, track: 0, wheelR: 0, power: 520000, topSpeed: 28, grip: 1, brake: 0, cda: 1, steer: 0.4, engine: 'boat', seats: 6, colors: [0xf8f8f8, 0x111111], hp: 1800 }),
  D({ id: 'splash_ski', name: 'Splash 1100', maker: 'Reef', cls: 'jetski', price: 12000, mass: 380, len: 3.2, wid: 1.2, hei: 1.0, wheelbase: 2.4, track: 0, wheelR: 0, power: 110000, topSpeed: 30, grip: 1, brake: 0, cda: 1, steer: 0.55, engine: 'boat', seats: 2, colors: C.bright, hp: 400 }),
  // ---- air
  D({ id: 'kite_h3', name: 'Kite H3', maker: 'Aerolux', cls: 'heli', price: 290000, mass: 1600, len: 8.5, wid: 2.2, hei: 3.0, wheelbase: 4, track: 0, wheelR: 0, power: 400000, topSpeed: 62, grip: 1, brake: 0, cda: 1, steer: 0.5, engine: 'heli', seats: 4, colors: [0x1c1f26, 0xe8e8e8, 0xc0392b], hp: 1200 }),
];

export const VEHICLE_MAP = new Map(VEHICLES.map((v) => [v.id, v]));
export const defById = (id: string) => VEHICLE_MAP.get(id)!;

/** Civilian traffic mix weights (id → weight). */
export const TRAFFIC_MIX: [string, number][] = [
  ['tern_200', 14], ['avanti_lx', 10], ['comet', 8], ['mesa_x', 8], ['ridgeback', 4], ['haul_150', 5], ['dune_runner', 3], ['delivery_van', 3], ['box_truck', 1.5],
  ['taxi', 5], ['stallion_ss', 2], ['bruiser_70', 1], ['vexa_gt', 1], ['marlin_s', 1], ['kestrel_rs', 1], ['sparrow_600', 1.5], ['mule_cruiser', 1], ['city_bus', 2], ['volt_ev', 1], ['orsa_v12', 0.3],
];
