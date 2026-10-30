'use strict';

// Guardas antes de importar/crear cualquier cliente SDK. Sin destino configurable.
function verificarEntorno(env = process.env) {
  if (env.GCLOUD_PROJECT !== 'demo-fesync' ||
      (env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_CLOUD_PROJECT !== 'demo-fesync') ||
      env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' ||
      env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_TOKEN || env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    throw new Error('FIN-7B requiere demo-fesync y Firestore Emulator local, sin credenciales.');
  }
  if (env.FIREBASE_CONFIG) {
    let c;
    try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error('Configuracion no autorizada.'); }
    if (c.projectId !== 'demo-fesync') throw new Error('Configuracion no autorizada.');
  }
}
module.exports = Object.freeze({ verificarEntorno });
