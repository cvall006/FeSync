'use strict';
const assert=require('node:assert/strict');
const {crearProyeccionInicial}=require('../../functions/finanzas_core/proyecciones');
const {conciliarPaginas}=require('../../functions/finanzas_core/conciliacion');
const c=require('../../functions/finanzas_v1/comun');
const {TS}=require('./rest-transacciones.cjs');
const I='8IYVbD8z9U3noEYzkpUZ',B='iglesias/'+I;
const CONFIG={moneda:'CLP',escala:0,zonaHoraria:'America/Santiago'};
const names=['control','config','cuentas','categorias','movimientos','saldos','resumenes','aperturas','reversiones','cierres','reservas_cuentas','reservas_categorias','auditoria','elegibilidad'].map(n=>'finanzas_'+n);
const path=r=>B+'/'+r;
function plan(periodo,uid,pertenenciaId){
const proyeccion=crearProyeccionInicial({iglesiaId:I,configuracion:CONFIG,periodoId:periodo});
return{
 [path('finanzas_config/contabilidad')]:{versionEsquema:1,iglesiaId:I,...CONFIG},
 [path('finanzas_config/acceso')]:{moduloHabilitado:false,encargadoUid:null,fechaCreacion:TS,fechaActualizacion:TS},
 [path('finanzas_control/publicacion_v1')]:{versionEsquema:1,iglesiaId:I,circuito:'v1_incremental',habilitado:false},
 [path('finanzas_control/protocolo')]:{versionProtocolo:1,iglesiaId:I,epoca:1,estado:'bloqueado'},
 [path('finanzas_control/libro')]:{versionEsquema:1,iglesiaId:I,ultimaSecuencia:0,huboMovimientos:false},
 [path('finanzas_control/periodo')]:{versionEsquema:1,iglesiaId:I,periodosAbiertos:[periodo]},
 [path('finanzas_resumenes/'+periodo)]:{versionEsquema:1,iglesiaId:I,periodoId:periodo,ultimaSecuencia:0,datos:c.resumen({proyeccion,cuentas:{}}),fechaActualizacion:TS},
 [path('finanzas_auditoria/preparacion_piloto_v1')]:{evento:'preparacion_administrativa_piloto_v1',iglesiaId:I,titularUid:uid,pertenenciaId,periodoId:periodo,ejecutor:'sesion_cli_autorizada',certificacionHistorica:false,fechaCreacion:TS}
};}
async function titular(tx,db,uid,pertenenciaId){const i=await tx.get(db.doc(B)),p=await tx.get(db.doc('usuarios_globales/'+uid));assert.ok(i.exists&&p.exists);assert.equal(i.data().adminUid,uid);assert.deepEqual(p.data(),{iglesiaId:I,rolGlobal:'admin_iglesia',pertenenciaId});}
async function vacio(tx,permitidas=[]){const allowed=new Set(permitidas);for(const n of names)for(const p of await tx.existsIn(n))assert.ok(allowed.has(p),'DOCUMENTO_PREVIO_O_AJENO: '+n);}
async function preparar({db,uid,pertenenciaId,periodo,guardas}){
const docs=plan(periodo,uid,pertenenciaId);
await db.runTransaction(async tx=>{await guardas(uid);await titular(tx,db,uid,pertenenciaId);await vacio(tx);for(const [p,d]of Object.entries(docs))tx.create(db.doc(p),d);});
return{estado:'PREPARADA_SIN_MOVIMIENTOS',periodo,protocolo:'bloqueado',documentosCreados:Object.keys(docs)};
}
async function inicializar({db,uid,pertenenciaId,periodo,guardas}){
const expected=plan(periodo,uid,pertenenciaId);
return db.runTransaction(async tx=>{
await guardas(uid);await titular(tx,db,uid,pertenenciaId);await vacio(tx,Object.keys(expected));
const docs={};for(const p of Object.keys(expected)){const s=await tx.get(db.doc(p));assert.ok(s.exists,'PREPARACION_INCOMPLETA');docs[p]=s;const filtered=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['fechaCreacion','fechaActualizacion'].includes(k)));assert.deepEqual(filtered(s.data()),filtered(expected[p]),'PREPARACION_CAMBIADA');}
const control=docs[path('finanzas_control/libro')],protocolo=docs[path('finanzas_control/protocolo')];
c.protocolo(protocolo.data(),I,true);
const observation={version:c.ver(control),datos:control.data()};
const r=conciliarPaginas({contexto:{iglesiaId:I,configuracion:CONFIG,cuentas:[],periodos:[periodo],controlInicial:observation,modoLectura:'PAUSA_EXTERNA_DECLARADA'},checkpoint:null,paginas:[],finDelListado:true,controlFinal:observation,proyecciones:{corte:{secuencia:0,versionControl:c.ver(control)},saldos:[],resumenes:[{periodoId:periodo,datos:docs[path('finanzas_resumenes/'+periodo)].data()}],marcadores:[]}});
assert.equal(r.reporte.estado,'SIN_DIFERENCIAS_OBSERVADAS');
const reporte={...r.reporte,aperturasCorrectas:true,incrementalCorrecto:true,pausaVerificadaPorAdaptador:true};
const value=c.sellar({versionEsquema:1,iglesiaId:I,epoca:2,estadoVerificacion:'VERIFICADA_INICIAL',proyeccion:crearProyeccionInicial({iglesiaId:I,configuracion:CONFIG,periodoId:periodo}),cuentas:{},aperturas:{},verificacionInicial:{corte:0,versionControl:c.ver(control),reporteDigest:c.hash(reporte),certificacionHistorica:false}});
c.verificar(value,control.data(),I);
tx.create(db.doc(path('finanzas_control/incremental_v1')),value);
tx.update(db.doc(path('finanzas_control/protocolo')),{epoca:2,estado:'bloqueado'});
tx.create(db.doc(path('finanzas_auditoria/inicio_incremental_v1_0')),{evento:'inicializacion_incremental_v1',iglesiaId:I,titularUid:uid,ejecutor:'sesion_cli_autorizada',corte:0,reporteDigest:value.verificacionInicial.reporteDigest,certificacionHistorica:false,fechaCreacion:TS});
return{estado:'VERIFICADA_INICIAL',periodo,epoca:2,protocolo:'bloqueado',corte:0,reporteDigest:value.verificacionInicial.reporteDigest,certificacionHistorica:false};
});}
module.exports={plan,preparar,inicializar,names,I,B};
