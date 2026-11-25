# Duelo Arena

Shooter 3D para 2 jugadores en el mismo teclado (o con 2 mandos), en un solo archivo HTML con Three.js.

## Jugar
Abre `index.html` en el navegador (necesita internet para cargar Three.js desde el CDN).
Para la carga automática de `models/*.glb`, sírvelo con un servidor: `npx serve duelo` o `python3 -m http.server -d duelo`.

| | Jugador 1 (rojo) | Jugador 2 (azul) |
|---|---|---|
| Mover | W A S D | Flechas |
| Disparar | Espacio / F | Enter / L |
| Recargar | R | K |

Mandos: stick izquierdo mueve, stick derecho apunta, A/RT dispara, X recarga. `Esc` pausa.
Gana quien llegue primero a 5 bajas. Los cubos verdes curan 40 HP.

## Modelos de Sketchfab
1. **Arrastrar GLB:** descarga el modelo en Sketchfab ("Download 3D Model" → GLB) y arrástralo a la casilla del jugador.
2. **Por enlace:** pega tu API token (Sketchfab → Settings → Password & API) y el enlace del modelo; el juego lo descarga por la API.
3. **Archivos fijos:** `models/player1.glb` y `models/player2.glb`.

Los modelos se escalan solos a 1,8 m. Si tienen animaciones `idle`/`walk`/`run`, se usan automáticamente.
Respeta la licencia de cada modelo (CC-BY exige dar crédito al autor).

## ¿Modelo demasiado grande?
- No muevas el archivo: usa la opción 2 (token + enlace) y el juego lo descarga directamente.
- O comprímelo (100 MB → pocos MB). El juego soporta Draco, Meshopt y texturas WebP:

```bash
npx @gltf-transform/cli optimize modelo.glb modelo-mini.glb --compress meshopt --texture-compress webp --texture-size 1024
```

- GitHub no acepta archivos de más de 100 MB: comprímelos antes de subirlos a `models/`.
