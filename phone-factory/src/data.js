// Static game data: components, research tree, audiences, regions, rivals, factories, missions, reviews.

// ---------- components (req = research id needed) ----------
export const CPU = [
  { id: 'cpu1', name: 'Spark S1', perf: 12, power: 1.2, heat: 4, cost: 14, w: 2 },
  { id: 'cpu2', name: 'Spark S2', perf: 21, power: 1.3, heat: 5, cost: 24, w: 2, req: 'r_cpu2' },
  { id: 'cpu3', name: 'Quanta Q3', perf: 33, power: 1.6, heat: 7, cost: 40, w: 2, req: 'r_cpu3' },
  { id: 'cpu4', name: 'Quanta Q5', perf: 46, power: 1.8, heat: 9, cost: 65, w: 2, req: 'r_cpu4' },
  { id: 'cpu5', name: 'Helix H7', perf: 60, power: 2.1, heat: 11, cost: 95, w: 2, req: 'r_cpu5' },
  { id: 'cpu6', name: 'Helix H9 AI', perf: 74, power: 2.2, heat: 12, cost: 140, w: 2, npu: true, req: 'r_cpu6' },
  { id: 'cpu7', name: 'Nova X1', perf: 88, power: 2.3, heat: 12, cost: 200, w: 2, npu: true, req: 'r_cpu7' },
  { id: 'cpu8', name: 'Photon Ω 1nm', perf: 100, power: 1.9, heat: 9, cost: 300, w: 2, npu: true, req: 'r_cpu8' },
];
export const RAM = [
  { id: 'ram1', name: '1 GB', gb: 1, perf: 0, cost: 4 },
  { id: 'ram2', name: '2 GB', gb: 2, perf: 4, cost: 7 },
  { id: 'ram3', name: '4 GB', gb: 4, perf: 8, cost: 12, req: 'r_ram4' },
  { id: 'ram4', name: '8 GB', gb: 8, perf: 12, cost: 22, req: 'r_ram8' },
  { id: 'ram5', name: '12 GB', gb: 12, perf: 15, cost: 32, req: 'r_ram12' },
  { id: 'ram6', name: '16 GB', gb: 16, perf: 17, cost: 45, req: 'r_ram16' },
  { id: 'ram7', name: '32 GB', gb: 32, perf: 20, cost: 80, req: 'r_ram32' },
];
export const STORAGE = [
  { id: 'st1', name: '8 GB', gb: 8, cost: 3 }, { id: 'st2', name: '16 GB', gb: 16, cost: 5 }, { id: 'st3', name: '32 GB', gb: 32, cost: 8 },
  { id: 'st4', name: '64 GB', gb: 64, cost: 12, req: 'r_ram4' }, { id: 'st5', name: '128 GB', gb: 128, cost: 18, req: 'r_ram8' },
  { id: 'st6', name: '256 GB', gb: 256, cost: 30, req: 'r_ram12' }, { id: 'st7', name: '512 GB', gb: 512, cost: 55, req: 'r_ram16' },
  { id: 'st8', name: '1 TB', gb: 1024, cost: 95, req: 'r_ram32' }, { id: 'st9', name: '2 TB', gb: 2048, cost: 170, req: 'r_ram32' },
];
// density = mAh per cm³ of usable volume; wpm = grams per 1000 mAh
export const BATTERY = [
  { id: 'bat1', name: 'Ion-litio', density: 80, wpm: 18, costPer1k: 4, heat: 1 },
  { id: 'bat2', name: 'Polímero de litio', density: 95, wpm: 16, costPer1k: 8, heat: 0.5, req: 'r_bat2' },
  { id: 'bat3', name: 'Silicio-carbono', density: 120, wpm: 14, costPer1k: 11, heat: 0.5, req: 'r_bat3' },
  { id: 'bat4', name: 'Celda de grafeno', density: 150, wpm: 11, costPer1k: 16, heat: 0, req: 'r_bat4' },
  { id: 'bat5', name: 'Estado sólido', density: 190, wpm: 9, costPer1k: 22, heat: -1, req: 'r_bat5' },
  { id: 'bat6', name: 'Celda cuántica', density: 260, wpm: 6, costPer1k: 35, heat: -2, req: 'r_bat6' },
];
export const DISPLAY = [
  { id: 'dsp1', name: 'LCD 480p', q: 15, power: 0.8, cost: 8, hz: 60 },
  { id: 'dsp2', name: 'LCD HD', q: 28, power: 0.85, cost: 18, hz: 60, req: 'r_dsp2' },
  { id: 'dsp3', name: 'OLED FHD', q: 48, power: 0.7, cost: 35, hz: 60, req: 'r_dsp3' },
  { id: 'dsp4', name: 'OLED 120 Hz', q: 64, power: 0.85, cost: 55, hz: 120, req: 'r_dsp4' },
  { id: 'dsp5', name: 'LTPO OLED 2K', q: 80, power: 0.6, cost: 85, hz: 120, req: 'r_dsp5' },
  { id: 'dsp6', name: 'MicroLED 4K', q: 92, power: 0.5, cost: 130, hz: 144, req: 'r_dsp6' },
  { id: 'dsp7', name: 'Panel Holo-Luz', q: 100, power: 0.45, cost: 210, hz: 240, req: 'r_dsp7' },
];
export const CAMERA = [
  { id: 'cam1', name: '2 MP', q: 8, cost: 4 },
  { id: 'cam2', name: '8 MP', q: 22, cost: 9, req: 'r_cam2' },
  { id: 'cam3', name: '12 MP', q: 36, cost: 16, req: 'r_cam3' },
  { id: 'cam4', name: '48 MP', q: 52, cost: 26, req: 'r_cam4' },
  { id: 'cam5', name: '108 MP', q: 66, cost: 40, req: 'r_cam5' },
  { id: 'cam6', name: '200 MP periscopio', q: 80, cost: 60, req: 'r_cam6' },
  { id: 'cam7', name: 'Sensor cuántico IA', q: 95, cost: 95, req: 'r_cam7' },
];
export const SPEAKER = [
  { id: 'spk1', name: 'Zumbador', q: 15, cost: 2 }, { id: 'spk2', name: 'Sonido claro', q: 40, cost: 6, req: 'r_spk2' },
  { id: 'spk3', name: 'Hi-Fi', q: 68, cost: 12, req: 'r_spk3' }, { id: 'spk4', name: 'Audio espacial 3D', q: 92, cost: 22, req: 'r_spk4' },
];
export const COOLING = [
  { id: 'cool0', name: 'Ninguna', cap: 0, cost: 0, w: 0 },
  { id: 'cool1', name: 'Lámina de grafito', cap: 5, cost: 3, w: 2, req: 'r_cool1' },
  { id: 'cool2', name: 'Tubo de cobre', cap: 9, cost: 7, w: 6, req: 'r_cool2' },
  { id: 'cool3', name: 'Cámara de vapor', cap: 14, cost: 14, w: 8, req: 'r_cool3' },
  { id: 'cool4', name: 'Microventilador', cap: 20, cost: 22, w: 12, thick: 1.5, req: 'r_cool4' },
  { id: 'cool5', name: 'Circuito crio-gel', cap: 28, cost: 40, w: 10, req: 'r_cool5' },
];
export const MODEM = [
  { id: 'mod1', name: '3G', q: 12, power: 0.3, cost: 5 }, { id: 'mod2', name: '4G LTE', q: 35, power: 0.35, cost: 10, req: 'r_mod2' },
  { id: 'mod3', name: '4G+ agregación', q: 50, power: 0.35, cost: 15, req: 'r_mod3' }, { id: 'mod4', name: '5G', q: 72, power: 0.45, cost: 28, req: 'r_mod4' },
  { id: 'mod5', name: '5G avanzado', q: 86, power: 0.4, cost: 40, req: 'r_mod5' }, { id: 'mod6', name: '6G + satélite', q: 100, power: 0.4, cost: 65, sat: true, req: 'r_sat' },
];
export const CHARGING = [
  { id: 'chg1', name: '5 W', watts: 5, heat: 0, cost: 2 }, { id: 'chg2', name: '10 W', watts: 10, heat: 1, cost: 3, req: 'r_chg2' },
  { id: 'chg3', name: '25 W rápida', watts: 25, heat: 2, cost: 6, req: 'r_chg3' }, { id: 'chg4', name: '65 W turbo', watts: 65, heat: 4, cost: 11, req: 'r_chg4' },
  { id: 'chg5', name: '120 W hiper', watts: 120, heat: 6, cost: 18, req: 'r_chg5' }, { id: 'chg6', name: '240 W warp', watts: 240, heat: 8, cost: 28, req: 'r_chg6' },
];
export const HW = { cpu: CPU, ram: RAM, storage: STORAGE, battery: BATTERY, display: DISPLAY, camera: CAMERA, speaker: SPEAKER, cooling: COOLING, modem: MODEM, charging: CHARGING };
export const HW_LABEL = { cpu: 'Procesador', ram: 'RAM', storage: 'Almacenamiento', battery: 'Batería', display: 'Pantalla', camera: 'Sensor de cámara', speaker: 'Altavoces', cooling: 'Refrigeración', modem: 'Módem', charging: 'Carga' };

