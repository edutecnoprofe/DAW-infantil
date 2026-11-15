# Mi Estudio 🎵 — DAW infantil

Estudio de música para niños que funciona en el navegador. Sin instalar nada: se abre la página, se enchufan los teclados USB y a tocar.

## Qué hace

- **Pistas con bucle**: pulsa ⏺, espera la cuenta atrás (4, 3, 2, 1) y toca. Lo grabado se repite. Elige otra pista y graba encima.
- **Instrumentos**: batería, sintes y «Mi voz» van incluidos. Los marcados con ☁️ (piano, guitarra, violín…) se bajan de internet la primera vez y quedan guardados.
- **Pads** (8 cuadrados): bombo, caja, platos, palmas…
- **Mi voz 🎤**: graba un sonido con el micrófono y tócalo en el teclado; cada tecla lo sube o baja de tono.
- **8 roscas** que cambian el sonido de la pista elegida: Volumen, Filtro, Eco, Cueva (reverb), Monstruo (distorsión), Tono, Temblor (vibrato) y Cola (cuánto dura la nota).
- **Imán 🧲**: coloca las notas a tiempo aunque se toquen un poco tarde. **Deshacer ↩️** borra lo último grabado.
- La canción se guarda sola en el navegador. **💾 Guardar** la baja a un archivo (incluye lo grabado con el micro) y **📂 Abrir** la recupera, también en otro ordenador.
- Al alargar el bucle (de 2 a 4 u 8 compases) pregunta si repetir lo que ya hay en los compases nuevos.

## Requisitos

- **Chrome o Edge** (Firefox también vale; Safari no tiene MIDI).
- Los Akai LPK25 / MPK mini / LPD8 son *class compliant*: Windows, Mac y Linux los reconocen **sin drivers**.
- La primera vez el navegador pide permiso para MIDI y para el micrófono: hay que aceptar.
- En Windows, cierra otros programas de música que estén usando el teclado (solo uno puede usarlo a la vez).

## Si los pads o las roscas no responden

⚙️ Ajustes → **Enseñar roscas** / **Enseñar pads** y mover cada control en orden del 1 al 8. Los pads del LPD8 deben estar en modo **PAD**.

## Sin teclado MIDI

Teclas del ordenador: `A W S E D F T G Y H U J K` = notas · `1`–`8` = pads · `Espacio` = tocar/parar · `R` = grabar · `Retroceso` = deshacer.

## Publicar

Es una web estática (HTML + JS, sin compilar). En GitHub: *Settings → Pages → Deploy from branch → main / root*.

Para probar en local: `python -m http.server 8765` y abrir <http://localhost:8765>.

Sonidos ☁️: [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM).
