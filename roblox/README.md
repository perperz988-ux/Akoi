# Port Solano para Roblox

Versión pequeña y original de Port Solano (ciudad costera tropical) para Roblox:
mundo abierto con coches, trabajos de reparto y conchas doradas escondidas.
Todo el mapa se construye por código al arrancar el servidor, sin modelos externos.

## Qué hay en el mapa (~1000 x 900 studs, unas 2.900 piezas)

| Zona | Qué tiene |
|---|---|
| **Plaza Solano** (Downtown) | Punto de aparición, fuente, palmeras, letrero PORT SOLANO |
| **Downtown** | Rascacielos de cristal (algunos con antena y luz roja) |
| **Galleria** | Centro comercial con letrero neón y aparcamiento |
| **Puerto Saltworks** | Contenedores apilados, muelles, 2 grúas y un barco carguero |
| **Parque Mirador** | Árboles, estanque, caminos y bancos |
| **Palm Hollow** | Casas de colores con tejado, jardín y palmera |
| **Ironside** | Edificios de ladrillo con tiendas (TACOS, PIZZA, BARBERIA…) |
| **Ocean Mile** | Hoteles con balcones y piscinas frente al mar |
| **Playa Sunreef** | Arena que entra al mar, palmeras, sombrillas, chiringuito, torre de socorrista |
| **Coral Key** | Isla de mansiones con piscina, unida por un puente |

También hay calles con líneas, farolas que se encienden de noche, un ciclo de día y noche
(un día dura 12 minutos) y mar de verdad en el que se puede nadar.

## Cómo se juega (sirve en celular)

- **Coche**: aparece tu coche al lado y te sube. También puedes usar los coches aparcados con el botón *Conducir*.
- **Trabajo**: te da una entrega en otro punto de la ciudad. Ve hasta la baliza naranja. Si llegas a tiempo cobras todo y si llegas tarde, la mitad.
- **Conchas doradas**: hay 25 escondidas. Cada una da $250 y encontrarlas todas da $10.000.
- El dinero y las conchas se guardan (DataStore).
- Conducción: joystick del celular / WASD / mando. Para bajarte, salta.

## Archivos

- `src/ReplicatedStorage/Layout.luau`: datos del mapa (calles, distritos, destinos, conchas)
- `src/ServerScriptService/World.server.luau`: construye el mapa, la luz y el día/noche
- `src/ServerScriptService/Vehicles.server.luau`: coches aparcados y coche personal
- `src/ServerScriptService/Gameplay.server.luau`: dinero, conchas, trabajos y guardado
- `src/StarterPlayerScripts/CarController.client.luau`: conducción arcade
- `src/StarterPlayerScripts/HUD.client.luau`: interfaz (dinero, botones, velocímetro, misión)
- `build-binary.mjs`: genera `PortSolano.rbxl` (binario), el que se sube a Roblox
- `build.mjs`: genera `PortSolano.rbxlx` (XML, para abrir en Studio; Open Cloud no lo acepta)
- `publish.mjs`: sube `PortSolano.rbxl` a tu experiencia con Roblox Open Cloud

```bash
node roblox/build-binary.mjs
UNIVERSE_ID=9680075881 PLACE_ID=108867858989474 ROBLOX_API_KEY=... node roblox/publish.mjs
# o con curl:
curl -X POST "https://apis.roblox.com/universes/v1/9680075881/places/108867858989474/versions?versionType=Published" \
  -H "x-api-key: $ROBLOX_API_KEY" -H "Content-Type: application/octet-stream" --data-binary @roblox/PortSolano.rbxl
```
