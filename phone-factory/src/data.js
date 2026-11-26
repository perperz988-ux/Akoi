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
  { id: 'bat1', name: 'Li-ion', density: 80, wpm: 18, costPer1k: 4, heat: 1 },
  { id: 'bat2', name: 'Li-Polymer', density: 95, wpm: 16, costPer1k: 8, heat: 0.5, req: 'r_bat2' },
  { id: 'bat3', name: 'Silicon-Carbon', density: 120, wpm: 14, costPer1k: 11, heat: 0.5, req: 'r_bat3' },
  { id: 'bat4', name: 'Graphene Cell', density: 150, wpm: 11, costPer1k: 16, heat: 0, req: 'r_bat4' },
  { id: 'bat5', name: 'Solid-State', density: 190, wpm: 9, costPer1k: 22, heat: -1, req: 'r_bat5' },
  { id: 'bat6', name: 'Quantum Cell', density: 260, wpm: 6, costPer1k: 35, heat: -2, req: 'r_bat6' },
];
export const DISPLAY = [
  { id: 'dsp1', name: 'LCD 480p', q: 15, power: 0.8, cost: 8, hz: 60 },
  { id: 'dsp2', name: 'LCD HD', q: 28, power: 0.85, cost: 18, hz: 60, req: 'r_dsp2' },
  { id: 'dsp3', name: 'OLED FHD', q: 48, power: 0.7, cost: 35, hz: 60, req: 'r_dsp3' },
  { id: 'dsp4', name: 'OLED 120 Hz', q: 64, power: 0.85, cost: 55, hz: 120, req: 'r_dsp4' },
  { id: 'dsp5', name: 'LTPO OLED 2K', q: 80, power: 0.6, cost: 85, hz: 120, req: 'r_dsp5' },
  { id: 'dsp6', name: 'MicroLED 4K', q: 92, power: 0.5, cost: 130, hz: 144, req: 'r_dsp6' },
  { id: 'dsp7', name: 'Holo-Light Panel', q: 100, power: 0.45, cost: 210, hz: 240, req: 'r_dsp7' },
];
export const CAMERA = [
  { id: 'cam1', name: '2 MP', q: 8, cost: 4 },
  { id: 'cam2', name: '8 MP', q: 22, cost: 9, req: 'r_cam2' },
  { id: 'cam3', name: '12 MP', q: 36, cost: 16, req: 'r_cam3' },
  { id: 'cam4', name: '48 MP', q: 52, cost: 26, req: 'r_cam4' },
  { id: 'cam5', name: '108 MP', q: 66, cost: 40, req: 'r_cam5' },
  { id: 'cam6', name: '200 MP Periscope', q: 80, cost: 60, req: 'r_cam6' },
  { id: 'cam7', name: 'AI Quantum Sensor', q: 95, cost: 95, req: 'r_cam7' },
];
export const SPEAKER = [
  { id: 'spk1', name: 'Buzzer', q: 15, cost: 2 }, { id: 'spk2', name: 'Clear Sound', q: 40, cost: 6, req: 'r_spk2' },
  { id: 'spk3', name: 'Hi-Fi', q: 68, cost: 12, req: 'r_spk3' }, { id: 'spk4', name: 'Spatial 3D Audio', q: 92, cost: 22, req: 'r_spk4' },
];
export const COOLING = [
  { id: 'cool0', name: 'None', cap: 0, cost: 0, w: 0 },
  { id: 'cool1', name: 'Graphite Sheet', cap: 5, cost: 3, w: 2, req: 'r_cool1' },
  { id: 'cool2', name: 'Copper Heat Pipe', cap: 9, cost: 7, w: 6, req: 'r_cool2' },
  { id: 'cool3', name: 'Vapor Chamber', cap: 14, cost: 14, w: 8, req: 'r_cool3' },
  { id: 'cool4', name: 'Micro Fan', cap: 20, cost: 22, w: 12, thick: 1.5, req: 'r_cool4' },
  { id: 'cool5', name: 'Cryo-Gel Loop', cap: 28, cost: 40, w: 10, req: 'r_cool5' },
];
export const MODEM = [
  { id: 'mod1', name: '3G', q: 12, power: 0.3, cost: 5 }, { id: 'mod2', name: '4G LTE', q: 35, power: 0.35, cost: 10, req: 'r_mod2' },
  { id: 'mod3', name: '4G+ Carrier', q: 50, power: 0.35, cost: 15, req: 'r_mod3' }, { id: 'mod4', name: '5G', q: 72, power: 0.45, cost: 28, req: 'r_mod4' },
  { id: 'mod5', name: '5G Advanced', q: 86, power: 0.4, cost: 40, req: 'r_mod5' }, { id: 'mod6', name: '6G + Satellite', q: 100, power: 0.4, cost: 65, sat: true, req: 'r_sat' },
];
export const CHARGING = [
  { id: 'chg1', name: '5 W', watts: 5, heat: 0, cost: 2 }, { id: 'chg2', name: '10 W', watts: 10, heat: 1, cost: 3, req: 'r_chg2' },
  { id: 'chg3', name: '25 W Fast', watts: 25, heat: 2, cost: 6, req: 'r_chg3' }, { id: 'chg4', name: '65 W Turbo', watts: 65, heat: 4, cost: 11, req: 'r_chg4' },
  { id: 'chg5', name: '120 W Hyper', watts: 120, heat: 6, cost: 18, req: 'r_chg5' }, { id: 'chg6', name: '240 W Warp', watts: 240, heat: 8, cost: 28, req: 'r_chg6' },
];
export const HW = { cpu: CPU, ram: RAM, storage: STORAGE, battery: BATTERY, display: DISPLAY, camera: CAMERA, speaker: SPEAKER, cooling: COOLING, modem: MODEM, charging: CHARGING };
export const HW_LABEL = { cpu: 'Processor', ram: 'RAM', storage: 'Storage', battery: 'Battery', display: 'Display', camera: 'Camera sensor', speaker: 'Speakers', cooling: 'Cooling', modem: 'Modem', charging: 'Charging' };

