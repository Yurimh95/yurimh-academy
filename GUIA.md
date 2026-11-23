# Yurimh Music Academy · Guía

## Archivos

| Archivo | Qué es | Dónde va |
|---|---|---|
| `index.html` | La web completa (alumno + profesor) | GitHub (repositorio) |
| `config.js` | Tu URL y clave pública de Supabase | GitHub, junto a `index.html` |
| `supabase/schema.sql` | Tablas, reglas de seguridad y funciones | Supabase → SQL Editor (no se sube a GitHub) |
| `GUIA.md` | Esta guía | Para ti |

**Idea clave:** las claves viven en `config.js`. A partir de ahora, cuando te pase un `index.html` nuevo, subes solo ese archivo y no vuelves a pegar claves.

## Nombres y convención

| Qué | Nombre |
|---|---|
| App | **Yurimh Music Academy** (cambiable en `APP_NAME`, dentro de `index.html`) |
| Organización / proyecto en Supabase | Yurimh Music Academy / Yurimh Music Academy (solo se ven en el panel; el identificador interno es `gyzwevayeloishhldumd`) |
| Repositorio de GitHub | `yurimh-music-academy` |
| Web | `https://yurimh95.github.io/yurimh-music-academy/` |

Tablas: lo común va sin prefijo (`profiles`, `reactions`, `moderation_reports`) y cada módulo lleva el suyo: `listening_*` (Escucha analítica), `board_*` (Avisos), `feed_*` (Feed). Más adelante vendrán `chat_*`, `payments_*`, `homework_*`… Todo en inglés y `snake_case`.

---

## A. ACTUALIZAR a esta versión (ya tienes la web funcionando)

Esta actualización incluye **Avisos + Feed + comentarios y reacciones + moderación + apodo y foto**. Haz los tres pasos **en este orden**. Si subes la web antes que el SQL, saldrá un aviso pidiéndote que lo ejecutes.

### A1. Ejecutar el SQL nuevo
1. Supabase → **SQL Editor → New query**.
2. Pega **todo** el `supabase/schema.sql` nuevo y pulsa **Run**. Puedes repetirlo sin miedo: no borra tus álbumes, alumnos ni respuestas.
3. Saldrá el aviso "Potential issue detected" (por los `drop policy if exists`). Pulsa **Run query**.
4. Resultado esperado: "Success. No rows returned". En **Table Editor** tienen que aparecer, además de las que ya tenías:
   `board_posts`, `board_recipients`, `board_reads`, `feed_posts`, `feed_comments`, `listening_comments`, `reactions`, `moderation_reports`.

### A2. Crear `config.js` en GitHub (solo esta vez)
1. Abre tu repositorio → **Add file → Create new file**.
2. Nombre del archivo: `config.js`
3. Pega esto y cambia **solo lo que va entre comillas**:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_KEY: 'sb_publishable_...'
};
```

   - `SUPABASE_URL`: tu Project URL (Supabase → Settings → General / Data API).
   - `SUPABASE_KEY`: tu **Publishable key** (Settings → API Keys). Son los mismos dos valores que pegaste antes dentro de `index.html`.
   - **Nunca** la Secret key.
4. **Commit changes**.

### A3. Subir el `index.html` nuevo
1. En el repositorio: **Add file → Upload files**. Arrastra el `index.html` nuevo; como se llama igual, sustituye al anterior. Luego **Commit changes**.
2. Espera 1-2 minutos y abre la web con **Ctrl+F5**.

Si ves "Falta el archivo config.js…", revisa que `config.js` esté en la misma carpeta que `index.html` y que la URL y la clave estén bien. Da igual si la URL acaba en barra o en `/rest/v1/`: la web se queda sola con la parte que sirve.

### A4. Prueba rápida (5 minutos, recomendable)
Crea **dos cuentas de alumno de prueba** (puedes usar alias de Gmail: `tucorreo+alumno1@gmail.com`, `tucorreo+alumno2@gmail.com`), apruébalas y comprueba lo siguiente:
- Un aviso enviado solo al alumno 1 **no** lo ve el alumno 2.
- Asigna un álbum solo al alumno 1: el alumno 2 no ve ni el álbum ni sus comentarios.
- Ninguno ve las respuestas del otro.
- Los dos ven el Feed y los comentarios del otro (está pensado así).

Cuando acabes, bórralas en *Authentication → Users*.

---

## B. INSTALACIÓN desde cero (resumen)

1. **Supabase**: crea la organización y el proyecto (Yurimh Music Academy, región Europa). En *Data access* deja marcado *Enable Data API* y marca *Enable RLS on new tables automatically*.
2. **SQL**: ejecuta `supabase/schema.sql` completo en el SQL Editor.
3. **Claves**: crea `config.js` con tu Project URL y tu Publishable key.
4. **GitHub Pages**: repositorio público `yurimh-music-academy` con `index.html` y `config.js`. Después, *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
5. **Authentication** (en Supabase):
   - *URL Configuration*: **Site URL** = `https://yurimh95.github.io/yurimh-music-academy/`, y la misma dirección en *Redirect URLs*.
   - *Sign In / Providers → Email*: decide si activas *Confirm email*. Con pocos alumnos es más cómodo desactivarla, porque igualmente apruebas tú cada cuenta.
