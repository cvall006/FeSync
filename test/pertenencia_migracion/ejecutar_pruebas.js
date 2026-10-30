const { verificarEntornoEmulador } = require('../../functions/migraciones/pertenencia_simulacion');
verificarEntornoEmulador({
  proyecto: process.env.GCLOUD_PROJECT,
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
  storageHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
});
// También se ejecutan regresiones de Finanzas, pertenencia y Capacitaciones.
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9198') {
  throw new Error('Emulador Storage requerido para las regresiones.');
}
const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const [argumentos, directorio] of [
  [['--test', 'integracion.test.js'], __dirname],
  [['--test', 'fcm_limpieza.test.js'], __dirname],
  [['--test', 'ejecucion.test.js'], __dirname],
  [['ejecutar_pruebas.js'], path.join(__dirname, '../finanzas_rules')],
]) {
  const resultado = spawnSync(process.execPath, argumentos, { cwd: directorio, stdio: 'inherit' });
  if (resultado.error || resultado.status !== 0) {
    console.error('No se completaron las pruebas de emuladores.');
    process.exit(1);
  }
}
