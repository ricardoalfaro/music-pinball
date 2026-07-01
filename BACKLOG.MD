# Backlog - 90s Rock Pinball

Este backlog ordena las mejoras del juego por prioridad. La idea es mantenerlo vivo: cada bug, mejora de experiencia o idea nueva entra aqui, se prioriza y se mueve de estado a medida que avancemos.

## Vision del producto

El juego sera una experiencia **mobile-only**: se disena primero para telefono, en orientacion vertical, usando el alto total del viewport. En desktop se vera igual que en mobile, solo centrado o expandido a pantalla completa, sin layout lateral ni experiencia alternativa. Los menus, configuraciones y controles deben comportarse igual en ambas superficies.

Objetivo: una maquina de pinball rapida, tactil, visualmente potente, con buena sensacion de rebote y scoring entretenido. La integracion con Spotify queda para el final, cuando el juego ya este solido.

## Estados

- `Pendiente`: identificado, todavia no trabajado.
- `En progreso`: se esta implementando o validando.
- `Bloqueado`: necesita decision, informacion o dependencia externa.
- `Hecho`: implementado y verificado.

## P0 - Direccion mobile-only y controles base

| Estado | Item | Motivo | Criterio de aceptacion |
| --- | --- | --- | --- |
| Hecho | Convertir layout a mobile-only fullscreen | La experiencia principal sera en telefono y desktop debe replicar ese formato. | El juego ocupa el alto total del viewport, sin sidebar desktop, con una sola composicion vertical. |
| Hecho | Crear pantalla inicial de configuracion y start | El juego debe partir con configuracion basica antes de jugar. | Al abrir, aparece una pantalla inicial con opciones basicas y boton `Start`; el juego no depende de presionar `R`. |
| Hecho | Agregar menu superior por icono | La UI de juego debe ser limpia, con configuraciones escondidas en un menu. | Durante la partida solo hay un icono superior para abrir/cerrar el menu de configuracion. |
| Hecho | Implementar zonas tactiles para flippers | El telefono sera la superficie principal de juego. | Tocar la zona inferior izquierda activa el flipper izquierdo; tocar la derecha activa el flipper derecho; las zonas no tapan informacion critica. |
| Hecho | Mantener controles de teclado solo para desktop | En desktop se debe poder jugar sin controles tactiles visibles extras. | `A`/flecha izquierda y `L`/flecha derecha activan flippers; `Space` controla plunger; la UI sigue siendo la mobile. |
| Hecho | Evitar scroll/zoom accidental durante el juego | En mobile y desktop, tocar o presionar teclas no debe mover la pagina. | La partida no genera scroll, zoom accidental ni seleccion de texto al jugar. |
| Hecho | Inicializar estado de flippers | El primer sonido/estado visual depende de `flipper.state`, pero no existe al cargar. | El primer press/tap de flipper dispara sonido una sola vez por pulsacion. |
| Hecho | Limpiar timers al reiniciar | Los `setTimeout` de targets/lanes pueden afectar una partida nueva. | Reiniciar cancela efectos pendientes de la partida anterior. |

## P1 - Jugabilidad y experiencia principal

| Estado | Item | Motivo | Criterio de aceptacion |
| --- | --- | --- | --- |
| Hecho | Escalar tablero al alto total del viewport | El tablero debe sentirse como app nativa en telefono. | El playfield usa todo el alto disponible sin cortar elementos importantes ni deformar la fisica. |
| Pendiente | Validar experiencia en dispositivo real | La experiencia principal es en telefono y hay detalles que solo aparecen jugando con pulgares. | En telefono real se revisa proporcion, encuadre, menu, start, zonas tactiles, plunger, scroll accidental y legibilidad. |
| Hecho | Soportar pantallas Retina | El canvas puede verse borroso por no usar `devicePixelRatio`. | El tablero se renderiza nitido en pantallas de alta densidad. |
| Hecho | Definir controles tactiles de plunger | El lanzamiento debe ser natural en telefono. | Hay gesto claro para cargar/soltar el plunger, usable con pulgar y con feedback visual. |
| Hecho | Agregar feedback visual de zonas tactiles | El jugador debe sentir que sus taps entraron, aunque las zonas sean invisibles durante juego normal. | Tocar flippers/plunger muestra feedback breve y sutil sin tapar la bola ni distraer. |
| Hecho | Ajustar zonas tactiles para plunger con drag | Los flippers no deben comerse el espacio del lanzador de pelota. | Las zonas de flipper quedan mas hacia el centro inferior y el borde derecho queda disponible para cargar el plunger con drag. |
| Hecho | Hacer funcional la dificultad inicial | El selector inicial existe, pero todavia no cambia reglas. | Elegir dificultad modifica parametros concretos de partida y queda reflejado en el menu. |
| Hecho | Bloquear zoom accidental del viewport | Si el telefono queda con zoom, el usuario pierde la vista completa del tablero. | Pinch/doble tap no hacen zoom durante la partida y el meta viewport impide escala manual. |
| Hecho | Convertir score en tablero desplegable | El score fijo tapa demasiado espacio visual en una pantalla chica. | En reposo el score ocupa una linea compacta; al sumar puntos se expande, muestra detalle y se contrae con animacion. |
| Pendiente | Revisar balance de rebotes y fisica | La sensacion de pinball depende de buenos rebotes. | Flippers, drenajes, rampa, slingshots y bumpers se sienten consistentes tras pruebas manuales. |
| Pendiente | Mejorar scoring y objetivos | El usuario quiere puntajes entretenidos y progresion clara. | Hay reglas visibles de puntos, combos/multiplicadores y feedback al lograr objetivos. |
| Pendiente | Simular componentes 3D en el playfield | La grafica debe sentirse mas premium y fisica. | Bumpers, flippers, lanes, targets y bola tienen volumen, sombras, brillos y profundidad legible. |
| Pendiente | Subir calidad visual general | La grafica debe ser una parte central de la experiencia. | El juego tiene direccion visual coherente, assets pulidos y alta legibilidad en pantalla pequena. |