// ---------- exterior options (req = research) ----------
export const FRAMES = [
  { id: 'plastic', name: 'Plástico', density: 1.2, strength: 40, cost: 3, prem: 10, color: null },
  { id: 'aluminum', name: 'Aluminio', density: 2.7, strength: 60, cost: 12, prem: 45, req: 'r_alu' },
  { id: 'steel', name: 'Acero inoxidable', density: 7.8, strength: 80, cost: 22, prem: 65, req: 'r_steel' },
  { id: 'titanium', name: 'Titanio', density: 4.5, strength: 90, cost: 40, prem: 85, req: 'r_titan' },
  { id: 'ceramic', name: 'Cerámica', density: 3.9, strength: 70, cost: 45, prem: 90, req: 'r_ceramic' },
];
export const BACKS = [
  { id: 'plastic', name: 'Plástico', strength: 45, cost: 2, prem: 10 },
  { id: 'gloss', name: 'Cristal brillante', strength: 30, cost: 8, prem: 55, req: 'r_glass' },
  { id: 'matte', name: 'Cristal mate', strength: 35, cost: 10, prem: 65, req: 'r_glass' },
  { id: 'leather', name: 'Cuero vegano', strength: 55, cost: 9, prem: 60, req: 'r_glass' },
  { id: 'transparent', name: 'Transparente', strength: 30, cost: 14, prem: 80, req: 'r_transp' },
  { id: 'sapphire', name: 'Cristal de zafiro', strength: 75, cost: 35, prem: 95, req: 'r_sapph' },
];
export const SCREEN_SHAPES = [
  { id: 'bezel', name: 'Marco superior', min: 0 }, { id: 'notch', name: 'Notch', req: 'r_notch' }, { id: 'drop', name: 'Gota', req: 'r_notch' },
  { id: 'punch', name: 'Perforación', req: 'r_punch' }, { id: 'pill', name: 'Isla píldora', req: 'r_punch' }, { id: 'none', name: 'Cámara bajo pantalla', req: 'r_udc' },
];
export const CAM_LAYOUTS = [
  { id: 'single', name: 'Esquina' }, { id: 'vertical', name: 'Tira vertical' }, { id: 'horizontal', name: 'Barra horizontal' }, { id: 'square', name: 'Isla cuadrada' },
  { id: 'circle', name: 'Módulo circular' }, { id: 'triangle', name: 'Triángulo' }, { id: 'center', name: 'Anillo central' }, { id: 'grid', name: 'Cuadrícula (¡muchas!)' },
];
export const FINGERPRINT = [{ id: 'none', name: 'Ninguno' }, { id: 'back', name: 'Sensor trasero', req: 'r_fp' }, { id: 'side', name: 'Botón lateral', req: 'r_fp' }, { id: 'under', name: 'Bajo la pantalla', req: 'r_fpud' }];
export const FACE = [{ id: 'none', name: 'Ninguno' }, { id: '2d', name: 'Facial 2D', req: 'r_face2d' }, { id: '3d', name: 'Facial 3D con profundidad', req: 'r_face3d' }];
export const PORTS = [{ id: 'micro', name: 'Micro-USB' }, { id: 'usbc', name: 'USB-C', req: 'r_usbc' }, { id: 'magnetic', name: 'Pines magnéticos', req: 'r_mag' }, { id: 'none', name: 'Sin puerto (solo inalámbrica)', req: 'r_portless' }];
export const SPEAKER_LAYOUT = [{ id: 'mono', name: 'Mono' }, { id: 'stereo', name: 'Estéreo', req: 'r_spk2' }, { id: 'quad', name: 'Cuádruple', req: 'r_spk3' }];
export const FOLD = [{ id: 'none', name: 'Barra (sin plegar)' }, { id: 'book', name: 'Plegable libro', req: 'r_fold' }, { id: 'flip', name: 'Plegable concha', req: 'r_fold' }];
export const FLASH = [{ id: 'none', name: 'Ninguno' }, { id: 'single', name: 'LED simple' }, { id: 'dual', name: 'Doble tono', req: 'r_cam3' }, { id: 'ring', name: 'Aro de luz', req: 'r_cam5' }];

