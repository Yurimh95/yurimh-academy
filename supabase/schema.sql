-- =====================================================================
--  YURIMH ACADEMY · Esquema de base de datos para Supabase
--  Pégalo entero en: Supabase > SQL Editor > New query > Run
--  Es seguro volver a ejecutarlo (usa "if not exists" / "drop ... if exists").
--
--  CONVENCIÓN DE NOMBRES (para cuando la app crezca)
--   · Núcleo común a toda la app: sin prefijo.   Ej: profiles
--   · Cada módulo lleva su prefijo:               Ej: listening_items,
--                                                     listening_assignments,
--                                                     board_posts (avisos),
--                                                     feed_posts, feed_comments,
--                                                     payments_..., homework_...
--   · Nombres en inglés y minúsculas con guion bajo (snake_case).
--   · Funciones de permisos compartidas (is_teacher, is_approved) sin prefijo;
--     las propias de un módulo con su prefijo.
-- =====================================================================

-- =====================================================================
--  NÚCLEO: perfiles y permisos
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES (uno por cuenta de usuario)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email        text,
  role         text not null default 'student' check (role in ('student', 'teacher')),
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Identidad pública (la ven los demás alumnos): apodo opcional y foto pequeña.
-- La foto se guarda ya reducida (160x160, unos pocos KB) como imagen en base64,
-- así no hace falta configurar Storage. El nombre real solo lo ve el profesor.
alter table public.profiles add column if not exists nickname text
  check (nickname is null or char_length(nickname) <= 30);
alter table public.profiles add column if not exists avatar text
  check (avatar is null or (char_length(avatar) <= 40000
         and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));

-- Cuando alguien se registra, se crea su perfil automáticamente.
-- SIEMPRE como alumno y SIN aprobar: nadie puede darse permisos a sí mismo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE PERMISOS (las usarán todos los módulos)
--    (security definer = leen "profiles" sin pasar por sus propias reglas,
--     así evitamos recursión infinita en las políticas)
-- ---------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher' and approved
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and approved
  );
$$;

-- =====================================================================
--  MÓDULO: ESCUCHA ANALÍTICA  (prefijo listening_)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3. CATÁLOGO (álbumes, canciones, playlists)
-- ---------------------------------------------------------------------
create table if not exists public.listening_items (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 200),
  url        text not null check (url ~* '^https?://'),
  kind       text not null check (kind in ('album', 'song', 'playlist')),
  brief      text check (char_length(brief) <= 2000),   -- consigna general
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. ASIGNACIONES (elemento <-> alumno) + progreso y respuestas
--    Una fila = "este alumno tiene este elemento asignado".
--    answers (jsonb) guarda las 6 preguntas con estas claves:
--      highlights, likes, dislikes, learned, would_use, would_never_use
-- ---------------------------------------------------------------------
create table if not exists public.listening_assignments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.listening_items(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  note        text check (char_length(note) <= 2000),   -- nota individual del profesor
  due_date    date,                                     -- fecha límite individual
  assigned_at timestamptz not null default now(),
  listened    boolean not null default false,
  listened_at timestamptz,
  answers     jsonb not null default '{}'::jsonb check (octet_length(answers::text) <= 40000),
  updated_at  timestamptz not null default now(),
  unique (item_id, student_id)
);

create index if not exists listening_assignments_student_idx on public.listening_assignments (student_id);
create index if not exists listening_assignments_item_idx    on public.listening_assignments (item_id);

-- Un alumno solo puede tocar: listened, listened_at y answers.
-- Fecha límite, nota, elemento y alumno solo los cambia el profesor.
create or replace function public.listening_assignments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_teacher() then
    if new.item_id     is distinct from old.item_id
    or new.student_id  is distinct from old.student_id
    or new.note        is distinct from old.note
    or new.due_date    is distinct from old.due_date
    or new.assigned_at is distinct from old.assigned_at then
      raise exception 'Solo el profesor puede modificar esos campos';
    end if;
  end if;
  -- updated_at solo cambia cuando el ALUMNO toca su progreso (respuestas o check),
  -- no cuando el profesor edita fecha o nota. Así "respuestas recientes" es fiable.
  if new.answers is distinct from old.answers or new.listened is distinct from old.listened then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists listening_assignments_guard_trg on public.listening_assignments;
