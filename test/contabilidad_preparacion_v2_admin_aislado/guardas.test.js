'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { autorizar } = require('./autorizacion');
const { autorizarEnsayo, autorizarAdministrativo, exigirRuntime } = require('../../functions/contabilidad_preparacion_v2_admin_demo/runtime');
const { crearPreparador } = require('../../functions/contabilidad_preparacion_v2_admin_demo/preparacion');
const { verificarEntorno } = require('../../functions/contabilidad_preparacion_acreditada_demo/entorno');
const runtime = autorizar();
const env = { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' };
test('capacidad privada de candidato, sin acreditacion ni elegibilidad', () => {
  const r = exigirRuntime(runtime, true);
  assert.equal(r.tipo, 'CANDIDATO_LOCAL_NO_ACREDITADO');
  assert.equal(r.acreditacionAdministrativa, 'PENDIENTE');
  assert.equal(r.inventarioId, 'ensayo-fin-1H-1');
  assert(Object.isFrozen(r)); assert(Object.isFrozen(runtime));
});
for (const falso of [{}, 'admin-5', { inventarioId: 'admin-5', huellaSoftware: 'a'.repeat(64) },
  Object.freeze({ tipo: 'RUNTIME_ADMINISTRATIVO_VERIFICADO' })]) {
  test('identidad arbitraria no es capacidad: ' + JSON.stringify(falso), () => {
    assert.throws(() => exigirRuntime(falso), /E_RUNTIME_NO_AUTORIZADO/);
    assert.throws(() => crearPreparador({ runtime: falso, db: new Proxy({}, { get() { assert.fail('DB antes del runtime'); } }) }), /E_RUNTIME_NO_AUTORIZADO/);
  });
}
test('admin-5 rechaza honestamente el arbol ampliado; no hay acreditacion implicita', () => {
  assert.throws(() => autorizarAdministrativo({ inventarioId: 'admin-5' }), e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('id administrativo desconocido y descriptor arbitrario rechazados', () => {
  assert.throws(() => autorizarAdministrativo({ inventarioId: 'admin-999' }), e => e.codigo === 'DEMO_INVENTARIO_DESCONOCIDO');
  assert.throws(() => autorizarAdministrativo({ inventarioId: 'admin-5', huellaSoftware: 'a'.repeat(64) }), /E_RUNTIME_NO_AUTORIZADO/);
  assert.throws(() => autorizarAdministrativo({ inventarioId: 'ensayo-fin-1H-1' }), /E_RUNTIME_NO_AUTORIZADO/);
});
test('otra capacidad privada local no es intercambiable', () => {
  const local = require('../../functions/contabilidad_preparacion_acreditada_demo/runtime');
  assert.throws(() => local.exigirRuntime(runtime), /E_RUNTIME_NO_AUTORIZADO/);
});
test('politica local requiere digest externo y version exacta', () => {
  const b = fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json'));
  assert.throws(() => autorizarEnsayo({ manifiesto: b, sha256Autorizado: 'a'.repeat(64) }));
  assert.throws(() => autorizarEnsayo({ manifiesto: Buffer.concat([b, Buffer.from(' ')]), sha256Autorizado: exigirRuntime(runtime).huellaSoftware }));
  assert.throws(() => autorizarEnsayo({ manifiesto: b, sha256Autorizado: exigirRuntime(runtime).huellaSoftware, acreditacionAdministrativa: 'ACREDITADA' }));
});
test('fuente adulterada rechazada al revalidar sin cambiar la identidad', t => {
  const leer = fs.readFileSync.bind(fs), objetivo = path.resolve(__dirname, '../../functions/contabilidad_preparacion_v2_admin_demo/preparacion.js');
  t.mock.method(fs, 'readFileSync', (r, ...args) => path.resolve(String(r)) === objetivo ? Buffer.concat([leer(r), Buffer.from('// adulterado')]) : leer(r, ...args));
  assert.throws(() => exigirRuntime(runtime, true), /E_RUNTIME_NO_AUTORIZADO/);
  assert.equal(exigirRuntime(runtime).acreditacionAdministrativa, 'PENDIENTE');
});
test('fuente nueva no inventariada rechazada sin usar filtro de pruebas anidadas', t => {
  const leer = fs.readdirSync.bind(fs), raiz = path.resolve(__dirname, '../../functions/contabilidad_preparacion_v2_admin_demo');
  t.mock.method(fs, 'readdirSync', (r, ...args) => {
    const lista = leer(r, ...args);
    return path.resolve(String(r)) === raiz ? [...lista, { name: 'extra.js', isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true }] : lista;
  });
  assert.throws(() => exigirRuntime(runtime, true), /E_RUNTIME_NO_AUTORIZADO/);
});
for (const [k, v] of Object.entries({ GCLOUD_PROJECT: 'real', GOOGLE_CLOUD_PROJECT: 'real',
  FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443', GOOGLE_APPLICATION_CREDENTIALS: 'x',
  NODE_OPTIONS: '--require intruso', FIREBASE_CONFIG: '{"projectId":"real"}' })) {
  test('entorno prohibido ' + k, () => assert.throws(() => verificarEntorno({ ...env, [k]: v })));
}
test('custodia debe ser sincrona y explicita', () => {
  for (const valor of [false, Promise.resolve(true)]) assert.throws(() => crearPreparador({ runtime, env,
    db: { projectId: 'demo-fesync', _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false } },
    custodia: { verificar: () => valor } }));
});
test('codigo trasladado a un directorio excluido nunca obtiene capacidad', () => {
  const vm = require('node:vm');
  const s = fs.readFileSync(path.join(__dirname, '../../functions/contabilidad_preparacion_v2_admin_demo/runtime.js'), 'utf8');
  const sandbox = { module: { exports: {} }, Buffer, require,
    manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')),
    sha256Autorizado: exigirRuntime(runtime).huellaSoftware,
    __dirname: path.resolve(__dirname, '../../test/node_modules') };
  const contexto = vm.createContext(sandbox);
  vm.runInContext(s, contexto);
  // Crear opciones en el MISMO realm evita que el rechazo de prototipo
  // enmascare la comprobacion de ubicacion que esta prueba debe demostrar.
  assert.throws(() => vm.runInContext('module.exports.autorizarAdministrativo({inventarioId:"admin-5"})', contexto), /E_RUNTIME_NO_AUTORIZADO/);
  assert.throws(() => vm.runInContext('module.exports.autorizarEnsayo({manifiesto,sha256Autorizado})', contexto), /E_RUNTIME_NO_AUTORIZADO/);
});
test('enlace en un ancestro de metadatos se rechaza antes de seguirlo', t => {
  const stat = fs.lstatSync.bind(fs), objetivo = path.resolve(__dirname, '../../functions/contabilidad_demo/inventarios');
  t.mock.method(fs, 'lstatSync', (r, ...args) => path.resolve(String(r)) === objetivo ?
    { isSymbolicLink: () => true } : stat(r, ...args));
  assert.throws(() => exigirRuntime(runtime, true), /E_RUNTIME_NO_AUTORIZADO/);
});
test('admin-6 autentico no convierte la capacidad de ensayo en administrativa', () => {
  const cap = autorizarAdministrativo({ inventarioId: 'admin-6' });
  const i = exigirRuntime(cap, true);
  assert.equal(i.inventarioId, 'admin-6'); assert.equal(i.acreditacionAdministrativa, 'ACREDITADA');
  assert.equal(i.huellaSoftware, require('../../functions/contabilidad_demo/fuentes').verificarFuentes('admin-6'));
  assert.equal(exigirRuntime(runtime).acreditacionAdministrativa, 'PENDIENTE');
  assert.throws(() => exigirRuntime({ ...i }), /E_RUNTIME_NO_AUTORIZADO/);
});
test('politica H original se conserva y no se adopta tras cambiar registro', () => {
  const b = fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin5.json'));
  const h = '7fd4230de6414d577b91bb8850472727b6c0b8bd0bc56c4b0c672e231b8abd3b';
  assert.equal(require('node:crypto').createHash('sha256').update(b).digest('hex'), h);
  assert.throws(() => autorizarEnsayo({ manifiesto: b, sha256Autorizado: h }), /E_RUNTIME_NO_AUTORIZADO/);
});
test('preflight admin-6 detecta descriptor no enumerado por el runtime local historico', t => {
  const leer = fs.readFileSync.bind(fs), objetivo = path.resolve(__dirname, '../../functions/contabilidad_demo/inventarios/runtime_6.json');
  t.mock.method(fs, 'readFileSync', (r, ...args) => path.resolve(String(r)) === objetivo ?
    Buffer.concat([leer(r), Buffer.from(' ')]) : leer(r, ...args));
  assert.throws(autorizar, e => e.codigo === 'DEMO_INVENTARIO_ALTERADO');
});
