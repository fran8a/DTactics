# Reporte Integral de Auditoría Técnica, Seguridad, Rendimiento, UX/UI y Estrategias de Negocio: DTactics

**Proyecto:** DTactics (`bizarron.vercel.app` / Supabase `zwpjwxsqzlfayogazkry`)  
**Fecha de Auditoría:** Octubre 2026  
**Tipo de Análisis:** Auditoría de Código Estático (SAST), Análisis Dinámico de Pruebas (DAST/E2E), Revisión de Arquitectura Cloud (Supabase + Vercel), Evaluación Criptográfica/Autorización y Plan de Monetización.  
**Estado del Código:** Intacto (Sin alteraciones aplicadas, según directiva explícita).

---

## Índice
1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Auditoría de Seguridad de Software y Vulnerabilidades](#2-auditoría-de-seguridad-de-software-y-vulnerabilidades)
3. [Navegabilidad, Accesibilidad y Flujo de Usuario](#3-navegabilidad-accesibilidad-y-flujo-de-usuario)
4. [Rendimiento, Métricas y Optimización de Código](#4-rendimiento-métricas-y-optimización-de-código)
5. [Evaluación de UX/UI con Evidencia y Pruebas Reales](#5-evaluación-de-uxui-con-evidencia-y-pruebas-reales)
6. [Estrategias de Monetización para DTactics](#6-estrategias-de-monetización-para-dtactics)
7. [Matriz de Decisión: Qué Implementar y Qué Descartar](#7-matriz-de-decisión-qué-implementar-y-qué-descartar)

---

## 1. Resumen Ejecutivo

DTactics es una aplicación web reactiva y táctica colaborativa en tiempo real para fútbol (Fútbol 7 y 11), construida con:
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, React-Konva (Canvas 2D), Lucide Icons, desplegado en **Vercel** como SPA.
- **Backend / Datos:** Supabase (PostgreSQL 15+ con `pgcrypto`, Anonymous Authentication, RLS en esquemas `public` y `private`, RPC transaccionales y Supabase Realtime Broadcast & Presence).

### Hallazgos Principales:
- **Aspectos Destacables:** Excelente aislamiento arquitectónico en PostgreSQL (uso de esquema `private` para tablas sensibles y lógica transaccional, con envoltorios invoker controlados en `public`), control de concurrencia optimista/pesimista híbrido (leases de 12s para drag & drop y serialización por fila de `boards`), y soporte de historial atómico (undo/redo transaccional por jugador).
- **Vulnerabilidades Críticas:** Exposición de tokens de acceso permanente en la URL (`query param`), dependencia exclusiva de Anonymous Auth vulnerable a DoS por cuota (HTTP 429), ausencia de control de creador/roles (cualquiera con el link puede destruir la formación), y falta de cabeceras CSP en Vercel.
- **Desafíos UX/UI y Tests:** Detección de desfase en aserciones de pruebas E2E existentes frente a nuevas funcionalidades de suplentes fuera de cancha, y límites de tasa en llamadas de autenticación que bloquean suites de integración completas.

---

## 2. Auditoría de Seguridad de Software y Vulnerabilidades

### 2.1. Gestión de Identidad y Exposición de Tokens de Acceso
- **Severidad:** **ALTA**
- **Descripción:** La función `create_board` genera un token aleatorio de 32 bytes (`extensions.gen_random_bytes(32)`) cuyo hash SHA-256 se persiste en `private.board_access`. Al unirse, el cliente pasa el token en texto claro vía URL:
  ```
  /board/:id?access=TOKEN_HEX_64
  ```
- **Riesgos:**
  1. **Filtración por Canal Inseguro:** El token se almacena en el historial del navegador, logs de proxies, capturas de pantalla compartidas y en aplicaciones de mensajería (WhatsApp, Discord, etc.).
  2. **Imposibilidad de Revocación:** El creador del tablero (`board_access.creator`) no dispone de ningún mecanismo ni RPC para invalidar o rotar el token. Si el enlace cae en manos de un participante disruptivo, este puede sabotear el tablero de forma indefinida.
  3. **Ausencia de Roles (ACL binario):** Todo usuario que ingresa con el enlace se convierte en `member` con permisos totales de mutación (agregar, borrar, mover jugadores, renombrar formaciones, etc.). No existe el rol de "Espectador" (*Read-Only Viewer*).
- **Recomendación Técnica:**
  - Separar enlaces en:
    - `Enlace de Edición` (con token de escritura).
    - `Enlace de Solo Lectura` (público o con token de lectura).
  - Implementar la función `regenerate_board_token(p_board uuid)` accesible únicamente por `creator` (`auth.uid() = board_access.creator`).

---

### 2.2. Denegación de Servicio (DoS) y Agotamiento de Recursos (Supabase Auth Rate Limit)
- **Severidad:** **ALTA**
- **Descripción:** La aplicación depende de `c.auth.signInAnonymously()` sin verificación de Captcha (Turnstile/hCaptcha) ni limitación de tasa por IP:
  ```ts
  // src/lib/api.ts
  const result = await c.auth.signInAnonymously();
  ```
  En la base de datos, el límite es:
  ```sql
  if (select count(*) from private.board_access where creator=auth.uid()) >= 25 then 
    raise exception 'Llegaste al límite de 25 tableros por sesión.'; 
  end if;
  ```
- **Riesgos y Evidencia Real:**
  - Como el límite está ligado a `auth.uid()`, un atacante puede crear miles de sesiones anónimas simplemente limpiando cookies y llamando a `create_board()`.
  - En las pruebas de regresión E2E de Playwright (`VERIFICATION.md` y logs de tests), se observó repetidamente el error:
    `AuthApiError: Request rate limit reached (HTTP 429)`
    Esto demuestra que en el tier gratuito de Supabase, la creación irrestricta de sesiones anónimas puede voltear la disponibilidad de la aplicación para usuarios legítimos.
- **Recomendación Técnica:**
  - Almacenar la sesión anónima de forma persistente y no solicitar nuevos tokens en bucles de error.
  - Implementar Cloudflare Turnstile o reCAPTCHA v3 en la acción de "Crear tablero".
  - Establecer un Rate Limiter a nivel de Vercel Edge Middleware por IP para la creación de tableros.

---

### 2.3. Control de Acceso y Spoofing en Canales Realtime
- **Severidad:** **MEDIA**
- **Descripción:**
  - El límite de 15 participantes simultáneos está implementado exclusivamente en el cliente (`src/features/useBoard.ts`):
    ```ts
    const participants = Object.values(c.presenceState<Participant>()).flat();
    if (participants.length >= 15 ...) { setError("La cancha está llena..."); disconnect(); }
    ```
  - Si un usuario malicioso utiliza un script de Node.js o modifica el bundle en consola, puede ignorar esta condición y conectar cientos de clientes al canal broadcast de Realtime, saturando la cuota de conexiones concurrentes de Supabase.
- **Recomendación Técnica:**
  - Los mensajes broadcast `player_moving` transmiten `lease` y coordenadas. Aunque no persisten datos en BD, consumen ancho de banda. Se recomienda asegurar que Supabase Realtime valide `presence` con un webhook de autorización si se migra a un plan de escala.

---

### 2.4. Cabeceras de Seguridad HTTP en Vercel
- **Severidad:** **MEDIA**
- **Descripción:** En `vercel.json`:
  ```json
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
  ```
- **Vulnerabilidad:** Falta definir una `Content-Security-Policy` (CSP) y `Strict-Transport-Security` (HSTS).
  - Sin CSP, cualquier inyección accidental en dependencias de terceros o manipulación del DOM podría realizar conexiones a servidores no autorizados.
- **Recomendación Técnica:**
  Agregar en `vercel.json`:
  ```json
  {
    "key": "Content-Security-Policy",
    "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob:;"
  },
  {
    "key": "Strict-Transport-Security",
    "value": "max-age=63072000; includeSubDomains; preload"
  }
  ```

---

### 2.5. Bloqueos de Concurrencia Pesimista (Advisory Locks y Row Locks)
- **Severidad:** **BAJA / POSITIVO CON RESERVA DE ESCALABILIDAD**
- **Evaluación Positiva:**
  - `perform 1 from public.boards where id=p_board for update;` serializa las operaciones a nivel de fila en la tabla maestra.
  - Esto previene condiciones de carrera (*race conditions*) en el conteo de jugadores, cálculo de números de camiseta y cambio de variantes.
- **Reserva de Rendimiento:** Si 15 usuarios mueven fichas simultáneamente de forma frenética en el mismo tablero, todas las transacciones SQL (`change_player_v2`) hacen cola esperando el lock de la fila del tablero. A 100 tableros concurrentes, el pool de conexiones de Postgres (PgBouncer) podría experimentar picos de latencia.

---

## 3. Navegabilidad, Accesibilidad y Flujo de Usuario

### 3.1. Flujo de Enlaces y Manejo de Rutas
- **Ruta Raíz (`/`):**
  - Presenta la landing page con la maqueta 3D interactiva (`LandingPitch`), botón de "Crear tablero" y sección de explicación "Cómo se juega".
  - Si el usuario no tiene apodo guardado en `localStorage`, despliega el modal accesible `Nickname`.
- **Ruta Tablero (`/board/:id`):**
  - Resuelto dinámicamente mediante `BoardGate.tsx` con carga diferida (`React.lazy`).
  - Validación de UUID (36 caracteres) y Token de acceso (64 caracteres hex). Si falta el parámetro `?access=`, muestra de inmediato un estado amigable: *"Enlace inválido. Pedí el enlace completo con su token de acceso."*
- **Ruta Catch-All (`*`):**
  - Muestra una página 404 temática: *"La pelota se fue afuera. Volver al inicio"*.

### 3.2. Accesibilidad (a11y)
- **Puntos Fuertes:**
  - Excelente implementación de `useModalFocus`: bloquea el `overflow` del `body`, atrapa el foco del teclado dentro del diálogo (`Tab` y `Shift+Tab`) y devuelve el foco al elemento anterior al cerrar.
  - Atajos de teclado completos para Undo/Redo (`Ctrl+Z`, `Ctrl+Y`, `Cmd+Shift+Z`), con exclusión automática cuando el foco está dentro de un `<input>` o `<textarea>`.
  - Respeto por `prefers-reduced-motion` en la maqueta 3D de la landing, desactivando oscilaciones automáticas y atenuando transiciones para usuarios sensibles.
- **Áreas de Mejora en Navegabilidad:**
  - **Falta de Botón de Salida:** No hay botón para desconectarse voluntariamente de la sesión de una pizarra o volver al listado de "Mis Tableros Creados" (los tableros sólo se guardan en el historial si el usuario los marcó como favoritos o si conserva la URL).
  - **Pérdida de Pizarras:** Dado que no hay cuenta con email ni listado en pantalla de "Pizarras recientes", si el usuario cierra la pestaña sin copiar el enlace, pierde el acceso a la pizarra creada a menos que la busque en el historial del navegador.

---

## 4. Rendimiento, Métricas y Optimización de Código

### 4.1. Análisis del Bundle de Producción (Vite Build)
Prueba real de build ejecutada (`npm run build`):
```text
dist/index.html                          0.65 kB │ gzip:   0.38 kB
dist/assets/index-Xw68-8oR.css          26.97 kB │ gzip:   6.98 kB
dist/assets/BoardGate-NCtsaI5q.js       31.03 kB │ gzip:  10.53 kB
dist/assets/FootballField-sOrEeDvE.js  334.03 kB │ gzip: 102.32 kB
dist/assets/index-QAzJwDAn.js          492.48 kB │ gzip: 144.06 kB
Total JS sin comprimir: ~857 kB
```
- **Diagnóstico:**
  1. `FootballField` está correctamente code-split con `React.lazy()`. Konva no se carga en la landing page, lo cual mantiene la página inicial ágil.
  2. Sin embargo, el chunk principal `index-QAzJwDAn.js` pesa **492 kB** (144 kB gzipped). Esto se debe a que `@supabase/supabase-js`, `react-router-dom` y librerías base se empaquetan en el entrypoint.
- **Mejora Sugerida (Configuración en `vite.config.ts`):**
  Configurar `manualChunks` en Rollup para separar `@supabase/supabase-js` y `lucide-react`:
  ```ts
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
  ```

### 4.2. Eficiencia de Renderizado y Ciclo de Vida en Canvas (Konva)
- En `FootballField.tsx`, la capa estática del campo (`Rect`, líneas, arcos) está aislada en un `<Layer listening={false}>`, lo cual evita cálculos innecesarios de detección de eventos sobre las líneas del campo.
- Durante el arrastre (`Token.tsx`), se actualizan directamente los nodos de Konva mediante `node.current.position()` sin forzar re-renders masivos de React en cada movimiento del cursor, lo que garantiza 60 FPS en el arrastre local.
- La emisión de coordenadas hacia Supabase Realtime está regulada con un *throttle* de **120 ms** (`Date.now() - d.last < 120`), previniendo inundación de paquetes WebSocket.

---

## 5. Evaluación de UX/UI con Evidencia y Pruebas Reales

### 5.1. Resultados de las Pruebas Automatizadas Ejecutadas en Esta Auditoría

#### A. Pruebas Unitarias y de Base de Datos (`npm test`):
- **Resultado:** **31 de 31 aprobadas (100% PASS)** en 2.43s.
  - `model.test.ts`: Geometría de cancha, conversiones de coordenadas horizontal/vertical y drops válidos.
  - `rotation.test.ts`: Estabilidad de cuaterniones 3D.
  - `history.test.ts`: Pilas de undo/redo y operaciones de reversión.
  - `database.test.ts`: 20 pruebas sobre PostgreSQL embebido (PGlite), validando RLS, serialización y transacciones.

#### B. Pruebas de Interfaz 3D (`e2e/landing-3d.spec.ts`):
- **Resultado:** **3 de 3 aprobadas (100% PASS)** en 13.0s.
  - Verificado: Rotación por mouse, teclado, tacto en viewport móvil (390x844), inercia de giro y pausa en `prefers-reduced-motion`.

#### C. Pruebas de Integración con Supabase Real (`e2e/app.spec.ts`):
- **Resultado:** **2 de 2 aprobadas (100% PASS)** en 28.3s.
  - Verificado: Apertura simultánea de dos navegadores (Escritorio + Móvil táctil), sincronización de presencia en tiempo real, creación y renombrado de jugadores, arrastre colaborativo y respeto estricto de RLS.

#### D. Detección de Desfases en Pruebas E2E Heredadas (`e2e/formats.spec.ts` y `e2e/quick-add.spec.ts`):
- **Diagnóstico:** Se ejecutaron estas suites y fallaron con timeout en aserciones de texto:
  1. `formats.spec.ts` buscaba el texto antiguo: `"Vaciá la cancha para cambiar de formato."`  
     Pero la interfaz actual (tras la migración de banco/suplentes) muestra: `"Vaciá la cancha y el banco para cambiar de formato."`.
  2. `quick-add.spec.ts` arrojó fallo de detección de drop debido a que las coordenadas de prueba en el canvas quedaron desfasadas con respecto a la nueva zona exterior de suplentes (`apron` flexible de 60–136 px).
- **Importancia:** La funcionalidad en producción funciona correctamente; el fallo es de mantenimiento de tests en el arnés de pruebas de Playwright.

### 5.2. Fortalezas de Diseño (UI/UX)
- **Identidad Visual Porteña/Argentina:** Nombres y textos con personalidad (*"El potrero"*, *"La pizarra de los pibes"*, *"Al vestuario"*, *"La pelota se fue afuera"*).
- **Pizarrón Táctil Intuitivo:** La posibilidad de sacar jugadores arrastrándolos fuera de las líneas laterales para mandarlos al banco es sumamente natural y evita paneles secundarios invasivos.
- **Indicador Visual de Estados:** El estado de conexión (*Conectando, Conectado, Reconectando, Cancha llena*) ofrece retroalimentación transparente al usuario ante caídas de red.

### 5.3. Fricciones de Experiencia de Usuario Detectadas
1. **Doble Clic en Móvil:** Para editar un jugador en pantalla táctil, se requiere un "doble toque", lo cual a menudo activa el zoom del navegador en teléfonos si no se maneja con cuidado el viewport meta tag.
2. **Falta de Herramienta de Dibujo Táctico (Flechas / Trazos):** En una pizarra táctica real, los entrenadores y jugadores no solo mueven fichas; necesitan dibujar flechas de desmarque, líneas de pase o zonas de presión. Esta es la funcionalidad #1 más solicitada en pizarras deportivas.
3. **Falta de Exportación:** No hay botón para *"Descargar pizarra como imagen (PNG/PDF)"* para mandar al grupo de WhatsApp del equipo.

---

## 6. Estrategias de Monetización para DTactics

DTactics tiene un potencial enorme en el ecosistema del fútbol amateur, ligas de fin de semana, clubes de barrio, torneos de fútbol 5/7/11, creadores de contenido y directores técnicos. Para monetizar sin arruinar la esencia rápida ("gratis, sin vueltas"), se proponen las siguientes líneas de negocio:

### 6.1. Modelo Freemium: "DTactics Pro" (Suscripción DT / Equipos)
Mantener la pizarra básica gratis y cobrar una suscripción accesible (ej. **$3.99 USD/mes** o **$4.000 ARS/mes** vía Mercado Pago / Stripe):
- **Funcionalidades Pro:**
  - **Herramientas de Dibujo Táctico:** Flechas de carrera, líneas de pase curvas, conos de entrenamiento, zonas de calor sombreadas.
  - **Exportar en HD:** Descarga de la formación en PNG/JPG de alta resolución con plantilla profesional y escudo del equipo para compartir en Instagram/WhatsApp.
  - **Tableros Ilimitados y Guardados:** Cuenta permanente (Google / Email) donde el DT guarda sus 20 equipos, rivales y partidos.
  - **Animación de Jugadas:** Guardar "Paso 1" y "Paso 2" y reproducir la jugada animada.

### 6.2. Patrocinios B2B Nativos (Canchas de Fútbol y Marcas Deportivas)
- **Sponsors en el Césped:** En lugar de molestos banners de Google Ads que arruinan la experiencia, colocar un logo sutil en el círculo central de la cancha o en los laterales (ej. marcas de cerveza, indumentaria deportiva, bebidas isotónicas o apps de reserva de canchas como HoySeJuega).
- **Plataformas de Torneos Amateur:** Vender la integración en marca blanca (White Label) para organizadores de torneos de fútbol amateur, permitiendo que cada equipo arme su ficha táctica oficial en el sitio del torneo.

### 6.3. Donaciones Comunitarias ("Invitame un Café" / Cafecito / Buy Me a Coffee)
- Colocar un botón discreto en el footer o en el modal de compartir: *"¿Te sirvió para ganar el partido del viernes? Invitale un café al programador"*. En aplicaciones de nicho pasional con fuerte identidad local, esta vía genera ingresos recurrentes sin barreras de entrada.

---

## 7. Matriz de Decisión: Qué Implementar y Qué Descartar

Para facilitar tu toma de decisiones sobre los siguientes pasos de desarrollo, la siguiente matriz clasifica las iniciativas según su impacto, esfuerzo y recomendación estratégica:

| Iniciativa | Categoría | Esfuerzo | Impacto | Recomendación | Justificación |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Descargar Pizarra como Imagen (PNG)** | UX / Viral | Bajo | **Alto** | **IMPLEMENTAR (Prioridad 1)** | Konva ya permite `stage.toDataURL()`. Facilita que los pibes compartan la táctica en grupos de WhatsApp, actuando como canal de crecimiento viral orgánico. |
| **Herramienta de Flechas y Trazos** | Feature | Medio | **Alto** | **IMPLEMENTAR (Prioridad 1)** | Es la carencia técnica más notable en comparación con pizarras tácticas profesionales. |
| **Modo Solo Lectura (Link de Espectador)** | Seguridad | Bajo | **Alto** | **IMPLEMENTAR (Prioridad 1)** | Previene que cualquier invitado al azar modifique o borre jugadores accidentalmente. |
| **Cabeceras CSP y HSTS en `vercel.json`** | Seguridad | Muy Bajo | **Medio** | **IMPLEMENTAR (Prioridad 2)** | Endurece el front en Vercel contra inyecciones y ataques XSS a costo cero de rendimiento. |
| **Persistencia Local de "Mis Tableros"** | UX | Bajo | **Medio** | **IMPLEMENTAR (Prioridad 2)** | Guardar en `localStorage` la lista de UUIDs creados para que el usuario pueda volver a sus pizarras sin perder el link. |
| **Captchas / Rate Limit en Creación de Tableros** | Seguridad | Medio | **Medio** | **IMPLEMENTAR (Prioridad 2)** | Previene abusos por DoS que agotan la cuota gratuita de Supabase. |
| **Actualizar Asertos en Tests E2E de Playwright** | QA / Tests | Bajo | **Bajo** | **IMPLEMENTAR (Prioridad 3)** | Sincronizar el texto de validación de formato en `formats.spec.ts` para tener la suite de integración en 100% verde. |
| *Reemplazar Konva por SVG / DOM puro* | Arquitectura | Muy Alto | **Bajo** | **DESCARTAR** | Konva maneja canvas 2D con un rendimiento y control de colisiones excelente. Reemplazarlo sería costoso e innecesario. |
| *Exigir Registro Obligatorio con Contraseña* | Auth | Alto | **Negativo** | **DESCARTAR** | Destruiría la propuesta de valor fundamental de DTactics: *"Gratis. Sin registro. Sin vueltas"*. |
| *Banners de Publicidad Intrusiva (AdSense)* | Monetización | Bajo | **Negativo** | **DESCARTAR** | Rompería la estética cuidada y degradaría el rendimiento táctil del pizarrón. Es preferible optar por patrocinio nativo o DTactics Pro. |

---

*Reporte generado por Antigravity tras el análisis minucioso de 8 archivos de migración de Supabase, componentes de front, configuración de Vercel y ejecución de suites de pruebas reales.*