create trigger listening_assignments_guard_trg
  before update on public.listening_assignments
  for each row execute function public.listening_assignments_guard();

-- =====================================================================
--  PERMISOS DE TABLA + SEGURIDAD POR FILA (RLS)
--  Al añadir un módulo nuevo: crea sus tablas, añádelas a estas líneas
--  y escribe sus políticas siguiendo el patrón de abajo.
-- =====================================================================
grant usage on schema public to anon, authenticated;
revoke all on public.profiles, public.listening_items, public.listening_assignments from anon;
grant select, insert, update, delete on public.profiles, public.listening_items, public.listening_assignments to authenticated;

alter table public.profiles               enable row level security;
alter table public.listening_items        enable row level security;
alter table public.listening_assignments  enable row level security;

-- ---- profiles ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_teacher());

drop policy if exists profiles_update_teacher on public.profiles;
create policy profiles_update_teacher on public.profiles
  for update to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

-- (sin políticas de insert/delete: los perfiles se crean por el trigger
--  y se borran en cascada al eliminar el usuario desde el panel de Supabase)

-- ---- listening_items ----
drop policy if exists listening_items_teacher_all on public.listening_items;
create policy listening_items_teacher_all on public.listening_items
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

drop policy if exists listening_items_student_select on public.listening_items;
create policy listening_items_student_select on public.listening_items
  for select to authenticated
  using (
    public.is_approved()
    and exists (
      select 1 from public.listening_assignments a
      where a.item_id = listening_items.id and a.student_id = auth.uid()
    )
  );

-- ---- listening_assignments ----
drop policy if exists listening_assignments_select on public.listening_assignments;
create policy listening_assignments_select on public.listening_assignments
  for select to authenticated
  using (public.is_teacher() or (student_id = auth.uid() and public.is_approved()));

drop policy if exists listening_assignments_insert on public.listening_assignments;
create policy listening_assignments_insert on public.listening_assignments
  for insert to authenticated
  with check (public.is_teacher());

drop policy if exists listening_assignments_delete on public.listening_assignments;
create policy listening_assignments_delete on public.listening_assignments
  for delete to authenticated
  using (public.is_teacher());

drop policy if exists listening_assignments_update on public.listening_assignments;
create policy listening_assignments_update on public.listening_assignments
  for update to authenticated
  using      (public.is_teacher() or (student_id = auth.uid() and public.is_approved()))
  with check (public.is_teacher() or (student_id = auth.uid() and public.is_approved()));

-- =====================================================================
--  NÚCLEO (ampliación): cada persona puede editar su propio nombre
--  Un alumno NO puede cambiar su rol, su aprobación ni su id.
-- =====================================================================
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() es null cuando ejecutas SQL a mano en el panel: ahí se permite todo.
  if auth.uid() is not null and not public.is_teacher() then
    if new.id       is distinct from old.id
    or new.role     is distinct from old.role
    or new.approved is distinct from old.approved
    or new.email    is distinct from old.email then
      raise exception 'Solo el profesor puede modificar esos campos';
    end if;
  end if;
  new.display_name = trim(new.display_name);
  new.nickname = nullif(trim(coalesce(new.nickname, '')), '');
  if char_length(new.display_name) not between 1 and 60 then
    raise exception 'El nombre debe tener entre 1 y 60 caracteres';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =====================================================================
--  MÓDULO: TABLÓN DE AVISOS  (prefijo board_)
--   board_posts       el aviso (lo escribe solo el profesor)
--   board_recipients  a quién va, SOLO cuando audience = 'selected'
--   board_reads       quién lo ha leído (lo marca cada alumno)
-- =====================================================================
create table if not exists public.board_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 150),
  body       text not null check (char_length(body) between 1 and 5000),
  audience   text not null default 'all' check (audience in ('all', 'selected')),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);

create table if not exists public.board_recipients (
  post_id    uuid not null references public.board_posts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, student_id)
);
create index if not exists board_recipients_student_idx on public.board_recipients (student_id);

create table if not exists public.board_reads (
  post_id    uuid not null references public.board_posts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (post_id, student_id)
);
create index if not exists board_reads_student_idx on public.board_reads (student_id);

create or replace function public.board_posts_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists board_posts_touch_trg on public.board_posts;
create trigger board_posts_touch_trg
  before update on public.board_posts
  for each row execute function public.board_posts_touch();

