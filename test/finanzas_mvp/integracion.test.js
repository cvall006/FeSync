'use strict';
const {test,before,after} = require('node:test'), assert = require('node:assert/strict');
const {abrir,preparar,llamar,I,B,P} = require('./soporte');
let db,u,contexto,caja,banco,ingreso,gasto,original;
const request = (op,campos,solicitudId='mvp_'+require('node:crypto').randomBytes(16).toString('hex')) => ({contexto,operacion:op,campos,solicitudId});
const ejecutar = (op,campos,actor=u.admin) => llamar('finanzasMvpEjecutar',actor,request(op,campos));
const consultar = (actor=u.admin, data={}) => llamar('finanzasMvpConsultar',actor,data);
const fecha='2026-10-23';
before(async()=>{ db=abrir();u=await preparar(db); });
after(async()=>{if(db)await db.terminate();});
test('Auth servidor: sin token, miembro y líder no tienen acceso',async()=>{
  for(const actor of [null,u.miembro,u.lider]) await assert.rejects(consultar(actor), e=>['UNAUTHENTICATED','PERMISSION_DENIED'].includes(e.code));
});
test('Titular configura exclusivamente fixture autorizada; repetición no reinicia libro',async()=>{
  const d=await consultar();contexto=d.contexto;assert.equal(d.configurada,false);
  await llamar('finanzasMvpInicializar',u.admin,{contexto,periodoId:'2026-10'});
  assert.equal((await consultar()).protocolo,'operativo_v1');
  assert.equal((await llamar('finanzasMvpInicializar',u.admin,{contexto,periodoId:'2026-11'})).estado,'YA_CONFIGURADA');
  const ajena=(await consultar(u.ajeno)).contexto;
  await assert.rejects(llamar('finanzasMvpInicializar',u.ajeno,{contexto:ajena,periodoId:'2026-10'}),/FIXTURE_NO_AUTORIZADA/);
});
test('Crear caja y banco mediante adaptador V1; ID duplicado concurrente solo crea una cuenta',async()=>{
  const r=request('crearCuenta',{cuenta:{codigo:'CAJA',nombre:'Caja',tipo:'caja'}});
  const [a,b]=await Promise.all([llamar('finanzasMvpEjecutar',u.admin,r),llamar('finanzasMvpEjecutar',u.admin,r)]);
  caja=a.cuentaId;assert.equal(caja,b.cuentaId);
  banco=(await ejecutar('crearCuenta',{cuenta:{codigo:'BANCO',nombre:'Banco',tipo:'banco'}})).cuentaId;
  assert.equal((await consultar()).cuentas.length,2);
  await assert.rejects(llamar('finanzasMvpEjecutar',u.admin,{...r,campos:{cuenta:{codigo:'OTRA',nombre:'Otra',tipo:'caja'}}}),/SOLICITUD_ID_REUTILIZADA/);
});
test('Categorías de diezmos, ofrendas, donaciones, otros y gastos',async()=>{
  for(const tipo of ['diezmos','ofrendas','donaciones','otros']) {
    const r=await ejecutar('crearCategoria',{categoria:{codigo:tipo.toUpperCase(),nombre:tipo,naturaleza:'ingreso',tipoIngreso:tipo}});
    if(tipo==='diezmos')ingreso=r.categoriaId;
  }
  gasto=(await ejecutar('crearCategoria',{categoria:{codigo:'GASTOS',nombre:'Gastos',naturaleza:'gasto',tipoIngreso:null}})).categoriaId;
  assert.equal((await consultar()).categorias.length,5);
});
test('Saldo inicial, diezmo y gasto reales: saldo y resumen coinciden',async()=>{
  await ejecutar('apertura',{cuentaId:caja,montoMinor:10000,fechaContable:fecha});
  original=(await ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:5000,fechaContable:fecha})).movimientoId;
  await ejecutar('gasto',{cuentaId:caja,categoriaId:gasto,montoMinor:2000,fechaContable:fecha});
  const d=await consultar();assert.equal(d.saldoTotalMinor,13000);assert.equal(d.saldos[caja],13000);
  assert.equal(d.resumen.ingresosNetosMinor,5000);assert.equal(d.resumen.gastosNetosMinor,2000);assert.equal(d.movimientos.length,3);
  assert.ok(d.movimientos.every(m=>!Object.hasOwn(m,'privado')&&!Object.hasOwn(m,'responsable')));
});
test('Recuperación de respuesta perdida: misma solicitud y precondiciones originales',async()=>{
  const r=request('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:700,fechaContable:fecha});
  await llamar('finanzasMvpEjecutar',u.admin,r); // respuesta descartada por el cliente
  const intent=(await db.doc(`finanzas_mvp_solicitudes/${u.admin.uid}/solicitudes/${r.solicitudId}`).get()).data();
  await ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:100,fechaContable:fecha});
  const replay=await llamar('finanzasMvpEjecutar',u.admin,r);assert.equal(replay.historica,true);
  assert.deepEqual((await db.doc(`finanzas_mvp_solicitudes/${u.admin.uid}/solicitudes/${r.solicitudId}`).get()).data(),intent);
  assert.equal((await consultar()).saldoTotalMinor,13800);
});
test('Encargado registra y transfiere, sin administrar catálogos, aperturas, ajustes ni reversas',async()=>{
  for(const [op,campos] of [
    ['crearCuenta',{cuenta:{codigo:'NO',nombre:'No',tipo:'caja'}}], ['apertura',{cuentaId:banco,montoMinor:1,fechaContable:fecha}],
    ['ajuste',{cuentaId:caja,deltaMinor:1,fechaContable:fecha,motivo:'No',referenciaAuditoria:'no'}],
    ['reversion',{originalId:original,fechaContable:fecha,motivo:'No',referenciaAuditoria:'no'}]])
    await assert.rejects(ejecutar(op,campos,u.encargado),e=>e.code==='PERMISSION_DENIED');
  await ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:200,fechaContable:fecha},u.encargado);
  await ejecutar('transferencia',{origenId:caja,destinoId:banco,montoMinor:1000,fechaContable:fecha},u.encargado);
  const d=await consultar(u.encargado);assert.equal(d.saldoTotalMinor,14000);assert.equal(d.saldos[banco],1000);assert.equal(d.saldos[caja],13000);
});
test('Titular revierte y ajusta con operaciones existentes, preservando historial',async()=>{
  await ejecutar('reversion',{originalId:original,fechaContable:fecha,motivo:'Correccion demo',referenciaAuditoria:'REV_1'});
  await ejecutar('ajuste',{cuentaId:caja,deltaMinor:-100,fechaContable:fecha,motivo:'Ajuste demo',referenciaAuditoria:'AJ_1'});
  const d=await consultar();assert.equal(d.saldoTotalMinor,8900);assert.equal(d.resumen.ingresosNetosMinor,1000);assert.equal(d.resumen.gastosNetosMinor,2000);
  await assert.rejects(ejecutar('reversion',{originalId:original,fechaContable:fecha,motivo:'Duplicada',referenciaAuditoria:'REV_2'}));
});
test('Sin confianza en auth, iglesia, roles, saldos ni campos adicionales del cliente',async()=>{
  const r=request('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:100,fechaContable:fecha});
  for(const extra of [{auth:{uid:u.admin.uid}},{iglesiaId:I},{saldoMinor:999999}]) await assert.rejects(llamar('finanzasMvpEjecutar',u.encargado,{...r,...extra}));
  await assert.rejects(llamar('finanzasMvpEjecutar',u.ajeno,r),/PERTENENCIA_ANTERIOR/);
  await assert.rejects(consultar(u.ajeno,{contexto}));
  await assert.rejects(ejecutar('gasto',{cuentaId:caja,categoriaId:gasto,montoMinor:999999,fechaContable:fecha}),/SALDO_INSUFICIENTE/);
});
test('Reglas conservadas: cliente autenticado no escribe finanzas ni intenciones del servidor',async()=>{
  for(const ruta of [`${B}/finanzas_saldos/${caja}`,`finanzas_mvp_solicitudes/${u.admin.uid}/solicitudes/falsa`]) {
    const r=await fetch(`http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/${ruta}`,{method:'PATCH',headers:{Authorization:`Bearer ${u.admin.token}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{saldoMinor:{integerValue:'999999'}}})});
    assert.equal(r.status,403);
  }
});
test('Bloqueo V1 y ausencia de activación V2',async()=>{
  await db.doc(`${B}/finanzas_control/protocolo`).update({estado:'bloqueado'});
  await assert.rejects(ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:100,fechaContable:fecha}));
  await assert.rejects(llamar('finanzasMvpInicializar',u.admin,{contexto,periodoId:'2026-10'}));
  assert.equal((await db.doc(`${B}/finanzas_control/generacion_v2`).get()).exists,false);
  assert.equal((await db.collection(`${B}/finanzas_generaciones_demo`).get()).empty,true);
  await db.doc(`${B}/finanzas_control/protocolo`).update({estado:'operativo_v1'}); // solo restaura esta fixture nueva
});
test('Revocación vigente y cambio de pertenencia impiden lecturas y solicitudes antiguas',async()=>{
  await llamar('actualizarEncargadoFinanciero',u.admin,{iglesiaId:I,accion:'revocar',encargadoUid:null});
  await assert.rejects(consultar(u.encargado),e=>e.code==='PERMISSION_DENIED');
  await assert.rejects(ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:100,fechaContable:fecha},u.encargado),e=>e.code==='PERMISSION_DENIED');
  await db.doc(`usuarios_globales/${u.admin.uid}`).update({pertenenciaId:'b'.repeat(64)});
  await assert.rejects(ejecutar('ingreso',{cuentaId:caja,categoriaId:ingreso,montoMinor:100,fechaContable:fecha}),/PERTENENCIA_ANTERIOR/);
  await db.doc(`usuarios_globales/${u.admin.uid}`).update({pertenenciaId:P});
});
