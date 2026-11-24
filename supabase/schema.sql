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
-- Editar publicaciones (2026-11-23): fecha de la última edición; la app muestra "editado"
alter table public.feed_posts add column if not exists edited_at timestamptz;

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

-- Editar: solo quien la escribió (el profesor modera borrando, no cambia las palabras de nadie)
drop policy if exists feed_posts_update on public.feed_posts;
create policy feed_posts_update on public.feed_posts
  for update to authenticated
  using (author_id = auth.uid() and public.is_approved())
  with check (author_id = auth.uid() and public.is_approved());

-- Solo cambian el texto y el enlace; edited_at lo pone la base de datos (no se puede falsear)
create or replace function public.feed_posts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.id := old.id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body or new.link_url is distinct from old.link_url then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.feed_posts_guard() from public, anon, authenticated;
drop trigger if exists feed_posts_guard_trg on public.feed_posts;
create trigger feed_posts_guard_trg before update on public.feed_posts
  for each row execute function public.feed_posts_guard();

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
--  FOTO DE PERFIL EN GRANDE (2026-11-23)
--  avatar_lg: la misma foto recortada (mismo encuadre que avatar), en 640×640,
--  para verla ampliada al pulsarla en un perfil. Nunca enseña nada fuera del
--  recorte (la original sin recortar, avatar_src, sigue siendo privada).
--  Las filas de profiles solo las leen su dueño y el profesor: los demás la
--  piden con get_avatar_large(), que aplica las mismas reglas que get_profile.
-- =====================================================================
alter table public.profiles add column if not exists avatar_lg text
  check (avatar_lg is null or (char_length(avatar_lg) <= 160000
         and avatar_lg ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'));

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
--  FASE 2 · PERFILES COMPLETOS + FECHA DE NACIMIENTO
--  Campos públicos (los ven los compañeros): bio, instrumento, nivel,
--  favoritos, qué está aprendiendo y equipo.
--  Privados (solo el propio alumno y el profesor): fecha de nacimiento y
--  el permiso familiar para mensajes entre alumnos.
-- =====================================================================
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 200);
alter table public.profiles add column if not exists instrument text
  check (instrument is null or instrument in ('electric', 'acoustic', 'classical', 'bass', 'other'));
alter table public.profiles add column if not exists level text
  check (level is null or level in ('beginner', 'intermediate', 'advanced'));
alter table public.profiles add column if not exists favorites text check (favorites is null or char_length(favorites) <= 200);
alter table public.profiles add column if not exists learning text check (learning is null or char_length(learning) <= 200);
alter table public.profiles add column if not exists gear text check (gear is null or char_length(gear) <= 150);
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists family_dm_ok boolean not null default false;

-- Fecha de nacimiento razonable (ni futura ni absurda). Devuelve null si no vale.
create or replace function public.valid_birth_date(d date)
returns date language sql immutable set search_path = '' as $$
  select case when d is not null and d > date '1920-01-01' and d < date '2100-01-01' then d end;
$$;

-- Al registrarse: nombre y fecha de nacimiento vienen del formulario (metadatos de Auth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare bd date;
begin
  begin
    bd := public.valid_birth_date((new.raw_user_meta_data->>'birth_date')::date);
    if bd > current_date then bd := null; end if;
  exception when others then bd := null;
  end;
  insert into public.profiles (id, display_name, email, birth_date)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    bd
  );
  return new;
end;
$$;

-- El alumno no puede tocar su rol, aprobación, email, permiso familiar ni (una vez puesta) su fecha de nacimiento.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_teacher() then
    if new.id           is distinct from old.id
    or new.role         is distinct from old.role
    or new.approved     is distinct from old.approved
    or new.email        is distinct from old.email
    or new.family_dm_ok is distinct from old.family_dm_ok
    or (old.birth_date is not null and new.birth_date is distinct from old.birth_date) then
      raise exception 'Solo el profesor puede modificar esos campos';
    end if;
  end if;
  if new.birth_date is not null and (public.valid_birth_date(new.birth_date) is null or new.birth_date > current_date) then
    raise exception 'Fecha de nacimiento no válida';
  end if;
  new.display_name = trim(new.display_name);
  new.nickname = nullif(trim(coalesce(new.nickname, '')), '');
  new.bio = nullif(trim(coalesce(new.bio, '')), '');
  new.favorites = nullif(trim(coalesce(new.favorites, '')), '');
  new.learning = nullif(trim(coalesce(new.learning, '')), '');
  new.gear = nullif(trim(coalesce(new.gear, '')), '');
  if char_length(new.display_name) not between 1 and 60 then
    raise exception 'El nombre debe tener entre 1 y 60 caracteres';
  end if;
  return new;
end;
$$;

-- ¿Puede esta persona usar mensajes privados con compañeros?
-- Profesor: siempre. Alumno: si es mayor de edad o su familia lo autoriza.
-- Sin fecha de nacimiento cuenta como menor (protección por defecto).
create or replace function public.dm_ok(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.approved
      and (p.role = 'teacher' or p.family_dm_ok
           or (p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')::date))
  );
$$;

-- Escucha analítica: portada del álbum/playlist/canción (Spotify) o miniatura (YouTube).
-- La rellena la app del profesor al crear el elemento; solo se aceptan imágenes de esos servicios.
alter table public.listening_items add column if not exists thumb_url text
  check (thumb_url is null or (char_length(thumb_url) <= 300
         and thumb_url ~ '^https://(i\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com|mosaic\.scdn\.co|i\.ytimg\.com)/'));

-- Escucha analítica: duración total en segundos y número de temas (álbum/playlist).
-- La saca la Edge Function "media-info" al guardar; el profesor puede corregirla a mano.
-- duration_partial = solo se han podido sumar los primeros 100 temas (se muestra con "+").
alter table public.listening_items add column if not exists duration_sec integer
  check (duration_sec is null or duration_sec between 1 and 1000000);
alter table public.listening_items add column if not exists track_count integer
  check (track_count is null or track_count between 1 and 100000);
alter table public.listening_items add column if not exists duration_partial boolean not null default false;

-- =====================================================================
--  FASE 2 · MENSAJES PRIVADOS  (prefijo dm_)
--   · Con el profesor puede hablar todo el mundo.
--   · Entre alumnos: los dos deben cumplir dm_ok y no haberse bloqueado.
--   · El profesor NO lee las conversaciones entre alumnos, salvo un
--     mensaje que alguien haya denunciado.
--   · Los bloqueos son privados: solo los ve quien bloquea.
-- =====================================================================
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists dm_messages_recipient_idx on public.dm_messages (recipient_id, read_at);
create index if not exists dm_messages_pair_idx on public.dm_messages (sender_id, recipient_id, created_at);

create or replace function public.can_dm(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null and a <> b
    -- solo responde a una de las dos personas: así nadie puede averiguar si un compañero es menor
    and (auth.uid() is null or auth.uid() in (a, b))
    and exists (select 1 from public.profiles where id = a and approved)
    and exists (select 1 from public.profiles where id = b and approved)
    and (
      exists (select 1 from public.profiles where id in (a, b) and role = 'teacher')
      or (public.dm_ok(a) and public.dm_ok(b)
          and not exists (select 1 from public.user_blocks
                          where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)))
    );
$$;

-- Personas a las que puedo escribir (para "Nuevo mensaje").
create or replace function public.get_dm_contacts()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id from public.profiles p where p.approved and public.can_dm(auth.uid(), p.id);
$$;

-- Perfil público de una persona (para la ficha que se abre al pulsar su nombre).
create or replace function public.get_profile(p_id uuid)
returns table (id uuid, public_name text, avatar text, role text, bio text, instrument text,
               level text, favorites text, learning text, gear text, can_message boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nickname), ''), p.display_name), p.avatar, p.role,
         p.bio, p.instrument, p.level, p.favorites, p.learning, p.gear,
         public.can_dm(auth.uid(), p.id)
  from public.profiles p
  where p.id = p_id and p.approved and public.is_approved();
$$;

-- El destinatario solo puede marcar el mensaje como leído; nadie puede reescribirlo.
create or replace function public.dm_messages_guard()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.id is distinct from old.id or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Solo se puede marcar como leído';
  end if;
  return new;
end;
$$;
drop trigger if exists dm_messages_guard_trg on public.dm_messages;
create trigger dm_messages_guard_trg before update on public.dm_messages
  for each row execute function public.dm_messages_guard();

grant select, insert, update, delete on public.user_blocks, public.dm_messages to authenticated;
revoke all on public.user_blocks, public.dm_messages from anon;
alter table public.user_blocks enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and public.is_approved());
drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists dm_messages_select on public.dm_messages;
create policy dm_messages_select on public.dm_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid()
         or (public.is_teacher() and exists (select 1 from public.moderation_reports r
                                             where r.target_type = 'dm_message' and r.target_id = dm_messages.id)));
