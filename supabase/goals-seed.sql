-- Yurimh Music Academy · Carga inicial de la lista general de objetivos (2026-11-23).
-- Solo inserta si no hay ningún objetivo general; no duplica.

-- Lista general (del documento "Lecciones Clases de Guitarra"). Solo se carga si aún no hay ninguna.
insert into public.goals_stages (stage, title) values
  (1, 'Primeros pasos'), (2, 'Técnica de base'), (3, 'Primeros acordes y punteos'), (4, 'Cejilla'),
  (5, 'Rock y power chords'), (6, 'Arpegios con los dedos'), (7, 'Escalas'), (8, 'Acordes avanzados'),
  (9, 'Técnica solista'), (10, 'Melodía e improvisación'), (11, 'Canciones y oído'),
  (12, 'Recursos de guitarra solista'), (13, 'Técnica avanzada'), (14, 'Más allá de la guitarra')
on conflict (stage) do nothing;

insert into public.goals_items (stage, sort, title, details)
select v.stage, v.sort, v.title, v.details
from (values
  (1, 10, 'Nombrar las partes de la guitarra', null),
  (1, 20, 'Notas de las cuerdas', null),
  (1, 30, 'Afinar la guitarra', null),
  (1, 40, 'Posición sentado y de pie', null),
  (2, 10, 'Escala cromática', 'Como ejercicio de calentamiento y de práctica'),
  (2, 20, 'Técnica correcta de mano derecha', 'Púa correcta, apoyar en el puente, posición de la mano'),
  (2, 30, 'Técnica correcta de mano izquierda', 'Usar la yema, apretar la cuerda, dedo al final del traste, arquear mano y dedos, pulgar en posición; se mueve toda la mano al cambiar de posición'),
  (3, 10, 'Acordes básicos', null),
  (3, 20, 'Punteos a una cuerda', 'Smoke on the Water…'),
  (4, 10, 'Acordes con cejilla en la 6ª cuerda', 'Mayores, menores, séptima y séptima menor'),
  (4, 20, 'Acordes con cejilla en la 5ª cuerda', 'Mayores, menores, séptima y séptima menor'),
  (5, 10, 'Punteos a varias cuerdas', 'Cumpleaños feliz'),
  (5, 20, 'Power chords', null),
  (5, 30, 'Canciones con power chords', 'Pop punk, Smoke on the Water, Scorpions, riffs rockeros'),
  (5, 40, 'Rock and roll / blues', 'Rueda de acordes'),
  (5, 50, 'Mutear y aprender a tocar limpio', null),
  (6, 10, 'Arpegiar con los dedos', null),
  (6, 20, 'Una canción con arpegios', null),
  (7, 10, 'Escala mayor', null),
  (7, 20, 'Escala menor', null),
  (7, 30, 'Escala menor armónica', null),
  (7, 40, 'Escala disminuida', null),
  (7, 50, 'Escala pentatónica', null),
  (8, 10, 'Acordes de 7ª y 9ª', null),
  (8, 20, 'Acordes con 2ª y/o 4ª aumentada en piano', null),
  (8, 30, 'Inversiones de acordes', null),
  (9, 10, 'Variación larga de la escala mayor', null),
  (9, 20, 'Variación larga de la escala pentatónica', null),
  (9, 30, 'Variación de la escala disminuida en 3ª y 1ª cuerda', 'A tres dedos o con tapping'),
  (9, 40, 'Bendings', null),
  (10, 10, 'Formar una melodía', 'Presentación, variación, repetición, destrucción'),
  (10, 20, 'Improvisar solos y melodías con escalas', null),
  (11, 10, 'Aprender ruedas de acordes típicas', null),
  (11, 20, 'Estructurar las partes de una canción', 'Intro, verso, estribillo, puente, solo, outro…'),
  (11, 30, 'Sacar canciones de oído', null),
  (12, 10, 'Armonizar punteos por terceras', null),
  (12, 20, 'Riffs de metalcore alternando cuerdas', null),
  (12, 30, 'Armónicos naturales', null),
  (12, 40, 'Armónicos artificiales', null),
  (12, 50, 'Tapping', null),
  (13, 10, 'Arpegios mayores, menores y disminuidos', null),
  (13, 20, 'Sweep picking', null),
  (13, 30, 'Dive bomb', null),
  (14, 10, 'Modos griegos', null),
  (14, 20, 'Orquestación', null),
  (14, 30, 'Guitar Pro', null),
  (14, 40, 'DAW', null)
) as v(stage, sort, title, details)
where not exists (select 1 from public.goals_items where student_id is null);

select (select count(*) from public.goals_stages) as etapas,
       (select count(*) from public.goals_items where student_id is null) as objetivos;
