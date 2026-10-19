# Bizarrón

Pizarra táctica colaborativa de fútbol. React + TypeScript + Vite, Tailwind 4, React Konva y Supabase (PostgreSQL, Anonymous Auth, Broadcast y Presence). Frontend estático listo para Cloudflare Pages. Sin servidor propio ni servicios de IA.

## Arranque

Necesitás Node **22.12 o superior** y npm. Las versiones exactas están fijadas en `package.json` y `package-lock.json`.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completá `.env.local` con los datos públicos del proyecto:

```dotenv
VITE_SUPABASE_URL=https://zwpjwxsqzlfayogazkry.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

La clave se obtiene en Supabase → **Settings → API Keys → Publishable key**. Una clave `anon` heredada también funciona. Nunca uses `service_role`, `sb_secret_…`, la contraseña de PostgreSQL ni un token personal en variables `VITE_`. Estas variables se incluyen en el JavaScript público.

```powershell
npm run dev
```

Abrí `http://127.0.0.1:5173`. Sin variables se muestra la landing con una indicación de configuración; no se simulan tableros ni conexiones. Reiniciá Vite cuando cambies las variables.

## Configurar Supabase

Usá un proyecto exclusivo para esta aplicación. El proyecto previsto es **Bizarron**, referencia `zwpjwxsqzlfayogazkry`.

1. En **Authentication → Sign In / Providers**, activá **Anonymous Sign-Ins**. Dejá habilitada la creación de usuarios. No se necesita configurar email ni OAuth.
2. Aplicá los siete archivos de `supabase/migrations/` en orden de nombre, desde `20261017211858_bizarron_core.sql` hasta `20261017221238_formation_indexes.sql`. Para una instalación nueva, podés ejecutarlos desde **SQL Editor → New query**. Para actualizar una instalación existente, aplicá solo los pendientes, preferentemente con Supabase CLI (`supabase link` y `supabase db push`). La sexta migración agrega formaciones, banco e historial y conserva los datos anteriores dentro de una formación **Original** por tablero; la séptima agrega índices. No repitas migraciones ya aplicadas. **Las siete ya están aplicadas en Bizarron; no hace falta configuración adicional de Auth ni Realtime.**
3. En **Realtime → Settings**, desactivá **Allow public access** y guardá. Los clientes usan `config.private = true`. No es necesario publicar las tablas para Postgres Changes: las notificaciones persistentes se emiten con `realtime.send()` dentro de la transacción.
4. En **Data API**, habilitá el esquema `public`. No agregues `private` a los esquemas expuestos. La migración concede los permisos SQL mínimos explícitamente.
5. En **Authentication → URL Configuration**, configurá la URL del sitio al dominio final de Cloudflare Pages. Para desarrollo, `http://127.0.0.1:5173`.
6. Copiá URL y clave pública a `.env.local`. Creá un tablero, copiá el enlace completo y abrilo en un navegador independiente o incógnito.
7. Revisá **Database → Advisors** después de instalar. No reemplaces las políticas por `USING (true)` ni abras tablas para solucionar un error de permisos.

La autorización del plugin de Supabase en Codex es independiente de las variables del frontend. Si el conector no ve el proyecto, reautorizá la cuenta y la organización correcta. No hace falta compartir claves privilegiadas por el chat.

Para desarrollo con Docker activo también se incluye `supabase/config.toml`, con Anonymous Auth habilitado. Consultá `npx supabase start --help` y `npx supabase db reset --help` antes de levantar o reinicializar el entorno local. Un reset elimina los datos locales.

## Uso