drop policy if exists dm_messages_insert on public.dm_messages;
create policy dm_messages_insert on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_approved() and public.can_dm(sender_id, recipient_id));
drop policy if exists dm_messages_update_read on public.dm_messages;
create policy dm_messages_update_read on public.dm_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists dm_messages_delete on public.dm_messages;
create policy dm_messages_delete on public.dm_messages for delete to authenticated
  using (sender_id = auth.uid()
         or (public.is_teacher() and exists (select 1 from public.moderation_reports r
                                             where r.target_type = 'dm_message' and r.target_id = dm_messages.id)));

-- Las denuncias también aceptan mensajes privados
alter table public.moderation_reports drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check
  check (target_type in ('feed_post', 'feed_comment', 'listening_comment', 'dm_message'));

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
    when 'dm_message'        then exists (select 1 from public.dm_messages        where id = i and recipient_id = auth.uid())
    else false
  end;
$$;

drop trigger if exists cleanup_dm_messages on public.dm_messages;
create trigger cleanup_dm_messages after delete on public.dm_messages
  for each row execute function public.cleanup_target_links('dm_message');

-- =====================================================================
--  FASE 2 · NOTIFICACIONES
--  Las crea la propia base de datos (triggers), nunca el navegador.
--  Cada persona solo ve, marca como leídas y borra las suyas.
-- =====================================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report')),
  actor_id    uuid references public.profiles(id) on delete cascade,
  target_id   uuid,
  extra       text check (extra is null or char_length(extra) <= 160),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  pushed_at   timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function public.notifications_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and (new.id is distinct from old.id or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind or new.actor_id is distinct from old.actor_id
     or new.target_id is distinct from old.target_id or new.extra is distinct from old.extra
     or new.created_at is distinct from old.created_at or new.pushed_at is distinct from old.pushed_at) then
    raise exception 'Solo se puede marcar como leída';
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_guard_trg on public.notifications;
create trigger notifications_guard_trg before update on public.notifications
  for each row execute function public.notifications_guard();

grant select, update, delete on public.notifications to authenticated;
revoke all on public.notifications from anon;
alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Menciones (@persona, #sección, #escucha): la app las guarda en el texto como <@id>, <#seccion> y <#l:id>.
-- mention_ids: a quién menciona un texto. mention_plain: el texto legible, para las notificaciones
-- (las escuchas salen como "#escucha" para no revelar su título a quien no la tiene asignada).
create or replace function public.mention_ids(p text)
returns setof uuid language sql immutable set search_path = public as $$
  select distinct (m[1])::uuid
  from regexp_matches(coalesce(p, ''), '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as m;
$$;
create or replace function public.mention_plain(p text)
returns text language plpgsql stable security definer set search_path = public as $$
declare m text[]; r text := p; nm text;
begin
  if r is null then return null; end if;
  for m in select regexp_matches(p, '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') loop
    select coalesce(nullif(trim(nickname), ''), display_name) into nm from public.profiles where id = m[1]::uuid;
    r := replace(r, '<@' || m[1] || '>', '@' || coalesce(nm, 'usuario'));
  end loop;
  r := regexp_replace(r, '<#l:[0-9a-f-]{36}>', '#escucha', 'g');
  for m in select regexp_matches(r, '<#([a-z]+)>', 'g') loop
    r := replace(r, '<#' || m[1] || '>', '#' || case m[1]
      when 'feed' then 'Inicio' when 'messages' then 'Mensajes' when 'board' then 'Avisos'
      when 'listening' then 'Escucha analítica' when 'homework' then 'Deberes' when 'payments' then 'Pagos'
      when 'students' then 'Alumnos' when 'profile' then 'Perfil' when 'mod' then 'Moderación'
      when 'settings' then 'Ajustes' else m[1] end);
  end loop;
  return r;
end;
$$;

-- Crea una notificación (sin repetir una igual que siga sin leer)
create or replace function public.notify(p_user uuid, p_kind text, p_actor uuid, p_target uuid, p_extra text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.notifications where user_id = p_user and kind = p_kind
             and actor_id is not distinct from p_actor and target_id is not distinct from p_target and read_at is null) then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, target_id, extra)
  values (p_user, p_kind, p_actor, p_target, left(p_extra, 160));
end;
$$;

create or replace function public.notify_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; owner uuid; mid uuid;
begin
  -- En los avisos, a quien se menciona le llega "te ha mencionado" en vez de "nuevo aviso" (solo si el aviso es para él)
  if tg_table_name = 'board_posts' then            -- aviso para todos
    if new.audience = 'all' then
      for r in select id from public.profiles where role = 'student' and approved loop
        perform public.notify(r.id, case when r.id in (select public.mention_ids(new.body)) then 'mention_board' else 'board_post' end,
                              new.author_id, new.id, new.title);
      end loop;
    end if;
  elsif tg_table_name = 'board_recipients' then    -- aviso dirigido
    select * into r from public.board_posts where id = new.post_id;
    perform public.notify(new.student_id, case when new.student_id in (select public.mention_ids(r.body)) then 'mention_board' else 'board_post' end,
                          r.author_id, r.id, r.title);
  elsif tg_table_name = 'feed_posts' then          -- menciones en una publicación del Inicio (la ven todos los aprobados)
    for mid in select u from public.mention_ids(new.body) u join public.profiles p on p.id = u
               where p.approved and not exists (select 1 from public.user_blocks b where b.blocker_id = u and b.blocked_id = new.author_id) loop
      perform public.notify(mid, 'mention_feed', new.author_id, new.id, left(public.mention_plain(new.body), 120));
    end loop;
  elsif tg_table_name = 'listening_comments' then  -- menciones en una escucha: solo a quien la puede ver
    for mid in select u from public.mention_ids(new.body) u join public.profiles p on p.id = u
               where p.approved and (p.role = 'teacher' or exists (select 1 from public.listening_assignments a where a.item_id = new.item_id and a.student_id = u))
                 and not exists (select 1 from public.user_blocks b where b.blocker_id = u and b.blocked_id = new.author_id) loop
      perform public.notify(mid, 'mention_listening', new.author_id, new.item_id, left(public.mention_plain(new.body), 120));
    end loop;
  elsif tg_table_name = 'listening_assignments' then
    select title into r from public.listening_items where id = new.item_id;
    perform public.notify(new.student_id, 'assignment', null, new.item_id, r.title);
  elsif tg_table_name = 'dm_messages' then
    perform public.notify(new.recipient_id, 'dm', new.sender_id, new.sender_id, null);
  elsif tg_table_name = 'feed_comments' then
    select author_id into owner from public.feed_posts where id = new.post_id;
    perform public.notify(owner, 'comment', new.author_id, new.post_id, left(public.mention_plain(new.body), 80));
    -- los mencionados (menos el dueño, que ya recibe "ha comentado tu publicación")
    for mid in select u from public.mention_ids(new.body) u join public.profiles p on p.id = u
               where u is distinct from owner and p.approved
                 and not exists (select 1 from public.user_blocks b where b.blocker_id = u and b.blocked_id = new.author_id) loop
      perform public.notify(mid, 'mention_feed', new.author_id, new.post_id, left(public.mention_plain(new.body), 120));
    end loop;
  elsif tg_table_name = 'reactions' then
    if new.target_type = 'feed_post' then
      select author_id into owner from public.feed_posts where id = new.target_id;
      perform public.notify(owner, 'reaction', new.user_id, new.target_id, new.emoji);
    elsif new.target_type = 'feed_comment' then
      select author_id into owner from public.feed_comments where id = new.target_id;
      perform public.notify(owner, 'reaction', new.user_id, (select post_id from public.feed_comments where id = new.target_id), new.emoji);
    end if;
  elsif tg_table_name = 'profiles' then            -- alguien se registra
    for r in select id from public.profiles where role = 'teacher' and approved loop
      perform public.notify(r.id, 'signup', new.id, new.id, new.display_name);
    end loop;
  elsif tg_table_name = 'moderation_reports' then
    for r in select id from public.profiles where role = 'teacher' and approved loop
      perform public.notify(r.id, 'report', null, new.id, null);
    end loop;
  elsif tg_table_name = 'homework_tasks' then       -- deberes nuevos (la tabla está más abajo)
    perform public.notify(new.student_id, 'homework', new.created_by, new.id, new.title);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_board_posts on public.board_posts;
create trigger notify_board_posts after insert on public.board_posts for each row execute function public.notify_trg();
drop trigger if exists notify_board_recipients on public.board_recipients;
create trigger notify_board_recipients after insert on public.board_recipients for each row execute function public.notify_trg();
-- Escuchas asignadas: un solo aviso por alumno y por insert (al asignar varias de golpe no le llegan N avisos).
-- Una sola escucha: aviso normal con su id. Varias: target_id null y extra = sus títulos.
create or replace function public.listening_assignments_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select n.student_id, count(*) as cnt, (array_agg(n.item_id))[1] as one_item,
           string_agg(i.title, ', ' order by i.title) as titles
    from new_rows n join public.listening_items i on i.id = n.item_id
    group by n.student_id
  loop
    if r.cnt = 1 then
      perform public.notify(r.student_id, 'assignment', null, r.one_item, r.titles);
    else
      insert into public.notifications (user_id, kind, target_id, extra)
      values (r.student_id, 'assignment', null,
              case when char_length(r.titles) > 160 then left(r.titles, 159) || '…' else r.titles end);
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.listening_assignments_notify() from public, anon, authenticated;
create or replace trigger notify_listening_assignments after insert on public.listening_assignments
  referencing new table as new_rows for each statement execute function public.listening_assignments_notify();
drop trigger if exists notify_dm_messages on public.dm_messages;
create trigger notify_dm_messages after insert on public.dm_messages for each row execute function public.notify_trg();
drop trigger if exists notify_feed_comments on public.feed_comments;
create trigger notify_feed_comments after insert on public.feed_comments for each row execute function public.notify_trg();
drop trigger if exists notify_feed_posts on public.feed_posts;
create trigger notify_feed_posts after insert on public.feed_posts for each row execute function public.notify_trg();
-- Al editar una publicación, solo se avisa a quien se menciona por primera vez
create or replace function public.feed_posts_edit_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if new.body is not distinct from old.body then return null; end if;
  for mid in select u from public.mention_ids(new.body) u join public.profiles p on p.id = u
             where p.approved and u not in (select public.mention_ids(old.body))
               and not exists (select 1 from public.user_blocks b where b.blocker_id = u and b.blocked_id = new.author_id) loop
    perform public.notify(mid, 'mention_feed', new.author_id, new.id, left(public.mention_plain(new.body), 120));
  end loop;
  return null;
end;
$$;
revoke execute on function public.feed_posts_edit_notify() from public, anon, authenticated;
drop trigger if exists notify_feed_posts_edit on public.feed_posts;
create trigger notify_feed_posts_edit after update on public.feed_posts for each row execute function public.feed_posts_edit_notify();
drop trigger if exists notify_listening_comments on public.listening_comments;
create trigger notify_listening_comments after insert on public.listening_comments for each row execute function public.notify_trg();
drop trigger if exists notify_reactions on public.reactions;
create trigger notify_reactions after insert on public.reactions for each row execute function public.notify_trg();
drop trigger if exists notify_profiles on public.profiles;
create trigger notify_profiles after insert on public.profiles for each row execute function public.notify_trg();
drop trigger if exists notify_moderation_reports on public.moderation_reports;
create trigger notify_moderation_reports after insert on public.moderation_reports for each row execute function public.notify_trg();

-- Permisos de ejecución de las funciones nuevas
revoke execute on function public.mention_ids(text), public.mention_plain(text) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, uuid, uuid, text), public.notify_trg(),
  public.dm_messages_guard(), public.notifications_guard() from public, anon, authenticated;
