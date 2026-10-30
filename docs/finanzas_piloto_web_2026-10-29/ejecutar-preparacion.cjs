'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sesion,P,I}=require('./sesion.cjs'),rest=require('./rest-transacciones.cjs'),owner=require('./preparacion-titular.cjs'),book=require('./preparacion-libro.cjs');
const common=require('../finanzas_reglas_controladas_2026-10-29/remoto.cjs'),c=require('../../functions/finanzas_v1/comun');
const base=path.resolve(__dirname,'../..'),privateDir=path.join(base,'migrate_working_dir/finanzas_titular_8iyv_2026-10-29');
const outcome={proyecto:P,iglesia:I,activado:false,at:new Date().toISOString()};
const save=()=>fs.writeFileSync(path.join(__dirname,'resultado-preparacion.json'),JSON.stringify(outcome,null,2)+'\n');
function backup(name,payload){const text=JSON.stringify({payload,sha256:c.hash(payload)},null,2)+'\n';for(const suffix of ['.json','.copia.json']){const f=path.join(privateDir,name+suffix),fd=fs.openSync(f,'wx',0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}assert.equal(fs.readFileSync(f,'utf8'),text);}}
async function main(){
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FUNCTIONS_EMULATOR&&!process.env.GOOGLE_APPLICATION_CREDENTIALS,'ENTORNO_REAL_CRUZADO');
const logBytes=fs.readFileSync(path.join(__dirname,'preparacion-local-2.log'));const log=logBytes[0]===255?logBytes.toString('utf16le'):logBytes.toString('utf8');assert.match(log,/ℹ pass 8/);assert.match(log,/ℹ fail 0/);
const request=await sesion(),remote=await common.conectar(),beforeFunctions=(await remote.listar()).map(common.observar);
const original=JSON.parse(fs.readFileSync(path.join(privateDir,'seleccion-respaldo.json')));assert.equal(original.proyecto,P);assert.equal(original.iglesia,I);const uid=original.uid;
const root='/v1/projects/'+P+'/databases/(default)/documents',started=Date.now();
const backend=async()=>{const rules=await remote.reglas();assert.equal(rules.release.rulesetName,'projects/'+P+'/rulesets/a8314ca6-cb38-49f1-81c9-28216a197d19');assert.equal(rules.sha256,'16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a');const all=(await remote.listar()).map(common.observar);assert.deepEqual(all,beforeFunctions);assert.ok(all.filter(f=>f.nombre==='finanzasV1Consultar'||f.nombre==='finanzasV1Ejecutar').every(f=>f.finanzas.FINANZAS_V1_SERVIDOR_HABILITADO==='false'));};
const guardas=async actor=>{assert.equal(actor,uid);assert.ok(Date.now()-started<10*60*1000,'PREPARACION_VENCIDA');await backend();const a=await request('identitytoolkit.googleapis.com','/v1/projects/'+P+'/accounts:lookup?fields=users(localId,disabled)',{body:{localId:[uid]}});assert.ok(a.users?.length===1&&a.users[0].localId===uid&&!a.users[0].disabled,'AUTH_NO_VIGENTE');};
const transport=(route,opts)=>{assert.ok(route.startsWith(root),'PROYECTO_FUERA_DE_ALCANCE');return request('firestore.googleapis.com',route,opts);};
let selected;
const migrationPolicy=(action,p,d)=>{if(action==='update'){assert.equal(p,'usuarios_globales/'+uid);assert.deepEqual(Object.keys(d),['pertenenciaId']);assert.match(d.pertenenciaId,/^[a-f0-9]{64}$/);}else{assert.equal(p,'migraciones_pertenencia/'+uid);assert.deepEqual(Object.keys(d).sort(),['fechaCreacion','iglesiaId','origen','pertenenciaId','version','versionPerfilAnterior']);assert.equal(d.fechaCreacion,rest.TS);assert.equal(d.version,1);assert.equal(d.origen,'migracion_pertenencia_v1');assert.equal(d.iglesiaId,I);assert.equal(d.versionPerfilAnterior,selected.version);}};
let db=rest.crear({proyecto:P,iglesia:I,uid,request:transport,validarEscritura:migrationPolicy,antesCommit:()=>guardas(uid)});
const p=await db.get(db.doc('usuarios_globales/'+uid)),i=await db.get(db.doc(book.B)),receipt=await db.get(db.doc('migraciones_pertenencia/'+uid));
assert.ok(p.exists&&i.exists);assert.equal(i.data().adminUid,uid);assert.equal(p.data().iglesiaId,I);assert.equal(p.data().rolGlobal,'admin_iglesia');assert.ok(!Object.hasOwn(p.data(),'pertenenciaId')&&!receipt.exists,'ID_O_COMPROBANTE_PREVIO');
selected={uid,iglesiaId:I,version:owner.version(p)};const churchVersion=owner.version(i);
await db.runTransaction(async tx=>{await tx.get(db.doc(book.B));await tx.get(db.doc('usuarios_globales/'+uid));for(const name of book.names)assert.equal((await tx.existsIn(name)).length,0,'DATOS_FINANCIEROS_PREVIOS');});
const periodo=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago',year:'numeric',month:'2-digit'}).format(new Date());
backup('antes-preparacion-real',{proyecto:P,iglesia:I,uid,seleccion:selected,versionIglesia:churchVersion,perfil:p.data(),iglesiaDatos:i.data(),comprobanteAusente:true,libroVacio:true,periodo,venceMs:started+10*60*1000,codigoSha:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')});
fs.writeFileSync(path.join(__dirname,'login-confirmado.json'),JSON.stringify({confirmadoPorUsuario:true,metodo:'Google',dashboardVisible:true,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
const migrated=await owner.aplicar({db,FieldValue:{serverTimestamp:()=>rest.TS},seleccion:selected,versionIglesia:churchVersion,guardas});
const afterOwner=await db.get(db.doc('usuarios_globales/'+uid)),afterReceipt=await db.get(db.doc('migraciones_pertenencia/'+uid));
assert.ok(afterOwner.exists&&afterReceipt.exists,'MIGRACION_NO_CONFIRMADA');const id=afterOwner.data().pertenenciaId;assert.match(id,/^[a-f0-9]{64}$/);assert.equal(afterReceipt.data().pertenenciaId,id);assert.equal(afterReceipt.data().versionPerfilAnterior,selected.version);assert.equal(afterReceipt.data().origen,'migracion_pertenencia_v1');assert.deepEqual(afterOwner.data(),{...p.data(),pertenenciaId:id});
backup('despues-titular',{perfil:afterOwner.data(),version:afterOwner.versionISO,comprobante:afterReceipt.data(),comprobanteVersion:afterReceipt.versionISO,motor:migrated});
outcome.titular={pertenencia:'PREPARADA_Y_VERIFICADA',iglesiaYRolConservados:true,comprobanteServidor:true,motor:migrated.categoria};save();
const plan=book.plan(periodo,uid,id);const write=(action,p,d)=>{if(action==='update'){assert.equal(p,book.B+'/finanzas_control/protocolo');assert.deepEqual(d,{epoca:2,estado:'bloqueado'});return;}
if(Object.hasOwn(plan,p)){assert.deepEqual(d,plan[p]);return;}
if(p===book.B+'/finanzas_control/incremental_v1'){c.verificar(d,plan[book.B+'/finanzas_control/libro'],I);assert.equal(d.proyeccion.periodo.periodoId,periodo);assert.deepEqual(d.cuentas,{});assert.deepEqual(d.aperturas,{});assert.equal(d.verificacionInicial.certificacionHistorica,false);return;}
assert.equal(p,book.B+'/finanzas_auditoria/inicio_incremental_v1_0');assert.equal(d.evento,'inicializacion_incremental_v1');assert.equal(d.iglesiaId,I);assert.equal(d.titularUid,uid);assert.equal(d.corte,0);assert.equal(d.certificacionHistorica,false);assert.equal(d.fechaCreacion,rest.TS);};
db=rest.crear({proyecto:P,iglesia:I,uid,request:transport,validarEscritura:write,antesCommit:()=>guardas(uid)});
const options={db,uid,pertenenciaId:id,periodo,guardas};outcome.preparacion=await book.preparar(options);backup('libro-preparado',{resultado:outcome.preparacion,commit:db.ultimoCommit});save();
outcome.inicializacion=await book.inicializar(options);backup('libro-inicializado',{resultado:outcome.inicializacion,commit:db.ultimoCommit});save();
const final={};for(const name of ['finanzas_control/protocolo','finanzas_control/libro','finanzas_control/periodo','finanzas_control/incremental_v1','finanzas_control/publicacion_v1','finanzas_config/acceso','finanzas_config/contabilidad','finanzas_resumenes/'+periodo]){const s=await db.get(db.doc(book.B+'/'+name));assert.ok(s.exists);final[name]={version:s.versionISO,data:s.data()};}
const control=final['finanzas_control/libro'].data,inc=final['finanzas_control/incremental_v1'].data;c.verificar(inc,control,I);assert.equal(final['finanzas_control/protocolo'].data.estado,'bloqueado');assert.equal(final['finanzas_config/acceso'].data.moduloHabilitado,false);assert.equal(final['finanzas_control/publicacion_v1'].data.habilitado,false);assert.deepEqual(final['finanzas_resumenes/'+periodo].data.datos,c.resumen(inc));
await db.runTransaction(async tx=>{assert.equal((await tx.existsIn('finanzas_movimientos')).length,0);assert.equal((await tx.existsIn('finanzas_auditoria')).length,2);});
await backend();backup('verificacion-final',{documentos:final});outcome.libro={nuevo:true,verificado:true,periodo,epoca:2,protocolo:'bloqueado',corte:0,movimientos:0,acceso:false,gate:false,certificacionHistorica:false};outcome.finanzasServidorApagado=true;outcome.functionsIntactas=23;outcome.completa=true;save();console.log(JSON.stringify(outcome));
}
main().catch(e=>{outcome.completa=false;outcome.detencion=e.message;save();console.error('PREPARACION_DETENIDA: '+e.message);process.exitCode=1;});
