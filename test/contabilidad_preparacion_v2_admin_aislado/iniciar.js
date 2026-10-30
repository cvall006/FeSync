'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
async function main() {
  // Solo runtime.js (sin SDK ni biblioteca financiera) se carga antes del preflight.
  require('./autorizacion').autorizar();
  const { verificarArranque } = require('../../functions/contabilidad_preparacion_acreditada_demo/entorno');
  verificarArranque();
  if (process.argv.length !== 2) throw Error('Sin argumentos');
  for (const port of [8088, 4408, 4508]) await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject); s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
  const cli = require.resolve('firebase-tools/lib/bin/firebase', { paths: [path.join(process.env.APPDATA ?? '', 'npm/node_modules')] });
  // Rechazar cache ausente; no descargar emuladores ni dependencias.
  const info = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), '../emulator/downloadableEmulatorInfo.json'))).firestore;
  if (!fs.existsSync(path.join(os.homedir(), '.cache/firebase/emulators', info.downloadPathRelativeToCacheDir))) throw Error('Emulador no almacenado');
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-puente-1H-'));
  fs.copyFileSync(path.join(__dirname, '../../firestore.rules'), path.join(temporal, 'firestore.rules'));
  fs.copyFileSync(path.join(__dirname, '../finanzas_contabilidad_integracion/firebase.json'), path.join(temporal, 'firebase.json'));
  // Historia real: arbol admin-5 exacto, sin los JS candidatos, en otra raiz.
  // Cada byte se coteja con la politica local fijada antes de cargar modulos.
  const fijado = JSON.parse(fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')));
  const sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
  const historia = path.join(temporal, 'admin5-original');
  for (const [ruta, h] of Object.entries(fijado.fuentes)) {
    if (ruta.startsWith('functions/contabilidad_preparacion_v2_admin_demo/')) continue;
    const b = fs.readFileSync(path.join(__dirname, '../..', ruta));
    if (sha(b) !== h) throw Error('Historia alterada');
    const destino = path.join(historia, ruta); fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, b);
  }
  const registro5 = fs.readFileSync(path.join(__dirname, '../../functions/contabilidad_demo/test/registro_admin5.json'));
  if (sha(registro5) !== '36b25259333a9c22476d46dd447b43f9052b617d60d9be5527dd3320cabb0c88') throw Error('Registro historico alterado');
  fs.writeFileSync(path.join(historia, 'functions/contabilidad_demo/inventarios/registro.json'), registro5);
  const original = require(path.join(historia, 'functions/contabilidad_demo/fuentes')).obtenerContextoFuentes('admin-5');
  if (original.huellaSoftware !== '175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720') throw Error('Historia incompatible');
  const politicaOriginal = fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin5.json'));
  if (sha(politicaOriginal) !== '7fd4230de6414d577b91bb8850472727b6c0b8bd0bc56c4b0c672e231b8abd3b') throw Error('Politica original alterada');
  const localOriginal = path.join(temporal, 'puente-local-original');
  for (const [ruta, h] of Object.entries(JSON.parse(politicaOriginal).fuentes)) {
    const b = ruta.endsWith('/inventarios/registro.json') ? registro5 : fs.readFileSync(path.join(__dirname, '../..', ruta));
    if (sha(b) !== h) throw Error('Fuente historica alterada');
    const destino = path.join(localOriginal, ruta); fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, b);
  }
  require(path.join(localOriginal, 'functions/contabilidad_preparacion_v2_admin_demo/runtime')).autorizarEnsayo({
    manifiesto: politicaOriginal, sha256Autorizado: '7fd4230de6414d577b91bb8850472727b6c0b8bd0bc56c4b0c672e231b8abd3b' });
  const env = {};
  for (const k of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
    'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'COMSPEC', 'PATHEXT', 'JAVA_HOME']) if (process.env[k]) env[k] = process.env[k];
  if (!env.JAVA_HOME && fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')) env.JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
  if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
  Object.assign(env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true',
    FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-fesync' }),
    XDG_CONFIG_HOME: temporal, FESYNC_1H_HISTORICO: historia, FESYNC_1I_PUENTE_LOCAL_ORIGINAL: localOriginal });
  console.log(`FIN-1H: infraestructura temporal en ${temporal}`);
  const hijo = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'firestore', '--project', 'demo-fesync',
    '--config', path.join(temporal, 'firebase.json'), '--non-interactive',
    `"${process.execPath}" "${path.join(__dirname, 'ejecutar.js')}"`], { cwd: temporal, env, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => { hijo.once('error', reject); hijo.once('exit', c => { process.exitCode = c === 0 ? 0 : 1; resolve(); }); });
}
main().catch(e => { console.error('FIN-1H: arranque rechazado:', e.message); process.exitCode = 1; });