-- dm_ok solo la usan otras funciones internas: no se puede llamar desde fuera (revelaría si alguien es menor)
revoke execute on function public.dm_ok(uuid) from public, anon, authenticated;
revoke execute on function public.can_dm(uuid, uuid), public.get_profile(uuid),
  public.get_dm_contacts() from public, anon;
grant execute on function public.can_dm(uuid, uuid), public.get_profile(uuid),
  public.get_dm_contacts() to authenticated;

-- Tiempo real para lo nuevo
do $$
declare t text;
begin
  foreach t in array array['dm_messages', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
--  NOTIFICACIONES PUSH (en el móvil aunque la app esté cerrada)
--   · push_subscriptions: a qué dispositivos de cada persona hay que enviar.
--   · Al crearse una notificación, la base de datos avisa a la Edge Function
--     "send-push", que la envía y marca pushed_at (así nunca se repite).
-- =====================================================================
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

grant select, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Guarda el dispositivo actual para la persona que ha iniciado sesión.
-- Si ese dispositivo estaba asociado a otra cuenta (móvil compartido), pasa a la actual.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_approved() then raise exception 'No autorizado'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create extension if not exists pg_net;

create or replace function public.notify_push_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://gyzwevayeloishhldumd.supabase.co/functions/v1/send-push',
      body := jsonb_build_object('notification_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return null;
end;
$$;
revoke execute on function public.notify_push_trg() from public, anon, authenticated;
drop trigger if exists notifications_push_trg on public.notifications;
create trigger notifications_push_trg after insert on public.notifications
  for each row execute function public.notify_push_trg();

-- La Edge Function "send-push" entra como service_role (solo existe en el servidor de Supabase).
-- En este proyecto service_role no tiene permisos por defecto: se le dan solo los que necesita.
grant select, update on public.notifications to service_role;   -- leer la notificación y marcar pushed_at
grant select on public.profiles to service_role;                -- nombre de quien la provoca
grant select, delete on public.push_subscriptions to service_role; -- dispositivos; borra los dados de baja

-- Invitación a instalar la app del móvil (los marca la propia app; cada uno solo puede tocar su perfil)
--   install_prompted_at: ya se le enseñó la ventana de bienvenida (solo sale una vez)
--   app_installed_at:    ya abrió la app instalada en el móvil (deja de recordárselo para siempre)
alter table public.profiles add column if not exists install_prompted_at timestamptz;
alter table public.profiles add column if not exists app_installed_at timestamptz;

-- =====================================================================
--  MÓDULO: DEBERES  (prefijo homework_)
--   homework_tasks: una fila por alumno y tarea. Texto, sin archivos (los vídeos y fotos van por otras vías).
--   El profesor las crea (puede poner la misma a varios alumnos de golpe), las edita y las borra.
--   El alumno solo ve las suyas y solo puede marcarlas como practicadas (done_at).
-- =====================================================================
create table if not exists public.homework_tasks (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 200),
  details     text check (details is null or char_length(details) <= 1500),
  due_date    date,
  done_at     timestamptz,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists homework_tasks_student_idx on public.homework_tasks (student_id, created_at desc);

grant select, insert, update, delete on public.homework_tasks to authenticated;
revoke all on public.homework_tasks from anon;
alter table public.homework_tasks enable row level security;

drop policy if exists homework_tasks_select on public.homework_tasks;
create policy homework_tasks_select on public.homework_tasks for select to authenticated
  using (public.is_teacher() or (student_id = auth.uid() and public.is_approved()));
drop policy if exists homework_tasks_insert_teacher on public.homework_tasks;
create policy homework_tasks_insert_teacher on public.homework_tasks for insert to authenticated
  with check (public.is_teacher());
drop policy if exists homework_tasks_update_teacher on public.homework_tasks;
create policy homework_tasks_update_teacher on public.homework_tasks for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists homework_tasks_update_own on public.homework_tasks;
create policy homework_tasks_update_own on public.homework_tasks for update to authenticated
  using (student_id = auth.uid() and public.is_approved()) with check (student_id = auth.uid());
drop policy if exists homework_tasks_delete_teacher on public.homework_tasks;
create policy homework_tasks_delete_teacher on public.homework_tasks for delete to authenticated
  using (public.is_teacher());

-- El alumno solo puede cambiar done_at (marcar / desmarcar como practicada)
create or replace function public.homework_tasks_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_teacher() then
    if new.id is distinct from old.id or new.student_id is distinct from old.student_id
    or new.title is distinct from old.title or new.details is distinct from old.details
    or new.due_date is distinct from old.due_date or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
      raise exception 'Solo puedes marcar tus deberes como practicados';
    end if;
  end if;
  new.title = trim(new.title);
  new.details = nullif(trim(coalesce(new.details, '')), '');
  return new;
end;
$$;
drop trigger if exists homework_tasks_guard_trg on public.homework_tasks;
create trigger homework_tasks_guard_trg before insert or update on public.homework_tasks
  for each row execute function public.homework_tasks_guard();
revoke execute on function public.homework_tasks_guard() from public, anon, authenticated;

-- Aviso (campanita + móvil) al alumno cuando le pones deberes
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson')); -- 'lesson': ver módulo Agenda
drop trigger if exists notify_homework_tasks on public.homework_tasks;
create trigger notify_homework_tasks after insert on public.homework_tasks for each row execute function public.notify_trg();

-- Tiempo real: al alumno le aparecen solos; el profesor ve al momento lo que marcan
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'homework_tasks') then
    execute 'alter publication supabase_realtime add table public.homework_tasks';
  end if;
end $$;

-- =====================================================================
--  MÓDULO: PAGOS  (prefijo payments_)  ·  SOLO EL PROFESOR
--   payments_plans:   el trato de cada alumno (mensual, por clase o gratis) y su precio.
--   payments_records: cada pago apuntado. Mensual = uno por mes (period = día 1 del mes);
--                     por clase = tantos como clases pagadas en el mes.
--   "Se desmarca al terminar el mes" sin borrar nada: cada mes empieza sin pago apuntado,
--   y los meses anteriores quedan como historial.
--   Los alumnos no pueden leer nada de esto (ni lo suyo).
-- =====================================================================
create table if not exists public.payments_plans (
  student_id  uuid primary key references public.profiles(id) on delete cascade,
  mode        text not null default 'monthly' check (mode in ('monthly', 'per_class', 'free')),
  amount      numeric(8,2) check (amount is null or (amount >= 0 and amount < 100000)),
  note        text check (note is null or char_length(note) <= 300),
  updated_at  timestamptz not null default now()
);
create table if not exists public.payments_records (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  period      date not null check (extract(day from period) = 1),
  kind        text not null check (kind in ('monthly', 'class')),
  amount      numeric(8,2) check (amount is null or (amount >= 0 and amount < 100000)),
  paid_on     date not null default current_date,
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists payments_records_period_idx on public.payments_records (period, student_id);
-- Un solo pago mensual por alumno y mes (por clase, los que hagan falta)
create unique index if not exists payments_records_monthly_uq on public.payments_records (student_id, period) where kind = 'monthly';

grant select, insert, update, delete on public.payments_plans, public.payments_records to authenticated;
revoke all on public.payments_plans, public.payments_records from anon;
alter table public.payments_plans   enable row level security;
alter table public.payments_records enable row level security;
drop policy if exists payments_plans_all_teacher on public.payments_plans;
create policy payments_plans_all_teacher on public.payments_plans for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists payments_records_all_teacher on public.payments_records;
create policy payments_records_all_teacher on public.payments_records for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- =====================================================================
--  MÓDULO: CLASES / AGENDA  (prefijo lessons_)
--   Las clases se apuntan SOLO en Google Calendar (un calendario dedicado a clases). La Edge Function
--   "calendar-sync" lo lee por su dirección secreta iCal (secreto CALENDAR_ICS_URL) cada 15 minutos
--   y lo copia aquí. Nadie escribe en estas tablas desde la app salvo el "nombre en el calendario".
--   lessons:          una fila por clase (cada repetición de un evento). Sin descripción, solo título y hora.
--   lessons_students: cómo se llama cada alumno en el calendario (si no, se usa su nombre o apodo).
--   lessons_sync:     estado de la última sincronización (para la Agenda del profesor).
--   Recordatorio: 8 horas antes, notificación 'lesson' al alumno (la crea la función; el push sale solo).
-- =====================================================================
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  event_key   text not null unique,             -- UID del evento de Google + inicio original de esa repetición
  student_id  uuid references public.profiles(id) on delete set null,
  title       text not null check (char_length(title) <= 300),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  reminded_at timestamptz,
  synced_at   timestamptz not null default now()
);
create index if not exists lessons_starts_idx on public.lessons (starts_at);
create index if not exists lessons_student_idx on public.lessons (student_id, starts_at);
create table if not exists public.lessons_students (
  student_id    uuid primary key references public.profiles(id) on delete cascade,
  calendar_name text check (calendar_name is null or char_length(calendar_name) <= 80),
  updated_at    timestamptz not null default now()
);
create table if not exists public.lessons_sync (
  id          int primary key default 1 check (id = 1),
  last_run_at timestamptz,
  last_ok_at  timestamptz,
  last_error  text,
  events      int,
  unmatched   int
);

grant select on public.lessons, public.lessons_sync to authenticated;
grant select, insert, update, delete on public.lessons_students to authenticated;
revoke all on public.lessons, public.lessons_students, public.lessons_sync from anon;
alter table public.lessons          enable row level security;
alter table public.lessons_students enable row level security;
alter table public.lessons_sync     enable row level security;
-- El alumno solo ve SUS clases; el profesor, todas. Nadie las escribe desde la app.
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to authenticated
  using (public.is_teacher() or (student_id = auth.uid() and public.is_approved()));
drop policy if exists lessons_students_all_teacher on public.lessons_students;
create policy lessons_students_all_teacher on public.lessons_students for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists lessons_sync_select_teacher on public.lessons_sync;
create policy lessons_sync_select_teacher on public.lessons_sync for select to authenticated
  using (public.is_teacher());

-- La Edge Function entra como service_role: solo lo que necesita
grant select, insert, update, delete on public.lessons to service_role;
grant select on public.lessons_students to service_role;
grant select, insert, update on public.lessons_sync to service_role;
grant select on public.homework_tasks to service_role;          -- cuántos deberes tiene pendientes (para el aviso)
grant insert on public.notifications to service_role;           -- el recordatorio de clase

-- Tipo de notificación nuevo: recordatorio de clase
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson'));

-- Sincronización automática cada 15 minutos (pg_cron llama a la Edge Function)
create extension if not exists pg_cron;
select cron.schedule('calendar-sync', '*/15 * * * *',
  $cron$select net.http_post(url := 'https://gyzwevayeloishhldumd.supabase.co/functions/v1/calendar-sync',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)$cron$);

-- =====================================================================
--  COMPAÑEROS (tabla classmates) Y QUIÉN VE A QUIÉN  (2026-11-23)
--   · Un alumno solo aparece para los demás alumnos (directorio, perfil,
--     menciones, "Nuevo mensaje") si ha participado: una publicación, un
--     comentario o una reacción. También si sois compañeros, si hay una
--     solicitud entre vosotros o si ya os habéis escrito.
--   · El profesor ve a todos, y todos ven al profesor.
--   · Compañeros: uno envía la solicitud y el otro la acepta. Solo entre
--     alumnos. Al bloquear a alguien, la relación se borra.
--   · Clave "id" aleatoria: los borrados en tiempo real llegan a todos con
--     la clave primaria, y así no revelan quién era compañero de quién.
-- =====================================================================
create table if not exists public.classmates (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester_id <> addressee_id)
);
-- Una sola relación por pareja, la pida quien la pida
create unique index if not exists classmates_pair_uq
  on public.classmates (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists classmates_addressee_idx on public.classmates (addressee_id);

-- ¿Ha participado en algo que ven otros? (publicación, comentario o reacción)
create or replace function public.has_public_activity(u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.feed_posts where author_id = u)
      or exists (select 1 from public.feed_comments where author_id = u)
      or exists (select 1 from public.listening_comments where author_id = u)
      or exists (select 1 from public.reactions where user_id = u);
$$;

-- ¿Puedo ver a esta persona? Responde siempre desde el punto de vista de quien pregunta.
create or replace function public.can_see_profile(u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and public.is_approved()
    and exists (select 1 from public.profiles p where p.id = u and p.approved)
    and (
      u = auth.uid()
      or public.is_teacher()
      or exists (select 1 from public.profiles p where p.id = u and p.role = 'teacher')
      or public.has_public_activity(u)
      or exists (select 1 from public.classmates c
                 where (c.requester_id = u and c.addressee_id = auth.uid())
                    or (c.requester_id = auth.uid() and c.addressee_id = u))
      or exists (select 1 from public.dm_messages m
                 where (m.sender_id = u and m.recipient_id = auth.uid())
                    or (m.sender_id = auth.uid() and m.recipient_id = u))
    );
$$;

-- ¿Puedo enviarle una solicitud? Los dos alumnos aprobados, sin bloqueos, y que yo pueda
-- verle por su actividad o porque nos hemos escrito (no por la propia solicitud).
create or replace function public.can_request_classmate(u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and u <> auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved and p.role = 'student')
    and exists (select 1 from public.profiles p where p.id = u and p.approved and p.role = 'student')
    and not exists (select 1 from public.user_blocks b
                    where (b.blocker_id = auth.uid() and b.blocked_id = u)
                       or (b.blocker_id = u and b.blocked_id = auth.uid()))
    and (public.has_public_activity(u)
         or exists (select 1 from public.dm_messages m
                    where (m.sender_id = u and m.recipient_id = auth.uid())
                       or (m.sender_id = auth.uid() and m.recipient_id = u)));
$$;

-- El directorio, la ficha y "Nuevo mensaje" solo muestran a quien puedo ver
create or replace function public.get_directory()
returns table (id uuid, public_name text, avatar text, role text)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nickname), ''), p.display_name), p.avatar, p.role
  from public.profiles p
  where p.approved and public.is_approved() and public.can_see_profile(p.id);
