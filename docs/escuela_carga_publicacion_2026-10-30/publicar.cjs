'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),old=path.join(root,'docs/escuela_historial_publicacion_2026-10-30');
const {sesion,P,cli}=require('../finanzas_piloto_web_2026-10-29/sesion.cjs'),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs');
const base='/v1beta1/projects/'+P+'/sites/'+P,fn='escuelaCargarModulos',expected='projects/'+P+'/sites/'+P+'/versions/e8c5ec03728fbb5f';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n))),save=(n,d)=>fs.writeFileSync(path.join(__dirname,n),JSON.stringify(d,null,2)+'\n',{flag:'wx'});
async function state(){const request=await sesion(),r=await remote.conectar();return{request,functions:(await r.listar()).map(remote.observar),rules:await r.reglas(),live:await request('firebasehosting.googleapis.com',base+'/channels/live')};}
function sources(){
 const baseline=JSON.parse(fs.readFileSync(path.join(old,'fuentes.json')));
 for(const f of baseline)if(f.path!=='lib/modules/escuela/escuela_asignaciones_screen.dart')assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256,'FUENTE_AJENA_CAMBIO: '+f.path);
 return [...baseline.map(f=>f.path),'lib/modules/escuela/escuela_carga_masiva_service.dart','lib/modules/escuela/escuela_carga_masiva_screen.dart',
  'functions/index.js','functions/escuela_carga_masiva.js','functions/package.json','functions/package-lock.json'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))}));
}
function checkSources(){assert.deepEqual(sources(),read('fuentes.json'));}
async function preflight(){
 const s=await state();assert.equal(s.functions.length,23);assert.ok(s.functions.every(f=>f.estado==='ACTIVE'&&f.nombre!==fn));
 assert.deepEqual(s.functions,JSON.parse(fs.readFileSync(path.join(old,'antes.json'))).functions,'FUNCTIONS_CAMBIARON');
 assert.equal(s.rules.release.rulesetName,JSON.parse(fs.readFileSync(path.join(old,'web-publicado.json'))).ruleset);
 assert.equal(s.rules.sha256,sha(fs.readFileSync(path.join(root,'firestore.rules'))));
 assert.equal(s.live.release.version.name,expected);
 const recover=await s.request('firebasehosting.googleapis.com','/v1beta1/'+expected);assert.equal(recover.status,'FINALIZED');
 save('antes.json',{fecha:new Date().toISOString(),live:s.live,rules:s.rules,functions:s.functions,recuperable:recover});save('fuentes.json',sources());
 const pkg=path.join(__dirname,'paquete');fs.mkdirSync(pkg);
 for(const name of ['escuela_carga_masiva.js','package.json','package-lock.json'])fs.copyFileSync(path.join(root,'functions',name),path.join(pkg,name));
 fs.writeFileSync(path.join(pkg,'index.js'),"'use strict';\nconst {initializeApp}=require('firebase-admin/app');\nconst {getFirestore,Timestamp}=require('firebase-admin/firestore');\nconst {onCall,HttpsError}=require('firebase-functions/v2/https');\ninitializeApp();\nexports.escuelaCargarModulos=onCall({region:'southamerica-west1',memory:'256MiB',timeoutSeconds:120},request=>require('./escuela_carga_masiva').escuelaCargarModulos(request,{db:getFirestore(),HttpsError,ahora:()=>Timestamp.now()}));\n",{flag:'wx'});
 save('paquete-fuentes.json',fs.readdirSync(pkg).map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(pkg,p)))})));
 save('firebase.functions.json',{functions:{source:'paquete',ignore:['node_modules','.git','firebase-debug.log','firebase-debug.*.log']}});
 fs.writeFileSync(path.join(__dirname,'guardia-hosting.cjs'),fs.readFileSync(path.join(old,'guardia-hosting.cjs'),'utf8').replaceAll('006c1af2a69d68d9','e8c5ec03728fbb5f'),{flag:'wx'});
 fs.copyFileSync(path.join(old,'firebase.hosting.json'),path.join(__dirname,'firebase.hosting.json'));
 fs.copyFileSync(path.join(old,'comprobar-arranque.cjs'),path.join(__dirname,'comprobar-arranque.cjs'));
 fs.copyFileSync(path.join(old,'revertir.cjs'),path.join(__dirname,'revertir.cjs'));
 console.log(JSON.stringify({preflight:'APTO',functionsIntactas:23,versionRecuperable:expected,reglasSinCambios:true,fuentes:sources().length}));
}
function cliRun(label,config,only,guard){
 const log=fs.openSync(path.join(__dirname,label+'.log'),'wx');
 const child=spawnSync(process.execPath,['--require',path.join(__dirname,guard),path.join(cli,'bin/firebase.js'),'deploy','--project',P,'--config',path.join(__dirname,config),'--only',only,'--non-interactive'],{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});
 fs.closeSync(log);assert.equal(child.status,0,'CLI_'+label+'_'+child.status);
}
async function verifyState(){
 const s=await state(),b=read('antes.json');assert.deepEqual(s.functions.filter(f=>f.nombre!==fn),b.functions,'FUNCTIONS_EXISTENTES_CAMBIARON');
 assert.equal(s.rules.release.rulesetName,b.rules.release.rulesetName);assert.equal(s.rules.sha256,b.rules.sha256);return s;
}
async function functions(){
 checkSources();let s=await verifyState();assert.equal(s.functions.length,23);assert.equal(s.live.release.version.name,expected);
 for(const f of read('paquete-fuentes.json'))assert.equal(sha(fs.readFileSync(path.join(__dirname,'paquete',f.path))),f.sha256);
 cliRun('deploy-function-'+Date.now(),'firebase.functions.json','functions:'+fn,'guardia-functions.cjs');
 s=await verifyState();assert.equal(s.functions.length,24);const f=s.functions.find(f=>f.nombre===fn);assert.equal(f.estado,'ACTIVE');
 assert.equal(s.live.release.version.name,expected);save('function-publicada.json',{fecha:new Date().toISOString(),function:f});console.log(JSON.stringify({functionCreada:f.nombre,revision:f.revision,anterioresIntactas:23}));
}
function packageClient(){
 checkSources();const build=path.join(root,'build/escuela_carga_publicable'),dest=path.join(__dirname,'hosting');assert.ok(!fs.existsSync(dest));fs.mkdirSync(dest);
 const previous=JSON.parse(fs.readFileSync(path.join(old,'manifest.json'))),paths=previous.files.filter(f=>f.path!=='hosting/'+previous.mainVersionado).map(f=>f.path);
 for(const p of paths){const out=path.join(__dirname,p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(build,p.slice(8)),out);}
 const main=fs.readFileSync(path.join(dest,'main.dart.js')),hash=sha(main),name='main.escuela-'+hash.slice(0,16)+'.dart.js';fs.writeFileSync(path.join(dest,name),main,{flag:'wx'});paths.push('hosting/'+name);
 const bp=path.join(dest,'flutter_bootstrap.js'),bs=fs.readFileSync(bp,'utf8');assert.equal(bs.split('"mainJsPath":"main.dart.js"').length,2);fs.writeFileSync(bp,bs.replace('"mainJsPath":"main.dart.js"','"mainJsPath":"'+name+'"'));
 const ip=path.join(dest,'index.html'),html=fs.readFileSync(ip,'utf8');assert.equal(html.split('src="flutter_bootstrap.js"').length,2);fs.writeFileSync(ip,html.replace('src="flutter_bootstrap.js"','src="flutter_bootstrap.js?fesyncBuild='+hash.slice(0,16)+'"'));
 save('manifest.json',{proyecto:P,mainVersionado:name,config:previous.config,files:paths.map(p=>{const b=fs.readFileSync(path.join(__dirname,p));return{path:p,sha256:sha(b),gzipSha256:sha(zlib.gzipSync(b,{level:9})),bytes:b.length};})});
 console.log(JSON.stringify({paquete:'preparado',mainVersionado:name,archivos:paths.length}));
}
async function hosting(){
 checkSources();const s=await verifyState();assert.equal(s.functions.length,24);assert.deepEqual(s.functions.find(f=>f.nombre===fn),read('function-publicada.json').function);
 assert.equal(s.live.release.version.name,expected);assert.equal((await s.request('firebasehosting.googleapis.com','/v1beta1/'+expected)).status,'FINALIZED');
 const m=read('manifest.json');for(const f of m.files)assert.equal(sha(fs.readFileSync(path.join(__dirname,f.path))),f.sha256);
 cliRun('deploy-hosting','firebase.hosting.json','hosting','guardia-hosting.cjs');
 const after=await verifyState();assert.deepEqual(after.functions,s.functions);assert.notEqual(after.live.release.version.name,expected);
 save('web-publicado.json',{fecha:new Date().toISOString(),url:after.live.url,version:after.live.release.version.name,release:after.live.release.name,mainVersionado:m.mainVersionado,ruleset:after.rules.release.rulesetName,reversion:expected,functionsAnterioresIntactas:23});
 await verifyFiles(after);console.log(JSON.stringify(read('web-publicado.json')));
}
async function verifyFiles(s){
 const m=read('manifest.json'),v=s.live.release.version.name;
 const files=await s.request('firebasehosting.googleapis.com','/v1beta1/'+v+'/files?pageSize=1000');assert.ok(!files.nextPageToken);assert.equal(files.files.length,m.files.length+2);
 for(const f of m.files)assert.equal(files.files.find(x=>x.path==='/'+f.path.slice(8))?.hash,f.gzipSha256,'HASH_REMOTO: '+f.path);
 for(const p of ['index.html','flutter_bootstrap.js',m.mainVersionado]){const r=await fetch(s.live.url+'/'+p+'?verificar='+v.split('/').at(-1),{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),m.files.find(f=>f.path==='hosting/'+p).sha256);}
}
(async()=>{const a=process.argv[2];assert.ok(['preflight','functions','package','hosting','verify'].includes(a));await({preflight,functions,package:packageClient,hosting,verify:async()=>verifyFiles(await verifyState())}[a])();})().catch(e=>{console.error('PUBLICACION_DETENIDA: '+e.message);process.exitCode=1;});
