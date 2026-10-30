'use strict';
// Servidor local exclusivo de la compilación demo; no usa Firebase Admin ni credenciales.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const build = path.join(root, 'build/web');
const html = fs.readFileSync(path.join(root, 'web/finanzas_demo.html'), 'utf8');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const main = fs.readFileSync(path.join(build, 'main.dart.js'), 'utf8');
if (!main.includes('1:1234567890:web:demo-fesync') ||
    !main.includes('AIzaSyDemoFeSync00000000000000000000000')) {
  throw Error('La compilación no corresponde a lib/main_finanzas_demo.dart. No se sirve.');
}
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost:7358');
    if (new URL('http://' + req.headers.host).hostname !== 'localhost') {
      res.writeHead(400); res.end('Usa http://localhost:7358/finanzas_demo.html'); return;
    }
    if (url.pathname === '/' || url.pathname === '/finanzas_demo.html') {
      res.setHeader('Content-Type', tipos['.html']);
      res.end(req.method === 'HEAD' ? undefined : html); return;
    }
    const relativa = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const archivo = path.resolve(build, relativa);
    if (!archivo.startsWith(build + path.sep) ||
        ['firebase-messaging-sw.js', 'flutter_service_worker.js'].includes(relativa) ||
        !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', tipos[path.extname(archivo)] || 'application/octet-stream');
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(archivo).on('error', () => res.destroy()).pipe(res);
  } catch (_) {
    res.writeHead(400); res.end();
  }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(7358, 'localhost', () => {
  console.log('FeSync demo: http://localhost:7358/finanzas_demo.html');
  console.log('Solo emuladores 8088/9098/5008; sin service workers; sin Firebase real.');
});
