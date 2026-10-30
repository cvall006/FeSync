'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sesion,P}=require('./sesion.cjs');
(async()=>{const r=await sesion(),base='/v1beta1/projects/'+P+'/sites/'+P,live=await r('firebasehosting.googleapis.com',base+'/channels/live'),pilot=await r('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv');
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'antes.json')));assert.deepEqual(live,before.live);assert.equal(pilot.release.version.status,'FINALIZED');
const m=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_web_despliegue_apagado_2026-10-29/manifest.json'))),checked=[];
for(const name of ['index.html','flutter_bootstrap.js','main.dart.js']){const f=m.files.find(f=>f.path==='hosting/'+name),res=await fetch(pilot.url+'/'+name,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(res.status,200);const b=Buffer.from(await res.arrayBuffer()),hash=crypto.createHash('sha256').update(b).digest('hex');assert.equal(hash,f.sha256);checked.push({name,sha256:hash});}
const inspection=JSON.parse(fs.readFileSync(path.join(__dirname,'inspeccion.json'))),domain=new URL(pilot.url).hostname;
const result={url:pilot.url,canal:pilot.name,expira:pilot.expireTime,version:pilot.release.version.name,liveIntacto:true,clienteFinanzasApagado:true,archivosHTTPVerificados:checked,dominioAuthAutorizado:inspection.auth.authorizedDomains.includes(domain),titularSoloGoogle:inspection.authTitular.providers.length===1&&inspection.authTitular.providers[0]==='google.com',dominioAuthNecesario:domain};
fs.writeFileSync(path.join(__dirname,'web-publicado.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
})().catch(e=>{console.error('VERIFICACION_DETENIDA: '+e.message);process.exitCode=1;});
