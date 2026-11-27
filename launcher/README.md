# Akoi Launcher

Launcher para Android con estilo **"losa"** (slab): bloques de color sólido que se apilan,
números gigantes y cajones tipo acordeón en lugar de una cuadrícula de iconos.
Todo en español, con toque gamer, y **cada color se puede cambiar**.

## Pantallas

### Portada
- La **hora** y los **minutos** gigantes se salen por los bordes de la pantalla.
- Abajo, una losa con la fecha, la batería y la próxima alarma.
- **Empuja la losa hacia arriba** para entrar: las bandas la siguen como hojas de papel,
  con física de resortes.
- Vuelve a aparecer al apagar la pantalla (se puede desactivar). Toca el reloj de inicio para verla.

### Inicio
- Reloj grande, fecha, batería y alarma.
- **Buscador / asistente Akoi**: busca apps o escribe órdenes en español
  ("abre WhatsApp", "alarma a las 7:30", "temporizador 10 minutos", "enciende la linterna",
  "cuánto es 25 por 4", "qué es un agujero negro"…). Botón de micrófono para hablar.
- **Losas apiladas** (solo una abierta a la vez):
  - 🎮 **Juegos**: tus juegos ordenados por los que más juegas, con contador de partidas.
  - 💬 **Social**, ▶ **Ver y escuchar**, ✎ **Crear**: las apps se ordenan solas por tipo.
  - ⚙ **Sistema**: accesos rápidos (linterna, Wi‑Fi, Bluetooth, brillo, modo juego,
    colores, elegir launcher, ajustes) y apps del sistema.
  - **Todas A–Z**: ventanas con cada letra (`#`, A–Z, Ñ) para encontrar apps en orden alfabético.
- Mantén pulsada una app: información o desinstalar.

### 🎨 Personalizar
- Temas listos: **Akoi** (negro, azul y naranja), **Neón gamer**, **Atardecer**, **Matrix**,
  **Lava**, **Hielo** y **Mono**.
- Cambia **el color de cada losa**, el fondo, el reloj y el buscador con tono, saturación y brillo,
  colores rápidos o código `#RRGGBB`.
- El texto cambia solo a claro u oscuro para que siempre se lea.

## Compilar

Requisitos: JDK 17 y Android SDK (API 34).

```bash
cd launcher
./gradlew assembleDebug
# APK: launcher/app/build/outputs/apk/debug/app-debug.apk
```

También se compila en GitHub Actions (workflow *Build Akoi Launcher APK*);
el APK queda como artefacto `akoi-launcher-debug-apk`.

## Usarlo como launcher

1. Instala el APK.
2. Pulsa *Inicio* y elige **Akoi Launcher** → *Siempre*
   (o en la losa **Sistema** → *Launcher*).