$$;

create or replace function public.get_profile(p_id uuid)
returns table (id uuid, public_name text, avatar text, role text, bio text, instrument text,
               level text, favorites text, learning text, gear text, can_message boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.nickname), ''), p.display_name), p.avatar, p.role,
         p.bio, p.instrument, p.level, p.favorites, p.learning, p.gear,
         public.can_dm(auth.uid(), p.id)
  from public.profiles p
  where p.id = p_id and p.approved and public.is_approved() and public.can_see_profile(p.id);
$$;

create or replace function public.get_dm_contacts()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id from public.profiles p
  where p.approved and public.can_dm(auth.uid(), p.id) and public.can_see_profile(p.id);
$$;

-- Solo se puede aceptar una solicitud pendiente; nada más se puede cambiar
create or replace function public.classmates_guard()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.id is distinct from old.id or new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id or new.created_at is distinct from old.created_at
     or old.status <> 'pending' or new.status <> 'accepted' then
    raise exception 'Solo se puede aceptar una solicitud pendiente';
  end if;
  new.accepted_at := now();
  return new;
end;
$$;
create or replace trigger classmates_guard_trg before update on public.classmates
  for each row execute function public.classmates_guard();

-- Al bloquear a alguien, deja de ser tu compañero (y se anula cualquier solicitud)
create or replace function public.user_blocks_classmates()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.classmates
   where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return null;