1. Elegí **Crear tablero** y escribí tu apodo. Se guarda en localStorage; Supabase conserva la sesión anónima.
2. La cancha empieza vacía en fútbol 11. La sidebar izquierda reúne el nombre del pizarrón, las formaciones, el formato **Fútbol 7 / Fútbol 11**, la orientación, el historial y los jugadores. El formato solo cambia con el pizarrón vacío y sin operaciones pendientes. Arrastrá una ficha naranja o azul a la cancha, tocala o activala con el teclado para agregar un **Jugador N**, con numeración independiente desde 1 por equipo. El cupo es de 7 u 11 titulares por equipo. En móvil el panel se organiza arriba de la cancha; al arrastrar hacia el borde de la pantalla se desplaza la página automáticamente.
3. **Copiar enlace** copia `/board/UUID?access=TOKEN`. Cualquier persona con el enlace completo obtiene acceso de edición. El UUID solo no sirve para ingresar.
4. Arrastrá un jugador para moverlo. La ficha sigue el gesto inmediatamente con mouse o pantalla táctil; el bloqueo se adquiere en paralelo. La posición se guarda al soltar, después de confirmar el permiso del servidor. Si otra persona lo tomó primero, vuelve a su posición compartida.
5. Hacé doble clic (o doble toque) sobre un jugador para ponerle nombre. También podés editar desde su fila. Podés ajustar nombre (1–40 caracteres), camiseta (0–99) y equipo. Eliminar requiere confirmación. Cada equipo comienza en 1 y vuelve a empezar en 1 cuando queda vacío. Borrar mientras queden compañeros no renumera a los demás; editar una camiseta manualmente no cambia el contador. Las altas automáticas llegan hasta el número 99. Los cambios de equipo también respetan el cupo de 7 u 11.
6. Cambiá la orientación o el nombre del tablero desde la barra. Los cambios se comparten.
7. Si falla una operación, el mensaje indica el error. Los formularios conservan los datos para reintentar; un movimiento fallido se reconcilia y se puede volver a arrastrar.

## Arquitectura

### Maqueta interactiva de la landing

`LandingPitch` reemplaza únicamente la ilustración del hero. Modela seis caras con CSS 3D: dos superficies de césped independientes y cuatro bordes de 12 px. La nota y el cartel pertenecen al frente; el reverso contiene solo césped y líneas. Las rotaciones se acumulan con cuaterniones en `lib/rotation.ts`, con arrastre mouse/táctil, inercia breve y oscilación de reposo de aproximadamente 1–2°. También admite las flechas del teclado al enfocarse.

La animación actualiza refs y estilos directamente, se detiene fuera de pantalla o al ocultar la pestaña y libera listeners al desmontar. `prefers-reduced-motion` desactiva reposo e inercia, conservando el arrastre. No utiliza WebGL ni incorpora dependencias; si falta CSS 3D, muestra una vista estática. Se conservan textos, CTA, dimensiones y reglas responsive del hero. Referencia de composición: [CSS transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style).

### Suplentes, historial y variantes

Los jugadores fuera de las líneas permanecen como fichas sobre el mismo espacio de trabajo, con su color algo más gris. No hay panel de suplentes ni una ficha fantasma durante el movimiento: arrastrás el mismo jugador para sacarlo o ingresarlo. Su posición exterior queda guardada por separado de su última posición dentro de la cancha. También se pueden editar y eliminar desde la lista lateral; el botón **Ingresar a la cancha** recupera la última posición libre o busca otra razonable. El gesto funciona con mouse y pantalla táctil.

La migración adicional `20261017222218_outside_players.sql` agrega las coordenadas exteriores y actualiza movimiento, duplicación y reversión para conservarlas. Ya está aplicada en Bizarron; para otras instalaciones, aplicala después de las siete anteriores. Los jugadores anteriores conservan sus datos; quienes ya estaban fuera aparecen junto a una línea lateral hasta que se los mueva.

Cada formación tiene su propio formato 7/11, orientación, jugadores y contadores por equipo. El cupo de 7 u 11 cuenta solo titulares; hay un máximo de **40 jugadores en total por formación**, incluidos suplentes. Cambiar de formato requiere que tanto cancha como banco estén vacíos y no haya una operación pendiente.

