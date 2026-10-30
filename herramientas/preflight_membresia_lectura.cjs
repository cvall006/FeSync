'use strict';
// Inventario de datos minimo. No importa SDK Admin, ejecutor ni coordinador de migracion.
// La unica operacion Firestore disponible aqui es documents.list por GET con mascara fija.
const {clasificarPerfilPertenencia}=require('../functions/migraciones/pertenencia_plan');
const PROJECT='fesync-app-2026';
const ROOT=`projects/${PROJECT}/databases/(default)/documents/`;
const MASKS=Object.freeze({usuarios_globales:Object.freeze(['iglesiaId','rolGlobal','pertenenciaId']),iglesias:Object.freeze(['adminUid'])});
const fail=code=>{throw Error(code);};
function urlLectura(collection,{readTime,pageToken,probe=false}={}){
 if(!Object.hasOwn(MASKS,collection))fail('COLECCION_PROHIBIDA');
 if(probe){if(collection!=='usuarios_globales'||readTime||pageToken)fail('SONDEO_INVALIDO');}
 else if(typeof readTime!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(readTime))fail('SNAPSHOT_OBLIGATORIO');
 if(pageToken!==undefined&&(typeof pageToken!=='string'||pageToken.length>16384))fail('PAGINACION_INVALIDA');
 const u=new URL('https://firestore.googleapis.com/v1/'+ROOT+collection);
 u.searchParams.set('pageSize',probe?'1':'100');
 for(const f of MASKS[collection])u.searchParams.append('mask.fieldPaths',f);
 if(readTime)u.searchParams.set('readTime',readTime);
 if(pageToken)u.searchParams.set('pageToken',pageToken);
 return u;
}
function documento(d,collection){
 if(!d||typeof d.name!=='string'||!d.name.startsWith(ROOT+collection+'/'))fail('RESPUESTA_FUERA_DE_ALCANCE');
 const uid=d.name.slice((ROOT+collection+'/').length);
 if(!uid||uid.includes('/'))fail('RESPUESTA_FUERA_DE_ALCANCE');
 if(typeof d.updateTime!=='string')fail('VERSION_AUSENTE');
 const perfil={};
 for(const [k,v] of Object.entries(d.fields||{})){
  if(!MASKS[collection].includes(k))fail('RESPUESTA_SIN_MASCARA');
  // Solo necesitamos distinguir strings de valores anomalos; no expandir mapas/arrays.
  perfil[k]=v&&Object.keys(v).length===1&&typeof v.stringValue==='string'?v.stringValue:null;
 }
 return {uid,perfil};
}
function clasificar(perfiles,iglesias){
 const porPerfil=new Map(perfiles.map(p=>[p.uid,p.perfil]));
 const porIglesia=new Map(iglesias.map(p=>[p.uid,p.perfil]));
 const claims=new Map();
 for(const c of iglesias){if(typeof c.perfil.adminUid==='string'){
  const u=c.perfil.adminUid;claims.set(u,[...(claims.get(u)||[]),c.uid]);
 }}
 const r={totalPerfiles:perfiles.length,totalIglesias:iglesias.length,
  categorias:{candidatosSegunMembresia:0,ambiguos:0,compatiblesPorFormatoSinAcreditarOrigen:0,sinPertenenciaActiva:0},motivos:{},
  conflictos:{perfilesTitularesDeVariasIglesias:0,iglesiasSinPerfilTitular:0,iglesiasConTitularNoVerificable:0,iglesiasConTitularIncoherente:0},
  verificacionesExcluidas:['encargados_en_configuracion_financiera','comprobantes_y_recibos','procedencia_de_ids_preexistentes','relaciones_fuera_de_campos_autorizados']};
 const count=(categoria,motivo)=>{r.categorias[categoria]++;r.motivos[motivo]=(r.motivos[motivo]||0)+1;};
 for(const p of perfiles){
  const vinculadas=claims.get(p.uid)||[];
  if(vinculadas.length>1){r.conflictos.perfilesTitularesDeVariasIglesias++;count('ambiguos','titular_en_varias_iglesias');continue;}
  if(vinculadas.length===1&&p.perfil.iglesiaId!==vinculadas[0]){count('ambiguos','titularidad_fuera_de_pertenencia');continue;}
  if(!Object.hasOwn(p.perfil,'iglesiaId')&&Object.hasOwn(p.perfil,'rolGlobal')){count('ambiguos','rol_sin_iglesia');continue;}
  const iglesia=porIglesia.get(p.perfil.iglesiaId);
  const c=clasificarPerfilPertenencia({uid:p.uid,perfil:p.perfil,iglesia:{id:p.perfil.iglesiaId,existe:!!iglesia,adminUid:iglesia?.adminUid}});
  if(c.categoria==='candidato')count('candidatosSegunMembresia',c.motivo);
  else if(c.motivo==='sin_pertenencia')count('sinPertenenciaActiva',c.motivo);
  else if(c.motivo==='identificador_existente_procedencia_no_acreditada')count('compatiblesPorFormatoSinAcreditarOrigen',c.motivo);
  else count('ambiguos',c.motivo);
 }
 for(const c of iglesias){
  const u=c.perfil.adminUid;
  if(typeof u!=='string'||!u.trim()||u.includes('/')){r.conflictos.iglesiasConTitularNoVerificable++;continue;}
  const p=porPerfil.get(u);
  if(!p){r.conflictos.iglesiasSinPerfilTitular++;continue;}
  if(p.iglesiaId!==c.uid||p.rolGlobal!=='admin_iglesia')r.conflictos.iglesiasConTitularIncoherente++;
 }
 return r;
}
async function inventariar({token,fetcher=fetch}={}){
 if(typeof token!=='string'||!token)fail('SESION_AUSENTE');
 const consultas=[];
 async function leer(collection,options){
  const url=urlLectura(collection,options);
  const response=await fetcher(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  consultas.push({metodo:'GET',coleccion:collection,campos:MASKS[collection],http:response.status,sondeo:options.probe===true});
  if(!response.ok)fail(`LECTURA_RECHAZADA_HTTP_${response.status}`);
  const data=await response.json();
  if(!data||Object.keys(data).some(k=>!['documents','nextPageToken'].includes(k))||
    (data.documents!==undefined&&!Array.isArray(data.documents)))fail('RESPUESTA_INVALIDA');
  const docs=(data.documents||[]).map(d=>documento(d,collection));
  return {docs,next:data.nextPageToken,date:response.headers.get('date')};
 }
 const probe=await leer('usuarios_globales',{probe:true});
 const instante=Date.parse(probe.date);
 if(!Number.isFinite(instante)||Math.abs(instante-Date.now())>300000)fail('RELOJ_NO_VERIFICABLE');
 const readTime=new Date(Math.floor(instante/1000)*1000-1000).toISOString();
 async function listar(collection){
  const docs=[],tokens=new Set(),ids=new Set();let next;
  for(let page=0;page<500;page++){
   const r=await leer(collection,{readTime,pageToken:next});
   for(const d of r.docs){if(ids.has(d.uid))fail('DOCUMENTO_REPETIDO');ids.add(d.uid);docs.push(d);}
   if(!r.next)return docs;
   if(typeof r.next!=='string'||!r.next||tokens.has(r.next))fail('PAGINACION_CICLICA');
   tokens.add(r.next);next=r.next;
  }
  fail('COBERTURA_INCOMPLETA');
 }
 const perfiles=await listar('usuarios_globales'),iglesias=await listar('iglesias');
 return {proyecto:PROJECT,soloLectura:true,readTime,coberturaCamposPermitidosCompleta:true,
  ...clasificar(perfiles,iglesias),consultas,aptitudMigracion:'NO_ACREDITADA_SIN_COMPROBANTES_Y_REVISION_OPERATIVA'};
}
async function main(){
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const out=path.resolve(__dirname,'../docs/membresia_preflight_2026-10-28/resultado.json');
 const resultado={proyecto:PROJECT,inicio:new Date().toISOString(),soloLectura:true,completo:false};
 let token;
 try{
  if(process.argv.length!==2)fail('SIN_ARGUMENTOS_NI_MODO_ESCRITURA');
  if(['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT'].some(k=>process.env[k]&&process.env[k]!==PROJECT)||
   ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','GOOGLE_OAUTH_ACCESS_TOKEN'].some(k=>process.env[k]))fail('ENTORNO_NO_APROBADO');
  // Leer el JSON existente directamente. Configstore podria repararlo/escribirlo si estuviera corrupto.
  const sesion=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/configstore/firebase-tools.json'),'utf8')).tokens;
  if(!sesion)fail('SESION_AUSENTE');
  token=sesion.access_token;
  if(!token||!(sesion.expires_at>Date.now()+60000)){
   if(!sesion.refresh_token)fail('SESION_NO_RENOVABLE');
   const api=fs.readFileSync(path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/api.js'),'utf8');
   const clientId=api.match(/FIREBASE_CLIENT_ID", "([^"]+)"/)?.[1],clientSecret=api.match(/FIREBASE_CLIENT_SECRET", "([^"]+)"/)?.[1];
   if(!clientId||!clientSecret)fail('CLIENTE_OAUTH_NO_VERIFICABLE');
   // Solo autenticacion, en memoria. No genera cuentas/claves ni modifica sesion o recursos Firebase.
   const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:sesion.refresh_token,client_id:clientId,client_secret:clientSecret})});
   resultado.autenticacion={metodo:'POST',destino:'OAuth token',http:r.status,persistida:false};
   if(!r.ok)fail('AUTENTICACION_RECHAZADA');
   const d=await r.json();if(!d.access_token)fail('AUTENTICACION_INVALIDA');token=d.access_token;
  }
  Object.assign(resultado,await inventariar({token}),{completo:true});
 }catch(e){
  const codigo=e.message;
  resultado.bloqueo=/^[A-Z_]+(?:_\d{3})?$/.test(codigo)?codigo:'LECTURA_NO_COMPLETADA';process.exitCode=1;
 }finally{
  token=undefined;resultado.fin=new Date().toISOString();
  fs.writeFileSync(out,JSON.stringify(resultado,null,2));
  console.log(JSON.stringify(resultado));
 }
}
module.exports={urlLectura,documento,clasificar,inventariar};
if(require.main===module)main();
