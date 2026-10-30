'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {urlDocumento,urlAuth,evaluar,verificar}=require('../../herramientas/verificacion_membresia_lectura.cjs');
const time=new Date(Math.floor(Date.now()/1000)*1000-1000).toISOString(),root='projects/fesync-app-2026/databases/(default)/documents/';
const c=(uid='miembro')=>({uid,perfil:{iglesiaId:'a',rolGlobal:'servidor'},version:time});
const resp=(data,status=200)=>({ok:status===200,status,headers:new Headers({date:new Date().toUTCString()}),json:async()=>data});
const doc=(collection,uid,perfil)=>({name:root+collection+'/'+uid,updateTime:time,fields:Object.fromEntries(Object.entries(perfil).map(([k,v])=>[k,{stringValue:v}]))});
function fixture({authExtra=false,denegar=false,comprobante=false,cambio=false}={}){
 const requests=[];let listados=0;
 const fetcher=async(url,opts)=>{
  const u=new URL(url);requests.push({u,opts});assert.equal(opts.redirect,'error');
  if(u.hostname==='identitytoolkit.googleapis.com'){
   assert.equal(opts.method,'POST');assert.equal(u.searchParams.get('fields'),'users(localId,disabled)');assert.deepEqual(Object.keys(JSON.parse(opts.body)),['localId']);
   return denegar?resp({},403):resp({users:['admin','miembro'].map(localId=>({localId,...(authExtra?{email:'no-permitido'}:{})}))});
  }
  assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
  if(u.hostname==='firebaserules.googleapis.com')return u.pathname.endsWith('cloud.firestore')?resp({rulesetName:'projects/fesync-app-2026/rulesets/demo-rules'}):resp({source:{files:[{name:'firestore.rules',content:'rules_version = "2";'}]}});
  assert.equal(u.hostname,'firestore.googleapis.com');assert.ok(u.pathname.startsWith('/v1/'+root));
  if(u.pathname.endsWith('/usuarios_globales')){
   listados++;const docs=[doc('usuarios_globales','admin',{iglesiaId:'a',rolGlobal:'admin_iglesia'}),doc('usuarios_globales','miembro',{iglesiaId:'a',rolGlobal:'servidor'}),doc('usuarios_globales','ambiguo',{iglesiaId:'no_existe',rolGlobal:'servidor'}),doc('usuarios_globales','libre',{})];
   if(cambio&&listados>2)docs[1].updateTime='2026-01-01T00:00:00.000Z';return resp({documents:docs});
  }
  if(u.pathname.endsWith('/iglesias'))return resp({documents:[doc('iglesias','a',{adminUid:'admin'})]});
  if(u.pathname.includes('/migraciones_pertenencia/')){
   assert.deepEqual(u.searchParams.getAll('mask.fieldPaths'),['version']);
   return comprobante?resp({name:root+'migraciones_pertenencia/'+u.pathname.split('/').pop(),fields:{version:{integerValue:'1'}}}):resp({},404);
  }
  if(u.pathname.endsWith('/finanzas_config/acceso')){assert.deepEqual(u.searchParams.getAll('mask.fieldPaths'),['encargadoUid']);return resp({name:root+'iglesias/a/finanzas_config/acceso',fields:{encargadoUid:{stringValue:'miembro'}}});}
  throw Error('Ruta no esperada');
 };return {requests,fetcher};
}
test('URLs limitadas a comprobante y designacion, proyecto fijo y campos minimos',()=>{
 for(const t of ['movimientos','recibos','auditoria','usuarios_globales'])assert.throws(()=>urlDocumento(t,'uid',time));
 for(const ref of ['../x','a/b','',' x'])assert.throws(()=>urlDocumento('comprobante',ref,time));
 assert.throws(()=>urlDocumento('comprobante','x',''));
 assert.equal(urlDocumento('encargo','a',time).searchParams.get('mask.fieldPaths'),'encargadoUid');
 assert.equal(urlDocumento('comprobante','x',time).searchParams.get('mask.fieldPaths'),'version');
});
test('Auth solo acepta seleccion UID concreta y proyeccion minima',()=>{
 for(const ids of [[],['a','a'],['a/b'],Array.from({length:101},(_,i)=>String(i))])assert.throws(()=>urlAuth(ids));
 assert.equal(urlAuth(['a']).pathname,'/v1/projects/fesync-app-2026/accounts:lookup');
 assert.equal(urlAuth(['a']).searchParams.get('fields'),'users(localId,disabled)');
});
test('Perfil coherente, Auth vigente y sin comprobante es migrable sin tocar encargo',()=>{
 const r=evaluar({candidatos:[c()],auth:new Map([['miembro',{disabled:false}]]),comprobantes:new Map([['miembro',false]]),encargos:[{iglesiaId:'a',uid:'miembro'}]});
 assert.equal(r[0].estado,'migrable');assert.equal(r[0].esEncargado,true);assert.equal(r[0].versionPerfil,time);
});
test('Auth ausente excluye; deshabilitado, comprobante o encargo ajeno requieren revision',()=>{
 const base={candidatos:[c()],auth:new Map([['miembro',{disabled:false}]]),comprobantes:new Map([['miembro',false]]),encargos:[]};
 assert.equal(evaluar({...base,auth:new Map()})[0].estado,'no_migrable');
 for(const extra of [{auth:new Map([['miembro',{disabled:true}]])},{comprobantes:new Map([['miembro',true]])},{encargos:[{iglesiaId:'b',uid:'miembro'}]},{encargos:[{iglesiaId:'a',invalido:true}]}])assert.equal(evaluar({...base,...extra})[0].estado,'revision');
});
test('Ensayo completo solo GET/lookup, agregados publicos y referencias privadas separadas',async()=>{
 const f=fixture(),r=await verificar({token:'FICTICIO',fetcher:f.fetcher});
 assert.deepEqual(r.publico.clasificacion,{migrables:2,revision:0,no_migrables:0});assert.equal(r.publico.ambiguos,1);assert.equal(r.publico.excluidos,1);
 assert.equal(r.privado.ambiguos[0].uid,'ambiguo');assert.equal(r.privado.candidatos.length,2);
 assert.equal(JSON.stringify(r.publico).includes('"uid"'),false);assert.equal(JSON.stringify(r.publico).includes('FICTICIO'),false);
 assert.equal(r.publico.comprobantes.ausentes,2);assert.equal(r.publico.encargos.candidatosDesignados,1);
 const times=f.requests.filter(r=>r.u.hostname==='firestore.googleapis.com'&&r.u.searchParams.get('pageSize')!=='1').map(r=>r.u.searchParams.get('readTime'));
 assert.ok(times.every(Boolean));assert.ok(times.slice(0,-1).every(t=>t===r.publico.readTime));
});
test('403 en lectura indispensable detiene sin ampliar permisos ni proseguir',async()=>{
 const f=fixture({denegar:true});await assert.rejects(verificar({token:'x',fetcher:f.fetcher}),/HTTP_403/);
 assert.ok(!f.requests.some(r=>r.u.pathname.includes('migraciones_pertenencia')));
});
test('Campos personales en respuesta Auth causan rechazo sin consultar mas datos',async()=>{
 const f=fixture({authExtra:true});await assert.rejects(verificar({token:'x',fetcher:f.fetcher}),/FUERA_DE_MASCARA/);
 assert.ok(!f.requests.some(r=>r.u.pathname.includes('finanzas_config')));
});
test('Comprobantes previos nunca se acreditan como migrables',async()=>{
 const r=await verificar({token:'x',fetcher:fixture({comprobante:true}).fetcher});assert.equal(r.publico.clasificacion.revision,2);assert.equal(r.publico.clasificacion.migrables,0);
});
test('Cambio de version durante lectura retira el candidato del lote',async()=>{
 const r=await verificar({token:'x',fetcher:fixture({cambio:true}).fetcher});assert.equal(r.publico.clasificacion.revision,1);assert.equal(r.publico.motivos.perfil_cambio_durante_verificacion,1);
});
