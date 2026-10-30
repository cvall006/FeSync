'use strict';
const { exigir } = require('../finanzas_core/dinero');
const CREDENCIALES = ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN',
  'FIREBASE_CREDENTIALS', 'GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_ACCESS_TOKEN'];
function verificarArranque(env = process.env) {
  exigir(!CREDENCIALES.some(k => env[k]), 'PREP_CREDENCIALES_PROHIBIDAS');
  for (const k of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT']) {
    exigir(!env[k] || env[k] === 'demo-fesync', 'PREP_DESTINO_PROHIBIDO');
  }
  exigir(!env.FIRESTORE_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'PREP_DESTINO_PROHIBIDO');
  exigir(!env.FIRESTORE_DATABASE_ID || env.FIRESTORE_DATABASE_ID === '(default)', 'PREP_DESTINO_PROHIBIDO');
  exigir(!env.FUNCTIONS_EMULATOR_HOST && !env.FIREBASE_AUTH_EMULATOR_HOST, 'PREP_DESTINO_PROHIBIDO');
  if (env.FIREBASE_CONFIG) {
    let c; try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { exigir(false, 'PREP_DESTINO_PROHIBIDO'); }
    exigir(c && c.projectId === 'demo-fesync' && Object.keys(c).every(k => k === 'projectId'), 'PREP_DESTINO_PROHIBIDO');
  }
}
function verificarEntorno(env = process.env) {
  verificarArranque(env);
  exigir(env.GCLOUD_PROJECT === 'demo-fesync' && env.GOOGLE_CLOUD_PROJECT === 'demo-fesync' &&
    env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'PREP_DESTINO_PROHIBIDO');
}
function verificarCliente(db) {
  exigir(db?.projectId === 'demo-fesync' && db._settings?.servicePath === '127.0.0.1' &&
    db._settings?.port === 8088 && db._settings?.ssl === false, 'PREP_CLIENTE_PROHIBIDO');
}
module.exports = Object.freeze({ verificarArranque, verificarEntorno, verificarCliente });