// ---------- exterior options (req = research) ----------
export const FRAMES = [
  { id: 'plastic', name: 'Plastic', density: 1.2, strength: 40, cost: 3, prem: 10, color: null },
  { id: 'aluminum', name: 'Aluminum', density: 2.7, strength: 60, cost: 12, prem: 45, req: 'r_alu' },
  { id: 'steel', name: 'Stainless Steel', density: 7.8, strength: 80, cost: 22, prem: 65, req: 'r_steel' },
  { id: 'titanium', name: 'Titanium', density: 4.5, strength: 90, cost: 40, prem: 85, req: 'r_titan' },
  { id: 'ceramic', name: 'Ceramic', density: 3.9, strength: 70, cost: 45, prem: 90, req: 'r_ceramic' },
];
export const BACKS = [
  { id: 'plastic', name: 'Plastic', strength: 45, cost: 2, prem: 10 },
  { id: 'gloss', name: 'Glossy Glass', strength: 30, cost: 8, prem: 55, req: 'r_glass' },
  { id: 'matte', name: 'Matte Glass', strength: 35, cost: 10, prem: 65, req: 'r_glass' },
  { id: 'leather', name: 'Vegan Leather', strength: 55, cost: 9, prem: 60, req: 'r_glass' },
  { id: 'transparent', name: 'Transparent', strength: 30, cost: 14, prem: 80, req: 'r_transp' },
  { id: 'sapphire', name: 'Sapphire Crystal', strength: 75, cost: 35, prem: 95, req: 'r_sapph' },
];
export const SCREEN_SHAPES = [
  { id: 'bezel', name: 'Top bezel', min: 0 }, { id: 'notch', name: 'Notch', req: 'r_notch' }, { id: 'drop', name: 'Water-drop', req: 'r_notch' },
  { id: 'punch', name: 'Punch-hole', req: 'r_punch' }, { id: 'pill', name: 'Pill island', req: 'r_punch' }, { id: 'none', name: 'Under-display cam', req: 'r_udc' },
];
export const CAM_LAYOUTS = [
  { id: 'single', name: 'Corner stack' }, { id: 'vertical', name: 'Vertical strip' }, { id: 'horizontal', name: 'Horizontal bar' }, { id: 'square', name: 'Square island' },
  { id: 'circle', name: 'Circle module' }, { id: 'triangle', name: 'Triangle' }, { id: 'center', name: 'Center ring' }, { id: 'grid', name: 'Grid (many!)' },
];
export const FINGERPRINT = [{ id: 'none', name: 'None' }, { id: 'back', name: 'Back sensor', req: 'r_fp' }, { id: 'side', name: 'Side button', req: 'r_fp' }, { id: 'under', name: 'Under display', req: 'r_fpud' }];
export const FACE = [{ id: 'none', name: 'None' }, { id: '2d', name: '2D face unlock', req: 'r_face2d' }, { id: '3d', name: '3D depth face ID', req: 'r_face3d' }];
export const PORTS = [{ id: 'micro', name: 'Micro-USB' }, { id: 'usbc', name: 'USB-C', req: 'r_usbc' }, { id: 'magnetic', name: 'Magnetic pins', req: 'r_mag' }, { id: 'none', name: 'Portless (wireless only)', req: 'r_portless' }];
export const SPEAKER_LAYOUT = [{ id: 'mono', name: 'Mono' }, { id: 'stereo', name: 'Stereo', req: 'r_spk2' }, { id: 'quad', name: 'Quad', req: 'r_spk3' }];
export const FOLD = [{ id: 'none', name: 'Bar (no fold)' }, { id: 'book', name: 'Book fold', req: 'r_fold' }, { id: 'flip', name: 'Flip fold', req: 'r_fold' }];
export const FLASH = [{ id: 'none', name: 'None' }, { id: 'single', name: 'Single LED' }, { id: 'dual', name: 'Dual-tone', req: 'r_cam3' }, { id: 'ring', name: 'Ring light', req: 'r_cam5' }];

