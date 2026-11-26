# TRASH TO PS5 💀🎮

Aventura narrativa **en primera persona**, en **HTML** (un solo archivo), sobre la misión más importante de tu vida:
**"BRO, FIND THE DAMN PS5."**

▶ **Jugar:** abre `release/trash-to-ps5.html` en Chrome/Edge/Firefox (funciona sin internet, todo va dentro del archivo).

## Icono

`trash-to-ps5/icon.svg` (original, vectorial) y PNG en `trash-to-ps5/icons/` (512, 192, 180, 64, 32 px).
Va incrustado en el HTML como favicon e icono de pantalla de inicio, y aparece en las pantallas de carga y título.

## Historia

Una noche te llega un mensaje de un número desconocido: *"Bro… there's a PS5 in the junkyard."*
Vas al desguace Junk Mountain Salvage, y encontrar la consola es solo el principio. Hay un trabajador viejo muy sospechoso,
una mecánica con un robot, un guardia que siempre duerme, un chatarrero, un zorro ladrón, un desconocido con capucha,
cámaras de seguridad, túneles, un edificio secreto… y una cámara acorazada.

**10 misiones:** The Message · Enter the Junkyard · Search · The Old Worker · The Locked Area · Security Camera ·
Follow the Trail · The Fake PS5 · The Secret Building · The Real PS5.

**Cinemáticas:** intro en la ciudad de noche (notificación → zoom a la cara → "FIND THE PS5"), llegada al desguace,
grabación de la cámara de seguridad (filtro CCTV), el descubrimiento de la caja blanca ("NO WAY BRO…" → la caja se mueve →
corte a negro), el edificio secreto y el final (la cámara gira alrededor de la PS5 → la coges → "YOU FOUND IT.").

**5 finales:** Perfect (con el Mando Dorado), Finders Keepers, The Real One, Why Bro 💀 y Bunker Squad (final verdadero).

## Sistemas

* **Móvil** (P / 📱): Messages (con respuestas), Contacts (llamadas = pistas), Map (zonas que se desbloquean, lugares
  ocultos, niebla de zonas sin visitar), Camera (fotos reales del juego → Gallery; algunas misiones piden fotografiar pistas),
  Gallery, Missions, Notes (pistas automáticas), Junk Scanner (radar con pitidos, 8 objetos raros + pistas), Backpack, Settings
  (volumen, sensibilidad, FOV, gráficos, guardar/cargar).
* **Mundo abierto:** ciudad pequeña (casas, tiendas, gasolinera) + desguace enorme con 4 zonas (Front Lot, Locked Yard,
  Container Maze, Garbage Mountains), montañas de basura, coches abandonados, contenedores, almacenes, caravanas rotas,
  túneles subterráneos, habitación oculta y complejo secreto.
* **NPCs con rutinas** según la hora (trabajan, pasean, duermen, dan de comer al zorro) y navegación A*.
* **Basura procedural:** montones generados con semilla; buscar = mantener E; botín aleatorio; los montones se rellenan cada día.
* Inventario, dinero, tiendas (Quik Stop, Pawn & Pay, Scrapper Sam), ciclo día/noche, linterna, guardado automático + 3 ranuras.

## Controles

Ratón para mirar (clic para capturar el ratón) · WASD moverse · Shift correr · Espacio saltar · **E** interactuar
(mantener para buscar) · P móvil · M mapa · I mochila · F linterna · C cámara · Esc pausa/atrás.
En móvil/tablet: joystick a la izquierda, arrastrar a la derecha para mirar, botones ✋ 🏃 ⤒ 📱.

## Desarrollo

```bash
npm install
npm run ps5:dev     # servidor de desarrollo
npm run ps5:build   # genera release/trash-to-ps5.html (un solo archivo con todo dentro)
```

Código en `trash-to-ps5/src/`: `main.js` (juego), `world.js` (mundo), `story.js` (misiones, diálogos, finales),
`cinematic.js`, `phone.js`, `ui.js`, `npc.js` (rutinas + A*), `rig.js` (animación procedural de los personajes),
`static.js` (agrupado de geometría), `audio.js` (sonido 100 % procedural), `save.js`.
`models.html` es un visor de los modelos para desarrollo.

## Créditos de los modelos 3D

Todos los modelos vienen de páginas públicas con licencia libre y están en `trash-to-ps5/src/models/`:

| Modelos | Autor | Licencia | Fuente |
| --- | --- | --- | --- |
| Personajes (skater, survivor, male, cyborg), coches, casas, edificios, basura (latas, cajas de pizza, plátano, bolsas, barriles…), árboles, banco | Kenney | CC0 | pmndrs market / Kenney Starter Kits (GitHub) |
| Sci-fi crate, low-poly tree, bench | Sara Vieira | CC0 | pmndrs market |
| Citroën van | Creative Trio | CC0 | pmndrs market |
| Perro "Dogue" | Reuben Sotomayor & Alejandro León | CC0 | pmndrs market |
| Mando y auriculares | Lightbringer3D y comunidad | CC0 | pmndrs market |
| Robot "BOLT-9000" (RobotExpressive) | Tomás Laulhé | CC0 | three.js examples |
| Zorro "Bandit" | PixelMannen (modelo, CC0) · @tomkranis (rig y animación, **CC-BY 4.0**) | CC0 + CC-BY 4.0 | Khronos glTF Sample Assets |

La consola del juego es un diseño ficticio hecho con código.
