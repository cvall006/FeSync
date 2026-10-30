'use strict';
const { isDeepStrictEqual } = require('node:util');
const { exigir } = require('../finanzas_core/dinero');
const { validarConfiguracionContable } = require('../finanzas_core/configuracion');
const { validarCatalogoCuentas, validarEstadoCuenta } = require('../finanzas_core/cuentas');
const { validarCatalogoCategorias } = require('../finanzas_core/categorias');
const { hash, canon, version } = require('./util');
const LIMITES = Object.freeze({ finanzas_cuentas: 50, finanzas_categorias: 50, finanzas_movimientos: 200,
  finanzas_saldos: 50, finanzas_resumenes: 24, finanzas_reversiones: 200, finanzas_aperturas: 50,
  finanzas_reservas_cuentas: 50, finanzas_reservas_categorias: 50 });

// Toda fuente procede del MISMO intento transaccional. No se usa D2 como
// autoridad de importes, identidad o acreditacion. Sus documentos nunca se escriben.
async function leerFuente(tx, db, p) {
  const b = `iglesias/${p.iglesiaId}`, docs = [], colecciones = {};
  let bytes = 0;
  const observar = s => {
    bytes += Buffer.byteLength(canon(s.exists ? s.data() : null));
    exigir(bytes <= 2 * 1024 * 1024, 'PREP_FUENTE_EXCESIVA'); docs.push(s); return s;
  };
  const leer = async r => observar(await tx.get(db.doc(r)));
  const protocolo = await leer(`${b}/finanzas_control/protocolo`);
  exigir(protocolo.exists && isDeepStrictEqual(protocolo.data(), { iglesiaId: p.iglesiaId,
    versionProtocolo: 1, epoca: p.epoca, estado: 'bloqueado' }), 'PREP_BLOQUEO_REQUERIDO');
  const puntero = await leer(`${b}/finanzas_control/generacion_v2`);
  exigir(!puntero.exists, 'PREP_PUNTERO_ACTIVO');
  const iglesia = await leer(b), config = await leer(`${b}/finanzas_config/contabilidad`);
  exigir(iglesia.exists && config.exists, 'PREP_FUENTE_AUSENTE');
  const configuracion = validarConfiguracionContable(config.data(), p.iglesiaId);
  const libro = await leer(`${b}/finanzas_control/libro`), periodo = await leer(`${b}/finanzas_control/periodo`);
  const control = libro.data();
  exigir(libro.exists && control.versionEsquema === 1 && control.iglesiaId === p.iglesiaId &&
    Number.isSafeInteger(control.ultimaSecuencia) && control.ultimaSecuencia >= 0 && control.ultimaSecuencia <= 200 &&
    control.huboMovimientos === (control.ultimaSecuencia > 0), 'PREP_CONTROL_INVALIDO');
  exigir(periodo.exists && periodo.data().versionEsquema === 1 && periodo.data().iglesiaId === p.iglesiaId &&
    isDeepStrictEqual(periodo.data().periodosAbiertos, [p.periodoId]), 'PREP_PERIODO_INVALIDO');
  for (const [nombre, limite] of Object.entries(LIMITES)) {
    const q = await tx.get(db.collection(`${b}/${nombre}`).orderBy('__name__').limit(limite + 1));
    exigir(q.size <= limite, 'PREP_LIMITE_EXCEDIDO'); colecciones[nombre] = q.docs;
    q.docs.forEach(observar);
  }
  const cuentas = validarCatalogoCuentas(colecciones.finanzas_cuentas.map(s => {
    exigir(s.data().cuenta?.id === s.id, 'PREP_CUENTA_INCOHERENTE'); return s.data().cuenta;
  }), p.iglesiaId);
  const categorias = validarCatalogoCategorias(colecciones.finanzas_categorias.map(s => {
    exigir(s.data().categoria?.id === s.id, 'PREP_CATEGORIA_INCOHERENTE'); return s.data().categoria;
  }), p.iglesiaId);
  exigir(colecciones.finanzas_saldos.length === cuentas.length, 'PREP_SALDOS_INCOMPLETOS');
  for (const s of colecciones.finanzas_saldos) {
    const d = s.data(), c = cuentas.find(c => c.id === s.id);
    exigir(c && d.versionEsquema === 1 && d.iglesiaId === p.iglesiaId && d.cuentaId === s.id, 'PREP_SALDO_AJENO');
    const estado = validarEstadoCuenta(Object.fromEntries(['iglesiaId', 'cuentaId', 'huboMovimientos', 'saldoMinor',
      'solicitudesInciertas', 'aperturaRegistrada'].map(k => [k, d[k]])), c);
    exigir(estado.solicitudesInciertas === 0, 'PREP_SOLICITUDES_INCIERTAS');
  }
  for (const tipo of ['cuentas', 'categorias']) {
    const reservas = colecciones[`finanzas_reservas_${tipo}`];
    exigir(reservas.length === colecciones[`finanzas_${tipo}`].length, 'PREP_RESERVA_INCOHERENTE');
    for (const entidad of colecciones[`finanzas_${tipo}`]) {
      const v = entidad.data()[tipo === 'cuentas' ? 'cuenta' : 'categoria'];
      const r = reservas.find(s => s.id === v.codigo)?.data();
      exigir(r?.versionEsquema === 1 && r.iglesiaId === p.iglesiaId && r.entidadId === entidad.id &&
        r.codigo === v.codigo, 'PREP_RESERVA_INCOHERENTE');
    }
  }
  const movimientos = [...colecciones.finanzas_movimientos].sort((a, b) => a.data().secuencia - b.data().secuencia);
  exigir(movimientos.length === control.ultimaSecuencia && movimientos.every((s, i) =>
    s.data().secuencia === i + 1 && s.data().movimiento?.id === s.id && s.data().movimiento.periodoId <= p.periodoId),
  'PREP_HISTORIAL_INCOMPLETO');
  const aperturas = movimientos.filter(s => s.data().movimiento.clase === 'apertura');
  exigir(aperturas.length === colecciones.finanzas_aperturas.length, 'PREP_APERTURA_INCOHERENTE');
  for (const s of aperturas) {
    const m = s.data(), c = m.movimiento.asientos[0]?.cuentaId;
    const r = colecciones.finanzas_aperturas.find(s => s.id === c)?.data();
    exigir(r?.versionEsquema === 1 && r.iglesiaId === p.iglesiaId && r.cuentaId === c &&
      r.movimientoId === s.id && r.secuencia === m.secuencia, 'PREP_APERTURA_INCOHERENTE');
  }
  for (const s of [...movimientos, ...colecciones.finanzas_cuentas, ...colecciones.finanzas_categorias]) {
    const d = s.data();
    exigir(typeof d.responsable?.uid === 'string' && /^[^/\u0000-\u001f]{1,128}$/.test(d.responsable.uid) &&
      typeof d.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(d.solicitudId), 'PREP_RECIBO_NO_VERIFICABLE');
    const r = (await leer(`operaciones_financieras/${d.responsable.uid}/solicitudes/${d.solicitudId}`)).data();
    const op = s.ref.parent.id === 'finanzas_cuentas' ? 'crearCuenta' : s.ref.parent.id === 'finanzas_categorias' ?
      'crearCategoria' : d.movimiento?.reversaDe !== null ? 'reversion' : d.movimiento?.clase;
    exigir(r?.versionEsquema === 1 && r.uid === d.responsable.uid && r.iglesiaId === p.iglesiaId &&
      r.pertenenciaId === d.responsable.pertenenciaId && r.solicitudId === d.solicitudId &&
      r.movimientoId === s.id && r.huella === d.huella && /^[a-f0-9]{64}$/.test(r.huella) &&
      r.estado === 'confirmado' && r.operacion === op && r.secuencia === (d.secuencia ?? null), 'PREP_RECIBO_INCOHERENTE');
  }
  for (const s of movimientos) {
    const x = s.data().clasificacion;
    if (x?.categoriaId) exigir(categorias.some(c => c.id === x.categoriaId && c.naturaleza === x.naturaleza &&
      c.tipoIngreso === x.tipoIngreso), 'PREP_CLASIFICACION_AJENA');
  }
  // Observar padres D2 para detectar cambios concurrentes; no adoptar su checkpoint.
  for (const nombre of ['finanzas_generaciones_demo', 'finanzas_ejecuciones_demo']) {
    const q = await tx.get(db.collection(`${b}/${nombre}`).orderBy('__name__').limit(10));
    const otros = q.docs.filter(s => nombre !== 'finanzas_generaciones_demo' || s.id !== p.generacionId);
    exigir(otros.length <= 8 && q.size <= 9, 'PREP_LIMITE_D2');
    for (const s of otros) {
      if (nombre === 'finanzas_generaciones_demo') exigir(s.data().activa === false, 'PREP_GENERACION_ACTIVA');
      observar(s);
    }
  }
  const referencias = cuentas.map(c => ({ id: c.id, moneda: c.moneda, escala: c.escala }));
  const periodos = [...new Set([p.periodoId, ...movimientos.map(s => s.data().movimiento.periodoId)])].sort();
  exigir(periodos.length <= 24, 'PREP_LIMITE_PERIODOS');
  const contexto = { iglesiaId: p.iglesiaId, configuracion: { moneda: configuracion.moneda, escala: configuracion.escala,
    zonaHoraria: configuracion.zonaHoraria }, cuentas: referencias, periodos,
  controlInicial: { version: version(libro), datos: libro.data() }, modoLectura: 'PAUSA_EXTERNA_DECLARADA' };
  const proyecciones = { corte: { secuencia: control.ultimaSecuencia, versionControl: version(libro) },
    saldos: colecciones.finanzas_saldos.map(s => ({ cuentaId: s.id, datos: s.data() })),
    resumenes: colecciones.finanzas_resumenes.map(s => ({ periodoId: s.id, datos: s.data() })),
    marcadores: colecciones.finanzas_reversiones.map(s => ({ originalId: s.id, datos: s.data() })) };
  const manifiesto = [...new Map(docs.map(s => [s.ref.path, { referencia: hash(s.ref.path), version: version(s),
    contenido: hash(s.exists ? s.data() : null) }])).values()].sort((a, b) => a.referencia.localeCompare(b.referencia));
  return { contexto, proyecciones, manifiesto, movimientos, cuentas };
}
module.exports = Object.freeze({ leerFuente, LIMITES });
