'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { autorizar } = require('./autorizacion');
const runtime = autorizar();
const { autorizarRuntime, exigirRuntime } = require('../../functions/contabilidad_preparacion_acreditada_demo/runtime');
const { verificarEntorno, verificarCliente } = require('../../functions/contabilidad_preparacion_acreditada_demo/entorno');
const { crearPreparador } = require('../../functions/contabilidad_preparacion_acreditada_demo/preparacion');
const env = { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' };
test('autorizacion local explicita nunca equivale a admin-4/admin-5 acreditado', () => {
  const r = exigirRuntime(runtime, true); assert.equal(r.inventarioId, 'ensayo-fin-1E-1');
  assert.equal(r.acreditacionAdministrativa, 'PENDIENTE'); assert.equal(r.inventarioCandidato, 'admin-5');
});
test('runtime sin politica o capacidad falsificada rechaza antes de tocar DB', () => {
  assert.throws(() => autorizarRuntime()); assert.throws(() => exigirRuntime({}));
  assert.throws(() => crearPreparador({ db: new Proxy({}, { get() { assert.fail('DB antes del runtime'); } }), runtime: {} }));
});
test('descriptor recalculado no sustituye autorizacion independiente', () => {
  const b = fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json'));
  assert.throws(() => autorizarRuntime({ manifiesto: Buffer.concat([b, Buffer.from(' ')]), sha256Autorizado: exigirRuntime(runtime).huellaSoftware }));
});
test('fuentes nuevas no acreditadas mantienen rechazo administrativo original', () => {
  assert.throws(() => require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-4'),
    e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('admin-6 acredita codigo actual pero no cambia identidad ni permiso local', () => {
  const c = require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-6');
  assert.equal(c.metadatos.inventarioId, 'admin-6');
  assert.equal(exigirRuntime(runtime).tipo, 'ENSAYO_LOCAL_FIJADO');
  assert.equal(exigirRuntime(runtime).acreditacionAdministrativa, 'PENDIENTE');
});
test('manifiesto local original se conserva y no se acepta en un arbol con registro nuevo', () => {
  const viejo = fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin4.json'));
  assert.equal(require('node:crypto').createHash('sha256').update(viejo).digest('hex'),
    'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2');
  assert.throws(() => autorizarRuntime({ manifiesto: viejo,
    sha256Autorizado: 'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2' }));
});
test('archivo extra incluso en un subdirectorio llamado test rechaza inventario local', () => {
  const vm = require('node:vm'), base = path.resolve(__dirname, '../../functions/contabilidad_preparacion_acreditada_demo');
  const falsoFs = new Proxy(fs, { get(t, k) {
    if (k !== 'readdirSync') return t[k];
    return (r, o) => {
      if (r === path.join(base, 'test')) return [{ name: 'extra.js', isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }];
      const lista = t.readdirSync(r, o);
      if (r === base) return [...lista, { name: 'test', isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false }];
      return lista;
    };
  } });
  const sandbox = { module: { exports: {} }, __dirname: base, Buffer,
    require: nombre => nombre === 'node:fs' ? falsoFs : require(nombre) };
  vm.runInNewContext(fs.readFileSync(path.join(base, 'runtime.js'), 'utf8'), sandbox);
  assert.throws(() => sandbox.module.exports.autorizarRuntime({
    manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')),
    sha256Autorizado: exigirRuntime(runtime).huellaSoftware }));
});
test('destino demo cerrado valido', () => assert.doesNotThrow(() => verificarEntorno(env)));
for (const [k, v] of Object.entries({ GCLOUD_PROJECT: 'real', GOOGLE_CLOUD_PROJECT: 'real', FIREBASE_PROJECT: 'real',
  FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443', GOOGLE_APPLICATION_CREDENTIALS: 'x', FIREBASE_TOKEN: 'x',
  GOOGLE_OAUTH_ACCESS_TOKEN: 'x', FIREBASE_CREDENTIALS: 'x', GOOGLE_CLOUD_KEYFILE_JSON: 'x', GCLOUD_KEYFILE_JSON: 'x',
  CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: 'x', CLOUDSDK_AUTH_ACCESS_TOKEN: 'x', NODE_OPTIONS: '--require otro',
  FIRESTORE_DATABASE_ID: 'otra', FIREBASE_CONFIG: '{"projectId":"real"}', FUNCTIONS_EMULATOR_HOST: 'x', FIREBASE_AUTH_EMULATOR_HOST: 'x' })) {
  test('rechazo de entorno ' + k, () => assert.throws(() => verificarEntorno({ ...env, [k]: v })));
}
test('entorno ausente rechaza', () => assert.throws(() => verificarEntorno({})));
for (const [k, v] of Object.entries({ servicePath: 'firestore.googleapis.com', port: 443, ssl: true, databaseId: 'otra' })) {
  test('cliente remoto/configuracion ' + k, () => assert.throws(() => verificarCliente({ projectId: 'demo-fesync',
    _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false, [k]: v } })));
}
for (const valor of [false, Promise.resolve(true)]) test('custodia estricta ' + String(valor), () => assert.throws(() =>
  crearPreparador({ runtime, env, db: { projectId: 'demo-fesync', _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false } },
    custodia: { verificar: () => valor } })));
