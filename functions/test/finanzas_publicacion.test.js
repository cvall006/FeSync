'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { crearApiPublicacion } = require('../finanzas_publicacion');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

test('Publicación: sin Auth se rechaza antes de usar DB', async () => {
  const api = crearApiPublicacion({ db: null, HttpsError });
  await assert.rejects(api.consultar({data:{}}), e => e.code === 'unauthenticated');
  await assert.rejects(api.ejecutar({data:{}}), e => e.code === 'unauthenticated');
});

test('Publicación: entorno real, ausente o contradictorio no llega a DB', async () => {
  const valido = { GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true' };
  const keys = [...Object.keys(valido),'GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','GOOGLE_OAUTH_ACCESS_TOKEN'];
  const antes = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try { for (const patch of [{GCLOUD_PROJECT:'fesync-app-2026'}, {GOOGLE_CLOUD_PROJECT:'real'},
    {FIRESTORE_EMULATOR_HOST:undefined}, {FIREBASE_AUTH_EMULATOR_HOST:undefined}, {FUNCTIONS_EMULATOR:undefined},
    {GOOGLE_APPLICATION_CREDENTIALS:'real.json'}, {FIREBASE_TOKEN:'real'}, {GOOGLE_OAUTH_ACCESS_TOKEN:'real'}]) {
    for (const [k,v] of Object.entries({...valido,GOOGLE_APPLICATION_CREDENTIALS:undefined,
      FIREBASE_TOKEN:undefined,GOOGLE_OAUTH_ACCESS_TOKEN:undefined,...patch})) {
      if(v===undefined) delete process.env[k]; else process.env[k]=v;
    }
    const api = crearApiPublicacion({db:null,HttpsError});
    await assert.rejects(api.consultar({auth:{uid:'actor'},data:{historialPaginado:true}}),
      e => e.code === 'failed-precondition' && e.message === 'ENTORNO_FINANCIERO_NO_HABILITADO');
  } } finally { for(const [k,v] of Object.entries(antes)) {
    if(v===undefined) delete process.env[k]; else process.env[k]=v;
  } }
});

test('Entrada normal: cuatro callables V1, mismas dependencias y región; sin helpers administrativos directos', async () => {
  let inicializaciones = 0, opciones, recibida;
  const db = {}, FieldValue = {};
  const imports = {
    'firebase-functions/v2/firestore': {onDocumentCreated:(...a)=>a.at(-1),onDocumentUpdated:(...a)=>a.at(-1)},
    'firebase-functions/v2': {setGlobalOptions(v){opciones=v;}},
    'firebase-admin/app': {initializeApp(){inicializaciones++;}},
    'firebase-admin/firestore': {getFirestore:()=>db,FieldValue},
    'firebase-admin/messaging': {getMessaging:()=>({})},
    'firebase-functions/v2/https': {onCall:fn=>fn,HttpsError},
    './finanzas_publicacion': {crearApiPublicacion(deps){
      assert.equal(deps.db,db);assert.equal(deps.FieldValue,FieldValue);assert.equal(deps.HttpsError,HttpsError);
      return {consultar:r=>{recibida=r;return 'consulta';},ejecutar:r=>{recibida=r;return 'operacion';}};
    }},
  };
  const sandbox = {exports:{},require:n=>{assert.ok(imports[n],n);return imports[n];}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../index.js'),'utf8'),sandbox);
  const request={auth:{uid:'actor'},data:{}};
  assert.equal(await sandbox.exports.finanzasV1Consultar(request),'consulta');assert.equal(recibida,request);
  assert.equal(await sandbox.exports.finanzasV1Ejecutar(request),'operacion');assert.equal(recibida,request);
  assert.equal(inicializaciones,1);assert.equal(opciones.region,'southamerica-west1');
  assert.deepEqual(Object.keys(sandbox.exports).filter(n=>n.startsWith('finanzasV1')).sort(),
    ['finanzasV1Consultar','finanzasV1Ejecutar','finanzasV1Mantener','finanzasV1ResolverSolicitud']);
});
