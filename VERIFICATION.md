# Verificación de Bizarrón

Fecha: 17/10/2026. Proyecto real: `zwpjwxsqzlfayogazkry` (Bizarron).

## Arrastre inmediato — 18/10/2026

Publicado en https://bizarron.vercel.app, deployment `dpl_eaakvmFGALa3yTLtPWSCubdaghmt` (READY), fuente SHA-256 `edcb7832410135fca8a442d9eb2279b058306fd548915604ed2531897f5d832c`. La suite de latencia pasó también contra producción: movimiento previo a la autorización, drop pendiente, conflicto, cancelación, liberación y undo/redo. La comprobación de publicación confirmó landing, rutas SPA, sidebar y formato, persistencia y colaboración con otro navegador móvil, sin errores JavaScript ni respuestas HTTP fallidas.

La ficha se mueve localmente desde el primer desplazamiento del puntero; la adquisición del bloqueo ocurre en paralelo. Los previews compartidos y el guardado final requieren confirmación del servidor. Soltar antes de recibirla conserva la posición visual mientras espera; un rechazo restaura el estado compartido y cancelar libera el bloqueo sin guardar. Las posiciones locales se conservan frente a renders de snapshots. El indicador de movimiento de la lista ya no altera su altura, evitando saltos de la cancha en móvil.

Pasaron 31 pruebas unitarias, TypeScript y build. La prueba mouse/touch de jugadores fuera de las líneas pasó contra Supabase real. La nueva prueba `e2e/drag-latency.spec.ts` retiene la solicitud real de adquisición y comprueba movimiento visible antes de que SQL tenga un bloqueo, soltar temprano, una sola escritura final, undo/redo, conflicto entre clientes y cancelación con liberación. Pasó reutilizando una sesión existente. Los intentos posteriores de las suites generales y altas rápidas encontraron el límite de nuevas sesiones anónimas por IP; no se cambió ese límite. El flujo general con dos navegadores había pasado durante esta mejora antes de cambiar el indicador de texto por un punto accesible; se adaptaron sus selectores al indicador nuevo.

## Sidebar izquierda — 18/10/2026

Se agruparon en el panel izquierdo nombre del pizarrón, formaciones, formato 7/11, orientación, historial, jugadores y conectados. Las acciones se presentan con etiquetas cortas y tooltips; la cancha muestra solo la formación activa y su formato. En móvil el panel usa dos columnas y conserva el arrastre táctil con desplazamiento automático. No hubo cambios de esquema ni reglas de negocio.

Pasaron `npm test` (31 pruebas) y `npm run build`. También pasaron las pruebas de ampliación colaborativa, altas rápidas con mouse/táctil, flujo completo con dos navegadores y formatos 7/11. Se actualizaron las aserciones del mensaje de formato por su versión breve y las coordenadas de la prueba táctil después del desplazamiento de página. Se revisaron capturas desktop de 1280 px y móvil de 390 px.

Publicado en https://bizarron.vercel.app mediante el deployment `dpl_BXczYLupB3yvWtwfsN12C7ahjdjA` (READY). La comprobación de producción confirmó sidebar izquierda con sus controles, cambio 7/11, creación y persistencia de jugadores, invitación a otro navegador móvil, sincronización Realtime y ausencia de errores JavaScript o respuestas HTTP fallidas.

## Publicación en Vercel

Publicación de producción **READY** en https://bizarron.vercel.app, proyecto `bizarron` del equipo `ochoaproyects`. Deployment: `dpl_CwMqsKeeGGCmT3oMPk3hpMPrcowk`. Se subieron 27 archivos de la versión local, sin `.env.local`, pruebas ni migraciones, y se configuraron las dos variables públicas de Supabase en Production y Preview. SHA-256 de la fuente enviada: `6e00d0940cedfea7df62629ccd3b1e37479e46ba5eb9d2d4b4eaf7e1114fa4b5`. No hay conexión Git automática todavía.

Verificado con Chromium contra la URL pública, sin bypass de Vercel ni respuestas simuladas:

