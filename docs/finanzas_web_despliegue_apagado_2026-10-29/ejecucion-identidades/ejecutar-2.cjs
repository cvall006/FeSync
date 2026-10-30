'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {P,N,cli,conectar,observar}=require('../ejecucion-iam-acotado/remoto.cjs');
const guardar=(name,data)=>fs.writeFileSync(path.join(__dirname,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const base=path.resolve(__dirname,'..'),stage=path.join(base,'paquete');
async function main(){
 require('../verificar.cjs');
 const m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'ejecucion-iam-acotado/auth-local.json'))).checks.length,10);
 const remote=await conectar(),all=await remote.listar(),before=all.map(observar);
 const historic=JSON.parse(fs.readFileSync(path.resolve(base,'../firebase_preflight_2026-10-28/resultado-remoto.json')));
 assert.equal(before.length,13);
 assert.deepEqual(before.map(f=>f.name).sort(),historic.functions.map(f=>f.name).sort());
 assert.ok(before.every(f=>f.estado==='ACTIVE'&&f.name.includes('/locations/southamerica-west1/')));
 assert.ok(m.plan.crear.every(n=>!before.some(f=>f.nombre===n)),'Alguna nueva ya existe');
 const previous=JSON.parse(fs.readFileSync(path.join(base,'ejecucion-functions-nuevas/resultado.json')));
 for(const f of before){const old=previous.antes.find(x=>x.name===f.name);assert.equal(f.revision,old.revision,'Revision anterior cambio');assert.equal(f.actualizacion,old.updateTime,'Fecha anterior cambio');}
 const apis=[];
 for(const api of ['cloudfunctions.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','run.googleapis.com','eventarc.googleapis.com','pubsub.googleapis.com','storage.googleapis.com']){const d=await remote.get('serviceusage.googleapis.com','/v1/projects/'+N+'/services/'+api);assert.equal(d.state,'ENABLED',api);apis.push(api);}
 const identities=JSON.parse(fs.readFileSync(path.join(__dirname,'resultado-identidades.json')));assert.ok(identities.aptoContinuar&&identities.iamDespuesVerificado);
 const repo=await remote.get('artifactregistry.googleapis.com','/v1/projects/'+P+'/locations/southamerica-west1/repositories/gcf-artifacts');
 guardar('preflight-2.json',{proyecto:P,paquete:m.digest,antes:before,nuevasAusentes:m.plan.crear,apisHabilitadas:apis,identidadesExistentes:true,politicaCleanupExistente:!!Object.keys(repo.cleanupPolicies||{}).length,at:new Date().toISOString()});
 console.log('PREFLIGHT_OK: 13 existentes intactas; diez ausentes; APIs y agentes existentes; flags false.');
 // No utiliza los selectores de actualización del manifiesto.
 const args=['--require',path.join(__dirname,'guardia-cli.cjs'),path.join(cli,'bin/firebase.js'),'deploy','--project',P,'--config',path.join(stage,'firebase.json'),'--only',m.plan.crear.map(n=>'functions:'+n).join(','),'--non-interactive'];
 guardar('comando-2.json',{programa:process.execPath,args});
 const log=fs.openSync(path.join(__dirname,'deploy-2.log'),'wx');
 const child=spawnSync(process.execPath,args,{cwd:stage,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 guardar('salida-cli-2.json',{status:child.status,signal:child.signal,error:child.error?.message??null,at:new Date().toISOString()});
 console.log('CLI_FINALIZADO: '+child.status+'; revisar estado remoto antes de cualquier otra accion.');
 process.exitCode=child.status===0?0:1;
}
main().catch(e=>{guardar('detencion-2.json',{error:e.message,at:new Date().toISOString()});console.error('DETENIDO: '+e.message);process.exitCode=1;});