// ---------- research tree ----------
// rp = research points, cost = money, pre = prerequisites, unlock text for UI, cat for grouping
const R = (id, name, cat, rp, cost, pre = [], desc = '') => ({ id, name, cat, rp, cost, pre, desc });
export const RESEARCH = [
  R('r_cpu2', 'Spark S2 Chip', 'Chips', 12, 2000), R('r_cpu3', 'Quanta Q3', 'Chips', 40, 8000, ['r_cpu2']), R('r_cpu4', 'Quanta Q5', 'Chips', 110, 25000, ['r_cpu3']),
  R('r_cpu5', 'Helix H7 (7nm)', 'Chips', 260, 70000, ['r_cpu4']), R('r_cpu6', 'Helix H9 AI', 'Chips', 520, 160000, ['r_cpu5', 'r_ai']), R('r_cpu7', 'Nova X1 (3nm)', 'Chips', 900, 350000, ['r_cpu6']),
  R('r_cpu8', 'Photon Ω (1nm)', 'Future', 1600, 900000, ['r_cpu7', 'r_quantum']),
  R('r_ram4', '4 GB memory', 'Memory', 15, 2500), R('r_ram8', '8 GB memory', 'Memory', 60, 12000, ['r_ram4']), R('r_ram12', '12 GB memory', 'Memory', 160, 40000, ['r_ram8']),
  R('r_ram16', '16 GB memory', 'Memory', 340, 100000, ['r_ram12']), R('r_ram32', '32 GB / 2 TB', 'Memory', 700, 260000, ['r_ram16']),
  R('r_bat2', 'Li-Polymer', 'Battery', 18, 3000), R('r_bat3', 'Silicon-Carbon', 'Battery', 120, 30000, ['r_bat2']), R('r_bat4', 'Graphene Cells', 'Battery', 380, 120000, ['r_bat3']),
  R('r_bat5', 'Solid-State', 'Battery', 800, 320000, ['r_bat4']), R('r_bat6', 'Quantum Cell', 'Future', 1500, 800000, ['r_bat5', 'r_quantum']),
  R('r_dsp2', 'HD LCD', 'Display', 10, 1500), R('r_dsp3', 'OLED', 'Display', 70, 15000, ['r_dsp2']), R('r_dsp4', '120 Hz OLED', 'Display', 180, 45000, ['r_dsp3']),
  R('r_dsp5', 'LTPO 2K', 'Display', 420, 130000, ['r_dsp4']), R('r_dsp6', 'MicroLED 4K', 'Display', 850, 340000, ['r_dsp5']), R('r_dsp7', 'Holo-Light Panel', 'Future', 1500, 850000, ['r_dsp6', 'r_quantum']),
  R('r_cam2', '8 MP sensor', 'Camera', 10, 1500), R('r_cam3', '12 MP + dual flash', 'Camera', 45, 9000, ['r_cam2']), R('r_cam4', '48 MP sensor', 'Camera', 130, 32000, ['r_cam3']),
  R('r_cam5', '108 MP + ring flash', 'Camera', 300, 90000, ['r_cam4']), R('r_cam6', '200 MP Periscope', 'Camera', 620, 220000, ['r_cam5']), R('r_cam7', 'AI Quantum Sensor', 'Future', 1200, 600000, ['r_cam6', 'r_ai']),
  R('r_multicam', 'Multi-camera (4)', 'Camera', 60, 12000, ['r_cam3']), R('r_camarray', 'Camera array (8)', 'Camera', 350, 100000, ['r_multicam']),
  R('r_spk2', 'Stereo speakers', 'Audio', 20, 3000), R('r_spk3', 'Hi-Fi quad', 'Audio', 120, 25000, ['r_spk2']), R('r_spk4', 'Spatial audio', 'Audio', 400, 110000, ['r_spk3']),
  R('r_cool1', 'Graphite cooling', 'Cooling', 12, 1500), R('r_cool2', 'Copper heat pipes', 'Cooling', 60, 10000, ['r_cool1']), R('r_cool3', 'Vapor chamber', 'Cooling', 200, 50000, ['r_cool2']),
  R('r_cool4', 'Micro fan', 'Cooling', 380, 100000, ['r_cool3']), R('r_cool5', 'Cryo-gel loop', 'Future', 900, 380000, ['r_cool4']),
  R('r_mod2', '4G LTE', 'Network', 25, 4000), R('r_mod3', '4G+ Carrier', 'Network', 90, 20000, ['r_mod2']), R('r_mod4', '5G', 'Network', 260, 80000, ['r_mod3']),
  R('r_mod5', '5G Advanced', 'Network', 550, 200000, ['r_mod4']), R('r_sat', 'Satellite communication', 'Future', 1000, 450000, ['r_mod5']),
  R('r_chg2', '10 W charging', 'Charging', 8, 1000), R('r_chg3', '25 W fast charge', 'Charging', 50, 9000, ['r_chg2']), R('r_chg4', '65 W turbo', 'Charging', 180, 40000, ['r_chg3']),
  R('r_chg5', '120 W hyper', 'Charging', 420, 120000, ['r_chg4']), R('r_chg6', '240 W warp', 'Charging', 800, 300000, ['r_chg5']), R('r_wireless', 'Wireless charging', 'Charging', 110, 25000, ['r_chg3']),
  R('r_alu', 'Aluminum frame', 'Materials', 15, 2500), R('r_glass', 'Glass & leather backs', 'Materials', 25, 4000), R('r_steel', 'Stainless steel', 'Materials', 90, 20000, ['r_alu']),
  R('r_titan', 'Titanium', 'Materials', 300, 90000, ['r_steel']), R('r_ceramic', 'Ceramic body', 'Materials', 260, 80000, ['r_glass']), R('r_transp', 'Transparent back', 'Materials', 220, 60000, ['r_glass']),
  R('r_sapph', 'Sapphire crystal', 'Materials', 500, 180000, ['r_ceramic']), R('r_ip', 'IP68 water sealing', 'Materials', 140, 35000, ['r_alu']),
  R('r_bezel1', 'Thin bezels (3 mm)', 'Design', 30, 5000), R('r_bezel2', 'Edge-to-edge (1 mm)', 'Design', 240, 70000, ['r_bezel1', 'r_punch']),
  R('r_notch', 'Notch & water-drop', 'Design', 35, 6000), R('r_punch', 'Punch-hole display', 'Design', 140, 30000, ['r_notch']), R('r_udc', 'Under-display camera', 'Design', 700, 260000, ['r_punch', 'r_dsp5']),
  R('r_fold', 'Foldable screens', 'Design', 650, 250000, ['r_dsp4', 'r_titan']),
  R('r_fp', 'Fingerprint sensor', 'Security', 20, 3000), R('r_fpud', 'Under-display fingerprint', 'Security', 180, 50000, ['r_fp', 'r_dsp3']),
  R('r_face2d', '2D face unlock', 'Security', 40, 7000), R('r_face3d', '3D depth face ID', 'Security', 330, 100000, ['r_face2d']),
  R('r_usbc', 'USB-C port', 'Design', 20, 3000), R('r_mag', 'Magnetic connector', 'Design', 150, 30000, ['r_usbc']), R('r_portless', 'Portless design', 'Design', 500, 150000, ['r_mag', 'r_wireless']),
  R('r_ai', 'On-device AI (NPU)', 'Software', 300, 90000, ['r_cpu4']), R('r_os2', 'OS 2.0 smooth engine', 'Software', 40, 6000), R('r_os3', 'OS 3.0 widgets & gestures', 'Software', 200, 50000, ['r_os2']),
  R('r_os4', 'OS 4.0 AI assistant', 'Software', 600, 200000, ['r_os3', 'r_ai']),
  R('r_auto', 'Factory automation', 'Industry', 160, 40000), R('r_robots', 'Robot gigafactory', 'Industry', 700, 300000, ['r_auto']),
  R('r_global', 'Global logistics', 'Industry', 80, 20000),
  R('r_quantum', 'Quantum materials', 'Future', 1100, 500000, ['r_bat4', 'r_cpu6']),
];
export const RES = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