grant select, insert, update, delete on public.board_posts, public.board_recipients, public.board_reads to authenticated;
revoke all on public.board_posts, public.board_recipients, public.board_reads from anon;

alter table public.board_posts      enable row level security;
alter table public.board_recipients enable row level security;
alter table public.board_reads      enable row level security;

-- ---- board_posts: el profesor lo gestiona; el alumno ve los de "todos" y los suyos ----
drop policy if exists board_posts_teacher_all on public.board_posts;
create policy board_posts_teacher_all on public.board_posts
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

drop policy if exists board_posts_student_select on public.board_posts;
create policy board_posts_student_select on public.board_posts
  for select to authenticated
  using (
    public.is_approved()
    and (
      audience = 'all'
      or exists (
        select 1 from public.board_recipients r
        where r.post_id = board_posts.id and r.student_id = auth.uid()
      )
    )
  );

-- ---- board_recipients: el profesor lo gestiona; el alumno solo ve sus filas ----
drop policy if exists board_recipients_teacher_all on public.board_recipients;
create policy board_recipients_teacher_all on public.board_recipients
  for all to authenticated
  using (public.is_teacher())
  with check (public.is_teacher());

drop policy if exists board_recipients_student_select on public.board_recipients;
create policy board_recipients_student_select on public.board_recipients
  for select to authenticated
  using (student_id = auth.uid() and public.is_approved());

-- ---- board_reads: el profesor las ve todas; el alumno solo marca y ve las suyas ----
drop policy if exists board_reads_teacher_select on public.board_reads;
create policy board_reads_teacher_select on public.board_reads
  for select to authenticated
  using (public.is_teacher());

drop policy if exists board_reads_student_select on public.board_reads;
create policy board_reads_student_select on public.board_reads
  for select to authenticated
  using (student_id = auth.uid());

-- El alumno solo puede marcar como leído un aviso que ya puede ver
-- (la subconsulta a board_posts pasa por las reglas de arriba).
drop policy if exists board_reads_student_insert on public.board_reads;
create policy board_reads_student_insert on public.board_reads
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.is_approved()
    and exists (select 1 from public.board_posts p where p.id = post_id)
  );

-- =====================================================================
--  NÚCLEO (ampliación): directorio de nombres visibles entre alumnos
--  Los alumnos NO pueden leer la tabla profiles de los demás (tiene emails
--  y nombres reales). Esta función devuelve SOLO lo público: id, apodo o
--  nombre, foto y rol de las personas aprobadas, y solo a usuarios aprobados.
-- =====================================================================
create or replace function public.get_directory()
returns table (id uuid, public_name text, avatar text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(trim(p.nickname), ''), p.display_name),
         p.avatar,
         p.role
  from public.profiles p
  where p.approved and public.is_approved();
$$;

revoke all on function public.get_directory() from public, anon;
grant execute on function public.get_directory() to authenticated;

-- =====================================================================
--  MÓDULO: FEED  (prefijo feed_)  — publicaciones de los alumnos
-- =====================================================================
create table if not exists public.feed_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  link_url   text check (link_url is null or (char_length(link_url) <= 500 and link_url ~* '^https?://')),
  created_at timestamptz not null default now()
);
create index if not exists feed_posts_created_idx on public.feed_posts (created_at desc);

create table if not exists public.feed_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.feed_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_post_idx on public.feed_comments (post_id);

-- =====================================================================
--  MÓDULO ESCUCHA ANALÍTICA (ampliación): comentarios por elemento
--  Los ven y escriben solo los alumnos que tienen ese elemento asignado
--  (y el profesor). Las 6 respuestas de las asignaciones siguen privadas.
-- =====================================================================
create table if not exists public.listening_comments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.listening_items(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists listening_comments_item_idx on public.listening_comments (item_id);

-- =====================================================================
--  NÚCLEO (ampliación): REACCIONES y DENUNCIAS (sirven para todos los módulos)
--  target_type indica a qué se reacciona; el emoji se guarda como clave:
--    like = 👍🏼   love = ❤️   laugh = 😂   wow = 😮   sad = 😢   angry = 😡
-- =====================================================================
create table if not exists public.reactions (
  target_type text not null check (target_type in ('board_post', 'feed_post', 'feed_comment', 'listening_comment', 'listening_item')),
  target_id   uuid not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('like', 'love', 'laugh', 'wow', 'sad', 'angry')),
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id, emoji)
);
create index if not exists reactions_target_idx on public.reactions (target_type, target_id);

