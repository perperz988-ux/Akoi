# Akoi Launcher

Launcher (pantalla de inicio) moderno para Android, en **negro, azul y anaranjado**.

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
