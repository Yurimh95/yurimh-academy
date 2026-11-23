# Yurimh Academy · contexto para Claude

Web app para organizar las clases de guitarra de Yuri. Este archivo resume lo que se habló y decidió en la conversación anterior en claude.ai, donde se construyó todo hasta ahora. Léelo entero antes de tocar nada.

## ⚠️ PASO 0: léelo primero

Yuri **nunca ha usado GitHub, git ni la terminal**, y lo ha pedido expresamente: que lo hagas **tú todo**. Háblale sin lenguaje técnico, muy paso a paso, y pídele solo lo imprescindible: un clic en el navegador, dar permiso, etc. Usa Windows y abre Claude Code desde la app de escritorio (pestaña Code).

Esta carpeta la ha descomprimido él de un zip y **todavía no está conectada a GitHub** (no es un repositorio git). Antes de nada:

1. Comprueba si están `git` y `gh` (GitHub CLI). Si faltan, instálalos tú (`winget install --id Git.Git -e` y `winget install --id GitHub.cli -e`). Avisa a Yuri de que Windows puede pedirle permiso.
2. Inicia sesión en GitHub con `gh auth login --web --git-protocol https`. Explícale que se abrirá el navegador, que tiene que pegar un código de 8 letras que le enseñarás y pulsar "Authorize". Después ejecuta `gh auth setup-git`.
3. Conecta esta carpeta con su repositorio `Yurimh95/yurimh-academy` **sin perder estos archivos**. Por ejemplo, clona el repo a una carpeta temporal y saca `SUPABASE_URL` y `SUPABASE_KEY` del `index.html` antiguo de esa copia: están pegados ahí. Luego mueve aquí la carpeta `.git` de la copia (o haz `git init`, añade `origin` y `git fetch` + `git reset --soft origin/main`). Comprueba con `git status` que los únicos cambios son los esperados.
4. Instala el plugin oficial de Supabase (`supabase@claude-plugins-official`, del marketplace `anthropics/claude-plugins-official`) y autentícalo. Si en la app de escritorio no puedes hacerlo tú, dile a Yuri exactamente dónde pulsar. Limítalo a su proyecto (`project_ref`).
5. Sigue con "Primera tarea de esta sesión", en el apartado "Estado actual".

## Sobre el usuario

- **Yuri** (GitHub: `Yurimh95`). Profesor de guitarra (es su principal fuente de ingresos), compositor y productor de BSO en Cubase, creador de contenido y game developer indie en Unity.
- **Idioma**: castellano de España, también en commits, comentarios visibles y textos de la interfaz. Los nombres de código, tablas y variables van en inglés.
- **Tono**: directo, sin rodeos ni adulaciones, como un colega que le respeta. Emojis solo para separar bloques o listas.
- **Nivel**: código intermedio y autodidacta. Es nuevo en Supabase y GitHub, así que explícale los pasos de panel con detalle y no le des nada por hecho.
- **Orden**: le gusta entender lo que hace y tener nombres organizados. Nunca le digas "pon cualquier cosa".
- **Dudas**: si algo es ambiguo, pregúntale con preguntas tipo test de opción múltiple (AskUserQuestion) antes de construir.
- **Proactividad**: propón mejoras, alternativas y riesgos que no haya preguntado. Si algo no le gusta, ofrece una alternativa distinta en vez de repetir la misma.
- **Cambios de código**: cuando le enseñes código, di de qué archivo y función sale. Si un cambio es pequeño, puedes darlo suelto; si es grande, da la función completa.

## Qué es la app

- **Web**: https://yurimh95.github.io/yurimh-academy/ (GitHub Pages, repo público `yurimh-academy`, rama `main`, raíz).
- **Backend**: Supabase. Proyecto `yurimh-academy` en la organización "Yurimh Academy", región Europa, plan gratuito. Usa Auth con email y contraseña, Postgres con Row Level Security y supabase-js v2 cargado desde jsDelivr.
- **Usuarios**: alumnos de guitarra, **mezcla de adultos y menores**. La privacidad entre alumnos es un requisito fuerte. Hay un único profesor: Yuri.
- **Registro**: libre. Toda cuenta nueva nace como `student` y sin aprobar, y el profesor la aprueba. El rol `teacher` solo se asigna por SQL.

## Archivos del repo

