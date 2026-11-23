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
- **Escucha analítica**: catálogo de álbumes, canciones y playlists (pega el enlace: título, tipo, portada y duración se rellenan solos). Lo asignas con fecha y nota, y lees sus 6 respuestas.
- **Deberes**: tareas para practicar, a uno o a varios a la vez, con fecha opcional. Los alumnos las marcan como practicadas. También se gestionan desde la ficha de cada alumno.
- **Agenda**: tus clases, leídas de Google Calendar (ver apartado D). En cada clase, sus deberes pendientes y si ha pagado el mes.
- **Alumnos**: aprobar cuentas y la ficha de cada uno (edad, permiso familiar de mensajes, si tiene la app, deberes, trato de pago, próxima clase, escuchas).
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
- **Copia de seguridad**: *Ajustes → Copia de seguridad* descarga todo en un archivo. Hazla de vez en cuando (por ejemplo, una al mes); el plan gratuito de Supabase no guarda copias recuperables.
- **Borrar a alguien**: *Supabase → Authentication → Users → borrar*. Sus datos se eliminan en cascada.
- **Avisos por email**: aparcado. Basta con las notificaciones del móvil.
- **Plan gratuito**: un proyecto sin actividad durante días puede pausarse. Si la web no carga, mira el panel de Supabase.
- **El navegador guarda** solo la sesión y el tema claro/oscuro.
