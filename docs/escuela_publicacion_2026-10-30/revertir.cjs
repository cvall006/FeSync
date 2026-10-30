'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {sesion,P,cli}=require('../finanzas_piloto_web_2026-10-29/sesion.cjs'),remote=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const mode=process.argv[2];assert.ok(['hosting','reglas'].includes(mode));
 const before=JSON.parse(fs.readFileSync(path.join(__dirname,'antes.json'))),request=await sesion();
 if(mode==='hosting'){
  const base='/v1beta1/projects/'+P+'/sites/'+P,live=await request('firebasehosting.googleapis.com',base+'/channels/live');
  const made=fs.readFileSync(path.join(__dirname,'guardia-hosting.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(x=>x.versionCreada).map(x=>x.versionCreada);
  const normalize=s=>s.replace(/^projects\/[^/]+\//,'');
  assert.ok(live.release.version.name===before.live.release.version.name||made.includes(normalize(live.release.version.name)),'LIVE_AJENO_NO_REVERTIR');
  assert.equal((await request('firebasehosting.googleapis.com','/v1beta1/'+before.live.release.version.name)).status,'FINALIZED');
  await request('firebasehosting.googleapis.com',base+'/channels/live/releases?versionName='+before.live.release.version.name,{body:{message:'Reversion controlada de Escuela: restaurar cliente anterior.'}});
  assert.equal((await request('firebasehosting.googleapis.com',base+'/channels/live')).release.version.name,before.live.release.version.name);console.log('HOSTING_RESTAURADO');return;
 }
 const r=await remote.conectar(),current=await r.reglas();
 if(current.release.rulesetName===before.rules.release.rulesetName){console.log('REGLAS_ANTERIORES_VIGENTES');return;}
 const made=fs.readFileSync(path.join(__dirname,'guardia.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(x=>x.rulesetCreado).map(x=>x.rulesetCreado);
 assert.ok(made.includes(current.release.rulesetName),'RULESET_AJENO_NO_REVERTIR');
 const dest=path.join(__dirname,'reversion-reglas');fs.mkdirSync(dest,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'respaldo.rules'),path.join(dest,'respaldo.rules'));assert.equal(sha(fs.readFileSync(path.join(dest,'respaldo.rules'))),before.rules.sha256);
 fs.copyFileSync(path.join(__dirname,'guardia-cli.cjs'),path.join(dest,'guardia-cli.cjs'));
 fs.writeFileSync(path.join(dest,'preflight.json'),JSON.stringify({candidatoSha256:before.rules.sha256,release:current.release}));fs.writeFileSync(path.join(dest,'firebase.json'),JSON.stringify({firestore:{rules:'respaldo.rules'}}));
 const args=['--require',path.join(dest,'guardia-cli.cjs'),path.join(cli,'bin/firebase.js'),'deploy','--project',P,'--config',path.join(dest,'firebase.json'),'--only','firestore:rules','--non-interactive'];
 const log=fs.openSync(path.join(dest,'deploy.log'),'a'),child=spawnSync(process.execPath,args,{cwd:dest,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);assert.equal(child.status,0);assert.equal((await r.reglas()).sha256,before.rules.sha256);console.log('REGLAS_RESTAURADAS');
})().catch(e=>{console.error('REVERSION_DETENIDA: '+e.message);process.exitCode=1;});