end;
$$;
create or replace trigger user_blocks_classmates_trg after insert on public.user_blocks
  for each row execute function public.user_blocks_classmates();

grant select, insert, update, delete on public.classmates to authenticated;
revoke all on public.classmates from anon;
alter table public.classmates enable row level security;

drop policy if exists classmates_select on public.classmates;
create policy classmates_select on public.classmates for select to authenticated
  using (auth.uid() in (requester_id, addressee_id) or public.is_teacher());
drop policy if exists classmates_insert_own on public.classmates;
create policy classmates_insert_own on public.classmates for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and accepted_at is null
              and public.can_request_classmate(addressee_id));
drop policy if exists classmates_update_own on public.classmates;
create policy classmates_update_own on public.classmates for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
drop policy if exists classmates_delete_own on public.classmates;
create policy classmates_delete_own on public.classmates for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Notificaciones de solicitud y de aceptación
create or replace function public.classmates_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, 'classmate_request', new.requester_id, new.requester_id, null);
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(new.requester_id, 'classmate_accept', new.addressee_id, new.addressee_id, null);
  end if;
  return null;
end;
$$;
create or replace trigger classmates_notify_trg after insert or update on public.classmates
  for each row execute function public.classmates_notify();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson',
                  'classmate_request', 'classmate_accept'));

-- Permisos de las funciones: las de uso interno no se pueden llamar desde fuera
revoke execute on function public.has_public_activity(uuid), public.classmates_guard(),
  public.user_blocks_classmates(), public.classmates_notify() from public, anon, authenticated;
revoke execute on function public.can_see_profile(uuid), public.can_request_classmate(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid), public.can_request_classmate(uuid) to authenticated;

-- Tiempo real
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classmates') then
    alter publication supabase_realtime add table public.classmates;
  end if;
end $$;

-- =====================================================================
-- TU CUENTA DE PROFESOR
--    Primero REGÍSTRATE en la web con tu email. Después ejecuta esto
--    (cambia el email por el tuyo) para convertirte en profesor:
-- =====================================================================
-- update public.profiles
--    set role = 'teacher', approved = true
--  where email = 'tu@email.com';

-- Foto de perfil en grande: la de 640×640 si existe; si no, la normal
create or replace function public.get_avatar_large(p_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(p.avatar_lg, p.avatar)
  from public.profiles p
  where p.id = p_id and p.approved and public.is_approved() and public.can_see_profile(p.id);
$$;
revoke execute on function public.get_avatar_large(uuid) from public, anon;
grant  execute on function public.get_avatar_large(uuid) to authenticated;

-- =====================================================================
--  NÚCLEO: ALUMNOS ARCHIVADOS Y BORRADO DE CUENTA (2026-11-23)
--   · Archivar = approved false + archived_at. Sin acceso; desaparece de
--     todas las listas (todas filtran por approved) y se ocultan sus
--     publicaciones, comentarios y reacciones mientras siga archivado.
--   · Reactivar = approved true + archived_at null: todo vuelve a verse.
--   · Borrar: Edge Function "delete-account". Puede hacerlo el propio alumno
--     o el profesor con un alumno ya archivado. Borra auth.users y, en
--     cascada, todos sus datos.
-- =====================================================================
alter table public.profiles add column if not exists archived_at timestamptz;

-- Solo el profesor archiva o reactiva
create or replace function public.profiles_archive_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_teacher()
     and new.archived_at is distinct from old.archived_at then
    raise exception 'Solo el profesor puede archivar cuentas';
  end if;
  if new.archived_at is not null then new.approved = false; end if;
  return new;
end;
$$;
create or replace trigger profiles_archive_guard_trg before update on public.profiles
  for each row execute function public.profiles_archive_guard();

create or replace function public.is_archived(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and archived_at is not null);
$$;
revoke execute on function public.is_archived(uuid) from public, anon;
grant  execute on function public.is_archived(uuid) to authenticated;
revoke execute on function public.profiles_archive_guard() from public, anon, authenticated;

-- Lo de un alumno archivado no se ve (tampoco el profesor: si lo reactivas, vuelve)
alter policy feed_posts_select on public.feed_posts
  using (public.is_approved() and not public.is_archived(author_id));
alter policy feed_comments_select on public.feed_comments
  using (public.is_approved() and not public.is_archived(author_id));
alter policy listening_comments_select on public.listening_comments
  using (
    not public.is_archived(author_id)
    and (public.is_teacher()
         or (public.is_approved() and exists (
               select 1 from public.listening_assignments a
               where a.item_id = listening_comments.item_id and a.student_id = auth.uid())))
  );
alter policy reactions_select on public.reactions
  using (public.is_approved() and not public.is_archived(user_id)
         and public.can_see_target(target_type, target_id));

-- ¿Puede quien llama borrar esta cuenta? Devuelve el id que hay que borrar.
-- Lo usa la Edge Function "delete-account" con el token de quien lo pide.
create or replace function public.account_delete_check(p_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid := coalesce(p_id, auth.uid());
  r public.profiles;
begin
  if me is null then raise exception 'No autorizado'; end if;
  select * into r from public.profiles where id = target;
  if not found then raise exception 'Esa cuenta no existe'; end if;
  if r.role <> 'student' then raise exception 'La cuenta del profesor no se borra desde la app'; end if;
  if target <> me and not (public.is_teacher() and r.archived_at is not null) then
    raise exception 'Solo se puede borrar a un alumno archivado';
  end if;
  return target;
end;
$$;
revoke execute on function public.account_delete_check(uuid) from public, anon;
grant  execute on function public.account_delete_check(uuid) to authenticated;

-- Si un alumno activo borra su cuenta, el profesor recibe un aviso con su nombre
create or replace function public.profiles_deleted_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if old.role = 'student' and old.approved and old.archived_at is null then
    for t in select id from public.profiles where role = 'teacher' and approved loop
      insert into public.notifications (user_id, kind, extra)
      values (t.id, 'account_deleted', left(old.display_name, 160));
    end loop;
  end if;
  return old;
end;
$$;
revoke execute on function public.profiles_deleted_notify() from public, anon, authenticated;
create or replace trigger profiles_deleted_notify_trg after delete on public.profiles
  for each row execute function public.profiles_deleted_notify();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson',
                  'classmate_request', 'classmate_accept', 'account_deleted'));