Las pestañas permiten crear, duplicar, renombrar y eliminar variantes (hasta **12 por tablero**). No se puede eliminar la última. Duplicar copia titulares, suplentes y sus datos en una transacción, con identificadores nuevos e independientes. Cada navegador elige su pestaña; si alguien elimina la que estás viendo, se selecciona otra válida. El enlace principal sigue funcionando; `&formation=UUID` abre una variante concreta y la navegación conserva `access`.

**Deshacer/Rehacer** conserva las últimas 50 acciones propias por formación durante la sesión. Incluye altas, eliminaciones, cambios de datos, movimientos y cambios entre cancha y banco. Un arrastre es un solo paso. Atajos: **Ctrl+Z**, **Ctrl+Y**, **Ctrl+Shift+Z**, **Cmd+Z** y **Cmd+Shift+Z**. En inputs, textareas, contenteditable y formularios se conserva la edición nativa. Las pilas se reinician al recargar; los cambios deshechos o rehechos sí quedan guardados y se sincronizan. Una acción nueva invalida la rama de rehacer.

El servidor comprueba de forma atómica la autoría y la cadena de operaciones del jugador. Si otra persona lo modificó después, se rechaza la reversión y se muestra el conflicto. No se restaura una copia completa del tablero. Los cupos y bloqueos siguen aplicando al deshacer y rehacer.

```text
src/
  App.tsx                       Rutas
  pages/                        Landing, validación de enlace y tablero
  components/                   Cancha con espacio exterior, FormationTabs y formularios
  features/useBoard.ts          Estado, canal, Presence, reconexión y arrastres
  lib/api.ts                    Cliente público, sesión y llamadas RPC
  lib/model.ts                  Tipos, coordenadas y control de versiones
  lib/history.ts                Pilas individuales y atajos
  styles.css                    Tailwind y estilos responsive
supabase/migrations/             Esquema y API PostgreSQL
tests/database.test.ts           Pruebas SQL sobre PostgreSQL embebido
e2e/app.spec.ts                  Smoke visual y flujo con Supabase real
```

Los componentes visuales de la cancha no consultan Supabase. `useBoard` coordina persistencia y colaboración; `api.ts` gestiona la sesión y RPC. Konva se carga por separado para que la landing no descargue el canvas hasta entrar al tablero.

### Persistencia y eventos

- PostgreSQL es la fuente de verdad. Las mutaciones afectan al jugador correspondiente y actualizan una revisión monotónica del tablero; nunca reemplazan toda la formación.
- Las funciones transaccionales emiten `player_added`, `player_updated`, `player_deleted`, `player_drag_started`, `player_drag_ended`, `formation_updated` y `board_updated`. Como se emiten desde SQL, otros clientes reciben la confirmación aunque el navegador que hizo el cambio se cierre después del commit.
- Esos eventos invalidan un snapshot de la formación activa (hasta 40 jugadores), acompañado por metadatos de las variantes. No se cargan los jugadores de todas las formaciones. Las lecturas se agrupan; las revisiones y la formación solicitada impiden aplicar respuestas viejas. Se mantiene un canal por tablero y pestaña del navegador.
- Durante el arrastre, `player_moving` transmite coordenadas normalizadas cada **120 ms**, con identificador de bloqueo y secuencia. Los mensajes antiguos, fuera de rango o sin bloqueo conocido se descartan. No se persisten esos movimientos intermedios.
- El bloqueo se adquiere en SQL, vence en **12 segundos** y se renueva cada **4 segundos**, solo durante un arrastre. Tiene usuario y UUID exclusivo por gesto para distinguir pestañas con la misma sesión. Se intenta liberar al desconectar; sin red expira solo. Un bloqueo vencido no puede guardar la posición final.
- El alta conserva su UUID al reintentar. Editar y eliminar comprueban la versión del jugador; una modificación obsoleta devuelve un error. Los cambios del tablero también comprueban su revisión.
- `quick_add_v2` asigna nombre y número en el servidor, con un contador privado por formación y equipo. La asignación comparte el bloqueo transaccional del tablero: altas concurrentes reciben números consecutivos distintos. Una solicitud fallida no consume la secuencia y reintentar el mismo UUID no crea otro jugador. Titulares y suplentes comparten esa numeración.
- `formation_snapshot`, `manage_formation`, `change_player_v2`, `change_settings_v2` y `reverse_operation` validan pertenencia y ámbito explícito. `private.player_operations` guarda comandos reversibles (máximo 50 por actor/formación), y `private.player_state` conserva revisión monotónica y cabeza de la cadena, incluso tras eliminar un jugador. Las RPC anteriores siguen disponibles como adaptadores a la formación original.
- Al suscribirse, reconectar o recuperar el foco se vuelve a leer PostgreSQL. No hay polling del tablero ni cola offline. Se bloquean nuevas escrituras al perder la sincronización y se limpian canales/listeners al salir.

