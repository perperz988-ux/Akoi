# SKYWARD — Flight Simulator

A playable, physics-based flight simulator for phones and desktops, built with TypeScript + Three.js (WebGL2).
It lives alongside Port Solano in this repo as its own Vite project in `flight/`.

```bash
npm install
npm run dev:flight          # http://localhost:5174 (desktop or phone on the same network)
npm run build:flight        # flight/dist/
npm run build:flight:html   # flight/dist/skyward.html — single self-contained file (copy in release/)
```

## Real-world data (all open / public domain)
| Data | Source | Use |
|---|---|---|
| Terrain elevation | Mapzen / AWS Terrain Tiles ("Terrarium": SRTM, GMTED2010, ETOPO1…) streamed at runtime | Quadtree LOD terrain z4–z14, coastlines & bathymetry |
| Airports, runways (threshold coords, length, width, surface, lighting, displaced thresholds) | OurAirports | 2,006 airports in 221 countries |
| Countries, coastlines, cities, rivers, lakes, urban areas, highways | Natural Earth 1:50m / 1:10m | World map, landcover painted per terrain tile, 3D city placement |

`flight/tools/build-data.mjs <dir>` regenerates `flight/src/data/gen/*.json` from the downloaded source files.
Without network the terrain falls back to synthetic heights generated from the coastline mask.

## Aircraft
Cessna 172S, Citation CJ4, A320neo, 737-800, 787-9, A330-300, A350-900, 777-300ER, 747-8I.
Dimensions, weights, thrust and speeds come from manufacturer airport-planning documents / spec sheets (sources listed
in-game). Models are procedural and dimensionally accurate: lofted fuselage with type-specific nose/tail, swept tapered wings
with real airfoil thickness, winglets/sharklets/raked tips, animated flaps (Fowler motion), slats, spoilers, ailerons,
elevators, rudder, spinning fans/propeller, retracting gear with bogies and doors, cabin door, nav/beacon/strobe/landing/
taxi/logo lights and fictional airline liveries.

## Simulation
* 6-DOF rigid body at 240 Hz: lift curve with stall & post-stall, flap/spoiler/gear increments, induced and wave drag,
  ground effect, stability & damping derivatives, ISA atmosphere, turbofan spool/thrust lapse/fuel flow, piston power
  lapse, P-factor, weight & inertia from fuel/payload, gear spring-dampers, tyre friction, brakes, reverse thrust,
  contaminated runways, tail strikes, hard landings, ditching and crashes.
* Flight-control laws: Airbus normal law (rate command, auto-trim, bank & alpha protection), Boeing yaw damper,
  direct GA controls; optional "Assisted" mode for touch screens.
* Autopilot / autothrottle: HDG, LNAV, ALT, V/S, SPD, APPR (LOC + 3° G/S) with autoland flare.
* Systems: battery, APU, fuel pumps, engine start sequence, lights, door, parking brake, pushback with tug.
* Validated: C172 climbs ~760 fpm at 79 kt; A320 rotates at 143 kt and lifts off ~28 s after brake release; autoland
  touchdowns ~ −230 fpm.

## World
Streaming terrain with floating origin and earth curvature, procedural biomes (desert, forest, farmland patchwork, rock,
snowlines by latitude), lakes/rivers/highways/urban areas painted from vector data, night city lights, reflective
water, streamed 3D buildings and trees, airports generated from real runway geometry (markings, piano keys,
designators, TDZ/aiming points, parallel taxiways & exits, aprons, terminals, gates with jet bridges, parked traffic,
tower, hangars, moving ground vehicles, signs, windsocks, edge/centreline/threshold/approach lights with sequenced
flashers and functional PAPI).

Weather: clear, few, scattered, overcast, rain, thunderstorm (lightning + thunder), fog, snow, strong crosswind,
or dynamic evolution; wind shear with altitude, gusts, turbulence, in-cloud whiteout. Astronomical sun position,
sunrise/sunset/night with stars and moon.

## Modes & UI
Free Flight (country → city → airport → runway/start position, aircraft & livery, destination, weather, time, fuel,
payload, route summary with waypoints, distance, ETE, cruise FL by the semicircular rule), Career (12 progressive
flights with unlocks and credits), Landing Challenges (graded landings), World Exploration (anywhere; teleport from the
map), World Map, Aircraft, Airports database, Settings (quality presets, assist level, tilt/joystick, sensitivity…).

Cameras: cockpit (interactive 3D panel: PFD/ND/EICAS or six-pack, switches, levers, MCP knobs), pilot view, external
chase, cinematic fly-by/tower, wing, landing-gear.

## Controls
Touch: virtual stick, throttle lever, rudder/tiller strip, BRAKE, GEAR, FLAP ±, SPLR, REV, CAM, AP, LIGHTS, ENG, PARK,
MAP, pause; drag to look, pinch to zoom, tap cockpit switches. Optional device-tilt steering.
Keyboard: W/S (↑/↓) pitch · A/D (←/→) roll · Q/E rudder · Shift/Ctrl or PgUp/PgDn throttle · Home/End idle/full ·
G gear · F/V flaps · / spoilers · R reverse · B brakes · . parking brake · P pushback · Ctrl+E auto-start · L lights ·
C or 1–6 cameras · Tab AP · T A/THR · [ ] heading · , ' altitude · K LNAV · Y approach · U/J trim · M map · H HUD · Esc pause.
Gamepad supported.
