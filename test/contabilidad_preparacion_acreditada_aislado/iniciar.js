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
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-procedencia-1E-'));
  fs.copyFileSync(path.join(__dirname, '../../firestore.rules'), path.join(temporal, 'firestore.rules'));
  fs.copyFileSync(path.join(__dirname, '../finanzas_contabilidad_integracion/firebase.json'), path.join(temporal, 'firebase.json'));
  // Software historico exacto admin-4, en una copia privada sin fuentes nuevas.
  // Su verificador original observa su arbol completo, sin filtros ni VM.
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')));
  const sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
  const registroOriginal = fs.readFileSync(path.join(__dirname, '../../functions/contabilidad_demo/test/registro_admin4.json'));
  const manifiestoViejo = fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin4.json'));
  if (sha(registroOriginal) !== '5ea83c890e99688379b6a3b33e5ed7bd66f71ccb64cb63c0e378eac955ca1de4' ||
      sha(manifiestoViejo) !== 'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2') throw Error('Captura historica alterada');
  const historia = path.join(temporal, 'admin4-original');
  for (const ruta of Object.keys(m.fuentes).filter(r => !r.startsWith('functions/contabilidad_preparacion_acreditada_demo/') && !r.startsWith('functions/contabilidad_preparacion_v2_admin_demo/'))) {
    const destino = path.join(historia, ruta); fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '../..', ruta), destino);
  }
  // Conservar tambien el registro historico exacto: no usar el registro admin-5
  // para presentar una copia como si fuera el estado previo.
  fs.copyFileSync(path.join(__dirname, '../../functions/contabilidad_demo/test/registro_admin4.json'),
    path.join(historia, 'functions/contabilidad_demo/inventarios/registro.json'));
  const historico = require(path.join(historia, 'functions/contabilidad_demo/fuentes'));
  if (historico.obtenerContextoFuentes('admin-4').huellaSoftware !==
      '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7') throw Error('Historia incompatible');
  const historiaLocal = path.join(temporal, 'procedencia-local-original');
  const viejo = JSON.parse(manifiestoViejo);
  for (const ruta of Object.keys(viejo.fuentes)) {
    const destino = path.join(historiaLocal, ruta); fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(ruta.endsWith('/inventarios/registro.json') ?
      path.join(__dirname, '../../functions/contabilidad_demo/test/registro_admin4.json') : path.join(__dirname, '../..', ruta), destino);
  }
  require(path.join(historiaLocal, 'functions/contabilidad_preparacion_acreditada_demo/runtime')).autorizarRuntime({
    manifiesto: manifiestoViejo, sha256Autorizado: 'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2' });
  const env = {};
  for (const k of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
    'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'COMSPEC', 'PATHEXT', 'JAVA_HOME']) if (process.env[k]) env[k] = process.env[k];
  if (!env.JAVA_HOME && fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')) env.JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr';
  if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
  Object.assign(env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true',
    FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-fesync' }),
    XDG_CONFIG_HOME: temporal, FESYNC_1E_HISTORICO: historia, FESYNC_1F_LOCAL_ORIGINAL: historiaLocal });
  console.log(`FIN-1E: infraestructura temporal en ${temporal}`);
  const hijo = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'firestore', '--project', 'demo-fesync',
    '--config', path.join(temporal, 'firebase.json'), '--non-interactive',
    `"${process.execPath}" "${path.join(__dirname, 'ejecutar.js')}"`], { cwd: temporal, env, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => { hijo.once('error', reject); hijo.once('exit', c => { process.exitCode = c === 0 ? 0 : 1; resolve(); }); });
}
main().catch(e => { console.error('FIN-1E: arranque rechazado:', e.message); process.exitCode = 1; });