create table if not exists public.moderation_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('feed_post', 'feed_comment', 'listening_comment')),
  target_id   uuid not null,
  reason      text check (reason is null or char_length(reason) <= 300),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

-- ¿Puede la persona actual ver ese contenido? Se ejecuta con SUS permisos (no es
-- security definer), así que reutiliza las reglas de cada tabla: nadie puede
-- reaccionar a, ni denunciar, algo que no puede ver.
create or replace function public.can_see_target(t text, i uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case t
    when 'board_post'        then exists (select 1 from public.board_posts        where id = i)
    when 'feed_post'         then exists (select 1 from public.feed_posts         where id = i)
    when 'feed_comment'      then exists (select 1 from public.feed_comments      where id = i)
    when 'listening_comment' then exists (select 1 from public.listening_comments where id = i)
    when 'listening_item'    then exists (select 1 from public.listening_items    where id = i)
    else false
  end;
$$;

-- Al borrar un contenido se borran sus reacciones y denuncias (no hay clave ajena
-- porque apuntan a varias tablas). También salta cuando se borra en cascada.
create or replace function public.cleanup_target_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reactions          where target_type = tg_argv[0] and target_id = old.id;
  delete from public.moderation_reports where target_type = tg_argv[0] and target_id = old.id;
  return old;
end;
$$;

drop trigger if exists cleanup_board_posts on public.board_posts;
create trigger cleanup_board_posts after delete on public.board_posts
  for each row execute function public.cleanup_target_links('board_post');
drop trigger if exists cleanup_feed_posts on public.feed_posts;
create trigger cleanup_feed_posts after delete on public.feed_posts
  for each row execute function public.cleanup_target_links('feed_post');
drop trigger if exists cleanup_feed_comments on public.feed_comments;
create trigger cleanup_feed_comments after delete on public.feed_comments
  for each row execute function public.cleanup_target_links('feed_comment');
drop trigger if exists cleanup_listening_comments on public.listening_comments;
create trigger cleanup_listening_comments after delete on public.listening_comments
  for each row execute function public.cleanup_target_links('listening_comment');
drop trigger if exists cleanup_listening_items on public.listening_items;
create trigger cleanup_listening_items after delete on public.listening_items
  for each row execute function public.cleanup_target_links('listening_item');

-- ---------------------------------------------------------------------
--  Permisos de tabla y RLS de estas tablas
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.feed_posts, public.feed_comments, public.listening_comments,
  public.reactions, public.moderation_reports to authenticated;
revoke all on
  public.feed_posts, public.feed_comments, public.listening_comments,
  public.reactions, public.moderation_reports from anon;

alter table public.feed_posts          enable row level security;
alter table public.feed_comments       enable row level security;
alter table public.listening_comments  enable row level security;
alter table public.reactions           enable row level security;
alter table public.moderation_reports  enable row level security;

-- ---- feed_posts: lo ve toda persona aprobada; cada una borra lo suyo; el profesor, todo ----
drop policy if exists feed_posts_select on public.feed_posts;
create policy feed_posts_select on public.feed_posts
  for select to authenticated using (public.is_approved());

drop policy if exists feed_posts_insert on public.feed_posts;
create policy feed_posts_insert on public.feed_posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_approved());

drop policy if exists feed_posts_delete on public.feed_posts;
create policy feed_posts_delete on public.feed_posts
  for delete to authenticated
  using (public.is_teacher() or (author_id = auth.uid() and public.is_approved()));

-- ---- feed_comments ----
drop policy if exists feed_comments_select on public.feed_comments;
create policy feed_comments_select on public.feed_comments
  for select to authenticated using (public.is_approved());

drop policy if exists feed_comments_insert on public.feed_comments;
create policy feed_comments_insert on public.feed_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and public.is_approved()
    and exists (select 1 from public.feed_posts p where p.id = post_id)
  );

drop policy if exists feed_comments_delete on public.feed_comments;
create policy feed_comments_delete on public.feed_comments
  for delete to authenticated
  using (public.is_teacher() or (author_id = auth.uid() and public.is_approved()));