-- =====================================================================
--  MÓDULO: OBJETIVOS (prefijo goals_)  · 2026-11-23
--   · goals_stages: etapas de la lista general (número + título).
--   · goals_items: objetivos. student_id null = de la lista general (todos los
--     alumnos); con student_id = personal de ese alumno.
--   · goals_done: una fila por objetivo conseguido y alumno. Solo el profesor
--     marca y desmarca. El alumno solo pone seen_at (ya vio la celebración).
--   · Privado: cada alumno ve solo sus logros y sus personales; nadie más.
-- =====================================================================
create table if not exists public.goals_stages (
  stage  smallint primary key check (stage between 1 and 99),
  title  text check (title is null or char_length(title) <= 80)
);
create table if not exists public.goals_items (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references public.profiles(id) on delete cascade,
  stage       smallint check (stage is null or stage between 1 and 99),
  title       text not null check (char_length(trim(title)) between 1 and 200),
  details     text check (details is null or char_length(details) <= 500),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists goals_items_student_idx on public.goals_items (student_id);
create table if not exists public.goals_done (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals_items(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  done_at     timestamptz not null default now(),
  seen_at     timestamptz,
  unique (goal_id, student_id)
);
create index if not exists goals_done_student_idx on public.goals_done (student_id);

grant select, insert, update, delete on public.goals_stages, public.goals_items, public.goals_done to authenticated;
revoke all on public.goals_stages, public.goals_items, public.goals_done from anon;
alter table public.goals_stages enable row level security;
alter table public.goals_items  enable row level security;
alter table public.goals_done   enable row level security;

drop policy if exists goals_stages_select on public.goals_stages;
create policy goals_stages_select on public.goals_stages for select to authenticated using (public.is_approved());
drop policy if exists goals_stages_all_teacher on public.goals_stages;
create policy goals_stages_all_teacher on public.goals_stages for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists goals_items_select on public.goals_items;
create policy goals_items_select on public.goals_items for select to authenticated
  using (public.is_teacher() or (public.is_approved() and (student_id is null or student_id = auth.uid())));
drop policy if exists goals_items_all_teacher on public.goals_items;
create policy goals_items_all_teacher on public.goals_items for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists goals_done_select on public.goals_done;
create policy goals_done_select on public.goals_done for select to authenticated
  using (public.is_teacher() or (student_id = auth.uid() and public.is_approved()));
drop policy if exists goals_done_all_teacher on public.goals_done;
create policy goals_done_all_teacher on public.goals_done for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists goals_done_update_seen on public.goals_done;
create policy goals_done_update_seen on public.goals_done for update to authenticated
  using (student_id = auth.uid() and public.is_approved()) with check (student_id = auth.uid());

create or replace function public.goals_items_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.title = trim(new.title);
  new.details = nullif(trim(coalesce(new.details, '')), '');
  if new.student_id is null and new.stage is null then raise exception 'Un objetivo general necesita etapa'; end if;
  return new;
end;
$$;
create or replace trigger goals_items_guard_trg before insert or update on public.goals_items
  for each row execute function public.goals_items_guard();

-- Solo se marca un objetivo que corresponde a ese alumno; el alumno solo cambia seen_at
create or replace function public.goals_done_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_teacher() then
    if new.id is distinct from old.id or new.goal_id is distinct from old.goal_id
    or new.student_id is distinct from old.student_id or new.done_at is distinct from old.done_at then
      raise exception 'Solo tu profesor marca los objetivos';
    end if;
  end if;
  if not exists (select 1 from public.goals_items g where g.id = new.goal_id
                 and (g.student_id is null or g.student_id = new.student_id)) then
    raise exception 'Ese objetivo no es de este alumno';
  end if;
  return new;
end;
$$;
create or replace trigger goals_done_guard_trg before insert or update on public.goals_done
  for each row execute function public.goals_done_guard();

-- Aviso al alumno (campanita + móvil): "¡Objetivo conseguido!"
create or replace function public.goals_done_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, actor_id, target_id, extra)
  select new.student_id, 'goal', auth.uid(), new.goal_id, left(g.title, 160)
  from public.goals_items g where g.id = new.goal_id;
  return new;
end;
$$;
create or replace trigger goals_done_notify_trg after insert on public.goals_done
  for each row execute function public.goals_done_notify();
revoke execute on function public.goals_items_guard(), public.goals_done_guard(), public.goals_done_notify()
  from public, anon, authenticated;

-- Tiempo real: el alumno ve el logro (y la celebración) al momento
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goals_done') then
    alter publication supabase_realtime add table public.goals_done;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goals_items') then
    alter publication supabase_realtime add table public.goals_items;
  end if;
end $$;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson',
                  'classmate_request', 'classmate_accept', 'account_deleted', 'goal'));

-- =====================================================================
-- Límite de emails de Supabase: cuánto falta para que se recupere (2026-11-23)
-- El SMTP gratuito de Supabase funciona como una hucha de 2 emails que se
-- rellena a 1 email por hora, de forma continua (Supabase Auth,
-- internal/ratelimit/burst.go). Supabase no guarda en la base de datos cuándo
-- envió cada email, así que lo apuntamos aquí con un trigger en auth.users.
-- La tabla no la lee nadie desde fuera: solo email_wait_seconds(), que
-- devuelve un número (segundos de espera), sin emails ni nombres.
-- Si se cambia el límite en el panel (Authentication → Rate Limits), cambia
-- también email_cap y email_period en email_wait_seconds().
-- =====================================================================
create table if not exists public.auth_email_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  kind text not null check (kind in ('confirmation', 'recovery', 'email_change', 'reauthentication'))
);
alter table public.auth_email_log enable row level security;
revoke all on table public.auth_email_log from public, anon, authenticated;
create index if not exists auth_email_log_sent_at_idx on public.auth_email_log (sent_at);

create or replace function public.auth_email_log_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.confirmation_sent_at is not null and (tg_op = 'INSERT' or new.confirmation_sent_at is distinct from old.confirmation_sent_at) then
    insert into public.auth_email_log (sent_at, kind) values (new.confirmation_sent_at, 'confirmation');
  end if;
  if new.recovery_sent_at is not null and (tg_op = 'INSERT' or new.recovery_sent_at is distinct from old.recovery_sent_at) then
    insert into public.auth_email_log (sent_at, kind) values (new.recovery_sent_at, 'recovery');
  end if;
  if new.email_change_sent_at is not null and (tg_op = 'INSERT' or new.email_change_sent_at is distinct from old.email_change_sent_at) then
    insert into public.auth_email_log (sent_at, kind) values (new.email_change_sent_at, 'email_change');
  end if;
  if new.reauthentication_sent_at is not null and (tg_op = 'INSERT' or new.reauthentication_sent_at is distinct from old.reauthentication_sent_at) then
    insert into public.auth_email_log (sent_at, kind) values (new.reauthentication_sent_at, 'reauthentication');
  end if;
  -- Solo hace falta el historial de las últimas horas
  delete from public.auth_email_log where sent_at < now() - interval '1 day';
  return new;
end;
$$;
revoke execute on function public.auth_email_log_trg_fn() from public, anon, authenticated;
create or replace trigger auth_email_log_trg
  after insert or update of confirmation_sent_at, recovery_sent_at, email_change_sent_at, reauthentication_sent_at
  on auth.users
  for each row execute function public.auth_email_log_trg_fn();

-- Segundos que faltan para que se pueda mandar otro email (0 = ya se puede).
-- Repite la cuenta de Supabase: la hucha empieza llena y cada email gasta 1.
-- Si el servidor de Auth se reinicia, la hucha real se llena antes: el
-- resultado puede pecar de largo, nunca de corto.
create or replace function public.email_wait_seconds()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  email_cap constant numeric := 2;        -- emails en la hucha
  email_period constant numeric := 3600;  -- segundos para recuperar 1 email
  tokens numeric := email_cap;
  last_at timestamptz;
  ev record;
