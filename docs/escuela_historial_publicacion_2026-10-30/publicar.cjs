'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),previous=path.join(root,'docs/finanzas_piloto_web_2026-10-29'),P='fesync-app-2026',base='/v1beta1/projects/'+P+'/sites/'+P;
const {sesion,cli}=require(path.join(previous,'sesion.cjs')),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs'),{gates}=require(path.join(previous,'activacion-preflight.cjs'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,p))),save=(p,x)=>fs.writeFileSync(path.join(__dirname,p),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const expectedLive='projects/'+P+'/sites/'+P+'/versions/006c1af2a69d68d9',expectedRules='projects/'+P+'/rulesets/b685784d-af0a-4e10-8d39-0fdbbb1d32d5';
function sources(){
 const base=path.join(root,'docs/escuela_borrado_publicacion_2026-10-30'),baseline=JSON.parse(fs.readFileSync(path.join(base,'fuentes.json'))),published=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 const changed=new Set(['lib/modules/escuela/escuela_screen.dart','lib/modules/escuela/escuela_asignaciones_models.dart','lib/modules/escuela/escuela_asignaciones_service.dart','lib/modules/escuela/escuela_asignaciones_screen.dart']);
 for(const f of baseline)if(!changed.has(f.path))assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256,'FUENTE_AJENA_CAMBIO: '+f.path);
 const added=['lib/modules/escuela/escuela_historial_service.dart','lib/modules/escuela/escuela_historial_screen.dart'];
 const all=[...baseline.map(f=>f.path),...added].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))}));
 const local=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),old=fs.readFileSync(path.join(base,'candidato.rules'),'utf8');
 const strip=s=>{const a=s.indexOf('      // Ciclos y asignaciones manuales.'),b=s.indexOf('      match /escuela_modulos/{moduloId}',a);assert.ok(a>=0&&b>a);return s.slice(0,a)+s.slice(b);};
 assert.equal(strip(local),strip(old),'REGLAS_AJENAS_CAMBIARON');return{all,local,old,published};
}
async function state(){const request=await sesion(),r=await remote.conectar(),all=await r.listar();assert.equal(all.length,23);assert.ok(all.every(f=>f.state==='ACTIVE'));const rules=await r.reglas(),live=await request('firebasehosting.googleapis.com',base+'/channels/live'),gate=await gates(request,{pilotoHabilitado:true});return{request,r,functions:all.map(remote.observar),rules,live,gate};}
async function preflight(){
 const s=sources(),c=await state();assert.equal(c.live.release.version.name,expectedLive);assert.equal(c.rules.release.rulesetName,expectedRules);assert.equal(c.rules.sha256,sha(s.old));
 const baseline=JSON.parse(fs.readFileSync(path.join(previous,'activo-live-compatible/preflight.json')));assert.deepEqual(c.functions,baseline.functions,'FUNCTIONS_CAMBIARON');
 const recover=await c.request('firebasehosting.googleapis.com','/v1beta1/'+expectedLive);assert.equal(recover.status,'FINALIZED');
 save('antes.json',{fecha:new Date().toISOString(),live:c.live,rules:c.rules,functions:c.functions,gate:c.gate,liveRecuperable:recover});
 fs.writeFileSync(path.join(__dirname,'respaldo.rules'),c.rules.rules.source.files[0].content,{flag:'wx'});fs.writeFileSync(path.join(__dirname,'candidato.rules'),s.local,{flag:'wx'});
 for(const f of s.all.filter(f=>f.path.startsWith('lib/modules/escuela/'))){const dest=path.join(__dirname,'fuentes',f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f.path),dest);}
 save('fuentes.json',s.all);save('preflight.json',{fecha:new Date().toISOString(),candidatoSha256:sha(s.local),release:c.rules.release,functions:c.functions,finanzasSinCambios:true,soloParcheEscuela:true});
 save('firebase.reglas.json',{firestore:{rules:'candidato.rules'}});fs.copyFileSync(path.join(root,'docs/finanzas_reglas_controladas_2026-10-29/guardia-cli.cjs'),path.join(__dirname,'guardia-cli.cjs'));
 console.log(JSON.stringify({preflight:'APTO',functionsIntactas:23,soloReglasEscuela:true,finanzasSoloPiloto:true,versionAnterior:expectedLive,fuentes:s.all.length}));
}
function packageClient(){
 const p=read('preflight.json');assert.equal(sha(fs.readFileSync(path.join(root,'firestore.rules'))),p.candidatoSha256);const s=sources();assert.deepEqual(s.all,read('fuentes.json'));
 const build=path.join(root,'build/escuela_historial_publicable'),dest=path.join(__dirname,'hosting');assert.ok(!fs.existsSync(dest));fs.mkdirSync(dest);
 const paths=s.published.files.filter(f=>f.path!=='hosting/'+s.published.mainVersionado).map(f=>f.path);
 for(const p of paths){const b=fs.readFileSync(path.join(build,p.slice(8))),out=path.join(__dirname,p);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,b,{flag:'wx'});}
 const main=fs.readFileSync(path.join(dest,'main.dart.js')),hash=sha(main),name='main.escuela-'+hash.slice(0,16)+'.dart.js';fs.writeFileSync(path.join(dest,name),main,{flag:'wx'});paths.push('hosting/'+name);
 const bp=path.join(dest,'flutter_bootstrap.js'),bs=fs.readFileSync(bp,'utf8');assert.equal(bs.split('"mainJsPath":"main.dart.js"').length,2);fs.writeFileSync(bp,bs.replace('"mainJsPath":"main.dart.js"','"mainJsPath":"'+name+'"'));
 const ip=path.join(dest,'index.html'),html=fs.readFileSync(ip,'utf8');assert.equal(html.split('src="flutter_bootstrap.js"').length,2);fs.writeFileSync(ip,html.replace('src="flutter_bootstrap.js"','src="flutter_bootstrap.js?fesyncBuild='+hash.slice(0,16)+'"'));
 save('manifest.json',{proyecto:P,mainVersionado:name,config:s.published.config,files:paths.map(p=>{const b=fs.readFileSync(path.join(__dirname,p));return{path:p,sha256:sha(b),gzipSha256:sha(zlib.gzipSync(b,{level:9})),bytes:b.length};})});
 fs.copyFileSync(path.join(previous,'activo-live-compatible/firebase.hosting.json'),path.join(__dirname,'firebase.hosting.json'));console.log(JSON.stringify({paquete:'preparado',mainVersionado:name,archivos:paths.length}));
}
async function deployRules(){
 const before=read('antes.json'),p=read('preflight.json'),c=await state();assert.equal(c.live.release.version.name,expectedLive);assert.equal(c.rules.release.rulesetName,expectedRules);assert.deepEqual(c.functions,before.functions);
 assert.equal(sha(fs.readFileSync(path.join(__dirname,'candidato.rules'))),p.candidatoSha256);assert.equal(sha(fs.readFileSync(path.join(root,'firestore.rules'))),p.candidatoSha256);
 assert.match(fs.readFileSync(path.join(__dirname,'pruebas-reglas.log'),'utf8'),/pass 32/);assert.match(fs.readFileSync(path.join(__dirname,'pruebas-flutter.log'),'utf8'),/All tests passed/);
 const args=['--require',path.join(__dirname,'guardia-cli.cjs'),path.join(cli,'bin/firebase.js'),'deploy','--project',P,'--config',path.join(__dirname,'firebase.reglas.json'),'--only','firestore:rules','--non-interactive'];
 const log=fs.openSync(path.join(__dirname,'deploy-reglas.log'),'wx'),child=spawnSync(process.execPath,args,{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);assert.equal(child.status,0,'CLI_REGLAS_'+child.status);
 const after=await state();assert.equal(after.rules.sha256,p.candidatoSha256);assert.deepEqual(after.functions,before.functions);assert.equal(after.live.release.version.name,expectedLive);
 save('reglas-publicadas.json',{fecha:new Date().toISOString(),ruleset:after.rules.release.rulesetName,sha256:after.rules.sha256});console.log(JSON.stringify({reglasPublicadas:true,ruleset:after.rules.release.rulesetName,functionsIntactas:23}));
}
async function verifyFiles(request,version,url){
 const m=read('manifest.json'),v=await request('firebasehosting.googleapis.com','/v1beta1/'+version);assert.equal(v.status,'FINALIZED');
 const files=await request('firebasehosting.googleapis.com','/v1beta1/'+version+'/files?pageSize=1000');assert.ok(!files.nextPageToken);
 const old=await request('firebasehosting.googleapis.com','/v1beta1/'+expectedLive+'/files?pageSize=1000'),reserved=['/__/firebase/init.js','/__/firebase/init.json'];assert.equal(files.files.length,m.files.length+2);
 for(const p of reserved)assert.equal(files.files.find(f=>f.path===p)?.hash,old.files.find(f=>f.path===p)?.hash);
 for(const f of m.files)assert.equal(files.files.find(x=>x.path==='/'+f.path.slice(8))?.hash,f.gzipSha256,'HASH_DISTINTO: '+f.path);
 for(const name of ['index.html','flutter_bootstrap.js','main.dart.js',m.mainVersionado]){const r=await fetch(url+'/'+name+'?verificar='+version.split('/').at(-1),{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),m.files.find(f=>f.path==='hosting/'+name).sha256,'HTTP_DISTINTO: '+name);}
}
async function deployHosting(){
 const before=read('antes.json'),m=read('manifest.json'),c=await state();assert.equal(c.live.release.version.name,expectedLive);assert.equal(c.rules.release.rulesetName,read('reglas-publicadas.json').ruleset);assert.deepEqual(c.functions,before.functions);
 for(const f of m.files)assert.equal(sha(fs.readFileSync(path.join(__dirname,f.path))),f.sha256);assert.deepEqual(sources().all,read('fuentes.json'));
 const recover=await c.request('firebasehosting.googleapis.com','/v1beta1/'+expectedLive);assert.equal(recover.status,'FINALIZED');
 const args=['--require',path.join(__dirname,'guardia-hosting.cjs'),path.join(cli,'bin/firebase.js'),'deploy','--project',P,'--config',path.join(__dirname,'firebase.hosting.json'),'--only','hosting','--non-interactive'];
 const log=fs.openSync(path.join(__dirname,'deploy-hosting.log'),'wx'),child=spawnSync(process.execPath,args,{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);assert.equal(child.status,0,'CLI_HOSTING_'+child.status);
 const after=await state();assert.notEqual(after.live.release.version.name,expectedLive);assert.equal(after.rules.release.rulesetName,read('reglas-publicadas.json').ruleset);assert.deepEqual(after.functions,before.functions);
 await verifyFiles(c.request,after.live.release.version.name,after.live.url);save('web-publicado.json',{fecha:new Date().toISOString(),url:after.live.url,version:after.live.release.version.name,release:after.live.release.name,mainVersionado:m.mainVersionado,ruleset:after.rules.release.rulesetName,functionsIntactas:23,finanzasSinCambios:true,reversion:expectedLive});console.log(JSON.stringify(read('web-publicado.json')));
}
(async()=>{const action=process.argv[2];assert.ok(['preflight','package','rules','hosting'].includes(action));await({preflight,package:packageClient,rules:deployRules,hosting:deployHosting}[action])();})().catch(e=>{console.error('PUBLICACION_ESCUELA_DETENIDA: '+e.message);process.exitCode=1;});
