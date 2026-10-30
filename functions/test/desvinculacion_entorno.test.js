const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verificarEntorno } = require('../../test/desvinculacion_integracion/entorno');
const valido = {
  GCLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198',
  FESYNC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5008',
};
test('6A: guardia permite solamente entorno local completo demo-fesync', () => {
  assert.doesNotThrow(() => verificarEntorno(valido));
  for (const clave of Object.keys(valido)) {
    const otro = { ...valido }; delete otro[clave];
    assert.throws(() => verificarEntorno(otro));
    assert.throws(() => verificarEntorno({ ...valido, [clave]: 'proyecto-no-autorizado' }));
  }
});
test('6A: guardia rechaza credenciales, proyecto alternativo y runtime no emulado', () => {
  for (const datos of [
    { GOOGLE_APPLICATION_CREDENTIALS: 'prohibido' }, { FIREBASE_TOKEN: 'prohibido' },
    { GOOGLE_CLOUD_PROJECT: 'otro' }, { FIREBASE_CONFIG: '{}' }, { FIREBASE_CONFIG: 'inválido' },
  ]) assert.throws(() => verificarEntorno({ ...valido, ...datos }));
  assert.throws(() => verificarEntorno(valido, { runtime: true }));
  assert.doesNotThrow(() => verificarEntorno({ ...valido, FUNCTIONS_EMULATOR: 'true' }, { runtime: true }));
});

test('6A: ejecutores y runtime abortan ante proyecto no autorizado antes de conectar SDKs', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  for (const archivo of [
    '../../test/desvinculacion_integracion/iniciar.js',
    '../../test/desvinculacion_integracion/ejecutar_pruebas.js',
    '../../test/desvinculacion_integracion/integracion.test.js',
    './integracion_runtime/index.js',
  ]) {
    const r = spawnSync(process.execPath, [path.resolve(__dirname, archivo)], {
      env: { GCLOUD_PROJECT: 'proyecto-no-autorizado' }, encoding: 'utf8', timeout: 5000,
    });
    assert.notEqual(r.status, 0);
    assert.equal(r.error, undefined);
    assert.match(r.stderr, /demo-fesync/);
  }
});
