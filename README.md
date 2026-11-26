> **Nuevo:** [MOVILMANÍA](phone-factory/README.md) — tycoon de empresa de móviles, en español y en horizontal, con modo «Probar teléfono» (`release/movilmania.html`).
>
> [TRASH TO PS5](trash-to-ps5/README.md) — aventura narrativa en primera persona en un solo HTML (`release/trash-to-ps5.html`).

# PORT SOLANO

An original open-world crime-action game for Android phones (landscape, touch + gamepad).
Everything — the city, story, characters, vehicles, weapons, audio — is original; there is no
GTA / real-brand content. The game is written in **TypeScript + Three.js (WebGL2)** and packaged
for Android with **Capacitor**. Every texture, model and sound is generated procedurally at runtime,
so the whole game ships as a ~1 MB bundle with no external assets.

## Run it

```bash
npm install
npm run dev          # desktop browser (WASD + mouse, or force touch controls in Settings)
npm run build        # type-check + production bundle in dist/
```

### Build the Android APK

* **CI (recommended):** push the branch — `.github/workflows/android.yml` builds
  `app-debug.apk` on a GitHub runner and uploads it as the `port-solano-debug-apk` artifact.
* **Locally:** install Android Studio (SDK 34, JDK 17), then
  `npm run android:sync && npm run android:open` and press *Run* (or `cd android && ./gradlew assembleDebug`).

The native project (`android/`) is pre-configured: forced landscape, immersive full-screen, keep-screen-on,
display-cutout aware, hardware accelerated, `largeHeap`, vibration haptics, Back button → pause menu,
app-private save storage (Capacitor Filesystem, mirrored in localStorage).

## The game

**Setting.** Port Solano — a 3.2 km × 3.2 km fictional Florida-style coastal city: Downtown skyscrapers,
Midtown with back alleys, Bellavista Heights (luxury), Coral Key (private island), Ocean Mile resorts,
Sunreef Beach, Palm Hollow suburbs, Ironside (poorer district), Saltworks Port (industry, containers,
gantry cranes), Galleria shopping district, Solano International airport, Vela Marina, Mirador Park,
Cypress Flats (rural), a river with bridges, highways (Route 9, Bayshore Expressway), construction sites
with climbable frames, and metro stations (underground interiors).

**Story — "Undertow".** 12 missions across 4 chapters (vehicle theft, street race, dead-drop shootout,
stealth infiltration, tailing a courier, a four-star heist & getaway, investigation, escort under attack,
gang turf war, convoy ambush + business takeover, boat chase finale) with cinematic camera moments,
subtitles, checkpoints, fail conditions, retry-from-checkpoint and rewards. Plus repeatable side jobs
(3 street races, vehicle exports, courier runs, bounties) and random street events (muggings, accidents,
gang shootouts, vehicle fires, stranded motorists, thieves on the run).

