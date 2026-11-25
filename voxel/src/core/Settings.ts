// Persistent user settings and graphics presets.
export type Preset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface ButtonLayout { x: number; y: number; s: number }

export interface Settings {
  language: 'en' | 'es';
  preset: Preset;
  renderDistance: number;
  lodDistance: number;
  shadows: boolean;
  shadowSize: number;
  fancyLeaves: boolean;
  clouds: boolean;
  particles: number;
  resolution: number;
  antialias: boolean;
  fov: number;
  brightness: number;
  viewBobbing: boolean;
  showFps: boolean;
  performanceMode: boolean;
  targetFps: 30 | 60;
  sensitivity: number;
  invertY: boolean;
  padSensitivity: number;
  padDeadzone: number;
  touchSize: number;
  touchOpacity: number;
  layout: Record<string, ButtonLayout>;
  layoutVersion: number;
  tapToPlace: boolean;
  holdToBreak: boolean;
  aimMode: 'crosshair' | 'touch';
  controlScheme: 'bedrock' | 'joystick';
  autoJump: boolean;
  sneakToggle: boolean;
  leftHanded: boolean;
  haptics: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
}

export const PRESETS: Record<Preset, Partial<Settings>> = {
  LOW: { renderDistance: 4, lodDistance: 3, shadows: false, shadowSize: 512, fancyLeaves: false, clouds: false, particles: 0.35, resolution: 0.7, antialias: false },
  MEDIUM: { renderDistance: 6, lodDistance: 4, shadows: false, shadowSize: 1024, fancyLeaves: true, clouds: true, particles: 0.7, resolution: 0.85, antialias: false },
  HIGH: { renderDistance: 8, lodDistance: 5, shadows: true, shadowSize: 1024, fancyLeaves: true, clouds: true, particles: 1, resolution: 1, antialias: true },
  ULTRA: { renderDistance: 12, lodDistance: 7, shadows: true, shadowSize: 2048, fancyLeaves: true, clouds: true, particles: 1, resolution: 1.25, antialias: true },
};

/** Bump when default button positions change so old saved layouts are reset. */
const LAYOUT_VERSION = 3;
export const DEFAULT_LAYOUT: Record<string, ButtonLayout> = {
  jump: { x: 0.92, y: 0.4, s: 1.05 },
  sneak: { x: 0.92, y: 0.64, s: 1.05 },
  break: { x: 0.8, y: 0.7, s: 1.05 },
  place: { x: 0.8, y: 0.5, s: 1.05 },
  interact: { x: 0.68, y: 0.84, s: 0.9 },
  sprint: { x: 0.12, y: 0.3, s: 0.9 },
  fly: { x: 0.92, y: 0.18, s: 0.8 },
  drop: { x: 0.68, y: 0.66, s: 0.7 },
  view: { x: 0.79, y: 0.44, s: 0.7 },
  action: { x: 0.68, y: 0.62, s: 1 },
  joy: { x: 0.15, y: 0.66, s: 1 },
};

function detectPreset(): Preset {
  const mem = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const touch = 'ontouchstart' in window;
  if (!touch) return cores >= 8 ? 'HIGH' : 'MEDIUM';
  if (mem >= 8 && cores >= 8) return 'HIGH';
  if (mem >= 4 && cores >= 6) return 'MEDIUM';
  return 'LOW';
}

export function defaults(): Settings {
  const preset = detectPreset();
  return {
    language: (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en',
    preset,
    renderDistance: 6, lodDistance: 4, shadows: false, shadowSize: 1024, fancyLeaves: true, clouds: true, particles: 0.7,
    resolution: 1, antialias: false,
    ...PRESETS[preset],
    fov: 75, brightness: 0.35, viewBobbing: true, showFps: false, performanceMode: true, targetFps: 60,
    sensitivity: 1, invertY: false, padSensitivity: 1, padDeadzone: 0.15,
    touchSize: 1, touchOpacity: 0.65, layout: JSON.parse(JSON.stringify(DEFAULT_LAYOUT)), layoutVersion: LAYOUT_VERSION,
    tapToPlace: true, holdToBreak: true, aimMode: 'crosshair', controlScheme: 'bedrock', autoJump: true, sneakToggle: true, leftHanded: false, haptics: true,
    masterVolume: 0.8, sfxVolume: 0.9, musicVolume: 0.5,
  } as Settings;
}

const KEY = 'akoi.settings.v1';
export function loadSettings(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const out = { ...d, ...s };
      // layouts saved before the Bedrock-style controls get the new default positions
      out.layout = s.layout && s.layoutVersion === LAYOUT_VERSION ? { ...JSON.parse(JSON.stringify(DEFAULT_LAYOUT)), ...s.layout } : JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
      out.layoutVersion = LAYOUT_VERSION;
      if (out.controlScheme !== 'joystick') out.controlScheme = 'bedrock';
      return out;
    }
  } catch { /* ignore */ }
  return d;
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function applyPreset(s: Settings, p: Preset) { Object.assign(s, PRESETS[p]); s.preset = p; }
