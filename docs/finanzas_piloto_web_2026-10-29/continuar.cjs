'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {sesion,P}=require('./sesion.cjs');
(async()=>{require('../finanzas_web_despliegue_apagado_2026-10-29/verificar.cjs');const r=await sesion(),base='/v1beta1/projects/'+P+'/sites/'+P;
const live=await r('firebasehosting.googleapis.com',base+'/channels/live'),previous=JSON.parse(fs.readFileSync(path.join(__dirname,'antes.json')));assert.deepEqual(live,previous.live);
const channel=await r('firebasehosting.googleapis.com',base+'/channels/finanzas-piloto-8iyv');assert.ok(!channel.release,'Canal ya publicado por otro proceso');
const command=JSON.parse(fs.readFileSync(path.join(__dirname,'comando.json'))),log=fs.openSync(path.join(__dirname,'hosting-2.log'),'wx');const child=spawnSync(command.programa,command.args,{cwd:__dirname,env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true'},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);fs.writeFileSync(path.join(__dirname,'salida-hosting-2.json'),JSON.stringify({status:child.status,error:child.error?.message??null},null,2)+'\n',{flag:'wx'});console.log('HOSTING_CLI: '+child.status);process.exitCode=child.status===0?0:1;
})().catch(e=>{console.error('DETENIDO: '+e.message);process.exitCode=1;});
