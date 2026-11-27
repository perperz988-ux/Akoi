# ZperCraft · Edición Maldita

Versión maldita de ZperCraft al estilo "caos edition". Abre **`zpercraft-maldita.html`** en el navegador (PC o móvil). Es un solo archivo y funciona sin conexión.

## Qué cambia
- **Cielo y niebla de sangre**, sol rojo, relámpagos que parpadean, viñeta oscura y menú/pantallas rebautizados ("EDICIÓN MALDITA", "TE ATRAPÓ").
- **Caos cada 24–42 s**: un evento al azar con un cartel glitch y una barra de tiempo (abajo a la izquierda se ve la cuenta atrás; **tócala o pulsa K** para desatar el caos al instante).
- **Zper Maldito**: una figura negra y alta con ojos rojos. Aparece detrás de ti y solo se mueve cuando no lo miras. Si lo miras a los ojos, desaparece; si te alcanza, te da un susto y te quita vida. **Ctrl+K** lo invoca.
- **Susurros** en pantalla, zumbido grave de fondo, latidos cuando lo tienes cerca, gritos y estática (todo generado con WebAudio).

## Eventos (22)
Gravedad rota · Controles poseídos · Mundo al revés · Terremoto · Niebla de sangre · Error de realidad (glitch) ·
Visión demente (FOV) · Noche eterna · Lluvia de sangre · El suelo es lava · Meteoros · ¡Corre! (barriles explosivos) ·
La horda · Enjambre · Todo se vuelve carne · Tótem · Teletransporte · Inventario poseído · Regalo del abismo ·
Pacto de sangre · Monstruos gigantes · Zper te está cazando.

## Archivos
- `zpercraft-original.html` — el build original (sin tocar).
- `maldito.js` — el motor de caos (se engancha a `window.akoi`).
- `build_maldita.py` — genera `zpercraft-maldita.html`: expone algunas tablas internas, cambia los textos y el tema, e inyecta `maldito.js`.
  Para regenerarlo: `cd zpercraft && python3 build_maldita.py`.
