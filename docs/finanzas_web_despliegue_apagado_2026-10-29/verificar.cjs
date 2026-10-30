'use strict';
// Solo integridad local. No carga index.js, credenciales ni servicios remotos.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const root = __dirname, stage = path.join(root, 'paquete');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(m.proyecto, 'fesync-app-2026');
assert.equal(m.digest, sha(JSON.stringify(m.files)));
const expected = new Set(m.files.map(f => f.path));
function walk(dir, rel = '') {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.posix.join(rel, item.name), absolute = path.join(dir, item.name);
    if (name === 'functions/node_modules') {
      assert.equal(fs.realpathSync(absolute), fs.realpathSync(m.dependenciasLocalesReutilizadas));
      continue;
    }
    assert.equal(item.isSymbolicLink(), false, 'Enlace inesperado: ' + name);
    if (item.isDirectory()) walk(absolute, name);
    else assert.ok(expected.has(name), 'Archivo adicional: ' + name);
  }
}
walk(stage);
for (const f of m.files) {
  assert.ok(!f.path.includes('..') && !path.isAbsolute(f.path));
  const b = fs.readFileSync(path.join(stage, f.path));
  assert.equal(b.length, f.bytes, f.path);
  assert.equal(sha(b), f.sha256, f.path);
}
assert.equal(sha(fs.readFileSync(path.join(root, 'reglas-exactas.patch'))), m.parcheReglasHash);
const config = JSON.parse(fs.readFileSync(path.join(stage, 'firebase.json')));
assert.equal(config.hosting.site, m.proyecto);
assert.equal(config.hosting.public, 'hosting');
assert.equal(config.functions.source, 'functions');
assert.ok(config.functions.ignore.includes('node_modules'));
assert.ok(config.functions.ignore.includes('.env*'));
const env = fs.readFileSync(path.join(stage, 'functions/.env.fesync-app-2026'), 'utf8');
assert.match(env, /^FINANZAS_V1_SERVIDOR_HABILITADO=false\r?$/m);
assert.equal(m.clienteHabilitado, false);
assert.equal(m.servidorHabilitado, false);
assert.equal(m.canal, 'finanzas-piloto-8iyv');
assert.notEqual(m.canal, 'live');
assert.equal(m.plan.crear.length, 10);
assert.deepEqual(m.plan.actualizar, ['registrarNuevaIglesiaSegura', 'vincularUsuarioConCodigo']);
assert.deepEqual(m.plan.eliminar, []);
for (const name of ['firebase-functions', 'firebase-admin']) require.resolve(name, { paths: [path.join(stage, 'functions')] });
console.log(JSON.stringify({ archivos: m.files.length, digest: m.digest, cliente: false, servidor: false, remotoConsultado: false }));