begin
  for ev in select sent_at from public.auth_email_log
            where sent_at > now() - interval '6 hours' order by sent_at loop
    if last_at is not null then
      tokens := least(email_cap, tokens + extract(epoch from ev.sent_at - last_at) / email_period);
    end if;
    tokens := greatest(tokens - 1, 0);
    last_at := ev.sent_at;
  end loop;
  if last_at is null then return 0; end if;
  tokens := least(email_cap, tokens + extract(epoch from now() - last_at) / email_period);
  if tokens >= 1 then return 0; end if;
  return ceil((1 - tokens) * email_period)::integer;
end;
$$;
revoke execute on function public.email_wait_seconds() from public;
grant execute on function public.email_wait_seconds() to anon, authenticated;

-- =====================================================================
--  MENSAJES PRIVADOS: REACCIONES (2026-11-23)
--  Una por persona y mensaje (como WhatsApp); cualquier emoji. Solo las ven
--  y ponen los dos de la conversación. No cuentan como actividad pública.
--  Aviso: notificación 'dm' con el emoji en extra (push sí, campanita no).
-- =====================================================================
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists dm_reactions_user_idx on public.dm_reactions (user_id);
grant select, insert, update, delete on public.dm_reactions to authenticated;
revoke all on public.dm_reactions from anon;
alter table public.dm_reactions enable row level security;

drop policy if exists dm_reactions_select on public.dm_reactions;
create policy dm_reactions_select on public.dm_reactions for select to authenticated
  using (exists (select 1 from public.dm_messages m where m.id = message_id
                 and (select auth.uid()) in (m.sender_id, m.recipient_id)));
drop policy if exists dm_reactions_insert on public.dm_reactions;
create policy dm_reactions_insert on public.dm_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_approved()
              and exists (select 1 from public.dm_messages m where m.id = message_id
                          and (select auth.uid()) in (m.sender_id, m.recipient_id)
                          and public.can_dm(m.sender_id, m.recipient_id)));
drop policy if exists dm_reactions_update on public.dm_reactions;
create policy dm_reactions_update on public.dm_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_approved()
              and exists (select 1 from public.dm_messages m where m.id = message_id
                          and (select auth.uid()) in (m.sender_id, m.recipient_id)
                          and public.can_dm(m.sender_id, m.recipient_id)));
drop policy if exists dm_reactions_delete on public.dm_reactions;
create policy dm_reactions_delete on public.dm_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.dm_reactions_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_op = 'UPDATE' and new.emoji = old.emoji then return null; end if;
  select sender_id into owner from public.dm_messages where id = new.message_id;
  perform public.notify(owner, 'dm', new.user_id, new.user_id, new.emoji);
  return null;
end;
$$;
revoke execute on function public.dm_reactions_notify() from public, anon, authenticated;
drop trigger if exists dm_reactions_notify_trg on public.dm_reactions;
create trigger dm_reactions_notify_trg after insert or update on public.dm_reactions
  for each row execute function public.dm_reactions_notify();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_reactions') then
    alter publication supabase_realtime add table public.dm_reactions;
  end if;
end $$;

-- =====================================================================
--  DENUNCIAR A UNA PERSONA (2026-11-23)
--  target_type 'profile': un alumno denuncia a otro alumno (nombre, foto,
--  acoso repartido…) desde su ficha o al bloquearle. Solo a quien puede ver.
-- =====================================================================
alter table public.moderation_reports drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check
  check (target_type in ('feed_post', 'feed_comment', 'listening_comment', 'dm_message', 'profile'));

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
    when 'dm_message'        then exists (select 1 from public.dm_messages        where id = i and recipient_id = auth.uid())
    when 'profile'           then i <> auth.uid() and public.can_see_profile(i)
                                  and exists (select 1 from public.profiles where id = i and role = 'student')
    else false
  end;
$$;

drop trigger if exists cleanup_profiles on public.profiles;
create trigger cleanup_profiles after delete on public.profiles
  for each row execute function public.cleanup_target_links('profile');

-- =====================================================================
--  ESCUCHA ANALÍTICA: REACCIONES A LAS RESPUESTAS Y "LEÍDO" (2026-11-23)
--  El profesor reacciona con cualquier emoji a cada una de las 6 respuestas
--  de un alumno (una reacción por respuesta) y marca el conjunto como leído
--  (listening_assignments.teacher_read_at). Solo lo ven ese alumno y el profesor.
--  Si el alumno cambia sus respuestas después, la marca de leído se quita sola.
--  Aviso al alumno: 'listening_feedback' (uno por escucha mientras no lo lea).
-- =====================================================================
alter table public.listening_assignments add column if not exists teacher_read_at timestamptz;

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
    -- "Leído" solo lo pone el profesor; si el alumno cambia sus respuestas, deja de estar leído
    new.teacher_read_at := case when new.answers is distinct from old.answers then null else old.teacher_read_at end;
  end if;
  -- updated_at solo cambia cuando el ALUMNO toca su progreso (respuestas o check),
  -- no cuando el profesor edita fecha o nota. Así "respuestas recientes" es fiable.
  if new.answers is distinct from old.answers or new.listened is distinct from old.listened then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create table if not exists public.listening_answer_reactions (
  assignment_id uuid not null references public.listening_assignments(id) on delete cascade,
  question      text not null check (question in ('highlights', 'likes', 'dislikes', 'learned', 'would_use', 'would_never_use')),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  emoji         text not null check (char_length(emoji) between 1 and 32),
  created_at    timestamptz not null default now(),
  primary key (assignment_id, question, user_id)
);
create index if not exists listening_answer_reactions_user_idx on public.listening_answer_reactions (user_id);
grant select, insert, update, delete on public.listening_answer_reactions to authenticated;
revoke all on public.listening_answer_reactions from anon;
alter table public.listening_answer_reactions enable row level security;

drop policy if exists listening_answer_reactions_select on public.listening_answer_reactions;
create policy listening_answer_reactions_select on public.listening_answer_reactions for select to authenticated
  using (public.is_teacher()
         or (public.is_approved() and exists (select 1 from public.listening_assignments a
                                              where a.id = assignment_id and a.student_id = (select auth.uid()))));
drop policy if exists listening_answer_reactions_insert_teacher on public.listening_answer_reactions;
create policy listening_answer_reactions_insert_teacher on public.listening_answer_reactions for insert to authenticated
  with check (public.is_teacher() and user_id = (select auth.uid()));
drop policy if exists listening_answer_reactions_update_teacher on public.listening_answer_reactions;
create policy listening_answer_reactions_update_teacher on public.listening_answer_reactions for update to authenticated
  using (public.is_teacher() and user_id = (select auth.uid()))
  with check (public.is_teacher() and user_id = (select auth.uid()));
drop policy if exists listening_answer_reactions_delete_teacher on public.listening_answer_reactions;
create policy listening_answer_reactions_delete_teacher on public.listening_answer_reactions for delete to authenticated
  using (public.is_teacher() and user_id = (select auth.uid()));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('board_post', 'assignment', 'dm', 'comment', 'reaction', 'signup', 'report', 'homework',
                  'mention_feed', 'mention_board', 'mention_listening', 'lesson',
                  'classmate_request', 'classmate_accept', 'account_deleted', 'goal', 'listening_feedback'));

-- Un solo aviso por escucha: notify() no repite uno igual que siga sin leer (target = la escucha, extra = su título)
create or replace function public.listening_feedback_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record; who uuid := auth.uid();
begin
  if tg_table_name = 'listening_answer_reactions' then
    if tg_op = 'UPDATE' and new.emoji = old.emoji then return null; end if;
    who := new.user_id;
    select la.student_id, la.item_id, li.title into a
      from public.listening_assignments la join public.listening_items li on li.id = la.item_id
      where la.id = new.assignment_id;
  else -- listening_assignments: el profesor lo acaba de marcar como leído
    if new.teacher_read_at is null or old.teacher_read_at is not null then return null; end if;
    select new.student_id, new.item_id, li.title into a from public.listening_items li where li.id = new.item_id;
  end if;
  if a.student_id is not null then
    perform public.notify(a.student_id, 'listening_feedback', who, a.item_id, a.title);
  end if;
  return null;
end;
$$;
revoke execute on function public.listening_feedback_notify() from public, anon, authenticated;
drop trigger if exists listening_answer_reactions_notify_trg on public.listening_answer_reactions;
create trigger listening_answer_reactions_notify_trg after insert or update on public.listening_answer_reactions
  for each row execute function public.listening_feedback_notify();
