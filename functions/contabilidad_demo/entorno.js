'use strict';

const { exigir } = require('../finanzas_core/dinero');
const CREDENCIALES = Object.freeze(['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN',
  'GOOGLE_OAUTH_ACCESS_TOKEN', 'FIREBASE_CREDENTIALS', 'GOOGLE_CLOUD_KEYFILE_JSON',
  'GCLOUD_KEYFILE_JSON', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_ACCESS_TOKEN']);

// Comprobar ANTES de importar Admin o abrir un cliente. Sin destino alternativo.
function verificarAntesDeArranque(env = process.env) {
  for (const k of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT']) exigir(!env[k] || env[k] === 'demo-fesync', 'DEMO_DESTINO_PROHIBIDO');
  exigir(!env.FIRESTORE_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'DEMO_DESTINO_PROHIBIDO');
  exigir(!CREDENCIALES.some(k => env[k]), 'DEMO_CREDENCIALES_PROHIBIDAS');
  exigir(!env.FIRESTORE_DATABASE_ID || env.FIRESTORE_DATABASE_ID === '(default)', 'DEMO_DESTINO_PROHIBIDO');
  if (env.FIREBASE_CONFIG) {
    let c; try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { exigir(false, 'DEMO_DESTINO_PROHIBIDO'); }
    exigir(c && c.projectId === 'demo-fesync' && Object.keys(c).every(k => k === 'projectId'), 'DEMO_DESTINO_PROHIBIDO');
  }
}
function verificarEntorno(env = process.env) {
  verificarAntesDeArranque(env);
  exigir(env.GCLOUD_PROJECT === 'demo-fesync' && env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8088', 'DEMO_DESTINO_PROHIBIDO');
}

module.exports = Object.freeze({ verificarEntorno, verificarAntesDeArranque });
