// Aircraft specifications. Dimensions, weights, thrust and speeds come from manufacturer
// airport-planning documents and public spec sheets (Boeing, Airbus, Textron), cross-checked
// against secondary references. Aerodynamic coefficients are engineering estimates tuned so
// that published Vr/Vref, climb and cruise numbers are reproduced by the flight model.
export type Cockpit = 'boeing' | 'boeing787' | 'airbus' | 'ga' | 'bizjet';
export type FlightControl = 'direct' | 'boeing' | 'fbw';

export interface AircraftSpec {
  id: string; name: string; maker: string; category: 'Airliner' | 'Widebody' | 'General Aviation' | 'Business Jet';
  description: string;
  // geometry (m)
  length: number; span: number; height: number; wingArea: number; fuselageD: number; fuselageW?: number;
  sweep: number; dihedral: number; rootChord: number; tipChord: number; wingX: number; // wing root LE from nose (fraction of length)
  wingMount: 'low' | 'high'; tail: 'conventional' | 't-tail';
  htSpan: number; htSweep: number; vtHeight: number; vtSweep: number;
  tip: 'blended' | 'sharklet' | 'raked' | 'winglet' | 'curved' | 'none';
  engines: { count: number; type: 'turbofan' | 'piston'; mount: 'wing' | 'rear' | 'nose'; span: number[]; nacelleD: number; nacelleL: number; fanD: number; name: string };
  gear: { mainWheels: number; mainBogies: number; track: number; wheelbase: number; height: number; fixed?: boolean; wheelD: number };
  hump?: boolean; noseStyle: 'boeing' | 'airbus' | '787' | 'ga' | 'bizjet';
  windowsRows: number; doors: number;
  // mass (kg)
  mtow: number; oew: number; fuelMax: number; mlw: number;
  // propulsion
  thrustN: number; // per engine, static sea level (turbofan); for piston: power in W
  bypass: number; spoolUp: number; tsfc: number; // kg/(N*h) for turbofan or kg/(W*h) for piston
  // aero
  cd0: number; oswald: number; clMaxClean: number; clMaxFull: number; alphaStall: number; mcrit: number;
  flapDetents: string[]; flapCL: number[]; flapCD: number[];
  // speeds (knots IAS unless noted)
  vr: number; vref: number; vs0: number; vmo: number; mmo: number; cruiseMach: number; cruiseKtas: number; cruiseAltFt: number; ceilingFt: number;
  climbRateFpm: number; rangeNm: number;
  control: FlightControl; cockpit: Cockpit;
  inertiaScale: number; controlPower: number; // feel tuning
  seats: string;
  sources: string[];
}

const BOEING_FLAPS = ['UP', '1', '5', '15', '25', '30', '40'];
const AIRBUS_FLAPS = ['0', '1', '1+F', '2', '3', 'FULL'];

