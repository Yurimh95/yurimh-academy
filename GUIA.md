# Yurimh Music Academy · Guía

## Archivos

| Archivo | Qué es | Dónde va |
|---|---|---|
| `index.html` | La web completa (alumno + profesor) | GitHub (repositorio) |
| `config.js` | Tu URL y clave pública de Supabase | GitHub, junto a `index.html` |
| `supabase/schema.sql` | Tablas, reglas de seguridad y funciones | Supabase → SQL Editor (no se sube a GitHub) |
| `GUIA.md` | Esta guía | Para ti |

**Idea clave:** las claves públicas viven en `config.js`. Las secretas (la del calendario, la de las notificaciones) solo están en Supabase, nunca en GitHub.

## Nombres y convención

| Qué | Nombre |
|---|---|
| App | **Yurimh Music Academy** (cambiable en `APP_NAME`, dentro de `index.html`) |
| Organización / proyecto en Supabase | Yurimh Music Academy / Yurimh Music Academy (solo se ven en el panel; el identificador interno es `gyzwevayeloishhldumd`) |
| Repositorio de GitHub | `yurimh-music-academy` |
| Web | `https://yurimh95.github.io/yurimh-music-academy/` |

Tablas: lo común va sin prefijo (`profiles`, `reactions`, `moderation_reports`) y cada módulo lleva el suyo: `listening_*` (Escucha analítica), `board_*` (Avisos), `feed_*` (Feed). `homework_*` (Deberes), `payments_*` (Pagos), `lessons_*` (Agenda), `dm_*` (Mensajes). Todo en inglés y `snake_case`.

---

## A. Cómo se actualiza la app

Lo hace Claude desde la carpeta del proyecto: cambia el código, pasa las pruebas automáticas, sube los cambios a GitHub y aplica en Supabase lo que haga falta (te pide permiso para lo que toca datos). GitHub Pages publica en 1-2 minutos; luego recarga con **Ctrl+F5** en el PC o cierra y abre la app en el móvil.

- **Una sola sesión de Claude por carpeta a la vez.** Varias sesiones a la vez se pisan los archivos y el portapapeles.
- Si Claude te pasa SQL para pegar en Supabase (**SQL Editor → New query → pegar → Run**), comprueba que viene de la sesión con la que estás hablando.

---

## B. Lanzamiento: invitar a los primeros alumnos

### B1. Antes de invitar (10 minutos)
1. **Prueba con una cuenta de alumno**: regístrate con `yurimh95+prueba@hotmail.com` (te llega a tu correo normal), apruébala en **Alumnos** y entra con ella en una ventana de incógnito o en otro móvil. Ponle un deber, un aviso y una escucha y mira cómo lo ve.
2. **Configura a cada alumno** cuando se registre: en **Alumnos → su nombre** pon su trato en **Pagos** y, si en Google Calendar lo llamas distinto, su "Nombre en Google Calendar".
3. **Haz una copia de seguridad** (Ajustes → Copia de seguridad) y guárdala.
4. Borra la cuenta de prueba al terminar (*Supabase → Authentication → Users*).

### B2. Mensaje para invitar (cópialo y envíalo por WhatsApp)

> ¡Hola! 🎸 He creado una app para las clases: **Yurimh Music Academy**. Ahí tendrás tus deberes, las escuchas que analizamos, los avisos y tu próxima clase, y te avisará en el móvil.
>
> 1. Entra aquí desde el móvil: https://yurimh95.github.io/yurimh-music-academy/
> 2. Pulsa **Crear cuenta** y regístrate con tu nombre y tu email (te llegará un correo para confirmarlo).
> 3. Yo apruebo tu cuenta en cuanto la vea.
> 4. Al entrar te saldrá cómo **instalarla** en el móvil y **activar las notificaciones**. Hazlo: así no se te pasa nada.
>
> Cualquier duda, me escribes por la propia app (Mensajes). ¡Nos vemos en clase!

