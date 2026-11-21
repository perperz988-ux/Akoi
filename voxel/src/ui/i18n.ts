// Localization (English / Spanish). Static UI text is translated automatically by a MutationObserver;
// dynamic strings use t() and the pattern rules below.
export type Lang = 'en' | 'es';
let lang: Lang = 'en';

export function setLang(l: Lang) { lang = l; }
export function getLang(): Lang { return lang; }
export function detectLang(): Lang { return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'; }

const ES: Record<string, string> = {
  // menu
  'PLAY': 'JUGAR', 'CREATE WORLD': 'CREAR MUNDO', 'SETTINGS': 'AJUSTES', 'CREDITS': 'CRÉDITOS',
  'Shape the wild lands': 'Da forma a las tierras salvajes', 'ZperCraft v0.1 · original voxel sandbox': 'ZperCraft v0.1 · sandbox de bloques original',
  'Your worlds': 'Tus mundos', '+ New world': '+ Nuevo mundo', 'No worlds yet. Create one to begin.': 'Aún no hay mundos. Crea uno para empezar.',
  'Rename': 'Renombrar', 'Delete': 'Borrar', '▶ Play': '▶ Jugar', 'Rename world': 'Renombrar mundo', 'Cancel': 'Cancelar', 'Save': 'Guardar', 'Confirm': 'Confirmar',
  'Create world': 'Crear mundo', 'Name': 'Nombre', 'Seed': 'Semilla', '(same seed = same world)': '(misma semilla = mismo mundo)',
  'Leave empty for a random seed': 'Vacío = semilla aleatoria', 'Wild Lands': 'Tierras Salvajes', 'New World': 'Nuevo mundo',
  'Game mode': 'Modo de juego', 'Survival': 'Supervivencia', 'Creative': 'Creativo', 'Difficulty': 'Dificultad',
  'Peaceful': 'Pacífico', 'Normal': 'Normal', 'Hard': 'Difícil', 'Create & enter': 'Crear y entrar',
  'Gather, craft and survive. Hunger, health and hostile creatures.': 'Recolecta, fabrica y sobrevive. Hambre, salud y criaturas hostiles.',
  'Unlimited blocks, flight, instant breaking and world tools.': 'Bloques ilimitados, vuelo, rotura instantánea y herramientas de mundo.',
  'Credits': 'Créditos', 'Creatures: Mossback, Hopkin, Glimmerwing, Gloomling, Crag Crawler and Stingwisp.': 'Criaturas: Musgoso, Saltarín, Alabrillo, Penumbro, Reptarroca y Aguijonero.',
  'Design, code, world generation, creatures, textures, sounds and music were all created procedurally for this game. No external art or audio assets are used: every texture is painted by code at start-up and every sound is synthesized live.':
    'El diseño, el código, la generación del mundo, las criaturas, las texturas, los sonidos y la música se crearon de forma procedural para este juego. No se usan recursos externos: cada textura se pinta por código al iniciar y cada sonido se sintetiza en vivo.',
  'Thanks for playing. Build something wonderful.': 'Gracias por jugar. Construye algo maravilloso.',
  'Built with': 'Hecho con', '(MIT licence) for WebGL rendering and': '(licencia MIT) para el renderizado WebGL y', '(MIT licence) for the Android shell.': '(licencia MIT) para la app de Android.',
  '— an original voxel sandbox about shaping the wild lands.': '— un sandbox de bloques original sobre dar forma a las tierras salvajes.',
  // settings
  'Settings': 'Ajustes', 'Graphics': 'Gráficos', 'Controls': 'Controles', 'Touch': 'Táctil', 'Audio': 'Audio', 'Language': 'Idioma',
  'Quality preset': 'Calidad', 'Low': 'Baja', 'Medium': 'Media', 'High': 'Alta', 'Ultra': 'Ultra',
  'Render distance (chunks)': 'Distancia de renderizado (chunks)', 'Full-detail distance (LOD)': 'Distancia de detalle completo (LOD)',
  'Dynamic shadows': 'Sombras dinámicas', 'Shadow resolution': 'Resolución de sombras', 'Fancy leaves (see-through)': 'Hojas detalladas (transparentes)',
  'Clouds': 'Nubes', 'Particles': 'Partículas', 'Resolution scale': 'Escala de resolución', 'Field of view': 'Campo de visión', 'Brightness': 'Brillo',
  'View bobbing': 'Balanceo de cámara', 'Show FPS': 'Mostrar FPS', 'Performance mode (dynamic resolution)': 'Modo rendimiento (resolución dinámica)',
  'Frame-rate target': 'FPS objetivo', 'Anti-aliasing (applies after restart)': 'Antialiasing (al reiniciar)',
  'Look sensitivity': 'Sensibilidad de cámara', 'Invert vertical look': 'Invertir eje vertical', 'Auto-jump (touch)': 'Salto automático (táctil)',
  'Sneak button toggles': 'Agacharse se queda activado', 'Aim': 'Apuntar', 'Crosshair': 'Mira', 'Touch point': 'Punto tocado',
  'Controller': 'Mando', 'Controller look speed': 'Velocidad de cámara (mando)', 'Stick dead-zone': 'Zona muerta del stick',
  'Button size': 'Tamaño de botones', 'Button opacity': 'Opacidad de botones', 'Tap to place / use': 'Tocar para colocar / usar',
  'Hold screen to break': 'Mantener pulsado para romper', 'Left-handed layout': 'Modo zurdo', 'Vibration feedback': 'Vibración',
  'Button layout': 'Disposición de botones', 'Edit layout': 'Editar disposición', 'Drag buttons to move': 'Arrastra los botones', 'Size': 'Tamaño', 'Reset': 'Restablecer', 'Done': 'Listo',
  'Master volume': 'Volumen general', 'Sound effects': 'Efectos', 'Music': 'Música',
  // pause / world options
  'Paused': 'Pausa', 'RESUME': 'CONTINUAR', 'WORLD OPTIONS': 'OPCIONES DEL MUNDO', 'SAVE & QUIT': 'GUARDAR Y SALIR', 'World options': 'Opciones del mundo',
  'Time of day': 'Hora del día', 'Dawn': 'Amanecer', 'Noon': 'Mediodía', 'Dusk': 'Atardecer', 'Midnight': 'Medianoche',
  'Weather': 'Clima', 'Clear': 'Despejado', 'Rain': 'Lluvia', 'Storm': 'Tormenta', 'Daylight cycle': 'Ciclo día/noche', 'Weather cycle': 'Ciclo del clima',
  'Creature spawning': 'Aparición de criaturas', 'Keep inventory on death': 'Conservar inventario al morir', 'Flying': 'Volando', 'Walking': 'Caminando',
  'Spawn a creature in front of you': 'Invoca una criatura delante de ti', 'hostile': 'hostil', 'flying': 'voladora', 'passive': 'pacífica',
  'Set world spawn here': 'Fijar punto de aparición aquí', 'Set': 'Fijar',
  'Switch to Creative mode for flight, unlimited blocks and creature summoning.': 'Cambia a modo Creativo para volar, bloques ilimitados e invocar criaturas.',
  'FALLEN': 'HAS CAÍDO', 'Rise again': 'Levantarse', 'Save & quit': 'Guardar y salir',
  // inventory
  'Pack': 'Mochila', 'Catalog': 'Catálogo', 'Sort': 'Ordenar', 'Drop': 'Soltar', 'Trash': 'Tirar', 'Hotbar': 'Barra rápida', 'Crate': 'Cofre', 'Storage crate': 'Cofre',
  'Tap an item to pick it up · long-press to split': 'Toca un objeto para cogerlo · mantén para dividir', 'Catalog — tap to take a full stack': 'Catálogo — toca para coger un montón',
  'Move items between the crate and your pack. Contents are saved with the world and spill out if the crate is broken.': 'Mueve objetos entre el cofre y tu mochila. El contenido se guarda con el mundo y cae al suelo si rompes el cofre.',
  'Crafting': 'Fabricación', 'Hand': 'Mano', 'Workbench': 'Mesa de trabajo', 'Kiln': 'Horno', 'Craft': 'Fabricar',
  'Stand within 4 blocks of a Workbench to use these recipes.': 'Ponte a menos de 4 bloques de una Mesa de trabajo para usar estas recetas.',
  'Stand within 4 blocks of a Kiln to use these recipes.': 'Ponte a menos de 4 bloques de un Horno para usar estas recetas.',
  'Pick up an item first, then press Drop': 'Primero coge un objeto y luego pulsa Soltar',
  // context actions / toasts / loading
  'Attack': 'Atacar', 'Open': 'Abrir', 'Close': 'Cerrar', 'Harvest': 'Cosechar', 'Till': 'Arar', 'Plant': 'Plantar', 'Eat': 'Comer', 'Fill': 'Llenar', 'Pour': 'Verter', 'USE': 'USAR',
  'Creative mode — double-tap jump to fly': 'Modo creativo — toca dos veces saltar para volar', 'Gather wood: hold BREAK on a tree trunk': 'Consigue madera: mantén ROMPER sobre un tronco',
  'World saved': 'Mundo guardado', 'Creative mode': 'Modo creativo', 'Survival mode': 'Modo supervivencia', 'Spawn point set': 'Punto de aparición fijado',
  'Shaping terrain…': 'Dando forma al terreno…', 'Generating terrain…': 'Generando terreno…', 'Lighting the world…': 'Iluminando el mundo…',
  'Hold BREAK (or press and hold the screen) to mine. Tap to place or use.': 'Mantén ROMPER (o mantén pulsada la pantalla) para picar. Toca para colocar o usar.',
  'Craft a Workbench from boards, then stand near it to unlock tools.': 'Fabrica una Mesa de trabajo con tablas y ponte cerca para desbloquear herramientas.',
  'A Kiln smelts ore veins into ingots — each batch needs fuel.': 'El Horno funde vetas de mineral en lingotes — cada tanda necesita combustible.',
  'Torches and Glowcaps keep the dark — and the Gloomlings — away.': 'Las antorchas y los Luzhongos alejan la oscuridad… y a los Penumbros.',
  'Mossbacks follow anyone carrying Emberberries.': 'Los Musgosos siguen a quien lleve Bayas de ascua.',
  'Sneak to creep up on skittish Hopkins.': 'Agáchate para acercarte a los asustadizos Saltarines.',
  'Till soil with a Tiller, plant Grain Seeds, and come back later.': 'Ara la tierra con una Azada, planta Semillas de grano y vuelve más tarde.',
  'Holding a torch lights the way around you.': 'Llevar una antorcha ilumina tu alrededor.',
  // biomes
  'Ocean': 'Océano', 'Shoreline': 'Costa', 'Meadows': 'Praderas', 'Ashwood Forest': 'Bosque de fresnos', 'Dunes': 'Dunas', 'Highlands': 'Tierras altas',
  'Frostlands': 'Tierras heladas', 'River': 'Río', 'Isles': 'Islas',
  // creatures
  'Mossback': 'Musgoso', 'Hopkin': 'Saltarín', 'Glimmerwing': 'Alabrillo', 'Gloomling': 'Penumbro', 'Crag Crawler': 'Reptarroca', 'Stingwisp': 'Aguijonero',
  // blocks & items
  'Deepstone': 'Piedra profunda', 'Stone': 'Piedra', 'Soil': 'Tierra', 'Meadow Turf': 'Césped', 'Sand': 'Arena', 'Gravel': 'Grava', 'Clay': 'Arcilla',
  'Sandstone': 'Arenisca', 'Snowpack': 'Nieve', 'Ice': 'Hielo', 'Water': 'Agua', 'Magma': 'Magma', 'Ashwood Log': 'Tronco de fresno', 'Ashwood Leaves': 'Hojas de fresno',
  'Pine Log': 'Tronco de pino', 'Pine Needles': 'Agujas de pino', 'Palm Trunk': 'Tronco de palmera', 'Palm Fronds': 'Hojas de palmera', 'Ashwood Boards': 'Tablas de fresno',
  'Pine Boards': 'Tablas de pino', 'Rubble': 'Escombro', 'Hewn Stone': 'Piedra tallada', 'Fired Bricks': 'Ladrillos', 'Glass': 'Cristal', 'Coal Seam': 'Veta de carbón',
  'Copper Vein': 'Veta de cobre', 'Iron Vein': 'Veta de hierro', 'Sunstone Vein': 'Veta de piedrasol', 'Azurite Geode': 'Geoda de azurita',
  'Glowshard Cluster': 'Cúmulo de brillaesquirla', 'Wild Grass': 'Hierba silvestre', 'Sunpetal': 'Solpétalo', 'Duskbell': 'Campanocaso',
  'Emberberry Bush': 'Arbusto de bayas de ascua', 'Spineplant': 'Espinplanta', 'Dry Shrub': 'Matorral seco', 'Glowcap': 'Luzhongo', 'Torch': 'Antorcha',
  'Storage Crate': 'Cofre', 'Lumen Lamp': 'Lámpara lumen', 'Woven Cloth (Snow)': 'Tela tejida (Nieve)', 'Woven Cloth (Ember)': 'Tela tejida (Ascua)',
  'Woven Cloth (Tide)': 'Tela tejida (Marea)', 'Woven Cloth (Moss)': 'Tela tejida (Musgo)', 'Woven Cloth (Sun)': 'Tela tejida (Sol)', 'Woven Cloth (Night)': 'Tela tejida (Noche)',
  'Mossy Rubble': 'Escombro musgoso', 'Mosaic Tiles': 'Mosaico', 'Copper Plating': 'Placas de cobre', 'Iron Plating': 'Placas de hierro', 'Sunstone Block': 'Bloque de piedrasol',
  'Azurite Block': 'Bloque de azurita', 'Slate': 'Pizarra', 'Frost Turf': 'Césped helado', 'Stone Pillar': 'Columna de piedra', 'Ashwood Sapling': 'Brote de fresno',
  'Pine Sapling': 'Brote de pino', 'Stick': 'Palo', 'Plant Fiber': 'Fibra vegetal', 'Coal': 'Carbón', 'Copper Ingot': 'Lingote de cobre', 'Iron Ingot': 'Lingote de hierro',
  'Sunstone Ingot': 'Lingote de piedrasol', 'Azurite Gem': 'Gema de azurita', 'Glowshard': 'Brillaesquirla', 'Glow Dust': 'Polvo brillante', 'Gloom Essence': 'Esencia sombría',
  'Hopkin Fur': 'Pelaje de saltarín', 'Emberberries': 'Bayas de ascua', 'Raw Haunch': 'Muslo crudo', 'Roast Haunch': 'Muslo asado', 'Grain Seeds': 'Semillas de grano',
  'Grain': 'Grano', 'Grain Stalks': 'Espigas', 'Trail Bread': 'Pan de viaje', 'Door': 'Puerta', 'Clay Bucket': 'Cubo de arcilla', 'Bucket of Water': 'Cubo de agua',
  'Crag Shard': 'Fragmento de roca', 'Glowcap Stew': 'Guiso de luzhongo', 'Tilled Soil': 'Tierra arada',
  'Wooden Pick': 'Pico de madera', 'Wooden Hatchet': 'Hacha de madera', 'Wooden Spade': 'Pala de madera', 'Wooden Blade': 'Espada de madera',
  'Stone Pick': 'Pico de piedra', 'Stone Hatchet': 'Hacha de piedra', 'Stone Spade': 'Pala de piedra', 'Stone Blade': 'Espada de piedra',
  'Copper Pick': 'Pico de cobre', 'Copper Hatchet': 'Hacha de cobre', 'Copper Spade': 'Pala de cobre', 'Copper Blade': 'Espada de cobre',
  'Iron Pick': 'Pico de hierro', 'Iron Hatchet': 'Hacha de hierro', 'Iron Spade': 'Pala de hierro', 'Iron Blade': 'Espada de hierro',
  'Azure Pick': 'Pico azur', 'Azure Hatchet': 'Hacha azur', 'Azure Spade': 'Pala azur', 'Azure Blade': 'Espada azur',
  'Wooden Tiller': 'Azada de madera', 'Stone Tiller': 'Azada de piedra',
  'Any Boards': 'Cualquier tabla', 'Any Log': 'Cualquier tronco', 'Any Leaves': 'Cualquier hoja', 'Fuel (coal/wood)': 'Combustible (carbón/madera)', 'Rubble or Stone': 'Escombro o piedra',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Day (\d+) · (.+)$/, (m) => `Día ${m[1]} · ${m[2]}`],
  [/^Seed (.*)$/, (m) => `Semilla ${m[1]}`],
  [/^(.+) · seed (.+) · Day (\d+)$/, (m) => `${m[1]} · semilla ${m[2]} · Día ${m[3]}`],
  [/^(\d+)× (.+?)( \(\d+\))?$/, (m) => `${m[1]}× ${tr(m[2])}${m[3] || ''}`],
  [/^(.+) broke!$/, (m) => `¡${tr(m[1])} se rompió!`],
  [/^(.+) summoned$/, (m) => `${tr(m[1])} invocado`],
  [/^(.+) — tap a slot to place$/, (m) => `${tr(m[1])} — toca una casilla para dejarlo`],
  [/^You were defeated by (.+?)\.( Your belongings were scattered where you fell\.)?$/, (m) => `Te derrotó ${tr(m[1])}.${m[2] ? ' Tus pertenencias quedaron esparcidas donde caíste.' : ''}`],
  [/^Delete "(.+)" forever\? This cannot be undone\.$/, (m) => `¿Borrar "${m[1]}" para siempre? No se puede deshacer.`],
];
const DEATH_SRC: Record<string, string> = { 'a fall': 'una caída', 'magma': 'el magma', 'a spineplant': 'una espinaplanta', 'the void': 'el vacío', 'drowning': 'el ahogamiento', 'starvation': 'el hambre' };