// ---------- research tree ----------
// rp = research points, cost = money, pre = prerequisites, unlock text for UI, cat for grouping
const R = (id, name, cat, rp, cost, pre = [], desc = '') => ({ id, name, cat, rp, cost, pre, desc });
export const RESEARCH = [
  R('r_cpu2', 'Chip Spark S2', 'Chips', 12, 2000), R('r_cpu3', 'Quanta Q3', 'Chips', 40, 8000, ['r_cpu2']), R('r_cpu4', 'Quanta Q5', 'Chips', 110, 25000, ['r_cpu3']),
  R('r_cpu5', 'Helix H7 (7nm)', 'Chips', 260, 70000, ['r_cpu4']), R('r_cpu6', 'Helix H9 AI', 'Chips', 520, 160000, ['r_cpu5', 'r_ai']), R('r_cpu7', 'Nova X1 (3nm)', 'Chips', 900, 350000, ['r_cpu6']),
  R('r_cpu8', 'Photon Ω (1nm)', 'Futuro', 1600, 900000, ['r_cpu7', 'r_quantum']),
  R('r_ram4', 'Memoria de 4 GB', 'Memoria', 15, 2500), R('r_ram8', 'Memoria de 8 GB', 'Memoria', 60, 12000, ['r_ram4']), R('r_ram12', 'Memoria de 12 GB', 'Memoria', 160, 40000, ['r_ram8']),
  R('r_ram16', 'Memoria de 16 GB', 'Memoria', 340, 100000, ['r_ram12']), R('r_ram32', '32 GB / 2 TB', 'Memoria', 700, 260000, ['r_ram16']),
  R('r_bat2', 'Polímero de litio', 'Batería', 18, 3000), R('r_bat3', 'Silicio-carbono', 'Batería', 120, 30000, ['r_bat2']), R('r_bat4', 'Celdas de grafeno', 'Batería', 380, 120000, ['r_bat3']),
  R('r_bat5', 'Estado sólido', 'Batería', 800, 320000, ['r_bat4']), R('r_bat6', 'Celda cuántica', 'Futuro', 1500, 800000, ['r_bat5', 'r_quantum']),
  R('r_dsp2', 'LCD HD', 'Pantalla', 10, 1500), R('r_dsp3', 'OLED', 'Pantalla', 70, 15000, ['r_dsp2']), R('r_dsp4', 'OLED 120 Hz', 'Pantalla', 180, 45000, ['r_dsp3']),
  R('r_dsp5', 'LTPO 2K', 'Pantalla', 420, 130000, ['r_dsp4']), R('r_dsp6', 'MicroLED 4K', 'Pantalla', 850, 340000, ['r_dsp5']), R('r_dsp7', 'Panel Holo-Luz', 'Futuro', 1500, 850000, ['r_dsp6', 'r_quantum']),
  R('r_cam2', 'Sensor 8 MP', 'Cámara', 10, 1500), R('r_cam3', '12 MP + flash doble', 'Cámara', 45, 9000, ['r_cam2']), R('r_cam4', 'Sensor 48 MP', 'Cámara', 130, 32000, ['r_cam3']),
  R('r_cam5', '108 MP + aro de luz', 'Cámara', 300, 90000, ['r_cam4']), R('r_cam6', '200 MP periscopio', 'Cámara', 620, 220000, ['r_cam5']), R('r_cam7', 'Sensor cuántico IA', 'Futuro', 1200, 600000, ['r_cam6', 'r_ai']),
  R('r_multicam', 'Multicámara (4)', 'Cámara', 60, 12000, ['r_cam3']), R('r_camarray', 'Matriz de cámaras (8)', 'Cámara', 350, 100000, ['r_multicam']),
  R('r_spk2', 'Altavoces estéreo', 'Audio', 20, 3000), R('r_spk3', 'Hi-Fi cuádruple', 'Audio', 120, 25000, ['r_spk2']), R('r_spk4', 'Audio espacial', 'Audio', 400, 110000, ['r_spk3']),
  R('r_cool1', 'Refrigeración de grafito', 'Refrigeración', 12, 1500), R('r_cool2', 'Tubos de cobre', 'Refrigeración', 60, 10000, ['r_cool1']), R('r_cool3', 'Cámara de vapor', 'Refrigeración', 200, 50000, ['r_cool2']),
  R('r_cool4', 'Microventilador', 'Refrigeración', 380, 100000, ['r_cool3']), R('r_cool5', 'Circuito crio-gel', 'Futuro', 900, 380000, ['r_cool4']),
  R('r_mod2', '4G LTE', 'Red', 25, 4000), R('r_mod3', '4G+ agregación', 'Red', 90, 20000, ['r_mod2']), R('r_mod4', '5G', 'Red', 260, 80000, ['r_mod3']),
  R('r_mod5', '5G avanzado', 'Red', 550, 200000, ['r_mod4']), R('r_sat', 'Comunicación por satélite', 'Futuro', 1000, 450000, ['r_mod5']),
  R('r_chg2', 'Carga de 10 W', 'Carga', 8, 1000), R('r_chg3', 'Carga rápida 25 W', 'Carga', 50, 9000, ['r_chg2']), R('r_chg4', 'Turbo 65 W', 'Carga', 180, 40000, ['r_chg3']),
  R('r_chg5', 'Hiper 120 W', 'Carga', 420, 120000, ['r_chg4']), R('r_chg6', 'Warp 240 W', 'Carga', 800, 300000, ['r_chg5']), R('r_wireless', 'Carga inalámbrica', 'Carga', 110, 25000, ['r_chg3']),
  R('r_alu', 'Marco de aluminio', 'Materiales', 15, 2500), R('r_glass', 'Traseras de cristal y cuero', 'Materiales', 25, 4000), R('r_steel', 'Acero inoxidable', 'Materiales', 90, 20000, ['r_alu']),
  R('r_titan', 'Titanio', 'Materiales', 300, 90000, ['r_steel']), R('r_ceramic', 'Cuerpo cerámico', 'Materiales', 260, 80000, ['r_glass']), R('r_transp', 'Trasera transparente', 'Materiales', 220, 60000, ['r_glass']),
  R('r_sapph', 'Cristal de zafiro', 'Materiales', 500, 180000, ['r_ceramic']), R('r_ip', 'Sellado IP68 contra agua', 'Materiales', 140, 35000, ['r_alu']),
  R('r_bezel1', 'Biseles finos (3 mm)', 'Diseño', 30, 5000), R('r_bezel2', 'Borde a borde (1 mm)', 'Diseño', 240, 70000, ['r_bezel1', 'r_punch']),
  R('r_notch', 'Notch y gota', 'Diseño', 35, 6000), R('r_punch', 'Pantalla perforada', 'Diseño', 140, 30000, ['r_notch']), R('r_udc', 'Cámara bajo pantalla', 'Diseño', 700, 260000, ['r_punch', 'r_dsp5']),
  R('r_fold', 'Pantallas plegables', 'Diseño', 650, 250000, ['r_dsp4', 'r_titan']),
  R('r_fp', 'Lector de huellas', 'Seguridad', 20, 3000), R('r_fpud', 'Huella bajo pantalla', 'Seguridad', 180, 50000, ['r_fp', 'r_dsp3']),
  R('r_face2d', 'Desbloqueo facial 2D', 'Seguridad', 40, 7000), R('r_face3d', 'Facial 3D con profundidad', 'Seguridad', 330, 100000, ['r_face2d']),
  R('r_usbc', 'Puerto USB-C', 'Diseño', 20, 3000), R('r_mag', 'Conector magnético', 'Diseño', 150, 30000, ['r_usbc']), R('r_portless', 'Diseño sin puertos', 'Diseño', 500, 150000, ['r_mag', 'r_wireless']),
  R('r_ai', 'IA en el dispositivo (NPU)', 'Software', 300, 90000, ['r_cpu4']), R('r_os2', 'SO 2.0 motor fluido', 'Software', 40, 6000), R('r_os3', 'SO 3.0 widgets y gestos', 'Software', 200, 50000, ['r_os2']),
  R('r_os4', 'SO 4.0 asistente IA', 'Software', 600, 200000, ['r_os3', 'r_ai']),
  R('r_auto', 'Automatización de fábrica', 'Industria', 160, 40000), R('r_robots', 'Gigafábrica de robots', 'Industria', 700, 300000, ['r_auto']),
  R('r_global', 'Logística global', 'Industria', 80, 20000),
  R('r_quantum', 'Materiales cuánticos', 'Futuro', 1100, 500000, ['r_bat4', 'r_cpu6']),
];
export const RES = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

