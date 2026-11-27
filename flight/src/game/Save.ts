// Persistent settings and career progress (localStorage, guarded).
export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  assist: 'assisted' | 'realistic';
  invertPitch: boolean; sensitivity: number; tilt: boolean;
  volume: number; voice: boolean; units: 'aviation' | 'metric';
  hud: boolean; touch: 'auto' | 'on' | 'off'; trees: boolean; timeScale: number;
}
export interface Career { completed: Record<string, number>; credits: number; hours: number; landings: number; unlockedAircraft: string[] }

function phoneDefault(): Settings['quality'] {
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (!touch) return 'medium';
  const mem = (navigator as any).deviceMemory ?? 4;
  return mem >= 8 && Math.min(screen.width, screen.height) * devicePixelRatio >= 1080 ? 'medium' : 'low';
}
const DEF_SETTINGS: Settings = {
  quality: phoneDefault(), assist: 'assisted', invertPitch: false, sensitivity: 1, tilt: false,
  volume: 0.8, voice: true, units: 'aviation', hud: true, touch: 'auto', trees: true, timeScale: 1,
};
const DEF_CAREER: Career = { completed: {}, credits: 0, hours: 0, landings: 0, unlockedAircraft: ['c172'] };

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); if (v) return { ...d, ...JSON.parse(v) }; } catch { /* ignore */ } return structuredClone(d); }
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

export const settings: Settings = load('skyward.settings', DEF_SETTINGS);
export const career: Career = load('skyward.career', DEF_CAREER);
export const saveSettings = () => save('skyward.settings', settings);
export const saveCareer = () => save('skyward.career', career);
export const isTouch = () => settings.touch === 'on' || (settings.touch === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));
export function resetCareer() { Object.assign(career, structuredClone(DEF_CAREER)); saveCareer(); }
