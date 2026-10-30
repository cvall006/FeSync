'use strict';
const {exigir,registroExacto}=require('../finanzas_core/dinero');
const {validarConfiguracionContable}=require('../finanzas_core/configuracion');
const {PERMISOS_OPERACION}=require('./solicitudes');
const c=require('./comun'),o=require('./operativa');
function validar(s){
  registroExacto(s,['solicitudId','contexto','operacion','campos']);
  exigir(typeof s.solicitudId==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId),'SOLICITUD_ID_INVALIDA');
  exigir(Object.hasOwn(PERMISOS_OPERACION,s.operacion)&&s.campos&&typeof s.campos==='object','SOLICITUD_INVALIDA');
  exigir(Buffer.byteLength(c.canon(s))<=16384,'SOLICITUD_DEMASIADO_GRANDE');
}
function crearResolucion({db,FieldValue,HttpsError}) {
  return o.callable(HttpsError,async(uid,data)=>{
    registroExacto(data,['accion','solicitud']);exigir(['consultar','descartar'].includes(data.accion),'ACCION_INVALIDA');
    const s=data.solicitud;validar(s);
    return db.runTransaction(async tx=>{
      const auth=await o.autorizar(db,tx,uid,s.contexto),b=auth.b;
      const ref=r=>db.doc(`${b}/${r}`);
      const [ps,control,estado,config,periodo]=await Promise.all([
        'finanzas_control/protocolo','finanzas_control/libro','finanzas_control/incremental_v1',
        'finanzas_config/contabilidad','finanzas_control/periodo'].map(r=>tx.get(ref(r))));
      c.protocolo(ps.data(),auth.iglesiaId,ps.data()?.estado==='bloqueado');
      const v=c.verificar(estado.data(),control.data(),auth.iglesiaId);
      const cfg=validarConfiguracionContable(config.data(),auth.iglesiaId);
      const pc=periodo.data();
      exigir(pc?.versionEsquema===1&&pc.iglesiaId===auth.iglesiaId&&Array.isArray(pc.periodosAbiertos)&&
        pc.periodosAbiertos.length<=1&&pc.periodosAbiertos.every(m=>m===v.proyeccion.periodo.periodoId),'PERIODO_PROYECCION_DISTINTO');
      exigir(c.canon(c.configDinero(cfg))===c.canon(v.proyeccion.configuracion),'PROYECCION_DIVERGENTE');
      const resumen=await tx.get(ref(`finanzas_resumenes/${v.proyeccion.periodo.periodoId}`));
      exigir(resumen.exists&&resumen.data().ultimaSecuencia===control.data().ultimaSecuencia&&
        c.canon(resumen.data().datos)===c.canon(c.resumen(v)),'RESUMEN_PROYECCION_DIVERGENTE');
      const intRef=db.doc(`finanzas_mvp_solicitudes/${uid}/solicitudes/${s.solicitudId}`);
      const receiptRef=db.doc(`operaciones_financieras/${uid}/solicitudes/${s.solicitudId}`);
      const rejectRef=db.doc(`finanzas_resoluciones/${uid}/solicitudes/${s.solicitudId}`);
      const [intent,receipt,rechazo]=await Promise.all([intRef,receiptRef,rejectRef].map(r=>tx.get(r)));
      const huella=c.hash(s),entidadId=c.hash([`finanzas-${s.operacion}-v1`,uid,auth.iglesiaId,s.solicitudId]);
      if(intent.exists)exigir(intent.data().huella===huella&&intent.data().entrada.auth.uid===uid,'SOLICITUD_ID_REUTILIZADA');
      if(rechazo.exists){
        exigir(!receipt.exists&&rechazo.data().huella===huella&&rechazo.data().iglesiaId===auth.iglesiaId,'RESOLUCION_INCOHERENTE');
        return {estado:'RECHAZADA',codigo:'DESCARTADA_SIN_COMMIT',puedeCrearNueva:true};
      }
      const catalogo=['crearCuenta','crearCategoria'].includes(s.operacion),campo=s.operacion==='crearCuenta'?'cuenta':'categoria';
      const ruta=catalogo?`finanzas_${campo==='cuenta'?'cuentas':'categorias'}/${entidadId}`:`finanzas_movimientos/${entidadId}`;
      const [entidad,auditoria]=await Promise.all([ruta,`finanzas_auditoria/${entidadId}`].map(r=>tx.get(ref(r))));
      if(receipt.exists){
        exigir(intent.exists,'RECIBO_NO_COINCIDE');const entrada=intent.data().entrada,r=receipt.data(),e=entidad.data();
        const hash=c.hash({uid,operacion:entrada.operacion,solicitud:entrada.solicitud});
        exigir(r.versionEsquema===1&&r.estado==='confirmado'&&r.uid===uid&&r.iglesiaId===auth.iglesiaId&&
          r.solicitudId===s.solicitudId&&r.operacion===s.operacion&&r.huella===hash&&r.movimientoId===entidadId&&
          r.pertenenciaId===s.contexto.pertenenciaId&&e?.huella===hash&&e.responsable?.uid===uid&&
          e.responsable.pertenenciaId===r.pertenenciaId&&auditoria.exists,'RECIBO_NO_COINCIDE');
        exigir(catalogo?e[campo]?.id===entidadId:e.movimiento?.id===entidadId&&e.secuencia===r.secuencia,'RECIBO_NO_COINCIDE');
        return {estado:'CONFIRMADA',historica:true,...(catalogo?{[campo+'Id']:entidadId}:{movimientoId:entidadId,secuencia:r.secuencia})};
      }
      exigir(!entidad.exists&&!auditoria.exists,'MOVIMIENTO_SIN_RECIBO');
      if(data.accion==='descartar'){
        tx.create(rejectRef,{versionEsquema:1,iglesiaId:auth.iglesiaId,pertenenciaId:s.contexto.pertenenciaId,
          uid,solicitudId:s.solicitudId,huella,estado:'rechazada',codigo:'DESCARTADA_SIN_COMMIT',fechaCreacion:FieldValue.serverTimestamp()});
        tx.create(ref(`finanzas_auditoria/resolucion_${c.hash([uid,s.solicitudId])}`),{
          evento:'solicitud_descartada_sin_commit',actorUid:uid,solicitudId:s.solicitudId,huella,fechaCreacion:FieldValue.serverTimestamp()});
        return {estado:'RECHAZADA',codigo:'DESCARTADA_SIN_COMMIT',puedeCrearNueva:true};
      }
      let vencida=ps.data().estado!=='operativo_v1'||!auth.permisos[PERMISOS_OPERACION[s.operacion]];
      if(intent.exists){
        const solicitud=intent.data().entrada.solicitud,p=solicitud.precondiciones;
        const checks=[['iglesia',auth.iglesia],['acceso',auth.acceso],['configuracion',config],['controlPeriodo',periodo]];
        for(const [k,snap]of checks)if(!snap.exists||p[k]!==c.ver(snap))vencida=true;
        const refs=[];
        if(p.cuenta)refs.push([`finanzas_cuentas/${solicitud.cuentaId}`,p.cuenta]);
        if(p.categoria)refs.push([`finanzas_categorias/${solicitud.categoriaId}`,p.categoria]);
        for(const a of p.cuentas??[])refs.push([`finanzas_cuentas/${a.cuentaId}`,a.version]);
        if(p.original){refs.push([`finanzas_movimientos/${solicitud.originalId}`,p.original.version]);
          const marca=await tx.get(ref(`finanzas_reversiones/${solicitud.originalId}`));
          if((marca.exists?c.ver(marca):null)!==p.original.versionReversion)vencida=true;}
        for(const [r,version]of refs){const snap=await tx.get(ref(r));if(!snap.exists||c.ver(snap)!==version)vencida=true;}
        if(periodo.data()?.periodosAbiertos?.[0]!==solicitud.periodoId)vencida=true;
      }else if(!catalogo&&s.campos.fechaContable?.slice(0,7)!==periodo.data()?.periodosAbiertos?.[0])vencida=true;
      return {estado:vencida?'REQUIERE_NUEVA':'NO_CONFIRMADA',codigo:vencida?'CONDICIONES_VENCIDAS':'SIN_RECIBO_OBSERVADO',
        puedeCrearNueva:false,requiereDescarte:true};
    });
  });
}
module.exports={crearResolucion,validar};