// ---------- market ----------
// w = weights over stat scores; ideal price; sens = price sensitivity
export const AUDIENCES = {
  students: { name: 'Estudiantes', icon: '🎒', share: 0.24, ideal: 280, sens: 1.7, w: { performance: 0.2, battery: 0.2, camera: 0.2, design: 0.15, software: 0.1, features: 0.15 } },
  business: { name: 'Empresas', icon: '💼', share: 0.15, ideal: 750, sens: 0.8, w: { battery: 0.3, performance: 0.2, software: 0.2, durability: 0.15, features: 0.15 } },
  gamers: { name: 'Gamers', icon: '🎮', share: 0.15, ideal: 600, sens: 1.0, w: { performance: 0.4, display: 0.2, thermals: 0.2, battery: 0.2 } },
  creators: { name: 'Creadores', icon: '📸', share: 0.13, ideal: 850, sens: 0.9, w: { camera: 0.5, display: 0.2, performance: 0.15, storage: 0.15 } },
  seniors: { name: 'Mayores', icon: '👵', share: 0.2, ideal: 220, sens: 2.0, w: { battery: 0.35, durability: 0.25, display: 0.2, software: 0.2 } },
  luxury: { name: 'Lujo', icon: '💎', share: 0.13, ideal: 1400, sens: 0.35, luxury: true, w: { design: 0.45, camera: 0.2, features: 0.2, display: 0.15 } },
};
export const REGIONS = [
  { id: 'home', name: 'Tu país', flag: '🏠', daily: 1100, cost: 0 },
  { id: 'na', name: 'Norteamérica', flag: '🌎', daily: 2600, cost: 60000, global: true },
  { id: 'eu', name: 'Europa', flag: '🇪🇺', daily: 2300, cost: 60000, global: true },
  { id: 'asia', name: 'Asia', flag: '🌏', daily: 4200, cost: 120000, global: true },
  { id: 'latam', name: 'Latinoamérica', flag: '🌎', daily: 1300, cost: 40000, global: true },
  { id: 'africa', name: 'África', flag: '🌍', daily: 900, cost: 30000, global: true },
];
export const AD_STYLES = {
  specs: { name: 'Datos técnicos', icon: '📊', mult: { students: 0.8, business: 1, gamers: 1.5, creators: 1.3, seniors: 0.4, luxury: 0.5 } },
  funny: { name: 'Divertido', icon: '😂', mult: { students: 1.6, business: 0.6, gamers: 1.2, creators: 0.9, seniors: 0.9, luxury: 0.4 } },
  emotional: { name: 'Emotivo', icon: '🥹', mult: { students: 0.9, business: 0.8, gamers: 0.5, creators: 1.1, seniors: 1.6, luxury: 1.3 } },
  luxury: { name: 'Estilo de vida de lujo', icon: '🥂', mult: { students: 0.5, business: 1.2, gamers: 0.4, creators: 0.8, seniors: 0.6, luxury: 1.8 } },
  celebrity: { name: 'Famoso', icon: '⭐', mult: { students: 1.4, business: 0.9, gamers: 1.1, creators: 1.1, seniors: 0.9, luxury: 1.3 }, costMult: 1.6 },
  meme: { name: 'Meme viral', icon: '🐸', mult: { students: 1.8, business: 0.3, gamers: 1.5, creators: 0.8, seniors: 0.3, luxury: 0.3 }, random: true },
};
export const PROMOTE = { performance: 'Rendimiento', battery: 'Batería', camera: 'Cámara', display: 'Pantalla', design: 'Diseño', durability: 'Resistencia', software: 'Software', price: 'Precio bajo', thermals: 'No se calienta', features: 'Funciones' };