-- ---- listening_comments: solo con el elemento asignado (o profesor) ----
drop policy if exists listening_comments_select on public.listening_comments;
create policy listening_comments_select on public.listening_comments
  for select to authenticated
  using (
    public.is_teacher()
    or (public.is_approved() and exists (
          select 1 from public.listening_assignments a
          where a.item_id = listening_comments.item_id and a.student_id = auth.uid()))
  );

drop policy if exists listening_comments_insert on public.listening_comments;
create policy listening_comments_insert on public.listening_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_teacher()
      or (public.is_approved() and exists (
            select 1 from public.listening_assignments a
            where a.item_id = listening_comments.item_id and a.student_id = auth.uid()))
    )
  );

drop policy if exists listening_comments_delete on public.listening_comments;
create policy listening_comments_delete on public.listening_comments
  for delete to authenticated
  using (public.is_teacher() or (author_id = auth.uid() and public.is_approved()));

-- ---- reactions: ver, poner y quitar las tuyas, solo sobre contenido que puedes ver ----
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions
  for select to authenticated
  using (public.is_approved() and public.can_see_target(target_type, target_id));

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_approved()
    and public.can_see_target(target_type, target_id)
  );

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- moderation_reports: el alumno denuncia y ve las suyas; el profesor gestiona todas ----
drop policy if exists moderation_reports_select on public.moderation_reports;
create policy moderation_reports_select on public.moderation_reports
  for select to authenticated
  using (public.is_teacher() or reporter_id = auth.uid());

drop policy if exists moderation_reports_insert on public.moderation_reports;
create policy moderation_reports_insert on public.moderation_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid() and public.is_approved()
    and public.can_see_target(target_type, target_id)
  );

drop policy if exists moderation_reports_update on public.moderation_reports;
create policy moderation_reports_update on public.moderation_reports
  for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists moderation_reports_delete on public.moderation_reports;
create policy moderation_reports_delete on public.moderation_reports
  for delete to authenticated using (public.is_teacher());

-- =====================================================================
--  PERMISOS DE EJECUCIÓN DE FUNCIONES
--  Supabase deja por defecto que cualquiera (incluso sin sesión) llame a
--  las funciones por la API. Lo cerramos:
--   · Las de trigger no las llama nadie a mano (los triggers funcionan igual).
--   · is_teacher / is_approved: solo usuarios con sesión (las usan las reglas).
--   · get_directory ya está limitada más arriba.
-- =====================================================================
revoke execute on function public.handle_new_user(), public.cleanup_target_links(),
  public.listening_assignments_guard(), public.profiles_guard(), public.board_posts_touch()
  from public, anon, authenticated;
revoke execute on function public.is_teacher(), public.is_approved() from public, anon;
grant  execute on function public.is_teacher(), public.is_approved() to authenticated;

-- =====================================================================
--  FOTO DE PERFIL: copia reducida de la original + posición del encuadre
--  Sirve para reencuadrar sin volver a subir la foto. Solo la ven su dueño
--  y el profesor (reglas de profiles); get_directory NO la expone.
-- =====================================================================
alter table public.profiles add column if not exists avatar_src text
  check (avatar_src is null or (char_length(avatar_src) <= 120000
         and avatar_src ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));
alter table public.profiles add column if not exists avatar_crop jsonb
  check (avatar_crop is null or octet_length(avatar_crop::text) <= 200);

-- =====================================================================
--  TIEMPO REAL (Supabase Realtime)
--  La app recibe al momento los cambios de estas tablas. Realtime aplica
--  las mismas reglas RLS: nadie recibe en directo lo que no podría leer.
--  (Los borrados llegan solo con la clave primaria, sin contenido.)
-- =====================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['feed_posts', 'feed_comments', 'listening_comments', 'reactions',
                           'board_posts', 'board_recipients', 'board_reads', 'listening_items',
                           'listening_assignments', 'profiles', 'moderation_reports'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- TU CUENTA DE PROFESOR
--    Primero REGÍSTRATE en la web con tu email. Después ejecuta esto
--    (cambia el email por el tuyo) para convertirte en profesor:
-- =====================================================================
-- update public.profiles
--    set role = 'teacher', approved = true
--  where email = 'tu@email.com';
