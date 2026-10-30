'use strict';
const {before,after,beforeEach,test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../capacitaciones_rules/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch,setLogLevel}=req('firebase/firestore');
setLogLevel('silent');let env;
const project='demo-fesync-escuela',port=8099;
const db=uid=>uid===null?env.unauthenticatedContext().firestore():env.authenticatedContext(uid).firestore();
const ciclo='iglesias/a/escuela_ciclos/c1',asignacion=ciclo+'/asignaciones/hermano';
const cicloData=()=>({version:1,nombre:'Primer ciclo',anio:2026,estado:'abierto',creadoPor:'admin',creadoEn:serverTimestamp(),cerradoPor:null,cerradoEn:null});
const asignacionData=(actor='admin',modulo='m1')=>({version:1,hermanoUid:'hermano',nombreHermano:'Hermano',moduloId:modulo,
 tituloModulo:modulo==='m1'?'Fundamentos':'Evangelios',estado:'pendiente',asignadoPor:actor,asignadoEn:serverTimestamp(),actualizadoPor:actor,actualizadoEn:serverTimestamp(),revision:1});
async function seed(data){await env.withSecurityRulesDisabled(async c=>{
 for(const [p,d]of Object.entries(data)) {if(d===null)await deleteDoc(doc(c.firestore(),p));else await setDoc(doc(c.firestore(),p),d);}
});}
before(async()=>{
 if(process.env.GCLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:'+port)throw Error('Solo emulador de Escuela aislado');
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port,rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();const data={'iglesias/a':{adminUid:'admin'},'iglesias/b':{adminUid:'externo'},
 'iglesias/a/escuela_modulos/m1':{titulo:'Fundamentos',clases:[]},'iglesias/a/escuela_modulos/m2':{titulo:'Evangelios',clases:[]}};
 for(const [uid,rol,iglesia]of [['admin','admin_iglesia','a'],['lider','lider_area','a'],['hermano','servidor','a'],['externo','admin_iglesia','b']])data['usuarios_globales/'+uid]={nombre:uid==='hermano'?'Hermano':uid,iglesiaId:iglesia,rolGlobal:rol};
 await seed(data);await assertSucceeds(setDoc(doc(db('admin'),ciclo),cicloData()));
});
for(const actor of ['admin','lider'])test(actor+' crea y administra asignaciones legacy sin pertenenciaId',async()=>{
 const d=db(actor);await assertSucceeds(setDoc(doc(d,asignacion),asignacionData(actor)));
 await assertSucceeds(updateDoc(doc(d,asignacion),{estado:'en_curso',actualizadoPor:actor,actualizadoEn:serverTimestamp(),revision:2}));
 await assertSucceeds(updateDoc(doc(d,asignacion),{estado:'completado',actualizadoPor:actor,actualizadoEn:serverTimestamp(),revision:3}));
 assert.equal((await getDoc(doc(d,asignacion))).data().estado,'completado');
});
for(const actor of ['hermano','externo',null])test(String(actor)+' no administra Escuela',async()=>{
 const d=db(actor);await assertFails(setDoc(doc(d,asignacion),asignacionData(actor)));
 await assertFails(setDoc(doc(d,'iglesias/a/escuela_ciclos/no'),cicloData()));
 await assertFails(updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:actor,cerradoEn:serverTimestamp()}));
});
test('Lectura de ciclos y asignaciones limitada a la iglesia',async()=>{
 await setDoc(doc(db('admin'),asignacion),asignacionData());
 for(const actor of ['admin','lider','hermano']){
  await assertSucceeds(getDocs(collection(db(actor),'iglesias/a/escuela_ciclos')));
  if(actor==='hermano')await assertFails(getDocs(collection(db(actor),ciclo+'/asignaciones')));
  else await assertSucceeds(getDocs(collection(db(actor),ciclo+'/asignaciones')));
 }
 for(const actor of ['externo',null]){
  await assertFails(getDoc(doc(db(actor),asignacion)));
  await assertFails(getDocs(collection(db(actor),'iglesias/a/escuela_ciclos')));
 }
});
test('No asigna hermanos ni módulos de otra iglesia ni módulos ausentes',async()=>{
 await seed({'usuarios_globales/hermano':{nombre:'Hermano',iglesiaId:'b',rolGlobal:'servidor'},'iglesias/b/escuela_modulos/externo':{titulo:'Externo'}});
 await assertFails(setDoc(doc(db('admin'),asignacion),asignacionData()));
 await seed({'usuarios_globales/hermano':{nombre:'Hermano',iglesiaId:'a',rolGlobal:'servidor'}});
 await assertFails(setDoc(doc(db('admin'),asignacion),{...asignacionData(),moduloId:'externo'}));
 await assertFails(setDoc(doc(db('admin'),asignacion),{...asignacionData(),moduloId:'m1/otro'}));
});
test('Valida identidad, estado, copias, revisión y atribución',async()=>{
 for(const patch of [{hermanoUid:'otro'},{nombreHermano:'Otro'},{tituloModulo:'Alterado'},{estado:'aprobado'},
  {estado:'completado'},{revision:2},{asignadoPor:'lider'},{actualizadoPor:'lider'},
  {asignadoEn:Timestamp.fromMillis(1)},{actualizadoEn:Timestamp.fromMillis(1)},{extra:true}]){
  await assertFails(setDoc(doc(db('admin'),asignacion),{...asignacionData(),...patch}));
 }
});
test('Un hermano y un módulo diferentes pueden coexistir en un ciclo',async()=>{
 await seed({'usuarios_globales/otro':{nombre:'Otro',iglesiaId:'a',rolGlobal:'servidor'}});
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await assertSucceeds(setDoc(doc(d,ciclo+'/asignaciones/otro'),{...asignacionData('admin','m2'),hermanoUid:'otro',nombreHermano:'Otro'}));
 assert.equal((await getDocs(collection(d,ciclo+'/asignaciones'))).size,2);
});
test('Cambiar módulo exige reiniciar estado y renovar atribución',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await updateDoc(doc(d,asignacion),{estado:'completado',actualizadoEn:serverTimestamp(),revision:2});
 await assertFails(updateDoc(doc(d,asignacion),{moduloId:'m2',tituloModulo:'Evangelios',revision:3,actualizadoEn:serverTimestamp()}));
 const anterior=(await getDoc(doc(d,asignacion))).data();
 await assertFails(setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:3}));
 await assertSucceeds(setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:3,historialModulos:[anterior]}));
});
test('Cambios de estado preservan metadatos y rechazan revisiones antiguas',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await assertFails(updateDoc(doc(d,asignacion),{estado:'en_curso',revision:1,actualizadoEn:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,asignacion),{tituloModulo:'Borrado',revision:2,actualizadoEn:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,asignacion),{asignadoEn:serverTimestamp(),revision:2,actualizadoEn:serverTimestamp()}));
});
test('Cerrar conserva historial; no permite reabrir, editar ni borrar',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await assertSucceeds(updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,asignacion),{estado:'completado',revision:2,actualizadoEn:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,ciclo),{estado:'abierto',cerradoPor:null,cerradoEn:null}));
 await assertFails(deleteDoc(doc(d,ciclo)));await assertFails(deleteDoc(doc(d,asignacion)));
 assert.equal((await getDoc(doc(db('hermano'),asignacion))).data().tituloModulo,'Fundamentos');
});
test('No se puede cerrar y editar asignaciones en el mismo batch',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 const batch=writeBatch(d);batch.update(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()});
 batch.update(doc(d,asignacion),{estado:'completado',revision:2,actualizadoEn:serverTimestamp()});await assertFails(batch.commit());
});
test('Mismo módulo reutilizable en dos ciclos del mismo año sin sobrescribir',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()});
 const otro='iglesias/a/escuela_ciclos/c2';await setDoc(doc(d,otro),{...cicloData(),nombre:'Segundo ciclo'});
 await assertSucceeds(setDoc(doc(d,otro+'/asignaciones/hermano'),asignacionData()));
 assert.equal((await getDoc(doc(d,asignacion))).data().revision,1);
});
test('Historial sobrevive a salida, cambio de nombre y borrado del catálogo',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()});
 await seed({'usuarios_globales/hermano':{nombre:'Otro nombre',iglesiaId:'b',rolGlobal:'servidor'},'iglesias/a/escuela_modulos/m1':null});
 const saved=(await assertSucceeds(getDoc(doc(d,asignacion)))).data();
 assert.equal(saved.nombreHermano,'Hermano');assert.equal(saved.tituloModulo,'Fundamentos');
 await assertFails(getDoc(doc(db('hermano'),asignacion)));
});
test('Pérdida del rol o de pertenencia revoca escritura inmediatamente',async()=>{
 const d=db('lider');await setDoc(doc(d,asignacion),asignacionData('lider'));
 await seed({'usuarios_globales/lider':{iglesiaId:'a',rolGlobal:'servidor'}});
 await assertFails(updateDoc(doc(d,asignacion),{estado:'completado',actualizadoPor:'lider',actualizadoEn:serverTimestamp(),revision:2}));
});
test('No edita asignaciones de un hermano que salió, pero conserva lectura histórica',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await seed({'usuarios_globales/hermano':{nombre:'Hermano',iglesiaId:'b',rolGlobal:'servidor'}});
 await assertFails(updateDoc(doc(d,asignacion),{estado:'completado',actualizadoEn:serverTimestamp(),revision:2}));
 await assertSucceeds(getDoc(doc(d,asignacion)));
});
test('Catálogo y evaluaciones legacy conservan sus accesos',async()=>{
 const p='iglesias/a/escuela_modulos/m1/evaluaciones/hermano';
 await assertSucceeds(setDoc(doc(db('lider'),p),{nombreEstudiante:'Hermano',notaFinal:'7',asistencia:{c1:true}}));
 await assertSucceeds(getDoc(doc(db('hermano'),p)));
 await assertFails(setDoc(doc(db('hermano'),p),{notaFinal:'7'}));
 await assertFails(getDoc(doc(db('externo'),p)));
});
test('Las rutas financieras privadas siguen denegadas',async()=>{
 await seed({'iglesias/a/finanzas_movimientos/privado':{privado:true}});
 for(const uid of ['admin','lider','hermano'])await assertFails(getDoc(doc(db(uid),'iglesias/a/finanzas_movimientos/privado')));
});
test('Perfil antiguo sin nombre conserva una asignación identificada por UID',async()=>{
 await seed({'usuarios_globales/hermano':{nombre:null,iglesiaId:'a',rolGlobal:'servidor'}});
 await assertSucceeds(setDoc(doc(db('admin'),asignacion),{...asignacionData(),nombreHermano:'Sin nombre'}));
});
for(const actor of ['lider','hermano','externo',null])test(String(actor)+' no puede eliminar un ciclo',async()=>{
 await assertFails(updateDoc(doc(db(actor),ciclo),{eliminado:true,eliminadoPor:actor,eliminadoEn:serverTimestamp()}));
});
for(const cerrado of [false,true])test('Administrador elimina recuperablemente ciclo cerrado='+cerrado,async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 if(cerrado)await updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()});
 await assertSucceeds(updateDoc(doc(d,ciclo),{eliminado:true,eliminadoPor:'admin',eliminadoEn:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(d,asignacion)));
 await assertFails(updateDoc(doc(d,asignacion),{estado:'completado',revision:2,actualizadoEn:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,ciclo),{eliminado:false}));
 await assertFails(updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()}));
 await assertFails(deleteDoc(doc(d,ciclo)));await assertFails(deleteDoc(doc(d,asignacion)));
});
test('Borrado no admite suplantación ni alteraciones del ciclo',async()=>{
 for(const patch of [{eliminadoPor:'lider'},{eliminadoEn:Timestamp.fromMillis(1)},{nombre:'Alterado'},{eliminado:false}]){
  await assertFails(updateDoc(doc(db('admin'),ciclo),{eliminado:true,eliminadoPor:'admin',eliminadoEn:serverTimestamp(),...patch}));
 }
});
test('Borrar y editar asignación en un mismo batch está denegado',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 const batch=writeBatch(d);batch.update(doc(d,ciclo),{eliminado:true,eliminadoPor:'admin',eliminadoEn:serverTimestamp()});
 batch.update(doc(d,asignacion),{estado:'completado',revision:2,actualizadoEn:serverTimestamp()});await assertFails(batch.commit());
});
test('Miembro lee únicamente su documento de historial, sin listar ni modificar otros',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await seed({'usuarios_globales/otro':{nombre:'Otro',iglesiaId:'a',rolGlobal:'servidor'}});
 await setDoc(doc(d,ciclo+'/asignaciones/otro'),{...asignacionData(),hermanoUid:'otro',nombreHermano:'Otro'});
 await assertSucceeds(getDoc(doc(db('hermano'),asignacion)));
 await assertFails(getDoc(doc(db('hermano'),ciclo+'/asignaciones/otro')));
 await assertFails(getDoc(doc(db('otro'),asignacion)));
 await assertFails(getDocs(collection(db('hermano'),ciclo+'/asignaciones')));
 await assertFails(updateDoc(doc(db('hermano'),asignacion),{estado:'completado',actualizadoPor:'hermano',actualizadoEn:serverTimestamp(),revision:2}));
});
test('Administradores y líderes consultan historial general solo de su iglesia; revocación vigente',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 for(const u of ['admin','lider']){await assertSucceeds(getDoc(doc(db(u),asignacion)));await assertSucceeds(getDocs(collection(db(u),ciclo+'/asignaciones')));}
 await assertFails(getDoc(doc(db('externo'),asignacion)));
 await seed({'usuarios_globales/lider':{nombre:'Líder',iglesiaId:'a',rolGlobal:'servidor'}});
 await assertFails(getDoc(doc(db('lider'),asignacion)));await assertFails(getDocs(collection(db('lider'),ciclo+'/asignaciones')));
});
test('Completar y asignar siguiente preserva estado y atribución previos, incluso tras cerrar',async()=>{
 const d=db('admin');await setDoc(doc(d,asignacion),asignacionData());
 await updateDoc(doc(d,asignacion),{estado:'completado',actualizadoEn:serverTimestamp(),revision:2});
 const previo=(await getDoc(doc(d,asignacion))).data();
 await assertSucceeds(setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:3,historialModulos:[previo]}));
 await updateDoc(doc(d,asignacion),{estado:'en_curso',actualizadoEn:serverTimestamp(),revision:4});
 await updateDoc(doc(d,ciclo),{estado:'cerrado',cerradoPor:'admin',cerradoEn:serverTimestamp()});
 const data=(await assertSucceeds(getDoc(doc(db('hermano'),asignacion)))).data();
 assert.equal(data.historialModulos.length,1);assert.equal(data.historialModulos[0].estado,'completado');assert.equal(data.historialModulos[0].moduloId,'m1');assert.equal(data.moduloId,'m2');
});
test('Carga masiva real en emulador: conciliación concurrente, historial y privacidad sin nuevas reglas',async()=>{
 const adminReq=createRequire(path.resolve(__dirname,'../../functions/package.json'));
 const {initializeApp,deleteApp}=adminReq('firebase-admin/app');
 const {getFirestore,Timestamp:AdminTimestamp}=adminReq('firebase-admin/firestore');
 const {HttpsError}=adminReq('firebase-functions/v2/https');
 const app=initializeApp({projectId:project},'escuela-carga-prueba');
 try {
  const {escuelaCargarModulos}=require('../../functions/escuela_carga_masiva');
  const ejecutar=(auth='admin',patch={})=>escuelaCargarModulos({auth:auth?{uid:auth}:null,data:{iglesiaId:'a',cicloId:'c1',hermanos:['hermano'],
   modulos:[{moduloId:'m1',estado:'completado'},{moduloId:'m2',estado:'en_curso'}],confirmar:true,...patch}},
   {db:getFirestore(app),HttpsError,ahora:()=>AdminTimestamp.now()});
  const preview=await ejecutar('admin',{confirmar:false});
  assert.ok(preview.resultados.every(r=>r.resultado==='creado'));
  assert.equal((await getDoc(doc(db('admin'),asignacion))).exists(),false);
  const ambos=await Promise.all([ejecutar(),ejecutar('lider')]);
  assert.equal(ambos.flatMap(r=>r.resultados).filter(r=>r.resultado==='creado').length,2);
  assert.equal(ambos.flatMap(r=>r.resultados).filter(r=>r.resultado==='omitido').length,2);
  const propio=(await getDoc(doc(db('hermano'),asignacion))).data();
  assert.equal(propio.estado,'en_curso');assert.equal(propio.historialModulos.length,1);
  assert.equal(propio.historialModulos[0].estado,'completado');
  await assertSucceeds(getDocs(collection(db('lider'),ciclo+'/asignaciones')));
  await assertFails(getDoc(doc(db('externo'),asignacion)));
  await assertFails(updateDoc(doc(db('hermano'),asignacion),{estado:'completado'}));
  for(const uid of ['hermano','externo',null])await assert.rejects(ejecutar(uid),e=>['permission-denied','unauthenticated'].includes(e.code));
  const conflicto=await ejecutar('admin',{modulos:[{moduloId:'m1',estado:'pendiente'}]});
  assert.equal(conflicto.resultados[0].resultado,'conflicto');
  assert.deepEqual((await getDoc(doc(db('admin'),asignacion))).data(),propio);
 }finally{await deleteApp(app);}
});

test('No permite inventar, borrar o modificar registros históricos',async()=>{
 const d=db('admin');const fake={...asignacionData(),estado:'completado',asignadoEn:Timestamp.fromMillis(1),actualizadoEn:Timestamp.fromMillis(1)};
 await assertFails(setDoc(doc(d,asignacion),{...asignacionData(),historialModulos:[fake]}));
 await setDoc(doc(d,asignacion),asignacionData());const previo=(await getDoc(doc(d,asignacion))).data();
 await assertFails(setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:2,historialModulos:[{...previo,estado:'completado'}]}));
 await setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:2,historialModulos:[previo]});
 await assertFails(updateDoc(doc(d,asignacion),{historialModulos:[],revision:3,actualizadoEn:serverTimestamp()}));
 await assertFails(setDoc(doc(d,asignacion),{...asignacionData(),revision:3,historialModulos:[previo]}));
 await assertFails(updateDoc(doc(d,asignacion),{historialModulos:[{...previo,estado:'completado'}],revision:3,actualizadoEn:serverTimestamp()}));
});
