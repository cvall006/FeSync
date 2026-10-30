'use strict';
const { exigir } = require('../finanzas_core/dinero');
function verificarArranque(env = process.env) {
  for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN',
    'FIREBASE_CREDENTIALS', 'GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'NODE_OPTIONS']) {
    exigir(!env[k], 'E_CREDENCIALES_O_INYECCION');
  }
  for (const k of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT']) {
    exigir(!env[k] || env[k] === 'demo-fesync', 'E_DESTINO_PROHIBIDO');
  }
  exigir(!env.FIRESTORE_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'E_DESTINO_PROHIBIDO');
  exigir(!env.FIRESTORE_DATABASE_ID || env.FIRESTORE_DATABASE_ID === '(default)', 'E_DESTINO_PROHIBIDO');
  exigir(!env.FUNCTIONS_EMULATOR_HOST && !env.FIREBASE_AUTH_EMULATOR_HOST, 'E_DESTINO_PROHIBIDO');
  if (env.FIREBASE_CONFIG) {
    let c; try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { exigir(false, 'E_DESTINO_PROHIBIDO'); }
    exigir(c?.projectId === 'demo-fesync' && Object.keys(c).length === 1, 'E_DESTINO_PROHIBIDO');
  }
}
function verificarEntorno(env = process.env) {
  verificarArranque(env);
  exigir(env.GCLOUD_PROJECT === 'demo-fesync' && env.GOOGLE_CLOUD_PROJECT === 'demo-fesync' &&
    env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'E_DESTINO_PROHIBIDO');
}
function verificarCliente(db) {
  exigir(db?.projectId === 'demo-fesync' && db._settings?.servicePath === '127.0.0.1' &&
    db._settings?.port === 8088 && db._settings?.ssl === false &&
    (!db._settings.databaseId || db._settings.databaseId === '(default)'), 'E_CLIENTE_PROHIBIDO');
}
module.exports = Object.freeze({ verificarArranque, verificarEntorno, verificarCliente });
