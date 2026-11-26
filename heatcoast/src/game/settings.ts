export type Preset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export interface Quality {
  name: Preset; pixelRatio: number; shadows: boolean; shadowSize: number; shadowRange: number; viewChunks: number; fogFar: number;
  bloom: boolean; clouds: boolean; rainDrops: number; traffic: number; peds: number; envEvery: number; antialias: boolean; waterSegs: number;
}
export const PRESETS: Record<Preset, Quality> = {
  LOW: { name: 'LOW', pixelRatio: 1, shadows: false, shadowSize: 512, shadowRange: 40, viewChunks: 2, fogFar: 520, bloom: false, clouds: false, rainDrops: 1500, traffic: 14, peds: 16, envEvery: 60, antialias: false, waterSegs: 64 },
  MEDIUM: { name: 'MEDIUM', pixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowRange: 55, viewChunks: 2, fogFar: 700, bloom: false, clouds: true, rainDrops: 3000, traffic: 22, peds: 26, envEvery: 30, antialias: false, waterSegs: 96 },
  HIGH: { name: 'HIGH', pixelRatio: 2, shadows: true, shadowSize: 2048, shadowRange: 75, viewChunks: 3, fogFar: 1000, bloom: true, clouds: true, rainDrops: 5000, traffic: 32, peds: 38, envEvery: 15, antialias: true, waterSegs: 128 },
  ULTRA: { name: 'ULTRA', pixelRatio: 2.5, shadows: true, shadowSize: 4096, shadowRange: 100, viewChunks: 4, fogFar: 1400, bloom: true, clouds: true, rainDrops: 8000, traffic: 44, peds: 52, envEvery: 8, antialias: true, waterSegs: 160 },
};

export interface SettingsData {
  preset: Preset | 'AUTO'; resScale: number; showFps: boolean; volMaster: number; volSfx: number; volMusic: number; sensitivity: number; invertY: boolean;
  vibration: boolean; buttonScale: number; buttonOpacity: number; subtitles: boolean; autoAim: boolean; cameraShake: boolean; touchMode: 'auto' | 'on' | 'off'; trafficDensity: number;
}
export const DEFAULT_SETTINGS: SettingsData = {
  preset: 'AUTO', resScale: 1, showFps: false, volMaster: 0.8, volSfx: 0.9, volMusic: 0.5, sensitivity: 1, invertY: false,
  vibration: true, buttonScale: 1, buttonOpacity: 0.75, subtitles: true, autoAim: true, cameraShake: true, touchMode: 'auto', trafficDensity: 1,
};
const KEY = 'heatcoast.settings';
export function loadSettings(): SettingsData {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { /* private mode */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: SettingsData) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
/** Guess a preset from the device. Phones start at MEDIUM/LOW; a frame-time governor refines later. */
export function recommendPreset(): Preset {
  const mem = (navigator as any).deviceMemory ?? 4, cores = navigator.hardwareConcurrency ?? 4;
  const touch = isTouchDevice();
  let gpu = '';
  try { const c = document.createElement('canvas').getContext('webgl2'); const ext = c?.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? String(c!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch { /* */ }
  const weak = /Mali-G5|Mali-T|Adreno \(TM\) [1-5]\d\d|PowerVR|SwiftShader|llvmpipe/i.test(gpu);
  if (touch) { if (weak || mem <= 3 || cores <= 4) return 'LOW'; if (/Adreno \(TM\) (7[3-9]\d|8\d\d)|Apple GPU|Immortalis|Mali-G7[1-9]/i.test(gpu) && mem >= 6) return 'HIGH'; return 'MEDIUM'; }
  if (weak) return 'LOW';
  return mem >= 8 ? 'HIGH' : 'MEDIUM';
}
