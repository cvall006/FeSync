'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Client}=require('C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2'),original=Client.prototype.request;
const P='fesync-app-2026',name='escuelaCargarModulos',service=name.toLowerCase(),uploads=new Set();
function log(x){fs.appendFileSync(path.join(__dirname,'guardia-functions.jsonl'),JSON.stringify({...x,at:new Date().toISOString()})+'\n');}
Client.prototype.request=async function(o){
 const origin=new URL(this.opts.urlPrefix).origin,host=new URL(origin).hostname,p='/'+String(o.path||'').split('?')[0].replace(/^\/+/,''),method=String(o.method||'GET').toUpperCase(),b=o.body||{};
 let ok=['GET','HEAD','OPTIONS'].includes(method)&&!['firestore.googleapis.com','identitytoolkit.googleapis.com'].includes(host);
 if(method==='POST'&&p.includes(P)&&/:(testIamPermissions|getIamPolicy)$/.test(p))ok=true;
 if(method==='POST'&&((host==='www.googleapis.com'&&p==='/oauth2/v3/token')||(host==='oauth2.googleapis.com'&&p==='/token')))ok=true;
 if(method==='POST'&&host==='cloudfunctions.googleapis.com'&&p===`/projects/${P}/locations/southamerica-west1/functions:generateUploadUrl`)ok=true;
 if(method==='PUT'&&uploads.has(origin+p))ok=true;
 if(method==='POST'&&host==='cloudfunctions.googleapis.com'&&p===`/projects/${P}/locations/southamerica-west1/functions`){
  ok=o.queryParams?.functionId===name&&b.name===`projects/${P}/locations/southamerica-west1/functions/${name}`&&b.buildConfig?.runtime==='nodejs24'&&b.buildConfig?.entryPoint===name&&!b.eventTrigger&&b.serviceConfig?.timeoutSeconds===120;
 }
 if(method==='POST'&&host==='run.googleapis.com'&&new RegExp('^/projects/('+P+'|336914296469)/locations/southamerica-west1/services/'+service+':setIamPolicy$').test(p)){
  const bs=b.policy?.bindings;ok=bs?.length===1&&bs[0].role==='roles/run.invoker'&&JSON.stringify(bs[0].members)==='["allUsers"]'&&!bs[0].condition;
 }
 // Las dos identidades ya existen; el CLI puede solicitar su reutilización.
 if(method==='POST'&&host==='serviceusage.googleapis.com'&&/^\/projects\/336914296469\/services\/(pubsub|eventarc)\.googleapis\.com:generateServiceIdentity$/.test(p))ok=true;
 if(!ok){log({bloqueado:true,method,host,path:p});process.stderr.write('DETENCION_GUARDIA: '+method+' '+host+' '+p+'\n');process.exit(86);}
 if(!['GET','HEAD','OPTIONS'].includes(method))log({permitido:true,method,host,path:p});
 const r=await original.call(this,o);if(host==='cloudfunctions.googleapis.com'&&p.endsWith(':generateUploadUrl')&&r.body?.uploadUrl){const u=new URL(r.body.uploadUrl);uploads.add(u.origin+u.pathname);}return r;
};
