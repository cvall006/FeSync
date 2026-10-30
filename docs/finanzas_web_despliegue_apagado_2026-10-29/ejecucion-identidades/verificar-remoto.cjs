'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {P,cli,conectar,observar}=require('../ejecucion-iam-acotado/remoto.cjs');
const base=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
const result={proyecto:P,at:new Date().toISOString(),invocacionesDeFunctions:0,datosFinancierosConsultados:false};
const save=()=>fs.writeFileSync(path.join(__dirname,'verificacion-final.json'),JSON.stringify(result,null,2)+'\n');
function edges(p){return(p.bindings||[]).flatMap(b=>(b.members||[]).map(member=>JSON.stringify({role:b.role,condition:b.condition??null,member}))).sort();}
async function main(){
 const r=await conectar(),all=await r.listar(),observed=all.map(observar);
 const before=JSON.parse(fs.readFileSync(path.join(__dirname,'preflight-2.json'))).antes;
 result.existentes=observed.filter(f=>before.some(b=>b.name===f.name));
 result.nuevas=observed.filter(f=>m.plan.crear.includes(f.nombre));
 result.otras=observed.filter(f=>!result.existentes.includes(f)&&!result.nuevas.includes(f));save();
 assert.equal(result.existentes.length,13);assert.deepEqual(result.existentes,before,'Cambios en alguna Function existente');
 result.treceIntactas=true;save();
 assert.equal(result.nuevas.length,10,'No estan las diez nuevas');assert.equal(result.otras.length,0,'Funcion adicional no planificada');
 assert.ok(result.nuevas.every(f=>f.estado==='ACTIVE'&&f.runtime==='nodejs24'&&f.entorno==='GEN_2'&&f.name.includes('/locations/southamerica-west1/')),'Nueva no activa o configuracion inesperada');
 for(const f of result.nuevas)assert.deepEqual(f.finanzas,{FINANZAS_V1_ENTORNO:'publicable',FINANZAS_V1_PROYECTO:P,FINANZAS_V1_SERVIDOR_HABILITADO:'false'},'Flags de '+f.nombre);
 result.finanzasServidorApagado=true;result.finanzasClientePaqueteApagado=m.clienteHabilitado===false;save();
 result.iamServicios=[];
 for(const f of result.nuevas){assert.ok(f.servicio.startsWith('projects/'+P+'/locations/southamerica-west1/services/'));const p=await r.get('run.googleapis.com','/v1/'+f.servicio+':getIamPolicy');const bindings=p.bindings||[];
  const summary={function:f.nombre,servicio:f.servicio,bindings:bindings.map(b=>({role:b.role,members:b.members,condition:b.condition??null}))};result.iamServicios.push(summary);save();
  assert.equal(bindings.length,1,'Bindings adicionales '+f.nombre);assert.equal(bindings[0].role,'roles/run.invoker');assert.deepEqual(bindings[0].members,['allUsers']);assert.ok(!bindings[0].condition);
 }
 const c=require(cli+'configstore').configstore.get('tokens');let token=c.access_token;
 if(!token||c.expires_at<Date.now()+60000){const api=require(cli+'api');const res=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:api.clientId(),client_secret:api.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(res.status,200);token=(await res.json()).access_token;}
 const res=await fetch('https://cloudresourcemanager.googleapis.com/v1/projects/'+P+':getIamPolicy',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({options:{requestedPolicyVersion:3}}),signal:AbortSignal.timeout(25000)});assert.equal(res.status,200,'No se pudo verificar IAM final');const policy=await res.json();token=undefined;
 const digest=crypto.createHash('sha256').update(JSON.stringify(edges(policy))).digest('hex'),identities=JSON.parse(fs.readFileSync(path.join(__dirname,'resultado-identidades.json')));
 result.iamProyectoDigest=digest;result.iamProyectoIgualTrasGenerarIdentidades=digest===identities.iamDespuesDigest;save();assert.ok(result.iamProyectoIgualTrasGenerarIdentidades,'Cambios IAM de proyecto durante despliegue');
 const audit=fs.readFileSync(path.join(__dirname,'guardia.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 result.politicasInvocacionAplicadas=audit.filter(e=>e.permitido&&e.host==='run.googleapis.com'&&e.path.endsWith(':setIamPolicy')).length;
 result.guardiasBloquearon=audit.filter(e=>e.bloqueado);
 result.completa=true;save();
 console.log(JSON.stringify({completa:true,treceIntactas:true,nuevas:result.nuevas.map(f=>({nombre:f.nombre,revision:f.revision})),iamVerificado:result.iamServicios.length,iamProyectoIntacto:true,finanzasApagado:true}));
}
main().catch(e=>{result.completa=false;result.detencion=e.message;save();console.error('VERIFICACION_DETENIDA: '+e.message);process.exitCode=1;});