- Landing, recursos y modelo 3D disponibles públicamente; CTA habilitado.
- HTTP 200 y cabeceras `Referrer-Policy: no-referrer` y `X-Content-Type-Options: nosniff`.
- Ruta `/board/...` directa resuelta por la SPA y rechazo de enlaces incompletos.
- Ingreso anónimo, creación de tablero, conexión Realtime y alta de jugador.
- Recarga directa del tablero conserva sesión y jugador persistido.
- Invitación abierta en otro contexto móvil independiente; alta desde móvil visible en escritorio y sin desborde horizontal.
- Sin errores JavaScript de página ni respuestas HTTP fallidas en la prueba.

El tablero y los usuarios de esta comprobación permanecen en Supabase. Las capturas están en `test-results/production-landing.png` y `test-results/production-board.png`. Las sesiones de prueba y el enlace de invitación temporal no se publicaron.

## Maqueta 3D de la landing

El vaivén visible se mantiene indefinidamente, con un ciclo continuo de 5,2 segundos. Se pausa al arrastrar y vuelve gradualmente alrededor de la orientación elegida después de la inercia. No se ejecuta con movimiento reducido ni mientras la maqueta está fuera de pantalla. El build y las cuatro pruebas de navegador aprobaron; se comprueba que el movimiento continúe después de los primeros 3,2 segundos y se detenga durante la interacción.

Se modificó solo la ilustración del hero mediante `LandingPitch`, su CSS local y utilidades de cuaterniones; no se modificaron el tablero, Auth ni Supabase. No se agregaron dependencias. La figura tiene dos caras independientes y cuatro bordes de 12 px, con iluminación por orientación. Conserva la nota, cartel y textos decorativos solo en el frente.

- `npm test`: **31 pruebas aprobadas**, incluyendo tres nuevas de rotaciones: estabilidad tras 10.000 giros combinados, ortogonalidad, caras y vueltas completas en ambos ejes, y conservación de grados de libertad de canto.
- `e2e/landing-3d.spec.ts`: **3 aprobadas** en Chromium. Comprueba reverso sin textos, giro por teclado, vueltas completas mediante arrastres en ambos ejes, arrastre combinado, orientación conservada, reposo, pausa durante arrastre, inercia breve, reduced-motion y tacto móvil sin scroll accidental ni desborde.
- Smoke existente de landing desktop/móvil y enlace inválido: aprobó. Una repetición tuvo `net::ERR_NO_BUFFER_SPACE` al cargar `App.tsx`; el reintento aislado pasó sin cambiar código.
- Corrida final conjunta de landing y maqueta: **4 aprobadas en 9,3 s**. El build TypeScript/Vite y el chequeo de formato también aprobaron.
- Se revisaron capturas `landing-3d-front.png`, `landing-3d-back.png` y `landing-3d-mobile.png`. El reverso muestra una cancha sin nota, cartel ni texto invertido; los elementos frontales se transforman con la figura.

La animación evita renders React por fotograma, pausa fuera de pantalla y limpia RAF, observador y listeners. No se midió una garantía de 60 FPS en hardware físico ni se probaron Safari/iOS reales. Al no utilizar WebGL, no necesita contexto GPU ni texturas; incluye fallback estático por `@supports` para navegadores sin CSS 3D. No se ejecutó otra regresión colaborativa contra Supabase para este cambio aislado de la landing.

## Ajuste visual: jugadores fuera de las líneas

Se amplió luego el margen exterior de 42 px a un tamaño adaptable de 60–136 px por lado. El espacio de trabajo vertical admite hasta 800 px de ancho para conservar el tamaño de la cancha. En móvil, las fichas para agregar jugadores pasan debajo y liberan el ancho lateral. Tras este cambio pasaron las 28 pruebas y el build; no se repitió la integración con Supabase para este ajuste de espacio.

Se eliminó el componente y los estilos del cuadro Suplentes. Titulares y jugadores exteriores usan el mismo canvas y el mismo gesto, con color atenuado al salir. La migración `20261017222218_outside_players.sql` está aplicada y sus columnas se verificaron en el proyecto real. Conserva la última posición en cancha y guarda las coordenadas exteriores por separado; duplicar y undo/redo también las conservan.

