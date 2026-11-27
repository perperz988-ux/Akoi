#!/usr/bin/env bash
# Prueba ZperOS en un emulador: instalar, fijar como launcher, abrir y capturar pantallas.
set -u
PKG=com.zper.os
APK=${APK:-app-debug.apk}
mkdir -p shots
fail=0

# Toca el primer elemento de la pantalla cuyo texto contenga $1 (usa uiautomator).
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
  python3 - "$1" <<'PY'
import re, sys, subprocess
needle = sys.argv[1]
xml = open("ui.xml", encoding="utf-8").read()
for m in re.finditer(r'<node [^>]*>', xml):
    node = m.group(0)
    t = re.search(r' text="([^"]*)"', node); h = re.search(r' hint="([^"]*)"', node)
    if (t and needle in t.group(1)) or (h and needle in h.group(1)):
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        x1, y1, x2, y2 = map(int, b.groups())
        subprocess.run(["adb", "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)])
        print("tap", needle); sys.exit(0)
print("no encontrado:", needle); sys.exit(1)
PY
}

adb install -r "$APK" || { echo "FALLO: no se pudo instalar"; exit 1; }

echo "== Apps de pantalla de inicio disponibles =="
adb shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tee home.txt
grep -q "$PKG" home.txt && echo "OK: ZperOS aparece como pantalla de inicio" || { echo "FALLO: ZperOS no aparece como launcher"; fail=1; }

echo "== Fijar como launcher predeterminado =="
# El emulador a veces tarda en aplicarlo: reintenta hasta ~60 s.
for i in $(seq 1 12); do
  adb shell cmd role add-role-holder android.app.role.HOME $PKG 0 || true
  sleep 5
  adb shell cmd role get-role-holders android.app.role.HOME | tee holder.txt
  grep -q "$PKG" holder.txt && break
done
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
adb shell input tap 400 540
adb shell input text "cuanto%ses%s25%spor%s4"
sleep 2
adb exec-out screencap -p > shots/4_buscar.png
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_BACK

# ---- Zper AI: abrir el chat, poner una key falsa y enviar. Debe responder "API key inválida"
# (eso prueba que el SDK de Claude funciona dentro de Android) y no cerrarse.
adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell input tap 400 540
adb shell input text "hola"
sleep 2
if tap_text "Preguntar a Zper AI"; then
  sleep 3
  tap_text "sk-ant" && adb shell input text "sk-ant-api03-claveFalsaDePruebaZperOS1234567890"
  sleep 1
  adb shell input keyevent KEYCODE_BACK
  tap_text "GUARDAR"
  sleep 2
  tap_text "Recomiéndame" || tap_text "Trivia"
  sleep 15
  adb exec-out screencap -p > shots/5_zper_ai.png
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
  if grep -q "API key inválida" ui.xml; then echo "OK: Zper AI llamó a Claude (respondió API key inválida, como se espera)";
  else echo "FALLO: Zper AI no mostró la respuesta esperada"; grep -o 'text="[^"]*"' ui.xml | head -40; fail=1; fi
else
  echo "FALLO: no apareció 'Preguntar a Zper AI'"; fail=1
fi
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