### B3. Si a alguien no le llegan las notificaciones
Que cierre la app del todo y la vuelva a abrir, y pulse otra vez **Ajustes → Activar notificaciones**. En iPhone, primero hay que instalarla (Safari → Compartir → *Añadir a pantalla de inicio*) y abrirla desde su icono.

---

## C. Uso

**Profesor**
- **Inicio**: el muro del grupo. Publicas, comentas, reaccionas y puedes borrar cualquier cosa.
- **Mensajes**: privados con cada alumno. Entre alumnos solo si los dos son adultos (o la familia lo autoriza). Tú no lees las conversaciones ajenas salvo un mensaje denunciado.
- **Avisos**: *+ Nuevo aviso* → título, texto, destinatarios (todos o algunos) y fijarlo arriba. Ves quién lo ha leído. Les llega al móvil.
- **Escucha analítica**: catálogo de álbumes, canciones y playlists (pega el enlace: título, tipo, portada y duración se rellenan solos). Lo asignas con fecha y nota, y lees sus 6 respuestas. Para asignar muchas de golpe, pulsa **Asignar varias** arriba del catálogo: marcas las escuchas (hay buscador), los alumnos y, si quieres, una fecha y una nota comunes. Las que un alumno ya tenga se dejan como están, y a cada uno le llega un solo aviso con todas. Al abrir "Ver respuestas" puedes **reaccionar a cada respuesta** con cualquier emoji (botón de la carita al lado; pulsar la reacción la cambia o la quita) y pulsar **Marcar como leído** para que el alumno sepa que las has leído. Al alumno le llega un solo aviso por escucha. Si después cambia sus respuestas, la marca de leído se quita sola y vuelve a salir "Sin leer".
- **Vídeos para ver, no solo escuchar**: al crear o editar una escucha, marca la casilla **🎬 Vídeo para ver** (viene desmarcada). Esa escucha lleva la etiqueta "Para ver" en la lista y en su ventana, y cada vez que el alumno abra el enlace le sale un aviso: calidad al máximo (4K si puede), auriculares y atención total, con los botones "Ahora no" y "Entendido, abrir vídeo". A ti no te sale; para verlo, usa "Ver como alumno".
- **Ordenar el catálogo de Escucha analítica**: arriba del catálogo están **Carpetas** (colecciones como las de Spotify: "Essentials", "Yuri's Tops"…; una carpeta por escucha) y **Géneros** (lista cerrada de géneros y subgéneros que solo tú cambias; una escucha puede llevar varios). La carpeta y los géneros se eligen al crear o editar la escucha. El **artista** se rellena solo (en playlists de muchos artistas se queda vacío) y lo puedes corregir. El buscador encuentra por título, artista, género o carpeta, y los filtros combinan carpeta, género, tipo y **alumno**: eliges a uno y ves sus escuchas pendientes, escuchadas, vencidas o **las que aún no tiene**, con un botón "+ Asignar" en cada fila. Filtrar por un género incluye sus subgéneros. Los alumnos ven sus escuchas igual que tú: agrupadas en carpetas plegables, con buscador y filtros de carpeta, género y tipo, más sus pestañas Pendientes / Escuchados / Todos.
- **Deberes**: tareas para practicar, a uno o a varios a la vez, con fecha opcional. Los alumnos las marcan como practicadas. También se gestionan desde la ficha de cada alumno. Para **reutilizar** deberes que ya pusiste: botón **Copiar** junto al alumno (copia varias tareas suyas) o el icono de copiar de una tarea; eliges a quién y la fecha (la misma, sin fecha u otra). Las copias empiezan sin practicar y no se repite una tarea que el otro ya tenga pendiente.
- **Agenda**: tus clases, leídas de Google Calendar (ver apartado D). En cada clase, sus deberes pendientes y si ha pagado el mes.
- **Alumnos**: aprobar cuentas y la ficha de cada uno (edad, permiso familiar de mensajes, si tiene la app, deberes, trato de pago, próxima clase, escuchas).
- **Objetivos**: en la ficha de cada alumno, "Marcar objetivos". Pulsa el círculo cuando consiga uno: le llega un aviso y, al abrir la app, lo celebra con un trofeo y confeti. Ahí mismo añades objetivos personales solo para él, y con "Editar lista general" cambias las etapas y los objetivos que tienen todos. El alumno los ve en su Perfil, en un bloque privado (solo él y tú).
- **Rechazar a alguien que se ha registrado**: en "Pendientes de aprobar", botón "Rechazar". Se borra su solicitud y no se le avisa; si se vuelve a registrar, te sale otra vez.
- **Bloquear a alguien que se ha registrado**: al lado, en pequeño, "Bloquear". Elige "Bloquear este correo" o, si no es un correo de Gmail, Hotmail, etc., "Bloquear todo @dominio" (útil contra bots). Su solicitud desaparece y ya no puede volver a registrarse.
- **Correos bloqueados**: en Ajustes → Privacidad, apartado "Correos bloqueados". Ahí puedes bloquear a mano un correo (`nombre@ejemplo.com`) o un dominio entero (`@ejemplo.com`) y desbloquearlos. Un correo bloqueado lo está también con sus variantes (mayúsculas, `nombre+algo@` y, en Gmail, los puntos). Quien lo intente verá solo "No se ha podido crear la cuenta con este correo", sin saber que está bloqueado. Bloquear no afecta a cuentas que ya existen: a esas, archívalas.
- **Dar de baja a un alumno**: en su ficha, abajo del todo, "Archivar alumno". No puede entrar, desaparece de todas las listas y se oculta lo que publicó, pero no se borra nada. Los archivados salen al final de Alumnos, con "Reactivar" y "Borrar definitivamente" (hay que escribir su nombre; borra también sus pagos, así que descarga antes una copia si la necesitas). El alumno puede borrar su propia cuenta en Ajustes, y entonces te llega un aviso.
- **Pagos** (solo tú): trato de cada alumno (mensual, por clase o gratis, con precio) y los pagos de cada mes. Con la Agenda conectada, te dice a quién toca cobrar (ya tuvo su primera clase del mes). Cada mes empieza sin marcar; los anteriores quedan de historial.
- **Moderación**: denuncias pendientes, escuchas vencidas y resumen.
- **Ajustes**: notificaciones, instalar la app, privacidad, **copia de seguridad**, contraseña y cerrar sesión. El tema claro/oscuro está en el menú.
- En el móvil, **Agenda** y **Pagos** están dentro de **Alumnos** (botones de arriba), y **Ajustes** dentro de tu **Perfil** (⚙).

