'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
// Estas guardas prueban el runtime histórico aislado, sin acreditar el actual.
const historico = require('./soporte/runtime_historico').cargarHistorico();
const { verificarEntorno, verificarAntesDeArranque } = historico.cargar('contabilidad_demo/entorno');
const { crearTransicionDemo, ESCRITORES } = historico.cargar('contabilidad_demo/transicion');
const { verificarFuentes } = historico.cargar('contabilidad_demo/fuentes');
const env = () => ({ GCLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' });
const db = () => ({ projectId: 'demo-fesync', _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false } });
const custodia = () => ({ emuladorExclusivo: true, administrador: true, escritores: [...ESCRITORES] });
test('Guardas no abren red ni inicializan Firebase', () => {
  verificarEntorno(env()); verificarAntesDeArranque({});
  assert.ok(crearTransicionDemo({ db: db(), env: env(), custodia: custodia() }));
});
for (const [k, v] of Object.entries({
  GCLOUD_PROJECT: 'fesync-real', GOOGLE_CLOUD_PROJECT: 'real', FIREBASE_PROJECT: 'real',
  FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443', FIRESTORE_DATABASE_ID: 'otra',
  GOOGLE_APPLICATION_CREDENTIALS: 'prohibido', FIREBASE_TOKEN: 'prohibido',
  GOOGLE_OAUTH_ACCESS_TOKEN: 'prohibido', FIREBASE_CREDENTIALS: 'prohibido',
  GOOGLE_CLOUD_KEYFILE_JSON: 'prohibido', GCLOUD_KEYFILE_JSON: 'prohibido',
  CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: 'prohibido', CLOUDSDK_AUTH_ACCESS_TOKEN: 'prohibido',
  FIREBASE_CONFIG: '{"projectId":"real"}',
})) test('Guardia rechaza ' + k + ' antes de SDK', () => {
  assert.throws(() => verificarEntorno({ ...env(), [k]: v }));
  assert.throws(() => verificarAntesDeArranque({ [k]: v }));
});
for (const k of ['GCLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST']) test('Guardia exige ' + k, () => {
  const e = env(); delete e[k]; assert.throws(() => verificarEntorno(e));
});
for (const [k, v] of [['servicePath', 'firestore.googleapis.com'], ['port', 443], ['ssl', true]]) test('Cliente real prohibido: ' + k, () => {
  const d = db(); d._settings[k] = v;
  assert.throws(() => crearTransicionDemo({ db: d, env: env(), custodia: custodia() }));
});
for (const c of [null, {}, { ...custodia(), administrador: false }, { ...custodia(), emuladorExclusivo: false },
  { ...custodia(), escritores: [...ESCRITORES, 'desconocido'] }]) test('No escribir sin precondiciones de custodia: ' + JSON.stringify(c), () => {
  assert.throws(() => crearTransicionDemo({ db: db(), env: env(), custodia: c }));
});
test('Inventario historico coincide con su fixture de fuentes exactas, sin modificar archivos', () => {
  assert.match(verificarFuentes(), /^[a-f0-9]{64}$/);
});
test('Alterar el inventario original impide acreditar su identidad historica', t => {
  const fs = require('node:fs'), leer = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (ruta, ...args) => {
    if (String(ruta).endsWith('fuentes_v1.json')) {
      const fuentes = JSON.parse(leer(ruta, 'utf8')); fuentes['escritor_desconocido.js'] = '0'.repeat(64);
      return JSON.stringify(fuentes);
    }
    return leer(ruta, ...args);
  });
  assert.throws(verificarFuentes, e => e.codigo === 'DEMO_HISTORICO_NO_ACREDITADO');
});
