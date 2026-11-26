# Port Solano para Roblox

La **misma ciudad que el juego original**: el mapa se genera ejecutando el código de
`src/world` (CityLayout + World) y convirtiendo cada pieza en Parts de Roblox.
3,2 × 3,2 km (1 metro = 2 studs), 32 × 32 manzanas, unas 64.000 piezas y StreamingEnabled activado.

Distritos: Downtown Solano, Midtown, Bellavista Heights, Ocean Mile, Sunreef Beach, Palm Hollow,
Ironside, Saltworks Port, Galleria District, Solano International (aeropuerto), Cypress Flats,
Mirador Park, Rio Lento (río con puentes), Vela Marina y Coral Key, además de la Route 9 y la Bayshore Expressway.

## Cómo se juega

- **Coche**: aparece tu coche al lado. Hay 77 coches aparcados por la ciudad (botón *Conducir*).
- **Trabajo**: entregas a los 35 puntos de interés del original (Mercy Bay General, Port Solano PD, Hotel Azure…).
- **Paquetes ocultos**: los 64 escondites del juego original. Cada uno da $250 y encontrarlos todos da $10.000.
- Día y noche (16 min), mar/río/playa con agua real, el dinero se guarda.

## Compilar y publicar

```bash
npm ci                      # en la raíz del repo (three + esbuild)
node roblox/build.mjs       # genera roblox/PortSolano.rbxl
curl -X POST "https://apis.roblox.com/universes/v1/9680075881/places/108867858989474/versions?versionType=Published" \
  -H "x-api-key: $ROBLOX_API_KEY" -H "Content-Type: application/octet-stream" --data-binary @roblox/PortSolano.rbxl
```

## Archivos

- `tools/capture.ts`: ejecuta el generador original y captura sus primitivas (con algunas simplificaciones)
- `tools/build-place.ts`: convierte las primitivas en Parts, genera `LayoutData` y escribe el `.rbxl`
- `tools/rbxl.ts`: escritor del formato binario de Roblox
- `src/ReplicatedStorage/Layout.luau`: distritos, destinos, paquetes y coches (usa `LayoutData`)
- `src/ServerScriptService/World.server.luau`: mar, río y playa (Terrain), luz y día/noche
- `src/ServerScriptService/Vehicles.server.luau`: coches aparcados y coche personal
- `src/ServerScriptService/Gameplay.server.luau`: dinero, paquetes, trabajos y guardado
- `src/StarterPlayerScripts/CarController.client.luau`: conducción arcade
- `src/StarterPlayerScripts/HUD.client.luau`: interfaz para el celular
