'use strict';
if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098')throw Error('SOLO_EMULADOR_DEMO');
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../capacitaciones_rules/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteField,setLogLevel}=req('firebase/firestore');setLogLevel('silent');
for(const [nombre,ruta,protege] of [
 ['snapshot remoto actual','docs/membresia_verificacion_2026-10-28/remotas-0.rules',false],['reglas locales','firestore.rules',true],
])test(`${nombre}: compara edicion de pertenencia con iglesia/rol conservados`,async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-fesync',firestore:{host:'127.0.0.1',port:8098,rules:fs.readFileSync(path.resolve(__dirname,'../..',ruta),'utf8')}});
 try{
  await env.clearFirestore();
  const uid='miembro_sintetico',datos={iglesiaId:'demo',rolGlobal:'servidor',nombre:'Fixture local'};
  const seed=async(extra={})=>env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'usuarios_globales',uid),{...datos,...extra});
   await setDoc(doc(ctx.firestore(),'iglesias','demo'),{adminUid:'titular_sintetico'});
  });
  await seed();const ref=doc(env.authenticatedContext(uid).firestore(),'usuarios_globales',uid);
  const esperado=protege?assertFails:assertSucceeds;
  await esperado(updateDoc(ref,{pertenenciaId:'a'.repeat(64)}));
  for(const nuevo of ['b'.repeat(64),null,deleteField()]){
   await seed({pertenenciaId:'a'.repeat(64)});
   await esperado(updateDoc(ref,{pertenenciaId:nuevo}));
  }
  await seed({pertenenciaId:'a'.repeat(64)});
  await assertSucceeds(updateDoc(ref,{nombre:'Edicion auxiliar legitima'}));
  await assertFails(updateDoc(ref,{rolGlobal:'admin_iglesia'}));
 }finally{await env.cleanup();}
});
