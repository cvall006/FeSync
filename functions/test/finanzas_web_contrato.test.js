'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {crearApiPublicacion}=require('../finanzas_publicacion');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
test('Web: el transporte de pendientes/mantenimiento exige Auth y gate global antes de DB',async()=>{
  const api=crearApiPublicacion({db:null,HttpsError});
  for(const tipo of ['resolverSolicitud','mantenimiento']){
    const data={tipo,datos:{}};
    await assert.rejects(api.ejecutar({data}),e=>e.code==='unauthenticated');
    await assert.rejects(api.ejecutar({auth:{uid:'actor'},data}),e=>e.code==='failed-precondition'&&e.message==='ENTORNO_FINANCIERO_NO_HABILITADO');
  }
});
test('Web: sobre estricto, sin acciones arbitrarias ni autoridad en el sobre',async()=>{
  const patch={GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',
    FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true'};
  const before=Object.fromEntries(Object.keys(patch).map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,patch);const api=crearApiPublicacion({db:null,HttpsError});
    for(const data of [{tipo:'migrarV2',datos:{}},{tipo:'mantenimiento',datos:{},rol:'admin_iglesia'},
      {tipo:'resolverSolicitud'},{tipo:'mantenimiento',datos:{},habilitado:true}]){
      await assert.rejects(api.ejecutar({auth:{uid:'actor'},data}),e=>e.code==='invalid-argument');
    }
    // La delegación real conserva la validación de cada API, no acepta un cuerpo vacío.
    for(const tipo of ['mantenimiento','resolverSolicitud'])await assert.rejects(
      api.ejecutar({auth:{uid:'actor'},data:{tipo,datos:{}}}),e=>e.code==='failed-precondition');
  }finally{for(const [k,v] of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
