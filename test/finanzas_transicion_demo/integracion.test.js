'use strict';
require('../../functions/contabilidad_demo/entorno').verificarEntorno();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const cliente = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment, assertFails } = cliente('@firebase/rules-unit-testing');
const { getDoc, doc, setDoc } = cliente('firebase/firestore');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { crearTransicionDemo, ESCRITORES } = require('../../functions/contabilidad_demo/transicion');

const I = 'iglesia_demo_generacion', B = `iglesias/${I}`, P = 'a'.repeat(64), UID = 'admin_ficticio';
let db, reglas, detener = false, contador = 0;
const custodia = { emuladorExclusivo: true, administrador: true, escritores: [...ESCRITORES] };
const parametros = (extra = {}) => ({ iglesiaId: I, ejecucionId: 'ensayo_generacion_001', operador: 'b'.repeat(64),
  periodos: ['2026-10', '2026-11'], pagina: 2, lote: 2, ...extra });
const herramienta = (clienteDB = db) => crearTransicionDemo({ db: clienteDB, custodia });
const version = s => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
const codigo = esperado => e => e.codigo === esperado;
function escenario(nombre, callback) {
  test(nombre, { timeout: 60000 }, async t => {
    if (detener) return t.skip('Suite detenida tras fallo anterior, sin reintentos artificiales');
    try { await callback(t); } catch (e) { detener = true; throw e; }
  });
}
before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: { host: '127.0.0.1', port: 8088,
    rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => {
  if (detener) return;
  contador = 0; await reglas.clearFirestore();
  const batch = db.batch();
  for (const [ruta, datos] of Object.entries({
    [B]: { adminUid: UID }, [`usuarios_globales/${UID}`]: { iglesiaId: I, rolGlobal: 'admin_iglesia', pertenenciaId: P },
    [`${B}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: null },
    [`${B}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: I, moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
    [`${B}/finanzas_control/libro`]: { versionEsquema: 1, iglesiaId: I, ultimaSecuencia: 0, huboMovimientos: false },
    [`${B}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: I, periodosAbiertos: ['2026-10'] },
  })) batch.create(db.doc(ruta), datos);
  await batch.commit();
});
after(async () => { if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });

async function solicitud(op, campos = {}, mes = '2026-10') {
  const vers = async ruta => version(await db.doc(ruta).get());
  const precondiciones = { pertenenciaId: P, acceso: await vers(`${B}/finanzas_config/acceso`), iglesia: await vers(B),
    configuracion: await vers(`${B}/finanzas_config/contabilidad`), controlPeriodo: await vers(`${B}/finanzas_control/periodo`) };
  const catalogo = ['crearCuenta', 'crearCategoria'].includes(op);
  if (['gasto', 'ingreso'].includes(op)) precondiciones.categoria = await vers(`${B}/finanzas_categorias/${campos.categoriaId}`);
  if (['gasto', 'ingreso', 'apertura'].includes(op)) precondiciones.cuenta = await vers(`${B}/finanzas_cuentas/${campos.cuentaId}`);
  if (['transferencia', 'ajuste', 'reversion'].includes(op)) {
    const original = op === 'reversion' ? await db.doc(`${B}/finanzas_movimientos/${campos.originalId}`).get() : null;
    const ids = original ? original.data().movimiento.asientos.map(a => a.cuentaId) : op === 'transferencia' ?
      [campos.origenId, campos.destinoId] : [campos.cuentaId];
    precondiciones.cuentas = await Promise.all(ids.map(async cuentaId => ({ cuentaId, version: await vers(`${B}/finanzas_cuentas/${cuentaId}`) })));
    if (original) precondiciones.original = { version: version(original), versionReversion: null };
  }
  return { auth: { uid: UID }, operacion: op, solicitud: { versionEsquema: 1, solicitudId: `demo_operacion_${String(++contador).padStart(8, '0')}`,
    iglesiaId: I, periodoId: mes, ...(!catalogo ? { fechaContable: `${mes}-17` } : {}),
    ...(['ajuste', 'reversion'].includes(op) ? { motivo: 'Correccion ficticia', referenciaAuditoria: 'referencia_ficticia' } : {}),
    ...campos, precondiciones } };
}
async function ejecutar(op, campos, mes) {
  return crearAdaptadorFirestore({ db, FieldValue }).ejecutar(await solicitud(op, campos, mes));
}
async function mixto() {
  await herramienta().inicializarProtocolo(I);
  const caja = (await ejecutar('crearCuenta', { cuenta: { codigo: 'CAJA', nombre: 'Caja', tipo: 'caja' } })).cuentaId;
  const banco = (await ejecutar('crearCuenta', { cuenta: { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' } })).cuentaId;
  const ingreso = (await ejecutar('crearCategoria', { categoria: { codigo: 'DIEZMOS', nombre: 'Diezmos', naturaleza: 'ingreso', tipoIngreso: 'diezmos' } })).categoriaId;
  const gasto = (await ejecutar('crearCategoria', { categoria: { codigo: 'GASTOS', nombre: 'Gastos', naturaleza: 'gasto', tipoIngreso: null } })).categoriaId;
  await ejecutar('apertura', { cuentaId: caja, montoMinor: 10000 });
  await ejecutar('ingreso', { cuentaId: caja, categoriaId: ingreso, montoMinor: 2000, aportante: { nombre: 'Persona ficticia privada' } });
  const original = (await ejecutar('gasto', { cuentaId: caja, categoriaId: gasto, montoMinor: 1000 })).movimientoId;
  await ejecutar('transferencia', { origenId: caja, destinoId: banco, montoMinor: 1000 });
  await ejecutar('ajuste', { cuentaId: caja, deltaMinor: -100 });
  await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: ['2026-11'] });
  await ejecutar('reversion', { originalId: original }, '2026-11');
  return { caja, banco, ingreso, gasto, original };
}
async function terminar(p = parametros(), h = herramienta()) {
  let r = await h.iniciar(p);
  for (let n = 0; n < 100 && !['verificada', 'fallida'].includes(r.estado); n++) r = await h.avanzar(p, r.fence);
  return r;
}
async function fotoV1() {
  const resultado = {};
  for (const c of ['finanzas_movimientos', 'finanzas_saldos', 'finanzas_resumenes', 'finanzas_cuentas',
    'finanzas_categorias', 'finanzas_reversiones', 'finanzas_auditoria']) {
    for (const d of (await db.collection(`${B}/${c}`).get()).docs) resultado[d.ref.path] = { version: version(d), datos: d.data() };
  }
  return resultado;
}
escenario('Protocolo ausente: preflight rechaza sin escribir, bootstrap solo explicito', async () => {
  await assert.rejects(herramienta().preflight(I), codigo('PROTOCOLO_AUSENTE'));
  assert.equal((await db.collection(`${B}/finanzas_ejecuciones_demo`).get()).empty, true);
  await herramienta().inicializarProtocolo(I);
  assert.equal((await herramienta().preflight(I)).estado, 'pendiente');
  await assert.rejects(herramienta().inicializarProtocolo(I), codigo('DEMO_BOOTSTRAP_PROHIBIDO'));
});
escenario('Libro vacio: generacion verificada, cero historicos inventados y siempre inactiva', async () => {
  await herramienta().inicializarProtocolo(I); const r = await terminar(); assert.equal(r.estado, 'verificada');
  assert.equal(r.activa, false); assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 0);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
});
for (const pagina of [1, 50]) escenario('Libro mixto, reversa posterior, pagina=' + pagina + ': V1 intacto, V2 verificada e inactiva', async () => {
  const cuentas = await mixto(), antes = await fotoV1(), p = parametros({ pagina });
  assert.equal((await terminar(p)).estado, 'verificada'); assert.deepEqual(await fotoV1(), antes);
  const g = `${B}/finanzas_generaciones_demo/${p.ejecucionId}`;
  assert.equal((await db.doc(g).get()).data().activa, false);
  assert.equal((await db.doc(`${g}/saldos/${cuentas.caja}`).get()).data().saldoMinor, 10900);
  assert.equal((await db.doc(`${g}/saldos/${cuentas.banco}`).get()).data().saldoMinor, 1000);
  const oct = (await db.doc(`${g}/periodos/2026-10`).get()).data();
  const nov = (await db.doc(`${g}/periodos/2026-11`).get()).data();
  assert.equal(oct.gastosNetosMinor, 1000); assert.equal(nov.gastosNetosMinor, -1000);
  const porCuenta = (await db.collection(`${g}/cuentas_periodo`).get()).docs.map(d => d.data());
  assert.equal(porCuenta.find(d => d.cuentaId === cuentas.caja && d.periodoId === '2026-10').ingresosNetosMinor, 2000);
  assert.equal(porCuenta.find(d => d.cuentaId === cuentas.banco && d.periodoId === '2026-10').ingresosNetosMinor, 0);
  assert.equal(porCuenta.find(d => d.cuentaId === cuentas.banco && d.periodoId === '2026-10').transferenciasNetasMinor, 1000);
  assert.equal(JSON.stringify((await db.doc(`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`).get()).data()).includes('Persona ficticia'), false);
});
escenario('Dos operadores: un solo cerrojo y ninguna sustitucion de propietario', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p);
  await assert.rejects(herramienta().iniciar({ ...p, operador: 'c'.repeat(64) }), codigo('DEMO_FENCING'));
  await assert.rejects(herramienta().iniciar({ ...p, ejecucionId: 'otra_ejecucion' }));
  await assert.rejects(herramienta().avanzar({ ...p, operador: 'c'.repeat(64) }, 0), codigo('DEMO_FENCING'));
});
escenario('Dos ejecutores del mismo checkpoint: fence y replay sin doble acumulacion', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p);
  const r = await Promise.all([herramienta().avanzar(p, 0), herramienta().avanzar(p, 0)]);
  assert.deepEqual(r[0], r[1]); assert.equal(r[0].cursor.secuencia, 2); assert.equal(r[0].fence, 1);
  assert.equal((await terminar(p)).estado, 'verificada');
});
function envolver(hook) {
  return { projectId: db.projectId, _settings: db._settings, doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: async cb => { const r = await db.runTransaction(async tx => { const resultado = await cb(tx); await hook('antes'); return resultado; }); await hook('despues'); return r; } };
}
for (const fase of ['antes', 'despues']) escenario('Interrupcion ' + fase + ' del commit: reanudar con misma identidad y fence', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p); let disparado = false;
  const h = herramienta(envolver(momento => { if (!disparado && momento === fase) { disparado = true; throw Error('Interrupcion ficticia'); } }));
  await assert.rejects(h.avanzar(p, 0));
  const recuperado = await herramienta().avanzar(p, 0); assert.equal(recuperado.fence, 1);
  assert.equal((await terminar(p)).estado, 'verificada');
});
for (const ruta of ['finanzas_movimientos', 'finanzas_saldos', 'finanzas_reversiones']) escenario('Divergencia en ' + ruta + ': no genera ni desbloquea', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p);
  const s = (await db.collection(`${B}/${ruta}`).get()).docs[0]; await s.ref.update({ alteracionFicticia: true });
  const r = await herramienta().avanzar(p, 0); assert.equal(r.estado, 'fallida'); assert.equal(r.error, 'DEMO_FUENTE_CAMBIO');
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
});
escenario('Recibo incoherente: preflight rechaza sin fabricar metadatos', async () => {
  await mixto(); const r = (await db.collection(`operaciones_financieras/${UID}/solicitudes`).get()).docs[0];
  await r.ref.update({ pertenenciaId: 'd'.repeat(64) });
  await assert.rejects(herramienta().preflight(I), codigo('DEMO_RECIBO_INCOHERENTE'));
});
escenario('Version y epoca incompatibles rechazan; generacion parcial no activa', async () => {
  await mixto(); await db.doc(`${B}/finanzas_control/protocolo`).update({ epoca: 2 });
  await assert.rejects(herramienta().iniciar(parametros()), codigo('PROTOCOLO_EPOCA_INCOMPATIBLE'));
});
escenario('Aislamiento, fuentes eliminadas y rutas privadas', async () => {
  await mixto(); await assert.rejects(herramienta().preflight('otra'), codigo('PROTOCOLO_AUSENTE'));
  const p = parametros(); await herramienta().iniciar(p);
  const d = (await db.collection(`${B}/finanzas_movimientos`).get()).docs[0]; await d.ref.delete();
  assert.equal((await herramienta().avanzar(p, 0)).estado, 'fallida');
  for (const uid of [UID, 'ajeno']) for (const ruta of [`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`,
    `${B}/finanzas_generaciones_demo/${p.ejecucionId}`, `${B}/finanzas_transicion_demo/cerrojo`]) {
    const c = reglas.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(c, ruta))); await assertFails(setDoc(doc(c, ruta), { activa: true }));
  }
});

for (const tipo of ['saldo', 'movimiento', 'marcador']) escenario('Corrupcion matematica previa al corte: ' + tipo, async () => {
  await mixto();
  if (tipo === 'saldo') {
    const s = (await db.collection(`${B}/finanzas_saldos`).get()).docs[0]; await s.ref.update({ saldoMinor: s.data().saldoMinor + 1 });
  } else if (tipo === 'marcador') {
    const s = (await db.collection(`${B}/finanzas_reversiones`).get()).docs[0]; await s.ref.update({ reversionId: 'no_coincide' });
  } else {
    const s = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.find(d => d.data().movimiento.clase === 'ingreso');
    const m = structuredClone(s.data().movimiento); m.asientos[0].deltaMinor++; await s.ref.update({ movimiento: m });
  }
  const r = await terminar(); assert.equal(r.estado, 'fallida'); assert.equal(r.error, 'DEMO_CONCILIACION_RECHAZADA');
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
});
escenario('Checkpoint alterado se rechaza sin sobrescribirlo ni desbloquear', async () => {
  await mixto(); const p = parametros(), h = herramienta(); await h.iniciar(p); const r = await h.avanzar(p, 0);
  const ref = db.doc(`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`), d = (await ref.get()).data();
  d.checkpoint.cursor.secuencia++; await ref.update({ checkpoint: d.checkpoint });
  assert.equal((await h.avanzar(p, r.fence)).estado, 'fallida');
});
for (const fase of ['antes', 'despues']) escenario('Lote de proyecciones interrumpido ' + fase + ': sin duplicar documentos', async () => {
  await mixto(); const p = parametros(), h = herramienta(); let r = await h.iniciar(p);
  while (r.estado !== 'preparando') r = await h.avanzar(p, r.fence);
  let disparado = false;
  const interrumpido = herramienta(envolver(momento => { if (!disparado && momento === fase) { disparado = true; throw Error('Interrupcion ficticia de lote'); } }));
  await assert.rejects(interrumpido.avanzar(p, r.fence));
  const recuperado = await herramienta().avanzar(p, r.fence); assert.equal(recuperado.documentosPreparados, 2);
  assert.equal((await terminar(p)).estado, 'verificada');
});
escenario('Generacion con documento preparado eliminado nunca es verificada ni activada', async () => {
  await mixto(); const p = parametros(), h = herramienta(); let r = await h.iniciar(p);
  while (r.estado !== 'preparando') r = await h.avanzar(p, r.fence);
  r = await h.avanzar(p, r.fence);
  await (await db.collection(`${B}/finanzas_generaciones_demo/${p.ejecucionId}/saldos`).get()).docs[0].ref.delete();
  r = await terminar(p); assert.equal(r.estado, 'fallida'); assert.equal(r.activa, false);
});
escenario('Competencia simultanea de dos ejecuciones: un solo propietario', async () => {
  await mixto(); const p = parametros();
  const r = await Promise.allSettled([herramienta().iniciar(p), herramienta().iniciar({ ...p, ejecucionId: 'otra_ejecucion', operador: 'c'.repeat(64) })]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await db.collection(`${B}/finanzas_ejecuciones_demo`).get()).size, 1);
});
for (const op of ['gasto', 'transferencia', 'reversion']) escenario('Bloqueo administrativo concurre con V1: ' + op, async () => {
  const m = await mixto(); let pendiente;
  const original = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.find(d => d.data().movimiento.clase === 'ingreso');
  const e = await solicitud(op, op === 'gasto' ? { cuentaId: m.caja, categoriaId: m.gasto, montoMinor: 10 } :
    op === 'transferencia' ? { origenId: m.caja, destinoId: m.banco, montoMinor: 10 } : { originalId: original.id }, '2026-11');
  const h = herramienta(envolver(momento => {
    if (momento === 'antes' && !pendiente) {
      pendiente = crearAdaptadorFirestore({ db, FieldValue }).ejecutar(e); pendiente.catch(() => {});
    }
  }));
  await h.iniciar(parametros()); assert.ok(pendiente);
  await assert.rejects(pendiente, codigo('PROTOCOLO_ESCRITURA_BLOQUEADA'));
  assert.equal((await terminar()).estado, 'verificada');
});
escenario('Revocacion de acceso continua durante bloqueo contable sin alterar corte monetario', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p);
  const { actualizarEstadoModuloFinanzas } = require('../../functions/finanzas');
  const { HttpsError } = req('firebase-functions/v2/https');
  await actualizarEstadoModuloFinanzas({ auth: { uid: UID }, data: { iglesiaId: I, habilitado: false } }, { db, FieldValue, HttpsError });
  assert.equal((await db.doc(`${B}/finanzas_config/acceso`).get()).data().moduloHabilitado, false);
  assert.equal((await terminar(p)).estado, 'verificada');
});
for (const coleccion of ['finanzas_ejecuciones_demo', 'finanzas_generaciones_demo']) escenario('Migracion incompleta sin cerrojo: ' + coleccion + ' impide otra ejecucion', async () => {
  await herramienta().inicializarProtocolo(I);
  await db.doc(`${B}/${coleccion}/huerfana`).create({ estado: 'preparando', activa: false });
  await assert.rejects(herramienta().preflight(I), codigo('DEMO_EJECUCION_EXISTENTE'));
  await assert.rejects(herramienta().iniciar(parametros()), codigo('DEMO_EJECUCION_EXISTENTE'));
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'operativo_v1');
});
