'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const old=require('../finanzas_web_despliegue_apagado_2026-10-29/ejecucion-iam-acotado/remoto.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function conectar(){
 const c=require(old.cli+'configstore').configstore.get('tokens');assert.ok(c);let token=c.access_token;
 if(!token||c.expires_at<Date.now()+60000){const a=require(old.cli+'api');const r=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:a.clientId(),client_secret:a.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);token=(await r.json()).access_token;}
 const functions=await old.conectar();
 async function reglas(){const request=async route=>{assert.ok(route.startsWith('/v1/projects/fesync-app-2026/'));const r=await fetch('https://firebaserules.googleapis.com'+route,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,'Lectura de reglas');return r.json();};const release=await request('/v1/projects/fesync-app-2026/releases/cloud.firestore');assert.match(release.rulesetName,/^projects\/fesync-app-2026\/rulesets\/[A-Za-z0-9-]+$/);const rules=await request('/v1/'+release.rulesetName);assert.equal(rules.source.files.length,1);return {release,rules,sha256:sha(rules.source.files[0].content)};}
 return {reglas,listar:functions.listar};
}
module.exports={...old,conectar,sha};