6. **Hazte profesor**: regístrate en la web con tu email. Luego busca tu `id` con `select id, email from public.profiles;` y ejecuta:

```sql
update public.profiles
   set role = 'teacher', approved = true
 where id = 'TU-ID'
returning id, display_name, email, role, approved;
```

Un "Success. No rows returned" **no demuestra que haya cambiado nada**. Por eso va el `returning`: comprueba que sale tu fila con `teacher` y `true`.

---

## C. Uso

**Profesor**
- **Inicio**: alumnos activos, cuentas por aprobar, escuchas vencidas, avisos publicados, **denuncias pendientes**, respuestas recientes, últimos avisos y lo último del Feed.
- **Avisos**: *+ Nuevo aviso* → título, mensaje, destinatarios (todos o alumnos concretos) y opción de fijarlo arriba. En cada aviso ves **quién lo ha leído**. Puedes editarlo, fijarlo o borrarlo.
- **Feed**: publicas y comentas como cualquiera, y puedes **borrar cualquier publicación o comentario**.
- **Escucha analítica**: catálogo de álbumes, canciones y playlists. Lo asignas a cada alumno con **su fecha límite y su nota**, y lees sus respuestas. Cada elemento tiene comentarios y reacciones, que ven solo los alumnos que lo tienen asignado.
- **Alumnos**: aprobar cuentas, ver el progreso de cada uno, **cambiarle el nombre** o revocarle el acceso.
- **Perfil**: nombre, apodo, foto y contraseña.

**Alumno**
- Se registra, espera a que lo apruebes y tiene: **Inicio** (lo pendiente y los últimos avisos), **Avisos** (con marca "Nuevo"), **Feed**, **Escucha analítica** (sus deberes, respuestas, comentarios y reacciones, con copiar/compartir/TXT/PNG) y **Perfil**.

**Social**
- **Reacciones**: 👍🏼 ❤️ 😂 😮 😢 😡 en publicaciones, comentarios, avisos y elementos de escucha. Una por emoji y persona; se quita pulsando otra vez.
- **Comentarios en Escucha analítica**: solo los ven el profesor y los alumnos que tienen ese elemento asignado. **Las 6 respuestas siguen siendo privadas**: solo las ve su autor y tú.
- **Moderación**: todo se publica al momento. Cualquiera puede **Denunciar** algo; te aparece en *Inicio → Denuncias pendientes* con el motivo, y tú decides si **Borrar contenido** o **Descartar**. Cada uno puede borrar lo suyo.
- **Identidad**: se muestra el nombre o, si lo ha elegido, el **apodo**. Tú ves siempre los dos, por ejemplo "Lu (Luis)". La **foto de perfil** se recorta y comprime sola en el navegador.
- **Menciones (como en Discord)**: en el Inicio, en los avisos y en los comentarios, escribe **@** y sale la lista de personas; escribe **#** y salen las secciones (#Ajustes, #Avisos…) y las escuchas. Eliges con las flechas + Enter, o tocando. Se ven resaltadas en azul y al pulsarlas llevan al perfil, a la sección o a la escucha. A quien mencionas le llega una notificación (campanita y móvil). Si mencionas una escucha o una sección que alguien no tiene (por ejemplo #Alumnos), a esa persona le sale como texto normal, sin enlace. En un aviso, la mención solo avisa si el aviso va dirigido a esa persona.

**Pendiente:** el check "Enviar también por email" de los avisos sigue desactivado. Necesita un servicio de correo externo y lo montamos cuando quieras.

## Notas importantes

- **Qué ven los alumnos entre sí**: nombre o apodo, foto, publicaciones del Feed y sus comentarios, y comentarios y reacciones de las escuchas que comparten. **Nunca** ven el email, las respuestas, las notas ni las fechas de los demás, ni los avisos que no van para ellos. Lo garantiza la base de datos, no solo la web.
- **Menores y RGPD**: con alumnos menores, informa a las familias de que hay un Feed visible para el resto de alumnos y de que pueden subir foto. Pide solo los datos necesarios.
- **Sin límite anti-spam**: con un grupo pequeño no hace falta. Si alguien abusa, revócale el acceso en *Alumnos*.
- **Borrar a alguien**: *Authentication → Users → borrar*. Su perfil, respuestas, publicaciones, comentarios y reacciones se eliminan en cascada.
- **Copia de seguridad**: en *Table Editor* puedes exportar cada tabla a CSV.
- **Plan gratuito**: un proyecto que pasa tiempo sin actividad puede pausarse. Si la web no carga, mira el panel de Supabase.
- **El navegador guarda** solo la sesión de login.