### Acceso

El token contiene **32 bytes aleatorios** generados en PostgreSQL. Solo se almacena SHA-256 en `private.board_access`. `join_board` valida el token del lado del servidor y asocia `auth.uid()` al tablero. El apodo no participa en la autorización.

RLS limita SELECT a miembros. Las tablas no conceden escrituras directas a clientes; las RPC controlan límites, versiones, pertenencia y bloqueos. Las implementaciones con `SECURITY DEFINER` están en `private`, con `search_path` vacío y ejecución revocada de `PUBLIC`/`anon`. Los wrappers expuestos son `SECURITY INVOKER`. Broadcast y Presence usan el mismo canal privado `board:UUID`, autorizado por pertenencia.

La membresía persiste para la sesión autorizada. No hay revocación de enlaces ni roles en este MVP. Guardá el enlace: borrar el almacenamiento del navegador elimina la sesión y requiere volver a validarlo. `Referrer-Policy: no-referrer` evita enviar el enlace como referer. No hay analítica ni recursos externos en la interfaz.

## Pruebas

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` ejecuta validaciones y la migración completa en **PGlite**, un PostgreSQL embebido con `pgcrypto`. El harness define `auth.uid()` y un receptor de eventos SQL para sustituir los servicios externos; prueba SQL y RLS reales, pero **no verifica Supabase Auth ni WebSockets**.

La suite Playwright siempre prueba landing desktop/móvil, ausencia de desborde horizontal y enlaces incompletos. La segunda prueba usa el Supabase real de `.env.local`: crea sesiones, abre dos contextos (uno móvil), copia el enlace, agrega, edita, arrastra con mouse y con un gesto táctil y elimina jugadores, intenta adquirir un bloqueo simultáneamente, agrega desde ambos contextos, reconecta, cambia el nombre, rota, recarga y verifica acceso denegado. Comprueba que el canvas remoto cambia antes de persistir el movimiento. **Se omite explícitamente si faltan las variables.** No intercepta ni simula respuestas de Supabase.

Las pruebas reales crean usuarios anónimos y un tablero de prueba en el proyecto seleccionado; sus datos quedan ahí para inspección. Usá un proyecto de desarrollo. El detalle de lo efectivamente ejecutado está en [VERIFICATION.md](VERIFICATION.md).

## Cloudflare Pages

Bizarrón también está publicado en **https://bizarron.vercel.app**, dentro del equipo Vercel `ochoaproyects`, proyecto `bizarron`. El despliegue inicial se realizó desde los archivos locales mediante el conector de Vercel; todavía no está conectado a GitHub para actualizaciones automáticas.

Para Vercel se incluye `vercel.json` con configuración Vite, salida `dist`, rutas SPA y cabeceras de privacidad. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` están configuradas en Production y Preview. `.vercelignore` excluye archivos de entorno, pruebas y datos locales de las cargas por CLI. Para futuras actualizaciones podés conectar el repositorio desde Vercel → Settings → Git o desplegar desde la carpeta con Vercel CLI autenticado.

