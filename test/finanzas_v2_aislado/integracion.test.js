'use strict';
require('./entorno').verificarEntorno();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const cliente = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue, Timestamp } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment, assertFails } = cliente('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, setLogLevel } = cliente('firebase/firestore');
const { crearAdaptadorFirestoreV2 } = require('../../functions/finanzas_core/adaptador_firestore_v2');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { semilla, entrada, libro, I, A, E, P, B, G } = require('./fixtures');
let db, reglas;
setLogLevel('silent');
before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  assert.equal(db._settings.servicePath, '127.0.0.1'); assert.equal(db._settings.port, 8088);
  assert.equal(db._settings.ssl, false);
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: { host: '127.0.0.1', port: 8088,
    rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
});
async function sembrar(n = 1) {
  const docs = Object.entries(semilla(n).docs);
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch(); for (const [ruta, d] of docs.slice(i, i + 400)) b.set(db.doc(ruta), d); await b.commit();
  }
}
beforeEach(async () => { await reglas.clearFirestore(); await sembrar(); });
after(async () => { if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });
function adaptar({ despuesCallback, despuesCommit, antesLectura, falloEscritura } = {}) {
  const metricas = { intentos: 0, lecturas: 0, escrituras: 0, rutas: [] };
  const inyectado = { doc: db.doc.bind(db), runTransaction: async fn => {
    const r = await db.runTransaction(async tx => {
      metricas.intentos++; let escribiendo = false;
      const proxy = new Proxy(tx, { get(t, k) {
        if (k === 'get') return async ref => {
          assert.equal(escribiendo, false); assert.equal(typeof ref.path, 'string', 'Solo lecturas documentales');
          metricas.lecturas++; metricas.rutas.push(ref.path);
          if (antesLectura) await antesLectura(ref, metricas);
          return t.get(ref);
        };
        if (['create', 'update', 'set', 'delete'].includes(k)) return (...args) => {
          escribiendo = true; metricas.escrituras++;
          if (falloEscritura) falloEscritura(metricas);
          return t[k](...args);
        };
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      } });
      const r = await fn(proxy); if (despuesCallback) await despuesCallback(metricas); return r;
    });
    if (despuesCommit) await despuesCommit(); return r;
  } };
  return { ...crearAdaptadorFirestoreV2({ db: inyectado, FieldValue }), metricas };
}
const codigo = c => e => e.codigo === c;
async function sinCambios(fn) {
  const antes = await foto(); await assert.rejects(fn); assert.deepEqual(await foto(), antes);
}
async function foto() {
  const docs = {}; const recorrer = async ref => {
    for (const c of await ref.listCollections()) for (const d of (await c.get()).docs) {
      docs[d.ref.path] = d.data(); await recorrer(d.ref);
    }
  };
  for (const c of await db.listCollections()) for (const d of (await c.get()).docs) {
    docs[d.ref.path] = d.data(); await recorrer(d.ref);
  }
  return docs;
}
test('gasto real: siete documentos con updateTime identico y saldo/libro equivalentes', async () => {
  const a = adaptar(), e = await entrada(db), r = await a.ejecutar(e);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${G}/saldos/caja`, `${G}/periodos/2026-10`,
    `${G}/consolidados/CLP`, `${G}/control/libro`, `${B}/finanzas_auditoria/${r.movimientoId}`,
    `operaciones_financieras/${A}/solicitudes/${e.solicitud.solicitudId}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p)));
  docs.forEach(d => { assert.ok(d.updateTime instanceof Timestamp); assert.ok(d.updateTime.isEqual(docs[0].updateTime)); });
  assert.ok(docs[0].data().fechaCreacion instanceof Timestamp);
  const movimientos = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
  const l = libro(movimientos); assert.equal(l.saldoFinalMinor, 6000); assert.equal(l.gastosNetosMinor, 4000);
  assert.equal(docs[1].data().proyeccion.saldoMinor, l.saldoFinalPorCuenta.caja);
  assert.equal(docs[2].data().datos.resultadoMinor, l.resultadoMinor);
  assert.equal(docs[3].data().datos.saldoFinalMinor, l.saldoFinalMinor);
  assert.equal(a.metricas.escrituras, 7); assert.equal(a.metricas.lecturas, 17);
});
test('encargado vigente puede gastar; no depende de elegibilidad', async () => {
  const a = adaptar(); assert.equal((await a.ejecutar(await entrada(db, E))).estado, 'CONFIRMADA');
  assert.equal(a.metricas.lecturas, 18);
});
for (const [nombre, ruta, cambio] of [
  ['inactiva', G, { activa: false }],
  ['V1', `${B}/finanzas_control/protocolo`, { estado: 'operativo_v1' }],
  ['bloqueado', `${B}/finanzas_control/protocolo`, { estado: 'bloqueado' }],
  ['epoca', `${B}/finanzas_control/protocolo`, { epoca: 2 }],
  ['puntero', `${B}/finanzas_control/generacion_v2`, { generacionId: 'otra' }],
  ['modulo', `${B}/finanzas_config/acceso`, { moduloHabilitado: false }],
  ['periodo cerrado', `${B}/finanzas_control/periodo`, { periodosAbiertos: [] }],
  ['pertenencia anterior', `usuarios_globales/${A}`, { pertenenciaId: 'b'.repeat(64) }],
  ['iglesia ajena', `usuarios_globales/${A}`, { iglesiaId: 'otra' }],
  ['control desfasado', `${G}/periodos/2026-10`, { revision: 0 }],
]) test(`rechazo real sin escrituras: ${nombre}`, async () => {
  const e = await entrada(db); await db.doc(ruta).update(cambio);
  await sinCambios(() => adaptar().ejecutar(e));
});
test('saldo insuficiente no cambia documentos', async () => {
  const e = await entrada(db); e.solicitud.montoMinor = 10001; await sinCambios(() => adaptar().ejecutar(e));
});
test('idempotencia y payload distinto sin doble contabilizacion', async () => {
  const e = await entrada(db), a = adaptar(), r = await a.ejecutar(e), antes = await foto();
  const repetida = await a.ejecutar(e); assert.equal(repetida.historica, true); assert.equal(repetida.movimientoId, r.movimientoId);
  assert.deepEqual(await foto(), antes); e.solicitud.montoMinor++;
  await assert.rejects(() => a.ejecutar(e), codigo('RECIBO_NO_COINCIDE')); assert.deepEqual(await foto(), antes);
});
test('respuesta perdida post-commit recupera exactamente el mismo recibo', async () => {
  const e = await entrada(db), a = adaptar({ despuesCommit: () => { throw Error('Respuesta perdida simulada'); } });
  await assert.rejects(() => a.ejecutar(e), codigo('RESULTADO_INCIERTO'));
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
});
test('error despues de preparar escrituras no deja commit parcial', async () => {
  const e = await entrada(db), a = adaptar({ falloEscritura: m => { if (m.escrituras === 4) throw Error('Fallo inyectado'); } });
  await sinCambios(() => a.ejecutar(e));
});
test('dos gastos reales concurrentes con fondos para uno', async () => {
  const e = await entrada(db), otra = structuredClone(e); e.solicitud.montoMinor = otra.solicitud.montoMinor = 7000;
  otra.solicitud.solicitudId = 'solicitud_sintetica_0002';
  const rs = await Promise.allSettled([adaptar().ejecutar(e), adaptar().ejecutar(otra)]);
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(rs.find(r => r.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal((await db.doc(`${G}/saldos/caja`).get()).data().proyeccion.saldoMinor, 3000);
  assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 2);
});
test('callback real reintentado tras ABORTED simulado aplica una sola vez', async () => {
  const e = await entrada(db), a = adaptar({ despuesCallback: m => {
    if (m.intentos === 1) { const error = Error('ABORTED simulado'); error.code = 10; throw error; }
  } });
  await a.ejecutar(e); assert.equal(a.metricas.intentos, 2);
  assert.equal((await db.doc(`${G}/saldos/caja`).get()).data().proyeccion.saldoMinor, 6000);
  assert.equal((await db.collection(`${B}/finanzas_auditoria`).get()).size, 1);
});
for (const [nombre, ruta, cambio] of [
  ['revocacion', `${B}/finanzas_config/acceso`, { encargadoUid: null }],
  ['transferencia administrativa', B, { adminUid: E }],
]) test(`cambio antes de lectura transaccional: ${nombre}`, async () => {
  const e = await entrada(db, E); let cambiado = false;
  const a = adaptar({ antesLectura: async r => { if (!cambiado && r.path === ruta) {
    cambiado = true; await db.doc(ruta).update(cambio);
  } } });
  await assert.rejects(() => a.ejecutar(e)); assert.equal(a.metricas.escrituras, 0);
});
test('201 y 1001 historicos reales: mismo numero de lecturas, saldo reconstruido', async () => {
  const mediciones = [];
  for (const n of [201, 1001]) {
    await reglas.clearFirestore(); await sembrar(n); const a = adaptar(), e = await entrada(db);
    await a.ejecutar(e); assert.equal(a.metricas.intentos, 1); mediciones.push(a.metricas.lecturas);
    assert.equal(a.metricas.rutas.filter(p => p.includes('/finanzas_movimientos/')).length, 1);
    const ms = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
    const l = libro(ms); assert.equal(ms.length, n + 1);
    assert.equal((await db.doc(`${G}/saldos/caja`).get()).data().proyeccion.saldoMinor, l.saldoFinalMinor);
  }
  assert.deepEqual(mediciones, [17, 17]);
});
test('SDK cliente: recibos y proyecciones privados; auditoria solo responsables vigentes; ninguna escritura', async () => {
  const e = await entrada(db), r = await adaptar().ejecutar(e);
  const admin = reglas.authenticatedContext(A).firestore(), ajeno = reglas.authenticatedContext('ajeno_sintetico').firestore();
  for (const ruta of [`operaciones_financieras/${A}/solicitudes/${e.solicitud.solicitudId}`,
    `${G}/saldos/caja`, `${B}/finanzas_control/generacion_v2`]) {
    await assertFails(getDoc(doc(admin, ruta))); await assertFails(getDoc(doc(ajeno, ruta)));
  }
  const auditoria = `${B}/finanzas_auditoria/${r.movimientoId}`;
  assert.equal((await getDoc(doc(admin, auditoria))).exists(), true);
  await assertFails(getDoc(doc(ajeno, auditoria))); await assertFails(setDoc(doc(admin, auditoria), { falsificado: true }));
  assert.equal(JSON.stringify((await db.doc(auditoria).get()).data()).includes('descripcion'), false);
});
test('recibo creado realmente por V1 es consultable por V2 sin modificarlo', async () => {
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'operativo_v1' });
  await db.doc(`${B}/finanzas_control/libro`).set({ versionEsquema: 1, iglesiaId: I, ultimaSecuencia: 1, huboMovimientos: true });
  await db.doc(`${B}/finanzas_saldos/caja`).set({ versionEsquema: 1, iglesiaId: I, cuentaId: 'caja',
    huboMovimientos: true, saldoMinor: 10000, solicitudesInciertas: 0, aperturaRegistrada: true, ultimaSecuencia: 1 });
  // El historico sintetico comun tiene esquema V2; solo este fixture crea su base V1.
  await db.doc(`${B}/finanzas_movimientos/sintetico_0`).update({ versionEsquema: 1 });
  const e = await entrada(db), v1 = crearAdaptadorFirestore({ db, FieldValue });
  const r = await v1.ejecutar({ auth: e.auth, operacion: 'gasto', solicitud: e.solicitud });
  const antes = await foto(); const nuevo = await adaptar().ejecutar(e);
  assert.equal(nuevo.versionEsquema, 1); assert.equal(nuevo.historica, true);
  assert.equal(nuevo.movimientoId, r.movimientoId); assert.deepEqual(await foto(), antes);
});
test('admin-6 reconoce los bytes V2 acreditados; no habilita generaciones', () => {
  const c = require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes();
  assert.equal(c.metadatos.inventarioId, 'admin-6'); assert.match(c.huellaSoftware, /^[a-f0-9]{64}$/);
});
for (const transferencia of [false, true]) test(`carrera real observada: ${transferencia ? 'transferencia de titularidad' : 'revocacion de encargado'}`, async () => {
  const actor = transferencia ? A : E, e = await entrada(db, actor);
  const a = adaptar();
  const modificar = async () => {
    if (!transferencia) return db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null });
    const b = db.batch(); b.update(db.doc(B), { adminUid: E });
    b.update(db.doc(`usuarios_globales/${A}`), { rolGlobal: 'servidor' });
    b.update(db.doc(`usuarios_globales/${E}`), { rolGlobal: 'admin_iglesia' }); return b.commit();
  };
  const [operacion, cambio] = await Promise.allSettled([a.ejecutar(e), modificar()]);
  assert.equal(cambio.status, 'fulfilled');
  if (operacion.status === 'fulfilled') {
    const m = await db.doc(`${B}/finanzas_movimientos/${operacion.value.movimientoId}`).get();
    const c = await db.doc(transferencia ? B : `${B}/finanzas_config/acceso`).get();
    assert.ok(m.updateTime.toMillis() <= c.updateTime.toMillis(), 'Commit debe preceder a la revocacion');
    assert.ok(m.updateTime.seconds < c.updateTime.seconds || (m.updateTime.seconds === c.updateTime.seconds &&
      m.updateTime.nanoseconds <= c.updateTime.nanoseconds));
  } else {
    assert.ok(['CONTABILIDAD_NO_AUTORIZADA', 'CONTEXTO_OPERACION_MODIFICADO'].includes(operacion.reason.codigo));
    assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 1);
  }
  // Cualquiera de los dos ordenes es valido; una carrera observada no demuestra
  // todos los intercalados posibles. Las lecturas bajo lock definen el orden.
});
test('rechazo por desbordamiento de secuencia con SDK real no escribe parcialmente', async () => {
  for (const p of ['control/libro', 'consolidados/CLP', 'periodos/2026-10']) {
    await db.doc(`${G}/${p}`).update({ revision: Number.MAX_SAFE_INTEGER, ultimoMovimientoId: 'ultimo_historico' });
  }
  const e = await entrada(db); await sinCambios(() => adaptar().ejecutar(e));
});
