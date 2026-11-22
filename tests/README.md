# Pruebas simuladas

Prueban `../index.html` contra un Supabase **falso en memoria** (`fake-supabase.js`) que imita las reglas RLS de `supabase.sql`. Los datos de partida están en `seed.js`: profesor t1, alumnas/os s1 Marta, s2 Luis (apodo "Lu", con avatar malicioso a propósito) y s3 sin aprobar.

```
cd tests
npm install
npx playwright install chromium
npm test
```

- `test-core.js`: Inicio, Avisos, Escucha, Perfil, privacidad básica (48 comprobaciones).
- `test-social.js`: Feed, comentarios, reacciones, denuncias, moderación, apodo/foto, seguridad (68 comprobaciones).
- Capturas en `tests/shots/`.

**Ojo:** si cambias `supabase.sql` (tablas, políticas), actualiza `fake-supabase.js` para que la simulación siga reflejando la base de datos real. La simulación no sustituye probar en el Supabase real.