export const AIRCRAFT: AircraftSpec[] = [
  {
    id: 'c172', name: 'Cessna 172S Skyhawk', maker: 'Cessna (Textron Aviation)', category: 'General Aviation',
    description: 'Four-seat, high-wing piston trainer — the most-produced aircraft in history. Forgiving, slow, and the best way to learn the world.',
    length: 8.28, span: 11.0, height: 2.72, wingArea: 16.2, fuselageD: 1.15, fuselageW: 1.12, sweep: 0, dihedral: 1.7, rootChord: 1.63, tipChord: 1.13, wingX: 0.28,
    wingMount: 'high', tail: 'conventional', htSpan: 3.45, htSweep: 6, vtHeight: 1.55, vtSweep: 35, tip: 'none',
    engines: { count: 1, type: 'piston', mount: 'nose', span: [0], nacelleD: 1.0, nacelleL: 1.5, fanD: 1.93, name: 'Lycoming IO-360-L2A, 180 hp' },
    gear: { mainWheels: 1, mainBogies: 2, track: 2.5, wheelbase: 1.65, height: 0.9, fixed: true, wheelD: 0.42 },
    noseStyle: 'ga', windowsRows: 0, doors: 2,
    mtow: 1157, oew: 767, fuelMax: 144, mlw: 1157,
    thrustN: 134000, bypass: 0, spoolUp: 0.6, tsfc: 0.000265,
    cd0: 0.032, oswald: 0.75, clMaxClean: 1.45, clMaxFull: 2.0, alphaStall: 16, mcrit: 0.6,
    flapDetents: ['0°', '10°', '20°', '30°'], flapCL: [0, 0.22, 0.42, 0.55], flapCD: [0, 0.008, 0.022, 0.04],
    vr: 55, vref: 65, vs0: 40, vmo: 163, mmo: 0.3, cruiseMach: 0.19, cruiseKtas: 124, cruiseAltFt: 8500, ceilingFt: 14000,
    climbRateFpm: 730, rangeNm: 640, control: 'direct', cockpit: 'ga', inertiaScale: 1, controlPower: 1.1, seats: '4',
    sources: ['Cessna 172S POH (Vr 55 KIAS, Vso 40 KIAS, 124 kt cruise at 75%/8,500 ft)', 'AOPA aircraft fact sheet'],
  },
  {
    id: 'cj4', name: 'Cessna Citation CJ4', maker: 'Cessna (Textron Aviation)', category: 'Business Jet',
    description: 'Light-midsize twinjet with a 12.5° swept wing and T-tail. Fast, nimble and certified single-pilot.',
    length: 16.26, span: 15.77, height: 4.67, wingArea: 30.66, fuselageD: 1.75, sweep: 12.5, dihedral: 4, rootChord: 2.7, tipChord: 1.1, wingX: 0.40,
    wingMount: 'low', tail: 't-tail', htSpan: 6.4, htSweep: 25, vtHeight: 2.7, vtSweep: 40, tip: 'none',
    engines: { count: 2, type: 'turbofan', mount: 'rear', span: [0], nacelleD: 0.85, nacelleL: 2.4, fanD: 0.6, name: 'Williams FJ44-4A, 3,621 lbf' },
    gear: { mainWheels: 1, mainBogies: 2, track: 3.4, wheelbase: 6.4, height: 1.1, wheelD: 0.55 },
    noseStyle: 'bizjet', windowsRows: 7, doors: 1,
    mtow: 7761, oew: 4835, fuelMax: 2650, mlw: 7103,
    thrustN: 16110, bypass: 3.3, spoolUp: 4, tsfc: 0.052,
    cd0: 0.022, oswald: 0.78, clMaxClean: 1.4, clMaxFull: 2.05, alphaStall: 15, mcrit: 0.74,
    flapDetents: ['UP', '15', '35'], flapCL: [0, 0.35, 0.65], flapCD: [0, 0.012, 0.05],
    vr: 108, vref: 115, vs0: 90, vmo: 305, mmo: 0.77, cruiseMach: 0.75, cruiseKtas: 451, cruiseAltFt: 41000, ceilingFt: 45000,
    climbRateFpm: 3854, rangeNm: 2165, control: 'boeing', cockpit: 'bizjet', inertiaScale: 1, controlPower: 1.0, seats: '9-10',
    sources: ['Textron Aviation CJ4 Gen2/Gen3 product cards (MTOW 17,110 lb, 451 KTAS, 45,000 ft, FJ44-4A 3,621 lbf)', 'AIN pilot report 2020'],
  },
  {
    id: 'a20n', name: 'Airbus A320neo', maker: 'Airbus', category: 'Airliner',
    description: 'Fly-by-wire single-aisle with sharklets and new-engine option (CFM LEAP-1A / PW1100G). Sidestick, normal-law protections.',
    length: 37.57, span: 35.8, height: 11.76, wingArea: 122.6, fuselageD: 3.95, sweep: 25, dihedral: 5.1, rootChord: 6.1, tipChord: 1.5, wingX: 0.35,
    wingMount: 'low', tail: 'conventional', htSpan: 12.45, htSweep: 29, vtHeight: 6.3, vtSweep: 34, tip: 'sharklet',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.34], nacelleD: 2.45, nacelleL: 4.6, fanD: 1.98, name: 'CFM LEAP-1A26, 26,600 lbf' },
    gear: { mainWheels: 2, mainBogies: 2, track: 7.59, wheelbase: 12.64, height: 2.0, wheelD: 1.14 },
    noseStyle: 'airbus', windowsRows: 30, doors: 4,
    mtow: 79000, oew: 44300, fuelMax: 18700, mlw: 67400,
    thrustN: 120600, bypass: 11, spoolUp: 6, tsfc: 0.051,
    cd0: 0.0205, oswald: 0.8, clMaxClean: 1.45, clMaxFull: 2.8, alphaStall: 15, mcrit: 0.79,
    flapDetents: AIRBUS_FLAPS, flapCL: [0, 0.35, 0.55, 0.8, 1.0, 1.3], flapCD: [0, 0.006, 0.012, 0.025, 0.04, 0.07],
    vr: 143, vref: 134, vs0: 105, vmo: 350, mmo: 0.82, cruiseMach: 0.78, cruiseKtas: 450, cruiseAltFt: 36000, ceilingFt: 39800,
    climbRateFpm: 2500, rangeNm: 3400, control: 'fbw', cockpit: 'airbus', inertiaScale: 1, controlPower: 1, seats: '150-194',
    sources: ['Airbus A320neo aircraft page (length 37.57 m, span 35.80 m, MTOW 79.0 t)', 'SKYbrary A20N'],
  },
  {
    id: 'b738', name: 'Boeing 737-800', maker: 'Boeing', category: 'Airliner',
    description: 'Next-Generation 737 with blended winglets and CFM56-7B engines. Conventional yoke, hydraulic flight controls.',
    length: 39.47, span: 35.79, height: 12.55, wingArea: 124.6, fuselageD: 3.76, sweep: 25, dihedral: 6, rootChord: 7.3, tipChord: 1.25, wingX: 0.36,
    wingMount: 'low', tail: 'conventional', htSpan: 14.35, htSweep: 30, vtHeight: 7.0, vtSweep: 35, tip: 'blended',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.32], nacelleD: 2.1, nacelleL: 4.4, fanD: 1.55, name: 'CFM56-7B27, 27,300 lbf' },
    gear: { mainWheels: 2, mainBogies: 2, track: 5.72, wheelbase: 15.6, height: 1.6, wheelD: 1.12 },
    noseStyle: 'boeing', windowsRows: 32, doors: 4,
    mtow: 79010, oew: 41413, fuelMax: 20894, mlw: 66361,
    thrustN: 121400, bypass: 5.1, spoolUp: 6, tsfc: 0.065,
    cd0: 0.0215, oswald: 0.79, clMaxClean: 1.45, clMaxFull: 2.75, alphaStall: 15, mcrit: 0.78,
    flapDetents: BOEING_FLAPS, flapCL: [0, 0.25, 0.5, 0.7, 0.9, 1.1, 1.3], flapCD: [0, 0.005, 0.01, 0.02, 0.035, 0.05, 0.075],
    vr: 150, vref: 145, vs0: 110, vmo: 340, mmo: 0.82, cruiseMach: 0.785, cruiseKtas: 453, cruiseAltFt: 35000, ceilingFt: 41000,
    climbRateFpm: 2500, rangeNm: 2935, control: 'boeing', cockpit: 'boeing', inertiaScale: 1, controlPower: 1, seats: '162-189',
    sources: ['Boeing 737 Airplane Characteristics for Airport Planning', 'Boeing Commercial Airplanes Reference Guide'],
  },
  {
    id: 'b789', name: 'Boeing 787-9 Dreamliner', maker: 'Boeing', category: 'Widebody',
    description: 'Composite long-haul twin with raked wingtips and flexing wings. GEnx-1B / Trent 1000 engines with chevron nacelles.',
    length: 62.81, span: 60.12, height: 17.02, wingArea: 360.5, fuselageD: 5.77, sweep: 32.2, dihedral: 6, rootChord: 11.5, tipChord: 1.9, wingX: 0.37,
    wingMount: 'low', tail: 'conventional', htSpan: 20.2, htSweep: 35, vtHeight: 9.0, vtSweep: 40, tip: 'raked',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.33], nacelleD: 3.4, nacelleL: 6.0, fanD: 2.82, name: 'GE GEnx-1B74/75, 74,100 lbf' },
    gear: { mainWheels: 4, mainBogies: 2, track: 9.8, wheelbase: 25.6, height: 2.3, wheelD: 1.3 },
    noseStyle: '787', windowsRows: 50, doors: 8,
    mtow: 254692, oew: 128850, fuelMax: 101456, mlw: 192777,
    thrustN: 330000, bypass: 9.3, spoolUp: 7, tsfc: 0.054,
    cd0: 0.0185, oswald: 0.82, clMaxClean: 1.45, clMaxFull: 2.6, alphaStall: 14, mcrit: 0.86,
    flapDetents: BOEING_FLAPS.filter(f => f !== '40'), flapCL: [0, 0.25, 0.5, 0.75, 1.0, 1.2], flapCD: [0, 0.005, 0.012, 0.022, 0.04, 0.06],
    vr: 158, vref: 145, vs0: 115, vmo: 360, mmo: 0.9, cruiseMach: 0.85, cruiseKtas: 488, cruiseAltFt: 39000, ceilingFt: 43000,
    climbRateFpm: 2300, rangeNm: 7530, control: 'boeing', cockpit: 'boeing787', inertiaScale: 1, controlPower: 0.95, seats: '290',
    sources: ['Boeing 787 Airport Planning, Rev A (MTOW 561,500 lb, span 60.12 m, length 62.81 m)'],
  },
  {
    id: 'a333', name: 'Airbus A330-300', maker: 'Airbus', category: 'Widebody',
    description: 'Proven widebody twin with winglets. Fly-by-wire, sidestick, shares cockpit commonality with the A320 family.',
    length: 63.66, span: 60.3, height: 16.79, wingArea: 361.6, fuselageD: 5.64, sweep: 30, dihedral: 5.5, rootChord: 10.6, tipChord: 2.0, wingX: 0.37,
    wingMount: 'low', tail: 'conventional', htSpan: 19.06, htSweep: 31, vtHeight: 9.4, vtSweep: 40, tip: 'winglet',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.32], nacelleD: 3.0, nacelleL: 5.6, fanD: 2.47, name: 'Rolls-Royce Trent 772B, 71,100 lbf' },
    gear: { mainWheels: 4, mainBogies: 2, track: 10.69, wheelbase: 25.4, height: 2.4, wheelD: 1.27 },
    noseStyle: 'airbus', windowsRows: 50, doors: 8,
    mtow: 242000, oew: 129400, fuelMax: 78000, mlw: 187000,
    thrustN: 316000, bypass: 4.9, spoolUp: 7.5, tsfc: 0.058,
    cd0: 0.0195, oswald: 0.8, clMaxClean: 1.45, clMaxFull: 2.65, alphaStall: 14, mcrit: 0.83,
    flapDetents: AIRBUS_FLAPS, flapCL: [0, 0.3, 0.5, 0.75, 1.0, 1.25], flapCD: [0, 0.006, 0.012, 0.024, 0.04, 0.065],
    vr: 150, vref: 138, vs0: 110, vmo: 330, mmo: 0.86, cruiseMach: 0.82, cruiseKtas: 470, cruiseAltFt: 37000, ceilingFt: 41450,
    climbRateFpm: 2200, rangeNm: 6350, control: 'fbw', cockpit: 'airbus', inertiaScale: 1, controlPower: 0.95, seats: '277-300',
    sources: ['Airbus A330 Facts and Figures (June 2023)', 'Airbus A330 Aircraft Characteristics'],
  },
  {
    id: 'a359', name: 'Airbus A350-900', maker: 'Airbus', category: 'Widebody',
    description: 'Carbon-fibre long-hauler with curved wingtips, adaptive wing and Trent XWB engines. The quietest widebody in the sky.',
    length: 66.8, span: 64.75, height: 17.05, wingArea: 442, fuselageD: 5.96, sweep: 31.9, dihedral: 5.5, rootChord: 12, tipChord: 2.0, wingX: 0.37,
    wingMount: 'low', tail: 'conventional', htSpan: 18.9, htSweep: 32, vtHeight: 9.0, vtSweep: 40, tip: 'curved',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.33], nacelleD: 3.6, nacelleL: 6.2, fanD: 3.0, name: 'Rolls-Royce Trent XWB-84, 84,200 lbf' },
    gear: { mainWheels: 4, mainBogies: 2, track: 10.6, wheelbase: 28.7, height: 2.4, wheelD: 1.35 },
    noseStyle: 'airbus', windowsRows: 52, doors: 8,
    mtow: 283000, oew: 142400, fuelMax: 110500, mlw: 207000,
    thrustN: 374500, bypass: 9.3, spoolUp: 7, tsfc: 0.052,
    cd0: 0.018, oswald: 0.83, clMaxClean: 1.45, clMaxFull: 2.65, alphaStall: 14, mcrit: 0.87,
    flapDetents: AIRBUS_FLAPS, flapCL: [0, 0.3, 0.5, 0.75, 1.0, 1.25], flapCD: [0, 0.006, 0.012, 0.024, 0.04, 0.065],
    vr: 150, vref: 140, vs0: 110, vmo: 340, mmo: 0.89, cruiseMach: 0.85, cruiseKtas: 488, cruiseAltFt: 39000, ceilingFt: 43100,
    climbRateFpm: 2300, rangeNm: 8100, control: 'fbw', cockpit: 'airbus', inertiaScale: 1, controlPower: 0.95, seats: '300-350',
    sources: ['Airbus A350-900 aircraft page (MTOW 283 t, range 8,100 nm)', 'Airbus A350 Aircraft Characteristics'],
  },
  {
    id: 'b77w', name: 'Boeing 777-300ER', maker: 'Boeing', category: 'Widebody',
    description: 'The big twin. Raked wingtips, six-wheel main bogies and the enormous GE90-115B — the most powerful jet engine in service.',
    length: 73.9, span: 64.8, height: 18.5, wingArea: 436.8, fuselageD: 6.2, sweep: 31.6, dihedral: 6, rootChord: 13.0, tipChord: 2.2, wingX: 0.38,
    wingMount: 'low', tail: 'conventional', htSpan: 21.5, htSweep: 32, vtHeight: 9.4, vtSweep: 40, tip: 'raked',
    engines: { count: 2, type: 'turbofan', mount: 'wing', span: [0.31], nacelleD: 3.95, nacelleL: 7.3, fanD: 3.25, name: 'GE90-115B, 115,300 lbf' },
    gear: { mainWheels: 6, mainBogies: 2, track: 10.97, wheelbase: 31.2, height: 2.5, wheelD: 1.32 },
    noseStyle: 'boeing', windowsRows: 58, doors: 10,
    mtow: 351534, oew: 167829, fuelMax: 145538, mlw: 251290,
    thrustN: 513000, bypass: 8.9, spoolUp: 8, tsfc: 0.055,
    cd0: 0.0185, oswald: 0.82, clMaxClean: 1.45, clMaxFull: 2.6, alphaStall: 14, mcrit: 0.85,
    flapDetents: ['UP', '1', '5', '15', '20', '25', '30'], flapCL: [0, 0.25, 0.5, 0.7, 0.85, 1.05, 1.25], flapCD: [0, 0.005, 0.01, 0.02, 0.03, 0.045, 0.065],
    vr: 165, vref: 150, vs0: 120, vmo: 330, mmo: 0.89, cruiseMach: 0.84, cruiseKtas: 482, cruiseAltFt: 37000, ceilingFt: 43100,
    climbRateFpm: 2000, rangeNm: 7370, control: 'boeing', cockpit: 'boeing787', inertiaScale: 1.05, controlPower: 0.9, seats: '350-396',
    sources: ['Boeing 777 Airplane Characteristics for Airport Planning (MTOW 775,000 lb)', 'Boeing 777 design highlights (Mach 0.84)'],
  },
  {
    id: 'b748', name: 'Boeing 747-8 Intercontinental', maker: 'Boeing', category: 'Widebody',
    description: 'Queen of the Skies, stretched. Four GEnx-2B engines, the iconic upper-deck hump and raked wingtips. Heavy, majestic, and demanding.',
    length: 76.25, span: 68.45, height: 19.4, wingArea: 554, fuselageD: 6.5, sweep: 37.5, dihedral: 7, rootChord: 15.5, tipChord: 3.0, wingX: 0.34,
    wingMount: 'low', tail: 'conventional', htSpan: 22.2, htSweep: 37, vtHeight: 10.2, vtSweep: 45, tip: 'raked',
    engines: { count: 4, type: 'turbofan', mount: 'wing', span: [0.24, 0.42], nacelleD: 3.2, nacelleL: 5.8, fanD: 2.66, name: 'GE GEnx-2B67, 66,500 lbf' },
    gear: { mainWheels: 4, mainBogies: 4, track: 11.0, wheelbase: 29.7, height: 2.6, wheelD: 1.32 },
    hump: true, noseStyle: 'boeing', windowsRows: 60, doors: 10,
    mtow: 447700, oew: 220128, fuelMax: 193000, mlw: 312000,
    thrustN: 296000, bypass: 8.0, spoolUp: 8, tsfc: 0.056,
    cd0: 0.019, oswald: 0.8, clMaxClean: 1.45, clMaxFull: 2.55, alphaStall: 14, mcrit: 0.87,
    flapDetents: ['UP', '1', '5', '10', '20', '25', '30'], flapCL: [0, 0.25, 0.5, 0.65, 0.85, 1.05, 1.2], flapCD: [0, 0.005, 0.01, 0.017, 0.03, 0.045, 0.06],
    vr: 168, vref: 155, vs0: 125, vmo: 365, mmo: 0.9, cruiseMach: 0.855, cruiseKtas: 493, cruiseAltFt: 35000, ceilingFt: 43100,
    climbRateFpm: 1800, rangeNm: 7730, control: 'boeing', cockpit: 'boeing', inertiaScale: 1.15, controlPower: 0.85, seats: '410-467',
    sources: ['Boeing 747-8 Airport Planning (span 68.45 m, length 76.25 m, MTOW 447.7 t)'],
  },
];