// ---------- market ----------
// w = weights over stat scores; ideal price; sens = price sensitivity
export const AUDIENCES = {
  students: { name: 'Students', icon: '🎒', share: 0.24, ideal: 280, sens: 1.7, w: { performance: 0.2, battery: 0.2, camera: 0.2, design: 0.15, software: 0.1, features: 0.15 } },
  business: { name: 'Business', icon: '💼', share: 0.15, ideal: 750, sens: 0.8, w: { battery: 0.3, performance: 0.2, software: 0.2, durability: 0.15, features: 0.15 } },
  gamers: { name: 'Gamers', icon: '🎮', share: 0.15, ideal: 600, sens: 1.0, w: { performance: 0.4, display: 0.2, thermals: 0.2, battery: 0.2 } },
  creators: { name: 'Creators', icon: '📸', share: 0.13, ideal: 850, sens: 0.9, w: { camera: 0.5, display: 0.2, performance: 0.15, storage: 0.15 } },
  seniors: { name: 'Seniors', icon: '👵', share: 0.2, ideal: 220, sens: 2.0, w: { battery: 0.35, durability: 0.25, display: 0.2, software: 0.2 } },
  luxury: { name: 'Luxury', icon: '💎', share: 0.13, ideal: 1400, sens: 0.35, luxury: true, w: { design: 0.45, camera: 0.2, features: 0.2, display: 0.15 } },
};
export const REGIONS = [
  { id: 'home', name: 'Home Country', flag: '🏠', daily: 1100, cost: 0 },
  { id: 'na', name: 'North America', flag: '🌎', daily: 2600, cost: 60000, global: true },
  { id: 'eu', name: 'Europe', flag: '🇪🇺', daily: 2300, cost: 60000, global: true },
  { id: 'asia', name: 'Asia', flag: '🌏', daily: 4200, cost: 120000, global: true },
  { id: 'latam', name: 'Latin America', flag: '🌎', daily: 1300, cost: 40000, global: true },
  { id: 'africa', name: 'Africa', flag: '🌍', daily: 900, cost: 30000, global: true },
];
export const AD_STYLES = {
  specs: { name: 'Tech specs', icon: '📊', mult: { students: 0.8, business: 1, gamers: 1.5, creators: 1.3, seniors: 0.4, luxury: 0.5 } },
  funny: { name: 'Funny', icon: '😂', mult: { students: 1.6, business: 0.6, gamers: 1.2, creators: 0.9, seniors: 0.9, luxury: 0.4 } },
  emotional: { name: 'Emotional', icon: '🥹', mult: { students: 0.9, business: 0.8, gamers: 0.5, creators: 1.1, seniors: 1.6, luxury: 1.3 } },
  luxury: { name: 'Luxury lifestyle', icon: '🥂', mult: { students: 0.5, business: 1.2, gamers: 0.4, creators: 0.8, seniors: 0.6, luxury: 1.8 } },
  celebrity: { name: 'Celebrity', icon: '⭐', mult: { students: 1.4, business: 0.9, gamers: 1.1, creators: 1.1, seniors: 0.9, luxury: 1.3 }, costMult: 1.6 },
  meme: { name: 'Viral meme', icon: '🐸', mult: { students: 1.8, business: 0.3, gamers: 1.5, creators: 0.8, seniors: 0.3, luxury: 0.3 }, random: true },
};
export const PROMOTE = { performance: 'Performance', battery: 'Battery life', camera: 'Camera', display: 'Display', design: 'Design', durability: 'Durability', software: 'Software', price: 'Low price', thermals: 'Stays cool', features: 'Features' };

