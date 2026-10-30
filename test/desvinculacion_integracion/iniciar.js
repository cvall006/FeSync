// Arranque protegido: no admite argumentos/proyectos alternativos ni hereda
// credenciales o el entorno completo del IDE en el proceso firebase-tools.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verificarEntorno } = require('./entorno');
if (process.argv.length !== 2 || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some((p) => p && p !== 'demo-fesync')) {
  throw new Error('Arranque autorizado solo para demo-fesync, sin credenciales ni argumentos adicionales.');
}
const env = {};
for (const clave of ['PATH', 'SystemRoot', 'WINDIR',
  'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA',
  'ComSpec', 'COMSPEC', 'PATHEXT', 'JAVA_HOME', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']) {
  if (process.env[clave]) env[clave] = process.env[clave];
}
if (!env.JAVA_HOME && process.platform === 'win32') {
  const java = 'C:/Program Files/Android/Android Studio/jbr';
  if (fs.existsSync(path.join(java, 'bin/java.exe'))) {
    env.JAVA_HOME = java;
  }
}
if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
Object.assign(env, {
  GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198', FESYNC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5008',
  CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true',
  XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-6a-')),
});
verificarEntorno(env);
// Reutiliza la CLI ya instalada; no descarga/instala dependencias.
let cli;
try {
  cli = require.resolve('firebase-tools/lib/bin/firebase', {
    paths: [path.join(process.env.APPDATA ?? '', 'npm/node_modules'), ...require.resolve.paths('firebase-tools')],
  });
} catch { throw new Error('Firebase CLI local no disponible; no se instalará automáticamente.'); }
const r = spawnSync(process.execPath, [cli, 'emulators:exec', '--only', 'auth,firestore,functions,storage',
  '--project', 'demo-fesync', '--config', 'firebase.desvinculacion-test.json', '--non-interactive',
  'node test/desvinculacion_integracion/ejecutar_pruebas.js'], {
  cwd: path.resolve(__dirname, '../..'), env, stdio: 'inherit',
});
if (r.error || r.status !== 0) process.exit(1);