Después de este ajuste pasaron **28 pruebas** y el build. La prueba SQL adicional comprueba movimiento exterior, conservación de posición previa, duplicación, undo/redo, restauración de eliminado y rechazo de coordenadas exteriores inválidas. La prueba de altas se adaptó a la geometría nueva para que no admita altas en el margen exterior.

Pasó `npm run test:e2e -- --grep 'jugadores fuera' --output test-results-outside` con Supabase real: arrastre al exterior con mouse, undo/redo, recarga, ingreso y salida táctiles, sincronización entre navegadores y ausencia de desborde móvil. Se revisaron `outside-desktop.png` y `outside-mobile.png`. Esta prueba reutiliza la sesión del navegador para las lecturas RPC y evita crear otro usuario de diagnóstico.

El reintento de regresión de colaboración, ampliación y altas rápidas se detuvo tras volver a alcanzar la cuota: la traza confirma HTTP **429 en `/auth/v1/signup`**. No se da por aprobada esa regresión ni se modificaron los límites de Auth. La comprobación específica exterior anterior sí terminó correctamente.

Los resultados que siguen corresponden a la ampliación anterior, con su panel de suplentes, y no deben interpretarse como una regresión completa de esta nueva presentación.

## Comprobaciones

- `npm test`: **27 aprobadas**, en modelo, historial y SQL.
- `npm run build`: correcto, TypeScript y Vite; Konva conserva su chunk separado.
- SQL ejecutado en PostgreSQL embebido PGlite con pgcrypto. El harness sustituye solo `auth.uid()` y el receptor Realtime; las comprobaciones de Auth/WebSockets se ejecutan por separado contra Supabase real.

Las pruebas SQL cubren autorización, RLS, versiones, bloqueos, altas idempotentes, secuencias y cupos 7/11; migración de datos previos; ámbito de formación; duplicación independiente; prohibición de borrar la última variante; banco, edición y restauración de suplentes; undo/redo de movimientos y datos; cadenas propias con revisiones monotónicas; rechazo de cambios posteriores de otro actor; invalidación de redo; cupos al revertir y límite de 50 comandos.

## Migraciones y datos anteriores

Las siete migraciones están aplicadas en Supabase. Las nuevas son `20261017220310_formations_bench_history.sql` y `20261017221238_formation_indexes.sql`. La primera migra formaciones, banco y comandos reversibles; la segunda agrega índices. Las RPC anteriores se conservan como adaptadores.

Antes y después de migrar hubo **59 jugadores**. El hash de todos sus campos originales, ordenados por ID, fue idéntico: `5042e5676aa0469b12fcd57e5adc7aa5`. Se crearon **9 formaciones Original**, una por tablero existente. Se conservaron nombres, números, equipos, coordenadas, versiones y fechas. La prueba SQL local también inserta datos antes de la sexta migración y comprueba su conservación.

Los enlaces anteriores siguen autorizando el mismo tablero. No se modificaron la landing ni el mecanismo de identificación. Las nuevas RPC exigen membresía y comprueban que la formación pertenece al tablero indicado. No hay claves privilegiadas en el frontend ni nuevas dependencias para estas funcionalidades.

## Pruebas de navegador

Resultados efectivamente obtenidos:

- Corrida específica de colaboración existente + ampliación + concurrencia: **3 aprobadas**.
- Corrida específica de arrastres cancha/banco mouse/touch: **1 aprobada**; volvió a aprobar en la corrida completa.
- Regresión completa posterior: landing y arrastres aprobaron. La prueba existente de colaboración falló al iniciar el gesto táctil; se agregó una espera por reconciliación remota antes de tocar. Su repetición quedó impedida por el límite de Auth.
- Resultado final completo: **2 aprobadas y 5 fallidas**. Concurrencia devolvió **`AuthApiError: Request rate limit reached`**; formatos, altas rápidas y el reintento de colaboración no pudieron ingresar. La prueba de ampliación terminó con un error al guardar trazas: lancé un reintento concurrente en el mismo directorio y sus artefactos se interfirieron. La próxima corrida debe ser única o usar otro directorio `--output`. No se alteró la protección de Auth. **La suite completa final no está aprobada**; debe repetirse con `npm run test:e2e` cuando se restablezca la cuota.
- Formatos y altas rápidas habían pasado antes de esta ampliación; eso no equivale a una regresión final aprobada.

