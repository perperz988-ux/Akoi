#!/usr/bin/env bash
# Prueba ZperOS en un emulador: instalar, fijar como launcher, abrir y capturar pantallas.
set -u
PKG=com.zperos.launcher
APK=${APK:-app-debug.apk}
mkdir -p shots
fail=0

adb install -r "$APK" || { echo "FALLO: no se pudo instalar"; exit 1; }

echo "== Apps de pantalla de inicio disponibles =="
adb shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tee home.txt
grep -q "$PKG" home.txt && echo "OK: ZperOS aparece como pantalla de inicio" || { echo "FALLO: ZperOS no aparece como launcher"; fail=1; }

echo "== Fijar como launcher predeterminado =="
adb shell cmd role add-role-holder android.app.role.HOME $PKG 0
sleep 2
adb shell cmd role get-role-holders android.app.role.HOME | tee holder.txt
grep -q "$PKG" holder.txt && echo "OK: ZperOS es el launcher predeterminado" || { echo "FALLO: no quedó como predeterminado"; fail=1; }

adb logcat -c
adb shell input keyevent KEYCODE_HOME
sleep 6
adb exec-out screencap -p > shots/1_portada.png

# Empujar la losa hacia arriba (pantalla 1080x2400).
adb shell input swipe 540 2150 540 300 250
sleep 3
adb exec-out screencap -p > shots/2_inicio.png

# Abrir la losa "Todas A-Z" (la última, abajo).
adb shell input tap 300 2250
sleep 3
adb exec-out screencap -p > shots/3_az.png

# Buscar con el asistente.
adb shell input tap 400 415
adb shell input text "cuanto%ses%s25%spor%s4"
sleep 2
adb exec-out screencap -p > shots/4_buscar.png
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_BACK

# Pulsar Inicio de nuevo: debe seguir ZperOS en primer plano.
adb shell input keyevent KEYCODE_HOME
sleep 3
adb shell dumpsys activity activities | grep -m3 -E "mResumedActivity|topResumedActivity" | tee top.txt
grep -q "$PKG" top.txt && echo "OK: al pulsar Inicio se abre ZperOS" || { echo "FALLO: Inicio no abre ZperOS"; fail=1; }

adb shell pidof $PKG >/dev/null && echo "OK: ZperOS sigue funcionando" || { echo "FALLO: ZperOS no está corriendo"; fail=1; }
adb logcat -d -b crash > crash.txt
if grep -q "$PKG" crash.txt; then echo "FALLO: ZperOS se cerró con error:"; cat crash.txt; fail=1; else echo "OK: sin cierres inesperados"; fi

# Miniaturas en el log para poder verlas sin descargar artefactos.
python3 - <<'PY' || true
import base64, io, glob
try:
    from PIL import Image
except ImportError:
    raise SystemExit(0)
for f in sorted(glob.glob("shots/*.png")):
    im = Image.open(f).convert("RGB"); im.thumbnail((300, 660))
    b = io.BytesIO(); im.save(b, "JPEG", quality=55)
    print("THUMB", f, base64.b64encode(b.getvalue()).decode())
PY
exit $fail
