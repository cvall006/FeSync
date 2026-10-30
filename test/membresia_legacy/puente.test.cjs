'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {actor,call,cliente,usar,migrar}=require('./soporte.cjs');
const fs=require('node:fs'),path=require('node:path');
const {clasificarPerfilPertenencia}=require('../../functions/migraciones/pertenencia_plan');
let db,a,b,miembro,encargado,actual,titular,otro,antes,iglesiaId,otra;
const datos={},evidencia={proyecto:'demo-fesync',casos:[]};
before(async()=>{
 const limpiar=await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents',{method:'DELETE'});assert.equal(limpiar.ok,true);
 db=cliente();[titular,miembro,encargado,actual,otro]=await Promise.all(['titular','miembro','encargado','actual','otra'].map(actor));
 iglesiaId=`legacy_${Date.now()}`;otra=`otra_${Date.now()}`;
 a=db.doc(`iglesias/${iglesiaId}`);b=db.doc(`iglesias/${otra}`);
 await a.create({adminUid:titular.uid,nombre:'Solo demo',codigoAcceso:iglesiaId.toUpperCase()});
 await b.create({adminUid:otro.uid,nombre:'Otra demo',codigoAcceso:otra.toUpperCase()});
 for(const p of [titular,miembro,encargado,actual,otro]){
  datos[p.uid]={iglesiaId:p===otro?otra:iglesiaId,rolGlobal:[titular,otro].includes(p)?'admin_iglesia':'servidor',
   nombre:'Persona sintetica',email:p.email,descripcion:'Conservar',preferencias:{tema:'oscuro'},
   ...(p===actual?{pertenenciaId:'c'.repeat(64)}:{})};
  await db.doc(`usuarios_globales/${p.uid}`).create(datos[p.uid]);
 }
 await db.doc(`${a.path}/finanzas_config/acceso`).create({encargadoUid:encargado.uid,moduloHabilitado:false});
 antes={a:await a.get(),b:await b.get(),acceso:await db.doc(`${a.path}/finanzas_config/acceso`).get()};
});
after(async()=>{fs.writeFileSync(path.resolve(__dirname,'../../docs/membresia_legacy_2026-10-28/puente.json'),JSON.stringify(evidencia,null,2));await db.terminate();});
const solicitud=(p,id,pertenenciaId)=>({iglesiaId,uidObjetivo:p.uid,accion:'salir',pertenenciaId,solicitudId:id});
test('Legacy sin generacion: la entrada normal rechaza la salida; no cambia perfil',async()=>{
 const r=await call('desvincularMiembroIglesia',miembro,solicitud(miembro,'legacy_antes_12345678','d'.repeat(64)));
 assert.equal(r.body.error.status,'FAILED_PRECONDITION');
 assert.deepEqual((await db.doc(`usuarios_globales/${miembro.uid}`).get()).data(),datos[miembro.uid]);
 evidencia.casos.push('Salida legacy rechazada sin escrituras');
});
test('Herramienta existente migra, verifica y repite sin renovar; titular/encargado/otra iglesia conservados',async()=>{
 const r=await migrar('puente_legacy');assert.equal(r.migrados,4);
 for(const p of [titular,miembro,encargado,actual,otro]){
  const ref=db.doc(`usuarios_globales/${p.uid}`),s=await ref.get();
  assert.match(s.data().pertenenciaId,/^[a-f0-9]{64}$/);
  const {pertenenciaId,...resto}=s.data();const {pertenenciaId:anterior,...original}=datos[p.uid];assert.deepEqual(resto,original);
  const c=await db.doc(`migraciones_pertenencia/${p.uid}`).get();
  if(p===actual){assert.equal(pertenenciaId,anterior);assert.equal(c.exists,false);}
  else {assert.equal(c.data().pertenenciaId,pertenenciaId);assert.deepEqual(c.updateTime,s.updateTime);assert.equal(typeof c.data().fechaCreacion.seconds,'number');assert.ok(c.data().fechaCreacion.toMillis()<=s.updateTime.toMillis());}
  datos[p.uid]=s.data();
 }
 for(const [key,ref] of [['a',a],['b',b],['acceso',db.doc(`${a.path}/finanzas_config/acceso`)]]){const s=await ref.get();assert.deepEqual(s.data(),antes[key].data());assert.deepEqual(s.updateTime,antes[key].updateTime);}
 const versiones=await Promise.all([miembro,titular,encargado].map(async p=>(await db.doc(`usuarios_globales/${p.uid}`).get()).updateTime));
 assert.equal((await usar({},t=>t.ejecutar('reanudar','puente_legacy'))).metricas.migrados,0);
 assert.equal((await migrar('puente_repaso')).migrados,0);
 assert.deepEqual(await Promise.all([miembro,titular,encargado].map(async p=>(await db.doc(`usuarios_globales/${p.uid}`).get()).updateTime)),versiones);
 evidencia.casos.push('Cuatro migrados, actual omitido, comprobantes atomicos, repaso idempotente; iglesias y encargo intactos');
});
test('Salida normal del migrado, recibo y recuperacion; reingreso a otra iglesia invalida solicitud antigua',async()=>{
 const d=solicitud(miembro,'legacy_salida_12345678',datos[miembro.uid].pertenenciaId);
 const primera=await call('desvincularMiembroIglesia',miembro,d);assert.equal(primera.status,200,JSON.stringify(primera));
 const ref=db.doc(`usuarios_globales/${miembro.uid}`),s=await ref.get();assert.equal(s.data().iglesiaId,undefined);assert.equal(s.data().rolGlobal,undefined);
 assert.equal(s.data().pertenenciaId,d.pertenenciaId);
 assert.deepEqual(await call('desvincularMiembroIglesia',miembro,d),primera);assert.deepEqual((await ref.get()).updateTime,s.updateTime);
 assert.equal((await call('recuperarContextoSolicitudDesvinculacion',miembro,{solicitudId:d.solicitudId})).body.result.estado,'CONFIRMADA');
 const reingreso=await call('vincularUsuarioConCodigo',miembro,{codigo:otra,nombre:'Persona sintetica',solicitudId:'legacy_reingreso_12345678'});
 assert.equal(reingreso.status,200,JSON.stringify(reingreso));const nuevo=await ref.get();assert.equal(nuevo.data().iglesiaId,otra);assert.notEqual(nuevo.data().pertenenciaId,d.pertenenciaId);
 assert.equal((await call('desvincularMiembroIglesia',miembro,d)).body.error.status,'FAILED_PRECONDITION');assert.deepEqual((await ref.get()).data(),nuevo.data());
 evidencia.casos.push('Migrado sale via callable normal, replay/recuperacion; reingreso renueva generacion y rechaza solicitud vieja');
});
test('Titular no sale sin transferir; actual sale; encargado migra sin conceder permisos y salida revoca designacion',async()=>{
 assert.equal((await call('desvincularMiembroIglesia',titular,solicitud(titular,'titular_salida_12345678',datos[titular.uid].pertenenciaId))).body.error.status,'FAILED_PRECONDITION');
 assert.equal((await call('desvincularMiembroIglesia',actual,solicitud(actual,'actual_salida_12345678',datos[actual.uid].pertenenciaId))).status,200);
 assert.equal((await call('desvincularMiembroIglesia',encargado,solicitud(encargado,'encargado_salida_12345678',datos[encargado.uid].pertenenciaId))).status,200);
 const acceso=(await db.doc(`${a.path}/finanzas_config/acceso`).get()).data();assert.equal(acceso.encargadoUid,null);assert.equal(acceso.moduloHabilitado,false);
 evidencia.casos.push('Titular protegido, salida actual compatible; salida de encargado revoca por motor existente, no por migracion');
});
test('Iglesia ajena y parametros modificados no pueden reutilizar pertenencia migrada',async()=>{
 const d=solicitud(titular,'ajeno_salida_12345678',datos[titular.uid].pertenenciaId);
 assert.equal((await call('desvincularMiembroIglesia',otro,d)).body.error.status,'PERMISSION_DENIED');
 assert.equal((await db.doc(`usuarios_globales/${titular.uid}`).get()).data().iglesiaId,iglesiaId);
});
test('Clasificador original manda casos ambiguos a revision sin fabricar historia',()=>{
 const base={uid:'legacy',perfil:{iglesiaId:'a',rolGlobal:'servidor'},iglesia:{id:'a',existe:true,adminUid:'titular'}};
 for(const extra of [{iglesiaId:['a','b']},{iglesiaId:null},{pertenenciaId:null},{pertenenciaId:''},{rolGlobal:'admin_iglesia'}])assert.equal(clasificarPerfilPertenencia({...base,perfil:{...base.perfil,...extra}}).categoria,'revision');
 assert.equal(clasificarPerfilPertenencia({...base,iglesia:{id:'a',existe:false}}).categoria,'revision');
 assert.equal(clasificarPerfilPertenencia({...base,versionEsperada:'1:1',versionActual:'1:2'}).categoria,'conflicto');
 assert.equal(clasificarPerfilPertenencia({...base,perfil:{nombre:'Sin iglesia'}}).categoria,'omitido');
 evidencia.casos.push('Multiples iglesias en campo canonico, ID invalido, titular incoherente o iglesia ausente requieren revision; sin iglesia omitido');
});
