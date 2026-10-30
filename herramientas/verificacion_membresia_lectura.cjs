'use strict';
// Solo lecturas: mascaras fijas, GET de documentos/reglas y POST Auth accounts:lookup.
// No SDK Admin, motor ejecutor, transacciones ni ruta de escritura.
const {urlLectura,documento,clasificar}=require('./preflight_membresia_lectura.cjs');
const {clasificarPerfilPertenencia}=require('../functions/migraciones/pertenencia_plan');
const PROJECT='fesync-app-2026',ROOT=`projects/${PROJECT}/databases/(default)/documents/`;
const fail=c=>{throw Error(c);};
const id=s=>typeof s==='string'&&s.length>0&&s===s.trim()&&!/[\/\x00-\x1f\x7f]/.test(s)&&s!=='.'&&s!=='..'&&!/^__.*__$/.test(s);
function urlDocumento(tipo,ref,readTime){
 if(!id(ref)||(tipo==='comprobante'&&ref.length>128))fail('REFERENCIA_INVALIDA');
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(readTime||''))fail('SNAPSHOT_OBLIGATORIO');
 const route=tipo==='comprobante'?`migraciones_pertenencia/${encodeURIComponent(ref)}`:
  tipo==='encargo'?`iglesias/${encodeURIComponent(ref)}/finanzas_config/acceso`:fail('TIPO_PROHIBIDO');
 const u=new URL('https://firestore.googleapis.com/v1/'+ROOT+route);
 u.searchParams.append('mask.fieldPaths',tipo==='comprobante'?'version':'encargadoUid');u.searchParams.set('readTime',readTime);return u;
}
function urlAuth(uids){
 if(!Array.isArray(uids)||uids.length<1||uids.length>100||new Set(uids).size!==uids.length||uids.some(u=>!id(u)||u.length>128))fail('SELECCION_AUTH_INVALIDA');
 const u=new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`);
 u.searchParams.set('fields','users(localId,disabled)');return u;
}
function evaluar({candidatos,auth,comprobantes,encargos}){
 const registros=[];
 for(const c of candidatos){
  const motivos=[],a=auth.get(c.uid);let estado='migrable';
  if(!a){estado='no_migrable';motivos.push('identidad_auth_ausente');}
  else if(a.disabled){estado='revision';motivos.push('identidad_auth_deshabilitada');}
  if(comprobantes.get(c.uid)!==false){if(estado!=='no_migrable')estado='revision';motivos.push('comprobante_previo');}
  const asignaciones=encargos.filter(e=>e.uid===c.uid);
  if(asignaciones.some(e=>e.iglesiaId!==c.perfil.iglesiaId)||asignaciones.length>1){if(estado!=='no_migrable')estado='revision';motivos.push('encargo_fuera_de_pertenencia');}
  if(encargos.some(e=>e.iglesiaId===c.perfil.iglesiaId&&e.invalido)){if(estado!=='no_migrable')estado='revision';motivos.push('encargo_no_verificable');}
  registros.push({uid:c.uid,iglesiaId:c.perfil.iglesiaId,rolGlobal:c.perfil.rolGlobal,versionPerfil:c.version,
   estado,motivos,auth:a?'existente'+(a.disabled?'_deshabilitada':'_habilitada'):'ausente',
   comprobanteExiste:comprobantes.get(c.uid)!==false,esTitular:c.perfil.rolGlobal==='admin_iglesia',esEncargado:asignaciones.length>0});
 }
 return registros;
}
async function verificar({token,fetcher=fetch}={}){
 if(!token)fail('SESION_AUSENTE');
 const consultas=[];
 async function peticion(u,{tag,body,missing=false}={}){
  const method=body===undefined?'GET':'POST';
  if(method==='POST'&&(u.origin!=='https://identitytoolkit.googleapis.com'||u.pathname!==`/v1/projects/${PROJECT}/accounts:lookup`||
   Object.keys(body).join()!=='localId'))fail('OPERACION_PROHIBIDA');
  const r=await fetcher(u,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  consultas.push({operacion:tag,metodo:method,http:r.status});
  if(r.status===404&&missing)return {ausente:true};
  if(!r.ok)fail(`LECTURA_RECHAZADA_HTTP_${r.status}`);
  return {data:await r.json(),date:r.headers.get('date')};
 }
 async function listar(coleccion,readTime,probe=false){
  const encontrados=[],tokens=new Set(),uids=new Set();let next;
  for(let p=0;p<500;p++){
   const r=await peticion(urlLectura(coleccion,{readTime,pageToken:next,probe}),{tag:coleccion+(probe?'_sondeo':'_mascara')});
   if(!r.data||Object.keys(r.data).some(k=>!['documents','nextPageToken'].includes(k)))fail('RESPUESTA_INVALIDA');
   for(const d of r.data.documents||[]){
    const parsed=documento(d,coleccion);if(uids.has(parsed.uid))fail('DOCUMENTO_REPETIDO');uids.add(parsed.uid);
    encontrados.push({...parsed,version:d.updateTime,tipos:Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,Object.keys(v||{})[0]||'invalido']))});
   }
   if(probe)return {date:r.date};
   next=r.data.nextPageToken;if(!next)return encontrados;
   if(typeof next!=='string'||tokens.has(next))fail('PAGINACION_INVALIDA');tokens.add(next);
  }
  fail('COBERTURA_INCOMPLETA');
 }
 const probe=await listar('usuarios_globales',undefined,true),instante=Date.parse(probe.date);
 if(!Number.isFinite(instante)||Math.abs(instante-Date.now())>300000)fail('RELOJ_NO_VERIFICABLE');
 const readTime=new Date(Math.floor(instante/1000)*1000-1000).toISOString();
 const perfiles=await listar('usuarios_globales',readTime),iglesias=await listar('iglesias',readTime),porIglesia=new Map(iglesias.map(i=>[i.uid,i.perfil]));
 const inventario=clasificar(perfiles,iglesias),candidatos=[],ambiguos=[],excluidos=[];
 // La verificacion actual amplia las comprobaciones de membresia del inventario previo.
 delete inventario.verificacionesExcluidas;
 for(const p of perfiles){
  const i=porIglesia.get(p.perfil.iglesiaId);
  const c=clasificarPerfilPertenencia({uid:p.uid,perfil:p.perfil,iglesia:{id:p.perfil.iglesiaId,existe:!!i,adminUid:i?.adminUid}});
  const titularidades=iglesias.filter(i=>i.perfil.adminUid===p.uid);
  if(titularidades.length>1||(titularidades.length===1&&titularidades[0].uid!==p.perfil.iglesiaId)||(!Object.hasOwn(p.perfil,'iglesiaId')&&Object.hasOwn(p.perfil,'rolGlobal'))){
   ambiguos.push({uid:p.uid,ruta:`usuarios_globales/${p.uid}`,version:p.version,motivo:'relacion_incoherente',rolGlobal:p.perfil.rolGlobal||null});
  }else if(c.categoria==='candidato')candidatos.push(p);
  else if(c.categoria==='revision')ambiguos.push({uid:p.uid,ruta:`usuarios_globales/${p.uid}`,version:p.version,motivo:c.motivo,
   iglesiaReferenciada:typeof p.perfil.iglesiaId==='string'?p.perfil.iglesiaId:null,tipoIglesiaId:p.tipos.iglesiaId||'ausente',rolGlobal:p.perfil.rolGlobal||null,iglesiaExiste:!!i,
   accion:'Revision humana; no inferir ni asignar iglesia, rol, fecha o ID.'});
  else excluidos.push(p);
 }
 // No extrapolar el inventario previo ante un cambio de alcance.
 if(candidatos.length!==inventario.categorias.candidatosSegunMembresia||ambiguos.length!==inventario.categorias.ambiguos)fail('CLASIFICACION_NO_COINCIDE');
 const auth=new Map();
 for(let j=0;j<candidatos.length;j+=100){
  const uids=candidatos.slice(j,j+100).map(p=>p.uid),d=(await peticion(urlAuth(uids),{tag:'auth_lookup_uid_disabled',body:{localId:uids}})).data;
  if(Object.keys(d).some(k=>k!=='users'))fail('AUTH_RESPUESTA_FUERA_DE_MASCARA');
  for(const a of d.users||[]){
   if(Object.keys(a).some(k=>!['localId','disabled'].includes(k))||!uids.includes(a.localId)||auth.has(a.localId)||
    (a.disabled!==undefined&&typeof a.disabled!=='boolean'))fail('AUTH_RESPUESTA_FUERA_DE_MASCARA');
   auth.set(a.localId,{disabled:a.disabled===true});
  }
 }
 const comprobantes=new Map();
 for(const p of candidatos){
  const r=await peticion(urlDocumento('comprobante',p.uid,readTime),{tag:'comprobante_migracion_existencia_version',missing:true});
  if(!r.ausente&&(r.data.name!==ROOT+'migraciones_pertenencia/'+p.uid||Object.keys(r.data.fields||{}).some(k=>k!=='version')))fail('COMPROBANTE_FUERA_DE_MASCARA');
  comprobantes.set(p.uid,!r.ausente);
 }
 const encargos=[];
 for(const iglesiaId of [...new Set(candidatos.map(p=>p.perfil.iglesiaId))]){
  const r=await peticion(urlDocumento('encargo',iglesiaId,readTime),{tag:'encargo_solo_uid',missing:true});
  if(r.ausente){encargos.push({iglesiaId,ausente:true});continue;}
  if(r.data.name!==ROOT+`iglesias/${iglesiaId}/finanzas_config/acceso`||Object.keys(r.data.fields||{}).some(k=>k!=='encargadoUid'))fail('ENCARGO_FUERA_DE_MASCARA');
  const f=r.data.fields?.encargadoUid;
  if(f===undefined||Object.hasOwn(f,'nullValue'))encargos.push({iglesiaId,sinDesignacion:true});
  else if(Object.keys(f).length===1&&id(f.stringValue)&&f.stringValue.length<=128)encargos.push({iglesiaId,uid:f.stringValue});
  else encargos.push({iglesiaId,invalido:true});
 }
 const releaseUrl=new URL(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);
 const release=(await peticion(releaseUrl,{tag:'reglas_release_firestore'})).data;
 if(!new RegExp(`^projects/(${PROJECT}|336914296469)/rulesets/[a-zA-Z0-9-]+$`).test(release.rulesetName||''))fail('RULESET_FUERA_DE_PROYECTO');
 const rules=(await peticion(new URL('https://firebaserules.googleapis.com/v1/'+release.rulesetName),{tag:'reglas_fuente'})).data;
 const releaseFinal=(await peticion(releaseUrl,{tag:'reglas_release_reverificacion'})).data;
 if(releaseFinal.rulesetName!==release.rulesetName)fail('REGLAS_CAMBIARON_DURANTE_LECTURA');
 // Auth no ofrece readTime: relectura versionada de candidatos antes de cerrar.
 const finales=await listar('usuarios_globales',new Date(Math.floor(Date.now()/1000)*1000-1000).toISOString());
 const porUidFinal=new Map(finales.map(p=>[p.uid,p]));
 const registros=evaluar({candidatos,auth,comprobantes,encargos});
 for(const c of registros){if(porUidFinal.get(c.uid)?.version!==c.versionPerfil){c.estado='revision';c.motivos.push('perfil_cambio_durante_verificacion');}}
 const counts={migrables:0,revision:0,no_migrables:0};for(const c of registros)counts[c.estado==='migrable'?'migrables':c.estado==='revision'?'revision':'no_migrables']++;
 const motivos={};for(const c of registros)for(const m of c.motivos)motivos[m]=(motivos[m]||0)+1;
 const conflictosEncargo=encargos.filter(e=>e.invalido||(e.uid&&(!perfiles.some(p=>p.uid===e.uid&&p.perfil.iglesiaId===e.iglesiaId)))).length;
 return {publico:{proyecto:PROJECT,readTime,soloLectura:true,inventario,candidatosVerificados:candidatos.length,clasificacion:counts,motivos,
  auth:{existentes:auth.size,ausentes:candidatos.length-auth.size,deshabilitadas:[...auth.values()].filter(a=>a.disabled).length},
  comprobantes:{ausentes:[...comprobantes.values()].filter(v=>!v).length,existentes:[...comprobantes.values()].filter(Boolean).length},
  encargos:{iglesiasVerificadas:encargos.length,documentosAusentes:encargos.filter(e=>e.ausente).length,designaciones:encargos.filter(e=>e.uid).length,
   conflictos:conflictosEncargo,candidatosDesignados:registros.filter(r=>r.esEncargado).length},
  ambiguos:ambiguos.length,excluidos:excluidos.length,consultas,
  reglas:{ruleset:release.rulesetName,actualizacion:release.updateTime||null,estableDuranteLectura:true}},
  privado:{proyecto:PROJECT,readTime,candidatos:registros,ambiguos,primerLoteSugerido:registros.filter(r=>r.estado==='migrable'&&!r.esTitular&&!r.esEncargado).slice(0,1).map(r=>r.uid)},
  reglas:rules.source?.files||[]};
}
async function main(){
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
 const out=path.resolve(__dirname,'../docs/membresia_verificacion_2026-10-28'),privado=path.resolve(__dirname,'../migrate_working_dir/membresia_revision_2026-10-28');
 const resultado={proyecto:PROJECT,soloLectura:true,inicio:new Date().toISOString(),completo:false};let token;
 try{
  if(process.argv.length!==2)fail('SIN_ARGUMENTOS_NI_MODO_ESCRITURA');
  if(['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT'].some(k=>process.env[k]&&process.env[k]!==PROJECT)||
   ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN'].some(k=>process.env[k]))fail('ENTORNO_NO_APROBADO');
  const ps=`$a=Get-Acl -LiteralPath '${privado.replaceAll("'","''")}'; $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if(-not $a.AreAccessRulesProtected -or @($a.Access).Count -ne 1 -or $a.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $s -or $a.Access[0].AccessControlType -ne 'Allow'){exit 1}; 'ACL_OK'`;
  if(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',windowsHide:true}).trim()!=='ACL_OK')fail('ACL_PRIVADA_NO_VERIFICABLE');
  if(fs.existsSync(path.join(privado,'revision.json')))fail('REPORTE_PRIVADO_EXISTENTE');
  const s=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/configstore/firebase-tools.json'),'utf8')).tokens;
  if(!s)fail('SESION_AUSENTE');token=s.access_token;
  if(!token||!(s.expires_at>Date.now()+60000)){
   const api=fs.readFileSync(path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/api.js'),'utf8'),client_id=api.match(/FIREBASE_CLIENT_ID", "([^"]+)"/)?.[1],client_secret=api.match(/FIREBASE_CLIENT_SECRET", "([^"]+)"/)?.[1];
   if(!s.refresh_token||!client_id||!client_secret)fail('OAUTH_NO_VERIFICABLE');
   const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(30000),body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refresh_token,client_id,client_secret})});
   resultado.oauth={http:r.status,persistido:false};if(!r.ok)fail('OAUTH_RECHAZADO');token=(await r.json()).access_token;
  }
  const r=await verificar({token});Object.assign(resultado,r.publico);
  for(const [i,f] of r.reglas.entries()){
   if(typeof f.content!=='string')fail('RULESET_SIN_FUENTE');fs.writeFileSync(path.join(out,`remotas-${i}.rules`),f.content);
  }
  const fuente=r.reglas.map(f=>f.content).join('\n');
  resultado.reglas.sha256=crypto.createHash('sha256').update(fuente).digest('hex');
  resultado.reglas.igualesSnapshotAnterior=r.reglas.length===1&&r.reglas[0].content===fs.readFileSync(path.resolve(__dirname,'../docs/firebase_preflight_2026-10-28/remoto-0-0.rules'),'utf8');
  fs.writeFileSync(path.join(privado,'revision.json'),JSON.stringify(r.privado,null,2),{flag:'wx',mode:0o600});
  resultado.reportePrivado='migrate_working_dir/membresia_revision_2026-10-28/revision.json';resultado.completo=true;
 }catch(e){resultado.bloqueo=/^[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'VERIFICACION_NO_COMPLETADA';process.exitCode=1;}
 finally{token=undefined;resultado.fin=new Date().toISOString();fs.writeFileSync(path.join(out,'resultado.json'),JSON.stringify(resultado,null,2));console.log(JSON.stringify(resultado));}
}
module.exports={urlDocumento,urlAuth,evaluar,verificar};
if(require.main===module)main();
