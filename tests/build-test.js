// Genera tests/test.html a partir de ../index.html, cambiando Supabase real por el simulado.
const fs = require('fs'), path = require('path');
let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cdn = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/;
if (!cdn.test(html) || !html.includes('<script src="config.js"></script>')) {
  console.error('No encuentro las etiquetas <script> esperadas en index.html'); process.exit(1);
}
html = html.replace(cdn, '<script src="seed.js"></script><script src="fake-supabase.js"></script>')
           .replace('<script src="config.js"></script>', '<script src="config.test.js"></script>');
fs.writeFileSync(path.join(__dirname, 'test.html'), html);
fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
console.log('tests/test.html generado');
