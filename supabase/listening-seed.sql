-- Yurimh Music Academy · Lista inicial de géneros de Escucha analítica (2026-11-24)
-- Se ejecuta una vez después de schema.sql. Es idempotente: si un género ya existe, no lo repite.
-- Después, la lista la cambia el profesor desde la app (Escucha analítica → Géneros).
with g(name, pos, subs) as (values
  ('Metal',          1, array['Heavy metal', 'Thrash metal', 'Power metal', 'Metal sinfónico', 'Death metal melódico', 'Metalcore y post-hardcore']),
  ('Rock',           2, array['Rock clásico', 'Hard rock', 'Glam y AOR', 'Rock progresivo', 'Pop punk y pop rock', 'J-rock y visual kei']),
  ('Pop',            3, array['Pop internacional', 'Pop en español', 'K-pop', 'J-pop y anime']),
  ('Electrónica',    4, array['Synthwave', 'Trance', 'Eurodance y eurobeat', 'Hard dance']),
  ('Urbano',         5, array['Reguetón']),
  ('Clásica',        6, array['Barroco', 'Romántico']),
  ('Bandas sonoras', 7, array['Cine', 'Videojuegos', 'Música épica y tráileres'])
), parents as (
  insert into public.listening_genres (name, position)
  select name, pos from g
  where not exists (select 1 from public.listening_genres x where x.parent_id is null and lower(x.name) = lower(g.name))
  returning id, name
), allp as (
  select id, name from parents
  union all
  select x.id, x.name from public.listening_genres x join g on lower(g.name) = lower(x.name) where x.parent_id is null
)
insert into public.listening_genres (name, parent_id, position)
select s.name, p.id, s.ord
from g join allp p on lower(p.name) = lower(g.name)
cross join lateral unnest(g.subs) with ordinality as s(name, ord)
where not exists (select 1 from public.listening_genres x where x.parent_id = p.id and lower(x.name) = lower(s.name));