**Alumno**
- **Inicio** (con "Para ti": próxima clase, deberes, avisos y escuchas pendientes), **Mensajes**, **Avisos**, **Escucha analítica**, **Deberes**, **Perfil** y **Ajustes**.
- Recibe en el móvil: avisos, mensajes, deberes nuevos, menciones, solicitudes de compañero y el **recordatorio de clase 8 horas antes**.
- **Quién le ve**: los demás alumnos solo le ven (nombre, foto y perfil) cuando participa (publica, comenta o reacciona), si son compañeros o si se han escrito. Si no participa, solo le ves tú. Tú ves siempre a todos.
- **Compañeros**: al pulsar el nombre o la foto de otro alumno, *+ Agregar como compañero*. El otro lo acepta o lo rechaza (en su Perfil o desde la notificación). Sus compañeros salen en su Perfil, para no perderlos de vista aunque el grupo crezca. Bloquear a alguien también le quita de compañeros.

**Social**
- **Fotos**: botón 📷 en el Inicio, en los avisos, en los mensajes privados (hasta **10** por publicación o mensaje) y en los comentarios (**1**). El texto es opcional si hay fotos. Antes de publicar se ven en miniatura y la × quita una. Se ven en rejilla (4 a la vista y "+N" si hay más); al pulsar una se abre a pantalla completa y se pasa de una a otra con las flechas o deslizando el dedo. Al editar un post o un aviso puedes quitar o añadir fotos.
  - **Privacidad**: cada foto la ve solo quien puede ver aquello donde está (un mensaje privado, solo los dos; un aviso dirigido, solo sus destinatarios). No hay enlaces públicos que se puedan reenviar. La app las reduce antes de subirlas (unos 250 KB) y les quita los datos ocultos del móvil, **incluida la ubicación GPS**.
  - **Espacio**: el plan gratuito de Supabase da 1 GB para fotos, que son unas 3.000. Lo ves en Supabase → **Storage**. Al borrar algo, sus fotos se borran; lo que borras tú en Moderación y las cuentas borradas se limpian solas (cada hora).
