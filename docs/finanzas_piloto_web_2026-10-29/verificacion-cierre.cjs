'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sesion,P}=require('./sesion.cjs'),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs');
(async()=>{
 const request=await sesion(),r=await remote.conectar(),before=JSON.parse(fs.readFileSync(path.join(__dirname,'antes.json'))),web=JSON.parse(fs.readFileSync(path.join(__dirname,'web-publicado.json')));
 const functions=await r.listar();assert.equal(functions.length,23);assert.ok(functions.every(f=>f.state==='ACTIVE'));
 const old=before.functions;assert.ok(Array.isArray(old),'BASELINE_FUNCTIONS');assert.deepEqual(functions.map(remote.observar),old);
 const rules=await r.reglas();assert.equal(rules.release.rulesetName,'projects/'+P+'/rulesets/a8314ca6-cb38-49f1-81c9-28216a197d19');assert.equal(rules.sha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');
 const base='/v1beta1/projects/'+P+'/sites/'+P;
 assert.deepEqual(await request('firebasehosting.googleapis.com',base+'/channels/live'),before.live);
 const channel=await request('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv');assert.equal(channel.url,web.url);assert.equal(channel.release.version.name,web.version);
 const auth=await request('identitytoolkit.googleapis.com','/admin/v2/projects/'+P+'/config');assert.ok(auth.authorizedDomains.includes(new URL(web.url).hostname));
 const transport=[];
 for(const [name,data]of [['finanzasV1Consultar',{}],['finanzasV1Ejecutar',{}],['finanzasV1Ejecutar',{tipo:'mantenimiento',datos:{}}]]){
  const f=functions.find(f=>f.name.endsWith('/'+name));assert.ok(f);assert.equal(f.serviceConfig.environmentVariables.FINANZAS_V1_SERVIDOR_HABILITADO,'false');
  const url='https://southamerica-west1-'+P+'.cloudfunctions.net/'+name;
  const pre=await fetch(url,{method:'OPTIONS',headers:{Origin:web.url,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'},signal:AbortSignal.timeout(45000)});
  assert.ok([200,204].includes(pre.status));assert.ok(['*',web.url].includes(pre.headers.get('access-control-allow-origin')));
  const res=await fetch(url,{method:'POST',headers:{Origin:web.url,'Content-Type':'application/json'},body:JSON.stringify({data}),signal:AbortSignal.timeout(45000)}),body=await res.json();
  assert.equal(res.status,401);assert.equal(body.error?.status,'UNAUTHENTICATED');assert.ok(['*',web.url].includes(res.headers.get('access-control-allow-origin')));
  transport.push({callable:name,tipo:data.tipo??'normal',cors:true,sinAuth:'UNAUTHENTICATED',datosFinancierosConsultados:false});
 }
 const out={fecha:new Date().toISOString(),functionsIntactas:23,ruleset:rules.release.rulesetName,liveIntacto:true,url:web.url,expira:channel.expireTime,dominioAuthAutorizado:true,loginConfirmadoPorTitular:true,finanzasServidorApagado:true,transport,limite:'Solo transporte CORS y rechazo sin Auth; operaciones autenticadas pendientes de activacion.'};
 fs.writeFileSync(path.join(__dirname,'verificacion-cierre.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(out));
})().catch(e=>{console.error('CIERRE_DETENIDO: '+e.message);process.exitCode=1;});
