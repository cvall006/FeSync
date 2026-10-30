'use strict';
// Operador del ensayo, destino fijo; nunca credenciales ni datos remotos.
require('../../herramientas/migracion_demo/entorno').validarAusenciaDeDestinosAjenos();
Object.assign(process.env,{GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FIREBASE_CONFIG:'{"projectId":"demo-fesync"}'});
const {cliente,migrar}=require('./soporte.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../docs/membresia_legacy_2026-10-28/browser');
(async()=>{
 const f=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'))),db=cliente(),ref=db.doc(`usuarios_globales/${f.miembro.uid}`);
 try{
  if(process.argv[2]==='migrar'){
   const antes=await ref.get();assert.equal(antes.data().pertenenciaId,undefined);
   const resultado=await migrar('browser_controlado'),despues=await ref.get();
   const {pertenenciaId,...resto}=despues.data();assert.match(pertenenciaId,/^[a-f0-9]{64}$/);assert.deepEqual(resto,antes.data());
   fs.writeFileSync(path.join(out,'migracion.json'),JSON.stringify({resultado,antes:antes.data(),despues:despues.data(),comprobante:(await db.doc(`migraciones_pertenencia/${f.miembro.uid}`).get()).data()},null,2));
  }else if(process.argv[2]==='verificar'){
   const s=await ref.get();assert.equal(s.data().iglesiaId,undefined);assert.equal(s.data().rolGlobal,undefined);
   const recibos=await db.collection(`operaciones_desvinculacion/${f.miembro.uid}/solicitudes`).get();assert.equal(recibos.size,1);
   const c=await db.doc(`migraciones_pertenencia/${f.miembro.uid}`).get();assert.equal(c.data().pertenenciaId,s.data().pertenenciaId);
   const r={proyecto:'demo-fesync',salidaConfirmada:true,perfil:s.data(),recibos:recibos.docs.map(d=>({id:d.id,...d.data()}))};
   fs.writeFileSync(path.join(out,'resultado.json'),JSON.stringify(r,null,2));console.log('Salida normal confirmada; un recibo y generacion preservada.');
  }else throw Error('Solo migrar o verificar, sin destinos alternativos');
 }finally{await db.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
