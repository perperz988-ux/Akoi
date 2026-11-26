# MOVILMANÍA 📱🏭 — De garaje a imperio

▶ **Jugar:** abre `release/movilmania.html` (un solo archivo, funciona sin internet).

**Todo el juego está en español y se juega en horizontal.** En el móvil, al tocar la pantalla se pone a pantalla completa y se bloquea en horizontal. Si giras el móvil a vertical, aparece un aviso para que lo vuelvas a girar.

* **✏️ Nombre del teléfono:** hay un campo grande encima del modelo 3D, y al crear un modelo nuevo se te pregunta cómo se llama.
* **📱 Probar teléfono** (en Diseño y en el Laboratorio): usas tu móvil como si fuera real.
  * **Apps que funcionan:** desbloqueo, inicio, centro de control, Cámara (hace fotos que van a la Galería), Calculadora, Teléfono (marcador y llamada), Música (suena), Juegos (toca el punto), Reloj, Notas, Navegador, Mensajes y Ajustes (el modo oscuro cambia de verdad).
  * **El hardware importa:** el procesador decide cuánto tardan en abrirse las apps y los FPS, la batería se gasta según su autonomía, la temperatura sube al jugar según la refrigeración, y la cámara saca peores fotos si es mala.
  * **Pruebas físicas:** ⏻ encender, 🔌 cargar (velocidad según los vatios), 💥 dejarlo caer (la pantalla se raja según la resistencia), 💧 meterlo en agua (sin IP68 se muere), 🔄 girar, 📖 plegar y 🛠 reparar.
  * **Lista de 9 tareas** de prueba de usuario.

---

## Systems (English reference)

A complete smartphone-company tycoon game that runs in **one HTML file** (`release/movilmania.html`, ~0.7 MB).
It works offline in desktop browsers and on Android phones and tablets, with touch-friendly menus and a mobile layout.

Start in a garage with $80,000, design your first phone and grow into the largest phone maker in the world.

## Everything is simulated

| System | What it does |
| --- | --- |
| **Phone creator** | Size, thickness, corner radius, form factor (bar, book fold, flip fold), screen shape (bezel, notch, water-drop, punch-hole, pill, under-display), bezels, frame (plastic, aluminum, steel, titanium, ceramic), back (plastic, glass, matte, leather, transparent with visible internals, sapphire), colors, camera layout (8 types), 1–8 cameras (20 in sandbox), camera size, flash, buttons and action key, speakers, port, wireless charging, IP68, fingerprint, face unlock, logo and name. The 3D phone is generated live: rotate it, zoom it, fold it, and tap the screen to open apps. |
| **Hardware** | 10 component types with 4–9 tiers each: CPU, RAM, storage, battery chemistry, display, camera sensor, speakers, cooling, modem, charging. Each one changes performance, battery (mAh from the phone's real volume), temperature and throttling, weight, unit cost, and the score for each audience. |
| **Operating system** | Name your OS and set the wallpaper (8 styles), icon shape, style and palette, grid, dock, font, lock-screen clock, widgets, animations, dark mode, accent color, gestures, AI assistant, default apps and control-center tiles. It renders on the 3D screen, it can be tapped, and its animation style plays when you open an app. Your OS choices affect the software score. |
| **Testing lab** | 8 tests: performance, battery, camera, drop, temperature, charging, gaming and water. Prototypes carry hidden defects that testers can find and engineers can fix. Failed tests become permanent flaws that produce bad reviews and returns. |
| **Factory** | A real-time view of the 10 production stages from components to shipping. Each stage has its own capacity and the slowest one limits the line. Units flow along the line, quality control rejects defects, and the line needs workers. You can upgrade stations and build 5 factory types, up to a robot gigafactory. |
| **Marketing** | Set the price, target audience (6 segments), ad style (6 styles), budget, up to 3 features to promote (false advertising backfires), regions and launch date. You see a predicted reaction and the margin before launching. |
| **Market** | A per-day simulation in 6 regions against 4 rival companies that release new phones over time. Sales are limited by stock. You get market share, a sales table and rival phones. |
| **Reviews** | Customer reviews are generated from what each audience values, the price and the phone's flaws, and they affect sales and reputation. |
| **Company** | Company name, logo editor, 5 employee roles with skills and salaries, monthly costs, research points, regional distribution deals. |
| **Research** | 79 technologies in 15 categories, from Spark chips to foldables, AI, satellite, MicroLED and Holo-Light displays and quantum batteries. |
| **Events** | Component shortage, factory accident, viral ad, a rival striking back, a breakthrough, terrible reviews, viral success and the World Mobile Expo. |
| **Campaign** | 7 missions: First Phone, Build It, Launch, Compete, Go Global, Flagship, Future. Finishing them unlocks **Sandbox mode** (unlimited money, every technology, presets for giant, tiny, gaming, foldable, transparent, 20-camera and futuristic phones). |
| **Cinematics** | First prototype, first boot, factory opening, first launch, sales milestones (1k to 10M), becoming the #1 company in the world, and campaign complete. |
| **Saving** | Autosave plus 3 slots, stored in localStorage. |

## Run / build

```bash
npm install
npm run pf:dev     # dev server
npm run pf:build   # → release/movilmania.html (single file)
```

The code is in `phone-factory/src/`:

- `sim.js`: the whole economy and simulation as pure logic. You can run it in Node.
- `data.js`: components, research, audiences, rivals, factories and reviews.
- `phone3d.js`: the procedural 3D phone and the viewer.
- `os.js`: the OS renderer and the logo.
- `factoryview.js`: the live factory floor.
- `cine.js`: the cinematics.
- `ui.js`: all the screens.
- `main.js`: the time loop, saving and pop-ups.

`preview.html` is a development page that renders several phone designs.
