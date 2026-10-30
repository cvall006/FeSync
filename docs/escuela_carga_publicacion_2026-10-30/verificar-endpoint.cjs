'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const remote=require('../finanzas_web_despliegue_apagado_2026-10-29/ejecucion-iam-acotado/remoto.cjs');
(async()=>{
 const r=await remote.conectar(),all=await r.listar(),f=all.find(f=>f.name.endsWith('/escuelaCargarModulos'));
 assert.equal(f?.state,'ACTIVE');assert.equal(f.buildConfig.runtime,'nodejs24');assert.equal(f.serviceConfig.timeoutSeconds,120);
 const iam=await r.get('run.googleapis.com','/v2/'+f.serviceConfig.service+':getIamPolicy');
 assert.ok(iam.bindings?.some(b=>b.role==='roles/run.invoker'&&b.members.includes('allUsers')&&!b.condition));
 const url='https://southamerica-west1-fesync-app-2026.cloudfunctions.net/escuelaCargarModulos';
 const checks=[];
 for(const token of [null,'credencial-invalida-de-prueba']){
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Origin:'https://fesync-app-2026.web.app',...(token?{Authorization:'Bearer '+token}:{})},body:'{"data":{}}',signal:AbortSignal.timeout(45000)});
  assert.equal(response.status,401);const body=await response.json();assert.equal(body.error?.status,'UNAUTHENTICATED');
  checks.push({prueba:token?'tokenInvalido':'sinAuth',http:response.status,estado:body.error.status});
 }
 const cors=await fetch(url,{method:'OPTIONS',redirect:'error',headers:{Origin:'https://fesync-app-2026.web.app','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(30000)});
 assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),'https://fesync-app-2026.web.app');
 const out={fecha:new Date().toISOString(),function:f.name,revision:f.serviceConfig.revision,iam:iam.bindings,checks,corsLive:true,sinLecturasNiEscriturasDeDatos:true};
 fs.writeFileSync(path.join(__dirname,'endpoint-verificado.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(out));
})().catch(e=>{console.error('ENDPOINT_DETENIDO: '+e.message);process.exitCode=1;});
