'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { verificarEntorno } = require('./entorno');

async function main() {
  if (process.argv.length !== 2 || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST ||
      (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088') ||
      [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(p => p && p !== 'demo-fesync')) {
    throw new Error('Arranque sin argumentos, credenciales ni proyectos alternativos.');
  }
  // No conectar a un emulador que ya tenga datos ni compartir puertos con otra suite.
  for (const port of [8088, 4408, 4508, 9150]) await new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.once('error', () => reject(new Error('Puerto de emulador ocupado; no iniciar suites concurrentes.')));
    servidor.listen(port, '127.0.0.1', () => servidor.close(resolve));
  });
  let cli;
  try {
    cli = require.resolve('firebase-tools/lib/bin/firebase', {
      paths: [path.join(process.env.APPDATA ?? '', 'npm/node_modules')],
    });
  } catch { throw new Error('Firebase CLI local no disponible; no se instalaran herramientas.'); }
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-v2-aislado-'));
  // Firebase CLI restringe rules al directorio del proyecto de pruebas.
  // Copias efimeras exactas: nunca modificar reglas ni configuracion principal.
  fs.copyFileSync(path.join(__dirname, '../../firestore.rules'), path.join(temporal, 'firestore.rules'));
  fs.copyFileSync(path.join(__dirname, '../finanzas_contabilidad_integracion/firebase.json'), path.join(temporal, 'firebase.json'));
  const env = {};
  for (const k of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE',
    'HOME', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'COMSPEC', 'PATHEXT', 'JAVA_HOME']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  if (!env.JAVA_HOME && fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')) {
    env.JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
  }
  if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
  Object.assign(env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true',
    FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-fesync' }),
    XDG_CONFIG_HOME: temporal });
  if (process.env.FIREBASE_CONFIG) verificarEntorno({ ...env, FIREBASE_CONFIG: process.env.FIREBASE_CONFIG });
  verificarEntorno(env);
  console.log(`V2 aislado: logs de infraestructura en ${temporal}`);
  const r = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'firestore', '--project',
    'demo-fesync', '--config', path.join(temporal, 'firebase.json'), '--non-interactive',
    `"${process.execPath}" "${path.join(__dirname, 'ejecutar.js')}"`],
  { cwd: temporal, env, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => { r.once('error', reject); r.once('exit', code => {
    process.exitCode = code === 0 ? 0 : 1; resolve();
  }); });
}
main().catch(() => { console.error('V2 aislado: arranque bloqueado; revisar requisitos y puertos locales.'); process.exitCode = 1; });
