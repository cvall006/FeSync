'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const P='fesync-app-2026',N='336914296469';
const cli='C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
const canon=(v,k='')=>Array.isArray(v)?(k==='eventFilters'?v.map(x=>canon(x)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v.map(x=>canon(x))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k],k)])):v;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function conectar(){
 const c=require(cli+'configstore').configstore.get('tokens');assert.ok(c,'Sesion CLI existente requerida');let token=c.access_token;
 if(!token||c.expires_at<Date.now()+60000){const api=require(cli+'api');const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:api.clientId(),client_secret:api.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'OAuth existente');token=(await r.json()).access_token;}
 async function get(host,route){assert.ok(['cloudfunctions.googleapis.com','serviceusage.googleapis.com','iam.googleapis.com','artifactregistry.googleapis.com','run.googleapis.com'].includes(host));assert.ok(route.includes(P)||route.includes(N),'Proyecto exacto');const r=await fetch('https://'+host+route,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('GET_HTTP_'+r.status+' '+host+route);return r.json();}
 async function listar(){let next;const all=[];do{const d=await get('cloudfunctions.googleapis.com','/v2/projects/'+P+'/locations/-/functions?pageSize=100'+(next?'&pageToken='+encodeURIComponent(next):''));assert.ok(!d.unreachable?.length);all.push(...d.functions||[]);next=d.nextPageToken;}while(next);return all.sort((a,b)=>a.name.localeCompare(b.name));}
 return {get,listar};
}
function observar(f){return {nombre:f.name.split('/').pop(),name:f.name,estado:f.state,revision:f.serviceConfig?.revision??null,actualizacion:f.updateTime,runtime:f.buildConfig?.runtime,entorno:f.environment,servicio:f.serviceConfig?.service??null,configDigest:sha(JSON.stringify(canon(f))),finanzas:Object.fromEntries(['FINANZAS_V1_ENTORNO','FINANZAS_V1_PROYECTO','FINANZAS_V1_SERVIDOR_HABILITADO'].map(k=>[k,f.serviceConfig?.environmentVariables?.[k]??null]))};}
function guardar(name,data){fs.writeFileSync(path.join(__dirname,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
module.exports={P,N,cli,conectar,observar,guardar};