| Archivo | Qué es |
|---|---|
| `index.html` | **Toda la app** en un único archivo: HTML, CSS y JS vanilla, unas 1.700 líneas, sin build ni frameworks. |
| `config.js` | `window.APP_CONFIG = { SUPABASE_URL, SUPABASE_KEY }`. La URL del proyecto y la **Publishable key** (la antigua "anon"). Es pública por diseño. **Nunca** pongas la Secret key ni la service_role en el repo. |
| `supabase/schema.sql` | Esquema completo y **idempotente** (`if not exists`, `drop policy if exists`, `create or replace`). Se ejecuta entero en el SQL Editor o por MCP. Si vuelves a ejecutarlo, no borra datos. |
| `GUIA.md` | Guía de instalación y uso para Yuri, en castellano. Mantenla al día cuando cambie algo que él tenga que hacer o saber. |
| `tests/` | Pruebas Playwright contra un Supabase simulado. Mira el apartado "Pruebas". |
| `CLAUDE.md` | Este archivo. |

## Estado actual (importante)

- **Actualización 2026-11-22**: PASO 0 y la primera tarea ya están hechos. La carpeta está conectada al repo, `config.js` relleno y el plugin de Supabase instalado, con un `.mcp.json` limitado a `project_ref=gyzwevayeloishhldumd`. Usa ese servidor (`supabase`), no `plugin:supabase:supabase`. El `schema.sql` (v2) ya está ejecutado en producción, con el ajuste de `revoke execute` en las funciones, y verificado con `get_advisors` y una simulación de RLS. La prueba A4 está superada: Yuri la hizo con dos cuentas de alumno y se verificó también con una simulación de RLS. Además se corrigió el 404 del enlace de confirmación: `signUp` ahora pasa `emailRedirectTo`. Siguiente paso: el punto 2 de "Pendiente o futuro". gh está en `D:\Usuarios\Programas\GitHub CLI\gh.exe`, y Yuri no quiere instalar nada en C:.
- **Ojo con el MCP**: `apply_migration` y `execute_sql` **rechazan solos** cualquier SQL con `drop` (piden una confirmación que la app de escritorio no muestra). No lo esquives: dale el SQL a Yuri en el portapapeles (`Set-Clipboard`) para que lo pegue en SQL Editor → Run. El SQL sin `drop` sí pasa.
- **Copias de seguridad**: van en `backups/`, que está en `.gitignore` porque el repo es público.
- **(Histórico) Lo que estaba en producción**: la primera versión. Login, aprobación de alumnos y Escucha analítica con las tablas `profiles`, `listening_items` y `listening_assignments`. Las claves de Supabase están **pegadas dentro del `index.html` que hay ahora en GitHub**, porque esa versión no usaba `config.js`.
- **Lo que está entregado pero NO instalado**: la versión nueva (el `index.html` y `supabase.sql` de esta carpeta), que añade Avisos, Inicio, Perfil, Feed, comentarios, reacciones y moderación.
- **Primera tarea de esta sesión**: instalar esa versión (GUIA.md, apartado A). Pasos:
  1. **Antes de sustituir nada**, saca `SUPABASE_URL` y `SUPABASE_KEY` del `index.html` antiguo. Si ya se ha sobrescrito en la carpeta, sigue en git: `git show HEAD:index.html` (o un commit anterior si ya se hizo commit), y crea `config.js` con esos valores. `cleanUrl()` deja solo el origen, pero guarda el valor limpio, por ejemplo `https://xxxx.supabase.co`.
  2. Ejecuta el `supabase.sql` completo contra el proyecto (Supabase MCP, `execute_sql` o `apply_migration`), con aprobación de Yuri. Comprueba que aparecen `board_*`, `feed_*`, `listening_comments`, `reactions` y `moderation_reports`.
  3. Pasa `get_advisors` (security) y revisa lo que salga.
  4. Mueve `supabase.sql` a `supabase/schema.sql`. Haz commit y push de `index.html`, `config.js`, `GUIA.md`, `CLAUDE.md`, `supabase/` y `tests/`.
  5. Pide a Yuri que haga la prueba A4 de la guía: dos cuentas de alumno de prueba para comprobar la privacidad.
- **Validación hecha hasta ahora**: el SQL se ha comprobado con pglast (solo sintaxis) y la app con 116 pruebas sobre el Supabase simulado. **Nada de la versión nueva se ha ejecutado aún contra el Supabase real.**

## Convenciones de nombres

