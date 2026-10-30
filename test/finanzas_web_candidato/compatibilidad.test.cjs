'use strict';
const {before,after,beforeEach,test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../capacitaciones_rules/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,deleteField,setLogLevel}=req('firebase/firestore');
setLogLevel('silent');let env;
const P='a'.repeat(64),db=u=>u===null?env.unauthenticatedContext().firestore():env.authenticatedContext(u).firestore();
before(async()=>{
  if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098')throw Error('Solo demo 8098');
  env=await initializeTestEnvironment({projectId:'demo-fesync',firestore:{host:'127.0.0.1',port:8098,rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
    for(const [u,rol,iglesia,p] of [['admin','admin_iglesia','a'],['antiguo','servidor','a'],['nuevo','servidor','a',P],['nulo','servidor','a',null],['externo','admin_iglesia','b'],['lider','lider_area','a']])
      await setDoc(doc(c.firestore(),'usuarios_globales',u),{iglesiaId:iglesia,rolGlobal:rol,...(p!==undefined?{pertenenciaId:p}:{})});
    await setDoc(doc(c.firestore(),'iglesias/a'),{adminUid:'admin'});
  });
});
test('Cliente anterior sale del perfil sin generación, sin fabricar identidad financiera',async()=>{
  const ref=doc(db('antiguo'),'usuarios_globales/antiguo');
  await assertSucceeds(updateDoc(ref,{iglesiaId:deleteField(),rolGlobal:deleteField()}));
  assert.deepEqual((await getDoc(ref)).data(),{});
});
test('Cliente anterior cambia rol/expulsa legado, conservando la restricción de iglesia',async()=>{
  const ref=doc(db('admin'),'usuarios_globales/antiguo');
  await assertSucceeds(updateDoc(ref,{rolGlobal:'lider_area'}));
  await assertFails(updateDoc(ref,{rolGlobal:'admin_iglesia'}));
  await assertFails(updateDoc(doc(db('externo'),'usuarios_globales/antiguo'),{rolGlobal:'servidor'}));
  await assertSucceeds(updateDoc(ref,{iglesiaId:deleteField(),rolGlobal:deleteField()}));
});
for(const actor of ['antiguo','admin','lider','externo',null])test(`${actor}: no incorpora generación ni la encubre en una salida`,async()=>{
  const ref=doc(db(actor),'usuarios_globales/antiguo');
  await assertFails(updateDoc(ref,{pertenenciaId:P}));
  await assertFails(updateDoc(ref,{iglesiaId:deleteField(),rolGlobal:deleteField(),pertenenciaId:P}));
});
for(const objetivo of ['nuevo','nulo'])test(`Generación existente (${objetivo}) nunca se degrada a legado`,async()=>{
  for(const actor of [objetivo,'admin']){
    const ref=doc(db(actor),'usuarios_globales',objetivo);
    await assertFails(updateDoc(ref,{pertenenciaId:deleteField()}));
    await assertFails(updateDoc(ref,{pertenenciaId:deleteField(),iglesiaId:deleteField(),rolGlobal:deleteField()}));
    await assertFails(updateDoc(ref,{iglesiaId:deleteField(),rolGlobal:deleteField()}));
  }
});
test('Asignación servidor anterior a la escritura antigua obliga a actualizar cliente',async()=>{
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'usuarios_globales/antiguo'),{pertenenciaId:P}));
  await assertFails(updateDoc(doc(db('antiguo'),'usuarios_globales/antiguo'),{iglesiaId:deleteField(),rolGlobal:deleteField()}));
  await assertFails(updateDoc(doc(db('admin'),'usuarios_globales/antiguo'),{rolGlobal:'lider_area'}));
});
test('Titular no usa la salida antigua ni altera su generación',async()=>{
  await assertFails(updateDoc(doc(db('admin'),'usuarios_globales/admin'),{iglesiaId:deleteField(),rolGlobal:deleteField()}));
});
