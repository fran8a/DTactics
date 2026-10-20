# DTactics

Pizarra táctica colaborativa de fútbol para armar equipos, probar variantes y compartir formaciones en tiempo real.

## Reglas de negocio básicas

### Creación, acceso y vigencia de pizarras
- **Acceso por enlace:** Cualquier persona puede crear una pizarra ingresando un apodo. Para compartirla se utiliza un enlace único con clave de acceso; quienes entren con ese enlace completo pueden ver y editar el tablero a la par.
- **Enlaces cortos por formación:** Los nuevos enlaces tienen el formato `/p/<código de 32 caracteres>` y abren la formación seleccionada. Cada formación reutiliza su enlace, que se actualiza al cambiar de pestaña y se obtiene con **Copiar enlace**. Los enlaces largos anteriores siguen funcionando. El registro del enlace se elimina cuando se borra su formación o pizarra.
- **Participantes simultáneos:** Cada pizarra admite hasta **15 participantes conectados** al mismo tiempo.
- **Límite por persona:** Cada usuario puede mantener hasta **5 pizarras vigentes** en simultáneo.
- **Vencimiento por inactividad:** Mientras haya al menos una persona con la pizarra abierta y activa, esta se mantiene vigente. Si pasan **10 minutos sin nadie conectado**, la pizarra vence y se elimina automáticamente junto con toda su información.

### Formaciones y formatos de juego
- **Variantes tácticas:** Un tablero puede tener hasta **12 formaciones (pestañas)**. Se pueden crear desde cero, duplicar con todos sus jugadores, renombrar o eliminar (siempre debe quedar al menos una). Cada participante puede mirar o editar una pestaña distinta sin forzar la vista de los demás.
- **Fútbol 7 y Fútbol 11:** Cada formación empieza en Fútbol 11 y permite alternar entre **7 y 11 titulares por equipo**. Para pasar a Fútbol 7, ninguno de los dos equipos puede superar los 7 titulares en cancha en ese momento (si hay más, primero deben enviarse fuera de la cancha o eliminarse).
- **Orientación de la cancha:** Cada participante puede girar la vista de la cancha entre vertical y horizontal según su propia comodidad, sin afectar cómo la ven los demás.

### Jugadores, titulares y suplentes
- **Cupos:** El límite dentro del campo es de **7 u 11 titulares por equipo** según el formato elegido, con un tope total de **40 jugadores por formación** sumando ambos equipos y quienes estén fuera de la cancha.
- **Titulares y banco (espacio exterior):** Los jugadores se agregan arrastrando fichas a la cancha o tocándolas. Si se arrastra un jugador fuera de las líneas del campo (o se lo envía afuera desde su ficha), pasa a ser suplente sin perder su lugar anterior recordado.
- **Banco solo en los laterales:** Los suplentes no pueden ubicarse detrás de los arcos. En vista vertical se permiten los costados izquierdo y derecho; en horizontal se permiten los laterales superior e inferior. Las posiciones anteriores detrás de los arcos se acomodan visualmente a un lateral.
- **Numeración y datos:** Cada equipo numera a sus jugadores de forma automática e independiente empezando desde el **1** (hasta el 99). Si un equipo queda completamente vacío, su contador vuelve a empezar en 1. A cada jugador se le puede editar el nombre (1 a 40 caracteres), el número de camiseta (0 a 99) y el equipo, o eliminarlo individualmente. También es posible vaciar todos los jugadores de la formación actual.

### Colaboración en vivo e historial
- **Movimiento y bloqueo por turno:** Cuando alguien arrastra un jugador, el resto ve el movimiento en tiempo real y esa ficha queda **bloqueada temporalmente** para evitar que dos personas la muevan a la vez. La posición definitiva se guarda al soltarla; si el participante pierde conexión en medio del gesto, el bloqueo se libera solo tras unos segundos.
- **Control de cambios concurrentes:** Las ediciones sobre los datos de un jugador o de la pizarra verifican que nadie más haya modificado ese mismo elemento en el medio. Si ocurre un choque, se avisa del conflicto sin pisar el trabajo ajeno.
- **Deshacer y rehacer individual:** Cada participante puede deshacer y rehacer hasta sus últimas **50 acciones propias** en cada formación (altas, bajas, ediciones y movimientos). Solo se puede revertir una acción si ningún otro participante modificó a ese mismo jugador después.

### Jugadas con recorridos
- **Preparar jugada:** Debajo del listado de jugadores, activar el modo, seleccionar un titular y tocar la cancha para agregar hasta 24 puntos. Los puntos se pueden arrastrar con mouse o pantalla táctil. Guardar confirma el recorrido; cada titular tiene uno, identificado con el color de su equipo.
- **Edición compartida:** Recorridos y duración se guardan por formación, admiten deshacer y rehacer y verifican versiones para evitar sobrescribir ediciones ajenas. Ante un conflicto, recargar el recorrido antes de editarlo nuevamente. Limpiar todos requiere confirmación.
- **Vista previa local:** Play mueve simultáneamente a los titulares con recorrido durante la duración elegida (1 a 30 segundos). Pausa conserva el progreso y Reiniciar devuelve las posiciones iniciales. El último cuadro permanece visible al finalizar. La vista previa bloquea la edición local y no guarda posiciones ni envía escrituras por cada cuadro. Si cambia la formación compartida, se reinicia la vista previa.
- **Continuidad:** Girar la cancha conserva las coordenadas. Duplicar una formación copia sus recorridos a los nuevos jugadores. Enviar un jugador al banco o eliminarlo elimina su recorrido; eliminar la formación o vencer la pizarra también elimina sus datos tácticos e historial asociado.
- **Sidebar:** Su altura se ajusta al espacio disponible; el listado de jugadores tiene scroll interno y conserva las dos columnas, mientras los controles tácticos permanecen accesibles.