- **Vídeos y stories** (como Instagram), de hasta **60 segundos**. La app los pasa a 720p antes de subirlos (unos 20 MB por minuto). Si duran más, se queda el primer minuto.
  - **Stories**: la fila de círculos de arriba del Inicio. Pulsa **+** en "Tu story" y elige una **foto o un vídeo**. Se abre el editor, como en Instagram:
    - **Encuadre** (foto o vídeo): arrástrala para moverla y pellízcala (en el ordenador, la rueda del ratón) para acercarla o **alejarla**. Lo que sobra se rellena con un degradado de los colores de la propia imagen, como en Instagram. Las fotos horizontales empiezan enteras. Una foto se ve **5 segundos**.
    - **Aa**: añade un texto. Eliges color, si lleva fondo y el tamaño, y puedes **mencionar con @** (a quien mencionas le llega un aviso). Los textos se arrastran a donde quieras, se agrandan pellizcando o con la rueda, se editan con un toque y se quitan arrastrándolos a la papelera 🗑️.
    - **✏️**: dibuja a mano con el dedo, con colores y grosor, y "Deshacer".
    - Al verla, la @mención se puede pulsar para abrir el perfil.
  - **Al verlas**: se borran solas a las **24 horas**. El aro brillante indica las que aún no has visto. Al verla, toca a la derecha para pasar a la siguiente, a la izquierda para volver o mantén pulsado para pausar. Puedes reaccionar con cualquier emoji o responder por privado; la respuesta llega como mensaje privado y sigue las reglas de siempre (con un menor sin permiso familiar no sale el cuadro). En la tuya ves **quién la ha visto** y con qué emoji. Revisar una story denunciada desde Moderación no cuenta como vista.
  - **Vídeo en un post del Inicio**: botón **Vídeo**. Lleva un vídeo o fotos, no las dos cosas. Quien publica elige si se borra a los **1, 3 o 7 días**. Al caducar se borra el vídeo, pero **el post se queda siempre** (aunque no tenga texto) con el aviso "Vídeo no disponible", sus comentarios y sus reacciones: queda constancia de que esa persona publicó algo. Al editar el post no se cambia el vídeo.
  - **Denuncias**: una story o un vídeo denunciado no se borra al caducar hasta que lo revises en Moderación (Borrar o Descartar). Mientras, solo lo ves tú.
  - **Gasto y fusible**: el plan gratis da unos 5 GB de descargas al mes, y cada vez que alguien ve un vídeo se descarga entero. La app reserva **3 GB al mes para vídeo** y lo apunta en Ajustes → **Vídeos este mes**. Al pasar del 70 % te llega un aviso, y si se llega al 100 % no se pueden subir vídeos hasta el día 1 (lo ya subido se sigue viendo). Con 8 alumnos y algún vídeo a la semana no se acerca ni de lejos. Para cambiar el límite, `video_budget()` en `supabase/schema.sql`.