export const RIVALS = [
  { id: 'mango', name: 'Mango Mobile', color: '#f4a261', rep: 60, tech: 0.22, style: 'premium', every: 110 },
  { id: 'nova', name: 'Nova Dynamics', color: '#4361ee', rep: 50, tech: 0.18, style: 'balanced', every: 90 },
  { id: 'kestrel', name: 'Kestrel', color: '#2a9d8f', rep: 40, tech: 0.14, style: 'budget', every: 70 },
  { id: 'yuzu', name: 'Yuzu Tech', color: '#e63946', rep: 35, tech: 0.16, style: 'gaming', every: 100 },
];

// ---------- factories ----------
export const FACTORIES = [
  { id: 'garage', name: 'Garage Workshop', icon: '🏚️', base: 25, workers: 2, cost: 0, upkeep: 0 },
  { id: 'small', name: 'Small Factory', icon: '🏭', base: 70, workers: 10, cost: 90000, upkeep: 3000 },
  { id: 'medium', name: 'Assembly Plant', icon: '🏢', base: 450, workers: 40, cost: 450000, upkeep: 15000 },
  { id: 'mega', name: 'Mega Factory', icon: '🌆', base: 3000, workers: 150, cost: 2600000, upkeep: 70000 },
  { id: 'giga', name: 'Robot Gigafactory', icon: '🤖', base: 20000, workers: 60, cost: 14000000, upkeep: 250000, req: 'r_robots' },
];
export const STAGES = ['Components arrive', 'Motherboard assembly', 'Screen installation', 'Camera installation', 'Battery installation', 'Final assembly', 'Software installation', 'Quality control', 'Packaging', 'Shipping'];
export const STAGE_ICON = ['📦', '🔌', '📱', '📷', '🔋', '🔧', '💾', '🔍', '🎁', '🚚'];