- La app se llama **Yurimh Academy** (constante `APP_NAME`). Cada módulo tiene su constante de nombre visible, por ejemplo `MODULE_LISTENING = 'Escucha analítica'`.
- **Tablas**: lo común va sin prefijo (`profiles`, `reactions`, `moderation_reports`). Cada módulo lleva su prefijo: `listening_*` (Escucha analítica), `board_*` (Avisos), `feed_*` (Feed). Los módulos futuros serán `chat_*`, `payments_*` y `homework_*`. Todo en inglés y `snake_case`.
- **Políticas**: `<tabla>_<acción>[_<rol>]`. **Triggers**: `<tabla>_<algo>_trg`.
- **Interfaz**: un menú superior con una pestaña por módulo (Inicio, Avisos, Feed, Escucha analítica, Alumnos solo para el profesor, Perfil).

## Arquitectura de `index.html`

- Primero carga `config.js` y luego el script principal. `configured` detecta si falta la configuración y muestra un aviso.
- **Estado**: un objeto global `S`. `S.section` decide qué pinta `render()`. `header()` incluye la navegación con contadores.
- **Vistas**: funciones que devuelven template literals: `homeStudent`/`homeTeacher`, `boardStudent`/`boardTeacher`, `feedView`, `studentListening`, `teacherCatalog`, `teacherStudents`, `profileView`. Los modales son `studentModal`, `itemModal`, `postModal`, `postFormModal`, `feedPostModal`, `studentDetailModal` y `closeModal()`.
- **Eventos**: delegados. Un clic en `[data-action=X]` llama a `actions[X](el)`, y los `submit` van por id de formulario (`authForm`, `recForm`, `feedForm`, `nameForm`, `passForm`, `postForm`, `itemForm`). **Después de cambiar datos hay que llamar a `render()`**; olvidarlo ya causó un bug.
- **Carga de datos**: `loadData()` tiene una rama para el profesor y otra para el alumno. `loadDirectory()` llama a la RPC `get_directory`, que da nombre público, avatar y rol de los demás.
- **Helpers de seguridad**: `esc()` para **todo** el texto de usuario que va a HTML, `linkify()`, `safeAvatar()` (solo acepta `data:image/jpeg;base64` y rechaza `javascript:` y similares) y `cleanUrl()`.
- **Social**: `rxBar`/`updateRx` (reacciones), `commentsBlock`/`updateComments`, `linkCard` (tarjeta de enlace a Spotify o YouTube), `reportRow` (denuncias).
- **Constantes**:
  - `QUESTIONS`: las 6 preguntas de la escucha analítica. Sus claves son `highlights`, `likes`, `dislikes`, `learned`, `would_use` y `would_never_use`.
  - `KIND`: `album`, `song` y `playlist`.
  - `REACTIONS`: un set fijo de 6, que son 👍🏼 ❤️ 😂 😮 😢 😡.
  - `TARGET_TABLE` / `TARGET_LABEL`: los tipos de contenido a los que se puede reaccionar o denunciar.
- **Exportar respuestas** (alumno): copiar para WhatsApp, compartir nativo, TXT y PNG.
- **Diseño (v3, 2026-11-22)**: usa los colores de la marca personal de Yuri: azul eléctrico `#2f86ff`, cian neón `#3ff0ff` y fondo azul marino `#050b1c`, sacados de su app "Lista de Deseos". Hay **dos temas**, `html[data-theme="dark"|"light"]`, con las mismas variables (`--bg`, `--panel`, `--panel2`, `--field`, `--line`, `--text`, `--strong`, `--muted`, `--faint`, `--accent`, `--neon`, `--violet`, `--ok`, `--warn`, `--bad`, más sus `-rgb`, y `--glow`). **No metas colores fijos en el CSS**: usa siempre las variables, o el modo claro se rompe. El neón solo va en acentos: la sección activa, los botones principales y el aro del profesor.
  - **Secciones (2026-11-23)**: el id `feed` es el **Inicio** (etiqueta "Inicio", icono de la casa) y es lo primero que se ve al entrar. Para el alumno lleva encima el bloque compacto `forYou()` (aviso sin leer y próxima escucha). El antiguo panel del profesor es la sección `mod`, **"Moderación"**: solo para el profesor, al final del menú, con el contador de denuncias. Ya no existe la sección `home`.
  - **Navegación estilo app**: `sidebar()` (menú lateral `.nav`), `topbar()`, `tabbar()` (barra inferior en móvil de 760px o menos) y `railView()` (columna derecha de 1180px o más, oculta en Inicio). Las secciones se definen en `sections()`. Los iconos son un sprite SVG en `<body>` y se usan con `ic('nombre')`; cada sección usa el icono con su mismo id.
  - Botones: `.btn` es secundario (tintado); `.btn.primary` y `.btn[type=submit]` son sólidos con glow.
  - El logo es `logo.png`, en la raíz del repo; se usa en el menú, el login y el favicon.
  - **Foto de perfil**: `processAvatar` abre un modal de encuadre (arrastrar, deslizador y rueda) y `cropSave` genera un JPEG de 160×160 (`avatar`). Además guarda `avatar_src`, una copia de la original de 640 px como máximo y 120.000 caracteres, y `avatar_crop` (`{x, y, zoom}` relativos), para que "Editar encuadre" (`editAvatar`) no obligue a resubirla. `avatar_src` solo la leen su dueño y el profesor; `get_directory` no la expone, y la lista de alumnos del profesor pide columnas concretas para no traerla. **Si añades campos a `profiles`, añádelos a ese `select`.**
