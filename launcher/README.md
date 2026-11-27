# ZperOS

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
- **Buscador / asistente Zper**: busca apps o escribe órdenes en español
  ("abre WhatsApp", "alarma a las 7:30", "temporizador 10 minutos", "enciende la linterna",
  "cuánto es 25 por 4", "qué es un agujero negro"…). Botón de micrófono para hablar.
- **Losas apiladas** (solo una abierta a la vez):
  - 🎮 **Juegos**: tus juegos ordenados por los que más juegas, con contador de partidas.
  - 💬 **Social**, ▶ **Ver y escuchar**, ✎ **Crear**: las apps se ordenan solas por tipo.
  - ⚙ **Sistema**: accesos rápidos (linterna, Wi‑Fi, Bluetooth, brillo, modo juego,
    colores, elegir launcher, ajustes) y apps del sistema.
  - **Todas A–Z**: ventanas con cada letra (`#`, A–Z, Ñ) para encontrar apps en orden alfabético.
- Mantén pulsada una app: información o desinstalar.

### 🤖 Zper AI
IA gamer integrada. Usa **Gemini (Google AI Studio, gratis)** o **Claude** (de pago).
Elige cuál y pega tu API key en **🎨 Personalizar → Zper AI**. La key gratis de Gemini se
crea en aistudio.google.com/apikey. La personalidad también se edita ahí
(o en el código: `ZperAi.kt`).

### 🎮 ¿Una app no sale en Juegos?
Mantén pulsada la app → **🎮 Mover a Juegos** (o a otra losa).

### Pantalla de inicio predeterminada
La primera vez ZperOS te pregunta si quieres usarlo como pantalla de inicio.
Si no, toca el aviso **"Hacer ZperOS mi pantalla de inicio" → ACTIVAR**, o en la losa
**Sistema → Predeterminado**. En algunos teléfonos (por ejemplo Samsung) se abre
*Ajustes → Aplicaciones predeterminadas → Pantalla de inicio*: elige **ZperOS**.

### 🎨 Personalizar
- **Letra gamer**: Gamer (Orbitron), Arcade (Press Start 2P), Bloque (Russo One),
  Retro (Audiowide) o la del Sistema. Las fuentes van incluidas (licencia SIL OFL, ver
  `app/src/main/assets/fonts/OFL.txt`).
- **Barra de arriba**: la franja de la hora, el wifi y la batería del teléfono se pinta
  del color del tema, junto con la losa del reloj.
- Temas listos: **ZperOS** (negro, azul y naranja), **Neón gamer**, **Atardecer**, **Matrix**,
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

También se compila en GitHub Actions (workflow *Build ZperOS APK*);
el APK queda como artefacto `zperos-debug-apk`.

## Usarlo como launcher

1. Instala el APK.
2. Pulsa *Inicio* y elige **ZperOS** → *Siempre*
   (o en la losa **Sistema** → *Launcher*).
