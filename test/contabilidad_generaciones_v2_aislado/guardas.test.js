'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verificarArranque, verificarEntorno, verificarCliente } = require('../../functions/contabilidad_generaciones_v2_demo/entorno');
const { parametros } = require('../../functions/contabilidad_generaciones_v2_demo/util');
const { crearPreparadorDemo } = require('../../functions/contabilidad_generaciones_v2_demo/preparacion');
const env = { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' };
test('destino cerrado demo explicito', () => assert.doesNotThrow(() => verificarEntorno(env)));
for (const [k, v] of Object.entries({ GCLOUD_PROJECT: 'real', GOOGLE_CLOUD_PROJECT: 'real', FIREBASE_PROJECT: 'real',
  FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443', GOOGLE_APPLICATION_CREDENTIALS: 'prohibido',
  FIREBASE_TOKEN: 'prohibido', GOOGLE_OAUTH_ACCESS_TOKEN: 'prohibido', FIREBASE_CREDENTIALS: 'prohibido',
  GOOGLE_CLOUD_KEYFILE_JSON: 'prohibido', GCLOUD_KEYFILE_JSON: 'prohibido', CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: 'prohibido',
  CLOUDSDK_AUTH_ACCESS_TOKEN: 'prohibido', FIREBASE_CONFIG: '{"projectId":"real"}', FIRESTORE_DATABASE_ID: 'otra',
  FIREBASE_AUTH_EMULATOR_HOST: 'otro:9099', FUNCTIONS_EMULATOR_HOST: 'otro:5001' })) {
  test('rechazo previo a SDK: ' + k, () => {
    assert.throws(() => verificarArranque({ ...env, [k]: v }));
    assert.throws(() => verificarEntorno({ ...env, [k]: v }));
  });
}
test('sin variables de emulador se rechaza', () => assert.throws(() => verificarEntorno({})));
for (const [k, v] of [['servicePath', 'firestore.googleapis.com'], ['port', 443], ['ssl', true]]) test('SDK remoto: ' + k, () => {
  assert.throws(() => verificarCliente({ projectId: 'demo-fesync', _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false, [k]: v } }));
});
for (const verificar of [() => false, () => Promise.resolve(true), null]) test('custodia no confirmada no autoriza ' + String(verificar), () => {
  assert.throws(() => crearPreparadorDemo({ env, db: { projectId: 'demo-fesync',
    _settings: { servicePath: '127.0.0.1', port: 8088, ssl: false } }, custodia: { verificar } }));
});
test('parametros no aceptan autoridad financiera ni identificadores ambiguos', () => {
  const p = { iglesiaId: 'iglesia', ejecucionId: 'ejecucion', generacionId: 'generacion', operador: 'a'.repeat(64),
    epoca: 1, periodoId: '2026-11', pagina: 2, lote: 2 };
  assert.notEqual(parametros(p).operador, p.operador);
  for (const cambio of [{ actorUid: 'administrador' }, { epoca: 2 }, { lote: 26 }, { pagina: 0 },
    { generacionId: '../otro' }, { periodoId: '2026-13' }]) assert.throws(() => parametros({ ...p, ...cambio }));
});