- **Tiempo real (2026-11-22)**: ya no hay botón Actualizar. `rtStart()` se suscribe a un canal con `postgres_changes` de las tablas de `RT_TABLES`, que están en la publicación `supabase_realtime` (en `schema.sql`), y `rtHandle()` aplica cada cambio.
  - **Feed**: los posts de otros van a `S.feedQueue` y se muestran con el botón "↑ N publicaciones nuevas" (`newPill`/`show-new`).
  - **Reacciones y comentarios**: se actualizan en su sitio (`updateRx`/`updateComments`).
  - **El resto**: llama a `softRender()`, que no repinta si hay un modal abierto o texto a medias. En ese caso solo refresca el menú, la barra inferior y la columna derecha (`refreshChrome`) y repinta al cerrar el modal.
  - **Duplicados**: los añadidos locales usan `addUnique` para no duplicar el eco.
  - **Alumno**: algunos cambios llegan incompletos y la app pide lo que falta, como `board_recipients` → el aviso, o `listening_assignments` → el elemento.
  - **Reconexión**: al reconectar, o al volver a la pestaña tras más de 1 minuto, `rtResync()` recarga en silencio.
  - Realtime respeta RLS en INSERT/UPDATE; los DELETE llegan a todos, pero solo con la clave primaria.
- **Fase 2 (2026-11-23, publicada)**:
  - **Perfiles**: `bio`, `instrument`, `level`, `favorites`, `learning` y `gear` son públicos; se ven con `get_profile()` desde `profileModal`, y los nombres y fotos son pulsables con `whoLink`. `birth_date` y `family_dm_ok` son privados: los ven el alumno y el profesor, y solo el profesor los cambia (`profiles_guard`). La fecha se pide al registrarse (metadato `birth_date`, que guarda `handle_new_user`). Sin fecha, la persona cuenta como menor.
  - **Mensajes** (`dm_messages`, `user_blocks`, sección `messages`): `can_dm(a,b)` deja hablar siempre con el profesor; entre alumnos, ambos deben pasar `dm_ok` (adulto o con permiso familiar) y no estar bloqueados. El profesor **no** lee conversaciones ajenas, salvo los mensajes denunciados (`target_type 'dm_message'`). Los bloqueos solo los ve quien bloquea.
  - **Notificaciones** (`notifications`): las crean los triggers `notify_trg`/`notify()` y se ven en la campanita (`notifsModal`). La columna `pushed_at` marca las ya enviadas por push.
  - **Push (funciona, probado en Android 2026-11-23)**: VAPID (pública en `config.js` y en la función; privada solo como secret `VAPID_PRIVATE_KEY`). `push_subscriptions` + rpc `save_push_subscription`. Trigger `notifications_push_trg` → pg_net → Edge Function `send-push` (`verify_jwt false`, reclama con `pushed_at`). **service_role no tiene permisos por defecto en este proyecto**: si la función toca otra tabla, dale el `grant` (están en `schema.sql`). Para probar: `insert into notifications (user_id, kind, extra)` y mirar `net._http_response`. Error "push service error" en Android = fallo puntual de Chrome/Google; reintentar suele bastar. El instalador de la PWA está en Ajustes.
  - **Perfil y Ajustes (2026-11-23)**: Perfil es solo lo que ven los demás (nombre, foto, "Sobre ti"). Todo lo de configuración va en la sección `settings` (**Ajustes**, `settingsView`): notificaciones, instalar la app, privacidad (explicación y lista de bloqueados con Desbloquear), seguridad (contraseña) y cuenta (email y cerrar sesión). En el móvil se entra desde el botón ⚙ de Perfil (`.prof-bar`). El tema claro/oscuro **se queda donde está** (menú lateral y botón del móvil), no lo muevas a Ajustes. Si añades una sección, añádela también a la lista blanca de `render()`.
  - **Invitar a instalar (2026-11-23)**: la primera vez que alguien entra sale `installModal()` (en el ordenador, con un QR que carga `qrcode-generator` de jsDelivr al abrirse), y se marca `profiles.install_prompted_at`. Mientras no tenga la app del móvil, la barra superior muestra el botón neón `.installbtn` ("Instalar app"). Al abrir la app instalada en el móvil se marca `profiles.app_installed_at`: el botón desaparece en todos sus dispositivos y sale una vez `appWelcomeModal()` para activar las notificaciones. El profesor ve en la ficha del alumno si tiene la app. Todo está en `installCheck()`. En `seed.js`, s2 no puede actualizar su perfil (el avatar malicioso rompe el check), así que las pruebas de perfil usan s1. Escucha analítica: título y tipo se autorrellenan (`fetchMeta`, `itemUrlChanged`).
  - **Escucha analítica en lista** (`.tracklist`/`.track`), con portada en `listening_items.thumb_url`: se saca del oEmbed público de Spotify o de la miniatura de YouTube (`fetchThumb`). La app del profesor rellena las que faltan (`backfillThumbs`). En pruebas, `APP_CONFIG.NO_EXTERNAL` desactiva las llamadas a internet.
  - **Botón Atrás**: las secciones y los modales se guardan en `history` (`histSync`, `popstate`, `histSkip`).
  - **PWA**: `manifest.webmanifest`, `sw.js` (sin caché), `icon-180/192/512.png` y el panel de instalar en Perfil (`installPanelHtml`).
