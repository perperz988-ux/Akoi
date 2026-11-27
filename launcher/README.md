# Akoi Launcher

Launcher (pantalla de inicio) moderno para Android, en **negro, azul y anaranjado**.

## Estilo "AI OS"

- **Orbe de IA animado** (azul y anaranjado) que gira y respira. Tócalo y **habla**.
- **Barra de Akoi AI**: escribe o di órdenes en español y aparecen tarjetas de acción:
  - "abre WhatsApp", "abre la cámara"
  - "pon una alarma a las 7:30", "despiértame a las 6 de la mañana"
  - "temporizador de 10 minutos"
  - "enciende la linterna" / "apaga la linterna"
  - "llama al 5551234", "llamar a mamá"
  - "cómo llegar a la plaza central"
  - "wifi", "bluetooth", "brillo", "batería", "ajustes"
  - "cuánto es 25 por 4", "120 / 3 + 7" (toca el resultado para copiarlo)
  - "qué hora es", "qué día es hoy"
  - "qué es un agujero negro", "busca recetas de pasta" → búsqueda web
- **Sugeridas para ti**: aprende qué apps usas y a qué hora del día, y te las propone.
  Todo se guarda solo en tu teléfono.
- Saludo según la hora ("Buenos días", "Buenas tardes", "Buenas noches").
- Al buscar, el reloj y el orbe se recogen con animación para dejar espacio.

El asistente funciona **sin internet** con reglas locales (no usa un modelo de IA en la nube).

## Qué hace

- **Reloj grande en azul oscuro** con brillo azul, y la fecha en anaranjado.
- **Buscador de apps**: escribe y filtra al instante (ignora acentos y mayúsculas).
  Pulsa *Enter* para abrir el primer resultado.
- **Ventanas con letras** (`#`, A–Z y Ñ): cada ventana muestra cuántas apps empiezan
  con esa letra. Tócala para ver solo esas apps. Las letras sin apps aparecen apagadas.
- **TODAS**: lista completa en orden alfabético con encabezados por letra.
- Mantén pulsada una app para ver **Información** o **Desinstalar**.
- Se actualiza solo al instalar o quitar apps. Incluye apps del perfil de trabajo.
- *Atrás* y *Inicio* siempre vuelven a la pantalla de letras.

## Compilar

Requisitos: JDK 17 y Android SDK (API 34).

```bash
cd launcher
./gradlew assembleDebug
# APK: launcher/app/build/outputs/apk/debug/app-debug.apk
```

También se compila automáticamente en GitHub Actions (workflow *Build Akoi Launcher APK*);
el APK queda como artefacto `akoi-launcher-debug-apk`.

## Usarlo como launcher

1. Instala el APK.
2. Pulsa el botón *Inicio* del teléfono y elige **Akoi Launcher** → *Siempre*.
   O desde el menú **⋮** del launcher → *Fijar como launcher predeterminado*.
