import type { QualityName } from './Quality';

export interface ButtonLayout { x: number; y: number; s: number }  // x,y in % from right/bottom for buttons, s = scale
export class Settings {
  quality: QualityName | 'AUTO' = 'AUTO';
  dynamicRes = true;
  resScale = 1;
  fov = 62;
  sensitivity = 1;
  invertY = false;
  autoSprint = true;
  tiltSteer = false;
  vibration = true;
  showFps = false;
  volMaster = 0.85; volSfx = 0.9; volMusic = 0.6; volAmb = 0.7;
  touchOpacity = 0.9; touchScale = 1;
  stickFixed = false;
  layout: Record<string, ButtonLayout> = {};
  firstRun = true;
  aimAssist = true;
  forceTouch = false;

  toJSON() { return { ...this }; }
  load(j: any) { if (j) Object.assign(this, j); }
}
