# Validacion en telefono

Probar con el telefono y el Mac conectados a la misma red Wi-Fi. Iniciar el juego con:

```bash
npm run dev -- --host 0.0.0.0
```

## Flujo y encuadre

- [ ] La pantalla inicial cabe completa y `Start` es facil de tocar.
- [ ] El tablero ocupa todo el alto sin scroll ni contenido cortado.
- [ ] El menu abre, cierra y permite reiniciar sin taps accidentales.
- [ ] Score, objetivo, bolas y combo se leen sin tapar la accion.

## Controles

- [ ] Cada pulgar activa solo su flipper y ambos funcionan a la vez.
- [ ] El borde derecho carga el plunger mientras se mantiene presionado.
- [ ] El indicador de potencia responde de 0% a 100% y desaparece al lanzar.
- [ ] No hay zoom, seleccion de texto ni desplazamiento accidental.

## Juego y legibilidad

- [ ] La bola se distingue sobre el fondo durante todo el recorrido.
- [ ] Bumpers, slingshots, targets, lanes y rampa se reconocen rapidamente.
- [ ] Los rebotes no generan velocidades absurdas ni bolas atrapadas.
- [ ] Objetivos, combos y multiplicadores se entienden durante una partida.
- [ ] Sonido y vibracion visual responden sin retraso perceptible.

Registrar modelo de telefono, navegador y cualquier punto que falle antes de marcar las tareas como `Hecho`.
