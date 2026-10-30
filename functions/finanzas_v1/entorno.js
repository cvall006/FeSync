'use strict';
// Barrera conservada: solo demo-fesync hasta autorizar una futura publicación.
function entorno(env = process.env) {
  if (env.GCLOUD_PROJECT !== 'demo-fesync' ||
      (env.GOOGLE_CLOUD_PROJECT !== undefined && env.GOOGLE_CLOUD_PROJECT !== 'demo-fesync') ||
      env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' ||
      env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098' || env.FUNCTIONS_EMULATOR !== 'true' ||
      env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_TOKEN || env.GOOGLE_OAUTH_ACCESS_TOKEN) throw Error('SOLO_EMULADOR_DEMO');
}
// Solo las operaciones usan esta selección. Mantenimiento conserva entorno().
function entornoOperacion(env = process.env) {
  const modo = env.FINANZAS_V1_ENTORNO;
  if (modo === undefined || modo === 'emulador') return entorno(env);
  if (modo !== 'publicable' || env.FINANZAS_V1_SERVIDOR_HABILITADO !== 'true') {
    throw Error('FINANZAS_SERVIDOR_DESHABILITADO');
  }
  const proyecto = env.FINANZAS_V1_PROYECTO;
  if (typeof proyecto !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(proyecto) ||
      proyecto.startsWith('demo-') || env.GCLOUD_PROJECT !== proyecto ||
      (env.GOOGLE_CLOUD_PROJECT !== undefined && env.GOOGLE_CLOUD_PROJECT !== proyecto) ||
      ['FUNCTIONS_EMULATOR', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST',
        'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST',
        'FIREBASE_EMULATOR_HUB', 'STORAGE_EMULATOR_HOST', 'PUBSUB_EMULATOR_HOST',
        'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN']
        .some(k => env[k] !== undefined)) throw Error('ENTORNO_FINANCIERO_INCOHERENTE');
  if (env.FIREBASE_CONFIG !== undefined) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw Error('CONFIG_FIREBASE_INCOHERENTE'); }
    if (config?.projectId !== proyecto) throw Error('CONFIG_FIREBASE_INCOHERENTE');
  }
}
module.exports = { entorno, entornoOperacion };
