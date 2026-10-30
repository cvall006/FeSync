'use strict';
// Evidencia operativa: no Firestore, Auth de usuarios, SDK Admin ni ejecutor.
// GET Rules y POST testIamPermissions (consulta de permisos, nunca setIamPolicy).
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const P='fesync-app-2026',out=__dirname,audit=[];
const result={proyecto:P,inicio:new Date().toISOString(),identidad:'sesion_CLI_no_ADC',completo:false,consultas:audit};
let token;
const fail=s=>{throw Error(s);};
async function request(host,route,body){
 const getRules=host==='firebaserules.googleapis.com'&&new RegExp(`^/v1/projects/(${P}|336914296469)/(releases/cloud\\.firestore|rulesets/[a-zA-Z0-9-]+)$`).test(route)&&body===undefined;
 const testIAM=host==='cloudresourcemanager.googleapis.com'&&route===`/v1/projects/${P}:testIamPermissions`&&body&&Object.keys(body).join()==='permissions';
 if(!getRules&&!testIAM)fail('RUTA_O_METODO_PROHIBIDOS');
 const r=await fetch(`https://${host}${route}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 audit.push({host,operacion:testIAM?'testIamPermissions_solo_consulta':route.includes('/rulesets/')?'ruleset_get':'release_get',metodo:body?'POST':'GET',http:r.status});
 if(!r.ok)fail(`LECTURA_RECHAZADA_HTTP_${r.status}`);return r.json();
}
async function main(){
 if(process.argv.length!==2)fail('SIN_ARGUMENTOS');
 const s=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/configstore/firebase-tools.json'),'utf8')).tokens;
 if(!s)fail('SESION_CLI_AUSENTE');token=s.access_token;
 if(!token||!(s.expires_at>Date.now()+60000)){
  const cli=fs.readFileSync(path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/api.js'),'utf8');
  const client_id=cli.match(/FIREBASE_CLIENT_ID", "([^"]+)"/)?.[1],client_secret=cli.match(/FIREBASE_CLIENT_SECRET", "([^"]+)"/)?.[1];
  if(!s.refresh_token||!client_id||!client_secret)fail('OAUTH_NO_DISPONIBLE');
  const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:s.refresh_token,client_id,client_secret})});
  result.oauth={http:r.status,soloMemoria:true};if(!r.ok)fail('OAUTH_RECHAZADO');token=(await r.json()).access_token;
 }
 const lectura=['datastore.entities.get','datastore.entities.list','datastore.databases.get','firebaseauth.users.get','firebaserules.releases.get','firebaserules.rulesets.get'];
 const escritura=['datastore.entities.create','datastore.entities.update','datastore.entities.delete'];
 const permisos=await request('cloudresourcemanager.googleapis.com',`/v1/projects/${P}:testIamPermissions`,{permissions:[...lectura,...escritura]});
 const granted=permisos.permissions||[];
 result.permisosCLI={lecturaSolicitada:lectura,lecturaConcedida:lectura.filter(p=>granted.includes(p)),lecturaFaltante:lectura.filter(p=>!granted.includes(p)),
  escrituraSoloConsultada:escritura,escrituraDisponible:escritura.filter(p=>granted.includes(p)),identidadSoloLecturaAcreditada:false,noEquivalePermisosADC:true};
 const route=`/v1/projects/${P}/releases/cloud.firestore`,release=await request('firebaserules.googleapis.com',route);
 if(!new RegExp(`^projects/(${P}|336914296469)/rulesets/[a-zA-Z0-9-]+$`).test(release.rulesetName||''))fail('RULESET_FUERA_DE_PROYECTO');
 const rules=await request('firebaserules.googleapis.com','/v1/'+release.rulesetName);
 const last=await request('firebaserules.googleapis.com',route);
 if(last.rulesetName!==release.rulesetName||rules.source?.files?.length!==1)fail('REGLAS_NO_ESTABLES');
 const fuente=rules.source.files[0].content;if(typeof fuente!=='string')fail('FUENTE_AUSENTE');
 fs.writeFileSync(path.join(out,'firestore-remotas.rules'),fuente);
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const piloto=fs.readFileSync(path.resolve(out,'../membresia_piloto_2026-10-28/firestore.piloto.rules'),'utf8');
 const local=fs.readFileSync(path.resolve(out,'../../firestore.rules'),'utf8');
 const anterior=fs.readFileSync(path.resolve(out,'../membresia_verificacion_2026-10-28/remotas-0.rules'),'utf8');
 result.reglas={ruleset:release.rulesetName,actualizacion:release.updateTime,sha256:hash(fuente),sha256Piloto:hash(piloto),
  coincidenParchePiloto:fuente===piloto,coincidenLocales:fuente===local,coincidenSnapshotVulnerableAnterior:fuente===anterior,
  estado:fuente===piloto||fuente===local?'PROTECCION_CONOCIDA':fuente===anterior?'BLOQUEANTES_PERTENENCIA_MUTABLE':'REQUIEREN_REVISION'};
 result.dryRun={ejecutado:false,motivos:['ADC_NO_DISPONIBLE','IDENTIDAD_ADC_SOLO_LECTURA_NO_ACREDITADA',...(result.reglas.estado==='BLOQUEANTES_PERTENENCIA_MUTABLE'?['REGLAS_NO_PROTEGIDAS']:[])],documentosConsultados:0};
 result.completo=true;
}
main().catch(e=>{result.bloqueo=/^[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'PREFLIGHT_DETENIDO';process.exitCode=1;})
 .finally(()=>{token=undefined;result.fin=new Date().toISOString();fs.writeFileSync(path.join(out,'resultado.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));});
