'use strict';
// Guardia local del transporte CLI; no cambia fuentes ni el CLI instalado.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
const names=new Set(m.plan.crear),services=new Set(m.plan.crear.map(n=>n.toLowerCase()));
const {Client}=require('C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2');
const original=Client.prototype.request,uploads=new Set();
const audit=path.join(__dirname,'guardia.jsonl');
function record(x){fs.appendFileSync(audit,JSON.stringify({...x,at:new Date().toISOString()})+'\n');}
Client.prototype.request=async function(o){
 const origin=new URL(this.opts.urlPrefix).origin,host=new URL(origin).hostname;
 const p=String(o.path||'').split('?')[0],method=String(o.method||'GET').toUpperCase();
 const body=o.body||{},project=p.includes('fesync-app-2026')||p.includes('336914296469');
 let allowed=['GET','HEAD','OPTIONS'].includes(method)&&!['firestore.googleapis.com','identitytoolkit.googleapis.com'].includes(host);
 if(method==='POST'&&project&&/:(testIamPermissions|getIamPolicy)$/.test(p))allowed=true;
 if(method==='POST'&&host==='www.googleapis.com'&&p==='/oauth2/v3/token')allowed=true;
 if(method==='POST'&&host==='oauth2.googleapis.com'&&p==='/token')allowed=true;
 if(method==='POST'&&host==='cloudfunctions.googleapis.com'&&/^\/?projects\/fesync-app-2026\/locations\/southamerica-west1\/functions:generateUploadUrl$/.test(p))allowed=true;
 if(method==='PUT'&&uploads.has(origin+p))allowed=true;
 if(method==='POST'&&host==='cloudfunctions.googleapis.com'&&/^\/?projects\/fesync-app-2026\/locations\/southamerica-west1\/functions$/.test(p)){
  const id=o.queryParams?.functionId,env=body.serviceConfig?.environmentVariables||{};
  allowed=names.has(id)&&body.name==='projects/fesync-app-2026/locations/southamerica-west1/functions/'+id&&body.buildConfig?.runtime==='nodejs24'&&env.FINANZAS_V1_SERVIDOR_HABILITADO==='false'&&env.FINANZAS_V1_ENTORNO==='publicable'&&env.FINANZAS_V1_PROYECTO==='fesync-app-2026';
 }
 if(method==='POST'&&host==='serviceusage.googleapis.com'&&/^\/?projects\/336914296469\/services\/(pubsub|eventarc)\.googleapis\.com:generateServiceIdentity$/.test(p)){
  const approved=JSON.parse(fs.readFileSync(path.join(__dirname,'preflight.json')));allowed=approved.identidadesExistentes===true;
 }
 if(method==='POST'&&host==='run.googleapis.com'&&p.endsWith(':setIamPolicy')){
  const match=p.match(/^\/?projects\/(fesync-app-2026|336914296469)\/locations\/southamerica-west1\/services\/([^/:]+):setIamPolicy$/);
  const bindings=body.policy?.bindings;
  allowed=!!match&&services.has(match[2])&&bindings?.length===1&&bindings[0].role==='roles/run.invoker'&&JSON.stringify(bindings[0].members)==='["allUsers"]'&&!bindings[0].condition;
 }
 // Todo PATCH/DELETE, activación de APIs, IAM de proyecto/SA y políticas de
 // artefactos queda denegado antes de enviar la solicitud.
 if(!allowed){record({bloqueado:true,method,host,path:p});process.stderr.write('DETENCION_GUARDIA: '+method+' '+host+' '+p+'\n');process.exit(86);}
 if(!['GET','HEAD','OPTIONS'].includes(method))record({permitido:true,method,host,path:p});
 const r=await original.call(this,o);
 if(host==='cloudfunctions.googleapis.com'&&p.endsWith(':generateUploadUrl')&&r.body?.uploadUrl){const u=new URL(r.body.uploadUrl);uploads.add(u.origin+u.pathname);}
 return r;
};
