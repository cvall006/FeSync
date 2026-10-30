// Sesión local persistente mientras este proceso siga abierto. Nunca despliega.
const { validarAusenciaDeDestinosAjenos } = require('./entorno');
try { validarAusenciaDeDestinosAjenos(); }
catch (e) { console.error(JSON.stringify({ error: e.codigo ?? 'ENTORNO_PROHIBIDO' })); process.exit(20); }
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== 'pruebas')) {
  console.error(JSON.stringify({ error: 'ARGUMENTOS_INVALIDOS' })); process.exit(20);
}
const env = {};
for (const k of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
  'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'COMSPEC', 'PATHEXT', 'JAVA_HOME']) {
  if (process.env[k]) env[k] = process.env[k];
}
if (env.JAVA_HOME) env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env.PATH ?? '');
Object.assign(env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
  FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-fesync' }),
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198',
  FESYNC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5008', CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true',
  XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-admin-demo-')) });
let cli;
try {
  cli = require.resolve('firebase-tools/lib/bin/firebase', { paths:
    [path.join(process.env.APPDATA ?? '', 'npm/node_modules'), ...require.resolve.paths('firebase-tools')] });
} catch {
  console.error(JSON.stringify({ error: 'CLI_LOCAL_NO_DISPONIBLE' })); process.exit(20);
}
const pruebas = process.argv[2] === 'pruebas';
const args = [cli, pruebas ? 'emulators:exec' : 'emulators:start', '--only', 'auth,firestore,storage',
  '--project', 'demo-fesync', '--config', path.resolve(__dirname, '../../firebase.migracion-admin-demo.json'), '--non-interactive'];
if (pruebas) args.push('node herramientas/migracion_demo/test/ejecutar.js');
const r = spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '../..'), env, stdio: 'inherit' });
try { fs.rmSync(env.XDG_CONFIG_HOME, { recursive: true, force: true }); } catch { /* Sin datos demo en esta carpeta. */ }
process.exit(r.error ? 20 : r.status ?? 20);
