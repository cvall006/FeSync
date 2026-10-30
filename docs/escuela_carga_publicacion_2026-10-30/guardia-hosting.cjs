'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2'),original=Client.prototype.request;
const P='fesync-app-2026',expected='projects/'+P+'/sites/'+P+'/versions/e8c5ec03728fbb5f',m=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'))),files=new Map(m.files.map(f=>['/'+f.path.slice(8),f.gzipSha256])),versions=new Set(),uploads=new Set(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function record(x){fs.appendFileSync(path.join(__dirname,'guardia-hosting.jsonl'),JSON.stringify({...x,at:new Date().toISOString()})+'\n');}
function stop(method,host,p){record({bloqueado:true,method,host,path:p});process.stderr.write('DETENCION_GUARDIA_HOSTING: '+method+' '+host+' '+p+'\n');process.exit(86);}
Client.prototype.request=async function(o){
 const prefix=this.opts.urlPrefix,host=new URL(prefix).hostname,raw=String(o.path||''),p=raw.split('?')[0],method=String(o.method||'GET').toUpperCase(),b=o.body||{},norm=p.replace(/^\/?projects\/(?:-|fesync-app-2026|336914296469)\//,'').replace(/^\//,'');
 let ok=['GET','HEAD','OPTIONS'].includes(method)&&!['firestore.googleapis.com','identitytoolkit.googleapis.com'].includes(host);
 if(method==='POST'&&((host==='www.googleapis.com'&&p==='/oauth2/v3/token')||(host==='oauth2.googleapis.com'&&p==='/token')))ok=true;
 if(method==='POST'&&p.includes(P)&&p.endsWith(':testIamPermissions'))ok=true;
 const create=method==='POST'&&host==='firebasehosting.googleapis.com'&&norm==='sites/'+P+'/versions';if(create)ok=b.status==='CREATED';
 if(host==='firebasehosting.googleapis.com'&&method==='POST'&&norm.endsWith(':populateFiles'))ok=versions.has(norm.slice(0,-14))&&Object.entries(b.files||{}).every(([p,h])=>files.get(p)===h);
 if(method==='POST'&&uploads.has(prefix))ok=/^\/[a-f0-9]{64}$/.test(p)&&[...files.values()].includes(p.slice(1));
 if(host==='firebasehosting.googleapis.com'&&method==='PATCH'&&versions.has(norm))ok=b.status==='FINALIZED'&&b.config?.rewrites?.length===1&&!b.config.rewrites.some(r=>r.function||r.run);
 const release=host==='firebasehosting.googleapis.com'&&method==='POST'&&['sites/'+P+'/releases','sites/'+P+'/channels/live/releases'].includes(norm);
 if(release){ok=versions.has(String(o.queryParams?.versionName||'').replace(/^projects\/[^/]+\//,''));if(ok){const current=await original.call(this,{method:'GET',path:'/projects/'+P+'/sites/'+P+'/channels/live'});ok=current.body?.release?.version?.name?.replace(/^projects\/[^/]+\//,'')===expected.replace(/^projects\/[^/]+\//,'');}}
 if(!ok)stop(method,host,p);if(!['GET','HEAD','OPTIONS'].includes(method))record({permitido:true,method,host,path:p});
 const r=await original.call(this,o);
 if(create){const v=String(r.body?.name||'').replace(/^projects\/[^/]+\//,'');if(!new RegExp('^sites/'+P+'/versions/[A-Za-z0-9_-]+$').test(v))stop(method,host,'VERSION_INESPERADA');versions.add(v);record({versionCreada:v});}
 if(host==='firebasehosting.googleapis.com'&&norm.endsWith(':populateFiles')&&r.body?.uploadUrl)uploads.add(r.body.uploadUrl.replace(/\/$/,''));return r;
};