export const ROLES = {
  engineer: { name: 'Engineer', icon: '🛠️', salary: 3600, desc: 'Fewer defects, cheaper prototypes, better designs' },
  researcher: { name: 'Researcher', icon: '🔬', salary: 3900, desc: '+1 research point / day each' },
  worker: { name: 'Factory worker', icon: '👷', salary: 2200, desc: 'Needed to run factory stations' },
  marketer: { name: 'Marketer', icon: '📣', salary: 3800, desc: '+12% advertising effect each' },
  tester: { name: 'Tester', icon: '🧪', salary: 3200, desc: 'Cheaper, more accurate tests' },
};
export const FIRST = ['Ava', 'Leo', 'Mia', 'Kai', 'Zoe', 'Ivan', 'Noor', 'Omar', 'Lina', 'Ravi', 'Sofia', 'Yuki', 'Ben', 'Ana', 'Tariq', 'Elena', 'Jin', 'Maya', 'Diego', 'Priya', 'Felix', 'Amara', 'Hugo', 'Sara', 'Tomas', 'Nia', 'Luca', 'Ines'];
export const LAST = ['Chen', 'Silva', 'Novak', 'Okafor', 'Garcia', 'Kim', 'Rossi', 'Haddad', 'Patel', 'Nguyen', 'Müller', 'Costa', 'Sato', 'Ali', 'Moreau', 'Kowalski', 'Lopez', 'Ivanova'];

