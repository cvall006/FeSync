'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { entorno } = require('../../functions/finanzas_v1/entorno');
entorno();
const { abrir, P } = require('../finanzas_mvp/soporte');
const { FieldValue } = req('firebase-admin/firestore');
const { HttpsError } = req('firebase-functions/v2/https');
const { crearApiPublicacion } = require('../../functions/finanzas_publicacion');
const { crearMantenimiento } = require('../../functions/finanzas_v1/mantenimiento');
const { crearApertura, crearIngreso, calcularLibro } = require('../../functions/finanzas_core/asientos');
const db = abrir(), mantenimiento = crearMantenimiento({db,FieldValue});
const CFG = {moneda:'CLP',escala:0,zonaHoraria:'America/Santiago'};
const etapa = process.env.FIN_RELEASE_ETAPA ?? '3';
if(!['3','4','5','6','7','8','9'].includes(etapa)) throw Error('Etapa de prueba no admitida.');
const corrida = Date.now().toString(36), evidencia = {proyecto:'demo-fesync',entrada:'functions/index.js',etapa,escenarios:[]};
const candidatoWeb = process.env.FIN_CANDIDATO_WEB === 'true';
const out = path.resolve(__dirname, candidatoWeb
  ? '../../docs/finanzas_web_candidato_2026-10-28/emulador.json'
  : `../../docs/fin_release_${etapa}_${['5','6','7','8','9'].includes(etapa) ? '2026-10-26' : '2026-10-24'}/emulador.json`);
let contador = 0;