function tr(s: string): string {
  if (ES[s] !== undefined) return ES[s];
  if (DEATH_SRC[s]) return DEATH_SRC[s];
  for (const [re, f] of PATTERNS) { const m = s.match(re); if (m) return f(m); }
  return s;
}

/** Translate a UI string into the current language. */
export function t(s: string): string { return lang === 'en' ? s : tr(s); }

function translateNode(n: Node) {
  if (n.nodeType === 3) {
    const v = n.nodeValue || '';
    const trimmed = v.trim();
    if (!trimmed) return;
    const out = tr(trimmed);
    if (out !== trimmed) n.nodeValue = v.replace(trimmed, out);
  } else if (n.nodeType === 1) {
    const e = n as HTMLElement;
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return;
    for (const a of ['placeholder', 'title']) { const v = e.getAttribute(a); if (v) { const o = tr(v); if (o !== v) e.setAttribute(a, o); } }
    if (e.tagName === 'INPUT' && (e as HTMLInputElement).type === 'text') { const ie = e as HTMLInputElement; if (ES[ie.value]) ie.value = ES[ie.value]; }
    for (const c of Array.from(n.childNodes)) translateNode(c);
  }
}

/** Keeps everything rendered inside `root` translated. */
export function watchTranslations(root: HTMLElement) {
  if (lang === 'en') return;
  translateNode(root);
  document.title = 'ZperCraft';
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else for (const n of Array.from(m.addedNodes)) translateNode(n);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