export const RIVALS = [
  { id: 'mango', name: 'Mango Mobile', color: '#f4a261', rep: 60, tech: 0.22, style: 'premium', every: 110 },
  { id: 'nova', name: 'Nova Dynamics', color: '#4361ee', rep: 50, tech: 0.18, style: 'balanced', every: 90 },
  { id: 'kestrel', name: 'Kestrel', color: '#2a9d8f', rep: 40, tech: 0.14, style: 'budget', every: 70 },
  { id: 'yuzu', name: 'Yuzu Tech', color: '#e63946', rep: 35, tech: 0.16, style: 'gaming', every: 100 },
];

// ---------- factories ----------
export const FACTORIES = [
  { id: 'garage', name: 'Taller del garaje', icon: '🏚️', base: 25, workers: 2, cost: 0, upkeep: 0 },
  { id: 'small', name: 'Fábrica pequeña', icon: '🏭', base: 70, workers: 10, cost: 90000, upkeep: 3000 },
  { id: 'medium', name: 'Planta de montaje', icon: '🏢', base: 450, workers: 40, cost: 450000, upkeep: 15000 },
  { id: 'mega', name: 'Megafábrica', icon: '🌆', base: 3000, workers: 150, cost: 2600000, upkeep: 70000 },
  { id: 'giga', name: 'Gigafábrica de robots', icon: '🤖', base: 20000, workers: 60, cost: 14000000, upkeep: 250000, req: 'r_robots' },
];
export const STAGES = ['Llegan componentes', 'Montaje de placa', 'Instalar pantalla', 'Instalar cámaras', 'Instalar batería', 'Montaje final', 'Instalar software', 'Control de calidad', 'Empaquetado', 'Envío'];
export const STAGE_ICON = ['📦', '🔌', '📱', '📷', '🔋', '🔧', '💾', '🔍', '🎁', '🚚'];

