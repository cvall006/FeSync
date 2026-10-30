'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {conectar,observar,sha,cli}=require('./remoto.cjs');
function leerLog(name){const b=fs.readFileSync(path.join(__dirname,name));return b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8');}
async function main(){
 const approved=JSON.parse(fs.readFileSync(path.join(__dirname,'preflight.json')));assert.ok(approved.completo);
 assert.equal(sha(fs.readFileSync(path.join(__dirname,'candidato.rules'))),approved.candidatoSha256);
 assert.equal(sha(fs.readFileSync(path.join(__dirname,'respaldo-remoto.rules'))),approved.snapshotSha256);
 const tests=leerLog('reglas.log');
 assert.deepEqual([...tests.matchAll(/ℹ tests (\d+)/g)].slice(0,4).map(m=>Number(m[1])),[46,13,33,11]);
 assert.deepEqual([...tests.matchAll(/ℹ fail (\d+)/g)].slice(0,4).map(m=>Number(m[1])),[0,0,0,0]);
 const legacy=leerLog('reglas-legacy.log');assert.match(legacy,/ℹ pass 1/);assert.match(legacy,/ℹ fail 0/);
 const flow=JSON.parse(fs.readFileSync(path.join(__dirname,'flujo-legacy.json')));assert.ok(flow.altasSinPertenenciaId&&flow.salida&&flow.expulsion&&flow.roles);
 const r=await conectar(),current=await r.reglas();assert.equal(current.release.rulesetName,approved.release.rulesetName);assert.equal(current.sha256,approved.snapshotSha256);
 const functions=(await r.listar()).map(observar);assert.deepEqual(functions,approved.functions,'Cambio de Functions');
 fs.writeFileSync(path.join(__dirname,'antes-deploy.json'),JSON.stringify({reglas:current.release,functions,pruebas:104,compatibilidadLegacy:true},null,2)+'\n',{flag:'wx'});
 const args=['--require',path.join(__dirname,'guardia-cli.cjs'),path.join(cli,'bin/firebase.js'),'deploy','--project','fesync-app-2026','--config',path.join(__dirname,'firebase.candidato.json'),'--only','firestore:rules','--non-interactive'];
 fs.writeFileSync(path.join(__dirname,'comando.json'),JSON.stringify({programa:process.execPath,args},null,2)+'\n',{flag:'wx'});
 const log=fs.openSync(path.join(__dirname,'deploy.log'),'wx');const child=spawnSync(process.execPath,args,{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 fs.writeFileSync(path.join(__dirname,'salida-cli.json'),JSON.stringify({status:child.status,error:child.error?.message??null},null,2)+'\n',{flag:'wx'});console.log('CLI_FIRESTORE_FINALIZADO: '+child.status);process.exitCode=child.status===0?0:1;
}
main().catch(e=>{fs.writeFileSync(path.join(__dirname,'detencion.json'),JSON.stringify({error:e.message},null,2)+'\n');console.error('DETENIDO: '+e.message);process.exitCode=1;});
