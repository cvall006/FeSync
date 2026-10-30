'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
async function main() {
  if (process.argv.slice(2).some(a => !['--pruebas', '--flutter'].includes(a)) || (process.argv.includes('--flutter') && !process.argv.includes('--pruebas')) || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
      [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(p => p && p !== 'demo-fesync')) throw Error('Solo demo-fesync, sin credenciales ni proyectos alternativos.');
  for (const port of [8088, 9098, 5008, 4408, 4508]) await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', () => reject(Error(`Puerto ${port} ocupado. No se reutiliza ni vacía un emulador existente.`)));
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
  const cli = require.resolve('firebase-tools/lib/bin/firebase', { paths: [path.join(process.env.APPDATA, 'npm/node_modules')] });
  const info = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), '../emulator/downloadableEmulatorInfo.json'))).firestore;
  if (!fs.existsSync(path.join(os.homedir(), '.cache/firebase/emulators', info.downloadPathRelativeToCacheDir))) throw Error('Falta el emulador local. No se instalará.');
  const root = path.resolve(__dirname, '../..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-fin-mvp-'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.finanzas-mvp.json')));
  config.functions[0].source = path.relative(tmp, path.join(root, config.functions[0].source));
  fs.copyFileSync(path.join(root, 'firestore.rules'), path.join(tmp, 'firestore.rules'));
  fs.writeFileSync(path.join(tmp, 'firebase.json'), JSON.stringify(config));
  const env = {};
  // Flutter consulta esta ruta al detectar las herramientas de Windows.
  for (const k of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ComSpec','PATHEXT','JAVA_HOME','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PROGRAMFILES(X86)']) if (process.env[k]) env[k] = process.env[k];
  if (!env.JAVA_HOME && fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')) env.JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
  if (env.JAVA_HOME) env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + env.PATH;
  Object.assign(env, { GCLOUD_PROJECT:'demo-fesync', GOOGLE_CLOUD_PROJECT:'demo-fesync',
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',
    CI:'true', FIREBASE_CLI_DISABLE_MOTD:'true', XDG_CONFIG_HOME:tmp,
    METADATA_SERVER_DETECTION:'none' });
  const prueba = process.argv.includes('--pruebas');
  if (process.argv.includes('--flutter')) env.FIN_MVP_PROBAR_FLUTTER = 'true';
  const command = `"${process.execPath}" "${path.join(__dirname, prueba ? 'ejecutar.js' : 'sesion.js')}"`;
  console.log(`FIN-MVP solo demo-fesync. Infraestructura y logs: ${tmp}`);
  const child = spawn(process.execPath, [cli, 'emulators:exec', '--only','auth,firestore,functions', '--project','demo-fesync', '--config',path.join(tmp,'firebase.json'), '--non-interactive', command], { cwd:tmp, env, stdio:'inherit', windowsHide:true });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => { process.exitCode = code === 0 ? 0 : 1; resolve(); }); });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