Playwright usa Chromium, sesiones anónimas independientes y Supabase real, sin interceptar respuestas. Los casos de integración se omiten explícitamente si faltan variables públicas.

| Archivo                  | Cobertura                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/app.spec.ts`        | Landing desktop/móvil, enlaces inválidos, CRUD con dos navegadores, movimiento remoto antes del commit, mouse/touch, exclusión de leases, reconexión, orientación, nombre, recarga y RLS.                                                                                                   |
| `e2e/quick-add.spec.ts`  | Fichas mouse/touch/teclado, cancelar fuera de cancha, doble clic para nombrar y numeración concurrente por equipo.                                                                                                                                                                          |
| `e2e/formats.spec.ts`    | 7 vs 7 y 11 vs 11, selector sincronizado, cupos, carrera por último lugar, cambio prohibido con jugadores y secuencia desde 1.                                                                                                                                                              |
| `e2e/extensions.spec.ts` | Banco por botones, edición y restauración; historia individual; rechazo de cambio ajeno; crear/duplicar/renombrar/borrar variantes; selección independiente; URL directa y recarga. Carreras reales sobre jugadores distintos, mismo jugador, undo contra edición y duplicación simultánea. |
| `e2e/bench-drag.spec.ts` | Cancha → banco → cancha con mouse y touch, conservación de coordenadas, desplazamiento automático, sincronización y recarga.                                                                                                                                                                |

Los 30 escenarios solicitados se distribuyen entre esas pruebas y SQL: suplentes (1–5), historial y seguridad colaborativa (6–14), variantes y migración (15–25), concurrencia (26–30). La reversión de movimiento se comprobó contra SQL; los gestos se verificaron por separado contra Supabase real. La tabla describe cobertura implementada; las restricciones de la corrida final se detallan arriba.

Pasaron Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z y eventos Meta+Z/Meta+Shift+Z, y la comprobación de que el input de edición conserva su undo. Las aserciones adicionales para textarea/contenteditable no tienen una corrida completa aprobada; el selector de exclusión se revisó en código. Los atajos macOS se simulan en Chromium; no se usó un Mac físico. Cada arrastre genera un comando; las posiciones intermedias y renovaciones no agregan historial.

Se revisaron capturas desktop 1280 px y móvil 390 px con las nuevas pestañas y banco. Las capturas se generan en `test-results/`. Los usuarios y tableros de prueba permanecen en el proyecto.

## Advisors

El chequeo posterior a las siete migraciones no devolvió claves foráneas sin índice. Quedan siete avisos informativos de índices sin uso registrado en esta muestra corta. [Detalle](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Se mantienen seis avisos informativos de RLS sin políticas en tablas `private`: el acceso directo está bloqueado y las funciones autorizadas gestionan escrituras. [Detalle](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Los avisos de acceso anónimo en `boards`, `formations`, `players` y `realtime.messages` corresponden al ingreso sin registro: las políticas comprueban membresía. [Detalle](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins). Sigue deshabilitada la protección de contraseñas filtradas; el producto no utiliza contraseñas. [Detalle](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Límites

- Historial en memoria, 50 acciones propias por formación: recargar reinicia las pilas, pero conserva los cambios compartidos. Las revisiones de jugadores eliminados permanecen hasta borrar su formación.
- Máximo 12 formaciones y 40 jugadores por formación; los cupos 7/11 cuentan titulares. Para sustituir, se saca uno y se ingresa otro.
- No hay modo offline, restauración de variantes eliminadas, roles ni revocación de enlaces.
- Docker estaba instalado sin motor disponible; no se ejecutó el stack Supabase local completo.
- No se desplegó en Cloudflare Pages, no hubo carga de 15 dispositivos ni pruebas físicas iOS/Android. Touch usa emulación Chromium.