- **Reacciones**: 👍🏼 ❤️ 😂 😮 😢 😡. Una por emoji y persona; se quita pulsando otra vez.
- **Comentarios en Escucha analítica**: solo los ven quienes tienen ese elemento asignado. Las 6 respuestas son siempre privadas (autor y tú).
- **Moderación**: todo se publica al momento. Cualquiera puede **Denunciar**; tú decides si borrar o descartar.
- **Identidad**: nombre o, si lo ha elegido, apodo. Tú ves los dos, por ejemplo "Lu (Luis)".
- **Menciones (como en Discord)**: en el Inicio, en los avisos y en los comentarios, escribe **@** y sale la lista de personas; escribe **#** y salen las secciones (#Ajustes, #Avisos…) y las escuchas. Eliges con las flechas + Enter, o tocando. Se ven resaltadas en azul y al pulsarlas llevan al perfil, a la sección o a la escucha. A quien mencionas le llega una notificación (campanita y móvil). Si mencionas una escucha o una sección que alguien no tiene (por ejemplo #Alumnos), a esa persona le sale como texto normal, sin enlace. En un aviso, la mención solo avisa si el aviso va dirigido a esa persona.
- **Emojis**: todos los cuadros donde se escribe (Inicio, comentarios, avisos, mensajes, respuestas de la escucha, deberes, bio…) llevan a la derecha un botón 🙂. Ábrelo y salen todos en una sola lista que se desliza, como en WhatsApp; las pestañas de arriba (recientes, caras, gestos, música, corazones, fiesta, naturaleza) te llevan a su zona. Pulsa los que quieras: entran donde está el cursor y el selector sigue abierto hasta que pulses fuera o Esc. En el móvil se esconde el teclado mientras eliges. Los campos de datos (nombre, apodo, enlaces) no lo llevan.

---

## D. Conectar Google Calendar (Agenda)

Las clases se apuntan **solo en Google Calendar**, en un calendario dedicado a clases. La app lo lee cada 15 minutos.

1. En el ordenador, abre **Google Calendar** → ⚙ **Configuración** → en la columna izquierda, tu calendario de clases.
2. Baja hasta **"Dirección secreta en formato iCal"** y pulsa copiar. **Es privada**: quien la tenga puede ver tus clases. Si algún día se filtra, en ese mismo sitio puedes *restablecerla* (y vuelves a hacer el paso 3).
3. **Supabase** → **Edge Functions** → **Secrets** → **Add new secret**: nombre `CALENDAR_ICS_URL`, valor la dirección → **Save**.
4. En la app: **Agenda → Sincronizar ahora**.

- Cada evento debe llevar el **nombre del alumno** (por ejemplo "Clase Luis"). Si lo llamas de otra forma, ponlo en su ficha: *Nombre en Google Calendar*. Los eventos que no reconoce salen en la Agenda con un aviso.
- Repeticiones semanales o cada dos semanas, clases movidas o canceladas y cambios de hora funcionan solos.
- La app solo guarda el título y la hora de cada clase (no la descripción). Cada alumno ve solo las suyas.

---

## Notas importantes

- **Qué ven los alumnos entre sí**: nombre o apodo, foto, "Sobre ti", el Inicio y los comentarios de las escuchas que comparten. **Nunca** ven el email, la fecha de nacimiento, las respuestas, los deberes, los pagos, las clases ni los avisos de los demás. Lo garantiza la base de datos, no solo la web.
- **Privacidad**: en *Ajustes → Privacidad* y al registrarse está el texto de qué datos se guardan y para qué. Es un texto orientativo y claro; no sustituye a un asesor legal si algún día lo necesitas.
- **Menores**: si algún día das clase a un menor, informa a su familia (el texto de privacidad sirve de base). Sin fecha de nacimiento la app lo trata como menor.
- **Copia de seguridad**: *Ajustes → Copia de seguridad* descarga todo en un archivo. Hazla de vez en cuando (por ejemplo, una al mes); el plan gratuito de Supabase no guarda copias recuperables. Guarda los textos y datos, **no las fotos** de las publicaciones (esas siguen en Supabase → Storage).
- **Borrar a alguien**: *Supabase → Authentication → Users → borrar*. Sus datos se eliminan en cascada.
- **Avisos por email**: aparcado. Basta con las notificaciones del móvil.
- **Plan gratuito**: un proyecto sin actividad durante días puede pausarse. Si la web no carga, mira el panel de Supabase.
- **El navegador guarda** solo la sesión y el tema claro/oscuro.
