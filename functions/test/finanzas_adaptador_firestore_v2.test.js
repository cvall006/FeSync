'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearAdaptadorFirestoreV2 } = require('../finanzas_core/adaptador_firestore_v2');
const { crearAdaptadorFirestore } = require('../finanzas_core/adaptador_firestore');
const { semilla, entrada, libro, A, E, B, G, P } = require('../../test/finanzas_v2_aislado/fixtures');
const copia = v => structuredClone(v), FV = { serverTimestamp: () => ({ servidor: true }) };

// MVCC documental, no queries: cualquier consulta historica falla. Solo dobles,
// la atomicidad y contencion del SDK real se prueban en la suite aislada.
class Doble {
  constructor(docs) { this.docs = copia(docs); this.v = {}; this.intentos = 0; this.lecturas = 0; this.escrituras = 0; }
  doc(path) { return { path, get: async () => this.snapshot(path) }; }
  snapshot(p) { const d = copia(this.docs[p]); return { exists: d !== undefined,
    updateTime: { seconds: 1700000000, nanoseconds: this.v[p] || 0 }, data: () => copia(d) }; }
  cambiar(p, d) { this.docs[p] = copia(d); this.v[p] = (this.v[p] || 0) + 1; }
  async runTransaction(fn) {
    for (let n = 0; n < 8; n++) {
      this.intentos++; const observados = new Map(), writes = []; let escribiendo = false;
      const tx = { get: async r => { assert.equal(escribiendo, false); assert.equal(typeof r.path, 'string');
        this.lecturas++; observados.set(r.path, this.v[r.path] || 0); return this.snapshot(r.path); },
      create: (r, d) => { escribiendo = true; writes.push(['create', r.path, copia(d)]); },
      update: (r, d) => { escribiendo = true; writes.push(['update', r.path, copia(d)]); } };
      const r = await fn(tx);
      if (this.antesCommit) { const f = this.antesCommit; this.antesCommit = null; await f(); }
      if ([...observados].some(([p, v]) => (this.v[p] || 0) !== v)) continue;
      if (this.fallar) throw Error('fallo simulado privado');
      const nuevo = copia(this.docs);
      for (const [op, p, d] of writes) {
        if (op === 'create') { assert.equal(nuevo[p], undefined); nuevo[p] = d; }
        else { assert.notEqual(nuevo[p], undefined); nuevo[p] = { ...nuevo[p], ...d }; }
      }
      for (const [, p] of writes) this.v[p] = (this.v[p] || 0) + 1;
      this.docs = nuevo; this.escrituras += writes.length;
      if (this.perder) { this.perder = false; throw Error('respuesta perdida'); }
      return r;
    }
    throw Error('conflicto');
  }
}
async function caso(uid = A, n = 1) {
  const db = new Doble(semilla(n).docs), e = await entrada(db, uid);
  const api = crearAdaptadorFirestoreV2({ db, FieldValue: FV });
  return { db, e, api };
}
const rechaza = async (f, codigo) => assert.rejects(f, e => codigo ? e.codigo === codigo : !!e.codigo);
test('gasto aplica siete escrituras y equivalencia con FIN-2 sin mutar entrada', async () => {
  const { db, e, api } = await caso(), original = copia(e);
  const r = await api.ejecutar(e); assert.equal(r.secuencia, 2); assert.equal(db.escrituras, 7);
  assert.equal(db.docs[`${G}/saldos/caja`].proyeccion.saldoMinor, 6000);
  const movimientos = Object.entries(db.docs).filter(([p]) => p.startsWith(`${B}/finanzas_movimientos/`)).map(([, d]) => d.movimiento);
  const l = libro(movimientos); assert.equal(l.gastosNetosMinor, 4000);
  assert.equal(db.docs[`${G}/consolidados/CLP`].datos.saldoFinalMinor, l.saldoFinalMinor);
  assert.deepEqual(e, original); assert.ok(Object.isFrozen(r));
});
test('encargado vigente con rol servidor registra sin privilegios generales', async () => {
  const { api, e } = await caso(E); assert.equal((await api.ejecutar(e)).estado, 'CONFIRMADA');
});
const negativos = [
  ['generacion inactiva', `${G}`, d => ({ ...d, activa: false })],
  ['generacion D2 incompleta', `${G}`, () => ({ versionEsquema: 2, activa: false, epoca: 1 })],
  ['protocolo V1', `${B}/finanzas_control/protocolo`, d => ({ ...d, estado: 'operativo_v1' })],
  ['bloqueo', `${B}/finanzas_control/protocolo`, d => ({ ...d, estado: 'bloqueado' })],
  ['version desconocida', `${B}/finanzas_control/protocolo`, d => ({ ...d, versionProtocolo: 2 })],
  ['epoca', `${B}/finanzas_control/protocolo`, d => ({ ...d, epoca: 2 })],
  ['puntero incoherente', `${B}/finanzas_control/generacion_v2`, d => ({ ...d, generacionId: 'otra' })],
  ['generacion de otra iglesia', G, d => ({ ...d, iglesiaId: 'otra' })],
  ['modulo apagado', `${B}/finanzas_config/acceso`, d => ({ ...d, moduloHabilitado: false })],
  ['periodo cerrado', `${B}/finanzas_control/periodo`, d => ({ ...d, periodosAbiertos: [] })],
  ['cuenta archivada', `${B}/finanzas_cuentas/caja`, d => ({ cuenta: { ...d.cuenta, estado: 'archivada' } })],
  ['categoria archivada', `${B}/finanzas_categorias/gastos`, d => ({ categoria: { ...d.categoria, estado: 'archivada' } })],
  ['categoria ingreso', `${B}/finanzas_categorias/gastos`, d => ({ categoria: { ...d.categoria, naturaleza: 'ingreso', tipoIngreso: 'otros' } })],
  ['miembro desvinculado', `usuarios_globales/${A}`, d => ({ ...d, iglesiaId: null })],
  ['pertenencia anterior', `usuarios_globales/${A}`, d => ({ ...d, pertenenciaId: 'b'.repeat(64) })],
  ['perfil legado', `usuarios_globales/${A}`, d => ({ iglesiaId: d.iglesiaId, rolGlobal: d.rolGlobal })],
  ['admin incoherente', B, d => ({ ...d, adminUid: E })],
  ['resumen desfasado', `${G}/periodos/2026-10`, d => ({ ...d, revision: 0 })],
  ['consolidado divergente', `${G}/consolidados/CLP`, d => ({ ...d, datos: { ...d.datos, saldoFinalMinor: 33 } })],
  ['revision cuenta futura', `${G}/saldos/caja`, d => ({ ...d, proyeccion: { ...d.proyeccion, revision: 9 } })],
  ['historial cuenta incompatible con revision', `${G}/saldos/caja`, d => ({ ...d, huboMovimientos: false, aperturaRegistrada: false })],
  ['solicitudes inciertas', `${G}/saldos/caja`, d => ({ ...d, solicitudesInciertas: 1 })],
  ['config incompatible', `${B}/finanzas_config/contabilidad`, d => ({ ...d, moneda: 'USD' })],
];
for (const [nombre, ruta, cambiar] of negativos) test(`rechaza ${nombre} sin escrituras`, async () => {
  const { db, e, api } = await caso(); db.docs[ruta] = cambiar(db.docs[ruta]); const antes = copia(db.docs);
  await rechaza(() => api.ejecutar(e)); assert.deepEqual(db.docs, antes); assert.equal(db.escrituras, 0);
});
test('encargado revocado no puede registrar', async () => {
  const { db, e, api } = await caso(E); db.docs[`${B}/finanzas_config/acceso`].encargadoUid = null;
  await rechaza(() => api.ejecutar(e), 'CONTABILIDAD_NO_AUTORIZADA');
});
for (const [nombre, cambiar] of [
  ['saldo insuficiente', e => { e.solicitud.montoMinor = 10001; }],
  ['cero', e => { e.solicitud.montoMinor = 0; }],
  ['fraccion', e => { e.solicitud.montoMinor = 1.5; }],
  ['campo actor cliente', e => { e.solicitud.actorUid = A; }],
  ['aportante en gasto', e => { e.solicitud.aportante = { nombre: 'No admitir' }; }],
  ['version intencion vencida', e => { e.solicitud.precondiciones.cuenta = '1:0'; }],
  ['iglesia ajena', e => { e.solicitud.iglesiaId = 'otra'; }],
  ['epoca intencion', e => { e.contextoV2.epoca = 2; }],
  ['sin Auth', e => { e.auth = null; }],
]) test(`entrada invalida: ${nombre}`, async () => {
  const { db, e, api } = await caso(); cambiar(e); await rechaza(() => api.ejecutar(e)); assert.equal(db.escrituras, 0);
});
test('idempotencia conserva historia aunque se bloquee protocolo y revoque actor', async () => {
  const { db, e, api } = await caso(); const r = await api.ejecutar(e), antes = db.escrituras;
  db.docs[`${B}/finanzas_control/protocolo`].estado = 'bloqueado'; delete db.docs[`usuarios_globales/${A}`];
  assert.equal((await api.ejecutar(e)).historica, true); assert.equal(db.escrituras, antes);
  e.solicitud.montoMinor++; await rechaza(() => api.ejecutar(e), 'RECIBO_NO_COINCIDE'); assert.ok(r.movimientoId);
});
test('commit confirmado con respuesta perdida recupera misma clave', async () => {
  const { db, e, api } = await caso(); db.perder = true;
  await rechaza(() => api.ejecutar(e), 'RESULTADO_INCIERTO'); assert.equal((await api.ejecutar(e)).historica, true);
  assert.equal(db.escrituras, 7);
});
test('fallo de commit no deja escrituras parciales', async () => {
  const { db, e, api } = await caso(), antes = copia(db.docs); db.fallar = true;
  await rechaza(() => api.ejecutar(e), 'RESULTADO_INCIERTO'); assert.deepEqual(db.docs, antes);
});
for (const [nombre, mutar] of [
  ['bloqueo', db => db.cambiar(`${B}/finanzas_control/protocolo`, { ...db.docs[`${B}/finanzas_control/protocolo`], estado: 'bloqueado' })],
  ['revocacion', db => db.cambiar(`${B}/finanzas_config/acceso`, { moduloHabilitado: true, encargadoUid: null })],
  ['transferencia', db => db.cambiar(B, { adminUid: E })],
]) test(`conflicto MVCC reintenta y deniega ${nombre}`, async () => {
  const { db, e, api } = await caso(E); db.antesCommit = () => mutar(db);
  await rechaza(() => api.ejecutar(e)); assert.equal(db.intentos, 2); assert.equal(db.escrituras, 0);
});
test('dos solicitudes con fondos para una resuelven conflicto sin sobregiro (doble)', async () => {
  const { db, e, api } = await caso(); e.solicitud.montoMinor = 7000;
  const otra = copia(e); otra.solicitud.solicitudId = 'solicitud_sintetica_0002';
  const rs = await Promise.allSettled([api.ejecutar(e), api.ejecutar(otra)]);
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(db.docs[`${G}/saldos/caja`].proyeccion.saldoMinor, 3000);
});
test('201 y 1001 movimientos: lecturas puntuales constantes y libro equivalente', async () => {
  const lecturas = [];
  for (const n of [1, 201, 1001]) {
    const { db, e, api } = await caso(A, n); const iniciales = db.lecturas; await api.ejecutar(e);
    lecturas.push(db.lecturas - iniciales);
    assert.equal(db.docs[`${G}/saldos/caja`].proyeccion.saldoMinor, 6000 + n - 1);
  }
  assert.deepEqual(lecturas, [17, 17, 17]);
});
test('fixture de recibo V1 validado por ambos adaptadores conserva historia y bytes', async () => {
  const { db, e, api } = await caso();
  // Fixture con construccion canonica V1, validado tambien por su replay real.
  // La creacion V1 con commit del SDK se prueba en la integracion aislada.
  const { createHash } = require('node:crypto');
  const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ?
    `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  const hash = v => createHash('sha256').update(canon(v)).digest('hex');
  const { crearGasto } = require('../finanzas_core/asientos');
  const id = hash(['finanzas-gasto-v1', A, e.solicitud.iglesiaId, e.solicitud.solicitudId]);
  const huella = hash({ uid: A, operacion: 'gasto', solicitud: e.solicitud });
  const r = { versionEsquema: 1, uid: A, operacion: 'gasto', solicitudId: e.solicitud.solicitudId,
    iglesiaId: e.solicitud.iglesiaId, pertenenciaId: P, huella, movimientoId: id, estado: 'confirmado', secuencia: 2 };
  db.docs[`operaciones_financieras/${A}/solicitudes/${r.solicitudId}`] = r;
  db.docs[`${B}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: r.iglesiaId, estado: 'confirmado',
    movimiento: crearGasto({ id, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 4000,
      fechaContable: e.solicitud.fechaContable, periodoId: e.solicitud.periodoId }), secuencia: 2,
    huella, solicitudId: r.solicitudId, responsable: { uid: A, pertenenciaId: P } };
  const antes = copia(db.docs);
  const v1 = crearAdaptadorFirestore({ db: { ...db, doc: db.doc.bind(db), collection() { throw Error('Sin queries en replay'); },
    runTransaction: db.runTransaction.bind(db) }, FieldValue: FV });
  const original = await v1.ejecutar({ auth: e.auth, operacion: 'gasto', solicitud: e.solicitud });
  const nuevo = await api.ejecutar(e); assert.equal(nuevo.versionEsquema, 1);
  assert.equal(nuevo.movimientoId, original.movimientoId); assert.equal(db.escrituras, 0); assert.deepEqual(db.docs, antes);
});
for (const ruta of [`${B}/finanzas_control/protocolo`, `${B}/finanzas_control/generacion_v2`, G,
  `${G}/control/libro`, `${G}/saldos/caja`, `${G}/periodos/2026-10`]) test(`ausencia no es inicializacion: ${ruta}`, async () => {
  const { db, e, api } = await caso(); delete db.docs[ruta]; const antes = copia(db.docs);
  await rechaza(() => api.ejecutar(e)); assert.deepEqual(db.docs, antes); assert.equal(db.escrituras, 0);
});
test('overflow de revision no produce escrituras', async () => {
  const { db, e, api } = await caso();
  for (const p of ['control/libro', 'consolidados/CLP', 'periodos/2026-10']) {
    db.docs[`${G}/${p}`].revision = Number.MAX_SAFE_INTEGER;
    db.docs[`${G}/${p}`].ultimoMovimientoId = 'ultimo_historico';
  }
  await rechaza(() => api.ejecutar(e), 'DESBORDAMIENTO'); assert.equal(db.escrituras, 0);
});
test('captura Auth y formulario antes del primer await', async () => {
  const { db, e, api } = await caso(); const r = api.ejecutar(e);
  e.auth.uid = 'otro'; e.solicitud.montoMinor = 9000; e.contextoV2.generacionId = 'otra';
  await r; assert.equal(db.docs[`${G}/saldos/caja`].proyeccion.saldoMinor, 6000);
});
test('getters no se ejecutan ni forman parte de payload', async () => {
  const { e, api } = await caso(); let ejecutado = false;
  Object.defineProperty(e.solicitud, 'descripcion', { enumerable: true, get() { ejecutado = true; return 'oculto'; } });
  await rechaza(() => api.ejecutar(e), 'CAMPOS_INVALIDOS'); assert.equal(ejecutado, false);
});
test('cambio de generacion en replay V2 no sustituye el contexto original', async () => {
  const { e, api, db } = await caso(); await api.ejecutar(e); e.contextoV2.generacionId = 'otra';
  await rechaza(() => api.ejecutar(e), 'RECIBO_NO_COINCIDE'); assert.equal(db.escrituras, 7);
});
