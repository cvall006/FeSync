'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verificarEntorno } = require('./entorno');
const valido = () => ({ GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' });
test('Guardia permite exclusivamente destino local demo-fesync', () => {
  assert.doesNotThrow(() => verificarEntorno(valido()));
});
for (const [nombre, campo, valor] of [
  ['proyecto ajeno', 'GCLOUD_PROJECT', 'real-no-autorizado'],
  ['segundo proyecto ajeno', 'GOOGLE_CLOUD_PROJECT', 'real-no-autorizado'],
  ['host no local', 'FIRESTORE_EMULATOR_HOST', 'firestore.googleapis.com:443'],
  ['puerto diferente', 'FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'],
  ['host ausente', 'FIRESTORE_EMULATOR_HOST', undefined],
  ['credencial ADC', 'GOOGLE_APPLICATION_CREDENTIALS', 'no-usar.json'],
  ['token CLI', 'FIREBASE_TOKEN', 'ficticio'],
  ['token OAuth', 'GOOGLE_OAUTH_ACCESS_TOKEN', 'ficticio'],
  ['configuracion ajena', 'FIREBASE_CONFIG', JSON.stringify({ projectId: 'real-no-autorizado' })],
  ['configuracion corrupta', 'FIREBASE_CONFIG', '{'],
]) test(`Guardia rechaza ${nombre} antes de importar SDKs`, () => {
  assert.throws(() => verificarEntorno({ ...valido(), [campo]: valor }));
});
