'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {sesion,P}=require('./sesion.cjs'),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs'),{gates,privateDir}=require('./activacion-preflight.cjs');
const root=path.resolve(__dirname,'../..'),stage=path.join(__dirname,'activo-live-compatible'),base='/v1beta1/projects/'+P+'/sites/'+P,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'activo-final/manifest.json'))),oldLive=JSON.parse(fs.readFileSync(path.join(__dirname,'hosting-live-antes-promocion.json')));
const expectedLive='projects/'+P+'/sites/'+P+'/versions/504bdb13ab09a0ac',expectedPilot='projects/'+P+'/sites/'+P+'/versions/5527dc43365bfb1d';
function save(name,x){fs.writeFileSync(path.join(stage,name),JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
function packageClient(){
 assert.ok(!fs.existsSync(stage));
 const approved=new Set(['lib/main.dart','lib/core/services/auth_service.dart','lib/core/services/coordinador_ingreso.dart','lib/core/services/ingreso_pendiente_service.dart','lib/modules/miembros/gestion_miembros_screen.dart']);
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'activacion-preflight.json'))).fuentes;
 for(const f of baseline){if(approved.has(f.path))continue;const latest=previous.cambiosCliente.find(c=>c.path===f.path);assert.equal(sha(fs.readFileSync(path.join(root,f.path))),latest?.despues??f.sha256,'FUENTE_NO_AUTORIZADA: '+f.path);}
 const sources=[...approved,'lib/core/services/miembros_legacy_service.dart'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))}));
 fs.mkdirSync(path.join(stage,'hosting'),{recursive:true});
 const files=previous.files.filter(f=>f.path!=='hosting/'+previous.mainVersionado).map(f=>f.path);
 for(const p of files){const b=fs.readFileSync(path.join(root,'build/finanzas_web_live_compatible',p.slice(8))),dest=path.join(stage,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b,{flag:'wx'});}
 const fingerprint=sha(fs.readFileSync(path.join(stage,'hosting/main.dart.js'))),versioned='main.finanzas-'+fingerprint.slice(0,16)+'.dart.js';
 fs.copyFileSync(path.join(stage,'hosting/main.dart.js'),path.join(stage,'hosting',versioned));files.push('hosting/'+versioned);
 const bp=path.join(stage,'hosting/flutter_bootstrap.js'),bootstrap=fs.readFileSync(bp,'utf8');assert.equal(bootstrap.split('"mainJsPath":"main.dart.js"').length,2);fs.writeFileSync(bp,bootstrap.replace('"mainJsPath":"main.dart.js"','"mainJsPath":"'+versioned+'"'));
 const ip=path.join(stage,'hosting/index.html'),html=fs.readFileSync(ip,'utf8');assert.equal(html.split('src="flutter_bootstrap.js"').length,2);fs.writeFileSync(ip,html.replace('src="flutter_bootstrap.js"','src="flutter_bootstrap.js?fesyncBuild='+fingerprint.slice(0,16)+'"'));
 save('manifest.json',{...previous,mainVersionado:versioned,fuentesCompatibilidad:sources,files:files.map(p=>{const b=fs.readFileSync(path.join(stage,p));return{path:p,bytes:b.length,sha256:sha(b)};})});
 for(const p of ['firebase.hosting.json','guardia.cjs'])fs.copyFileSync(path.join(__dirname,'activo-final',p),path.join(stage,p));
 const command=JSON.parse(fs.readFileSync(path.join(__dirname,'activo-final/comando.json')));command.args[1]=path.join(stage,'guardia.cjs');command.args[command.args.indexOf('--config')+1]=path.join(stage,'firebase.hosting.json');save('comando.json',command);
 console.log(JSON.stringify({paquete:'preparado',archivos:files.length,mainVersionado:versioned,finanzasSinCambios:true}));
}
async function checks(){
 const request=await sesion(),r=await remote.conectar(),all=await r.listar();
 const baseline=JSON.parse(fs.readFileSync(path.join(privateDir,'activacion-config-servidor.json')));
 assert.equal(all.length,23);assert.ok(all.every(f=>f.state==='ACTIVE'));assert.deepEqual(all.map(remote.observar),baseline.map(remote.observar),'FUNCTIONS_CAMBIARON');
 const rules=await r.reglas();assert.equal(rules.release.rulesetName,'projects/'+P+'/rulesets/a8314ca6-cb38-49f1-81c9-28216a197d19');assert.equal(rules.sha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');
 const gatesState=await gates(request,{pilotoHabilitado:true});
 const live=await request('firebasehosting.googleapis.com',base+'/channels/live'),pilot=await request('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv');
 const auth=await request('identitytoolkit.googleapis.com','/admin/v2/projects/'+P+'/config');assert.ok(auth.authorizedDomains.includes(new URL(live.url).hostname));assert.ok(auth.authorizedDomains.includes(new URL(pilot.url).hostname));
 return{request,r,all,rules,gatesState,live,pilot};
}
async function verifyFiles(request,version,url,manifest){
 const v=await request('firebasehosting.googleapis.com','/v1beta1/'+version);assert.equal(v.status,'FINALIZED');
 const listed=await request('firebasehosting.googleapis.com','/v1beta1/'+version+'/files?pageSize=1000');assert.equal(listed.nextPageToken,undefined);
 const reserved=['/__/firebase/init.js','/__/firebase/init.json'];
 const previousFiles=await request('firebasehosting.googleapis.com','/v1beta1/'+expectedPilot+'/files?pageSize=1000');
 const generated=listed.files.filter(f=>reserved.includes(f.path));assert.equal(generated.length,2);
 for(const f of generated)assert.equal(f.hash,previousFiles.files.find(x=>x.path===f.path)?.hash,'CONFIG_FIREBASE_CAMBIO');
 assert.equal(listed.files.filter(f=>!reserved.includes(f.path)).length,manifest.files.length);
 const zlib=require('node:zlib');for(const f of manifest.files){const found=listed.files.find(x=>x.path==='/'+f.path.slice(8));assert.ok(found,'ARCHIVO_REMOTO_AUSENTE: '+f.path);assert.equal(found.hash,sha(zlib.gzipSync(fs.readFileSync(path.join(stage,f.path)),{level:9})),'HASH_REMOTO_DISTINTO: '+f.path);}
 for(const n of ['index.html','flutter_bootstrap.js','main.dart.js',manifest.mainVersionado]){const r=await fetch(url+'/'+n+'?verificar='+version.split('/').at(-1),{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),manifest.files.find(f=>f.path==='hosting/'+n).sha256,'HTTP_DISTINTO: '+n);}
}
async function preflight(){const c=await checks();assert.equal(c.live.release.version.name,expectedLive);assert.deepEqual(c.live,oldLive.live);assert.equal(c.pilot.release.version.name,expectedPilot);assert.equal(c.pilot.expireTime,previous.expira);const recover=await c.request('firebasehosting.googleapis.com','/v1beta1/'+expectedLive);assert.equal(recover.status,'FINALIZED');save('preflight.json',{fecha:new Date().toISOString(),live:c.live,pilot:c.pilot,versionLiveRecuperable:recover,functions:c.all.map(remote.observar),ruleset:c.rules.release.rulesetName,metadatos:c.gatesState});save('rollback.json',{versionName:expectedLive,endpoint:base+'/channels/live/releases?versionName='+expectedLive});console.log(JSON.stringify({preflight:'APTO',functions:23,reglasIguales:true,soloIglesiaPiloto:true,liveRecuperable:expectedLive}));}
async function publishPilot(alreadyPublished=false){
 const c=await checks(),m=JSON.parse(fs.readFileSync(path.join(stage,'manifest.json')));assert.equal(c.live.release.version.name,expectedLive);assert.equal(c.pilot.expireTime,m.expira);
 for(const f of m.files)assert.equal(sha(fs.readFileSync(path.join(stage,f.path))),f.sha256);for(const f of m.fuentesCompatibilidad)assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256);
 if(alreadyPublished){const created=fs.readFileSync(path.join(stage,'guardia-hosting.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(x=>x.versionCreada);assert.equal(created.length,1);assert.equal(c.pilot.release.version.name.replace(/^projects\/[^/]+\//,''),created[0].versionCreada);}else{
 assert.equal(c.pilot.release.version.name,expectedPilot);
 const cmd=JSON.parse(fs.readFileSync(path.join(stage,'comando.json'))),log=fs.openSync(path.join(stage,'publicacion-piloto.log'),'wx');const child=spawnSync(cmd.programa,cmd.args,{cwd:stage,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);assert.equal(child.status,0,'CLI_'+child.status);}
 const after=await checks();assert.deepEqual(after.live,c.live);assert.equal(after.pilot.expireTime,c.pilot.expireTime);assert.notEqual(after.pilot.release.version.name,expectedPilot);await verifyFiles(c.request,after.pilot.release.version.name,after.pilot.url,m);
 save('piloto-publicado.json',{fecha:new Date().toISOString(),url:after.pilot.url,version:after.pilot.release.version.name,mainVersionado:m.mainVersionado,expira:after.pilot.expireTime,liveIntacto:true});console.log(JSON.stringify({piloto:after.pilot.url,version:after.pilot.release.version.name,liveIntacto:true}));
}
async function promote(){
 const c=await checks(),pilot=JSON.parse(fs.readFileSync(path.join(stage,'piloto-publicado.json'))),m=JSON.parse(fs.readFileSync(path.join(stage,'manifest.json')));assert.equal(c.live.release.version.name,expectedLive);assert.equal(c.pilot.release.version.name,pilot.version);assert.equal(JSON.parse(fs.readFileSync(path.join(stage,'arranque-piloto.json'))).loginGoogleVisible,true);
 const recovery=await c.request('firebasehosting.googleapis.com','/v1beta1/'+expectedLive);assert.equal(recovery.status,'FINALIZED');await verifyFiles(c.request,pilot.version,pilot.url,m);
 const versionName=pilot.version;assert.match(versionName,new RegExp('^projects/'+P+'/sites/'+P+'/versions/[a-z0-9]+$'));
 // Ãšnica mutaciÃ³n remota: release Hosting live de una versiÃ³n ya finalizada.
 const release=await c.request('firebasehosting.googleapis.com',base+'/channels/live/releases?versionName='+versionName,{body:{message:'Cliente Finanzas V1 operativo y compatibilidad legacy validada. Misma version del piloto.'}});save('release-live.json',release);
 try {
   const after=await checks();assert.equal(after.live.release.version.name,versionName);assert.equal(after.pilot.release.version.name,versionName);await verifyFiles(c.request,versionName,after.live.url,m);
   save('live-publicado.json',{fecha:new Date().toISOString(),url:after.live.url,version:versionName,release:after.live.release.name,mainVersionado:m.mainVersionado,pilotoMismoPaquete:true,functions23Intactas:true,rulesetSinCambios:true,soloIglesiaPiloto:true,metadatos:after.gatesState,versionReversion:expectedLive});console.log(JSON.stringify({publicado:true,url:after.live.url,version:versionName,functionsIntactas:23,soloIglesiaPiloto:true}));
 }catch(error){await rollback();throw error;}
}
async function rollback(){const request=await sesion(),pilot=JSON.parse(fs.readFileSync(path.join(stage,'piloto-publicado.json'))),live=await request('firebasehosting.googleapis.com',base+'/channels/live');assert.ok([pilot.version,expectedLive].includes(live.release.version.name));const release=await request('firebasehosting.googleapis.com',base+'/channels/live/releases?versionName='+expectedLive,{body:{message:'Reversion de Hosting por comprobacion critica del cliente.'}});assert.equal((await request('firebasehosting.googleapis.com',base+'/channels/live')).release.version.name,expectedLive);save('reversion-ejecutada.json',{fecha:new Date().toISOString(),version:expectedLive,release});console.log('HOSTING_LIVE_RESTAURADO');}
(async()=>{const action=process.argv[2];if(action==='package')return packageClient();assert.ok(['preflight','pilot','verify-pilot','promote','rollback'].includes(action));await({preflight,pilot:publishPilot,'verify-pilot':()=>publishPilot(true),promote,rollback}[action])();})().catch(e=>{console.error('PUBLICACION_LIVE_DETENIDA: '+e.message);process.exitCode=1;});

