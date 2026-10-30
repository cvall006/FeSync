'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');

async function main() {
  if (process.argv.length !== 2 || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
      [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(p => p && p !== 'demo-fesync')) {
    throw Error('Solo demo-fesync sin credenciales ni opciones alternativas.');
  }
  // Si ya vive la demo anterior, conservarla. No reiniciar Auth/Firestore ni
  // registrar nuestra segunda instancia en su locator/hub.
  const locator = path.join(os.tmpdir(), 'hub-demo-fesync.json');
  let existentes = false;
  if (fs.existsSync(locator)) {
    const local = JSON.parse(fs.readFileSync(locator, 'utf8'));
    if (local.origins?.includes('http://127.0.0.1:4408')) {
      try {
        const r = await fetch('http://127.0.0.1:4408/emulators', {signal:AbortSignal.timeout(3000)});
        const e = await r.json();
        existentes = e.auth?.host === '127.0.0.1' && e.auth?.port === 9098 &&
          e.firestore?.host === '127.0.0.1' && e.firestore?.port === 8088;
        if(!existentes) throw Error('La infraestructura existente no coincide con demo-fesync.');
      } catch (e) {
        // Un locator de una sesión cerrada no representa infraestructura viva.
        // Cualquier error distinto de conexión rechazada sigue siendo fatal.
        if (e.cause?.code !== 'ECONNREFUSED') throw e;
      }
    }
  }
  for (const port of (existentes ? [5018,4418,4518] : [8088,9098,5018,4418,4518])) await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', () => reject(Error(`Puerto ${port} ocupado; no se vacía ni reinicia.`)));
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
  const cli = require.resolve('firebase-tools/lib/bin/firebase', { paths: [path.join(process.env.APPDATA, 'npm/node_modules')] });
  const info = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), '../emulator/downloadableEmulatorInfo.json'))).firestore;
  if (!fs.existsSync(path.join(os.homedir(), '.cache/firebase/emulators', info.downloadPathRelativeToCacheDir))) {
    throw Error('Falta el emulador instalado. No se descargará.');
  }
  const root = path.resolve(__dirname, '../..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-web-candidato-emu-'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.finanzas-release.json')));
  config.functions[0].source = path.relative(tmp, path.join(root, 'functions'));
  fs.copyFileSync(path.join(root, 'firestore.rules'), path.join(tmp, 'firestore.rules'));
  fs.writeFileSync(path.join(tmp, 'firebase.json'), JSON.stringify(config));
  const env = {};
  for (const k of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ComSpec',
    'PATHEXT','JAVA_HOME','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PROGRAMFILES(X86)']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  if (!env.JAVA_HOME && fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')) {
    env.JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
  }
  if (env.JAVA_HOME) env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + env.PATH;
  Object.assign(env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
    FUNCTIONS_EMULATOR: 'true', CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true', XDG_CONFIG_HOME: tmp,
    METADATA_SERVER_DETECTION: 'none', FUNCTIONS_DISCOVERY_TIMEOUT: '60',
    NODE_OPTIONS: `--require=${path.join(__dirname,'../finanzas_release7/red_local.cjs').replaceAll('\\','/')}`,
    FINANZAS_V1_ENTORNO: 'emulador', TEMP: tmp, TMP: tmp });
  const command = `"${process.execPath}" "${path.join(__dirname, 'browser-fixture.cjs')}"`;
  console.log(`Candidato Web, entrada functions/index.js, solo demo-fesync. Infraestructura y logs: ${tmp}`);
  fs.writeFileSync(path.join(root, 'docs/finanzas_web_candidato_2026-10-28/browser/infraestructura.json'),
    JSON.stringify({ project: 'demo-fesync', source: 'functions/index.js', tmp, ports: [8088,9098,5018],
      authFirestoreReutilizados: existentes }, null, 2));
  const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', existentes ? 'functions' : 'auth,firestore,functions',
    '--project', 'demo-fesync', '--config', path.join(tmp, 'firebase.json'), '--non-interactive', command],
  { cwd: tmp, env, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => { process.exitCode = code === 0 ? 0 : 1; resolve(); });
  });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
