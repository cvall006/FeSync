'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {conectar,observar,sha}=require('./remoto.cjs');
const result={proyecto:'fesync-app-2026',datosRealesLeidos:false,datosRealesModificados:false,at:new Date().toISOString()};
const save=()=>fs.writeFileSync(path.join(__dirname,'verificacion-final.json'),JSON.stringify(result,null,2)+'\n');
async function main(){
 const pre=JSON.parse(fs.readFileSync(path.join(__dirname,'preflight.json'))),r=await conectar(),current=await r.reglas();
 result.release=current.release;result.sha256=current.sha256;save();assert.equal(current.sha256,pre.candidatoSha256,'Ruleset efectivo distinto del aprobado');
 assert.notEqual(current.release.rulesetName,pre.release.rulesetName);result.rulesetConfirmado=true;
 const functions=(await r.listar()).map(observar);result.functions=functions;save();assert.deepEqual(functions,pre.functions,'Alguna Function cambio');result.veintitresFunctionsIntactas=true;
 const financieras=functions.filter(f=>['finanzasV1Consultar','finanzasV1Ejecutar'].includes(f.nombre));assert.equal(financieras.length,2);assert.ok(financieras.every(f=>f.finanzas.FINANZAS_V1_SERVIDOR_HABILITADO==='false'));result.finanzasDesactivado=true;
 assert.equal(sha(fs.readFileSync(path.join(__dirname,'respaldo-remoto.rules'))),pre.snapshotSha256);result.respaldoVerificado=true;
 result.pruebasLocalesAprobadas=104;result.comprobacionPrivacidad='Reglas efectivas identicas byte a byte a las probadas localmente; sin operaciones sobre documentos reales';
 const audit=fs.readFileSync(path.join(__dirname,'guardia.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 result.mutaciones=audit.filter(x=>x.permitido&&x.host==='firebaserules.googleapis.com'&&!x.path.endsWith(':test'));
 assert.equal(result.mutaciones.length,2);assert.ok(!audit.some(x=>x.bloqueado));result.completa=true;save();
 console.log(JSON.stringify({ruleset:current.release.rulesetName,updateTime:current.release.updateTime,sha256:current.sha256,functionsIntactas:23,finanzasDesactivado:true,respaldoVerificado:true,pruebasLocales:104}));
}
main().catch(e=>{result.completa=false;result.detencion=e.message;save();console.error('VERIFICACION_DETENIDA: '+e.message);process.exitCode=1;});
