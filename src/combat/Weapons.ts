export type WeaponKind = 'melee' | 'ranged' | 'throw' | 'taser';
export interface WeaponDef {
  id: string; name: string; kind: WeaponKind; damage: number; rate: number; // shots per second
  spread: number; range: number; mag: number; pellets: number; auto: boolean; noise: number; price: number; ammoPrice: number;
  nonLethal?: boolean; model: string; reload: number; recoil: number; explosive?: boolean; reach?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  fists: { id: 'fists', name: 'Fists', kind: 'melee', damage: 12, rate: 2.6, spread: 0, range: 1.7, mag: 0, pellets: 1, auto: true, noise: 10, price: 0, ammoPrice: 0, model: 'none', reload: 0, recoil: 0, nonLethal: true, reach: 1.7 },
  slugger: { id: 'slugger', name: 'Slugger Bat', kind: 'melee', damage: 28, rate: 1.7, spread: 0, range: 2.2, mag: 0, pellets: 1, auto: true, noise: 14, price: 150, ammoPrice: 0, model: 'bat', reload: 0, recoil: 0, nonLethal: true, reach: 2.2 },
  zap: { id: 'zap', name: 'Zap-X Taser', kind: 'taser', damage: 5, rate: 0.8, spread: 0.01, range: 14, mag: 2, pellets: 1, auto: false, noise: 8, price: 400, ammoPrice: 20, model: 'taser', reload: 1.4, recoil: 0.02, nonLethal: true },
  vigil9: { id: 'vigil9', name: 'Vigil-9 Pistol', kind: 'ranged', damage: 22, rate: 3.5, spread: 0.018, range: 70, mag: 12, pellets: 1, auto: false, noise: 55, price: 600, ammoPrice: 15, model: 'pistol', reload: 1.3, recoil: 0.03 },
  rattler: { id: 'rattler', name: 'Rattler SMG', kind: 'ranged', damage: 14, rate: 11, spread: 0.045, range: 55, mag: 30, pellets: 1, auto: true, noise: 62, price: 2400, ammoPrice: 25, model: 'smg', reload: 1.7, recoil: 0.025 },
  brawler: { id: 'brawler', name: 'Brawler Shotgun', kind: 'ranged', damage: 11, rate: 1.1, spread: 0.1, range: 28, mag: 6, pellets: 9, auto: false, noise: 75, price: 3200, ammoPrice: 30, model: 'shotgun', reload: 2.2, recoil: 0.09 },
  longarm: { id: 'longarm', name: 'Longarm Rifle', kind: 'ranged', damage: 24, rate: 8, spread: 0.022, range: 130, mag: 30, pellets: 1, auto: true, noise: 80, price: 5800, ammoPrice: 35, model: 'rifle', reload: 2.0, recoil: 0.03 },
  cinder: { id: 'cinder', name: 'Cinder Grenade', kind: 'throw', damage: 140, rate: 0.8, spread: 0, range: 24, mag: 1, pellets: 1, auto: false, noise: 90, price: 900, ammoPrice: 120, model: 'grenade', reload: 0.6, recoil: 0, explosive: true },
};
export const WEAPON_ORDER = ['fists', 'slugger', 'zap', 'vigil9', 'rattler', 'brawler', 'longarm', 'cinder'];
export const weapon = (id: string) => WEAPONS[id];

export interface Loadout { owned: string[]; ammo: Record<string, number>; mag: Record<string, number>; current: string }
export const defaultLoadout = (): Loadout => ({ owned: ['fists', 'vigil9'], ammo: { vigil9: 48 }, mag: { vigil9: 12 }, current: 'fists' });
