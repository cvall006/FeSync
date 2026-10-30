'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sesion,P,I}=require('./sesion.cjs'),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs');
const privateDir=path.resolve(__dirname,'../../migrate_working_dir/finanzas_titular_8iyv_2026-10-29');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function gates(request,{pilotoHabilitado=false}={}){
 const rows=await request('firestore.googleapis.com','/v1/projects/'+P+'/databases/(default)/documents:runQuery',{body:{structuredQuery:{select:{fields:['habilitado','versionEsquema','iglesiaId','circuito'].map(fieldPath=>({fieldPath}))},from:[{collectionId:'finanzas_control',allDescendants:true}],limit:1001}}});
 const docs=rows.filter(r=>r.document).map(r=>r.document);assert.ok(docs.length<1001,'METADATA_EXCEDE_LIMITE');
 const enabled=docs.filter(d=>d.fields?.habilitado?.booleanValue===true);assert.equal(enabled.length,pilotoHabilitado?1:0,'OTRO_GATE_HABILITADO_DETENER');
 if(pilotoHabilitado){const d=enabled[0];assert.equal(d.name,'projects/'+P+'/databases/(default)/documents/iglesias/'+I+'/finanzas_control/publicacion_v1');assert.equal(d.fields.iglesiaId.stringValue,I);assert.equal(d.fields.circuito.stringValue,'v1_incremental');assert.equal(d.fields.versionEsquema.integerValue,'1');}
 return{controlesObservados:docs.length,gatesHabilitados:enabled.length,soloPiloto:pilotoHabilitado,datosLeidos:'Solo habilitado, versionEsquema, iglesiaId y circuito; sin importes ni registros.'};
}
function sources(){const state=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_web_piloto_2026-10-29/estado-previo.json')));assert.ok(Array.isArray(state));const initial=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_web_candidato_2026-10-28/estado-inicial.json'))).files;const merged=[...new Map([...initial,...state].map(f=>[f.path,f])).values()];const files=merged.filter(f=>/^(lib\/|web\/|assets\/|pubspec\.)/.test(f.path));assert.ok(files.length>50);for(const f of files)assert.equal(sha(fs.readFileSync(path.resolve(__dirname,'../..',f.path))),f.sha256,'FUENTE_CAMBIADA: '+f.path);return files;}
async function main(){require('../finanzas_web_despliegue_apagado_2026-10-29/verificar.cjs');const files=sources(),request=await sesion(),r=await remote.conectar(),all=await r.listar();
 const before=JSON.parse(fs.readFileSync(path.join(__dirname,'antes.json')));assert.equal(all.length,23);assert.deepEqual(all.map(remote.observar),before.functions);
 const rules=await r.reglas();assert.equal(rules.release.rulesetName,before.ruleset);assert.equal(rules.sha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');
 const base='/v1beta1/projects/'+P+'/sites/'+P;assert.deepEqual(await request('firebasehosting.googleapis.com',base+'/channels/live'),before.live);
 const web=JSON.parse(fs.readFileSync(path.join(__dirname,'web-publicado.json'))),pilot=await request('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv');assert.equal(pilot.release.version.name,web.version);assert.equal(pilot.url,web.url);
 const auth=await request('identitytoolkit.googleapis.com','/admin/v2/projects/'+P+'/config');assert.ok(auth.authorizedDomains.includes(new URL(web.url).hostname));
 const scan=await gates(request);
 const out={fecha:new Date().toISOString(),proyecto:P,iglesia:I,functions:all.map(remote.observar),ruleset:before.ruleset,liveIntacto:true,piloto:pilot.name,url:pilot.url,expira:pilot.expireTime,metadatos:scan,fuentes:files,digestFuentes:sha(JSON.stringify(files)),autorizacion:'Usuario confirmó si a la activación exclusiva, dos env-only updates y cliente piloto.'};
 for(const suffix of ['.json','.copia.json'])fs.writeFileSync(path.join(privateDir,'activacion-config-antes'+suffix),JSON.stringify({functions:all,live:before.live,pilot,authDomains:auth.authorizedDomains},null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(__dirname,'activacion-preflight.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({preflight:'APTO',functions:23,fuentes:files.length,metadatos:scan,liveIntacto:true}));
}
if(require.main===module)main().catch(e=>{console.error('DETENCION_PREFLIGHT: '+e.message);process.exitCode=1;});
module.exports={gates,sources,privateDir};