## P2 - Calidad tecnica

| Estado | Item | Motivo | Criterio de aceptacion |
| --- | --- | --- | --- |
| Hecho | Reestructurar UI para app-shell mobile | La UI actual esta dividida en canvas + sidebar desktop. | Header, menu, overlays, HUD y canvas viven en una arquitectura mobile clara. |
| Pendiente | Agregar tests unitarios para `src/physics.js` | Las colisiones son la parte mas riesgosa del juego. | Tests cubren colision circulo, segmento, separacion, impulso y friccion basica. |
| Pendiente | Separar update y render | `render()` actualmente modifica estado visual como `flashTime`. | Las animaciones se actualizan en `update`, y `render` solo dibuja. |
| Pendiente | Modularizar `src/game.js` | El archivo concentra input, reglas, fisica, UI y dibujo. | Separar en modulos claros sin cambiar comportamiento visible. |
| Pendiente | Agregar lint/format | Evita regresiones pequenas y estilo inconsistente. | Scripts `lint` y/o `format` documentados en `package.json`. |
| Pendiente | Evitar `innerHTML` donde no sea necesario | La UI usa HTML string para estados simples. | Estados dinamicos se construyen con DOM seguro o helpers claros. |

## P3 - Contenido y profundidad del juego

| Estado | Item | Motivo | Criterio de aceptacion |
| --- | --- | --- | --- |
| Pendiente | Modo multibola | Es una mejora natural para una experiencia pinball mas rica. | Encender modos clave activa multibola con reglas y feedback visual. |
| Pendiente | Modos de banda mas diferenciados | Actualmente los modos suben multiplicador, pero pueden sentirse similares. | Cada modo altera scoring, audio o comportamiento de mesa de forma reconocible. |
| Pendiente | Ilustraciones/calcomanias del playfield | El tema 90s rock puede comunicarse mejor visualmente. | Nuevos assets integrados sin ensuciar legibilidad de bola, lanes y targets. |
| Pendiente | Audio tematico mas elaborado | El sintetizador procedural es una buena base, pero puede tener mas capas. | Modos y eventos importantes tienen motivos sonoros distinguibles. |
| Pendiente | Tabla de puntajes local | El high score unico es limitado. | Se guarda un top local con fecha/nombre opcional. |

## P4 - Integraciones finales

| Estado | Item | Motivo | Criterio de aceptacion |
| --- | --- | --- | --- |
| Pendiente | Investigar integracion con Spotify | Queda para cuando el juego ya este solido y la experiencia base este resuelta. | Hay una propuesta tecnica documentada con alcance, limitaciones, permisos y requisitos de Spotify. |
| Pendiente | Login/conexion con Spotify | Permite usar musica real del usuario durante la partida. | El usuario puede conectar/desconectar Spotify desde el menu de configuracion. |
| Pendiente | Cargar playlist de Spotify | El juego debe poder usar una playlist elegida como musica de fondo. | El menu permite seleccionar una playlist y reproducirla o controlarla durante la partida, segun lo permita la API. |
| Pendiente | Controles de musica en menu | La musica no debe invadir la pantalla principal. | Play/pause, volumen y fuente de musica viven dentro del menu superior. |

## Ideas por evaluar

- Modo practica sin game over.
- Indicadores visuales de objetivo siguiente.
- Pausa y mute global.
- Tutorial breve interactivo.
- Efectos de camara o shake mas sutiles.
- Sistema de achievements.
- Usar ChatGPT u otros recursos para generar/revisar arte, assets, ideas de modos y balance.
- Guardar preferencias de configuracion localmente.
- Soporte PWA para abrirlo como app desde el telefono.

## Convencion para agregar items

Cuando aparezca algo nuevo, agregarlo con este formato:

```md
| Pendiente | Nombre corto | Por que importa | Como sabremos que esta listo |
```

Si algo es urgente o define la experiencia principal, va en `P0`. Si mejora directamente como se juega, va en `P1`. Si reduce riesgo tecnico, va en `P2`. Si agrega contenido o profundidad, va en `P3`. Si depende de servicios externos o conviene dejarlo para el final, va en `P4`.