**Systems.** Player (walk/jog/sprint/jump/crouch/swim/climb/dodge-roll/cover/stealth takedowns),
8 fictional weapons (fists, bat, taser, pistol, SMG, shotgun, rifle, grenade), 30 original vehicles
(sports, super, muscle, sedans, SUVs, pickups, bikes, boats, jet-ski, helicopter, service vehicles) with
tyre-slip driving model, suspension, gearbox, nitro, damage + dents + fire + explosions, working
headlights/brake lights/sirens, interiors and drivers; traffic with lights/yielding; pedestrians with
routines, businesses opening/closing, witnesses who phone in crimes (unwitnessed crimes don't raise heat),
memory of recent crimes, gossip bubbles and dialogue; police with 5 wanted levels (cruisers, SUVs, SWAT,
helicopter, roadblocks, search phase, arrests); ambulances and fire crews; wildlife; economy (shops,
dealer, garage tuning/paint, properties, passive-income businesses, relationships with 4 contacts);
phone, GPS route, full map; 3 save slots + autosave.

## Free Roam & Cheats

* Title screen → **Free Roam (sandbox, no missions)**: starts at the beach condo with $1,000,000, all weapons, all
  safehouses and contacts unlocked; missions/jobs are disabled (random street events can be switched off).
* **⚡ CHEATS** button (always shown in Free Roam; in the story enable it in *Pause → Cheats*; `F1` on keyboard):
  god mode, infinite stamina/ammo, super jump/speed, fly/noclip, slow motion, money & unlock-all, wanted level
  control (never wanted / set 1–5 ★), spawn any of the 30 vehicles, time/weather/traffic/pedestrian controls,
  explosions, spawn gang or police, indestructible vehicle, infinite nitro, teleport to any location or waypoint.

## Controls

Touch: floating joystick (left), drag the right side to look, context button (enter vehicles/shops, talk,
rob when armed, start missions), fire / aim / jump / sprint / crouch / dodge / cover / reload / weapon;
in vehicles gas / brake / handbrake / nitro / horn / view / radio / lights; helicopter up/down.
**Settings → Controls → Edit touch layout** lets you drag and resize every button. Tilt-steering is optional.
Gamepad (Android / Bluetooth) works automatically. Keyboard: WASD, Shift, Space, F enter/exit, E interact,
C crouch, Q cover, Alt dodge, R reload, Tab weapon, V camera, H horn, M map, P phone, Esc pause.

## Architecture (`src/`)

| Module | Responsibility |
| --- | --- |
| `core/` | `Game` (main loop, state, streaming orchestration), `Input` (touch/keyboard/gamepad), event bus, math |
| `settings/` | Graphics presets LOW–ULTRA, device detection → recommended preset, **dynamic resolution** governor |
| `world/` | `CityLayout` (procedural city), `World` (cell streaming, 2-level LOD, software occlusion probe, merged geometry), `Collision` (spatial hash), `Interiors`, `Markers` (+GPS BFS), textures |
| `env/` | Time of day, weather state machine (clear/cloudy/rain/storm/fog), sky shader, water shader, IBL bake |
| `actors/` | `Player` controller, procedural animated `Humanoid` (+single-draw-call far LOD), `Npc` |
| `vehicles/` | Defs, procedural meshes (near + merged far LOD), physics (car/bike/boat/heli), manager (collisions, lights, wrecks) |
| `ai/` | `Traffic` (lane following, signals), `Peds` (routines, reactions, witnesses, wildlife), `Police`, `Emergency` |
| `combat/` | Weapons, hitscan/explosions/grenades, dynamic props (cones, barrels…) |
| `missions/` | Mission framework + story + side jobs, random events |
| `economy/` | Money, shops, dealer, tuning, properties, businesses, relationships |
| `save/` | Multi-slot persistence (Capacitor Filesystem + localStorage) |
| `audio/` | Fully procedural WebAudio: engines, sirens, tyres, weather, ambience, SFX, voices, 4 radio stations + exploration/tension/chase music |
| `camera/` | Third-person rig (walk / drive ×4 views / combat / boat / heli / cinematic), collision, shake |
| `ui/` | HUD, minimap/map, phone, menus, pause, touch controls with editable layout |

### Performance strategy

* World is 32×32 cells; only cells near the player are built (full detail), a ring beyond is built as a cheap
  skyline LOD, the rest is unloaded. Cell meshes are merged (≈3 draw calls per cell), built within a per-frame ms budget.
* Coarse CPU **occlusion probe** hides far cells hidden behind towers; frustum culling per cell.
* NPC / traffic **simulation LOD**: full AI near the player, 4 Hz / 1 Hz reduced updates farther out, despawn beyond sim radius.
  Distant humans and vehicles switch to single-mesh LODs; pooled particles, props, lights, markers, audio voices.
* Textures are generated on demand and swept when unused; geometry of unloaded cells is disposed.
* **Dynamic resolution** (down to 55 %) holds 30/60 FPS targets; the *AUTO* preset detects the GPU/RAM and
  can automatically step the preset down if the device cannot keep up.

## Honest status / limitations

* The Android APK could not be compiled in the development sandbox (no Android SDK / network access to Google's
  repositories) — the project is validated by TypeScript type-checking, a production web build, headless-Chromium
  playthrough tests (driving every vehicle, all missions' steps, combat, police chases, interiors, save/load,
  touch input) and the CI workflow that produces the APK.
* Visuals are a *stylised* low-poly look (PBR materials, dynamic sky, shadows, bloom, reflections, rain/fog),
  not photoreal — procedural content and a ~1 MB budget are the trade-off. Tune on real hardware with
  *Settings → Graphics → Show FPS*.
* Audio is synthesized (no recorded samples), so it sounds retro-electronic rather than studio-quality.
* Characters use procedural rigs (no motion-captured animation).
