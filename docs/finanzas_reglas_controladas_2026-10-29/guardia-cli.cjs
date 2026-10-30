'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2');
const approved=JSON.parse(fs.readFileSync(path.join(__dirname,'preflight.json'))),original=Client.prototype.request;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');let created;
function record(x){fs.appendFileSync(path.join(__dirname,'guardia.jsonl'),JSON.stringify({...x,at:new Date().toISOString()})+'\n');}
function stop(method,host,p){record({bloqueado:true,method,host,path:p});process.stderr.write('DETENCION_GUARDIA: '+method+' '+host+' '+p+'\n');process.exit(86);}
Client.prototype.request=async function(o){
 const host=new URL(this.opts.urlPrefix).hostname,p=String(o.path||'').split('?')[0],method=String(o.method||'GET').toUpperCase(),body=o.body||{};
 let ok=['GET','HEAD','OPTIONS'].includes(method)&&!['firestore.googleapis.com','identitytoolkit.googleapis.com'].includes(host);
 if(method==='GET'&&host==='firestore.googleapis.com'&&/^\/?projects\/fesync-app-2026\/databases\/\(default\)$/.test(p))ok=true;
 if(method==='POST'&&host==='www.googleapis.com'&&p==='/oauth2/v3/token')ok=true;
 if(method==='POST'&&host==='oauth2.googleapis.com'&&p==='/token')ok=true;
 if(method==='POST'&&p.includes('fesync-app-2026')&&p.endsWith(':testIamPermissions'))ok=true;
 const candidate=body.source?.files;
 const exact=Array.isArray(candidate)&&candidate.length===1&&typeof candidate[0].content==='string'&&sha(candidate[0].content)===approved.candidatoSha256;
 const make=method==='POST'&&host==='firebaserules.googleapis.com'&&p==='/projects/fesync-app-2026/rulesets';
 if(method==='POST'&&host==='firebaserules.googleapis.com'&&p==='/projects/fesync-app-2026:test')ok=exact;
 if(make)ok=exact&&!body.attachment_point;
 const publish=method==='PATCH'&&host==='firebaserules.googleapis.com'&&p==='/projects/fesync-app-2026/releases/cloud.firestore';
 if(publish)ok=!!created&&body.release?.name==='projects/fesync-app-2026/releases/cloud.firestore'&&body.release.rulesetName===created;
 if(!ok)stop(method,host,p);
 if(make||publish){const fresh=await original.call(this,{method:'GET',path:'/projects/fesync-app-2026/releases/cloud.firestore'});if(fresh.body?.rulesetName!==approved.release.rulesetName)stop(method,host,'RULESET_REMOTO_CAMBIO');}
 if(!['GET','HEAD','OPTIONS'].includes(method))record({permitido:true,method,host,path:p,candidato:make?approved.candidatoSha256:undefined});
 const r=await original.call(this,o);
 if(make){created=r.body?.name;if(!/^projects\/fesync-app-2026\/rulesets\/[A-Za-z0-9-]+$/.test(created||''))stop(method,host,'RULESET_CREADO_INESPERADO');record({rulesetCreado:created});}
 return r;
};
