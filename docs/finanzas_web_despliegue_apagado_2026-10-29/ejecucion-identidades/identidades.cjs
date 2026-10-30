'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {P,N,cli,conectar,observar}=require('../ejecucion-iam-acotado/remoto.cjs');
const base=path.resolve(__dirname,'..');
const audit=[],result={proyecto:P,inicio:new Date().toISOString(),identidades:[],cambiosIAMAutomaticos:[],despliegueIniciado:false};
const save=()=>fs.writeFileSync(path.join(__dirname,'resultado-identidades.json'),JSON.stringify({...result,audit},null,2)+'\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let token;
async function request(host,route,body){
 const method=body===undefined?'GET':'POST';
 assert.ok(['cloudresourcemanager.googleapis.com','serviceusage.googleapis.com'].includes(host));
 if(method==='POST')assert.ok(host==='cloudresourcemanager.googleapis.com'&&route==='/v1/projects/'+P+':getIamPolicy'||host==='serviceusage.googleapis.com'&&new RegExp('^/v1beta1/projects/'+N+'/services/(pubsub|eventarc)\\.googleapis\\.com:generateServiceIdentity$').test(route));
 const r=await fetch('https://'+host+route,{method,redirect:'error',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
 audit.push({method,host,route,http:r.status,at:new Date().toISOString()});save();
 if(!r.ok)throw Error('HTTP_'+r.status+' '+host+route);
 return r.json();
}
async function policy(){return request('cloudresourcemanager.googleapis.com','/v1/projects/'+P+':getIamPolicy',{options:{requestedPolicyVersion:3}});}
function edges(p){return(p.bindings||[]).flatMap(b=>(b.members||[]).map(member=>JSON.stringify({role:b.role,condition:b.condition??null,member}))).sort();}
function delta(before,after){const a=new Set(edges(before)),b=new Set(edges(after));return{agregadas:[...b].filter(e=>!a.has(e)).map(JSON.parse),eliminadas:[...a].filter(e=>!b.has(e)).map(JSON.parse)};}
function validate(d){assert.equal(d.eliminadas.length,0,'IAM eliminado fuera de alcance');for(const e of d.agregadas)assert.ok(!e.condition&&['pubsub','eventarc'].some(s=>e.role==='roles/'+s+'.serviceAgent'&&e.member==='serviceAccount:service-'+N+'@gcp-sa-'+s+'.iam.gserviceaccount.com'),'Concesion automatica no esperada');}
async function main(){
 require('../verificar.cjs');
 const remote=await conectar(),before=(await remote.listar()).map(observar),m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 assert.equal(before.length,13);assert.ok(m.plan.crear.every(n=>!before.some(f=>f.nombre===n)));
 const old=JSON.parse(fs.readFileSync(path.join(base,'ejecucion-iam-acotado/resultado-final.json'))).treceFuncionesExistentes;
 for(const f of before){assert.equal(f.estado,'ACTIVE');assert.ok(f.name.includes('/locations/southamerica-west1/'));const o=old.find(o=>o.name===f.name);assert.ok(o);assert.equal(o.revision,f.revision);assert.equal(o.actualizacion,f.actualizacion);}
 result.paquete=m.digest;result.funcionesAntes=before;save();
 const c=require(cli+'configstore').configstore.get('tokens');assert.ok(c);token=c.access_token;
 if(!token||c.expires_at<Date.now()+60000){const api=require(cli+'api');const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:api.clientId(),client_secret:api.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);token=(await r.json()).access_token;}
 const initial=await policy();
 result.iamAntesDigest=sha(JSON.stringify(edges(initial)));result.iamAntesVerificado=true;save();
 for(const service of ['pubsub','eventarc']){
  let op=await request('serviceusage.googleapis.com','/v1beta1/projects/'+N+'/services/'+service+'.googleapis.com:generateServiceIdentity',{});
  for(let i=0;!op.done&&i<30;i++){assert.ok(/^operations\/[A-Za-z0-9_/-]+$/.test(op.name),'Operacion no esperada');op=await request('serviceusage.googleapis.com','/v1beta1/'+op.name);}
  assert.ok(op.done&&!op.error,'Generacion incompleta/fallida');
  const expected='service-'+N+'@gcp-sa-'+service+'.iam.gserviceaccount.com';
  assert.equal(op.response?.email,expected,'Identidad no esperada');
  const identity={servicio:service+'.googleapis.com',email:expected,uniqueId:op.response.uniqueId??null,resultado:'IDENTIDAD_DEVUELTA_POR_GOOGLE',creadaOReutilizada:'No distinguible con las lecturas previas 404/403'};
  result.identidades.push(identity);save();
  const after=await policy(),d=delta(initial,after);result.cambiosIAMAutomaticos=d;save();validate(d);
 }
 const final=await policy(),d=delta(initial,final);validate(d);
 result.cambiosIAMAutomaticos=d;result.iamDespuesDigest=sha(JSON.stringify(edges(final)));result.iamDespuesVerificado=true;
 const after=(await remote.listar()).map(observar);assert.deepEqual(after,before,'Cambio de Functions durante generacion');
 result.treceIntactas=true;result.aptoContinuar=true;result.fin=new Date().toISOString();save();
 console.log(JSON.stringify({aptoContinuar:true,identidades:result.identidades,cambiosIAMAutomaticos:d,treceIntactas:true}));
}
main().catch(e=>{result.aptoContinuar=false;result.detencion=e.message;save();console.error('DETENIDO: '+e.message);process.exitCode=1;}).finally(()=>{token=undefined;});
