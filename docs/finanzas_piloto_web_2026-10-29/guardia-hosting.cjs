'use strict';
const fs=require('node:fs'),path=require('node:path');
const P='fesync-app-2026',C='finanzas-piloto-8iyv';
const m=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_web_despliegue_apagado_2026-10-29/manifest.json')));
const files=new Set(m.files.filter(f=>f.path.startsWith('hosting/')).map(f=>'/'+f.path.slice(8))),versions=new Set(),uploadRoots=new Set();
const {Client}=require('C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2'),original=Client.prototype.request;
function record(x){fs.appendFileSync(path.join(__dirname,'guardia-hosting.jsonl'),JSON.stringify({...x,at:new Date().toISOString()})+'\n');}
Client.prototype.request=async function(o){
const prefix=this.opts.urlPrefix,host=new URL(prefix).hostname,raw=String(o.path||''),p=raw.split('?')[0],method=String(o.method||'GET').toUpperCase(),b=o.body||{};
const norm=p.replace(/^\/?projects\/(?:-|fesync-app-2026|336914296469)\//,'').replace(/^\//,'');
let ok=['GET','HEAD','OPTIONS'].includes(method)&&!['firestore.googleapis.com','identitytoolkit.googleapis.com'].includes(host);
if(method==='POST'&&host==='www.googleapis.com'&&p==='/oauth2/v3/token')ok=true;
if(method==='POST'&&host==='oauth2.googleapis.com'&&p==='/token')ok=true;
if(method==='POST'&&p.includes(P)&&p.endsWith(':testIamPermissions'))ok=true;
const create=method==='POST'&&host==='firebasehosting.googleapis.com'&&norm==='sites/'+P+'/versions';
if(create)ok=b.status==='CREATED';
if(host==='firebasehosting.googleapis.com'&&method==='POST'&&norm==='sites/'+P+'/channels')ok=new URL('https://dummy'+(raw.startsWith('/')?raw:'/'+raw)).searchParams.get('channelId')===C&&b.ttl==='604800s';
if(host==='firebasehosting.googleapis.com'&&method==='PATCH'&&norm==='sites/'+P+'/channels/'+C)ok=b.ttl==='604800s'&&Object.keys(b).length===1;
if(host==='firebasehosting.googleapis.com'&&method==='POST'&&norm.endsWith(':populateFiles'))ok=versions.has(norm.slice(0,-14))&&Object.keys(b.files||{}).every(f=>files.has(f));
if(method==='POST'&&uploadRoots.has(prefix))ok=/^\/[a-f0-9]{64}$/.test(p);
if(host==='firebasehosting.googleapis.com'&&method==='PATCH'&&versions.has(norm))ok=b.status==='FINALIZED'&&b.config?.rewrites?.length===1&&!b.config.rewrites.some(r=>r.function||r.run);
if(host==='firebasehosting.googleapis.com'&&method==='POST'&&norm==='sites/'+P+'/channels/'+C+'/releases')ok=versions.has(String(o.queryParams?.versionName||'').replace(/^projects\/(?:-|fesync-app-2026|336914296469)\//,''));
if(!ok){record({bloqueado:true,method,host,path:p});process.stderr.write('DETENCION_GUARDIA: '+method+' '+host+' '+p+'\n');process.exit(86);}
if(!['GET','HEAD','OPTIONS'].includes(method))record({permitido:true,method,host,path:p});
const r=await original.call(this,o);
if(create){const v=String(r.body?.name||'').replace(/^projects\/(?:-|fesync-app-2026|336914296469)\//,'');if(!new RegExp('^sites/'+P+'/versions/[A-Za-z0-9_-]+$').test(v))process.exit(86);versions.add(v);record({versionCreada:v});}
if(host==='firebasehosting.googleapis.com'&&norm.endsWith(':populateFiles')&&r.body?.uploadUrl)uploadRoots.add(r.body.uploadUrl.replace(/\/$/,''));
return r;
};
