'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {sesion,P,cli}=require('./sesion.cjs');
const common=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs');
async function main(){
require('../finanzas_web_despliegue_apagado_2026-10-29/verificar.cjs');
const r=await common.conectar(),rules=await r.reglas();assert.equal(rules.release.rulesetName,'projects/'+P+'/rulesets/a8314ca6-cb38-49f1-81c9-28216a197d19');assert.equal(rules.sha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');
const funcs=(await r.listar()).map(common.observar),previous=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_reglas_controladas_2026-10-29/verificacion-final.json'))).functions;assert.deepEqual(funcs,previous);
const request=await sesion(),base='/v1beta1/projects/'+P+'/sites/'+P;
const live=await request('firebasehosting.googleapis.com',base+'/channels/live');assert.equal(live.release.version.name.split('/').pop(),'504bdb13ab09a0ac');
const channel=await request('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv',{missing:true});assert.equal(channel,null,'Canal ya existente: revisar antes de reemplazarlo');
const snapshot={ruleset:rules.release.rulesetName,functions:funcs,live,canalPrevio:channel,clienteHabilitado:false,servidorHabilitado:false};fs.writeFileSync(path.join(__dirname,'antes.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
const original=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../finanzas_web_despliegue_apagado_2026-10-29/paquete/firebase.json')));
original.hosting.public='../finanzas_web_despliegue_apagado_2026-10-29/paquete/hosting';fs.writeFileSync(path.join(__dirname,'firebase.hosting.json'),JSON.stringify({hosting:original.hosting},null,2)+'\n',{flag:'wx'});
const args=['--require',path.join(__dirname,'guardia-hosting.cjs'),path.join(cli,'bin/firebase.js'),'hosting:channel:deploy','finanzas-piloto-8iyv','--project',P,'--config',path.join(__dirname,'firebase.hosting.json'),'--expires','7d','--no-authorized-domains','--non-interactive'];
fs.writeFileSync(path.join(__dirname,'comando.json'),JSON.stringify({programa:process.execPath,args},null,2)+'\n',{flag:'wx'});
const log=fs.openSync(path.join(__dirname,'hosting.log'),'wx'),child=spawnSync(process.execPath,args,{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
fs.writeFileSync(path.join(__dirname,'salida-hosting.json'),JSON.stringify({status:child.status,error:child.error?.message??null},null,2)+'\n',{flag:'wx'});console.log('HOSTING_CLI: '+child.status);process.exitCode=child.status===0?0:1;
}
main().catch(e=>{fs.writeFileSync(path.join(__dirname,'detencion.json'),JSON.stringify({error:e.message},null,2)+'\n');console.error('DETENIDO: '+e.message);process.exitCode=1;});
