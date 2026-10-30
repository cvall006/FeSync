'use strict';
const {before,after,beforeEach,test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../capacitaciones_rules/package.json'));
const {initializeTestEnvironment,assertSucceeds,assertFails}=req('@firebase/rules-unit-testing');
const {doc,collection,collectionGroup,query,where,getDoc,getDocs,setDoc,updateDoc,deleteDoc,setLogLevel}=req('firebase/firestore');
setLogLevel('silent');let env;
const baseline=process.env.FIN_RELEASE6_BASELINE==='true';
const libro=['finanzas_movimientos','finanzas_auditoria','finanzas_cierres'];
const ocultas=['finanzas_control','finanzas_saldos','finanzas_resumenes','finanzas_aperturas','finanzas_reversiones'];
const globales=['operaciones_financieras/admin/solicitudes','finanzas_mvp_solicitudes/admin/solicitudes',
  'finanzas_resoluciones/admin/solicitudes','finanzas_mantenimiento/admin/solicitudes','finanzas_mantenimiento_resoluciones/admin/solicitudes'];
const db=uid=>uid===null?env.unauthenticatedContext().firestore():env.authenticatedContext(uid).firestore();
async function preparar(cambios){await env.withSecurityRulesDisabled(async c=>{
  for(const [p,d]of Object.entries(cambios))if(d===null)await deleteDoc(doc(c.firestore(),p));else await setDoc(doc(c.firestore(),p),d);
});}
before(async()=>{
  if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098') throw Error('Solo demo aislada');
  env=await initializeTestEnvironment({projectId:'demo-fesync',firestore:{host:'127.0.0.1',port:8098,
    rules:fs.readFileSync(path.resolve(__dirname,baseline?'../../docs/fin_release_6_2026-10-26/firestore-antes.rules':'../../firestore.rules'),'utf8')}});
});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();
  const datos={'iglesias/a':{adminUid:'admin'},'iglesias/b':{adminUid:'externo'},
    'iglesias/a/finanzas_config/acceso':{moduloHabilitado:true,encargadoUid:'encargado'},
    'iglesias/a/finanzas_elegibilidad/miembro':{habilitado:true,esEncargado:false,version:1}};
  for(const [uid,rol,iglesia]of [['admin','admin_iglesia','a'],['encargado','servidor','a'],['revocado','servidor','a'],
    ['miembro','servidor','a'],['lider','lider_area','a'],['externo','admin_iglesia','b']])datos['usuarios_globales/'+uid]={rolGlobal:rol,iglesiaId:iglesia,pertenenciaId:'a'.repeat(64)};
  for(const name of [...libro,...ocultas])datos[`iglesias/a/${name}/privado`]={iglesiaId:'a',marca:true,privado:{aportante:{nombre:'SINTETICO_PRIVADO'}},responsable:{uid:'admin'}};
  for(const name of globales)datos[name+'/privado']={marca:true,uid:'admin',precondiciones:{pertenenciaId:'a'.repeat(64)}};
  await preparar(datos);
});
async function denegarRuta(cliente,ruta){
  await assertFails(getDoc(doc(cliente,ruta+'/privado')));
  await assertFails(getDocs(collection(cliente,ruta)));
  await assertFails(getDocs(query(collection(cliente,ruta),where('marca','==',true))));
}
if(baseline){
  for(const uid of ['admin','encargado'])test(`ANTES: ${uid} lee libro completo sin gate y con gate falso`,async()=>{
    for(const gate of [null,{habilitado:false}]){
      await preparar({'iglesias/a/finanzas_control/publicacion_v1':gate});
      for(const name of libro){
        const d=await assertSucceeds(getDoc(doc(db(uid),`iglesias/a/${name}/privado`)));
        assert.equal(d.data().privado.aportante.nombre,'SINTETICO_PRIVADO');
        assert.equal((await assertSucceeds(getDocs(collection(db(uid),`iglesias/a/${name}`)))).size,1);
      }
    }
  });
}else{
  for(const uid of ['admin','encargado','revocado','miembro','lider','externo','sin-perfil',null]){
    test(`DESPUES: ${uid??'anonimo'} no lee libro, controles, recibos ni intenciones por documento o consulta`,async()=>{
      const cliente=db(uid);
      for(const name of [...libro,...ocultas])await denegarRuta(cliente,'iglesias/a/'+name);
      for(const name of globales)await denegarRuta(cliente,name);
      for(const name of [...libro,'solicitudes']){
        await assertFails(getDocs(collectionGroup(cliente,name)));
        await assertFails(getDocs(query(collectionGroup(cliente,name),where('marca','==',true))));
      }
    });
  }
  for(const gate of [false,true])test(`Gate ${gate} no abre lecturas o escrituras directas ni a titular o encargado`,async()=>{
    await preparar({'iglesias/a/finanzas_control/publicacion_v1':{versionEsquema:1,iglesiaId:'a',circuito:'v1_incremental',habilitado:gate}});
    for(const uid of ['admin','encargado']){
      const cliente=db(uid);
      for(const name of [...libro,...ocultas]){
        const ruta='iglesias/a/'+name;await denegarRuta(cliente,ruta);
        await assertFails(setDoc(doc(cliente,ruta+'/nuevo'),{marca:true}));
        await assertFails(updateDoc(doc(cliente,ruta+'/privado'),{marca:false}));
        await assertFails(deleteDoc(doc(cliente,ruta+'/privado')));
      }
      for(const ruta of globales){
        await assertFails(setDoc(doc(cliente,ruta+'/nuevo'),{marca:true}));
        await assertFails(updateDoc(doc(cliente,ruta+'/privado'),{marca:false}));
        await assertFails(deleteDoc(doc(cliente,ruta+'/privado')));
      }
    }
  });
  test('Revocar al encargado retira catálogos y configuración y nunca abre el libro',async()=>{
    await preparar({'iglesias/a/finanzas_cuentas/privado':{cuenta:{id:'privado'}}});
    const cliente=db('encargado');await assertSucceeds(getDoc(doc(cliente,'iglesias/a/finanzas_cuentas/privado')));
    await preparar({'iglesias/a/finanzas_config/acceso':{moduloHabilitado:true,encargadoUid:null}});
    await assertFails(getDoc(doc(cliente,'iglesias/a/finanzas_config/acceso')));
    await denegarRuta(cliente,'iglesias/a/finanzas_cuentas');
    for(const name of libro)await denegarRuta(cliente,'iglesias/a/'+name);
  });
  test('Dashboard/perfil/membresía conservan iglesia, consulta acotada, señal propia y edición auxiliar',async()=>{
    const cliente=db('miembro');
    await assertSucceeds(getDoc(doc(cliente,'iglesias/a')));
    await assertSucceeds(getDoc(doc(cliente,'usuarios_globales/miembro')));
    await assertSucceeds(getDoc(doc(cliente,'usuarios_globales/encargado')));
    const miembros=await assertSucceeds(getDocs(query(collection(cliente,'usuarios_globales'),where('iglesiaId','==','a'))));
    assert.equal(miembros.size,5);
    await assertSucceeds(getDoc(doc(cliente,'iglesias/a/finanzas_elegibilidad/miembro')));
    await assertSucceeds(updateDoc(doc(cliente,'usuarios_globales/miembro'),{nombre:'Actualizado'}));
    await assertFails(getDoc(doc(cliente,'iglesias/b')));
    await assertFails(getDocs(collection(cliente,'usuarios_globales')));
    await assertFails(updateDoc(doc(cliente,'usuarios_globales/miembro'),{iglesiaId:'b'}));
  });
  test('Agenda, turnos, capacitaciones, escuela, comunidad y Adora conservan accesos previos',async()=>{
    for(const name of ['agenda_eventos','turnos_servicio','capacitaciones','escuela_modulos','adora_canciones','adora_eventos']){
      const ruta=`iglesias/a/${name}/regresion`;
      await assertSucceeds(setDoc(doc(db('lider'),ruta),{titulo:'Prueba local'}));
      await assertSucceeds(getDoc(doc(db('miembro'),ruta)));
      await assertSucceeds(getDocs(collection(db('miembro'),`iglesias/a/${name}`)));
      await assertFails(getDoc(doc(db('externo'),ruta)));
      await assertFails(setDoc(doc(db('miembro'),ruta),{titulo:'No autorizado'}));
    }
    const ruta='iglesias/a/muro_comunidad/regresion';
    await assertSucceeds(setDoc(doc(db('miembro'),ruta),{autorUid:'miembro',contenido:'Prueba local'}));
    await assertSucceeds(getDoc(doc(db('encargado'),ruta)));
    await assertSucceeds(updateDoc(doc(db('miembro'),ruta),{contenido:'Edicion'}));
    await assertFails(getDoc(doc(db(null),ruta)));
    await assertSucceeds(setDoc(doc(db('lider'),'iglesias/a/escuela_modulos/regresion/evaluaciones/prueba'),{titulo:'Prueba'}));
    await assertSucceeds(getDoc(doc(db('miembro'),'iglesias/a/escuela_modulos/regresion/evaluaciones/prueba')));
  });
}