export const ROLES = {
  engineer: { name: 'Ingeniero/a', icon: '🛠️', salary: 3600, desc: 'Menos defectos, prototipos más baratos' },
  researcher: { name: 'Investigador/a', icon: '🔬', salary: 3900, desc: '+1 punto de investigación al día cada uno' },
  worker: { name: 'Operario/a', icon: '👷', salary: 2200, desc: 'Necesarios para que funcione la fábrica' },
  marketer: { name: 'Publicista', icon: '📣', salary: 3800, desc: '+12% de efecto publicitario cada uno' },
  tester: { name: 'Probador/a', icon: '🧪', salary: 3200, desc: 'Pruebas más baratas y precisas' },
};
export const FIRST = ['Ava', 'Leo', 'Mia', 'Kai', 'Zoe', 'Ivan', 'Noor', 'Omar', 'Lina', 'Ravi', 'Sofia', 'Yuki', 'Ben', 'Ana', 'Tariq', 'Elena', 'Jin', 'Maya', 'Diego', 'Priya', 'Felix', 'Amara', 'Hugo', 'Sara', 'Tomas', 'Nia', 'Luca', 'Ines'];
export const LAST = ['Chen', 'Silva', 'Novak', 'Okafor', 'Garcia', 'Kim', 'Rossi', 'Haddad', 'Patel', 'Nguyen', 'Müller', 'Costa', 'Sato', 'Ali', 'Moreau', 'Kowalski', 'Lopez', 'Ivanova'];