async function usuario(nombre) {
  const email = `${nombre}.${corrida}@release3.demo`;
  const r = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password:'SoloDemo123!',returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
  const d = await r.json(); assert.equal(r.status,200,JSON.stringify(d));return {uid:d.localId,token:d.idToken,email};
}
function http(nombre, actor, data) {
  entorno();
  if (candidatoWeb && ['finanzasV1ResolverSolicitud','finanzasV1Mantener'].includes(nombre)) {
    data = {tipo:nombre === 'finanzasV1Mantener' ? 'mantenimiento' : 'resolverSolicitud',datos:data};
    nombre = 'finanzasV1Ejecutar';
  }
  return fetch(`http://127.0.0.1:5018/demo-fesync/southamerica-west1/${nombre}`, {
    method:'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:`Bearer ${actor.token}`}:{})},
    body:JSON.stringify({data}),signal:AbortSignal.timeout(90000)});
}
async function llamar(nombre, actor, data) {
  const response = await http(nombre,actor,data), body = await response.json();
  if(body.error) throw Object.assign(Error(body.error.message), {code:body.error.status,details:body.error.details});
  assert.ok(Object.hasOwn(body,'result'),JSON.stringify(body));return body.result;
}
async function fixture(nombre, n = 1, inicializar = true) {
  const iglesiaId = `fin_release3_${corrida}_${nombre}`, b = `iglesias/${iglesiaId}`;
  const actores = {};
  for(const rol of ['admin','encargado','miembro','lider']) actores[rol] = await usuario(`${nombre}_${rol}`);
  const cuentas = ['caja','banco'].map(id=>({versionEsquema:1,id,iglesiaId,codigo:id.toUpperCase(),nombre:id,
    tipo:id,moneda:'CLP',escala:0,estado:'activa'}));
  const movimientos = Array.from({length:n},(_,i)=>(i===0?crearApertura:crearIngreso)({
    id:i===0?'apertura':`sintetico_${String(i+1).padStart(6,'0')}`,cuenta:{id:'caja',moneda:'CLP',escala:0},
    montoMinor:i===0?10000:1,fechaContable:'2026-10-01',periodoId:'2026-10',configuracion:CFG}));
  const resumen = calcularLibro({movimientos,cuentas:cuentas.map(({id,moneda,escala})=>({id,moneda,escala})),
    configuracion:CFG,periodoId:'2026-10'});
  const documentos = [
    [b,{adminUid:actores.admin.uid,nombre:'Release3 solo local',modulosActivos:{}}],
    ...Object.entries(actores).map(([rol,u])=>[`usuarios_globales/${u.uid}`,{iglesiaId,pertenenciaId:P,
      rolGlobal:rol==='admin'?'admin_iglesia':rol==='lider'?'lider_area':'servidor',nombre:`Prueba ${rol}`}]),
    [`${b}/finanzas_config/acceso`,{moduloHabilitado:true,encargadoUid:actores.encargado.uid}],
    [`${b}/finanzas_config/contabilidad`,{versionEsquema:1,iglesiaId,...CFG}],
    [`${b}/finanzas_control/protocolo`,{versionProtocolo:1,iglesiaId,epoca:1,estado:'operativo_v1'}],
    [`${b}/finanzas_control/libro`,{versionEsquema:1,iglesiaId,ultimaSecuencia:n,huboMovimientos:n>0}],
    [`${b}/finanzas_control/periodo`,{versionEsquema:1,iglesiaId,periodosAbiertos:['2026-10']}],
    [`${b}/finanzas_resumenes/2026-10`,{versionEsquema:1,iglesiaId,periodoId:'2026-10',ultimaSecuencia:n,datos:resumen}],
    ...cuentas.flatMap(cuenta=>[[`${b}/finanzas_cuentas/${cuenta.id}`,{cuenta}],
      [`${b}/finanzas_saldos/${cuenta.id}`,{versionEsquema:1,iglesiaId,cuentaId:cuenta.id,
        saldoMinor:cuenta.id==='caja'?resumen.saldoFinalMinor:0,huboMovimientos:cuenta.id==='caja'&&n>0,
        aperturaRegistrada:cuenta.id==='caja'&&n>0,solicitudesInciertas:0,ultimaSecuencia:cuenta.id==='caja'?n:0}]]),
    ...['ingreso','gasto'].map(naturaleza=>[`${b}/finanzas_categorias/${naturaleza}`,{categoria:{
      versionEsquema:1,id:naturaleza,iglesiaId,codigo:naturaleza.toUpperCase(),nombre:naturaleza,
      naturaleza,tipoIngreso:naturaleza==='ingreso'?'diezmos':null,estado:'activa'}}]),
    ...movimientos.map((movimiento,i)=>[`${b}/finanzas_movimientos/${movimiento.id}`,{
      versionEsquema:1,iglesiaId,estado:'confirmado',secuencia:i+1,movimiento,
      clasificacion:{cuentaId:'caja',categoriaId:i===0?null:'ingreso',naturaleza:i===0?'patrimonial':'ingreso',tipoIngreso:i===0?null:'diezmos'},
      privado:{aportante:{nombre:'NO_PUBLICAR_APORTANTE'}},responsable:{uid:actores.admin.uid,pertenenciaId:P}}]),
  ];
  if(n) documentos.push([`${b}/finanzas_aperturas/caja`,{versionEsquema:1,iglesiaId,cuentaId:'caja',movimientoId:'apertura',secuencia:1}]);
  for(let i=0;i<documentos.length;i+=400) {
    const batch=db.batch();documentos.slice(i,i+400).forEach(([p,d])=>batch.create(db.doc(p),d));await batch.commit();
  }
  const f={iglesiaId,b,...actores};
  if (!inicializar) return f;
  await mantenimiento.pausar(f.admin.uid,iglesiaId);const inicial=await mantenimiento.inicializar(f.admin.uid,iglesiaId);
  assert.equal(inicial.reporte.estado,'SIN_DIFERENCIAS_OBSERVADAS');return f;
}
const contexto = f=>({iglesiaId:f.iglesiaId,pertenenciaId:P});
function solicitud(f, operacion, campos) {
  return {solicitudId:`release3_solicitud_${String(++contador).padStart(8,'0')}`,contexto:contexto(f),operacion,campos};
}
const gasto = (f,monto=10)=>solicitud(f,'gasto',{cuentaId:'caja',categoriaId:'gasto',montoMinor:monto,fechaContable:'2026-10-24'});
const query = (f,actor=f.admin,data={})=>llamar('finanzasV1Consultar',actor,{historialPaginado:true,...data});
const ejecutar = (f,data,actor=f.admin)=>llamar('finanzasV1Ejecutar',actor,data);
const habilitacion = f=>({versionEsquema:1,iglesiaId:f.iglesiaId,circuito:'v1_incremental',habilitado:true});
const gateRef = f=>db.doc(`${f.b}/finanzas_control/publicacion_v1`);
const fallo = (promise,code,message)=>assert.rejects(promise,e=>e.code===code&&(!message||e.message===message));

