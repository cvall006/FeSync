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
  await assertSucceeds(getDocs(collection(db(actor),ciclo+'/asignaciones')));
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
 await assertSucceeds(setDoc(doc(d,asignacion),{...asignacionData('admin','m2'),revision:3}));
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
