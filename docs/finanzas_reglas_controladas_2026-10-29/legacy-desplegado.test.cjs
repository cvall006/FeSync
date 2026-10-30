'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../test/capacitaciones_rules/package.json'));
const adminReq=createRequire(path.resolve(__dirname,'../../functions/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,getDoc,updateDoc,deleteField,setLogLevel}=req('firebase/firestore');
const {initializeApp,deleteApp}=adminReq('firebase-admin/app'),{getFirestore,FieldValue}=adminReq('firebase-admin/firestore');
const {HttpsError}=adminReq('firebase-functions/v2/https');setLogLevel('silent');
let env,app,db,handlers;
before(async()=>{
 assert.equal(process.env.GCLOUD_PROJECT,'demo-fesync');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8098');
 const a=fs.readFileSync(path.join(__dirname,'registrarNuevaIglesiaSegura.desplegado.js'),'utf8'),b=fs.readFileSync(path.join(__dirname,'vincularUsuarioConCodigo.desplegado.js'),'utf8');assert.equal(a,b);assert.ok(!a.includes('pertenenciaId'));
 app=initializeApp({projectId:'demo-fesync'},'reglas-legacy-controlado');db=getFirestore(app);
 // Firestore comprueba instanceof Promise del realm anfitrión; normalizar
 // únicamente esa frontera del arnés VM, conservando el callback desplegado.
 const dbFuente=new Proxy(db,{get(target,key){if(key==='runTransaction')return(callback,...options)=>target.runTransaction((...args)=>Promise.resolve(callback(...args)),...options);const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 env=await initializeTestEnvironment({projectId:'demo-fesync',firestore:{host:'127.0.0.1',port:8098,rules:fs.readFileSync(path.join(__dirname,'candidato.rules'),'utf8')}});
 handlers={};vm.runInNewContext(a,{exports:handlers,console,Buffer,require:n=>{
 if(n==='firebase-functions/v2/firestore')return{onDocumentCreated:()=>null,onDocumentUpdated:()=>null};
 if(n==='firebase-functions/v2')return{setGlobalOptions:()=>{}};
 if(n==='firebase-admin/app')return{initializeApp:()=>app};
 if(n==='firebase-admin/firestore')return{getFirestore:()=>dbFuente,FieldValue};
 if(n==='firebase-admin/messaging')return{getMessaging:()=>({sendEachForMulticast:async()=>({responses:[],successCount:0,failureCount:0})})};
 if(n==='firebase-functions/v2/https')return{onCall:(...args)=>args.at(-1),HttpsError};
 throw Error('IMPORT_NO_ADMITIDO: '+n);
 }},{filename:'index-desplegado.js',timeout:5000});
});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app);});
test('Fuentes realmente desplegadas: altas sin generacion y flujo habitual completo bajo reglas candidatas',async()=>{
 await env.clearFirestore();const admin='titular_legacy',member='miembro_legacy',code='LEGACYCONTROLADO';
 const created=await handlers.registrarNuevaIglesiaSegura({auth:{uid:admin},data:{nombreIglesia:'Solo emulador',nombreAdmin:'Titular sintetico',codigo:code}});
 assert.equal(created.ok,true);const iglesia=created.iglesiaId;
 const join=()=>handlers.vincularUsuarioConCodigo({auth:{uid:member},data:{codigo:code,nombre:'Miembro sintetico'}});
 await join();
 for(const uid of [admin,member]){const p=(await db.doc('usuarios_globales/'+uid).get()).data();assert.equal(p.iglesiaId,iglesia);assert.ok(!Object.hasOwn(p,'pertenenciaId'));}
 const adminDb=env.authenticatedContext(admin).firestore(),memberDb=env.authenticatedContext(member).firestore();
 const target=doc(adminDb,'usuarios_globales',member),own=doc(memberDb,'usuarios_globales',member);
 await assertSucceeds(updateDoc(own,{nombre:'Nombre actualizado',descripcion:'Servicio',fotoUrl:'',fcmToken:'solo-demo'}));
 await assertSucceeds(updateDoc(target,{rolGlobal:'lider_area',descripcion:'Area'}));
 await assertSucceeds(updateDoc(target,{rolGlobal:'servidor',descripcion:'Servicio'}));
 await assertFails(updateDoc(own,{pertenenciaId:'a'.repeat(64)}));
 // Payload exacto de expulsión del cliente HEAD anterior.
 await assertSucceeds(updateDoc(target,{iglesiaId:deleteField(),rolGlobal:deleteField(),descripcion:deleteField()}));
 assert.ok(!Object.hasOwn((await getDoc(own)).data(),'iglesiaId'));
 await join();assert.ok(!Object.hasOwn((await db.doc('usuarios_globales/'+member).get()).data(),'pertenenciaId'));
 // Limpieza de token previa y payload exacto de salida de Perfil antiguo.
 await assertSucceeds(updateDoc(own,{fcmToken:deleteField()}));
 await assertSucceeds(updateDoc(own,{iglesiaId:deleteField(),rolGlobal:deleteField()}));
 await join();
 await handlers.transferirAdministracionIglesia({auth:{uid:admin},data:{iglesiaId:iglesia,nuevoAdminUid:member}});
 await assertSucceeds(updateDoc(doc(memberDb,'usuarios_globales',admin),{descripcion:'Lider anterior',rolGlobal:'lider_area'}));
 await assertSucceeds(updateDoc(doc(adminDb,'usuarios_globales',admin),{iglesiaId:deleteField(),rolGlobal:deleteField()}));
 const final=(await getDoc(own)).data();assert.equal(final.rolGlobal,'admin_iglesia');assert.ok(!Object.hasOwn(final,'pertenenciaId'));
 fs.writeFileSync(path.join(__dirname,'flujo-legacy.json'),JSON.stringify({proyecto:'demo-fesync',fuentes:'descargadas de las dos revisiones remotas sin modificar',altasSinPertenenciaId:true,ingreso:true,expulsion:true,reingreso:true,salida:true,roles:true,transferencia:true,perfilYTokens:true,escriturasProduccion:0},null,2)+'\n');
});
