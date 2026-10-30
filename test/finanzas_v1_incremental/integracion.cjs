'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { createRequire } = require('node:module'), path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../../functions/package.json'));
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
    [process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT].some(p => p && p !== 'demo-fesync')) throw Error('SOLO_DEMO');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-fesync', GOOGLE_CLOUD_PROJECT: 'demo-fesync',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098', FUNCTIONS_EMULATOR: 'true' });
const { abrir } = require('../finanzas_mvp/soporte');
const { FieldValue } = req('firebase-admin/firestore'); const { HttpsError } = req('firebase-functions/v2/https');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { crearApiIncremental } = require('../../functions/finanzas_v1/api');
const { crearAdaptadorIncremental } = require('../../functions/finanzas_v1/adaptador');
const { crearMantenimiento } = require('../../functions/finanzas_v1/mantenimiento');
const { crearApertura, crearIngreso, calcularLibro } = require('../../functions/finanzas_core/asientos');
const { ver } = require('../../functions/finanzas_v1/comun');
const CFG = { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' }, P = 'a'.repeat(64);
const db = abrir(), metricas = [];
const medido = { doc: db.doc.bind(db), collection: db.collection.bind(db), runTransaction: (fn, ...args) => db.runTransaction(async tx => {
  const m = { documentos: 0, consultas: 0 }; metricas.push(m);
  const proxy = new Proxy(tx, { get(target, key) {
    if (key === 'get') return async ref => { const r = await target.get(ref); if (r.docs) { m.consultas++; m.documentos += r.size; } else m.documentos++; return r; };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } }); return fn(proxy);
}, ...args) };
const api = crearApiIncremental({ db: medido, FieldValue, HttpsError }), mantenimiento = crearMantenimiento({ db, FieldValue });
const evidencia = { escenarios: [], lecturas: {} }; const corrida = Date.now().toString(36);
async function usuario(nombre) {
  const r = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      email: `${nombre}.${corrida}@release2.demo`, password: 'SoloDemo123!', returnSecureToken: true }) });
  const d = await r.json(); assert.equal(r.status, 200); return { uid: d.localId, token: d.idToken };
}
async function fixture(n, nombre) {
  const iglesiaId = `fin_release2_${corrida}_${nombre}`, b = `iglesias/${iglesiaId}`;
  const admin = await usuario('admin' + nombre), encargado = await usuario('encargado' + nombre);
  const cuentas = ['caja', 'banco'].map(id => ({ versionEsquema: 1, id, iglesiaId, codigo: id.toUpperCase(),
    nombre: id, tipo: id, moneda: 'CLP', escala: 0, estado: 'activa' }));
  const movimientos = Array.from({ length: n }, (_, i) => (i === 0 ? crearApertura : crearIngreso)({
    id: i === 0 ? 'apertura' : `sintetico_${String(i + 1).padStart(6, '0')}`, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 },
    montoMinor: i === 0 ? 10000 : 1, fechaContable: '2026-10-01', periodoId: '2026-10', configuracion: CFG }));
  const resumen = calcularLibro({ movimientos, cuentas: cuentas.map(({ id, moneda, escala }) => ({ id, moneda, escala })), configuracion: CFG, periodoId: '2026-10' });
  const docs = [
    [`usuarios_globales/${admin.uid}`, { iglesiaId, rolGlobal: 'admin_iglesia', pertenenciaId: P, nombre: 'Admin Release2' }],
    [`usuarios_globales/${encargado.uid}`, { iglesiaId, rolGlobal: 'servidor', pertenenciaId: P, nombre: 'Encargado Release2' }],
    [b, { adminUid: admin.uid, nombre: 'Release2 local', modulosActivos: {} }],
    [`${b}/finanzas_config/acceso`, { moduloHabilitado: true, encargadoUid: encargado.uid }],
    [`${b}/finanzas_config/contabilidad`, { versionEsquema: 1, iglesiaId, ...CFG }],
    [`${b}/finanzas_control/protocolo`, { versionProtocolo: 1, iglesiaId, epoca: 1, estado: 'operativo_v1' }],
    [`${b}/finanzas_control/libro`, { versionEsquema: 1, iglesiaId, ultimaSecuencia: n, huboMovimientos: n > 0 }],
    [`${b}/finanzas_control/periodo`, { versionEsquema: 1, iglesiaId, periodosAbiertos: ['2026-10'] }],
    [`${b}/finanzas_resumenes/2026-10`, { versionEsquema: 1, iglesiaId, periodoId: '2026-10', ultimaSecuencia: n, datos: resumen }],
    ...cuentas.flatMap(cuenta => [[`${b}/finanzas_cuentas/${cuenta.id}`, { cuenta }],
      [`${b}/finanzas_saldos/${cuenta.id}`, { versionEsquema: 1, iglesiaId, cuentaId: cuenta.id,
        saldoMinor: cuenta.id === 'caja' ? resumen.saldoFinalMinor : 0, huboMovimientos: cuenta.id === 'caja' && n > 0,
        aperturaRegistrada: cuenta.id === 'caja' && n > 0, solicitudesInciertas: 0, ultimaSecuencia: cuenta.id === 'caja' ? n : 0 }]]),
    ...['ingreso', 'gasto'].map(naturaleza => [`${b}/finanzas_categorias/${naturaleza}`, { categoria: {
      versionEsquema: 1, id: naturaleza, iglesiaId, codigo: naturaleza.toUpperCase(), nombre: naturaleza,
      naturaleza, tipoIngreso: naturaleza === 'ingreso' ? 'diezmos' : null, estado: 'activa' } }]),
    ...movimientos.map((movimiento, i) => [`${b}/finanzas_movimientos/${movimiento.id}`, {
      versionEsquema: 1, iglesiaId, estado: 'confirmado', secuencia: i + 1, movimiento,
      clasificacion: i === 0 ? { cuentaId: 'caja', categoriaId: null, naturaleza: 'patrimonial', tipoIngreso: null } :
        { cuentaId: 'caja', categoriaId: 'ingreso', naturaleza: 'ingreso', tipoIngreso: 'diezmos' },
      privado: { aportante: { nombre: 'NO_PUBLICAR' } }, responsable: { uid: admin.uid, pertenenciaId: P } }])
  ];
  if (n) docs.push([`${b}/finanzas_aperturas/caja`, { versionEsquema: 1, iglesiaId, cuentaId: 'caja', movimientoId: 'apertura', secuencia: 1 }]);
  for (let i = 0; i < docs.length; i += 400) { const batch = db.batch(); docs.slice(i, i + 400).forEach(([p, d]) => batch.create(db.doc(p), d)); await batch.commit(); }
  return { iglesiaId, b, admin, encargado, n };
}
let contador = 0;
function request(f, op, campos, actor = f.admin, solicitudId = `release2_solicitud_${String(++contador).padStart(8, '0')}`) {
  return { auth: { uid: actor.uid }, data: { contexto: { iglesiaId: f.iglesiaId, pertenenciaId: P }, solicitudId, operacion: op, campos } };
}
const gasto = (f, monto = 10, actor) => request(f, 'gasto', { cuentaId: 'caja', categoriaId: 'gasto', montoMinor: monto, fechaContable: '2026-10-24' }, actor);
const reversa = (f, originalId, fecha = '2026-10-24') => request(f, 'reversion', { originalId, fechaContable: fecha, motivo: 'Prueba local', referenciaAuditoria: 'release2' });
async function migrar(f) { await mantenimiento.pausar(f.admin.uid, f.iglesiaId); return mantenimiento.inicializar(f.admin.uid, f.iglesiaId); }
async function query(f, data = {}, actor = f.admin) { return api.consultar({ auth: { uid: actor.uid }, data: {historialPaginado:true,...data} }); }
async function conciliar(f) { await mantenimiento.pausar(f.admin.uid, f.iglesiaId); const r = await mantenimiento.conciliar(f.admin.uid, f.iglesiaId); return r; }
async function entradaVieja(f, req) {
  const [iglesia, acceso, config, periodo, cuenta, categoria] = await Promise.all([
    f.b, `${f.b}/finanzas_config/acceso`, `${f.b}/finanzas_config/contabilidad`, `${f.b}/finanzas_control/periodo`,
    `${f.b}/finanzas_cuentas/caja`, `${f.b}/finanzas_categorias/gasto`].map(p => db.doc(p).get()));
  return { auth: req.auth, operacion: 'gasto', solicitud: { ...req.data.campos, versionEsquema: 1,
    solicitudId: req.data.solicitudId, iglesiaId: f.iglesiaId, periodoId: '2026-10', precondiciones: {
      pertenenciaId: P, iglesia: ver(iglesia), acceso: ver(acceso), configuracion: ver(config),
      controlPeriodo: ver(periodo), cuenta: ver(cuenta), categoria: ver(categoria) } } };
}
test('FIN-RELEASE-2 Firestore Emulator', async t => {
  const f = await fixture(199, 'principal'); let movimiento201;
  await t.test('200 antiguo, migración sin sobrescribir historia, 201 gasto y 202 reversión', async () => {
    const vieja = await entradaVieja(f, gasto(f, 1)); metricas.length = 0;
    const r200 = await crearAdaptadorFirestore({ db: medido, FieldValue }).ejecutar(vieja); assert.equal(r200.secuencia, 200);
    evidencia.lecturas.antes200 = metricas.at(-1);
    const reciboViejo = db.doc(`operaciones_financieras/${f.admin.uid}/solicitudes/${vieja.solicitud.solicitudId}`);
    const copiaRecibo = (await reciboViejo.get()).data();
    const checkpoint = db.doc(`${f.b}/finanzas_checkpoints/sentinela`); await checkpoint.create({contenido:'NO_REINTERPRETAR'});
    const antes = await db.collection(`${f.b}/finanzas_movimientos`).get();
    const inicial = await migrar(f); assert.equal(inicial.corte, 200); assert.equal(inicial.reporte.estado, 'SIN_DIFERENCIAS_OBSERVADAS');
    for (const doc of antes.docs) assert.deepEqual((await doc.ref.get()).data(), doc.data());
    assert.deepEqual((await reciboViejo.get()).data(),copiaRecibo);
    assert.deepEqual((await checkpoint.get()).data(),{contenido:'NO_REINTERPRETAR'});
    const reqVieja = {auth:vieja.auth,data:{contexto:{iglesiaId:f.iglesiaId,pertenenciaId:P},solicitudId:vieja.solicitud.solicitudId,operacion:'gasto',campos:{cuentaId:'caja',categoriaId:'gasto',montoMinor:1,fechaContable:'2026-10-24'}}};
    assert.equal((await api.ejecutar(reqVieja)).historica,true);
    await assert.rejects(crearAdaptadorFirestore({ db, FieldValue }).ejecutar(await entradaVieja(f, gasto(f))), e => e.codigo === 'PROTOCOLO_EPOCA_INCOMPATIBLE');
    metricas.length = 0; movimiento201 = await api.ejecutar(gasto(f, 100)); assert.equal(movimiento201.secuencia, 201);
    evidencia.lecturas.despues201 = metricas.at(-1);
    evidencia.lecturas.capturaIntencion201 = metricas.at(-2);
    const original = (await db.doc(`${f.b}/finanzas_movimientos/${movimiento201.movimientoId}`).get()).data();
    const r202 = await api.ejecutar(reversa(f, movimiento201.movimientoId)); assert.equal(r202.secuencia, 202);
    assert.deepEqual((await db.doc(`${f.b}/finanzas_movimientos/${movimiento201.movimientoId}`).get()).data(), original);
    const q = await query(f); assert.equal(q.saldoTotalMinor, 10197);
    assert.equal((await db.doc(`${f.b}/finanzas_reversiones/${movimiento201.movimientoId}`).get()).data().reversionId, r202.movimientoId);
  });
  await t.test('páginas sin saltos, duplicados ni campos privados; corte estable ante altas', async () => {
    await assert.rejects(api.consultar({auth:{uid:f.admin.uid},data:{}}),e=>e.message==='CLIENTE_HISTORIAL_PAGINADO_REQUERIDO');
    let p = await query(f, { limite: 17 }), seq = [], corte = p.historial.corte;
    await api.ejecutar(gasto(f, 1));
    while (true) {
      assert.equal(JSON.stringify(p.movimientos).includes('NO_PUBLICAR'), false);
      for (const m of p.movimientos) for (const campo of ['privado', 'responsable', 'huella', 'precondiciones', 'solicitudId']) assert.equal(Object.hasOwn(m, campo), false);
      seq.push(...p.movimientos.map(m => m.secuencia));
      if (!p.historial.hayMas) break;
      p = await query(f, { limite: 17, cursor: p.historial.cursorSiguiente }); assert.equal(p.historial.corte, corte);
    }
    assert.equal(seq.length, 202); assert.equal(new Set(seq).size, 202); assert.deepEqual([...seq].sort((a,b)=>a-b), Array.from({length:202},(_,i)=>i+1));
  });
  await t.test('escritor incremental registra 200 y 201 y revierte 201 como 202',async()=>{
    const g=await fixture(199,'frontera'); await migrar(g);
    const r200=await api.ejecutar(gasto(g,1)); const r201=await api.ejecutar(gasto(g,10));
    const r202=await api.ejecutar(reversa(g,r201.movimientoId));
    assert.deepEqual([r200.secuencia,r201.secuencia,r202.secuencia],[200,201,202]);
    const r=await conciliar(g); assert.equal(r.estado,'SIN_DIFERENCIAS_OBSERVADAS');
    evidencia.frontera={secuencias:[r200.secuencia,r201.secuencia,r202.secuencia],revertido:r201.movimientoId,estado:r.estado};
    await mantenimiento.reanudar(g.admin.uid,g.iglesiaId);
  });
  await t.test('idempotencia, respuesta perdida y transferencia conservan saldo consolidado', async () => {
    const req = gasto(f, 2); let perder = true;
    const conexionPerdida = { ...medido, runTransaction: async (...args) => {
      const r = await medido.runTransaction(...args);
      if (perder && r?.estado === 'CONFIRMADA' && !r.historica) { perder = false; throw Error('Transporte perdido después de commit'); }
      return r;
    } };
    const apiPerdida = crearApiIncremental({ db: conexionPerdida, FieldValue, HttpsError });
    await assert.rejects(apiPerdida.ejecutar(req), e=>e.code==='unavailable');
    const replay = await api.ejecutar(req); assert.equal(replay.historica, true);
    const duplicada = gasto(f,1); const dos = await Promise.all([api.ejecutar(duplicada),api.ejecutar(duplicada)]);
    assert.equal(dos[0].movimientoId,dos[1].movimientoId); assert.equal(dos.filter(r=>!r.historica).length,1);
    const antes = await query(f); await api.ejecutar(request(f, 'transferencia', { origenId: 'caja', destinoId: 'banco', montoMinor: 100, fechaContable: '2026-10-24' }));
    const despues = await query(f); assert.equal(despues.saldoTotalMinor, antes.saldoTotalMinor); assert.equal(despues.saldos.banco, 100);
  });
  await t.test('catálogos, apertura, ingreso, gasto y ajuste reutilizan V1; recibos sin duplicados', async () => {
    const solicitud = request(f,'crearCuenta',{cuenta:{codigo:'NUEVA',nombre:'Caja nueva',tipo:'caja'}});
    const cuenta = await api.ejecutar(solicitud); assert.equal((await api.ejecutar(solicitud)).historica,true);
    const categoria = await api.ejecutar(request(f,'crearCategoria',{categoria:{codigo:'DONACIONES',nombre:'Donaciones',naturaleza:'ingreso',tipoIngreso:'donaciones'}}));
    await assert.rejects(api.ejecutar(request(f,'crearCuenta',{cuenta:{codigo:'NUEVA',nombre:'Duplicada',tipo:'caja'}})),e=>e.message==='CODIGO_RESERVADO');
    const saldoAntes = (await query(f)).saldoTotalMinor;
    for (const [op,campos] of [
      ['apertura',{cuentaId:cuenta.cuentaId,montoMinor:500}],
      ['ingreso',{cuentaId:cuenta.cuentaId,categoriaId:categoria.categoriaId,montoMinor:250}],
      ['gasto',{cuentaId:cuenta.cuentaId,categoriaId:'gasto',montoMinor:50}],
      ['ajuste',{cuentaId:cuenta.cuentaId,deltaMinor:-10,motivo:'Ajuste local',referenciaAuditoria:'release2'}]]) {
      await api.ejecutar(request(f,op,{...campos,fechaContable:'2026-10-24'}));
    }
    assert.equal((await query(f)).saldoTotalMinor,saldoAntes+690);
    await assert.rejects(api.ejecutar(request(f,'apertura',{cuentaId:cuenta.cuentaId,montoMinor:1,fechaContable:'2026-10-24'})),e=>e.message==='APERTURA_DUPLICADA');
  });
  await t.test('revocación vigente y aislamiento entre iglesias', async () => {
    assert.ok((await query(f, {}, f.encargado)).permisos.registrarIngresosGastos);
    await db.doc(`${f.b}/finanzas_config/acceso`).update({ encargadoUid: null });
    await assert.rejects(api.ejecutar(gasto(f, 1, f.encargado)), e => e.code === 'permission-denied');
    await assert.rejects(query(f, {}, f.encargado), e => e.code === 'permission-denied');
    const ajena = await fixture(1, 'ajena');
    await assert.rejects(api.ejecutar(gasto(f, 1, ajena.admin)), e => e.message === 'PERTENENCIA_ANTERIOR');
    const p = await query(f); await migrar(ajena);
    await assert.rejects(query(ajena, { cursor: p.historial.cursorSiguiente }), e => e.message === 'CURSOR_AJENO_O_INVALIDO');
  });
  await t.test('cambio de mes, reversión entre períodos y conciliación independiente', async () => {
    const cerrado = (await db.doc(`${f.b}/finanzas_resumenes/2026-10`).get()).data();
    await mantenimiento.cambiarPeriodo(f.admin.uid, f.iglesiaId, '2026-11');
    const ultima = (await db.collection(`${f.b}/finanzas_movimientos`).where('secuencia','==',203).get()).docs[0];
    await api.ejecutar(reversa(f, ultima.id, '2026-11-01'));
    assert.deepEqual((await db.doc(`${f.b}/finanzas_resumenes/2026-10`).get()).data(), cerrado);
    await api.ejecutar(request(f,'crearCuenta',{cuenta:{codigo:'CUENTA_NOV',nombre:'Cuenta de noviembre',tipo:'caja'}}));
    const r = await conciliar(f); assert.equal(r.estado, 'SIN_DIFERENCIAS_OBSERVADAS'); assert.equal(r.certificacionHistorica, false);
    await mantenimiento.reanudar(f.admin.uid, f.iglesiaId);
  });
  await t.test('dos gastos concurrentes no sobregiran', async () => {
    const g = await fixture(1, 'concurrencia'); await migrar(g);
    const rs = await Promise.allSettled([api.ejecutar(gasto(g, 7000)), api.ejecutar(gasto(g, 7000))]);
    assert.equal(rs.filter(r=>r.status==='fulfilled').length,1); assert.equal((await query(g)).saldoTotalMinor,3000);
    assert.equal(rs.find(r=>r.status==='rejected').reason.message,'SALDO_INSUFICIENTE');
  });
  await t.test('límites 50 cuentas y 50 categorías intactos y atómicos', async () => {
    const g=await fixture(0,'catalogos'); await migrar(g);
    for(let i=2;i<50;i++) {
      await api.ejecutar(request(g,'crearCuenta',{cuenta:{codigo:`C_${i}`,nombre:`Cuenta ${i}`,tipo:'caja'}}));
      await api.ejecutar(request(g,'crearCategoria',{categoria:{codigo:`G_${i}`,nombre:`Gasto ${i}`,naturaleza:'gasto',tipoIngreso:null}}));
    }
    for(const [op,campos] of [['crearCuenta',{cuenta:{codigo:'EXCESO',nombre:'Exceso',tipo:'caja'}}],
      ['crearCategoria',{categoria:{codigo:'EXCESO',nombre:'Exceso',naturaleza:'gasto',tipoIngreso:null}}]]) {
      await assert.rejects(api.ejecutar(request(g,op,campos)),e=>e.message==='LIMITE_LIBRO_EXCEDIDO');
    }
    const q=await query(g); assert.equal(q.cuentas.length,50); assert.equal(q.categorias.length,50);assert.equal(q.historial.corte,0);
    assert.equal((await conciliar(g)).estado,'SIN_DIFERENCIAS_OBSERVADAS');
  });
  await t.test('ausencia y corrupción de proyección impiden escrituras; conciliación detecta divergencia', async () => {
    const g = await fixture(1, 'corrupta'); await migrar(g);
    const ref = db.doc(`${g.b}/finanzas_control/incremental_v1`), guardado = (await ref.get()).data();
    await ref.delete(); await assert.rejects(api.ejecutar(gasto(g)), e=>e.message==='PROYECCION_NO_VERIFICADA');
    await ref.create(guardado); await ref.update({'proyeccion.acumulado.saldoFinalMinor':999});
    await assert.rejects(api.ejecutar(gasto(g)),e=>e.message==='PROYECCION_DIVERGENTE');
    const r = await conciliar(g); assert.equal(r.estado,'DIVERGENCIAS');
    assert.equal((await db.doc(`${g.b}/finanzas_control/libro`).get()).data().ultimaSecuencia,1);
  });
  await t.test('migración rechaza divergencia y nunca reinicializa ni legitima historia alterada',async()=>{
    const g=await fixture(2,'divergencia');
    await db.doc(`${g.b}/finanzas_saldos/caja`).update({saldoMinor:999});
    await mantenimiento.pausar(g.admin.uid,g.iglesiaId);
    assert.equal((await mantenimiento.conciliar(g.admin.uid,g.iglesiaId)).estado,'DIVERGENCIAS');
    await assert.rejects(mantenimiento.inicializar(g.admin.uid,g.iglesiaId),e=>e.codigo==='CONCILIACION_REQUERIDA');
    assert.equal((await db.doc(`${g.b}/finanzas_control/incremental_v1`).get()).exists,false);
    assert.equal((await db.doc(`${g.b}/finanzas_control/protocolo`).get()).data().estado,'bloqueado');
    const sana=await fixture(2,'historia'); await migrar(sana);
    await db.doc(`${sana.b}/finanzas_movimientos/sintetico_000002`).update({'movimiento.asientos':[{cuentaId:'caja',deltaMinor:999}]});
    assert.equal((await conciliar(sana)).estado,'DIVERGENCIAS');
    await assert.rejects(mantenimiento.reanudar(sana.admin.uid,sana.iglesiaId),e=>e.codigo==='CONCILIACION_REQUERIDA');
    await assert.rejects(mantenimiento.inicializar(sana.admin.uid,sana.iglesiaId),e=>e.codigo==='NO_REINICIALIZAR_PROYECCIONES');
  });
  await t.test('1001 movimientos sintéticos, gasto 1002 y reversión 1003; lecturas constantes', async () => {
    const g = await fixture(1001, 'mil'); await migrar(g); metricas.length=0;
    const gastoMil = await api.ejecutar(gasto(g,100)); assert.equal(gastoMil.secuencia,1002);
    evidencia.lecturas.despues1002=metricas.at(-1);
    await api.ejecutar(reversa(g,gastoMil.movimientoId)); assert.equal((await query(g)).saldoTotalMinor,11000);
    let p=await query(g), total=0; const ids=new Set();
    while(true) { for(const m of p.movimientos) { assert.equal(ids.has(m.id),false);ids.add(m.id);total++; }
      if(!p.historial.hayMas)break; p=await query(g,{cursor:p.historial.cursorSiguiente}); }
    assert.equal(total,1003);
    const r = await conciliar(g); assert.equal(r.estado,'SIN_DIFERENCIAS_OBSERVADAS');
    evidencia.mil={corte:r.corte,paginados:total,estado:r.estado,certificacionHistorica:r.certificacionHistorica};
    await mantenimiento.reanudar(g.admin.uid,g.iglesiaId);
  });
  await t.test('conciliación no oculta secuencia duplicada al borde de página ni documentos sin secuencia',async()=>{
    for(const sinSecuencia of [false,true]) {
      const g=await fixture(500,sinSecuencia?'sinsecuencia':'duplicada');
      const d=(await db.doc(`${g.b}/finanzas_movimientos/sintetico_000250`).get()).data();
      d.movimiento.id='zz_extra'; if(sinSecuencia)delete d.secuencia;
      await db.doc(`${g.b}/finanzas_movimientos/zz_extra`).create(d);
      await mantenimiento.pausar(g.admin.uid,g.iglesiaId);
      assert.equal((await mantenimiento.conciliar(g.admin.uid,g.iglesiaId)).estado,'DIVERGENCIAS');
      await assert.rejects(mantenimiento.inicializar(g.admin.uid,g.iglesiaId),e=>e.codigo==='CONCILIACION_REQUERIDA');
    }
  });
  evidencia.fixturePrincipal={iglesiaId:f.iglesiaId,correo:`adminprincipal.${corrida}@release2.demo`,total:(await query(f)).saldoTotalMinor};
  fs.writeFileSync(path.resolve(__dirname,'../../docs/fin_release_2_2026-10-24/emulador.json'),JSON.stringify(evidencia,null,2));
});
test.after(async()=>{await db.terminate();});
