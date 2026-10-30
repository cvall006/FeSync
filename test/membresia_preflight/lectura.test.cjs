'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {urlLectura,documento,clasificar,inventariar}=require('../../herramientas/preflight_membresia_lectura.cjs');
const time=new Date(Math.floor(Date.now()/1000)*1000-1000).toISOString();
const root='projects/fesync-app-2026/databases/(default)/documents/';
const doc=(coleccion,id,campos)=>({name:root+coleccion+'/'+id,fields:Object.fromEntries(Object.entries(campos).map(([k,v])=>[k,{stringValue:v}])),updateTime:time});
const resp=(documents=[],nextPageToken)=>({ok:true,status:200,headers:new Headers({date:new Date().toUTCString()}),json:async()=>({documents,...(nextPageToken?{nextPageToken}:{})})});
test('Solo admite colecciones fijas y snapshot; nunca recibos, finanzas, otros proyectos o rutas',()=>{
 for(const c of ['finanzas_movimientos','migraciones_pertenencia','iglesias/a/finanzas_config','../usuarios_globales','proyecto/usuarios_globales',''])assert.throws(()=>urlLectura(c,{readTime:time}));
 assert.throws(()=>urlLectura('usuarios_globales'));
 assert.throws(()=>urlLectura('iglesias',{probe:true}));
 const u=urlLectura('usuarios_globales',{readTime:time});
 assert.equal(u.origin,'https://firestore.googleapis.com');assert.equal(u.pathname,'/v1/'+root+'usuarios_globales');
 assert.deepEqual(u.searchParams.getAll('mask.fieldPaths'),['iglesiaId','rolGlobal','pertenenciaId']);
});
test('Respuesta con campos adicionales o ruta ajena bloquea antes de clasificar',()=>{
 assert.throws(()=>documento(doc('usuarios_globales','a',{nombre:'NO LEER'}),'usuarios_globales'),/SIN_MASCARA/);
 assert.throws(()=>documento({...doc('usuarios_globales','a',{}),name:'projects/otro/databases/(default)/documents/usuarios_globales/a'},'usuarios_globales'),/FUERA_DE_ALCANCE/);
});
test('Clasifica sin inventar ID ni elegir entre titularidades; agrega sin UID',()=>{
 const perfiles=[{uid:'t',perfil:{iglesiaId:'a',rolGlobal:'admin_iglesia'}},{uid:'s',perfil:{iglesiaId:'a',rolGlobal:'servidor'}},
  {uid:'c',perfil:{iglesiaId:'a',rolGlobal:'servidor',pertenenciaId:'a'.repeat(64)}},{uid:'n',perfil:{iglesiaId:'a',rolGlobal:'servidor',pertenenciaId:null}},
  {uid:'libre',perfil:{}}];
 const r=clasificar(perfiles,[{uid:'a',perfil:{adminUid:'t'}}]);
 assert.deepEqual(r.categorias,{candidatosSegunMembresia:2,ambiguos:1,compatiblesPorFormatoSinAcreditarOrigen:1,sinPertenenciaActiva:1});
 assert.equal(JSON.stringify(r).includes('"uid"'),false);
 const multiples=clasificar(perfiles,[{uid:'a',perfil:{adminUid:'t'}},{uid:'b',perfil:{adminUid:'t'}}]);
 assert.equal(multiples.conflictos.perfilesTitularesDeVariasIglesias,1);assert.equal(multiples.categorias.ambiguos,2);
 assert.equal(multiples.conflictos.iglesiasConTitularIncoherente,1);
});
test('Valores invalidos, rol huerfano y titular sin perfil quedan agregados como anomalias',()=>{
 const p=[{uid:'a',perfil:{rolGlobal:'admin_iglesia'}},{uid:'b',perfil:{iglesiaId:null,rolGlobal:'servidor'}},{uid:'c',perfil:{iglesiaId:'x',rolGlobal:'admin_iglesia'}}];
 const r=clasificar(p,[{uid:'x',perfil:{adminUid:'ausente'}},{uid:'y',perfil:{adminUid:null}}]);
 assert.equal(r.categorias.ambiguos,3);assert.equal(r.conflictos.iglesiasSinPerfilTitular,1);assert.equal(r.conflictos.iglesiasConTitularNoVerificable,1);
});
test('Paginacion solo GET sin cuerpo/redireccion, misma mascara y mismo readTime; no devuelve datos',async()=>{
 const requests=[];
 const r=await inventariar({token:'TOKEN FICTICIO',fetcher:async(u,o)=>{
  assert.equal(o.method,'GET');assert.equal(o.body,undefined);assert.equal(o.redirect,'error');requests.push(new URL(u));
  if(requests.length===1)return resp();
  if(requests.length===2)return resp([doc('usuarios_globales','s',{iglesiaId:'x',rolGlobal:'servidor'})],'pagina-siguiente');
  if(requests.length===3)return resp([doc('usuarios_globales','t',{iglesiaId:'x',rolGlobal:'admin_iglesia'})]);
  return resp([doc('iglesias','x',{adminUid:'t'})]);
 }});
 assert.equal(r.totalPerfiles,2);assert.equal(r.categorias.candidatosSegunMembresia,2);
 assert.ok(requests.slice(1).every(u=>u.searchParams.get('readTime')===r.readTime));
 assert.equal(requests[2].searchParams.get('pageToken'),'pagina-siguiente');
 assert.equal(JSON.stringify(r).includes('pagina-siguiente'),false);assert.equal(JSON.stringify(r).includes('TOKEN FICTICIO'),false);
});
test('403 detiene al primer intento sin fallback ni consultas mas amplias',async()=>{
 let n=0;await assert.rejects(inventariar({token:'x',fetcher:async()=>{n++;return {ok:false,status:403};}}),/HTTP_403/);assert.equal(n,1);
});
test('Paginacion ciclica o IDs repetidos no produce totales completos',async()=>{
 let n=0;await assert.rejects(inventariar({token:'x',fetcher:async()=>{n++;return n===1?resp():resp([doc('usuarios_globales','s',{})],'repetido');}}),/REPETIDO|CICLICA/);
});
test('Sin reloj del servidor o sesion no se intenta inventario',async()=>{
 await assert.rejects(inventariar({}),/SESION_AUSENTE/);
 await assert.rejects(inventariar({token:'x',fetcher:async()=>({...resp(),headers:new Headers()})}),/RELOJ_NO_VERIFICABLE/);
});