1. Subí este repositorio a GitHub y creá un proyecto en **Cloudflare → Workers & Pages → Create application → Pages → Connect to Git**.
2. Seleccioná el repositorio y la rama que quieras desplegar.
3. Configurá framework **React / Vite**, comando de build **`npm run build`**, directorio de salida **`dist`**, raíz **`/`**.
4. Configurá **`NODE_VERSION=22`**, **`VITE_SUPABASE_URL`** y **`VITE_SUPABASE_PUBLISHABLE_KEY`** para producción y, si lo necesitás, previews. No cargues secretos privilegiados.
5. Desplegá y copiá el dominio `https://<nombre>.pages.dev` a Authentication → URL Configuration en Supabase.
6. Verificá abrir directamente una ruta `/board/UUID?access=TOKEN` desde otro navegador. `public/_redirects` asegura el fallback a `index.html`; `public/_headers` agrega las cabeceras de privacidad.

También podés subir manualmente `dist` desde la opción de upload de Pages después de construir con las variables correctas. Las variables Vite se fijan al compilar: cambiarlas requiere un nuevo build.

El frontend es estático; no necesita Functions, Workers personalizados ni secretos en Cloudflare.

## Límites del MVP y costo

- Diseñado para grupos de **2 a 15 participantes**, con un canal por pestaña y tablero. La interfaz limita la admisión a 15 mediante Presence; es un límite cooperativo, no una cuota de seguridad contra clientes modificados. Presence cuenta pestañas, que pueden compartir identidad anónima.
- 7 u 11 titulares por equipo, 40 jugadores por formación, 12 formaciones por tablero y 25 tableros creados por identidad anónima, impuestos en SQL. Los límites por identidad no reemplazan los límites de Auth por IP ni una protección antiabuso pública. Cambiar el formato requiere cancha y banco vacíos. Los tableros anteriores conservan sus datos y formato dentro de Original.
- Al irse alguien sin red, su bloqueo puede tardar hasta 12 segundos en liberarse y Presence tiene sus propios tiempos de detección.
- El arrastre se dibuja localmente sin esperar la red; compartir y guardar requiere un bloqueo confirmado. No se garantiza trabajo offline ni fusión automática de ediciones simultáneas del mismo registro: se muestra el conflicto para reintentar.
- El límite de participantes y los apodos no son controles de identidad. Quien tenga el enlace puede editar y compartirlo. No hay recuperación de apodos/sesiones, restauración del historial tras recargar, exportación, chat ni borrado de tableros desde la interfaz. Las marcas de revisión de jugadores eliminados se conservan hasta borrar su formación, para impedir reversiones inseguras.
- Hay suites para escenarios concurrentes, pero no una prueba de carga de 15 dispositivos ni validación manual en iOS/Android físicos.
- Los planes gratuitos permiten operar sin costo mientras se respeten sus cuotas. Supabase Free incluye 500 MB de base y puede pausar proyectos tras una semana sin actividad. Cloudflare Pages Free también limita builds y otros recursos. Monitoreá mensajes/conexiones Realtime y egreso; sesiones largas de muchos usuarios consumen la cuota aunque cada gesto solo tenga una escritura final. No se promete capacidad ilimitada ni disponibilidad permanente.

APIs y configuración contrastadas con documentación oficial el 17/10/2026: [Supabase Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Konva drag and drop](https://konvajs.org/docs/react/Drag_And_Drop.html), [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite), [React en Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/), [Supabase Free](https://supabase.com/pricing), [límites Pages](https://developers.cloudflare.com/pages/platform/limits/).

La prueba adicional `e2e/quick-add.spec.ts` verifica altas arrastrando fichas con mouse y pantalla táctil, doble clic para nombrar, altas mediante teclado y asignación concurrente de números por equipo. También comprueba que soltar una ficha fuera de la cancha no crea jugadores. `e2e/formats.spec.ts` prueba fútbol 7/11, sincronización del selector, numeración desde 1, cupos completos, la carrera por el último lugar y el bloqueo del cambio con una formación pendiente.
