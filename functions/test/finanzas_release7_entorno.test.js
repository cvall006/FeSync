'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {entorno,entornoOperacion}=require('../finanzas_v1/entorno');
const {crearApiPublicacion}=require('../finanzas_publicacion');
const real={FINANZAS_V1_ENTORNO:'publicable',FINANZAS_V1_PROYECTO:'fesync-app-2026',GCLOUD_PROJECT:'fesync-app-2026'};
test('Release7: publicable apagado o sin selección rechaza antes de DB, también recuperación',async()=>{
  for(const enabled of [undefined,'false','1','TRUE']){
    assert.throws(()=>entornoOperacion({...real,FINANZAS_V1_SERVIDOR_HABILITADO:enabled}));
  }
  assert.throws(()=>entornoOperacion({GCLOUD_PROJECT:'fesync-app-2026'}));
  const names=[...new Set([...Object.keys(real),'FINANZAS_V1_SERVIDOR_HABILITADO'])];
  const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  try{
    Object.assign(process.env,real,{FINANZAS_V1_SERVIDOR_HABILITADO:'false'});
    const api=crearApiPublicacion({db:null,HttpsError});
    for(const name of ['consultar','ejecutar'])await assert.rejects(api[name]({auth:{uid:'actor'},data:{}}),
      e=>e.code==='failed-precondition'&&e.message==='ENTORNO_FINANCIERO_NO_HABILITADO');
  }finally{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('Release7: operaciones preparadas sin emuladores; mantenimiento sigue restringido',()=>{
  const env={...real,FINANZAS_V1_SERVIDOR_HABILITADO:'true'};
  assert.doesNotThrow(()=>entornoOperacion(env));assert.throws(()=>entorno(env));
  for(const patch of [{FINANZAS_V1_PROYECTO:undefined},{FINANZAS_V1_PROYECTO:'demo-fesync'},
    {GCLOUD_PROJECT:'otra-iglesia'},{GOOGLE_CLOUD_PROJECT:'otro-proyecto'},{FUNCTIONS_EMULATOR:'false'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088'},{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098'},
    {GOOGLE_APPLICATION_CREDENTIALS:'x.json'},{FIREBASE_TOKEN:'x'},{FINANZAS_V1_ENTORNO:'cualquiera'}]){
    assert.throws(()=>entornoOperacion({...env,...patch}));
  }
});
test('Release7: configuración publicable sin secretos, fixtures o endpoints locales y apagada',()=>{
  const fs=require('node:fs'),path=require('node:path');
  for(const name of ['publicable.json','servidor-publicable.env.example']){
    const s=fs.readFileSync(path.join(__dirname,'../../config/finanzas_v1',name),'utf8');
    assert.equal(/AIza|private_key|localhost|127\.0\.0\.1|demo-fesync|fixtures|Temp[\\/]|https?:/i.test(s),false);
    assert.match(s,/HABILITADO["=:\s]+(?:"false"|false)/);
  }
});
test('Release7: publicable preparado sigue exigiendo gate privado en consulta, escritura y replay',async()=>{
  const patch={...real,FINANZAS_V1_SERVIDOR_HABILITADO:'true'};
  const keys=[...Object.keys(patch),'GOOGLE_CLOUD_PROJECT','FUNCTIONS_EMULATOR','FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST',
    'GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','GOOGLE_OAUTH_ACCESS_TOKEN'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  try{
    for(const k of keys)delete process.env[k];Object.assign(process.env,patch);
    const iglesiaId='local_sin_red',pertenenciaId='a'.repeat(64),contexto={iglesiaId,pertenenciaId};
    const docs={
      'usuarios_globales/actor':{iglesiaId,pertenenciaId,rolGlobal:'admin_iglesia'},
      [`iglesias/${iglesiaId}`]:{adminUid:'actor'},
      [`iglesias/${iglesiaId}/finanzas_config/acceso`]:{moduloHabilitado:true,encargadoUid:null},
    };
    let escrituras=0;
    const db={doc:path=>({path}),collection(){throw Error('No debe listar');},
      runTransaction:fn=>fn({get:async ref=>({exists:Object.hasOwn(docs,ref.path),data:()=>docs[ref.path],
        updateTime:{seconds:1,nanoseconds:0}}),create(){escrituras++;}})};
    const api=crearApiPublicacion({db,HttpsError});
    for(const gate of [undefined,{versionEsquema:1,iglesiaId,circuito:'v1_incremental',habilitado:false}]){
      docs[`iglesias/${iglesiaId}/finanzas_control/publicacion_v1`]=gate;
      await assert.rejects(api.consultar({auth:{uid:'actor'},data:{historialPaginado:true}}),
        e=>e.message==='CIRCUITO_FINANCIERO_NO_HABILITADO');
      const solicitud={solicitudId:'solicitud_perdida_12345678',contexto,operacion:'gasto',
        campos:{cuentaId:'caja',categoriaId:'gasto',montoMinor:1,fechaContable:'2026-10-26'}};
      for(let i=0;i<2;i++)await assert.rejects(api.ejecutar({auth:{uid:'actor'},data:solicitud}),
        e=>e.message==='CIRCUITO_FINANCIERO_NO_HABILITADO');
    }
    assert.equal(escrituras,0);
  }finally{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
