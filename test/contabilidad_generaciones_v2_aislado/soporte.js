'use strict';
require('../../functions/contabilidad_generaciones_v2_demo/entorno').verificarEntorno();
const assert = require('node:assert/strict');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { leerFuente } = require('../../functions/contabilidad_generaciones_v2_demo/fuente');
const { conciliar, normalizarPagina } = require('../../functions/contabilidad_generaciones_v2_demo/modelo');
const I = 'prep_v2_ficticia', A = 'admin_ficticio', P = 'a'.repeat(64), B = `iglesias/${I}`;
const parametros = cambio => ({ iglesiaId: I, ejecucionId: 'preparacion_001', generacionId: 'nueva_001',
  operador: 'b'.repeat(64), epoca: 1, periodoId: '2026-11', pagina: 2, lote: 2, ...cambio });
async function sembrar(db, FieldValue, mixto = true, reversas = ['gasto']) {
  const b = db.batch();
  const docs = {
    [B]: { adminUid: A }, [`usuarios_globales/${A}`]: { iglesiaId: I, rolGlobal: 'admin_iglesia', pertenenciaId: P },
    [`${B}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: null },
    [`${B}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: I, moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
    [`${B}/finanzas_control/libro`]: { versionEsquema: 1, iglesiaId: I, ultimaSecuencia: 0, huboMovimientos: false },
    [`${B}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: I, periodosAbiertos: ['2026-10'] },
    [`${B}/finanzas_control/protocolo`]: { versionProtocolo: 1, iglesiaId: I, epoca: 1, estado: 'operativo_v1' },
  };
  for (const [r, d] of Object.entries(docs)) b.create(db.doc(r), d); await b.commit();
  let contador = 0;
  async function solicitud(op, campos = {}, mes = '2026-10') {
    const vers = async r => { const s = await db.doc(r).get(); return `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`; };
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
      if (original) precondiciones.original = { version: `${original.updateTime.seconds}:${original.updateTime.nanoseconds}`, versionReversion: null };
    }
    return { auth: { uid: A }, operacion: op, solicitud: { versionEsquema: 1, solicitudId: `fixture_operacion_${String(++contador).padStart(8, '0')}`,
      iglesiaId: I, periodoId: mes, ...(!catalogo ? { fechaContable: `${mes}-17` } : {}),
      ...(['ajuste', 'reversion'].includes(op) ? { motivo: 'Correccion ficticia', referenciaAuditoria: 'fixture_referencia' } : {}), ...campos, precondiciones } };
  }
  const ejecutar = async (op, campos, mes) => crearAdaptadorFirestore({ db, FieldValue }).ejecutar(await solicitud(op, campos, mes));
  let cuentas = {};
  if (mixto) {
    const caja = (await ejecutar('crearCuenta', { cuenta: { codigo: 'CAJA', nombre: 'Caja', tipo: 'caja' } })).cuentaId;
    const banco = (await ejecutar('crearCuenta', { cuenta: { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' } })).cuentaId;
    const ingreso = (await ejecutar('crearCategoria', { categoria: { codigo: 'DIEZMOS', nombre: 'Diezmos', naturaleza: 'ingreso', tipoIngreso: 'diezmos' } })).categoriaId;
    const gasto = (await ejecutar('crearCategoria', { categoria: { codigo: 'GASTOS', nombre: 'Gastos', naturaleza: 'gasto', tipoIngreso: null } })).categoriaId;
    await ejecutar('apertura', { cuentaId: caja, montoMinor: 10000 });
    const originales = {};
    originales.ingreso = (await ejecutar('ingreso', { cuentaId: caja, categoriaId: ingreso, montoMinor: 2000,
      aportante: { nombre: 'Persona ficticia privada' } })).movimientoId;
    originales.gasto = (await ejecutar('gasto', { cuentaId: caja, categoriaId: gasto, montoMinor: 1000 })).movimientoId;
    originales.transferencia = (await ejecutar('transferencia', { origenId: caja, destinoId: banco, montoMinor: 1000 })).movimientoId;
    await ejecutar('ajuste', { cuentaId: caja, deltaMinor: -100 });
    await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: ['2026-11'] });
    for (const tipo of reversas) await ejecutar('reversion', { originalId: originales[tipo] }, '2026-11');
    cuentas = { caja, banco, ingreso, gasto, originales };
  } else await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: ['2026-11'] });
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'bloqueado' });
  // D2 sintetica declarada como fixture, no como ejecucion acreditada original.
  // Sus importes/checkpoint se calculan sobre commits V1 REALES, nunca recibos inventados.
  const f = await db.runTransaction(tx => leerFuente(tx, db, parametros()));
  const r = conciliar(f, null, normalizarPagina(f.movimientos), true);
  const lote = db.batch(), d2 = `${B}/finanzas_generaciones_demo/d2_original`;
  lote.create(db.doc(d2), { versionEsquema: 2, epoca: 1, activa: false, estado: 'verificada',
    corte: f.proyecciones.corte, fixtureSintetica: true });
  lote.create(db.doc(`${B}/finanzas_ejecuciones_demo/d2_original`), { versionEsquema: 1,
    fixtureSintetica: true, checkpoint: r.checkpoint, corte: f.proyecciones.corte, estado: 'verificada' });
  for (const s of r.checkpoint.reconstruccion.saldos) lote.create(db.doc(`${d2}/saldos/${s.cuentaId}`), s);
  for (const p of r.checkpoint.reconstruccion.periodos) lote.create(db.doc(`${d2}/periodos/${p.periodoId}`), p);
  await lote.commit();
  return { ...cuentas, solicitud, ejecutar };
}
async function foto(db) {
  const datos = {};
  async function recorrer(doc) {
    for (const col of await doc.listCollections()) for (const d of (await col.get()).docs) {
      datos[d.ref.path] = { datos: d.data(), version: `${d.updateTime.seconds}:${d.updateTime.nanoseconds}` }; await recorrer(d.ref);
    }
  }
  for (const c of await db.listCollections()) for (const d of (await c.get()).docs) {
    datos[d.ref.path] = { datos: d.data(), version: `${d.updateTime.seconds}:${d.updateTime.nanoseconds}` }; await recorrer(d.ref);
  }
  return datos;
}
async function conservar(db, anterior) {
  const ahora = await foto(db);
  for (const [r, v] of Object.entries(anterior)) assert.deepEqual(ahora[r], v, 'Fuente historica alterada');
}
module.exports = Object.freeze({ sembrar, parametros, foto, conservar, I, A, P, B });
