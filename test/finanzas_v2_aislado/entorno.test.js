'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verificarEntorno } = require('./entorno');
const env = { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' };
test('guardas aceptan solo destino local explicitamente demo', () => assert.doesNotThrow(() => verificarEntorno(env)));
for (const [k, v] of Object.entries({ GCLOUD_PROJECT: 'produccion', GOOGLE_CLOUD_PROJECT: 'otro',
  FIRESTORE_EMULATOR_HOST: 'servidor.example:8088', GOOGLE_APPLICATION_CREDENTIALS: 'prohibido',
  FIREBASE_TOKEN: 'prohibido', GOOGLE_OAUTH_ACCESS_TOKEN: 'prohibido', FIREBASE_AUTH_EMULATOR_HOST: 'otro:9099',
  FUNCTIONS_EMULATOR_HOST: 'otro:5001', FIREBASE_CONFIG: '{"projectId":"otro"}' })) {
  test(`guardas rechazan ${k}`, () => assert.throws(() => verificarEntorno({ ...env, [k]: v })));
}
test('sin variables de emulador no se crean clientes', () => assert.throws(() => verificarEntorno({})));
test('host de loopback alternativo no sustituye el destino exacto', () => assert.throws(() =>
  verificarEntorno({ ...env, FIRESTORE_EMULATOR_HOST: 'localhost:8088' })));