// ---------- tests ----------
export const TESTS = [
  { id: 'perf', name: 'Rendimiento', icon: '⚡', days: 1 }, { id: 'battery', name: 'Batería', icon: '🔋', days: 2 }, { id: 'camera', name: 'Cámara', icon: '📷', days: 1 },
  { id: 'drop', name: 'Caída', icon: '💥', days: 1 }, { id: 'temp', name: 'Temperatura', icon: '🌡️', days: 1 }, { id: 'charge', name: 'Carga', icon: '🔌', days: 1 },
  { id: 'gaming', name: 'Juegos', icon: '🎮', days: 1 }, { id: 'water', name: 'Resistencia al agua', icon: '💧', days: 1 },
];

// ---------- reviews ----------
export const REVIEW_POS = {
  battery: ['¡La batería dura una eternidad!', 'Dos días con una carga. Increíble.', 'Ya no sé ni dónde está el cargador.'],
  camera: ['La cámara es una locura.', 'Mis fotos parecen profesionales 📸', 'El modo noche es magia.'],
  performance: ['Tan rápido que debería ser ilegal.', 'Cero lag. Nunca.', 'Las apps se abren antes de tocarlas.'],
  display: ['La pantalla es preciosa.', 'Los colores son brutales.', 'La pantalla más fluida que he usado.'],
  design: ['Un móvil precioso.', 'Todo el mundo me pregunta qué móvil es.', 'Se siente premium en la mano.'],
  durability: ['Se me cayó por las escaleras. Ni un rasguño.', 'Es un tanque.', 'Ha sobrevivido a mi hijo de 3 años.'],
  software: ['El sistema es limpio y fluido.', '¡Me encantan las animaciones!', 'El mejor software que he probado.'],
  thermals: ['Nunca se calienta, ni jugando.', 'Fresquito siempre.'],
  price: ['Calidad-precio increíble.', 'Barato y funciona.', 'Lo mejor por lo que cuesta.'],
  features: ['Tiene todo lo que quería.', 'El desbloqueo facial es instantáneo.', 'La carga inalámbrica es comodísima.'],
};
export const REVIEW_NEG = {
  battery: ['La batería muere a la hora de comer.', 'Necesito una powerbank 24/7.', 'La batería es un chiste.'],
  camera: ['Las fotos parecen hechas con una patata.', 'La cámara saca todo borroso.', 'De noche solo sale ruido.'],
  performance: ['Lento y con lag.', 'Tarda una eternidad en abrir apps.', 'Se traba todo el rato.'],
  display: ['La pantalla se ve apagada.', 'Poca resolución, se ven los píxeles.'],
  design: ['Feo. Lo siento.', 'Parece un móvil de 2009.', 'Biseles del tamaño de una autopista.'],
  durability: ['Se rompió con la primera caída 😭', 'Se siente frágil.', 'Pantalla rota al segundo día.'],
  software: ['El software tiene muchos fallos.', 'Las animaciones van a tirones.', 'Demasiadas apps basura.'],
  thermals: ['Se calienta muchísimo.', 'Se puede freír un huevo encima.', 'Me quema la mano jugando.'],
  price: ['Carísimo para lo que es.', 'Precio inflado.', 'No vale lo que cuesta.'],
  features: ['Le faltan funciones básicas.', '¿Sin huella? ¿En serio?'],
  water: ['Se murió al mojarse un poco.', 'La lluvia lo mató.'],
  fake: ['Los anuncios mentían.', 'No se parece en nada al anuncio.'],
};
export const REVIEWERS = ['tecnoMario', 'laura_k', 'MamáDe3', 'gamer_x', 'FotoPablo', 'abuelo_pepe', 'vida.lujo', 'jefa_ocupada', 'estudiante22', 'anónimo', 'reseñabot', 'n00bmaster', 'reina_cam', 'ElVeredicto', 'usuario_diario'];

export const EVENT_TYPES = ['shortage', 'accident', 'viralAd', 'rivalLaunch', 'techFound', 'badReviews', 'viral', 'expo'];
