'use strict';
function verificarEntorno(env = process.env) {
  if (env.GCLOUD_PROJECT !== 'demo-fesync' || env.GOOGLE_CLOUD_PROJECT !== 'demo-fesync' ||
    env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || env.GOOGLE_APPLICATION_CREDENTIALS ||
    env.FIREBASE_TOKEN || env.GOOGLE_OAUTH_ACCESS_TOKEN || env.FIREBASE_AUTH_EMULATOR_HOST ||
    env.FUNCTIONS_EMULATOR_HOST) throw Error('V2 aislado requiere exclusivamente Firestore Emulator demo-fesync sin credenciales.');
  if (env.FIREBASE_CONFIG) {
    let c; try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { throw Error('Configuracion no permitida.'); }
    if (c.projectId !== 'demo-fesync' || Object.keys(c).some(k => !['projectId', 'storageBucket', 'databaseURL'].includes(k)) ||
      (c.storageBucket && c.storageBucket !== 'demo-fesync.appspot.com') ||
      (c.databaseURL && c.databaseURL !== 'https://demo-fesync.firebaseio.com')) throw Error('Configuracion no permitida.');
  }
}
module.exports = Object.freeze({ verificarEntorno });