- **Navegador**: guarda la sesión de Supabase Auth y la preferencia de tema en localStorage (`ya-theme`, con try/catch). Ningún dato de la app va a localStorage.

## Modelo de datos y seguridad (`supabase.sql`)

- **`profiles`**: `display_name`, `nickname`, `avatar`, `email`, `role` (`student`/`teacher`), `approved`. El trigger `handle_new_user` crea el perfil al registrarse. `profiles_guard` impide que un alumno cambie su `role`, su `approved` o su email. El avatar es un JPEG en base64 de como mucho 40.000 caracteres, sin Storage, y la base de datos lo valida con una regex.
- **Funciones**: `is_teacher()` e `is_approved()` son security definer, para evitar recursión en RLS. `get_directory()` también es security definer y expone **solo** `id`, nombre público, avatar y rol de los usuarios aprobados. `can_see_target()` es invoker.
- **Escucha analítica**:
  - `listening_items` es el catálogo.
  - `listening_assignments` tiene una fila por alumno y elemento, con `due_date` y `note` individuales, `listened` y `answers` (jsonb).
  - El trigger guard impide que el alumno toque la nota, la fecha, el elemento o el alumno asignado.
  - `listening_comments` solo la ven el profesor y los alumnos que tienen ese elemento asignado.
- **Avisos**: `board_posts` (con `pinned`), `board_recipients` (si un aviso no tiene destinatarios, es para todos) y `board_reads` (confirmaciones de lectura).
- **Feed**: `feed_posts` y `feed_comments`. Lo ven todos los aprobados, cada uno borra lo suyo y el profesor borra cualquier cosa.
- **`reactions`**: polimórfica (`target_type`, `target_id`, `emoji`). Una por emoji y persona.
- **`moderation_reports`**: cualquiera denuncia lo que puede ver. Solo el profesor las lee y las resuelve.
- **`cleanup_target_links()`**: tiene 5 triggers que borran las reacciones y denuncias huérfanas cuando se elimina el contenido.
- **Privacidad que hay que mantener siempre**: un alumno **nunca** ve el email, las respuestas, las notas, las fechas, los avisos dirigidos a otros, ni los comentarios o reacciones de escuchas que no tiene asignadas. Sí ve el nombre o apodo, la foto, el Feed y los comentarios de las escuchas que comparte.

## Decisiones tomadas (no las reabras sin preguntar)

- Moderación: todo **se publica al momento** y el profesor puede borrar. No hay cola de aprobación.
- Identidad: se muestra el nombre o, si el alumno lo ha elegido, el apodo. El profesor ve los dos, por ejemplo "Lu (Luis)". Hay foto de perfil.
- Comentarios en Escucha analítica: solo para quienes tienen el elemento asignado. Las 6 respuestas son privadas.
- Escuchas vencidas: solo se marcan como vencidas; no se bloquean.
- No hay límite anti-spam, porque el grupo es pequeño.

