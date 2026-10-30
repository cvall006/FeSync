'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const helper=require('../finanzas_web_despliegue_apagado_2026-10-29/ejecucion-iam-acotado/remoto.cjs');
const {P,cli,conectar,observar}=helper,out=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const result={proyecto:P,audit:[],escriturasRemotas:0};let token;
function save(){fs.writeFileSync(path.join(out,'preflight.json'),JSON.stringify(result,null,2)+'\n');}
async function get(host,route,binary=false){assert.ok(['firebaserules.googleapis.com','storage.googleapis.com'].includes(host));
const r=await fetch('https://'+host+route,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});result.audit.push({host,route,http:r.status});save();if(!r.ok)throw Error('GET_HTTP_'+r.status+' '+host);return binary?Buffer.from(await r.arrayBuffer()):r.json();}
async function main(){
const c=require(cli+'configstore').configstore.get('tokens');assert.ok(c);token=c.access_token;if(!token||c.expires_at<Date.now()+60000){const a=require(cli+'api');const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:a.clientId(),client_secret:a.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);token=(await r.json()).access_token;}
const release=await get('firebaserules.googleapis.com','/v1/projects/'+P+'/releases/cloud.firestore');assert.ok(new RegExp('^projects/'+P+'/rulesets/[A-Za-z0-9-]+$').test(release.rulesetName));
const rules=await get('firebaserules.googleapis.com','/v1/'+release.rulesetName);assert.equal(rules.source.files.length,1);const bytes=Buffer.from(rules.source.files[0].content);
result.release=release;result.snapshotSha256=sha(bytes);assert.equal(result.snapshotSha256,'8398b1200abe8f2b5c1f879bcf866566b7f1d0c68e55c6b37893117ae6d324f0','Reglas remotas distintas');
fs.writeFileSync(path.join(out,'respaldo-remoto.rules'),bytes,{flag:'wx'});fs.writeFileSync(path.join(out,'respaldo-remoto.json'),JSON.stringify({release,rules},null,2)+'\n',{flag:'wx'});
const candidate=fs.readFileSync(path.resolve(out,'../finanzas_web_despliegue_apagado_2026-10-29/paquete/firestore.rules'));result.candidatoSha256=sha(candidate);assert.equal(result.candidatoSha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');assert.ok(candidate.equals(fs.readFileSync(path.resolve(out,'../../firestore.rules'))));
const patch=fs.readFileSync(path.resolve(out,'../finanzas_web_despliegue_apagado_2026-10-29/reglas-exactas.patch'));result.parcheSha256=sha(patch);assert.equal(result.parcheSha256,'0f4e704ad6d58f8c88a29e89705d433dd65d4aa9477bcadc5f98f7fa5872c6ec');
fs.writeFileSync(path.join(out,'candidato.rules'),candidate,{flag:'wx'});fs.writeFileSync(path.join(out,'parche-exacto.patch'),patch,{flag:'wx'});
for(const [name,file]of [['firebase.candidato.json','candidato.rules'],['firebase.reversion.json','respaldo-remoto.rules']])fs.writeFileSync(path.join(out,name),JSON.stringify({firestore:{rules:file}},null,2)+'\n',{flag:'wx'});
const r=await conectar(),functions=await r.listar();assert.equal(functions.length,23);result.functions=functions.map(observar);result.finanzasServidorApagado=functions.filter(f=>['finanzasV1Consultar','finanzasV1Ejecutar'].includes(f.name.split('/').pop())).every(f=>f.serviceConfig.environmentVariables.FINANZAS_V1_SERVIDOR_HABILITADO==='false');assert.ok(result.finanzasServidorApagado);
result.fuentesAntiguas=[];
for(const name of ['registrarNuevaIglesiaSegura','vincularUsuarioConCodigo']){const f=functions.find(f=>f.name.endsWith('/'+name));assert.ok(f);const source=f.buildConfig.sourceProvenance?.resolvedStorageSource??f.buildConfig.source.storageSource;assert.equal(source.bucket,'gcf-v2-sources-336914296469-southamerica-west1');assert.ok(source.object===name+'/function-source.zip');
const route='/storage/v1/b/'+source.bucket+'/o/'+encodeURIComponent(source.object)+'?alt=media&generation='+encodeURIComponent(source.generation);
const zip=await get('storage.googleapis.com',route,true);fs.writeFileSync(path.join(out,name+'.zip'),zip,{flag:'wx'});result.fuentesAntiguas.push({nombre:name,revision:f.serviceConfig.revision,source,sha256:sha(zip)});save();}
result.completo=true;save();console.log(JSON.stringify({ruleset:release.rulesetName,snapshot:result.snapshotSha256,candidato:result.candidatoSha256,finanzasApagado:result.finanzasServidorApagado,fuentesAntiguas:result.fuentesAntiguas.map(x=>({nombre:x.nombre,revision:x.revision}))}));}
main().catch(e=>{result.completo=false;result.detencion=e.message;save();console.error('DETENIDO: '+e.message);process.exitCode=1;}).finally(()=>{token=undefined;});
