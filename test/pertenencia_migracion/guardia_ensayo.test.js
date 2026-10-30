const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const archivo = path.join(__dirname, 'ensayo_emulador.js');
const base = {
  GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198', FESYNC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5008',
};
for (const [caso, cambio] of [
  ['proyecto ajeno', { GCLOUD_PROJECT: 'otro-proyecto-no-autorizado' }],
  ['variable ausente', { FIRESTORE_EMULATOR_HOST: '' }],
  ['host externo', { FIRESTORE_EMULATOR_HOST: 'example.invalid:443' }],
  ['credenciales declaradas', { GOOGLE_APPLICATION_CREDENTIALS: 'ruta-ficticia-no-leida' }],
  ['Auth ausente', { FIREBASE_AUTH_EMULATOR_HOST: '' }],
]) {
  test(`Guarda del ensayo: rechaza ${caso} antes de importar SDKs`, () => {
    const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(archivo)})`], {
      env: { ...base, ...cambio }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Pruebas permitidas solo en demo-fesync/);
  });
}
test('Guarda del ensayo: rechaza db fuera del destino fijo incluso con entorno demo', () => {
  const codigo = `require(${JSON.stringify(archivo)}).simular({projectId:'otro-proyecto-no-autorizado',_settings:{host:'127.0.0.1:8088',ssl:false}}).then(()=>process.exit(99),e=>{if(e.message==='Cliente de ensayo no autorizado.')process.exit(0);process.exit(98)})`;
  const r = spawnSync(process.execPath, ['-e', codigo], { env: base, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0);
});
test('Guarda del ensayo: cliente demo con endpoint externo también se rechaza', () => {
  const codigo = `require(${JSON.stringify(archivo)}).simular({projectId:'demo-fesync',_settings:{servicePath:'example.invalid',port:443,ssl:false}}).then(()=>process.exit(99),e=>{if(e.message==='Cliente de ensayo no autorizado.')process.exit(0);process.exit(98)})`;
  const r = spawnSync(process.execPath, ['-e', codigo], { env: base, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0);
});
