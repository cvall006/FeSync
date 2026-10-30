'use strict';
const {exigir,registroExacto,periodoValido}=require('../finanzas_core/dinero');
const {crearProyeccionInicial}=require('../finanzas_core/proyecciones');
const {crearMantenimiento}=require('./mantenimiento');
const c=require('./comun'),o=require('./operativa');
const acciones=['preparar','pausar','verificar','inicializar','reanudar','cambiarPeriodo'];
function validar(s){
  registroExacto(s,['solicitudId','contexto','accion'],['periodoId']);
  exigir(Buffer.byteLength(c.canon(s))<=16384,'SOLICITUD_DEMASIADO_GRANDE');
  exigir(typeof s.solicitudId==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId),'SOLICITUD_ID_INVALIDA');
  exigir(acciones.includes(s.accion),'ACCION_INVALIDA');
  if(['preparar','cambiarPeriodo'].includes(s.accion))exigir(periodoValido(s.periodoId),'PERIODO_INVALIDO');
  else exigir(s.periodoId===undefined,'CAMPO_NO_ADMITIDO');
}
function dto(r){
  const reporte=r?.reporte??r;
  return {estado:r?.estado??'COMPLETADA',...(r?.epoca?{epoca:r.epoca}:{}),
    ...(Number.isSafeInteger(r?.corte)?{corte:r.corte}:{}),
    ...(reporte?.estado?{verificacion:reporte.estado}:{}),certificacionHistorica:false};
}
async function preparar(db,tx,iglesiaId,periodoId,FieldValue){
  const b=c.base(iglesiaId),ref=r=>db.doc(`${b}/${r}`);
  for(const ruta of ['finanzas_config/contabilidad','finanzas_control/protocolo','finanzas_control/libro',
    'finanzas_control/periodo','finanzas_control/incremental_v1'])exigir(!(await tx.get(ref(ruta))).exists,'LIBRO_YA_PREPARADO');
  for(const nombre of ['cuentas','categorias','movimientos','saldos','resumenes','aperturas','reversiones','cierres',
    'reservas_cuentas','reservas_categorias']){
    const q=await tx.get(db.collection(`${b}/finanzas_${nombre}`).limit(1));exigir(q.empty,'LIBRO_NO_VACIO');
  }
  const configuracion={moneda:'CLP',escala:0,zonaHoraria:'America/Santiago'};
  const proyeccion=crearProyeccionInicial({iglesiaId,configuracion,periodoId});
  tx.create(ref('finanzas_config/contabilidad'),{versionEsquema:1,iglesiaId,...configuracion});
  tx.create(ref('finanzas_control/protocolo'),{versionProtocolo:1,iglesiaId,epoca:1,estado:'bloqueado'});
  tx.create(ref('finanzas_control/libro'),{versionEsquema:1,iglesiaId,ultimaSecuencia:0,huboMovimientos:false});
  tx.create(ref('finanzas_control/periodo'),{versionEsquema:1,iglesiaId,periodosAbiertos:[periodoId]});
  tx.create(ref(`finanzas_resumenes/${periodoId}`),{versionEsquema:1,iglesiaId,periodoId,ultimaSecuencia:0,
    datos:c.resumen({proyeccion,cuentas:{}}),fechaActualizacion:FieldValue.serverTimestamp()});
  return {estado:'PREPARADA_SIN_MOVIMIENTOS',epoca:1,corte:0};
}
function siguienteMes(mes){const [a,m]=mes.split('-').map(Number);return m===12?`${String(a+1).padStart(4,'0')}-01`:`${String(a).padStart(4,'0')}-${String(m+1).padStart(2,'0')}`;}
function crearAdministracion({db,FieldValue,HttpsError}){
  return o.callable(HttpsError,async(uid,data)=>{
    const resolver=data?.accion==='resolverSolicitud';
    if(resolver)registroExacto(data,['accion','solicitud','descartar']);
    const s=resolver?data.solicitud:data;validar(s);
    if(resolver)exigir(typeof data.descartar==='boolean','ACCION_INVALIDA');
    const hash=c.hash(s),receiptRef=db.doc(`finanzas_mantenimiento/${uid}/solicitudes/${s.solicitudId}`),
      rejectRef=db.doc(`finanzas_mantenimiento_resoluciones/${uid}/solicitudes/${s.solicitudId}`);
    async function transaccion(fn){return db.runTransaction(async tx=>{
      const auth=await o.autorizar(db,tx,uid,s.contexto,'administrarConfiguracion');
      exigir(auth.iglesia.data().adminUid===uid,'CONTABILIDAD_NO_AUTORIZADA');
      const [recibo,rechazo]=await Promise.all([receiptRef,rejectRef].map(r=>tx.get(r)));
      if(recibo.exists){exigir(!rechazo.exists&&recibo.data().huella===hash,'SOLICITUD_ID_REUTILIZADA');
        return {estado:'CONFIRMADA',historica:true,resultado:recibo.data().resultado};}
      if(rechazo.exists){exigir(rechazo.data().huella===hash,'SOLICITUD_ID_REUTILIZADA');
        if(!resolver)exigir(false,'SOLICITUD_DESCARTADA');return {estado:'RECHAZADA',puedeCrearNueva:true};}
      const audit=db.doc(`${auth.b}/finanzas_auditoria/mantenimiento_${c.hash([uid,s.solicitudId])}`);
      if(resolver){
        if(!data.descartar)return {estado:'NO_CONFIRMADA',puedeCrearNueva:false};
        tx.create(rejectRef,{huella:hash,iglesiaId:auth.iglesiaId,estado:'rechazada',fechaCreacion:FieldValue.serverTimestamp()});
        tx.create(audit,{evento:'paso_mantenimiento_descartado_sin_commit',actorUid:uid,solicitudId:s.solicitudId,accion:s.accion,
          fechaCreacion:FieldValue.serverTimestamp()});
        return {estado:'RECHAZADA',puedeCrearNueva:true};
      }
      if(s.accion==='cambiarPeriodo'){
        const inc=await tx.get(db.doc(`${auth.b}/finanzas_control/incremental_v1`));
        exigir(inc.exists&&s.periodoId===siguienteMes(inc.data().proyeccion.periodo.periodoId),'MES_CONSECUTIVO_REQUERIDO');
        const res=await tx.get(db.collection(`${auth.b}/finanzas_resumenes`).limit(25));
        exigir(res.size<24,'LIMITE_MANTENIMIENTO_EXCEDIDO');
        const lectura={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:consulta=>consulta(tx)};
        const reporte=await crearMantenimiento({db:lectura,FieldValue,validarEntorno:c.entornoOperacion})
          .conciliar(uid,auth.iglesiaId);
        exigir(reporte.estado==='SIN_DIFERENCIAS_OBSERVADAS','CONCILIACION_REQUERIDA');
      }
      const r=s.accion==='preparar'?await preparar(db,tx,auth.iglesiaId,s.periodoId,FieldValue):await fn(tx);
      const resultado=dto(r);
      tx.create(receiptRef,{versionEsquema:1,uid,iglesiaId:auth.iglesiaId,solicitudId:s.solicitudId,huella:hash,
        accion:s.accion,resultado,fechaCreacion:FieldValue.serverTimestamp()});
      tx.create(audit,{evento:'mantenimiento_v1',actorUid:uid,solicitudId:s.solicitudId,accion:s.accion,
        resultado,fechaCreacion:FieldValue.serverTimestamp()});
      return {estado:'CONFIRMADA',historica:false,resultado};
    });}
    if(resolver||s.accion==='preparar')return transaccion(null);
    const protegido={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:transaccion};
    const m=crearMantenimiento({db:protegido,FieldValue,validarEntorno:c.entornoOperacion});
    const fn=s.accion==='verificar'?'conciliar':s.accion;
    return s.accion==='cambiarPeriodo'?m.cambiarPeriodo(uid,s.contexto.iglesiaId,s.periodoId,{pausado:true}):m[fn](uid,s.contexto.iglesiaId);
  });
}
module.exports={crearAdministracion,siguienteMes,validar};
