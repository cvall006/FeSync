const CALLABLES = Object.freeze([
  'desvincularMiembroIglesia', 'consultarEstadoSolicitudDesvinculacion',
  'recuperarContextoSolicitudDesvinculacion', 'vincularUsuarioConCodigo',
  'registrarNuevaIglesiaSegura', 'consultarEstadoSolicitudIngreso',
  'actualizarEncargadoFinanciero', 'actualizarEstadoModuloFinanzas',
  'transferirAdministracionIglesia',
  'obtenerContextoCambioRolMiembro', 'actualizarRolMiembro',
]);

// Se ejecuta ANTES de importar cualquier SDK. Sin ADC ni destinos configurables.
function verificarEntorno(env = process.env, { runtime = false } = {}) {
  if (env.GCLOUD_PROJECT !== 'demo-fesync' ||
      (env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_CLOUD_PROJECT !== 'demo-fesync') ||
      env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' ||
      env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098' ||
      env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9198' ||
      (!runtime && env.FESYNC_FUNCTIONS_EMULATOR_HOST !== '127.0.0.1:5008') ||
      (runtime && env.FUNCTIONS_EMULATOR !== 'true') ||
      env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_TOKEN) {
    throw new Error('Pruebas permitidas solo en demo-fesync y emuladores locales, sin credenciales.');
  }
  if (env.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error('Configuración de prueba inválida.'); }
    if (config.projectId !== 'demo-fesync') throw new Error('Proyecto de prueba inválido.');
  }
}

module.exports = { verificarEntorno, CALLABLES };