test(`FIN-RELEASE-${etapa}: callables por entrada normal en Firebase Emulator`,async t=>{
  t.after(async()=>{fs.writeFileSync(out,JSON.stringify(evidencia,null,2));await db.terminate();});
  const f=await fixture('principal'), ajena=await fixture('ajena');
  async function caso(nombre,fn) {await t.test(nombre,async()=>{await fn();evidencia.escenarios.push(nombre);});}
  await caso('Auth ausente o token inválido rechazados por callable normal',async()=>{
    await fallo(query(f,null),'UNAUTHENTICATED');
    await fallo(query(f,{token:'token-invalido'}),'UNAUTHENTICATED');
    await fallo(ejecutar(f,gasto(f),null),'UNAUTHENTICATED');
  });
  await caso('Habilitación ausente, falsa o de otra iglesia bloquea; el cliente no puede activarla',async()=>{
    await fallo(query(f),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
    await fallo(ejecutar(f,gasto(f)),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
    const antes=(await db.doc(`${f.b}/finanzas_control/libro`).get()).data();
    await fallo(query(f,f.admin,{habilitado:true}),'INVALID_ARGUMENT');
    await llamar('actualizarEstadoModuloFinanzas',f.admin,{iglesiaId:f.iglesiaId,habilitado:true});
    assert.equal((await gateRef(f).get()).exists,false);
    for(const d of [{...habilitacion(f),habilitado:false},{...habilitacion(f),iglesiaId:ajena.iglesiaId},
      {...habilitacion(f),versionEsquema:2},{...habilitacion(f),circuito:'v2'},{...habilitacion(f),extra:true}]) {
      await gateRef(f).set(d);await fallo(query(f),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
    }
    assert.deepEqual((await db.doc(`${f.b}/finanzas_control/libro`).get()).data(),antes);
    await gateRef(f).set(habilitacion(f));await gateRef(ajena).set(habilitacion(ajena));
  });
  await caso('Titular y encargado vigentes permitidos; miembro y líder sin permiso rechazados',async()=>{
    const admin=await query(f),enc=await query(f,f.encargado);
    assert.equal(admin.saldoTotalMinor,10000);assert.equal(enc.permisos.transferir,true);
    assert.equal(enc.permisos.registrarAjustes,false);assert.equal(enc.permisos.administrarCatalogos,false);
    for(const actor of [f.miembro,f.lider]) {
      await fallo(query(f,actor),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
      await fallo(ejecutar(f,gasto(f),actor),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    }
    for(const [operacion,campos] of [
      ['ajuste',{cuentaId:'caja',deltaMinor:1,fechaContable:'2026-10-24',motivo:'Prueba',referenciaAuditoria:'release3'}],
      ['reversion',{originalId:'apertura',fechaContable:'2026-10-24',motivo:'Prueba',referenciaAuditoria:'release3'}],
      ['apertura',{cuentaId:'banco',montoMinor:1,fechaContable:'2026-10-24'}],
      ['crearCuenta',{cuenta:{codigo:'DENEGADA',nombre:'No autorizada',tipo:'caja'}}],
      ['crearCategoria',{categoria:{codigo:'DENEGADA',nombre:'No autorizada',naturaleza:'gasto',tipoIngreso:null}}],
    ]) {
      await fallo(ejecutar(f,solicitud(f,operacion,campos),f.encargado),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    }
  });
  let original;
  await caso('Ocho acciones V1 por HTTP: cuentas, categorías, apertura, ingreso, gasto, transferencia, ajuste y reversión',async()=>{
    const cuenta=await ejecutar(f,solicitud(f,'crearCuenta',{cuenta:{codigo:'TERCERA',nombre:'Caja tercera',tipo:'caja'}}));
    const categoria=await ejecutar(f,solicitud(f,'crearCategoria',{categoria:{codigo:'DONACIONES',nombre:'Donaciones',naturaleza:'ingreso',tipoIngreso:'donaciones'}}));
    await ejecutar(f,solicitud(f,'apertura',{cuentaId:cuenta.cuentaId,montoMinor:500,fechaContable:'2026-10-24'}));
    await ejecutar(f,solicitud(f,'ingreso',{cuentaId:'caja',categoriaId:categoria.categoriaId,montoMinor:1000,fechaContable:'2026-10-24'}));
    const reqGasto=gasto(f,200);original=await ejecutar(f,reqGasto,f.encargado);
    assert.equal((await query(f)).saldoTotalMinor,11300);
    await ejecutar(f,solicitud(f,'transferencia',{origenId:'caja',destinoId:'banco',montoMinor:300,fechaContable:'2026-10-24'}),f.encargado);
    const transferido=await query(f);assert.equal(transferido.saldoTotalMinor,11300);assert.equal(transferido.saldos.banco,300);
    await ejecutar(f,solicitud(f,'ajuste',{cuentaId:'caja',deltaMinor:-50,fechaContable:'2026-10-24',motivo:'NO_PUBLICAR_MOTIVO',referenciaAuditoria:'NO_PUBLICAR_REFERENCIA'}));
    const previo=(await db.doc(`${f.b}/finanzas_movimientos/${original.movimientoId}`).get()).data();
    const reversa=await ejecutar(f,solicitud(f,'reversion',{originalId:original.movimientoId,fechaContable:'2026-10-24',motivo:'Prueba local',referenciaAuditoria:'release3'}));
    assert.deepEqual((await db.doc(`${f.b}/finanzas_movimientos/${original.movimientoId}`).get()).data(),previo);
    assert.equal((await db.doc(`${f.b}/finanzas_reversiones/${original.movimientoId}`).get()).data().reversionId,reversa.movimientoId);
    assert.equal((await query(f)).saldoTotalMinor,11450);
    await ejecutar(f,solicitud(f,'ingreso',{cuentaId:'caja',categoriaId:'ingreso',montoMinor:250,fechaContable:'2026-10-24'}),f.encargado);
    assert.equal((await query(f)).saldoTotalMinor,11700);
  });
  await caso('Idempotencia HTTP, cuerpo de respuesta descartado y duplicados concurrentes',async()=>{
    const s=gasto(f,5),response=await http('finanzasV1Ejecutar',f.admin,s);
    assert.equal(response.status,200);await response.body.cancel(); // El cliente no interpreta el resultado.
    const replay=await ejecutar(f,s);assert.equal(replay.historica,true);
    const a=gasto(f,3),r=await Promise.all([ejecutar(f,a),ejecutar(f,a)]);
    assert.equal(r[0].movimientoId,r[1].movimientoId);assert.equal(r.filter(v=>!v.historica).length,1);
    await fallo(ejecutar(f,{...a,campos:{...a.campos,montoMinor:4}}),'FAILED_PRECONDITION','SOLICITUD_ID_REUTILIZADA');
    evidencia.recuperacionHttp={historica:replay.historica,duplicadoConcurrenteUnico:true};
  });
  await caso('Respuesta perdida después del commit real: mismo handler normal recupera recibo',async()=>{
    let perder=true;
    const conexion={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{
      const r=await db.runTransaction(...args);
      if(perder&&r?.estado==='CONFIRMADA'&&!r.historica){perder=false;throw Error('Transporte perdido después de commit real');}return r;
    }};
    const api=crearApiPublicacion({db:conexion,FieldValue,HttpsError}),s=gasto(f,2);
    await assert.rejects(api.ejecutar({auth:{uid:f.admin.uid},data:s}),e=>e.code==='unavailable');
    assert.equal((await ejecutar(f,s)).historica,true);
  });
  await caso('Dos gastos concurrentes por HTTP no sobregiran la cuenta',async()=>{
    const antes=await query(f),monto=antes.saldos.caja-1;
    const resultados=await Promise.allSettled([ejecutar(f,gasto(f,monto)),ejecutar(f,gasto(f,monto))]);
    const aprobado=resultados.filter(r=>r.status==='fulfilled'),rechazado=resultados.filter(r=>r.status==='rejected');
    assert.equal(aprobado.length,1);assert.equal(rechazado.length,1);
    assert.equal(rechazado[0].reason.message,'SALDO_INSUFICIENTE');assert.equal((await query(f)).saldos.caja,1);
    await ejecutar(f,solicitud(f,'reversion',{originalId:aprobado[0].value.movimientoId,fechaContable:'2026-10-24',motivo:'Restaurar ensayo',referenciaAuditoria:'release3'}));
    assert.equal((await query(f)).saldoTotalMinor,antes.saldoTotalMinor);
  });
  await caso('Páginas estables sin duplicados, saltos ni datos privados; cliente antiguo rechazado',async()=>{
    await fallo(llamar('finanzasV1Consultar',f.admin,{}),'FAILED_PRECONDITION','CLIENTE_HISTORIAL_PAGINADO_REQUERIDO');
    let pagina=await query(f,f.admin,{limite:3}),secuencias=[],corte=pagina.historial.corte;
    const cursorAjeno=pagina.historial.cursorSiguiente;
    await ejecutar(f,gasto(f,1));
    for(;;){
      assert.equal(pagina.historial.corte,corte);assert.equal(JSON.stringify(pagina).includes('NO_PUBLICAR'),false);
      for(const m of pagina.movimientos)for(const campo of ['privado','responsable','huella','precondiciones','solicitudId'])assert.equal(Object.hasOwn(m,campo),false);
      secuencias.push(...pagina.movimientos.map(m=>m.secuencia));
      if(!pagina.historial.hayMas)break;
      pagina=await query(f,f.admin,{limite:3,cursor:pagina.historial.cursorSiguiente});
    }
    assert.equal(new Set(secuencias).size,corte);assert.equal(secuencias.length,corte);
    assert.deepEqual([...secuencias].sort((a,b)=>a-b),Array.from({length:corte},(_,i)=>i+1));
    await fallo(query(ajena,ajena.admin,{limite:3,cursor:cursorAjeno}),'FAILED_PRECONDITION','CURSOR_AJENO_O_INVALIDO');
    evidencia.paginacion={corte,filas:secuencias.length,sinDuplicados:true,privacidad:true};
  });
  await caso('Revocación por callable existente impide consulta y nuevas escrituras',async()=>{
    await llamar('actualizarEncargadoFinanciero',f.admin,{iglesiaId:f.iglesiaId,accion:'revocar',encargadoUid:null});
    await fallo(query(f,f.encargado),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    await fallo(ejecutar(f,gasto(f),f.encargado),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    await llamar('actualizarEncargadoFinanciero',f.admin,{iglesiaId:f.iglesiaId,accion:'designar',encargadoUid:f.encargado.uid});
    assert.equal((await query(f,f.encargado)).permisos.leer,true);
  });
  await caso('Pertenencia, iglesia y datos de autorización del cliente no conceden permisos',async()=>{
    await fallo(ejecutar(f,{...gasto(f),auth:{uid:f.admin.uid}},f.miembro),'INVALID_ARGUMENT');
    await fallo(query(ajena,ajena.admin,{contexto:contexto(f)}),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    const perfilRef=db.doc(`usuarios_globales/${f.encargado.uid}`),previo=(await perfilRef.get()).data();
    await perfilRef.update({iglesiaId:ajena.iglesiaId,pertenenciaId:'b'.repeat(64)});
    await db.doc(`${ajena.b}/finanzas_config/acceso`).update({encargadoUid:f.encargado.uid});
    await fallo(ejecutar(f,gasto(f),f.encargado),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    await fallo(query(f,f.encargado,{contexto:contexto(f)}),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    await perfilRef.set({...previo,pertenenciaId:'b'.repeat(64)});
    await fallo(ejecutar(f,gasto(f),f.encargado),'FAILED_PRECONDITION','PERTENENCIA_ANTERIOR');
    await perfilRef.set(previo);
    await db.doc(`${ajena.b}/finanzas_config/acceso`).update({encargadoUid:ajena.encargado.uid});
  });
  await caso('Módulo deshabilitado y titular incoherente bloquean',async()=>{
    await llamar('actualizarEstadoModuloFinanzas',f.admin,{iglesiaId:f.iglesiaId,habilitado:false});
    await fallo(query(f),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    await fallo(ejecutar(f,gasto(f)),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    await llamar('actualizarEstadoModuloFinanzas',f.admin,{iglesiaId:f.iglesiaId,habilitado:true});
    const perfil=db.doc(`usuarios_globales/${f.admin.uid}`);await perfil.update({rolGlobal:'servidor'});
    await fallo(query(f,f.encargado),'PERMISSION_DENIED','CONTABILIDAD_NO_AUTORIZADA');
    await perfil.update({rolGlobal:'admin_iglesia'});
  });
  await caso('Protocolo, proyección, resumen y período incoherentes rechazan lectura/escritura/replay',async()=>{
    const recibida=gasto(f,1);await ejecutar(f,recibida);
    for(const [ruta,alterar] of [
      ['finanzas_control/protocolo',()=>null],
      ['finanzas_control/protocolo',d=>({...d,epoca:1})],
      ['finanzas_control/protocolo',d=>({...d,estado:'bloqueado'})],
      ['finanzas_control/incremental_v1',()=>null],
      ['finanzas_control/incremental_v1',d=>({...d,sello:'corrupto'})],
      ['finanzas_config/contabilidad',()=>null],
      ['finanzas_resumenes/2026-10',d=>({...d,ultimaSecuencia:0})],
      ['finanzas_control/periodo',d=>({...d,periodosAbiertos:['2026-11']})],
    ]){
      const ref=db.doc(`${f.b}/${ruta}`),previo=(await ref.get()).data(),d=alterar(previo);
      if(d===null)await ref.delete();else await ref.set(d);
      await fallo(query(f),'FAILED_PRECONDITION');await fallo(ejecutar(f,gasto(f)),'FAILED_PRECONDITION');
      await fallo(ejecutar(f,recibida),'FAILED_PRECONDITION');await ref.set(previo);
    }
    const cuentaAntes=(await query(f)).historial.corte;
    await fallo(ejecutar(f,solicitud(f,'gasto',{cuentaId:'caja',categoriaId:'gasto',montoMinor:1,fechaContable:'2026-11-01'})),
      'FAILED_PRECONDITION');
    assert.equal((await query(f)).historial.corte,cuentaAntes);
  });
  await caso('Deshabilitar entre intención y commit rechaza; tampoco permite replay confirmado',async()=>{
    const recibida=gasto(f,1);await ejecutar(f,recibida);
    let bloquear=true;
    const conexion={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{
      const r=await db.runTransaction(...args);
      if(bloquear&&r?.operacion==='gasto'&&r?.auth){bloquear=false;await gateRef(f).update({habilitado:false});}return r;
    }};
    const api=crearApiPublicacion({db:conexion,FieldValue,HttpsError}),s=gasto(f,9);
    const corte=(await query(f)).historial.corte;
    await assert.rejects(api.ejecutar({auth:{uid:f.admin.uid},data:s}),e=>e.message==='CIRCUITO_FINANCIERO_NO_HABILITADO');
    assert.equal((await db.doc(`operaciones_financieras/${f.admin.uid}/solicitudes/${s.solicitudId}`).get()).exists,false);
    await fallo(ejecutar(f,recibida),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
    await gateRef(f).update({habilitado:true});assert.equal((await query(f)).historial.corte,corte);
  });
  await caso('Revocación entre intención y escritor se revalida antes del commit',async()=>{
    let revocar=true;
    const conexion={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{
      const r=await db.runTransaction(...args);
      if(revocar&&r?.operacion==='gasto'&&r?.auth){revocar=false;await db.doc(`${f.b}/finanzas_config/acceso`).update({encargadoUid:null});}return r;
    }};
    const api=crearApiPublicacion({db:conexion,FieldValue,HttpsError}),s=gasto(f,9),corte=(await query(f)).historial.corte;
    await assert.rejects(api.ejecutar({auth:{uid:f.encargado.uid},data:s}),e=>e.code==='permission-denied');
    assert.equal((await db.doc(`operaciones_financieras/${f.encargado.uid}/solicitudes/${s.solicitudId}`).get()).exists,false);
    await llamar('actualizarEncargadoFinanciero',f.admin,{iglesiaId:f.iglesiaId,accion:'designar',encargadoUid:f.encargado.uid});
    assert.equal((await query(f)).historial.corte,corte);
  });
  await caso('Clientes no pueden leer/escribir habilitación ni recibos; callables antiguos de roles e ingreso funcionan',async()=>{
    async function rest(ruta,method='GET',body) {
      const r=await fetch(`http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/${ruta}`,{
        method,headers:{Authorization:`Bearer ${f.admin.token}`,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{})});await r.arrayBuffer();return r.status;
    }
    assert.equal(await rest(`${f.b}/finanzas_control/publicacion_v1`),403);
    assert.equal(await rest(`${f.b}/finanzas_control/publicacion_v1`,'PATCH',{fields:{habilitado:{booleanValue:true}}}),403);
    assert.equal(await rest(`operaciones_financieras/${f.admin.uid}/solicitudes/privado`),403);
    const rol=await llamar('obtenerContextoCambioRolMiembro',f.admin,{iglesiaId:f.iglesiaId,uidObjetivo:f.miembro.uid});
    assert.equal(rol.rolActual,'servidor');assert.equal(rol.pertenenciaId,P);
    const ingreso=await llamar('consultarEstadoSolicitudIngreso',f.admin,{solicitudId:'release3_solicitud_inexistente',tipo:'vincular'});
    assert.equal(ingreso.estado,'NO_VERIFICABLE');
  });
  await caso('Más de 1.000 movimientos por entrada normal y conciliación independiente',async()=>{
    const g=await fixture('mil',1001);await gateRef(g).set(habilitacion(g));
    const r=await ejecutar(g,gasto(g,10));assert.equal(r.secuencia,1002);
    const rr=await ejecutar(g,solicitud(g,'reversion',{originalId:r.movimientoId,fechaContable:'2026-10-24',motivo:'Prueba local',referenciaAuditoria:'release3'}));
    assert.equal(rr.secuencia,1003);
    let pagina=await query(g),secuencias=[];
    for(;;){secuencias.push(...pagina.movimientos.map(m=>m.secuencia));if(!pagina.historial.hayMas)break;
      pagina=await query(g,g.admin,{cursor:pagina.historial.cursorSiguiente});}
    assert.equal(secuencias.length,1003);assert.equal(new Set(secuencias).size,1003);
    assert.deepEqual([...secuencias].sort((a,b)=>a-b),Array.from({length:1003},(_,i)=>i+1));
    assert.equal(pagina.saldoTotalMinor,11000);
    await mantenimiento.pausar(g.admin.uid,g.iglesiaId);const conciliacion=await mantenimiento.conciliar(g.admin.uid,g.iglesiaId);
    assert.equal(conciliacion.estado,'SIN_DIFERENCIAS_OBSERVADAS');
    await mantenimiento.pausar(f.admin.uid,f.iglesiaId);const principal=await mantenimiento.conciliar(f.admin.uid,f.iglesiaId);
    assert.equal(principal.estado,'SIN_DIFERENCIAS_OBSERVADAS');
    evidencia.mil={secuencias:[1002,1003],paginados:1003,saldo:11000,conciliacion:conciliacion.estado,certificacionHistorica:false};
    evidencia.fixturePrincipal={iglesiaId:f.iglesiaId,conciliacion:principal.estado};
  });
  if(['4','5','6','7','8','9'].includes(etapa)) {
    await caso('Entrada normal registra 200/201 y revierte 201 como 202',async()=>{
      const g=await fixture('frontera4',199);await gateRef(g).set(habilitacion(g));
      const r200=await ejecutar(g,gasto(g,1)),r201=await ejecutar(g,gasto(g,10));
      const original=(await db.doc(`${g.b}/finanzas_movimientos/${r201.movimientoId}`).get()).data();
      const r202=await ejecutar(g,solicitud(g,'reversion',{originalId:r201.movimientoId,fechaContable:'2026-10-24',motivo:'Prueba local',referenciaAuditoria:'release4'}));
      assert.deepEqual([r200.secuencia,r201.secuencia,r202.secuencia],[200,201,202]);
      assert.deepEqual((await db.doc(`${g.b}/finanzas_movimientos/${r201.movimientoId}`).get()).data(),original);
      await mantenimiento.pausar(g.admin.uid,g.iglesiaId);const r=await mantenimiento.conciliar(g.admin.uid,g.iglesiaId);
      assert.equal(r.estado,'SIN_DIFERENCIAS_OBSERVADAS');
      evidencia.frontera={secuencias:[200,201,202],conciliacion:r.estado};
    });
    await caso('Fixture privada exclusiva para Flutter conectado a Functions normales',async()=>{
      const ui=await fixture('flutter4',199);await gateRef(ui).set(habilitacion(ui));
      const q=await query(ui);assert.equal(q.historial.corte,199);
      evidencia.flutter={iglesiaId:ui.iglesiaId,email:ui.admin.email,pertenenciaId:P,
        corte:q.historial.corte,saldo:q.saldoTotalMinor,functionsPort:5018};
    });
  }
  if(['5','6','7','8','9'].includes(etapa)) {
    await caso('Adopción existente divergente rechazada sin crear proyección', async()=>{
      const g=await fixture('divergente5',2,false);
      await db.doc(`${g.b}/finanzas_saldos/caja`).update({saldoMinor:999});
      await mantenimiento.pausar(g.admin.uid,g.iglesiaId);
      assert.equal((await mantenimiento.conciliar(g.admin.uid,g.iglesiaId)).estado,'DIVERGENCIAS');
      await assert.rejects(mantenimiento.inicializar(g.admin.uid,g.iglesiaId),e=>e.codigo==='CONCILIACION_REQUERIDA');
      assert.equal((await db.doc(`${g.b}/finanzas_control/incremental_v1`).get()).exists,false);
      assert.equal((await gateRef(g).get()).exists,false);
      evidencia.adopcionDivergente={rechazada:true,proyeccionCreada:false,gateCreado:false};
    });
    await caso('Iglesia nueva: proyección vacía verificada, apertura única y no reinicialización', async()=>{
      const g=await fixture('nueva5',0);
      await fallo(query(g),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
      await gateRef(g).set(habilitacion(g));
      assert.equal((await query(g)).saldoTotalMinor,0);
      const apertura=solicitud(g,'apertura',{cuentaId:'caja',montoMinor:100,fechaContable:'2026-10-26'});
      const r=await ejecutar(g,apertura);assert.equal(r.secuencia,1);
      assert.equal((await ejecutar(g,apertura)).historica,true);
      await fallo(ejecutar(g,solicitud(g,'apertura',apertura.campos)),'FAILED_PRECONDITION','APERTURA_DUPLICADA');
      await mantenimiento.pausar(g.admin.uid,g.iglesiaId);
      await assert.rejects(mantenimiento.inicializar(g.admin.uid,g.iglesiaId),e=>e.codigo==='NO_REINICIALIZAR_PROYECCIONES');
      const reporte=await mantenimiento.conciliar(g.admin.uid,g.iglesiaId);
      assert.equal(reporte.estado,'SIN_DIFERENCIAS_OBSERVADAS');
      evidencia.nueva={corteInicial:0,corteFinal:1,conciliacion:reporte.estado,certificacionHistorica:false};
    });
    await caso('Habilitar, perder respuesta, deshabilitar y recuperar con nueva instancia HTTP', async()=>{
      const g=await fixture('recuperacion5');await gateRef(g).set(habilitacion(g));
      const s=gasto(g,13), response=await http('finanzasV1Ejecutar',g.admin,s);
      assert.equal(response.status,200);await response.body.cancel();
      const reciboRef=db.doc(`operaciones_financieras/${g.admin.uid}/solicitudes/${s.solicitudId}`);
      const recibo=(await reciboRef.get()).data(), corte=(await query(g)).historial.corte;
      await gateRef(g).update({habilitado:false});
      await fallo(query(g),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
      await fallo(ejecutar(g,s),'FAILED_PRECONDITION','CIRCUITO_FINANCIERO_NO_HABILITADO');
      await gateRef(g).update({habilitado:true});
      const recuperada=await ejecutar(g,JSON.parse(JSON.stringify(s)));
      assert.equal(recuperada.historica,true);assert.equal(recuperada.secuencia,corte);
      assert.deepEqual((await reciboRef.get()).data(),recibo);
      assert.equal((await query(g)).historial.corte,corte);
      evidencia.cicloHabilitacion={respuestaDescartada:true,replayBloqueadoDurantePausa:true,reciboIntacto:true,corte};
    });
    await caso('Continuidad octubre a noviembre: saldos, resumen anterior, replay y reversión', async()=>{
      const g=await fixture('mes5');await gateRef(g).set(habilitacion(g));
      const s=gasto(g,15),confirmada=await ejecutar(g,s);
      const cerrado=(await db.doc(`${g.b}/finanzas_resumenes/2026-10`).get()).data();
      const nueva=solicitud(g,'gasto',{...s.campos,fechaContable:'2026-11-01'});
      await fallo(ejecutar(g,nueva),'FAILED_PRECONDITION');
      await mantenimiento.cambiarPeriodo(g.admin.uid,g.iglesiaId,'2026-11');
      const q=await query(g);assert.equal(q.periodoId,'2026-11');assert.equal(q.saldoTotalMinor,9985);
      assert.equal(q.resumen.saldoInicialMinor,9985);
      assert.equal((await ejecutar(g,s)).historica,true);
      await fallo(ejecutar(g,gasto(g,1)),'FAILED_PRECONDITION');
      // El intento anterior capturó precondiciones del mes viejo: no se recicla.
      await fallo(ejecutar(g,nueva),'FAILED_PRECONDITION','CONTEXTO_OPERACION_MODIFICADO');
      await ejecutar(g,solicitud(g,'gasto',nueva.campos));
      await ejecutar(g,solicitud(g,'reversion',{originalId:confirmada.movimientoId,fechaContable:'2026-11-01',motivo:'Ensayo',referenciaAuditoria:'release5'}));
      assert.deepEqual((await db.doc(`${g.b}/finanzas_resumenes/2026-10`).get()).data(),cerrado);
      await mantenimiento.pausar(g.admin.uid,g.iglesiaId);
      const reporte=await mantenimiento.conciliar(g.admin.uid,g.iglesiaId);
      assert.equal(reporte.estado,'SIN_DIFERENCIAS_OBSERVADAS');
      evidencia.continuidad={anterior:'2026-10',nuevo:'2026-11',saldoInicial:9985,saldoFinal:9985,
        replayAnterior:true,resumenAnteriorIntacto:true,conciliacion:reporte.estado};
    });
    await caso(['6','7','8','9'].includes(etapa)?'Reglas corregidas: libro, auditoría y recibos privados inaccesibles directamente':
      'Reglas actuales: evidencia de lectura directa de privados y auditoría con gate apagado', async()=>{
      const g=await fixture('privacidad5');
      async function leer(ruta,absoluta=false) {
        const r=await fetch(`http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/${absoluta?'':g.b+'/'}${ruta}`,{
          headers:{Authorization:`Bearer ${g.encargado.token}`},signal:AbortSignal.timeout(15000)});
        return {status:r.status,body:await r.json()};
      }
      assert.equal((await gateRef(g).get()).exists,false);
      const mov=await leer('finanzas_movimientos/apertura'),audit=await leer('finanzas_auditoria/inicio_incremental_v1_1');
      assert.equal(mov.status,['6','7','8','9'].includes(etapa)?403:200);assert.equal(audit.status,['6','7','8','9'].includes(etapa)?403:200);
      if(['6','7','8','9'].includes(etapa)){
        assert.equal(JSON.stringify(mov.body).includes('NO_PUBLICAR_APORTANTE'),false);
        await gateRef(g).set(habilitacion(g));
        const consulta=await query(g);assert.equal(consulta.saldoTotalMinor,10000);
        assert.equal(JSON.stringify(consulta).includes('NO_PUBLICAR_APORTANTE'),false);
        const s=gasto(g,3),r=await ejecutar(g,s);assert.equal(r.estado,'CONFIRMADA');
        assert.equal((await ejecutar(g,s)).historica,true);
        assert.equal((await leer(`finanzas_movimientos/${r.movimientoId}`)).status,403);
        assert.equal((await leer(`finanzas_auditoria/${r.movimientoId}`)).status,403);
        assert.equal((await leer(`operaciones_financieras/${g.admin.uid}/solicitudes/${s.solicitudId}`,true)).status,403);
        evidencia.privacidadCorregida={gateAusenteDeniega:true,gateHabilitadoTambienDeniega:true,
          callableConsultaFiltrada:true,callableEscribe:true,lecturaDirectaMovimiento:mov.status,lecturaDirectaAuditoria:audit.status};
      }else{
        assert.ok(JSON.stringify(mov.body).includes('NO_PUBLICAR_APORTANTE'));
        evidencia.bloqueoPrivacidad={gateAusente:true,encargadoLeePrivadoDirectamente:mov.status,
          encargadoLeeAuditoriaDirectamente:audit.status,reglasModificadas:false};
      }
    });
    await caso('Intención sin commit al cambiar mes queda preservada y exige resolución operativa', async()=>{
      const g=await fixture('pendienteMes5');await gateRef(g).set(habilitacion(g));
      let interrumpir=true;
      const conexion={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async(...args)=>{
        const r=await db.runTransaction(...args);
        if(interrumpir&&r?.operacion==='gasto'&&r?.auth){interrumpir=false;throw Error('Cierre antes de escritura');}return r;
      }};
      const s=gasto(g,7),api=crearApiPublicacion({db:conexion,FieldValue,HttpsError});
      await assert.rejects(api.ejecutar({auth:{uid:g.admin.uid},data:s}),e=>e.code==='unavailable');
      const intentRef=db.doc(`finanzas_mvp_solicitudes/${g.admin.uid}/solicitudes/${s.solicitudId}`);
      const intent=(await intentRef.get()).data();assert.ok(intent);
      await mantenimiento.cambiarPeriodo(g.admin.uid,g.iglesiaId,'2026-11');
      await fallo(ejecutar(g,s),'FAILED_PRECONDITION');
      assert.deepEqual((await intentRef.get()).data(),intent);
      assert.equal((await db.doc(`operaciones_financieras/${g.admin.uid}/solicitudes/${s.solicitudId}`).get()).exists,false);
      assert.equal((await query(g)).historial.corte,1);
      evidencia.pendienteCruzandoMes={intencionPreservada:true,reciboExiste:false,nuevoMovimiento:false,
        recuperacionAutomatica:false,resolucionOperativaRequerida:true};
    });
  }
  if(['8','9'].includes(etapa)) await require('../finanzas_release8/escenarios.cjs')({caso,fixture,solicitud,gasto,query,ejecutar,llamar,fallo,habilitacion,gateRef,db,FieldValue,HttpsError,contexto,evidencia,P});

});
