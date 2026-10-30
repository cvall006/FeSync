'use strict';
const assert=require('node:assert/strict');
module.exports=async({caso,fixture,solicitud,gasto,query,ejecutar,llamar,fallo,habilitacion,gateRef,db,FieldValue,HttpsError,contexto,evidencia,P})=>{
  let contador=0;
  const adminReq=(f,accion,periodoId)=>({solicitudId:`mantenimiento_release8_${++contador}`,contexto:contexto(f),accion,...(periodoId?{periodoId}:{})});
  const mantener=(f,data,actor=f.admin)=>llamar('finanzasV1Mantener',actor,data);
  const resolver=(f,s,accion='consultar',actor=f.admin)=>llamar('finanzasV1ResolverSolicitud',actor,{accion,solicitud:s});
  const gate=async f=>gateRef(f).set(habilitacion(f));
  const capturar=async(f,s,actor=f.admin)=>{
    let interrumpir=true;
    const conexion={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{
      const r=await db.runTransaction(...args);
      if(interrumpir&&r?.auth&&r?.solicitud){interrumpir=false;throw Error('Respuesta perdida tras captura, antes de escritor');}return r;
    }};
    const api=require('../../functions/finanzas_publicacion').crearApiPublicacion({db:conexion,FieldValue,HttpsError});
    await assert.rejects(api.ejecutar({auth:{uid:actor.uid},data:s}),e=>e.code==='unavailable');
  };
  await caso('FIN8: autorización y gate privados en resolver y mantenimiento, sin habilitación genérica',async()=>{
    const f=await fixture('auth8');
    await fallo(mantener(f,adminReq(f,'pausar')),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
    await fallo(resolver(f,gasto(f)),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');await gate(f);
    for(const actor of [f.encargado,f.miembro,f.lider])await fallo(mantener(f,adminReq(f,'pausar'),actor),'PERMISSION_DENIED');
    for(const actor of [f.miembro,f.lider])await fallo(resolver(f,gasto(f),'consultar',actor),'PERMISSION_DENIED');
    await fallo(mantener(f,adminReq(f,'pausar'),null),'UNAUTHENTICATED');
    await fallo(resolver(f,gasto(f),'consultar',null),'UNAUTHENTICATED');
    const ajena=await fixture('aisla8');await gate(ajena);
    await fallo(mantener(f,adminReq(f,'pausar'),ajena.admin),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    await fallo(resolver(f,gasto(f),'descartar',ajena.admin),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    const s=gasto(f,2);await ejecutar(f,s,f.encargado);
    await llamar('actualizarEncargadoFinanciero',f.admin,{iglesiaId:f.iglesiaId,accion:'revocar',encargadoUid:null});
    await fallo(resolver(f,s,'consultar',f.encargado),'PERMISSION_DENIED');
    await fallo(mantener(f,adminReq(f,'pausar'),f.encargado),'PERMISSION_DENIED');
    evidencia.autorizacion8={gateYAuthObligatorios:true,encargadoNoMantiene:true,revocacionYAislamiento:true};
  });
  await caso('FIN8: preparar iglesia vacía, verificar, inicializar y operar por entrada normal',async()=>{
    const f=await fixture('nueva8',0,false);
    // Iglesia nueva: conservar perfiles/acceso; quitar solo metadatos sintéticos de esta fixture no adoptada.
    for(const col of ['finanzas_cuentas','finanzas_categorias','finanzas_saldos','finanzas_resumenes']){
      const q=await db.collection(`${f.b}/${col}`).get();for(const d of q.docs)await d.ref.delete();
    }
    for(const r of ['finanzas_config/contabilidad','finanzas_control/protocolo','finanzas_control/libro','finanzas_control/periodo'])await db.doc(`${f.b}/${r}`).delete();
    await gate(f);
    const prep=adminReq(f,'preparar','2026-10'),a=await mantener(f,prep),a2=await mantener(f,prep);
    assert.equal(a.resultado.estado,'PREPARADA_SIN_MOVIMIENTOS');assert.equal(a2.historica,true);
    assert.equal((await mantener(f,adminReq(f,'verificar'))).resultado.verificacion,'SIN_DIFERENCIAS_OBSERVADAS');
    const init=adminReq(f,'inicializar');await mantener(f,init);assert.equal((await mantener(f,init)).historica,true);
    await fallo(mantener(f,adminReq(f,'inicializar')),'FAILED_PRECONDITION');
    const cuenta=await ejecutar(f,solicitud(f,'crearCuenta',{cuenta:{codigo:'CAJA8',nombre:'Caja',tipo:'caja'}}));
    const ap=await ejecutar(f,solicitud(f,'apertura',{cuentaId:cuenta.cuentaId,montoMinor:300,fechaContable:'2026-10-01'}));
    assert.equal(ap.secuencia,1);assert.equal((await query(f)).saldoTotalMinor,300);
    evidencia.preparacion8={vacia:true,corteFinal:1,preparacionEInicializacionIdempotentes:true,certificacionHistorica:false};
  });
  await caso('FIN8: mantenimiento reanudable, conciliación, mes consecutivo y recibo administrativo perdido',async()=>{
    const f=await fixture('adopcion8',2,false);await gate(f);
    const pausa=adminReq(f,'pausar');await mantener(f,pausa);assert.equal((await mantener(f,pausa)).historica,true);
    const verificar=await mantener(f,adminReq(f,'verificar'));assert.equal(verificar.resultado.verificacion,'SIN_DIFERENCIAS_OBSERVADAS');
    const init=adminReq(f,'inicializar');await mantener(f,init);assert.equal((await mantener(f,init)).historica,true);
    const s=gasto(f,5);await capturar(f,s);
    const snapshot=(await db.doc(`finanzas_mvp_solicitudes/${f.admin.uid}/solicitudes/${s.solicitudId}`).get()).data();
    await mantener(f,adminReq(f,'pausar'));
    assert.equal((await resolver(f,s)).estado,'REQUIERE_NUEVA');
    await fallo(ejecutar(f,s),'FAILED_PRECONDITION');
    await mantener(f,adminReq(f,'verificar'));
    await fallo(mantener(f,adminReq(f,'cambiarPeriodo','2026-12')),'FAILED_PRECONDITION','MES_CONSECUTIVO_REQUERIDO');
    const mes=adminReq(f,'cambiarPeriodo','2026-11');await mantener(f,mes);
    const control=(await db.doc(`${f.b}/finanzas_control/periodo`).get()).data();
    assert.equal((await mantener(f,mes)).historica,true);assert.deepEqual(control.periodosAbiertos,['2026-11']);
    await mantener(f,adminReq(f,'verificar'));await mantener(f,adminReq(f,'reanudar'));
    assert.equal((await resolver(f,s)).estado,'REQUIERE_NUEVA');
    const rechazada=await resolver(f,s,'descartar');assert.equal(rechazada.estado,'RECHAZADA');
    assert.deepEqual((await db.doc(`finanzas_mvp_solicitudes/${f.admin.uid}/solicitudes/${s.solicitudId}`).get()).data(),snapshot);
    await fallo(ejecutar(f,s),'FAILED_PRECONDITION','SOLICITUD_DESCARTADA');
    const nueva=solicitud(f,'gasto',{...s.campos,fechaContable:'2026-11-01'});const r=await ejecutar(f,nueva);
    assert.notEqual(nueva.solicitudId,s.solicitudId);assert.equal((await resolver(f,nueva)).movimientoId,r.movimientoId);
    assert.equal((await query(f)).saldoTotalMinor,9996);
    evidencia.mesPendientes8={intencionOriginalIntacta:true,descartadaSinCommit:true,mes:'2026-11',nuevaIdDistinta:true,reciboMantenimientoRecuperado:true};
  });
  await caso('FIN8: ausencia de intención, descarte versus captura/escritura concurrentes, sin doble contabilización',async()=>{
    const f=await fixture('carrera8');await gate(f);
    const noRecibida=gasto(f,3);assert.equal((await resolver(f,noRecibida)).estado,'NO_CONFIRMADA');
    assert.equal((await resolver(f,noRecibida,'descartar')).estado,'RECHAZADA');
    await fallo(ejecutar(f,noRecibida),'FAILED_PRECONDITION','SOLICITUD_DESCARTADA');
    await fallo(resolver(f,{...noRecibida,campos:{...noRecibida.campos,montoMinor:4}},'descartar'),'FAILED_PRECONDITION');
    let confirmadas=0;
    for(let i=0;i<8;i++){
      const s=gasto(f,1);if(i%2===0)await capturar(f,s);
      await Promise.allSettled([ejecutar(f,s),resolver(f,s,'descartar')]);
      const r=await resolver(f,s);assert.ok(['CONFIRMADA','RECHAZADA'].includes(r.estado));
      const [recibo,marca]=await Promise.all([
        db.doc(`operaciones_financieras/${f.admin.uid}/solicitudes/${s.solicitudId}`).get(),
        db.doc(`finanzas_resoluciones/${f.admin.uid}/solicitudes/${s.solicitudId}`).get()]);
      assert.notEqual(recibo.exists,marca.exists);
      if(r.estado==='CONFIRMADA')confirmadas++;
    }
    assert.equal((await query(f)).historial.corte,1+confirmadas);
    evidencia.carrera8={iteraciones:8,confirmadas,rechazadas:8-confirmadas,reciboYDescarteExcluyentes:true};
  });
  await caso('FIN8: recibo original recuperable con permiso de lectura aun sin permiso original de ajuste',async()=>{
    const f=await fixture('lectura8');await gate(f);
    const s=solicitud(f,'ajuste',{cuentaId:'caja',deltaMinor:2,fechaContable:'2026-10-26',motivo:'Ensayo',referenciaAuditoria:'release8'});
    const r=await ejecutar(f,s),ref=db.doc(`operaciones_financieras/${f.admin.uid}/solicitudes/${s.solicitudId}`),antes=(await ref.get()).data();
    const paso=adminReq(f,'pausar');await mantener(f,paso);
    const batch=db.batch();batch.update(db.doc(`${f.b}`),{adminUid:f.miembro.uid});
    batch.update(db.doc(`usuarios_globales/${f.miembro.uid}`),{rolGlobal:'admin_iglesia'});
    batch.update(db.doc(`usuarios_globales/${f.admin.uid}`),{rolGlobal:'servidor'});
    batch.update(db.doc(`${f.b}/finanzas_config/acceso`),{encargadoUid:f.admin.uid});await batch.commit();
    await fallo(ejecutar(f,s),'PERMISSION_DENIED');
    await fallo(mantener(f,paso),'PERMISSION_DENIED');
    const replay=await resolver(f,s);assert.equal(replay.historica,true);assert.equal(replay.movimientoId,r.movimientoId);
    assert.deepEqual((await ref.get()).data(),antes);
    evidencia.reciboLectura8={mismaIdentidadDeRecibo:true,requiereLecturaVigente:true,permisoOriginalNoNecesario:true};
  });
  await caso('FIN8: período cerrado permite recuperar recibo y descartar intención, nunca ejecutar',async()=>{
    const f=await fixture('cerrado8');await gate(f);
    const confirmada=gasto(f,2);const r=await ejecutar(f,confirmada);
    const pendiente=gasto(f,3);await capturar(f,pendiente);
    await mantener(f,adminReq(f,'pausar'));
    // Cierre heredado simulado exclusivamente en fixture; no es una vía de administración.
    await db.doc(`${f.b}/finanzas_control/periodo`).update({periodosAbiertos:[]});
    assert.equal((await resolver(f,confirmada)).movimientoId,r.movimientoId);
    assert.equal((await resolver(f,pendiente)).estado,'REQUIERE_NUEVA');
    await fallo(ejecutar(f,pendiente),'FAILED_PRECONDITION');
    assert.equal((await resolver(f,pendiente,'descartar')).estado,'RECHAZADA');
    await fallo(mantener(f,adminReq(f,'reanudar')),'FAILED_PRECONDITION','PERIODO_NO_ABIERTO');
    evidencia.cierrePeriodo8={reciboRecuperable:true,pendienteNoEjecuta:true,descartable:true,reaperturaHeredadaRequiereIntervencion:true};
  });
  await caso('FIN8: recibo incoherente no permite descarte ni segunda contabilización',async()=>{
    const f=await fixture('reciboIncoherente8');await gate(f);
    const s=gasto(f,2);await ejecutar(f,s);
    const ref=db.doc(`operaciones_financieras/${f.admin.uid}/solicitudes/${s.solicitudId}`);
    await ref.update({huella:'alteracion_solo_fixture'});
    await fallo(resolver(f,s),'FAILED_PRECONDITION','RECIBO_NO_COINCIDE');
    await fallo(resolver(f,s,'descartar'),'FAILED_PRECONDITION','RECIBO_NO_COINCIDE');
    assert.equal((await db.doc(`finanzas_resoluciones/${f.admin.uid}/solicitudes/${s.solicitudId}`).get()).exists,false);
    assert.equal((await query(f)).historial.corte,2);
    evidencia.irrecuperable8={bloqueaAnteReciboIncoherente:true,noDescartaNiDuplica:true};
  });
  await caso('FIN8: divergencias y V2 rechazan administración; paso no confirmado puede descartarse',async()=>{
    const f=await fixture('diverge8',2,false);await gate(f);await mantener(f,adminReq(f,'pausar'));
    await db.doc(`${f.b}/finanzas_saldos/caja`).update({saldoMinor:7});
    const v=await mantener(f,adminReq(f,'verificar'));assert.equal(v.resultado.verificacion,'DIVERGENCIAS');
    const req=adminReq(f,'inicializar');await fallo(mantener(f,req),'FAILED_PRECONDITION','CONCILIACION_REQUERIDA');
    const resolverAdmin={accion:'resolverSolicitud',solicitud:req,descartar:true};
    assert.equal((await mantener(f,resolverAdmin)).estado,'RECHAZADA');
    await fallo(mantener(f,req),'FAILED_PRECONDITION','SOLICITUD_DESCARTADA');
    assert.equal((await db.doc(`${f.b}/finanzas_control/incremental_v1`).get()).exists,false);
    await db.doc(`${f.b}/finanzas_control/generacion_v2`).set({soloFixture:true});
    await fallo(mantener(f,adminReq(f,'verificar')),'FAILED_PRECONDITION','LIBRO_V2_NO_ADMITIDO');
    const g=await fixture('divergeMes8');await gate(g);await mantener(g,adminReq(g,'pausar'));
    await db.doc(`${g.b}/finanzas_saldos/caja`).update({saldoMinor:7});
    await fallo(mantener(g,adminReq(g,'cambiarPeriodo','2026-11')),'FAILED_PRECONDITION','CONCILIACION_REQUERIDA');
    assert.equal((await db.doc(`${g.b}/finanzas_resumenes/2026-11`).get()).exists,false);
    assert.deepEqual((await db.doc(`${g.b}/finanzas_control/periodo`).get()).data().periodosAbiertos,['2026-10']);
  });
  await caso('FIN8: límites de mantenimiento rechazan sin modificar proyección ni producir recibo',async()=>{
    const f=await fixture('limites8',0);await gate(f);await mantener(f,adminReq(f,'pausar'));
    const inicial=(await db.doc(`${f.b}/finanzas_control/incremental_v1`).get()).data();
    const batch=db.batch();for(let i=0;i<49;i++)batch.create(db.doc(`${f.b}/finanzas_cuentas/exceso_${i}`),{soloFixture:true});await batch.commit();
    const req=adminReq(f,'verificar');await fallo(mantener(f,req),'FAILED_PRECONDITION','LIMITE_MANTENIMIENTO_EXCEDIDO');
    assert.deepEqual((await db.doc(`${f.b}/finanzas_control/incremental_v1`).get()).data(),inicial);
    assert.equal((await db.doc(`finanzas_mantenimiento/${f.admin.uid}/solicitudes/${req.solicitudId}`).get()).exists,false);
    assert.equal((await db.doc(`${f.b}/finanzas_control/protocolo`).get()).data().estado,'bloqueado');
  });
};