// ---------- tests ----------
export const TESTS = [
  { id: 'perf', name: 'Performance', icon: '⚡', days: 1 }, { id: 'battery', name: 'Battery', icon: '🔋', days: 2 }, { id: 'camera', name: 'Camera', icon: '📷', days: 1 },
  { id: 'drop', name: 'Drop', icon: '💥', days: 1 }, { id: 'temp', name: 'Temperature', icon: '🌡️', days: 1 }, { id: 'charge', name: 'Charging', icon: '🔌', days: 1 },
  { id: 'gaming', name: 'Gaming', icon: '🎮', days: 1 }, { id: 'water', name: 'Water resistance', icon: '💧', days: 1 },
];

// ---------- reviews ----------
export const REVIEW_POS = {
  battery: ['Battery lasts forever!', 'Two days on one charge. Unreal.', 'I forgot where my charger is.'],
  camera: ['Camera is insane.', 'My photos look professional now 📸', 'Night mode is magic.'],
  performance: ['So fast it feels illegal.', 'Zero lag. Ever.', 'Apps open before I tap them.'],
  display: ['The screen is gorgeous.', 'Colors pop like crazy.', 'Smoothest display I have used.'],
  design: ['Absolutely beautiful phone.', 'People keep asking what phone this is.', 'Feels premium in the hand.'],
  durability: ['Dropped it down the stairs. Not a scratch.', 'Built like a tank.', 'Survived my toddler.'],
  software: ['The OS is so clean and smooth.', 'Love the animations!', 'Best software I have used.'],
  thermals: ['Never gets warm, even gaming.', 'Cool as ice.'],
  price: ['Incredible value for the price.', 'Cheap and it just works.', 'Best bang for buck.'],
  features: ['Has every feature I wanted.', 'Face unlock is instant.', 'Wireless charging is so convenient.'],
};
export const REVIEW_NEG = {
  battery: ['Battery dies by lunch.', 'Need a power bank 24/7.', 'Battery life is a joke.'],
  camera: ['Photos look like a potato took them.', 'Camera is blurry.', 'Night photos are pure noise.'],
  performance: ['Laggy and slow.', 'Takes forever to open apps.', 'Stutters constantly.'],
  display: ['The screen looks washed out.', 'Low resolution, I can see the pixels.'],
  design: ['Ugly. Sorry.', 'Looks like a phone from 2009.', 'Bezels the size of a highway.'],
  durability: ['Cracked after one drop 😭', 'Feels flimsy.', 'Screen shattered on day 2.'],
  software: ['The software is buggy.', 'Animations feel choppy.', 'Too much bloatware.'],
  thermals: ['The phone gets way too hot.', 'Could fry an egg on it.', 'Burns my hand while gaming.'],
  price: ['Way too expensive for what it is.', 'Overpriced.', 'Not worth the money.'],
  features: ['Missing basic features.', 'No fingerprint? Really?'],
  water: ['Died after it got a little wet.', 'Rain killed it.'],
  fake: ['The ads lied about this phone.', 'Nothing like the advertisement.'],
};
export const REVIEWERS = ['techguy99', 'sarah_k', 'MomOf3', 'gamer_x', 'PhotoPaul', 'grandpa_joe', 'lux.life', 'busy_ceo', 'student_life', 'anon', 'reviewbot', 'n00bmaster', 'cam_queen', 'TheVerdict', 'daily_user'];

export const EVENT_TYPES = ['shortage', 'accident', 'viralAd', 'rivalLaunch', 'techFound', 'badReviews', 'viral', 'expo'];
