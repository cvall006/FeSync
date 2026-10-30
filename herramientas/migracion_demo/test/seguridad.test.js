const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { validarEntorno } = require('../entorno');
const { parsear } = require('../argumentos');
const base = { GCLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' };
const rechaza = (env) => assert.throws(() => validarEntorno(env), /Operación demo detenida/);

test('Entorno exclusivamente demo y loopback canónico', () => validarEntorno(base));
for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CREDENTIALS',
  'GOOGLE_CLOUD_KEYFILE_JSON', 'GCLOUD_KEYFILE_JSON', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CLOUDSDK_AUTH_ACCESS_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN', 'GOOGLE_AUTH_TOKEN']) {
  test(`Credencial declarada rechazada: ${k}`, () => rechaza({ ...base, [k]: 'SECRETO_NO_IMPRIMIR' }));
}
for (const cambio of [
  { GCLOUD_PROJECT: '' }, { GCLOUD_PROJECT: 'real-no-autorizado' },
  { GOOGLE_CLOUD_PROJECT: 'real-no-autorizado' }, { FIREBASE_PROJECT: 'real-no-autorizado' },
  { FIRESTORE_EMULATOR_HOST: '' }, { FIRESTORE_EMULATOR_HOST: 'localhost:8088' },
  { FIRESTORE_EMULATOR_HOST: 'example.invalid:443' }, { FIRESTORE_DATABASE_ID: 'otra' },
  { FIREBASE_AUTH_EMULATOR_HOST: 'example.invalid:443' },
  { FIREBASE_CONFIG: '{invalido' }, { FIREBASE_CONFIG: '{"projectId":"real-no-autorizado"}' },
  { FIREBASE_CONFIG: '{"projectId":"demo-fesync","private_key":"SECRETO_NO_IMPRIMIR"}' },
]) {
  test(`Guarda de configuración ${JSON.stringify(Object.keys(cambio))}`, () => rechaza({ ...base, ...cambio }));
}
test('Importar herramienta aborta antes del SDK con proyecto ajeno', () => {
  const archivo = path.join(__dirname, '../herramienta.js');
  const r = spawnSync(process.execPath, ['-e', `try{require(${JSON.stringify(archivo)})}catch(e){process.stdout.write(e.codigo||'ERROR');process.exit(23)}`],
    { env: { ...base, GCLOUD_PROJECT: 'real-no-autorizado' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 23); assert.equal(r.stdout, 'PROYECTO_PROHIBIDO');
});
test('No existen flags de proyecto, credenciales, importación ni host', () => {
  for (const flag of ['--project', '--host', '--credentials', '--import', '--produccion']) {
    assert.throws(() => parsear(['simular', flag, 'SECRETO_NO_IMPRIMIR']));
  }
});
test('Argumentos y nombres estrictos; no rutas, duplicados o opciones implícitas', () => {
  for (const args of [[], ['aplicar'], ['simular', '--checkpoint', 'x'],
    ['reanudar', '--checkpoint', '../x'], ['aplicar', '--checkpoint', 'x\n'], ['aplicar', '--checkpoint', '__reservado__'],
    ['simular', '--lote', '1', '--lote', '2'], ['simular', '--lote', '1.1'],
    ['simular', '--lote'], ['desplegar']]) assert.throws(() => parsear(args));
  assert.deepEqual(parsear(['reanudar', '--checkpoint', 'ensayo-a', '--lote', '2']),
    { modo: 'reanudar', checkpoint: 'ensayo-a', opciones: { lote: 2 } });
});
test('CLI rechaza credenciales sin imprimirlas ni abrir SDK', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '../cli.js'), 'preflight'], {
    env: { ...base, GOOGLE_APPLICATION_CREDENTIALS: 'SECRETO_NO_IMPRIMIR' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 20);
  assert.deepEqual(JSON.parse(r.stderr), { error: 'CREDENCIALES_PROHIBIDAS' });
  assert.ok(!r.stdout.includes('SECRETO_NO_IMPRIMIR') && !r.stderr.includes('SECRETO_NO_IMPRIMIR'));
});
