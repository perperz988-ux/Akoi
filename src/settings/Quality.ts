export type QualityName = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface QualityCfg {
  name: QualityName;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  shadowDist: number;
  nearCells: number;   // full-detail radius (cells)
  farCells: number;    // simplified skyline radius (cells)
  pedCap: number;
  trafficCap: number;
  copCap: number;
  wildlife: number;
  fogFar: number;
  bloom: boolean;
  bloomHalf: boolean;
  envMap: boolean;
  waterDetail: number; // 0 flat, 1 waves, 2 waves+reflection tint
  headlights: number;  // real dynamic lights
  rain: number;        // particle count
  texSize: number;
  antialias: boolean;
  buildBudgetMs: number;
  simRadius: number;
  targetFps: number;
}

export const PRESETS: Record<QualityName, QualityCfg> = {
  LOW: { name: 'LOW', maxPixelRatio: 1, shadows: false, shadowMap: 512, shadowDist: 40, nearCells: 2, farCells: 4, pedCap: 40, trafficCap: 24, copCap: 5, wildlife: 10, fogFar: 380, bloom: false, bloomHalf: true, envMap: false, waterDetail: 0, headlights: 0, rain: 400, texSize: 128, antialias: false, buildBudgetMs: 3, simRadius: 150, targetFps: 30 },
  MEDIUM: { name: 'MEDIUM', maxPixelRatio: 1.25, shadows: true, shadowMap: 1024, shadowDist: 55, nearCells: 3, farCells: 5, pedCap: 80, trafficCap: 40, copCap: 7, wildlife: 20, fogFar: 520, bloom: false, bloomHalf: true, envMap: true, waterDetail: 1, headlights: 2, rain: 900, texSize: 256, antialias: false, buildBudgetMs: 4, simRadius: 190, targetFps: 30 },
  HIGH: { name: 'HIGH', maxPixelRatio: 1.75, shadows: true, shadowMap: 2048, shadowDist: 75, nearCells: 4, farCells: 7, pedCap: 130, trafficCap: 64, copCap: 9, wildlife: 36, fogFar: 760, bloom: true, bloomHalf: true, envMap: true, waterDetail: 2, headlights: 4, rain: 1800, texSize: 256, antialias: true, buildBudgetMs: 5, simRadius: 240, targetFps: 60 },
  ULTRA: { name: 'ULTRA', maxPixelRatio: 2.5, shadows: true, shadowMap: 4096, shadowDist: 110, nearCells: 5, farCells: 9, pedCap: 200, trafficCap: 100, copCap: 12, wildlife: 60, fogFar: 1000, bloom: true, bloomHalf: false, envMap: true, waterDetail: 2, headlights: 6, rain: 3200, texSize: 512, antialias: true, buildBudgetMs: 6, simRadius: 300, targetFps: 60 },
};

/** Heuristic device detection → recommended preset. */
export function recommendQuality(gl: WebGLRenderingContext | WebGL2RenderingContext): { preset: QualityName; reason: string } {
  const nav: any = navigator;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* ignore */ }
  const r = renderer.toLowerCase();
  let score = 0;
  score += Math.min(cores, 8) * 0.5;       // up to 4
  score += Math.min(mem, 8) * 0.5;         // up to 4
  const adreno = /adreno.*?(\d{3})/.exec(r);
  if (adreno) { const n = +adreno[1]; score += n >= 740 ? 6 : n >= 730 ? 5 : n >= 650 ? 3.5 : n >= 610 ? 2 : 0.5; }
  else if (/mali-g(\d+)/.test(r)) { const n = +/mali-g(\d+)/.exec(r)![1]; score += n >= 715 ? 5 : n >= 710 ? 3.5 : n >= 78 ? 3 : n >= 76 ? 2 : 1; }
  else if (/apple/.test(r)) score += 6;
  else if (/nvidia|geforce|radeon|rtx|gtx|intel.*iris|arc/.test(r)) score += 7;
  else if (/swiftshader|llvmpipe|software/.test(r)) score -= 6;
  else score += 2;
  const preset: QualityName = score >= 13 ? 'ULTRA' : score >= 10 ? 'HIGH' : score >= 6.5 ? 'MEDIUM' : 'LOW';
  return { preset, reason: `${renderer || 'GPU unknown'} · ${cores} cores · ${mem}GB` };
}

/**
 * Dynamic resolution: adjusts the render scale from frame time to hold the target FPS.
 * If even the minimum scale cannot hold the target for long, caller may drop the preset.
 */
export class DynamicResolution {
  scale = 1;
  minScale = 0.55;
  private acc = 0; private n = 0; private cooldown = 0;
  lowStreak = 0;
  enabled = true;
  update(dt: number, targetFps: number): boolean {
    if (!this.enabled) return false;
    this.acc += dt; this.n++;
    this.cooldown -= dt;
    if (this.n < 30) return false;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    const target = 1 / targetFps;
    let changed = false;
    if (this.cooldown <= 0) {
      if (avg > target * 1.18 && this.scale > this.minScale) { this.scale = Math.max(this.minScale, this.scale - 0.07); changed = true; this.cooldown = 0.6; }
      else if (avg < target * 0.78 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.04); changed = true; this.cooldown = 2.0; }
    }
    if (this.scale <= this.minScale + 0.01 && avg > target * 1.25) this.lowStreak++; else this.lowStreak = Math.max(0, this.lowStreak - 1);
    return changed;
  }
}