export const aircraftById = (id: string) => AIRCRAFT.find(a => a.id === id) ?? AIRCRAFT[0];

// Fictional airline liveries in the style of real-world schemes (no real trademarks).
export interface Livery { id: string; name: string; body: string; belly: string; tail: string; tail2: string; stripe: string; engine: string; text: string; textColor: string; style: 'cheatline' | 'swoosh' | 'billboard' | 'eurowhite' | 'ga' }
export const LIVERIES: Livery[] = [
  { id: 'house', name: 'Skyward House', body: '#f4f5f7', belly: '#c9ced6', tail: '#0d2a4a', tail2: '#2b8ad8', stripe: '#2b8ad8', engine: '#0d2a4a', text: 'SKYWARD', textColor: '#0d2a4a', style: 'swoosh' },
  { id: 'atlas', name: 'Atlas Pacific', body: '#ffffff', belly: '#ffffff', tail: '#7a1424', tail2: '#c9a227', stripe: '#7a1424', engine: '#d8d8d8', text: 'ATLAS PACIFIC', textColor: '#7a1424', style: 'eurowhite' },
  { id: 'nordic', name: 'Nordic Air', body: '#f2f2f2', belly: '#1b2d55', tail: '#1b2d55', tail2: '#d23a2b', stripe: '#d23a2b', engine: '#1b2d55', text: 'NORDIC', textColor: '#1b2d55', style: 'cheatline' },
  { id: 'meridian', name: 'Meridian', body: '#e9edf1', belly: '#8a96a3', tail: '#0f6b5b', tail2: '#e1b12c', stripe: '#0f6b5b', engine: '#e9edf1', text: 'MERIDIAN', textColor: '#0f6b5b', style: 'cheatline' },
  { id: 'sunrise', name: 'Sunrise Express', body: '#ffffff', belly: '#ff7a1a', tail: '#ff7a1a', tail2: '#ffd21f', stripe: '#ff7a1a', engine: '#ff7a1a', text: 'sunrise', textColor: '#ff7a1a', style: 'billboard' },
  { id: 'aurora', name: 'Aurora Intl', body: '#2b2f3a', belly: '#2b2f3a', tail: '#d4af37', tail2: '#2b2f3a', stripe: '#d4af37', engine: '#2b2f3a', text: 'AURORA', textColor: '#d4af37', style: 'billboard' },
  { id: 'cargo', name: 'Polar Freight', body: '#f6f6f6', belly: '#4a4f57', tail: '#1e7fc1', tail2: '#17324f', stripe: '#4a4f57', engine: '#9aa3ad', text: 'POLAR FREIGHT', textColor: '#17324f', style: 'eurowhite' },
  { id: 'ga', name: 'Classic White/Blue', body: '#fafafa', belly: '#fafafa', tail: '#fafafa', tail2: '#1f4e9c', stripe: '#1f4e9c', engine: '#fafafa', text: '', textColor: '#1f4e9c', style: 'ga' },
  { id: 'garnet', name: 'Garnet/Gold', body: '#fbfaf7', belly: '#fbfaf7', tail: '#7a1424', tail2: '#c9a227', stripe: '#7a1424', engine: '#fbfaf7', text: '', textColor: '#7a1424', style: 'ga' },
];
export const liveryById = (id: string) => LIVERIES.find(l => l.id === id) ?? LIVERIES[0];
export const defaultLivery = (ac: AircraftSpec) => ac.category === 'General Aviation' ? 'ga' : ac.category === 'Business Jet' ? 'aurora' : 'house';

// Calibrate high-lift for transport jets so approach attitude (~+2.5°) and Vref/Vs ratios match real data.
for (const a of AIRCRAFT) {
  if (a.category === 'Airliner' || a.category === 'Widebody') {
    a.flapCL = a.flapCL.map(v => v * 0.75);
    a.clMaxFull = a.clMaxClean + a.flapCL[a.flapCL.length - 1] * 1.08;
  }
}
