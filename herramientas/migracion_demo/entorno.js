// No ofrece destinos alternativos. No leer credenciales ni inicializar SDK aquí.
const CREDENCIALES = Object.freeze([
  'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CREDENTIALS',
  'GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_AUTH_TOKEN',
]);
class ErrorDemo extends Error {
  constructor(codigo) { super('Operación demo detenida.'); this.codigo = codigo; }
}
function validarAusenciaDeDestinosAjenos(env = process.env) {
  if (CREDENCIALES.some((k) => env[k])) throw new ErrorDemo('CREDENCIALES_PROHIBIDAS');
  for (const k of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT']) {
    if (env[k] && env[k] !== 'demo-fesync') throw new ErrorDemo('PROYECTO_PROHIBIDO');
  }
  for (const [k, v] of Object.entries({
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198', FESYNC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5008',
  })) if (env[k] && env[k] !== v) throw new ErrorDemo('HOST_PROHIBIDO');
  if (env.FIRESTORE_DATABASE_ID && env.FIRESTORE_DATABASE_ID !== '(default)') {
    throw new ErrorDemo('BASE_PROHIBIDA');
  }
  if (env.FIREBASE_CONFIG) {
    let c;
    try { c = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new ErrorDemo('CONFIG_PROHIBIDA'); }
    if (!c || c.projectId !== 'demo-fesync' ||
        Object.keys(c).some((k) => k !== 'projectId')) throw new ErrorDemo('CONFIG_PROHIBIDA');
  }
}
function validarEntorno(env = process.env) {
  validarAusenciaDeDestinosAjenos(env);
  if (env.GCLOUD_PROJECT !== 'demo-fesync' || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088') {
    throw new ErrorDemo('ENTORNO_INCOMPLETO');
  }
}
module.exports = { ErrorDemo, validarEntorno, validarAusenciaDeDestinosAjenos };
