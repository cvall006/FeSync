'use strict';
require('./entorno').verificarEntorno(); // Siempre ANTES de importar Admin/SDK cliente.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const reqCliente = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue, Timestamp } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment, assertSucceeds, assertFails } = reqCliente('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel } = reqCliente('firebase/firestore');
const { crearAdaptadorFirestore, LIMITES } = require('../../functions/finanzas_core/adaptador_firestore');
const { crearApertura, crearIngreso, calcularLibro } = require('../../functions/finanzas_core/asientos');

const B = 'iglesias/fin7b', P = 'a'.repeat(64), ADMIN = 'admin_fin7b', ENC = 'encargado_fin7b';
const clave = 'fin7b_solicitud_0001';
let db, reglas, detener = false;
setLogLevel('silent');
const version = s => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
const cod = codigo => e => e.codigo === codigo;

// Un defecto detiene escenarios posteriores: no se repite una prueba fallida.
function escenario(nombre, ejecutar) {
  test(nombre, { timeout: 45000 }, async t => {
    if (detener) return t.skip('Pendiente: se detuvo la suite tras un defecto o fallo anterior.');
    try { await ejecutar(t); } catch (e) { detener = true; throw e; }
  });
}
function semilla() {
  const cuenta = { versionEsquema: 1, id: 'caja', iglesiaId: 'fin7b', codigo: 'CAJA', nombre: 'Caja',
    tipo: 'caja', moneda: 'CLP', escala: 0, estado: 'activa' };
  const categoria = { versionEsquema: 1, id: 'gastos', iglesiaId: 'fin7b', codigo: 'GASTOS', nombre: 'Gastos',
    naturaleza: 'gasto', tipoIngreso: null, estado: 'activa' };
  const apertura = crearApertura({ id: 'apertura', fechaContable: '2026-10-01', periodoId: '2026-10',
    cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 10000 });
  return {
    [`usuarios_globales/${ADMIN}`]: { iglesiaId: 'fin7b', rolGlobal: 'admin_iglesia', pertenenciaId: P, descripcion: 'Conservar' },
    [`usuarios_globales/${ENC}`]: { iglesiaId: 'fin7b', rolGlobal: 'servidor', pertenenciaId: P },
    [B]: { adminUid: ADMIN },
    [`${B}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: ENC },
    [`${B}/finanzas_control/protocolo`]: { iglesiaId: 'fin7b', versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' },
    [`${B}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: 'fin7b', moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
    [`${B}/finanzas_control/libro`]: { versionEsquema: 1, iglesiaId: 'fin7b', ultimaSecuencia: 1, huboMovimientos: true, auxiliar: 'Conservar' },
    [`${B}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: 'fin7b', periodosAbiertos: ['2026-10'] },
    [`${B}/finanzas_cuentas/caja`]: { cuenta, auxiliar: 'Conservar' },
    [`${B}/finanzas_categorias/gastos`]: { categoria, auxiliar: 'Conservar' },
    [`${B}/finanzas_saldos/caja`]: { versionEsquema: 1, iglesiaId: 'fin7b', cuentaId: 'caja', huboMovimientos: true,
      saldoMinor: 10000, solicitudesInciertas: 0, aperturaRegistrada: true, ultimaSecuencia: 1, auxiliar: 'Conservar' },
    [`${B}/finanzas_movimientos/apertura`]: { versionEsquema: 1, iglesiaId: 'fin7b', secuencia: 1, estado: 'confirmado', movimiento: apertura },
  };
}
async function entrada(uid = ADMIN, solicitudId = clave) {
  const rutas = { acceso: 'finanzas_config/acceso', iglesia: '', cuenta: 'finanzas_cuentas/caja',
    categoria: 'finanzas_categorias/gastos', configuracion: 'finanzas_config/contabilidad', controlPeriodo: 'finanzas_control/periodo' };
  const versiones = {};
  for (const [k, ruta] of Object.entries(rutas)) versiones[k] = version(await db.doc(ruta ? `${B}/${ruta}` : B).get());
  return { auth: { uid }, operacion: 'gasto', solicitud: { versionEsquema: 1, solicitudId,
    iglesiaId: 'fin7b', cuentaId: 'caja', categoriaId: 'gastos', montoMinor: 4000,
    fechaContable: '2026-10-17', periodoId: '2026-10', precondiciones: { pertenenciaId: P, ...versiones } } };
}
// Decorador de observación/fallos sobre Transaction REAL; nunca reemplaza snapshots,
// consultas, versiones, bloqueos, commit o resolución de conflictos por un doble.
function adaptar({ antesLectura, despuesCallback, despuesCommit, falloEscritura } = {}) {
  const metricas = { intentos: 0, lecturas: 0, escriturasPreparadas: 0, timestamps: 0 };
  const inyectado = { doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: async callback => {
      const r = await db.runTransaction(async tx => {
        metricas.intentos++; let escribiendo = false;
        const proxy = new Proxy(tx, { get(target, propiedad) {
          if (propiedad === 'get') return async referencia => {
            assert.equal(escribiendo, false, 'Lectura despues de escritura'); metricas.lecturas++;
            if (antesLectura) await antesLectura(referencia, metricas);
            return target.get(referencia);
          };
          if (['create', 'update', 'set', 'delete'].includes(propiedad)) return (...args) => {
            escribiendo = true; metricas.escriturasPreparadas++;
            if (falloEscritura) falloEscritura(target, propiedad, args);
            return target[propiedad](...args);
          };
          const v = target[propiedad]; return typeof v === 'function' ? v.bind(target) : v;
        } });
        const resultado = await callback(proxy);
        if (despuesCallback) await despuesCallback(metricas);
        return resultado;
      });
      if (despuesCommit) await despuesCommit(); return r;
    } };
  const adaptador = crearAdaptadorFirestore({ db: inyectado, FieldValue: {
    serverTimestamp() { metricas.timestamps++; return FieldValue.serverTimestamp(); },
  } });
  return { ejecutar: adaptador.ejecutar, metricas };
}
async function foto() {
  const docs = {};
  for (const nombre of ['finanzas_movimientos', 'finanzas_saldos', 'finanzas_resumenes', 'finanzas_control', 'finanzas_auditoria',
    'finanzas_cuentas', 'finanzas_categorias', 'finanzas_reservas_cuentas', 'finanzas_reservas_categorias', 'finanzas_aperturas', 'finanzas_reversiones']) {
    for (const d of (await db.collection(`${B}/${nombre}`).get()).docs) docs[d.ref.path] = d.data();
  }
  for (const uid of [ADMIN, ENC]) for (const d of (await db.collection(`operaciones_financieras/${uid}/solicitudes`).get()).docs) docs[d.ref.path] = d.data();
  return docs;
}
async function sinCambios(e, codigo) {
  const antes = await foto(); await assert.rejects(adaptar().ejecutar(e), codigo ? cod(codigo) : undefined);
  assert.deepEqual(await foto(), antes);
}
before(async () => {
  // Cliente real exportado por Admin SDK, sin app/ADC ni credenciales privadas.
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  assert.equal(db.projectId, 'demo-fesync');
  assert.equal(db._settings.servicePath, '127.0.0.1'); assert.equal(db._settings.port, 8088);
  assert.equal(db._settings.ssl, false);
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: {
    host: '127.0.0.1', port: 8088, rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'),
  } });
});
beforeEach(async () => {
  if (detener) return;
  await reglas.clearFirestore(); const b = db.batch();
  for (const [ruta, datos] of Object.entries(semilla())) b.create(db.doc(ruta), datos);
  await b.commit();
});
after(async () => { if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });

escenario('01 Gasto real: seis documentos con mismo updateTime y timestamp servidor', async () => {
  const a = adaptar(), r = await a.ejecutar(await entrada());
  assert.equal(r.estado, 'CONFIRMADA'); assert.equal(r.historica, false);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_saldos/caja`,
    `${B}/finanzas_resumenes/2026-10`, `${B}/finanzas_control/libro`,
    `${B}/finanzas_auditoria/${r.movimientoId}`, `operaciones_financieras/${ADMIN}/solicitudes/${clave}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p)));
  const fechaServidor = docs[0].data().fechaCreacion;
  for (const d of docs) {
    assert.ok(d.exists); assert.ok(d.updateTime instanceof Timestamp);
    assert.ok(d.updateTime.isEqual(docs[0].updateTime));
    const fecha = d.data().fechaCreacion ?? d.data().fechaActualizacion;
    assert.ok(fecha instanceof Timestamp);
    assert.ok(fecha.isEqual(fechaServidor)); // No asumir serverTimestamp == updateTime.
  }
  assert.equal(docs[1].data().saldoMinor, 6000); assert.equal(docs[1].data().auxiliar, 'Conservar');
  assert.equal(docs[2].data().datos.gastosNetosMinor, 4000); assert.equal(docs[2].data().datos.saldoFinalMinor, 6000);
  assert.equal(docs[3].data().ultimaSecuencia, 2); assert.equal(a.metricas.escriturasPreparadas, 6);
});
escenario('02 Reintento exacto no duplica escrituras, secuencia ni auditoria', async () => {
  const e = await entrada(); await adaptar().ejecutar(e); const antes = await foto();
  const a = adaptar(), r = await a.ejecutar(e);
  assert.equal(r.historica, true); assert.equal(a.metricas.escriturasPreparadas, 0); assert.deepEqual(await foto(), antes);
});
escenario('03 Misma clave y payload diferente: rechazo', async () => {
  const e = await entrada(); await adaptar().ejecutar(e); e.solicitud.montoMinor++;
  await sinCambios(e, 'RECIBO_NO_COINCIDE');
});
escenario('04 Commit real y respuesta perdida simulada: recuperacion por mismo recibo', async () => {
  const e = await entrada();
  await assert.rejects(adaptar({ despuesCommit: () => { throw new Error('Respuesta perdida simulada'); } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
  assert.equal((await db.collection(`${B}/finanzas_auditoria`).get()).size, 1);
});
escenario('05 Dos gastos concurrentes: solo uno dispone de saldo suficiente', async () => {
  const a = await entrada(), b = await entrada(ADMIN, 'fin7b_solicitud_0002');
  a.solicitud.montoMinor = 7000; b.solicitud.montoMinor = 7000;
  const resultados = await Promise.allSettled([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal((await db.doc(`${B}/finanzas_saldos/caja`).get()).data().saldoMinor, 3000);
  assert.equal((await db.collection(`${B}/finanzas_auditoria`).get()).size, 1);
});
escenario('06 Revocacion concurrente gana antes de lectura de autorizacion', async () => {
  const e = await entrada(ENC); let hecho = false;
  const a = adaptar({ antesLectura: async r => {
    if (!hecho && r.path.includes('/solicitudes/')) {
      hecho = true; await db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null });
    }
  } });
  const antes = await foto(); await assert.rejects(a.ejecutar(e), cod('CONTABILIDAD_NO_AUTORIZADA'));
  assert.ok(hecho); assert.deepEqual(await foto(), antes);
});
escenario('07 Transferencia concurrente gana antes de lectura de autorizacion', async () => {
  const e = await entrada(); let hecho = false;
  const a = adaptar({ antesLectura: async r => {
    if (!hecho && r.path.includes('/solicitudes/')) {
      hecho = true; const b = db.batch();
      b.update(db.doc(B), { adminUid: ENC }); b.update(db.doc(`usuarios_globales/${ADMIN}`), { rolGlobal: 'servidor' });
      b.update(db.doc(`usuarios_globales/${ENC}`), { rolGlobal: 'admin_iglesia' }); await b.commit();
    }
  } });
  const antes = await foto(); await assert.rejects(a.ejecutar(e), cod('CONTABILIDAD_NO_AUTORIZADA'));
  assert.ok(hecho); assert.deepEqual(await foto(), antes);
});
for (const [nombre, cambio] of [
  ['08 Membresia terminada', { iglesiaId: null }],
  ['09 Otro periodo de pertenencia', { pertenenciaId: 'b'.repeat(64) }],
  ['10 Actor de otra iglesia', { iglesiaId: 'otra' }],
]) escenario(nombre, async () => {
  const e = await entrada(ENC); await db.doc(`usuarios_globales/${ENC}`).update(cambio);
  await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
});
escenario('11 Modulo deshabilitado', async () => {
  await db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false });
  await sinCambios(await entrada(), 'CONTABILIDAD_NO_AUTORIZADA');
});
escenario('12 Periodo cerrado', async () => {
  await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: [] });
  await sinCambios(await entrada(), 'SIN_PERIODO_ABIERTO');
});
escenario('13 Saldo insuficiente', async () => {
  const e = await entrada(); e.solicitud.montoMinor = 10001; await sinCambios(e, 'SALDO_INSUFICIENTE');
});
escenario('14 Error de validacion SDK con escrituras ya preparadas no produce cambios parciales', async () => {
  const e = await entrada(), antes = await foto(); let provocado = false;
  const a = adaptar({ falloEscritura: (tx, tipo, args) => {
    if (args[0].path.includes('/finanzas_auditoria/')) {
      provocado = true; tx.create(args[0], { campoInvalido: undefined }); // SDK real rechaza undefined.
    }
  } });
  await assert.rejects(a.ejecutar(e), cod('RESULTADO_INCIERTO')); assert.ok(provocado);
  assert.deepEqual(await foto(), antes);
});
escenario('15 Reconstruccion independiente del saldo y resumen; corrupcion bloqueada', async () => {
  await adaptar().ejecutar(await entrada());
  const movimientos = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
  const libro = calcularLibro({ movimientos, cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }], periodoId: '2026-10' });
  assert.deepEqual((await db.doc(`${B}/finanzas_resumenes/2026-10`).get()).data().datos, libro);
  await db.doc(`${B}/finanzas_saldos/caja`).update({ saldoMinor: 9999 });
  await sinCambios(await entrada(ADMIN, 'fin7b_solicitud_0002'), 'SALDO_NO_CONCUERDA_CON_LIBRO');
});
escenario('16 Reintento real del SDK tras ABORTED simulado; un solo commit', async () => {
  const a = adaptar({ despuesCallback: m => {
    if (m.intentos === 1) { const e = new Error('ABORTED inyectado'); e.code = 10; throw e; }
  } });
  await a.ejecutar(await entrada()); assert.equal(a.metricas.intentos, 2);
  assert.equal(a.metricas.timestamps, 2); // sentinels, no efectos externos ejecutados.
  assert.equal((await db.collection(`${B}/finanzas_auditoria`).get()).size, 1);
  assert.equal((await db.doc(`${B}/finanzas_control/libro`).get()).data().ultimaSecuencia, 2);
});
escenario('17 Aislamiento: documento financiero ajeno en catalogo se rechaza', async () => {
  const e = await entrada(); const d = (await db.doc(`${B}/finanzas_cuentas/caja`).get()).data();
  d.cuenta.iglesiaId = 'otra'; await db.doc(`${B}/finanzas_cuentas/caja`).set(d);
  await sinCambios(e, 'CUENTA_OTRA_IGLESIA');
});
escenario('18 Gasto no acepta aportante ni crea documentos publicos', async () => {
  const e = await entrada(); e.solicitud.aportante = { nombre: 'Persona ficticia' }; await sinCambios(e);
  delete e.solicitud.aportante; const r = await adaptar().ejecutar(e);
  assert.deepEqual((await db.doc(`${B}/finanzas_movimientos/${r.movimientoId}`).get()).data().privado, { aportante: null });
});
escenario('19 Limite de 50 cuentas: cupo maximo aceptado; 51 bloquea', async () => {
  const b = db.batch(), c = (await db.doc(`${B}/finanzas_cuentas/caja`).get()).data().cuenta;
  for (let i = 1; i < LIMITES.cuentas; i++) {
    const id = `cuenta_${i}`;
    b.create(db.doc(`${B}/finanzas_cuentas/${id}`), { cuenta: { ...c, id, codigo: `C${i}` } });
    b.create(db.doc(`${B}/finanzas_saldos/${id}`), { versionEsquema: 1, iglesiaId: 'fin7b', cuentaId: id,
      huboMovimientos: false, saldoMinor: 0, solicitudesInciertas: 0, aperturaRegistrada: false, ultimaSecuencia: 0 });
  }
  await b.commit(); await adaptar().ejecutar(await entrada());
  await db.doc(`${B}/finanzas_cuentas/extra`).create({ cuenta: { ...c, id: 'extra', codigo: 'EXTRA' } });
  await sinCambios(await entrada(ADMIN, 'fin7b_solicitud_0002'), 'LIMITE_LIBRO_EXCEDIDO');
});
escenario('20 Limite de 50 categorias: 51 bloquea sin escrituras', async () => {
  const b = db.batch(), c = (await db.doc(`${B}/finanzas_categorias/gastos`).get()).data().categoria;
  for (let i = 1; i < LIMITES.categorias; i++) b.create(db.doc(`${B}/finanzas_categorias/c_${i}`), {
    categoria: { ...c, id: `c_${i}`, codigo: `C${i}` } });
  await b.commit(); await adaptar().ejecutar(await entrada());
  await db.doc(`${B}/finanzas_categorias/extra`).create({ categoria: { ...c, id: 'extra', codigo: 'EXTRA' } });
  await sinCambios(await entrada(ADMIN, 'fin7b_solicitud_0002'), 'LIMITE_LIBRO_EXCEDIDO');
});
escenario('21 Limite de 200 movimientos: ultimo cupo y replay; siguiente bloqueado', async () => {
  const b = db.batch();
  for (let i = 2; i < LIMITES.movimientos; i++) {
    const id = `ingreso_${i}`, movimiento = crearIngreso({ id, fechaContable: '2026-10-02', periodoId: '2026-10',
      cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1 });
    b.create(db.doc(`${B}/finanzas_movimientos/${id}`), { versionEsquema: 1, iglesiaId: 'fin7b',
      estado: 'confirmado', secuencia: i, movimiento });
  }
  b.update(db.doc(`${B}/finanzas_control/libro`), { ultimaSecuencia: 199 });
  b.update(db.doc(`${B}/finanzas_saldos/caja`), { saldoMinor: 10198, ultimaSecuencia: 199 });
  await b.commit(); const e = await entrada(); await adaptar().ejecutar(e);
  assert.equal((await adaptar().ejecutar(e)).historica, true);
  await sinCambios(await entrada(ADMIN, 'fin7b_solicitud_0002'), 'LIMITE_LIBRO_EXCEDIDO');
});
escenario('22 Recibos privados y auditoria denegados a clientes sin privilegios', async () => {
  const r = await adaptar().ejecutar(await entrada());
  for (const cliente of [reglas.unauthenticatedContext(), reglas.authenticatedContext('ajeno_fin7b')]) {
    const c = cliente.firestore();
    await assertFails(getDoc(doc(c, `operaciones_financieras/${ADMIN}/solicitudes/${clave}`)));
    await assertFails(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
    await assertFails(getDocs(collection(c, `${B}/finanzas_auditoria`)));
  }
  await assertFails(getDoc(doc(reglas.authenticatedContext(ADMIN).firestore(),
    `operaciones_financieras/${ADMIN}/solicitudes/${clave}`)));
});
for (const [nombre, uid] of [['23 Administrador titular', ADMIN], ['24 Encargado vigente', ENC]]) {
  escenario(`${nombre}: get y list de auditoria autorizados; metadatos controlados`, async () => {
    const r = await adaptar().ejecutar(await entrada());
    const c = reglas.authenticatedContext(uid).firestore();
    const d = await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
    const datos = d.data();
    assert.deepEqual(Object.keys(datos).sort(), ['versionEsquema', 'iglesiaId', 'evento', 'responsable',
      'movimientoId', 'solicitudId', 'secuencia', 'fechaCreacion'].sort());
    assert.deepEqual(Object.keys(datos.responsable).sort(), ['uid', 'pertenenciaId'].sort());
    assert.equal(datos.evento, 'gasto_registrado'); assert.equal(datos.movimientoId, r.movimientoId);
    const lista = await assertSucceeds(getDocs(collection(c, `${B}/finanzas_auditoria`)));
    assert.equal(lista.size, 1);
    await assertFails(getDoc(doc(c, `operaciones_financieras/${ADMIN}/solicitudes/${clave}`)));
    await assertFails(getDocs(collection(c, `operaciones_financieras/${ADMIN}/solicitudes`)));
  });
}

for (const [nombre, uid, preparar] of [
  ['25 Encargado revocado', ENC, async () => db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null })],
  ['26 Miembro sin designacion', 'miembro_fin7b', async () => db.doc('usuarios_globales/miembro_fin7b').set({
    iglesiaId: 'fin7b', rolGlobal: 'servidor', pertenenciaId: P })],
  ['27 Lider sin designacion', 'lider_fin7b', async () => db.doc('usuarios_globales/lider_fin7b').set({
    iglesiaId: 'fin7b', rolGlobal: 'lider_area', pertenenciaId: P })],
  ['28 Usuario de otra iglesia', ENC, async () => db.doc(`usuarios_globales/${ENC}`).update({ iglesiaId: 'otra' })],
  ['29 Usuario desvinculado', ENC, async () => db.doc(`usuarios_globales/${ENC}`).update({ iglesiaId: FieldValue.delete(),
    pertenenciaId: FieldValue.delete() })],
  ['30 Modulo deshabilitado administrador', ADMIN, async () => db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false })],
  ['31 Modulo deshabilitado encargado', ENC, async () => db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false })],
  ['32 Administrador anterior', ADMIN, async () => {
    const b = db.batch(); b.update(db.doc(B), { adminUid: ENC });
    b.update(db.doc(`usuarios_globales/${ENC}`), { rolGlobal: 'admin_iglesia' });
    b.update(db.doc(`usuarios_globales/${ADMIN}`), { rolGlobal: 'servidor' }); await b.commit();
  }],
  ['33 Titular incoherente', ENC, async () => db.doc(`usuarios_globales/${ADMIN}`).update({ rolGlobal: 'servidor' })],
]) escenario(`${nombre}: auditoria y recibos denegados`, async () => {
  const r = await adaptar().ejecutar(await entrada());
  const c = reglas.authenticatedContext(uid).firestore();
  // Misma identidad/instancia antes y después: no se obtiene una autorización duradera.
  if ([ADMIN, ENC].includes(uid)) await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await preparar();
  await assertFails(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await assertFails(getDocs(collection(c, `${B}/finanzas_auditoria`)));
  await assertFails(getDoc(doc(c, `operaciones_financieras/${ADMIN}/solicitudes/${clave}`)));
  await assertFails(getDocs(collection(c, `operaciones_financieras/${ADMIN}/solicitudes`)));
});

for (const uid of [ADMIN, ENC, 'ajeno_fin7b', null]) {
  escenario(`34 Escrituras de auditoria denegadas: ${uid === ADMIN ? 'titular' : uid === ENC ? 'encargado' : uid === null ? 'sin sesion' : 'ajeno'}`, async () => {
    const r = await adaptar().ejecutar(await entrada());
    const c = (uid === null ? reglas.unauthenticatedContext() : reglas.authenticatedContext(uid)).firestore();
    const ruta = `${B}/finanzas_auditoria/${r.movimientoId}`;
    const antes = (await db.doc(ruta).get()).data();
    await assertFails(setDoc(doc(c, `${B}/finanzas_auditoria/falsificado`), { evento: 'falso' }));
    await assertFails(updateDoc(doc(c, ruta), { evento: 'falso' }));
    await assertFails(setDoc(doc(c, ruta), { evento: 'falso' }));
    await assertFails(setDoc(doc(c, ruta), { evento: 'falso' }, { merge: true }));
    await assertFails(deleteDoc(doc(c, ruta)));
    assert.deepEqual((await db.doc(ruta).get()).data(), antes);
    assert.equal((await db.doc(`${B}/finanzas_auditoria/falsificado`).get()).exists, false);
  });
}

async function entradaCatalogo(op, solicitudId = 'fin7c_alta_solicitud_001') {
  const e = await entrada(ADMIN, solicitudId);
  const precondiciones = { ...e.solicitud.precondiciones }; delete precondiciones.cuenta; delete precondiciones.categoria;
  return { auth: e.auth, operacion: op, solicitud: { versionEsquema: 1, solicitudId,
    iglesiaId: 'fin7b', periodoId: '2026-10', precondiciones,
    [op === 'crearCuenta' ? 'cuenta' : 'categoria']: op === 'crearCuenta' ?
      { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' } :
      { codigo: 'DONACIONES', nombre: 'Donaciones', naturaleza: 'ingreso', tipoIngreso: 'donaciones' } } };
}
async function entradaApertura(cuentaId, solicitudId = 'fin7c_apertura_solicitud_001') {
  const e = await entrada(ADMIN, solicitudId); e.operacion = 'apertura';
  delete e.solicitud.categoriaId; delete e.solicitud.precondiciones.categoria;
  e.solicitud.cuentaId = cuentaId; e.solicitud.montoMinor = 5000;
  e.solicitud.precondiciones.cuenta = version(await db.doc(`${B}/finanzas_cuentas/${cuentaId}`).get());
  return e;
}
for (const tipo of ['caja', 'banco']) escenario(`FIN-7C Alta de cuenta ${tipo}, reserva privada y saldo cero`, async () => {
  const e = await entradaCatalogo('crearCuenta'); e.solicitud.cuenta.tipo = tipo;
  const r = await adaptar().ejecutar(e);
  const rutas = [`${B}/finanzas_cuentas/${r.cuentaId}`, `${B}/finanzas_saldos/${r.cuentaId}`,
    `${B}/finanzas_reservas_cuentas/BANCO`, `${B}/finanzas_resumenes/2026-10`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p)));
  docs.forEach(d => assert.ok(d.updateTime.isEqual(docs[0].updateTime)));
  assert.equal(docs[0].data().cuenta.tipo, tipo); assert.equal(docs[1].data().saldoMinor, 0);
  assert.equal(docs[2].data().entidadId, r.cuentaId);
  assert.equal(docs[3].data().datos.saldoFinalPorCuenta[r.cuentaId], 0);
  assert.equal(docs[3].data().datos.ingresosNetosMinor, 0);
  const cliente = reglas.authenticatedContext(ADMIN).firestore();
  await assertFails(getDoc(doc(cliente, `${B}/finanzas_reservas_cuentas/BANCO`)));
  await adaptar().ejecutar(await entrada()); // proyecciones compatibles con gastos previos.
});
for (const naturaleza of ['ingreso', 'gasto']) escenario(`FIN-7C Alta categoria ${naturaleza}`, async () => {
  const e = await entradaCatalogo('crearCategoria');
  e.solicitud.categoria.naturaleza = naturaleza; e.solicitud.categoria.tipoIngreso = naturaleza === 'ingreso' ? 'ofrendas' : null;
  const r = await adaptar().ejecutar(e);
  const d = await db.doc(`${B}/finanzas_categorias/${r.categoriaId}`).get();
  const reserva = await db.doc(`${B}/finanzas_reservas_categorias/DONACIONES`).get();
  assert.ok(d.updateTime.isEqual(reserva.updateTime)); assert.equal(d.data().categoria.naturaleza, naturaleza);
  assert.equal(reserva.data().entidadId, r.categoriaId);
  await assertFails(getDoc(doc(reglas.authenticatedContext(ADMIN).firestore(),
    `${B}/finanzas_reservas_categorias/DONACIONES`)));
});
for (const op of ['crearCuenta', 'crearCategoria']) escenario(`FIN-7C ${op} con codigo duplicado concurrente`, async () => {
  const a = await entradaCatalogo(op), b = await entradaCatalogo(op, 'fin7c_alta_solicitud_002');
  const resultados = await Promise.allSettled([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'CODIGO_RESERVADO');
  assert.equal((await db.collection(`${B}/finanzas_reservas_${op === 'crearCuenta' ? 'cuentas' : 'categorias'}`).get()).size, 1);
  assert.equal((await db.collection(`${B}/finanzas_auditoria`).get()).size, 1);
});
escenario('FIN-7C Apertura real: siete documentos atomicos, patrimonial y replay', async () => {
  const c = await adaptar().ejecutar(await entradaCatalogo('crearCuenta'));
  const e = await entradaApertura(c.cuentaId), r = await adaptar().ejecutar(e);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_saldos/${c.cuentaId}`,
    `${B}/finanzas_resumenes/2026-10`, `${B}/finanzas_control/libro`, `${B}/finanzas_auditoria/${r.movimientoId}`,
    `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`, `${B}/finanzas_aperturas/${c.cuentaId}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p)));
  docs.forEach(d => assert.ok(d.updateTime.isEqual(docs[0].updateTime)));
  assert.equal(docs[0].data().movimiento.clase, 'apertura'); assert.equal(docs[1].data().aperturaRegistrada, true);
  assert.equal(docs[1].data().saldoMinor, 5000); assert.equal(docs[2].data().datos.aperturasNetasMinor, 15000);
  assert.equal(docs[2].data().datos.ingresosNetosMinor, 0); assert.equal(docs[2].data().datos.resultadoMinor, 0);
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
  await assertFails(getDoc(doc(reglas.authenticatedContext(ADMIN).firestore(), `${B}/finanzas_aperturas/${c.cuentaId}`)));
});
escenario('FIN-7C Dos aperturas concurrentes: marcador unico y sin ingresos duplicados', async () => {
  const c = await adaptar().ejecutar(await entradaCatalogo('crearCuenta'));
  const a = await entradaApertura(c.cuentaId), b = await entradaApertura(c.cuentaId, 'fin7c_apertura_solicitud_002');
  const resultados = await Promise.allSettled([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'APERTURA_DUPLICADA');
  assert.equal((await db.collection(`${B}/finanzas_aperturas`).get()).size, 1);
  assert.equal((await db.doc(`${B}/finanzas_saldos/${c.cuentaId}`).get()).data().saldoMinor, 5000);
});
for (const op of ['crearCuenta', 'crearCategoria', 'apertura']) {
  escenario(`FIN-7C ${op}: respuesta perdida, idempotencia y payload diferente`, async () => {
    const c = op === 'apertura' ? await adaptar().ejecutar(await entradaCatalogo('crearCuenta')) : null;
    const e = op === 'apertura' ? await entradaApertura(c.cuentaId) : await entradaCatalogo(op);
    await assert.rejects(adaptar({ despuesCommit: () => { throw Error('respuesta perdida simulada'); } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
    const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
    if (op === 'apertura') e.solicitud.montoMinor++;
    else e.solicitud[op === 'crearCuenta' ? 'cuenta' : 'categoria'].nombre = 'Nombre diferente';
    await sinCambios(e, 'RECIBO_NO_COINCIDE');
  });
  escenario(`FIN-7C ${op}: error SDK no deja reservas o saldos parciales`, async () => {
    const c = op === 'apertura' ? await adaptar().ejecutar(await entradaCatalogo('crearCuenta')) : null;
    const e = op === 'apertura' ? await entradaApertura(c.cuentaId) : await entradaCatalogo(op), antes = await foto();
    await assert.rejects(adaptar({ falloEscritura: (tx, tipo, args) => {
      if (args[0].path.includes('/finanzas_auditoria/')) tx.create(args[0], { invalido: undefined });
    } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
    assert.deepEqual(await foto(), antes);
  });
  escenario(`FIN-7C ${op}: encargado no administra, legado y otra iglesia rechazados`, async () => {
    const c = op === 'apertura' ? await adaptar().ejecutar(await entradaCatalogo('crearCuenta')) : null;
    const e = op === 'apertura' ? await entradaApertura(c.cuentaId) : await entradaCatalogo(op);
    e.auth.uid = ENC; await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
    await db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null });
    await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
    e.auth.uid = ADMIN;
    await db.doc(`usuarios_globales/${ADMIN}`).update({ pertenenciaId: FieldValue.delete() });
    await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
    await db.doc(`usuarios_globales/${ADMIN}`).update({ pertenenciaId: P, iglesiaId: 'otra' });
    await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
  });
}
escenario('FIN-7C Apertura archivada y periodo cerrado: no cambia saldo ni historia', async () => {
  const c = await adaptar().ejecutar(await entradaCatalogo('crearCuenta'));
  await db.doc(`${B}/finanzas_cuentas/${c.cuentaId}`).update({ 'cuenta.estado': 'archivada' });
  await sinCambios(await entradaApertura(c.cuentaId), 'CUENTA_ARCHIVADA');
  await db.doc(`${B}/finanzas_cuentas/${c.cuentaId}`).update({ 'cuenta.estado': 'activa' });
  await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: [] });
  await sinCambios(await entradaApertura(c.cuentaId), 'SIN_PERIODO_ABIERTO');
});

async function crearCategoriaIngreso(tipo = 'diezmos') {
  const e = await entradaCatalogo('crearCategoria');
  e.solicitud.categoria = { codigo: tipo.toUpperCase(), nombre: 'Ingreso configurado', naturaleza: 'ingreso', tipoIngreso: tipo };
  return (await adaptar().ejecutar(e)).categoriaId;
}
async function entradaIngreso(categoriaId, uid = ADMIN, solicitudId = 'fin7c2_ingreso_solicitud_001') {
  const e = await entrada(uid, solicitudId); e.operacion = 'ingreso'; e.solicitud.categoriaId = categoriaId;
  e.solicitud.precondiciones.categoria = version(await db.doc(`${B}/finanzas_categorias/${categoriaId}`).get());
  return e;
}
for (const tipo of ['diezmos', 'ofrendas', 'donaciones', 'otros']) {
  escenario(`FIN-7C.2 Ingreso ${tipo}: seis documentos reales en el mismo commit`, async () => {
    const categoriaId = await crearCategoriaIngreso(tipo), e = await entradaIngreso(categoriaId);
    if (tipo === 'donaciones') e.solicitud.aportante = null; // Anónima explícita; otros omiten aportante.
    const r = await adaptar().ejecutar(e);
    const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_saldos/caja`,
      `${B}/finanzas_resumenes/2026-10`, `${B}/finanzas_control/libro`, `${B}/finanzas_auditoria/${r.movimientoId}`,
      `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`];
    const docs = await db.getAll(...rutas.map(p => db.doc(p)));
    docs.forEach(d => assert.ok(d.updateTime.isEqual(docs[0].updateTime)));
    assert.equal(docs[0].data().movimiento.clase, 'ingreso'); assert.equal(docs[0].data().clasificacion.tipoIngreso, tipo);
    assert.deepEqual(docs[0].data().privado, { aportante: null });
    assert.equal(docs[1].data().saldoMinor, 14000); assert.equal(docs[2].data().datos.ingresosNetosMinor, 4000);
    assert.equal(docs[2].data().datos.aperturasNetasMinor, 10000); assert.equal(docs[2].data().datos.resultadoMinor, 4000);
    assert.equal(docs[4].data().evento, 'ingreso_registrado'); assert.equal(docs[5].data().operacion, 'ingreso');
    const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
  });
}
escenario('FIN-7C.2 Aportante solo en movimiento privado; resumen/auditoria/recibos/perfiles sin nombre', async () => {
  const categoriaId = await crearCategoriaIngreso('donaciones'), e = await entradaIngreso(categoriaId);
  const nombre = 'Aportante ficticio privado FIN7C2'; e.solicitud.aportante = { nombre };
  const r = await adaptar().ejecutar(e);
  assert.deepEqual((await db.doc(`${B}/finanzas_movimientos/${r.movimientoId}`).get()).data().privado.aportante, { nombre });
  const documentos = await foto();
  for (const [ruta, d] of Object.entries(documentos)) if (!ruta.includes('/finanzas_movimientos/')) {
    assert.equal(JSON.stringify(d).includes(nombre), false);
  }
  for (const uid of [ADMIN, ENC]) assert.equal(JSON.stringify((await db.doc(`usuarios_globales/${uid}`).get()).data()).includes(nombre), false);
  assert.equal(JSON.stringify(r).includes(nombre), false);
  const c = reglas.authenticatedContext(ENC).firestore();
  const auditoria = await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  assert.equal(JSON.stringify(auditoria.data()).includes(nombre), false);
  await assertFails(getDoc(doc(c, `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`)));
  await assertFails(getDoc(doc(reglas.authenticatedContext(ADMIN).firestore(),
    `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`)));
  await assertFails(getDoc(doc(reglas.authenticatedContext('ajeno_fin7c2').firestore(),
    `${B}/finanzas_movimientos/${r.movimientoId}`)));
  const antes = await foto(); e.solicitud.aportante.nombre = 'Otro nombre ficticio';
  await sinCambios(e, 'RECIBO_NO_COINCIDE'); assert.deepEqual(await foto(), antes);
});
escenario('FIN-7C.2 Dos ingresos concurrentes se acumulan y reconstruyen sin perder deltas', async () => {
  const categoriaId = await crearCategoriaIngreso();
  const a = await entradaIngreso(categoriaId), b = await entradaIngreso(categoriaId, ENC, 'fin7c2_ingreso_solicitud_002');
  const r = await Promise.all([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.notEqual(r[0].movimientoId, r[1].movimientoId);
  assert.deepEqual(r.map(x => x.secuencia).sort(), [2, 3]);
  const saldo = (await db.doc(`${B}/finanzas_saldos/caja`).get()).data(); assert.equal(saldo.saldoMinor, 18000);
  const movimientos = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
  const libro = calcularLibro({ movimientos, cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }], periodoId: '2026-10' });
  assert.deepEqual((await db.doc(`${B}/finanzas_resumenes/2026-10`).get()).data().datos, libro);
  assert.equal(libro.ingresosNetosMinor, 8000);
});
escenario('FIN-7C.2 Misma solicitud simultanea produce un ingreso; ABORTED reintenta callback sin duplicar', async () => {
  const categoriaId = await crearCategoriaIngreso(), e = await entradaIngreso(categoriaId);
  const a = adaptar({ despuesCallback: m => {
    if (m.intentos === 1) { const error = new Error('ABORTED simulado'); error.code = 10; throw error; }
  } });
  const r = await Promise.all([a.ejecutar(e), adaptar().ejecutar(e)]);
  assert.equal(r.filter(x => x.historica).length, 1); assert.equal(r[0].movimientoId, r[1].movimientoId);
  assert.ok(a.metricas.intentos >= 2);
  assert.equal((await db.doc(`${B}/finanzas_saldos/caja`).get()).data().saldoMinor, 14000);
  assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 2);
});
escenario('FIN-7C.2 Timeout despues del commit y error SDK previo: misma clave y ninguna escritura parcial', async () => {
  const categoriaId = await crearCategoriaIngreso(), e = await entradaIngreso(categoriaId);
  await assert.rejects(adaptar({ despuesCommit: () => { throw Error('timeout simulado'); } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
  const siguiente = await entradaIngreso(categoriaId, ADMIN, 'fin7c2_ingreso_solicitud_002');
  await assert.rejects(adaptar({ falloEscritura: (tx, tipo, args) => {
    if (args[0].path.includes('/finanzas_auditoria/')) tx.create(args[0], { invalido: undefined });
  } }).ejecutar(siguiente), cod('RESULTADO_INCIERTO')); assert.deepEqual(await foto(), antes);
});
for (const [nombre, cambiar, esperado] of [
  ['cuenta archivada', async cat => db.doc(`${B}/finanzas_cuentas/caja`).update({ 'cuenta.estado': 'archivada' }), 'CUENTA_ARCHIVADA'],
  ['categoria archivada', async cat => db.doc(`${B}/finanzas_categorias/${cat}`).update({ 'categoria.estado': 'archivada' }), 'CATEGORIA_ARCHIVADA'],
  ['periodo cerrado', async cat => db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: [] }), 'SIN_PERIODO_ABIERTO'],
  ['modulo deshabilitado', async cat => db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false }), 'CONTABILIDAD_NO_AUTORIZADA'],
  ['categoria ajena', async cat => db.doc(`${B}/finanzas_categorias/${cat}`).update({ 'categoria.iglesiaId': 'otra' }), 'CATEGORIA_OTRA_IGLESIA'],
]) escenario(`FIN-7C.2 Ingreso rechazado: ${nombre}`, async () => {
  const cat = await crearCategoriaIngreso(); await cambiar(cat);
  await sinCambios(await entradaIngreso(cat), esperado);
});
for (const [nombre, preparar] of [
  ['miembro sin designacion', async () => db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null })],
  ['encargado revocado', async () => db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null })],
  ['otra iglesia', async () => db.doc(`usuarios_globales/${ENC}`).update({ iglesiaId: 'otra' })],
  ['periodo de pertenencia anterior', async () => db.doc(`usuarios_globales/${ENC}`).update({ pertenenciaId: 'b'.repeat(64) })],
]) escenario(`FIN-7C.2 Autorizacion de ingreso denegada: ${nombre}`, async () => {
  const cat = await crearCategoriaIngreso(), e = await entradaIngreso(cat, ENC);
  await preparar(); await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
});
escenario('FIN-7C.2 Transferencia administrativa intercalada antes de autorizacion impide ingreso anterior', async () => {
  const cat = await crearCategoriaIngreso(), e = await entradaIngreso(cat); let hecho = false;
  const a = adaptar({ antesLectura: async r => {
    if (!hecho && r.path.includes('/solicitudes/')) {
      hecho = true; const b = db.batch(); b.update(db.doc(B), { adminUid: ENC });
      b.update(db.doc(`usuarios_globales/${ENC}`), { rolGlobal: 'admin_iglesia' });
      b.update(db.doc(`usuarios_globales/${ADMIN}`), { rolGlobal: 'servidor' }); await b.commit();
    }
  } });
  const antes = await foto(); await assert.rejects(a.ejecutar(e), cod('CONTABILIDAD_NO_AUTORIZADA'));
  assert.ok(hecho); assert.deepEqual(await foto(), antes);
});
escenario('FIN-7C.2 Categoria de gasto, monto inseguro y aportante innecesario se rechazan', async () => {
  const cat = await crearCategoriaIngreso(), e = await entradaIngreso(cat);
  e.solicitud.categoriaId = 'gastos'; e.solicitud.precondiciones.categoria = version(await db.doc(`${B}/finanzas_categorias/gastos`).get());
  await sinCambios(e, 'CATEGORIA_MOVIMIENTO_INCOMPATIBLE');
  const desborde = await entradaIngreso(cat); desborde.solicitud.montoMinor = Number.MAX_SAFE_INTEGER;
  await sinCambios(desborde, 'DESBORDAMIENTO');
  const innecesario = await entradaIngreso(cat); innecesario.solicitud.aportante = { nombre: 'Ficticio', email: 'no-usar@example.invalid' };
  await sinCambios(innecesario);
});
escenario('FIN-7C.2 Limite real del libro para ingresos; replay no consume otro cupo', async () => {
  const cat = await crearCategoriaIngreso(), b = db.batch();
  for (let i = 2; i < LIMITES.movimientos; i++) {
    const id = `ingreso_${i}`;
    b.create(db.doc(`${B}/finanzas_movimientos/${id}`), { versionEsquema: 1, iglesiaId: 'fin7b', secuencia: i,
      estado: 'confirmado', movimiento: crearIngreso({ id, fechaContable: '2026-10-02', periodoId: '2026-10',
        cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1 }) });
  }
  b.update(db.doc(`${B}/finanzas_control/libro`), { ultimaSecuencia: 199 });
  b.update(db.doc(`${B}/finanzas_saldos/caja`), { saldoMinor: 10198, ultimaSecuencia: 199 }); await b.commit();
  const e = await entradaIngreso(cat); await adaptar().ejecutar(e); assert.equal((await adaptar().ejecutar(e)).historica, true);
  await sinCambios(await entradaIngreso(cat, ADMIN, 'fin7c2_ingreso_solicitud_002'), 'LIMITE_LIBRO_EXCEDIDO');
});