drop trigger if exists listening_assignments_read_notify_trg on public.listening_assignments;
create trigger listening_assignments_read_notify_trg after update of teacher_read_at on public.listening_assignments
  for each row execute function public.listening_feedback_notify();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listening_answer_reactions') then
    alter publication supabase_realtime add table public.listening_answer_reactions;
  end if;
end $$;

-- =====================================================================
--  ESCUCHA ANALÍTICA · CARPETAS, GÉNEROS Y ARTISTA (2026-11-24)
--   · listening_folders: colecciones como las de Spotify ("Essentials",
--     "Yuri's Tops"…). Una escucha va en una carpeta o en ninguna.
--   · listening_genres: lista cerrada de géneros en dos niveles
--     (género → subgénero). Solo el profesor la cambia.
--   · listening_item_genres: los géneros de cada escucha (varios).
--   · listening_items.artist: lo rellena la app (Spotify/YouTube).
--     '' = ya se buscó y no hay uno solo (playlist de varios artistas).
--  Los alumnos ven las carpetas y géneros de sus escuchas.
-- =====================================================================
create table if not exists public.listening_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists listening_folders_name_key on public.listening_folders (lower(btrim(name)));

create table if not exists public.listening_genres (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  parent_id  uuid references public.listening_genres(id) on delete cascade,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists listening_genres_name_key
  on public.listening_genres (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

create table if not exists public.listening_item_genres (
  item_id  uuid not null references public.listening_items(id) on delete cascade,
  genre_id uuid not null references public.listening_genres(id) on delete cascade,
  primary key (item_id, genre_id)
);
create index if not exists listening_item_genres_genre_idx on public.listening_item_genres (genre_id);

alter table public.listening_items add column if not exists folder_id uuid references public.listening_folders(id) on delete set null;
alter table public.listening_items add column if not exists artist text check (artist is null or char_length(artist) <= 200);
create index if not exists listening_items_folder_idx on public.listening_items (folder_id);

-- Solo dos niveles: un subgénero no puede tener subgéneros, ni colgar de sí mismo
create or replace function public.listening_genres_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id
       or exists (select 1 from public.listening_genres g where g.id = new.parent_id and g.parent_id is not null)
       or exists (select 1 from public.listening_genres g where g.parent_id = new.id) then
      raise exception 'Los géneros solo tienen dos niveles (género y subgénero)';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.listening_genres_guard() from public, anon, authenticated;
drop trigger if exists listening_genres_guard_trg on public.listening_genres;
create trigger listening_genres_guard_trg before insert or update of parent_id on public.listening_genres
  for each row execute function public.listening_genres_guard();

grant select, insert, update, delete on public.listening_folders, public.listening_genres, public.listening_item_genres to authenticated;
revoke all on public.listening_folders, public.listening_genres, public.listening_item_genres from anon;
alter table public.listening_folders     enable row level security;
alter table public.listening_genres      enable row level security;
alter table public.listening_item_genres enable row level security;

drop policy if exists listening_folders_select on public.listening_folders;
create policy listening_folders_select on public.listening_folders for select to authenticated
  using (public.is_teacher()
         or (public.is_approved() and exists (
              select 1 from public.listening_items i join public.listening_assignments a on a.item_id = i.id
              where i.folder_id = listening_folders.id and a.student_id = (select auth.uid()))));
drop policy if exists listening_folders_all_teacher on public.listening_folders;
create policy listening_folders_all_teacher on public.listening_folders for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists listening_genres_select on public.listening_genres;
create policy listening_genres_select on public.listening_genres for select to authenticated
  using (public.is_approved());
drop policy if exists listening_genres_all_teacher on public.listening_genres;
create policy listening_genres_all_teacher on public.listening_genres for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists listening_item_genres_select on public.listening_item_genres;
create policy listening_item_genres_select on public.listening_item_genres for select to authenticated
  using (public.is_teacher()
         or (public.is_approved() and exists (
              select 1 from public.listening_assignments a
              where a.item_id = listening_item_genres.item_id and a.student_id = (select auth.uid()))));
drop policy if exists listening_item_genres_all_teacher on public.listening_item_genres;
create policy listening_item_genres_all_teacher on public.listening_item_genres for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

do $$
declare t text;
begin
  foreach t in array array['listening_folders', 'listening_genres', 'listening_item_genres'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
--  RECHAZAR ALUMNOS Y CORREOS BLOQUEADOS (2026-11-24)
--   · Rechazar a un pendiente = borrar su cuenta (Edge Function
--     "delete-account"): account_delete_check deja al profesor borrar
--     archivados y también pendientes de aprobar.
--   · blocked_emails: correos (kind 'email', normalizados con email_norm:
--     minúsculas, sin "+etiqueta" y, en Gmail, sin puntos) y dominios
--     (kind 'domain', incluye sus subdominios). Solo el profesor la ve.
--   · El trigger auth_users_block_trg en auth.users impide registrarse
--     (o cambiar el email) con uno bloqueado. Supabase responde entonces
--     "Database error saving new user" y la app da un mensaje genérico.
--   · Bloquear no afecta a cuentas que ya existen.
-- =====================================================================
create or replace function public.email_norm(e text)
returns text language sql immutable set search_path = '' as $$
  select case when position('@' in x) < 2 then null else
    (case when d in ('gmail.com', 'googlemail.com')
          then replace(split_part(l, '+', 1), '.', '')
          else split_part(l, '+', 1) end)
    || '@' || (case when d = 'googlemail.com' then 'gmail.com' else d end) end
  from (select x, split_part(x, '@', 1) as l, split_part(x, '@', 2) as d
        from (select lower(trim(coalesce(e, ''))) as x) s) t;
$$;

create table if not exists public.blocked_emails (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('email', 'domain')),
  pattern    text not null check (char_length(pattern) between 3 and 254),
  created_at timestamptz not null default now(),
  unique (kind, pattern)
);
alter table public.blocked_emails enable row level security;
revoke all on table public.blocked_emails from public, anon;
grant select, insert, update, delete on public.blocked_emails to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'blocked_emails' and policyname = 'blocked_emails_all_teacher') then
    create policy blocked_emails_all_teacher on public.blocked_emails for all to authenticated
      using (public.is_teacher()) with check (public.is_teacher());
  end if;
end $$;

-- Guarda siempre la forma normalizada ("N.ombre+x@Gmail.com" = "nombre@gmail.com")
create or replace function public.blocked_emails_norm()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind = 'email' then
    new.pattern := public.email_norm(new.pattern);
    if new.pattern is null or new.pattern !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Ese correo no es válido' using errcode = '23514';
    end if;
  else
    new.pattern := lower(trim(both '@ ' from coalesce(new.pattern, '')));
    if new.pattern !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then
      raise exception 'Ese dominio no es válido' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.blocked_emails_norm() from public, anon, authenticated;
create or replace trigger blocked_emails_norm_trg before insert or update on public.blocked_emails
  for each row execute function public.blocked_emails_norm();

create or replace function public.is_email_blocked(e text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_emails b
    where (b.kind = 'email' and b.pattern = public.email_norm(e))
       or (b.kind = 'domain' and (split_part(lower(trim(e)), '@', 2) = b.pattern
                                  or split_part(lower(trim(e)), '@', 2) like '%.' || b.pattern)));
$$;
revoke execute on function public.is_email_blocked(text) from public, anon, authenticated;

create or replace function public.auth_users_block_fn()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and public.is_email_blocked(new.email) then
    raise exception 'blocked_email';
  end if;
  return new;
end;
$$;
revoke execute on function public.auth_users_block_fn() from public, anon, authenticated;
create or replace trigger auth_users_block_trg
  before insert or update of email on auth.users
  for each row execute function public.auth_users_block_fn();

-- El profesor puede borrar archivados y también pendientes de aprobar (rechazar)
create or replace function public.account_delete_check(p_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid := coalesce(p_id, auth.uid());
  r public.profiles;
begin
  if me is null then raise exception 'No autorizado'; end if;
  select * into r from public.profiles where id = target;
  if not found then raise exception 'Esa cuenta no existe'; end if;
  if r.role <> 'student' then raise exception 'La cuenta del profesor no se borra desde la app'; end if;
  if target <> me and not (public.is_teacher() and (r.archived_at is not null or not r.approved)) then
    raise exception 'Solo se puede borrar a un alumno archivado o pendiente de aprobar';
  end if;
  return target;
end;
$$;
revoke execute on function public.account_delete_check(uuid) from public, anon;
grant  execute on function public.account_delete_check(uuid) to authenticated;