## Pendiente o futuro (en este orden aproximado)

1. **Instalar la versión actual**: mira "Estado actual".
2. **Avisos por email: aparcado** (Yuri, 2026-11-23). Le bastan las notificaciones push y no quiere abrir cuentas en otros servicios ni ser invasivo. El check se ha quitado de la interfaz (queda un comentario en `postFormModal`). Si algún día lo pide: Resend + Edge Function.
3. **Chat general** entre alumnos (`chat_*`, Supabase Realtime). Moderación como en el Feed.
4. **Pagos**: quién ha pagado cada mes (`payments_*`).
5. **Deberes semanales** (`homework_*`).
6. **RGPD y menores**: recordar a Yuri que informe a las familias. Pedir solo los datos necesarios.

No empieces un módulo nuevo sin confirmar el alcance con Yuri mediante preguntas tipo test.

## Pruebas

```
cd tests && npm install && npx playwright install chromium && npm test
```

- Yuri no quiere nada instalado en C:. **No uses `npx playwright install`** (descarga Chromium en C:). Instala con `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` y lanza las pruebas con su Chrome: `CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npm test`. En la última ejecución pasaron 184 comprobaciones (`test-fase2.js` usa `window.__DB_OVERRIDE` para continuar con el estado de otra sesión). `test-realtime.js` simula cambios de otras personas con `window.__rtExternal(tabla, fila)`, `__rtExternalUpdate` y `__rtExternalDelete`. El falso Supabase emite eventos imitando RLS.
- Para verlo en el navegador integrado: `.claude/launch.json` → "pruebas" sirve `tests/` con un servidor estático; `test.html?me=s1` (alumna) o `?me=t1` (profesor) simula la sesión. El servidor está en el scratchpad de la sesión: si no existe, vuelve a crearlo.
- `build-test.js` genera `tests/test.html` a partir de `../index.html`, sustituyendo supabase-js y `config.js` por `seed.js`, `fake-supabase.js` y `config.test.js`.
- `test-core.js` tiene 48 comprobaciones y `test-social.js` tiene 68. Las capturas se guardan en `tests/shots/`. **Mira las capturas** después de cambiar la interfaz.
- `fake-supabase.js` imita las RLS a mano. **Si cambias el esquema o las políticas, actualízalo**, porque si no los tests mienten.
- En `seed.js`, el usuario s2 tiene a propósito el avatar malicioso `javascript:alert(1)`, para comprobar el XSS.
- La simulación no sustituye a la realidad. Si hay MCP de Supabase, verifica también las políticas contra el proyecto real, por ejemplo con `set local role authenticated` y `request.jwt.claims` dentro de una transacción con rollback, o con cuentas de prueba.

## Reglas de trabajo con Supabase y GitHub

- **Seguridad (decisión de Yuri, 2026-11-23)**: los arreglos de seguridad y privacidad **no destructivos** (permisos, RLS, endurecer funciones) se aplican sin preguntar y después se le explican. Ejemplo: `can_dm` solo responde a los implicados y `dm_ok` no se puede ejecutar desde fuera, para que nadie deduzca quién es menor.
- **Producción con datos reales de menores**. Enseña el SQL antes de ejecutarlo y pide aprobación. Nada destructivo (`drop`, `delete`, `truncate`, cambios de tipo) sin avisar explícitamente. Si hace falta, propón primero una copia de seguridad: exportar a CSV o hacer un `select` previo.
- Limita el conector MCP de Supabase al proyecto (`project_ref`). Las políticas y los cambios de esquema van **siempre** también en `supabase/schema.sql`, que debe seguir siendo idempotente.
- Ajustes del panel que quizá no estén en el MCP: Authentication → URL Configuration (Site URL y Redirect URLs = la URL de la web). Si no puedes hacerlo tú, explícale a Yuri dónde pulsar, paso a paso.
- **Commits**: en castellano, pequeños y descriptivos. Haz push a `main`; Pages publica en 1-2 minutos y después hay que recargar con Ctrl+F5.
- Problemas que ya pasaron y conviene recordar:
  - Una URL con ruta extra dio "Invalid path specified in request URL"; de ahí sale `cleanUrl()`.
  - El enlace de confirmación del email daba 404 mientras la Site URL no estaba bien.
  - Un `update ... where email=` devolvió "No rows returned" sin cambiar nada. Usa `where id = ...` con `returning`.