async function bancoParaTransferir() {
  return (await adaptar().ejecutar(await entradaCatalogo('crearCuenta'))).cuentaId;
}
async function entradaTransferencia(origenId, destinoId, uid = ADMIN, solicitudId = 'fin7c3a_transferencia_001') {
  const e = await entrada(uid, solicitudId), p = e.solicitud.precondiciones;
  const cuentas = await Promise.all([origenId, destinoId].map(async cuentaId => ({
    cuentaId, version: version(await db.doc(`${B}/finanzas_cuentas/${cuentaId}`).get()),
  })));
  return { auth: e.auth, operacion: 'transferencia', solicitud: { versionEsquema: 1, solicitudId, iglesiaId: 'fin7b',
    origenId, destinoId, montoMinor: 4000, fechaContable: '2026-10-17', periodoId: '2026-10', precondiciones: {
      pertenenciaId: P, acceso: p.acceso, iglesia: p.iglesia, configuracion: p.configuracion, controlPeriodo: p.controlPeriodo, cuentas } } };
}
for (const origen of ['caja', 'banco']) escenario(`FIN-7C.3A ${origen} a otra cuenta: siete documentos y resultado sin cambios`, async () => {
  const banco = await bancoParaTransferir();
  if (origen === 'banco') {
    const inicial = await entradaTransferencia('caja', banco, ADMIN, 'fin7c3a_financiar_banco_001');
    inicial.solicitud.montoMinor = 10000; await adaptar().ejecutar(inicial);
  }
  const origenId = origen === 'caja' ? 'caja' : banco, destinoId = origen === 'caja' ? banco : 'caja';
  const e = await entradaTransferencia(origenId, destinoId), r = await adaptar().ejecutar(e);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_saldos/${origenId}`,
    `${B}/finanzas_saldos/${destinoId}`, `${B}/finanzas_resumenes/2026-10`, `${B}/finanzas_control/libro`,
    `${B}/finanzas_auditoria/${r.movimientoId}`, `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p))); docs.forEach(d => assert.ok(d.updateTime.isEqual(docs[0].updateTime)));
  const m = docs[0].data(); assert.equal(m.movimiento.clase, 'transferencia'); assert.equal(m.clasificacion, null);
  assert.deepEqual(m.movimiento.asientos, [{ cuentaId: origenId, deltaMinor: -4000 }, { cuentaId: destinoId, deltaMinor: 4000 }]);
  assert.equal(m.movimiento.asientos.reduce((s, a) => s + a.deltaMinor, 0), 0);
  assert.equal(docs[1].data().saldoMinor, 6000); assert.equal(docs[2].data().saldoMinor, 4000);
  const resumen = docs[3].data().datos; assert.equal(resumen.saldoFinalMinor, 10000);
  assert.equal(resumen.resultadoMinor, 0); assert.equal(resumen.ingresosNetosMinor, 0); assert.equal(resumen.gastosNetosMinor, 0);
  assert.equal(docs[5].data().evento, 'transferencia_registrada');
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
});
escenario('FIN-7C.3A Encargado vigente transfiere; auditoria autorizada y recibos protegidos', async () => {
  const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco, ENC), r = await adaptar().ejecutar(e);
  const c = reglas.authenticatedContext(ENC).firestore();
  await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await assertFails(getDoc(doc(c, `operaciones_financieras/${ENC}/solicitudes/${e.solicitud.solicitudId}`)));
  await assertFails(getDoc(doc(reglas.authenticatedContext('ajeno_transferencia').firestore(),
    `${B}/finanzas_auditoria/${r.movimientoId}`)));
});
for (const caso of ['mismaCuenta', 'inexistente', 'insuficiente', 'payloadDistinto']) {
  escenario(`FIN-7C.3A Rechazo de transferencia: ${caso}`, async () => {
    const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco);
    if (caso === 'mismaCuenta') e.solicitud.destinoId = 'caja';
    if (caso === 'inexistente') e.solicitud.destinoId = 'inexistente';
    if (caso === 'insuficiente') e.solicitud.montoMinor = 10001;
    if (caso === 'payloadDistinto') { await adaptar().ejecutar(e); e.solicitud.montoMinor++; }
    await sinCambios(e, caso === 'payloadDistinto' ? 'RECIBO_NO_COINCIDE' : caso === 'insuficiente' ? 'SALDO_INSUFICIENTE' : undefined);
  });
}
for (const caso of ['origenArchivado', 'destinoArchivado', 'moneda', 'periodoCerrado', 'cuentaAjena', 'controlCorrupto']) {
  escenario(`FIN-7C.3A Contexto de transferencia invalido: ${caso}`, async () => {
    const banco = await bancoParaTransferir();
    if (caso === 'origenArchivado') await db.doc(`${B}/finanzas_cuentas/caja`).update({ 'cuenta.estado': 'archivada' });
    if (caso === 'destinoArchivado') await db.doc(`${B}/finanzas_cuentas/${banco}`).update({ 'cuenta.estado': 'archivada' });
    if (caso === 'moneda') await db.doc(`${B}/finanzas_cuentas/${banco}`).update({ 'cuenta.moneda': 'USD' });
    if (caso === 'periodoCerrado') await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: [] });
    if (caso === 'cuentaAjena') await db.doc(`${B}/finanzas_cuentas/${banco}`).update({ 'cuenta.iglesiaId': 'otra' });
    if (caso === 'controlCorrupto') await db.doc(`${B}/finanzas_control/libro`).update({ ultimaSecuencia: 2 });
    await sinCambios(await entradaTransferencia('caja', banco));
  });
}
for (const caso of ['revocado', 'periodoAnterior', 'otraIglesia', 'moduloDeshabilitado', 'titularAnterior']) {
  escenario(`FIN-7C.3A Autorizacion de transferencia denegada: ${caso}`, async () => {
    const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco, caso === 'titularAnterior' ? ADMIN : ENC);
    if (caso === 'revocado') await db.doc(`${B}/finanzas_config/acceso`).update({ encargadoUid: null });
    if (caso === 'periodoAnterior') await db.doc(`usuarios_globales/${ENC}`).update({ pertenenciaId: 'b'.repeat(64) });
    if (caso === 'otraIglesia') await db.doc(`usuarios_globales/${ENC}`).update({ iglesiaId: 'otra' });
    if (caso === 'moduloDeshabilitado') await db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false });
    if (caso === 'titularAnterior') {
      const b = db.batch(); b.update(db.doc(B), { adminUid: ENC });
      b.update(db.doc(`usuarios_globales/${ENC}`), { rolGlobal: 'admin_iglesia' });
      b.update(db.doc(`usuarios_globales/${ADMIN}`), { rolGlobal: 'servidor' }); await b.commit();
    }
    await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
  });
}
escenario('FIN-7C.3A Timeout real despues del commit y misma clave sin doble transferencia', async () => {
  const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco);
  await assert.rejects(adaptar({ despuesCommit: () => { throw Error('respuesta perdida simulada'); } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
  const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
});
escenario('FIN-7C.3A Error SDK tras preparar saldo origen no deja debito parcial', async () => {
  const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco), antes = await foto(); let provocado = false;
  await assert.rejects(adaptar({ falloEscritura: (tx, tipo, args) => {
    if (args[0].path === `${B}/finanzas_saldos/${banco}`) {
      provocado = true; tx.update(args[0], { invalido: undefined });
    }
  } }).ejecutar(e), cod('RESULTADO_INCIERTO')); assert.ok(provocado); assert.deepEqual(await foto(), antes);
});
for (const contraGasto of [false, true]) escenario(`FIN-7C.3A Concurrencia con ${contraGasto ? 'gasto' : 'otra transferencia'} y fondos limitados`, async () => {
  const banco = await bancoParaTransferir(), t = await entradaTransferencia('caja', banco);
  const otra = contraGasto ? await entrada(ADMIN, 'fin7c3a_gasto_concurrente') :
    await entradaTransferencia('caja', banco, ADMIN, 'fin7c3a_transferencia_002');
  t.solicitud.montoMinor = 7000; otra.solicitud.montoMinor = 7000;
  const r = await Promise.allSettled([adaptar().ejecutar(t), adaptar().ejecutar(otra)]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal((await db.doc(`${B}/finanzas_saldos/caja`).get()).data().saldoMinor, 3000);
  const movimientos = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
  const libro = calcularLibro({ movimientos, cuentas: ['caja', banco].map(id => ({ id, moneda: 'CLP', escala: 0 })), periodoId: '2026-10' });
  assert.deepEqual((await db.doc(`${B}/finanzas_resumenes/2026-10`).get()).data().datos, libro);
  assert.equal((await db.doc(`${B}/finanzas_saldos/${banco}`).get()).data().saldoMinor, libro.saldoFinalPorCuenta[banco]);
  if (!contraGasto) { assert.equal(libro.saldoFinalMinor, 10000); assert.equal(libro.resultadoMinor, 0); }
});
escenario('FIN-7C.3A ABORTED simulado reintenta callback del SDK sin duplicar', async () => {
  const banco = await bancoParaTransferir(), e = await entradaTransferencia('caja', banco);
  const a = adaptar({ despuesCallback: m => { if (m.intentos === 1) { const error = Error('ABORTED'); error.code = 10; throw error; } } });
  await a.ejecutar(e); assert.equal(a.metricas.intentos, 2);
  assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 2);
  assert.equal((await db.doc(`${B}/finanzas_saldos/caja`).get()).data().saldoMinor, 6000);
});
escenario('FIN-7C.3A Transferencia respeta limite real de 200 movimientos y replay', async () => {
  const banco = await bancoParaTransferir(), b = db.batch();
  for (let i = 2; i < 200; i++) {
    const id = `i_${i}`; b.create(db.doc(`${B}/finanzas_movimientos/${id}`), { versionEsquema: 1, iglesiaId: 'fin7b', secuencia: i,
      estado: 'confirmado', movimiento: crearIngreso({ id, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1,
        fechaContable: '2026-10-02', periodoId: '2026-10' }) });
  }
  b.update(db.doc(`${B}/finanzas_control/libro`), { ultimaSecuencia: 199 });
  b.update(db.doc(`${B}/finanzas_saldos/caja`), { saldoMinor: 10198, ultimaSecuencia: 199 });
  b.delete(db.doc(`${B}/finanzas_resumenes/2026-10`)); // Fixture sin proyección: reconstrucción completa obligatoria.
  await b.commit(); const e = await entradaTransferencia('caja', banco); await adaptar().ejecutar(e);
  assert.equal((await adaptar().ejecutar(e)).historica, true);
  await sinCambios(await entradaTransferencia('caja', banco, ADMIN, 'fin7c3a_transferencia_002'), 'LIMITE_LIBRO_EXCEDIDO');
});

async function originalCorreccion(clase = 'gasto') {
  if (clase === 'transferencia') return (await adaptar().ejecutar(await entradaTransferencia('caja', await bancoParaTransferir()))).movimientoId;
  return (await adaptar().ejecutar(clase === 'ingreso' ? await entradaIngreso(await crearCategoriaIngreso()) : await entrada())).movimientoId;
}
async function entradaCorreccion(tipo = 'ajuste', originalId = null, uid = ADMIN, solicitudId = 'fin7c3b_correccion_001') {
  const e = await entrada(uid, solicitudId), p = e.solicitud.precondiciones;
  const original = tipo === 'reversion' ? await db.doc(`${B}/finanzas_movimientos/${originalId}`).get() : null;
  const ids = original?.exists ? original.data().movimiento.asientos.map(a => a.cuentaId) : ['caja'];
  const cuentas = await Promise.all(ids.map(async cuentaId => ({ cuentaId,
    version: version(await db.doc(`${B}/finanzas_cuentas/${cuentaId}`).get()) })));
  return { auth: { uid }, operacion: tipo, solicitud: { versionEsquema: 1, solicitudId, iglesiaId: 'fin7b',
    fechaContable: '2026-10-17', periodoId: '2026-10', motivo: 'Motivo ficticio privado FIN7C3B', referenciaAuditoria: 'referencia-interna',
    ...(tipo === 'ajuste' ? { cuentaId: 'caja', deltaMinor: 1000 } : { originalId }),
    precondiciones: { pertenenciaId: P, acceso: p.acceso, iglesia: p.iglesia, configuracion: p.configuracion,
      controlPeriodo: p.controlPeriodo, cuentas, ...(tipo === 'reversion' ? { original: {
        version: original.exists ? version(original) : '1700000000:0', versionReversion: null } } : {}) } } };
}
async function comprobarLibroActual(periodoId = '2026-10') {
  const movimientos = (await db.collection(`${B}/finanzas_movimientos`).get()).docs.map(d => d.data().movimiento);
  const cuentas = (await db.collection(`${B}/finanzas_cuentas`).get()).docs.map(d => ({ id: d.id, moneda: 'CLP', escala: 0 }));
  const libro = calcularLibro({ movimientos, cuentas, periodoId });
  assert.deepEqual((await db.doc(`${B}/finanzas_resumenes/${periodoId}`).get()).data().datos, libro);
  for (const cuenta of cuentas) assert.equal((await db.doc(`${B}/finanzas_saldos/${cuenta.id}`).get()).data().saldoMinor, libro.saldoFinalPorCuenta[cuenta.id]);
  return libro;
}
for (const clase of ['ingreso', 'gasto', 'transferencia']) escenario(`FIN-7C.3B Reversion real de ${clase}: commit completo y original conservado`, async () => {
  const originalId = await originalCorreccion(clase), ref = db.doc(`${B}/finanzas_movimientos/${originalId}`), antes = await ref.get();
  const e = await entradaCorreccion('reversion', originalId), a = adaptar(), r = await a.ejecutar(e);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_reversiones/${originalId}`,
    ...antes.data().movimiento.asientos.map(x => `${B}/finanzas_saldos/${x.cuentaId}`), `${B}/finanzas_resumenes/2026-10`,
    `${B}/finanzas_control/libro`, `${B}/finanzas_auditoria/${r.movimientoId}`, `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p)));
  docs.forEach(d => { assert.ok(d.exists); assert.ok(d.updateTime.isEqual(docs[0].updateTime)); });
  assert.equal(a.metricas.escriturasPreparadas, clase === 'transferencia' ? 8 : 7);
  const despues = await ref.get(); assert.ok(despues.updateTime.isEqual(antes.updateTime)); assert.deepEqual(despues.data(), antes.data());
  assert.deepEqual(docs[0].data().movimiento.asientos, antes.data().movimiento.asientos.map(x => ({ ...x, deltaMinor: -x.deltaMinor })));
  assert.equal(docs[0].data().movimiento.reversaDe, originalId); assert.equal(docs[1].data().reversionId, r.movimientoId);
  const libro = await comprobarLibroActual(); assert.equal(libro.saldoFinalMinor, 10000); assert.equal(libro.resultadoMinor, 0);
  assert.equal(libro.ingresosNetosMinor, 0); assert.equal(libro.gastosNetosMinor, 0);
  const confirmado = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), confirmado);
  await sinCambios(await entradaCorreccion('reversion', originalId, ADMIN, 'fin7c3b_correccion_002'), 'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
  for (const [p, d] of Object.entries(confirmado)) if (p !== `${B}/finanzas_movimientos/${r.movimientoId}`) {
    assert.equal(JSON.stringify(d).includes(e.solicitud.motivo), false);
  }
  const c = reglas.authenticatedContext(ADMIN).firestore(), ajeno = reglas.authenticatedContext('ajeno_correcciones').firestore();
  await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await assertFails(getDoc(doc(ajeno, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await assertFails(getDoc(doc(c, rutas[1]))); await assertFails(setDoc(doc(c, rutas[1]), { reversionId: 'falsa' }));
  await assertFails(getDoc(doc(c, rutas.at(-1))));
  await assertFails(updateDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`), { evento: 'falso' }));
});
escenario('FIN-7C.3B Periodo cerrado conserva su resumen; reversa solo en mes abierto', async () => {
  const originalId = await originalCorreccion(), cerrado = await db.doc(`${B}/finanzas_resumenes/2026-10`).get();
  await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: ['2026-11'] });
  const e = await entradaCorreccion('reversion', originalId); e.solicitud.periodoId = '2026-11'; e.solicitud.fechaContable = '2026-11-01';
  await adaptar().ejecutar(e); const despues = await cerrado.ref.get();
  assert.ok(despues.updateTime.isEqual(cerrado.updateTime)); assert.deepEqual(despues.data(), cerrado.data());
  const libro = await comprobarLibroActual('2026-11'); assert.equal(libro.gastosNetosMinor, -4000);
  assert.equal(libro.saldoInicialMinor, 6000); assert.equal(libro.saldoFinalMinor, 10000);
});
for (const delta of [1000, -1000]) escenario(`FIN-7C.3B Ajuste ${delta}: seis documentos atomicos, sin resultado ordinario`, async () => {
  const e = await entradaCorreccion(); e.solicitud.deltaMinor = delta; const a = adaptar(), r = await a.ejecutar(e);
  const rutas = [`${B}/finanzas_movimientos/${r.movimientoId}`, `${B}/finanzas_saldos/caja`, `${B}/finanzas_resumenes/2026-10`,
    `${B}/finanzas_control/libro`, `${B}/finanzas_auditoria/${r.movimientoId}`, `operaciones_financieras/${ADMIN}/solicitudes/${e.solicitud.solicitudId}`];
  const docs = await db.getAll(...rutas.map(p => db.doc(p))); docs.forEach(d => assert.ok(d.updateTime.isEqual(docs[0].updateTime)));
  assert.equal(a.metricas.escriturasPreparadas, 6); assert.equal(docs[0].data().movimiento.clase, 'ajuste');
  assert.equal(docs[0].data().privado.motivo, e.solicitud.motivo); assert.equal(docs[0].data().clasificacion, null);
  const libro = await comprobarLibroActual(); assert.equal(libro.ajustesNetosMinor, delta); assert.equal(libro.resultadoMinor, 0);
  assert.equal(libro.saldoFinalMinor, 10000 + delta); assert.equal(docs[1].data().auxiliar, 'Conservar');
  for (const d of docs.slice(1)) assert.equal(JSON.stringify(d.data()).includes(e.solicitud.motivo), false);
  const c = reglas.authenticatedContext(ENC).firestore();
  await assertSucceeds(getDoc(doc(c, `${B}/finanzas_auditoria/${r.movimientoId}`)));
  await assertFails(getDoc(doc(c, rutas.at(-1)))); await assertFails(getDoc(doc(reglas.authenticatedContext(ADMIN).firestore(), rutas.at(-1))));
});
for (const tipo of ['reversion', 'ajuste']) {
  for (const caso of ['encargado', 'modulo', 'pertenenciaAnterior', 'otraIglesia', 'transferenciaAdministrativa', 'periodoCerrado', 'sinMotivo']) {
    escenario(`FIN-7C.3B ${tipo}: rechazo ${caso} sin cambios`, async () => {
      const originalId = await originalCorreccion(), e = await entradaCorreccion(tipo, originalId, caso === 'encargado' ? ENC : ADMIN);
      if (caso === 'modulo') await db.doc(`${B}/finanzas_config/acceso`).update({ moduloHabilitado: false });
      if (caso === 'pertenenciaAnterior') await db.doc(`usuarios_globales/${ADMIN}`).update({ pertenenciaId: 'b'.repeat(64) });
      if (caso === 'otraIglesia') await db.doc(`usuarios_globales/${ADMIN}`).update({ iglesiaId: 'otra' });
      if (caso === 'transferenciaAdministrativa') {
        const b = db.batch(); b.update(db.doc(B), { adminUid: ENC }); b.update(db.doc(`usuarios_globales/${ADMIN}`), { rolGlobal: 'servidor' });
        b.update(db.doc(`usuarios_globales/${ENC}`), { rolGlobal: 'admin_iglesia' }); await b.commit();
      }
      if (caso === 'periodoCerrado') await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: [] });
      if (caso === 'sinMotivo') delete e.solicitud.motivo;
      await sinCambios(e);
    });
  }
  escenario(`FIN-7C.3B ${tipo}: perdida de respuesta, reintento y rechazo de payload distinto`, async () => {
    const originalId = await originalCorreccion(), e = await entradaCorreccion(tipo, originalId);
    await assert.rejects(adaptar({ despuesCommit: () => { throw Error('Respuesta perdida simulada'); } }).ejecutar(e), cod('RESULTADO_INCIERTO'));
    const antes = await foto(); assert.equal((await adaptar().ejecutar(e)).historica, true); assert.deepEqual(await foto(), antes);
    e.solicitud.motivo = 'Motivo distinto'; await sinCambios(e, 'RECIBO_NO_COINCIDE');
  });
  escenario(`FIN-7C.3B ${tipo}: fallo SDK despues de escrituras preparadas no deja cambios parciales`, async () => {
    const originalId = await originalCorreccion(), e = await entradaCorreccion(tipo, originalId), antes = await foto(); let inyectado = false;
    await assert.rejects(adaptar({ falloEscritura: (tx, tipo, args) => {
      if (args[0].path === `${B}/finanzas_control/libro`) { inyectado = true; tx.update(args[0], { invalido: undefined }); }
    } }).ejecutar(e), cod('RESULTADO_INCIERTO')); assert.ok(inyectado); assert.deepEqual(await foto(), antes);
  });
  escenario(`FIN-7C.3B ${tipo}: ABORTED reintenta sin duplicar movimiento ni marcador`, async () => {
    const originalId = await originalCorreccion(), e = await entradaCorreccion(tipo, originalId), antes = (await db.collection(`${B}/finanzas_movimientos`).get()).size;
    const a = adaptar({ despuesCallback: m => { if (m.intentos === 1) { const error = Error('ABORTED'); error.code = 10; throw error; } } });
    await a.ejecutar(e); assert.equal(a.metricas.intentos, 2); assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, antes + 1);
    assert.equal((await db.collection(`${B}/finanzas_reversiones`).get()).size, tipo === 'reversion' ? 1 : 0); await comprobarLibroActual();
  });
  escenario(`FIN-7C.3B ${tipo}: ultimo cupo del libro, replay y siguiente bloqueado`, async () => {
    const originalId = await originalCorreccion(), b = db.batch();
    for (let i = 3; i < 200; i++) {
      const id = `i_${i}`; b.create(db.doc(`${B}/finanzas_movimientos/${id}`), { versionEsquema: 1, iglesiaId: 'fin7b', secuencia: i,
        estado: 'confirmado', movimiento: crearIngreso({ id, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1,
          fechaContable: '2026-10-02', periodoId: '2026-10' }) });
    }
    b.update(db.doc(`${B}/finanzas_control/libro`), { ultimaSecuencia: 199 }); b.update(db.doc(`${B}/finanzas_saldos/caja`), { saldoMinor: 6197, ultimaSecuencia: 199 });
    b.delete(db.doc(`${B}/finanzas_resumenes/2026-10`)); await b.commit();
    const e = await entradaCorreccion(tipo, originalId); await adaptar().ejecutar(e); assert.equal((await adaptar().ejecutar(e)).historica, true);
    await sinCambios(await entradaCorreccion('ajuste', null, ADMIN, 'fin7c3b_limite_002'), 'LIMITE_LIBRO_EXCEDIDO');
  });
}
for (const caso of ['inexistente', 'incierto', 'versionOriginal', 'marcadorHuerfano', 'apertura', 'ajuste', 'reversa']) {
  escenario(`FIN-7C.3B Original invalido: ${caso}`, async () => {
    let originalId = await originalCorreccion();
    if (caso === 'inexistente') originalId = 'ausente';
    if (caso === 'apertura') originalId = 'apertura';
    if (caso === 'ajuste') originalId = (await adaptar().ejecutar(await entradaCorreccion())).movimientoId;
    if (caso === 'reversa') originalId = (await adaptar().ejecutar(await entradaCorreccion('reversion', originalId))).movimientoId;
    const e = await entradaCorreccion('reversion', originalId, ADMIN, 'fin7c3b_rechazo_001');
    if (caso === 'incierto') await db.doc(`${B}/finanzas_movimientos/${originalId}`).update({ estado: 'incierto' });
    if (caso === 'versionOriginal') e.solicitud.precondiciones.original.version = '1700000000:0';
    if (caso === 'marcadorHuerfano') await db.doc(`${B}/finanzas_reversiones/${originalId}`).create({ reversionId: 'incoherente' });
    await sinCambios(e);
  });
}
for (const clase of ['ingreso', 'transferencia']) escenario(`FIN-7C.3B Reversion ${clase}: saldo insuficiente en cuenta debitada`, async () => {
  const originalId = await originalCorreccion(clase), original = (await db.doc(`${B}/finanzas_movimientos/${originalId}`).get()).data().movimiento;
  const cuentaId = original.asientos.find(a => a.deltaMinor > 0).cuentaId, e = await entradaCorreccion();
  const saldo = (await db.doc(`${B}/finanzas_saldos/${cuentaId}`).get()).data().saldoMinor;
  e.solicitud.cuentaId = cuentaId; e.solicitud.deltaMinor = -saldo;
  e.solicitud.precondiciones.cuentas = [{ cuentaId, version: version(await db.doc(`${B}/finanzas_cuentas/${cuentaId}`).get()) }];
  await adaptar().ejecutar(e);
  await sinCambios(await entradaCorreccion('reversion', originalId, ADMIN, 'fin7c3b_saldo_reversion_001'), 'SALDO_INSUFICIENTE');
});
escenario('FIN-7C.3B Dos solicitudes concurrentes de reversa crean un solo marcador y contrapartida', async () => {
  const originalId = await originalCorreccion(), a = await entradaCorreccion('reversion', originalId),
    b = await entradaCorreccion('reversion', originalId, ADMIN, 'fin7c3b_reversion_002');
  const resultados = await Promise.allSettled([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
  assert.equal((await db.collection(`${B}/finanzas_reversiones`).get()).size, 1);
  assert.equal((await db.collection(`${B}/finanzas_movimientos`).get()).size, 3); assert.equal((await comprobarLibroActual()).saldoFinalMinor, 10000);
});
escenario('FIN-7C.3B Dos ajustes negativos concurrentes no sobregiran', async () => {
  const a = await entradaCorreccion(), b = await entradaCorreccion('ajuste', null, ADMIN, 'fin7c3b_ajuste_002');
  a.solicitud.deltaMinor = -7000; b.solicitud.deltaMinor = -7000;
  const resultados = await Promise.allSettled([adaptar().ejecutar(a), adaptar().ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  const libro = await comprobarLibroActual(); assert.equal(libro.saldoFinalMinor, 3000); assert.equal(libro.resultadoMinor, 0);
});

// FIN-7C.4D.1: barrera real del SDK contra Firestore demo.
const PROTOCOLO = B + '/finanzas_control/protocolo';
const OPS_PROTOCOLO = ['crearCuenta', 'crearCategoria', 'apertura', 'ingreso', 'gasto', 'transferencia', 'ajuste', 'reversion'];
async function prepararEscritorProtocolo(op) {
  if (op === 'crearCuenta' || op === 'crearCategoria') return entradaCatalogo(op);
  if (op === 'apertura') return entradaApertura(await bancoParaTransferir());
  if (op === 'ingreso') return entradaIngreso(await crearCategoriaIngreso());
  if (op === 'transferencia') return entradaTransferencia('caja', await bancoParaTransferir());
  if (op === 'ajuste') return entradaCorreccion();
  if (op === 'reversion') return entradaCorreccion('reversion', await originalCorreccion());
  return entrada();
}
for (const op of OPS_PROTOCOLO) {
  for (const estado of ['bloqueado', 'transicion', 'operativo_v2']) escenario('Protocolo SDK ' + op + ' rechaza ' + estado, async () => {
    const e = await prepararEscritorProtocolo(op); await db.doc(PROTOCOLO).update({ estado });
    await sinCambios(e, 'PROTOCOLO_ESCRITURA_BLOQUEADA');
  });
  escenario('Protocolo SDK ' + op + ': recibo historico con bloqueo y protocolo eliminado', async () => {
    const e = await prepararEscritorProtocolo(op), r = await adaptar().ejecutar(e);
    await db.doc(PROTOCOLO).update({ estado: 'bloqueado' });
    for (const eliminar of [false, true]) {
      if (eliminar) await db.doc(PROTOCOLO).delete();
      const antes = await foto(), a = adaptar();
      assert.deepEqual(await a.ejecutar(e), { ...r, historica: true });
      assert.equal(a.metricas.escriturasPreparadas, 0); assert.deepEqual(await foto(), antes);
    }
  });
  escenario('Protocolo SDK ' + op + ': ausente tras inicializacion no omite bloqueo', async () => {
    const e = await prepararEscritorProtocolo(op); await db.doc(PROTOCOLO).delete();
    await sinCambios(e, 'PROTOCOLO_AUSENTE');
  });
}
for (const [campo, valor, codigo] of [
  ['estado', 'desconocido', 'PROTOCOLO_ESTADO_INVALIDO'],
  ['versionProtocolo', 2, 'PROTOCOLO_VERSION_INCOMPATIBLE'],
  ['versionProtocolo', '1', 'PROTOCOLO_VERSION_INCOMPATIBLE'],
  ['epoca', 2, 'PROTOCOLO_EPOCA_INCOMPATIBLE'],
  ['epoca', null, 'PROTOCOLO_EPOCA_INCOMPATIBLE'],
  ['iglesiaId', 'otra', 'PROTOCOLO_IGLESIA_INCOHERENTE'],
]) escenario('Protocolo SDK incompatible: ' + campo + '=' + String(valor), async () => {
  await db.doc(PROTOCOLO).update({ [campo]: valor }); await sinCambios(await entrada(), codigo);
});
escenario('Protocolo SDK invalido: campos inesperados no se ignoran', async () => {
  await db.doc(PROTOCOLO).update({ ignorarBloqueo: true }); await sinCambios(await entrada(), 'CAMPOS_INVALIDOS');
});
for (const op of ['gasto', 'transferencia', 'reversion']) {
  escenario('Protocolo SDK carrera ' + op + ': operacion iniciada antes, bloqueo confirmado antes de lectura', async () => {
    const e = await prepararEscritorProtocolo(op); let hecho = false;
    const a = adaptar({ antesLectura: async r => {
      if (!hecho && r.path === PROTOCOLO) { hecho = true; await db.doc(PROTOCOLO).update({ estado: 'bloqueado' }); }
    } });
    const antes = await foto(); await assert.rejects(a.ejecutar(e), cod('PROTOCOLO_ESCRITURA_BLOQUEADA'));
    delete antes[PROTOCOLO]; const despues = await foto(); delete despues[PROTOCOLO];
    assert.deepEqual(despues, antes); assert.ok(hecho); assert.equal(a.metricas.escriturasPreparadas, 0);
  });
  escenario('Protocolo SDK carrera ' + op + ': bloqueo concurrente tras lectura, orden de commits verificado', async () => {
    const e = await prepararEscritorProtocolo(op), antes = await foto(); let bloqueo;
    const a = adaptar({ despuesCallback: () => {
      if (!bloqueo) { bloqueo = db.doc(PROTOCOLO).update({ estado: 'bloqueado' }); bloqueo.catch(() => {}); }
      // No esperar un escritor que puede estar esperando el lock de esta transaccion.
    } });
    const [resultado] = await Promise.allSettled([a.ejecutar(e)]);
    assert.ok(bloqueo); await bloqueo;
    if (resultado.status === 'fulfilled') {
      const m = await db.doc(B + '/finanzas_movimientos/' + resultado.value.movimientoId).get();
      const p = await db.doc(PROTOCOLO).get();
      const menorOIgual = m.updateTime.seconds < p.updateTime.seconds ||
        (m.updateTime.seconds === p.updateTime.seconds && m.updateTime.nanoseconds <= p.updateTime.nanoseconds);
      assert.ok(menorOIgual, 'Un escritor no puede confirmar despues de un bloqueo ya confirmado');
      await comprobarLibroActual();
      assert.equal((await adaptar().ejecutar(e)).historica, true);
      console.log('Protocolo: escritor serializado antes del bloqueo: ' + op + ', intentos=' + a.metricas.intentos);
    } else {
      assert.equal(resultado.reason.codigo, 'PROTOCOLO_ESCRITURA_BLOQUEADA');
      delete antes[PROTOCOLO]; const despues = await foto(); delete despues[PROTOCOLO]; assert.deepEqual(despues, antes);
      console.log('Protocolo: bloqueo gana y escritor rechaza: ' + op + ', intentos=' + a.metricas.intentos);
    }
    const despues = await foto(); await assert.rejects(adaptar().ejecutar({ ...e, solicitud: { ...e.solicitud,
      solicitudId: 'protocolo_otra_intencion_001' } }), cod('PROTOCOLO_ESCRITURA_BLOQUEADA'));
    assert.deepEqual(await foto(), despues);
  });
  escenario('Protocolo SDK retry ' + op + ': ABORTED y bloqueo entre intentos obliga a releer', async () => {
    const e = await prepararEscritorProtocolo(op), antes = await foto(); let bloqueado = false;
    const a = adaptar({ antesLectura: async (r, m) => {
      if (m.intentos === 2 && r.path.includes('/solicitudes/') && !bloqueado) {
        await db.doc(PROTOCOLO).update({ estado: 'bloqueado' }); bloqueado = true;
      }
    }, despuesCallback: m => {
      if (m.intentos === 1) { const error = new Error('ABORTED inyectado para liberar el primer intento'); error.code = 10; throw error; }
    } });
    await assert.rejects(a.ejecutar(e), cod('PROTOCOLO_ESCRITURA_BLOQUEADA'));
    assert.equal(a.metricas.intentos, 2); assert.ok(bloqueado);
    delete antes[PROTOCOLO]; const despues = await foto(); delete despues[PROTOCOLO]; assert.deepEqual(despues, antes);
  });
}
escenario('Protocolo SDK aislado por iglesia; revocacion sigue denegando aunque V1 este operativo', async () => {
  await db.doc('iglesias/otra/finanzas_control/protocolo').create({ iglesiaId: 'otra', versionProtocolo: 1, epoca: 1, estado: 'bloqueado' });
  await adaptar().ejecutar(await entrada());
  const e = await entrada(ENC, 'protocolo_revocacion_001');
  await db.doc(B + '/finanzas_config/acceso').update({ encargadoUid: null });
  await sinCambios(e, 'CONTABILIDAD_NO_AUTORIZADA');
});
for (const uid of [ADMIN, ENC, 'ajeno_fin7b', null]) escenario('Protocolo SDK privado frente a cliente ' + String(uid), async () => {
  const c = (uid ? reglas.authenticatedContext(uid) : reglas.unauthenticatedContext()).firestore();
  const p = doc(c, PROTOCOLO), antes = await foto();
  await assertFails(getDoc(p)); await assertFails(getDocs(collection(c, B + '/finanzas_control')));
  await assertFails(updateDoc(p, { estado: 'operativo_v1' }));
  await assertFails(setDoc(p, { iglesiaId: 'fin7b', versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' }));
  await assertFails(setDoc(p, { estado: 'operativo_v1' }, { merge: true })); await assertFails(deleteDoc(p));
  assert.deepEqual(await foto(), antes);
});

// Secuencial y al final: la suite existente limpia el MISMO emulador.
test('35 Regresiones existentes de reglas financieras sin modificarlas', { timeout: 180000 }, async t => {
  if (detener) return t.skip('No ejecutar regresiones tras un fallo anterior.');
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  // Node transmite este indicador a hijos de un test; heredarlo omite node --test.
  delete env.NODE_TEST_CONTEXT;
  let salida = '';
  const codigo = await new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, ['--test', '--test-reporter=spec',
      path.join(__dirname, '../finanzas_rules/finanzas.test.js')],
    { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    hijo.stdout.setEncoding('utf8'); hijo.stderr.setEncoding('utf8');
    hijo.stdout.on('data', texto => { salida += texto; process.stdout.write(texto); });
    hijo.stderr.on('data', texto => process.stderr.write(texto));
    hijo.once('error', reject); hijo.once('exit', resolve);
  });
  assert.equal(codigo, 0, 'Fallaron regresiones financieras existentes');
  const total = Number(salida.match(/\btests\s+(\d+)/)?.[1]);
  const aprobadas = Number(salida.match(/\bpass\s+(\d+)/)?.[1]);
  const fallidas = Number(salida.match(/\bfail\s+(\d+)/)?.[1]);
  const omitidas = Number(salida.match(/\bskipped\s+(\d+)/)?.[1]);
  assert.ok(total > 0 && aprobadas === total && fallidas === 0 && omitidas === 0,
    'No se acredita regresion sin resumen completo de pruebas ejecutadas');
  console.log(`FIN-7B.1: regresiones financieras reales ejecutadas: ${total}, fallidas: ${fallidas}.`);
});
