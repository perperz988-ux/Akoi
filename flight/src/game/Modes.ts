// Game mode definitions: career missions and landing challenges (real airports & runways).
export type Spawn = 'gate' | 'runway' | 'approach' | 'cruise' | 'air';
export interface Mission {
  id: string; title: string; brief: string; aircraft: string; dep: string; arr: string; depRwy?: string; arrRwy?: string;
  weather: string; hour: number; spawn: Spawn; reward: number; unlocks?: string[]; minScore?: number;
}
export const CAREER: Mission[] = [
  { id: 'c1', title: 'First Solo', brief: 'Take the Skyhawk from Santa Monica on a short coastal hop to Van Nuys. Calm winds, clear skies.', aircraft: 'c172', dep: 'KSMO', arr: 'KVNY', weather: 'clear', hour: 10, spawn: 'runway', reward: 400, unlocks: [] },
  { id: 'c2', title: 'Bay Tour', brief: 'Palo Alto to Oakland across the San Francisco Bay. Watch the scattered cumulus over the hills.', aircraft: 'c172', dep: 'KPAO', arr: 'KOAK', weather: 'few', hour: 15, spawn: 'gate', reward: 600, unlocks: ['cj4'] },
  { id: 'c3', title: 'Alpine Approach', brief: 'Fly the Citation from Zurich into Innsbruck through the Inn valley. Terrain is high on both sides.', aircraft: 'cj4', dep: 'LSZH', arr: 'LOWI', weather: 'scattered', hour: 11, spawn: 'runway', reward: 1200, unlocks: ['a20n'] },
  { id: 'c4', title: 'Shuttle to Heathrow', brief: 'Your first airline line: Amsterdam Schiphol to London Heathrow in the A320neo. Overcast at 2,000 ft.', aircraft: 'a20n', dep: 'EHAM', arr: 'EGLL', weather: 'overcast', hour: 8, spawn: 'gate', reward: 2000, unlocks: ['b738'] },
  { id: 'c5', title: 'Iberian Sunset', brief: 'Madrid to Lisbon at golden hour in the 737-800.', aircraft: 'b738', dep: 'LEMD', arr: 'LPPT', weather: 'few', hour: 18.5, spawn: 'runway', reward: 2400, unlocks: [] },
  { id: 'c6', title: 'Rainy Frankfurt', brief: 'Munich to Frankfurt in steady rain with a low ceiling. Use the approach mode or fly it by hand.', aircraft: 'b738', dep: 'EDDM', arr: 'EDDF', weather: 'rain', hour: 13, spawn: 'runway', reward: 3000, unlocks: ['a333'] },
  { id: 'c7', title: 'Gulf Heat', brief: 'Doha to Dubai in the A330-300. Hot, hazy, and busy.', aircraft: 'a333', dep: 'OTHH', arr: 'OMDB', weather: 'clear', hour: 16, spawn: 'runway', reward: 3600, unlocks: ['b789'] },
  { id: 'c8', title: 'Night into Haneda', brief: 'Seoul Incheon to Tokyo Haneda at night in the 787-9.', aircraft: 'b789', dep: 'RKSI', arr: 'RJTT', weather: 'few', hour: 21, spawn: 'runway', reward: 4500, unlocks: ['a359'] },
  { id: 'c9', title: 'Down Under', brief: 'Sydney to Melbourne in the A350-900 with gusty crosswinds at the destination.', aircraft: 'a359', dep: 'YSSY', arr: 'YMML', weather: 'windy', hour: 9, spawn: 'runway', reward: 5000, unlocks: ['b77w'] },
  { id: 'c10', title: 'Big Twin, Big Storm', brief: 'Hong Kong to Taipei in the 777-300ER with thunderstorms on the arrival.', aircraft: 'b77w', dep: 'VHHH', arr: 'RCTP', weather: 'storm', hour: 17, spawn: 'runway', reward: 6500, unlocks: ['b748'] },
  { id: 'c11', title: 'Queen of the Skies', brief: 'Frankfurt to London Heathrow in the 747-8. Heavy, slow to respond — plan ahead.', aircraft: 'b748', dep: 'EDDF', arr: 'EGLL', weather: 'scattered', hour: 12, spawn: 'runway', reward: 8000, unlocks: [] },
  { id: 'c12', title: 'Polar Fog', brief: 'Reykjavik Keflavik to Oslo in snow, landing in low visibility.', aircraft: 'b748', dep: 'BIKF', arr: 'ENGM', weather: 'snow', hour: 10, spawn: 'cruise', reward: 10000, unlocks: [] },
];

export interface Challenge { id: string; title: string; brief: string; aircraft: string; airport: string; rwy: string; weather: string; hour: number; distNm: number }
export const CHALLENGES: Challenge[] = [
  { id: 'l1', title: 'Santa Monica Sunday', brief: 'Gentle conditions. Learn the sight picture: two white, two red on the PAPI.', aircraft: 'c172', airport: 'KSMO', rwy: '21', weather: 'clear', hour: 11, distNm: 4 },
  { id: 'l2', title: 'Innsbruck Valley', brief: 'Land on 26 between the Alps. Steep terrain, gusty valley winds.', aircraft: 'cj4', airport: 'LOWI', rwy: '26', weather: 'windy', hour: 14, distNm: 8 },
  { id: 'l3', title: 'SFO in the Fog', brief: '28L in classic San Francisco fog. 300 m visibility — trust the instruments.', aircraft: 'a20n', airport: 'KSFO', rwy: '28L', weather: 'fog', hour: 7, distNm: 8 },
  { id: 'l4', title: 'Heathrow Crosswind', brief: '27L with a 28-knot crosswind gusting 42. Crab, then de-crab in the flare.', aircraft: 'b738', airport: 'EGLL', rwy: '27L', weather: 'windy', hour: 16, distNm: 8 },
  { id: 'l5', title: 'Hong Kong Storm', brief: '07R with thunderstorms in the area. Heavy rain, lightning, severe turbulence.', aircraft: 'b77w', airport: 'VHHH', rwy: '07R', weather: 'storm', hour: 19, distNm: 10 },
  { id: 'l6', title: 'Queenstown Night', brief: 'NZQN runway 23 at night, surrounded by mountains. Lights and PAPI are your friends.', aircraft: 'a20n', airport: 'NZQN', rwy: '23', weather: 'clear', hour: 22, distNm: 7 },
  { id: 'l7', title: 'Madeira Approach', brief: 'Funchal 05 — a famously short, demanding runway on a cliff above the Atlantic.', aircraft: 'a20n', airport: 'LPMA', rwy: '05', weather: 'windy', hour: 12, distNm: 6 },
  { id: 'l8', title: 'Heavy Snow at Oslo', brief: 'ENGM 01L in snowfall. Braking action is poor.', aircraft: 'b748', airport: 'ENGM', rwy: '01L', weather: 'snow', hour: 15, distNm: 10 },
  { id: 'l9', title: 'Sunset at St Maarten', brief: 'TNCM 10 over Maho Beach at golden hour.', aircraft: 'b789', airport: 'TNCM', rwy: '10', weather: 'few', hour: 18.2, distNm: 7 },
];
