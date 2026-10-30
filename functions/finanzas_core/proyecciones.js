'use strict';

const { exigir, registroExacto, validarConfiguracion, validarEnteroMinor,
  periodoValido, sumarMinor, restarMinor, desdeExacto } = require('./dinero');
const { validarMovimiento, calcularLibro } = require('./asientos');

const TOTALES = Object.freeze(['saldoInicialMinor', 'saldoFinalMinor', 'ingresosNetosMinor',
  'gastosNetosMinor', 'resultadoMinor', 'aperturasNetasMinor', 'ajustesNetosMinor']);
const CAMPOS_SALDO = Object.freeze(['versionEsquema', 'iglesiaId', 'cuentaId', 'periodoId',
  'revision', 'ultimoMovimientoId', 'saldoMinor', 'saldoInicialPeriodoMinor', 'saldoFinalPeriodoMinor']);

function id(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_PROYECCION_INVALIDO');
}
function revision(v) {
  validarEnteroMinor(v); exigir(v >= 0, 'REVISION_PROYECCION_INVALIDA');
}
function identidadRevision(v) {
  revision(v.revision);
  if (v.revision === 0) exigir(v.ultimoMovimientoId === null, 'REFERENCIA_PROYECCION_INVALIDA');
  else id(v.ultimoMovimientoId);
}
function configuracion(v) {
  const c = validarConfiguracion(v);
  exigir(c.moneda === 'CLP' && c.escala === 0, 'MONEDA_PROYECCION_INVALIDA');
  return c;
}
function totales(v, periodo = false) {
  registroExacto(v, [...TOTALES, ...(periodo ? ['periodoId'] : [])]);
  TOTALES.forEach(k => validarEnteroMinor(v[k]));
  if (periodo) exigir(periodoValido(v.periodoId), 'PERIODO_INVALIDO');
  else exigir(v.saldoInicialMinor === 0, 'ACUMULADO_INICIAL_INVALIDO');
  exigir(v.resultadoMinor === restarMinor(v.ingresosNetosMinor, v.gastosNetosMinor), 'RESULTADO_PROYECCION_INCOHERENTE');
  const final = desdeExacto(BigInt(v.saldoInicialMinor) + BigInt(v.ingresosNetosMinor) -
    BigInt(v.gastosNetosMinor) + BigInt(v.aperturasNetasMinor) + BigInt(v.ajustesNetosMinor));
  exigir(v.saldoFinalMinor === final, 'SALDO_PROYECCION_INCOHERENTE');
}
function validarEstado(v) {
  registroExacto(v, ['versionEsquema', 'iglesiaId', 'configuracion', 'revision', 'ultimoMovimientoId', 'acumulado', 'periodo']);
  exigir(v.versionEsquema === 1, 'VERSION_PROYECCION_INVALIDA'); id(v.iglesiaId);
  configuracion(v.configuracion); identidadRevision(v); totales(v.acumulado); totales(v.periodo, true);
  if (v.revision === 0) exigir(TOTALES.every(k => v.acumulado[k] === 0 && v.periodo[k] === 0), 'PROYECCION_VACIA_INCOHERENTE');
}
function congelarEstado(v) {
  return Object.freeze({ ...v, configuracion: Object.freeze({ ...v.configuracion }),
    acumulado: Object.freeze({ ...v.acumulado }), periodo: Object.freeze({ ...v.periodo }) });
}
function ceros() { return Object.fromEntries(TOTALES.map(k => [k, 0])); }

/** Estado matematico vacio: no crea pertenencia, autorizacion ni datos remotos. */
function crearProyeccionInicial(entrada) {
  registroExacto(entrada, ['iglesiaId', 'configuracion', 'periodoId']);
  id(entrada.iglesiaId); exigir(periodoValido(entrada.periodoId), 'PERIODO_INVALIDO');
  return congelarEstado({ versionEsquema: 1, iglesiaId: entrada.iglesiaId,
    configuracion: configuracion(entrada.configuracion), revision: 0, ultimoMovimientoId: null,
    acumulado: ceros(), periodo: { periodoId: entrada.periodoId, ...ceros() } });
}
function crearSaldoInicial(entrada) {
  registroExacto(entrada, ['iglesiaId', 'cuentaId', 'periodoId']);
  id(entrada.iglesiaId); id(entrada.cuentaId); exigir(periodoValido(entrada.periodoId), 'PERIODO_INVALIDO');
  return Object.freeze({ versionEsquema: 1, ...entrada, revision: 0, ultimoMovimientoId: null,
    saldoMinor: 0, saldoInicialPeriodoMinor: 0, saldoFinalPeriodoMinor: 0 });
}
function validarSaldo(v, estado) {
  registroExacto(v, CAMPOS_SALDO);
  exigir(v.versionEsquema === 1 && v.iglesiaId === estado.iglesiaId &&
    v.periodoId === estado.periodo.periodoId, 'SALDO_PROYECCION_AJENO');
  id(v.cuentaId); identidadRevision(v);
  ['saldoMinor', 'saldoInicialPeriodoMinor', 'saldoFinalPeriodoMinor'].forEach(k => validarEnteroMinor(v[k]));
  exigir(v.revision <= estado.revision && (v.revision === estado.revision ?
    v.ultimoMovimientoId === estado.ultimoMovimientoId : v.ultimoMovimientoId !== estado.ultimoMovimientoId),
  'REFERENCIA_CUENTA_INCOHERENTE');
  if (v.revision === 0) exigir(v.saldoMinor === 0 && v.saldoInicialPeriodoMinor === 0 &&
    v.saldoFinalPeriodoMinor === 0, 'SALDO_VACIO_INCOHERENTE');
}
function lista(v) {
  exigir(Array.isArray(v) && v.length >= 1 && v.length <= 2 &&
    Reflect.ownKeys(v).every(k => ['0', '1', 'length'].includes(k)), 'CUENTAS_PROYECCION_INVALIDAS');
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    exigir(d && 'value' in d && d.enumerable, 'CUENTAS_PROYECCION_INVALIDAS');
  }
}
function estructuraMovimiento(v) {
  registroExacto(v, ['id', 'clase', 'moneda', 'escala', 'zonaHoraria', 'fechaContable', 'periodoId', 'asientos', 'reversaDe']);
  lista(v.asientos);
  for (let i = 0; i < v.asientos.length; i++) registroExacto(v.asientos[i], ['cuentaId', 'deltaMinor']);
}

/**
 * Solo una propuesta matematica: observaciones y revision vienen del llamador.
 * No acredita historicos, apertura unica, permisos, cierres, recibos o commits.
 * Un reintento sobre el MISMO estado produce la MISMA propuesta, no un replay
 * confirmado. Persistir/recuperar esa aplicacion exige una futura transaccion.
 */
function proyectarMovimiento(entrada) {
  registroExacto(entrada, ['estadoAnterior', 'cuentasAnteriores', 'movimiento', 'original', 'aplicacion']);
  const { estadoAnterior: e, cuentasAnteriores: saldos, aplicacion: a } = entrada;
  validarEstado(e); registroExacto(a, ['revisionAnterior', 'revisionNueva', 'movimientoId']);
  revision(a.revisionAnterior); revision(a.revisionNueva); id(a.movimientoId);
  exigir(a.revisionAnterior === e.revision && a.revisionNueva === sumarMinor([e.revision, 1]), 'REVISION_APLICACION_NO_COINCIDE');
  exigir(a.movimientoId !== e.ultimoMovimientoId, 'MOVIMIENTO_YA_APLICADO');
  lista(saldos);
  const ids = new Set();
  for (const s of saldos) {
    validarSaldo(s, e); exigir(!ids.has(s.cuentaId), 'CUENTA_DUPLICADA'); ids.add(s.cuentaId);
    exigir(s.ultimoMovimientoId !== a.movimientoId, 'MOVIMIENTO_YA_APLICADO');
  }
  const refs = saldos.map(s => ({ id: s.cuentaId, moneda: e.configuracion.moneda, escala: e.configuracion.escala }));
  let original = null;
  if (entrada.original !== null) {
    registroExacto(entrada.original, ['movimiento', 'revision', 'reversionId']);
    revision(entrada.original.revision);
    exigir(entrada.original.revision > 0 && entrada.original.revision <= e.revision &&
      entrada.original.reversionId === null, 'ORIGINAL_PROYECCION_NO_ACREDITADO');
    estructuraMovimiento(entrada.original.movimiento);
    original = validarMovimiento(entrada.original.movimiento, { cuentas: refs, configuracion: e.configuracion });
    exigir(['ingreso', 'gasto', 'transferencia'].includes(original.clase) && original.reversaDe === null,
      'ORIGINAL_NO_REVERSIBLE');
    for (const s of saldos) exigir(s.revision >= entrada.original.revision &&
      (s.revision !== entrada.original.revision || s.ultimoMovimientoId === original.id), 'REFERENCIA_ORIGINAL_INCOHERENTE');
  }
  estructuraMovimiento(entrada.movimiento);
  const m = validarMovimiento(entrada.movimiento, { cuentas: refs, configuracion: e.configuracion,
    ...(original ? { original } : {}) });
  exigir(m.id === a.movimientoId && (m.reversaDe !== null) === (original !== null), 'REFERENCIA_MOVIMIENTO_NO_COINCIDE');
  exigir(m.asientos.length === saldos.length && m.asientos.every(s => ids.has(s.cuentaId)), 'CUENTAS_PROYECCION_INVALIDAS');
  // FIN-2 define TODOS los signos y clases. Solo se evalua un conjunto de 1..2
  // movimientos, nunca el libro ni un subtotal de una pagina historica.
  const calcular = (movimientos, periodoId) => calcularLibro({ movimientos, cuentas: refs,
    configuracion: e.configuracion, periodoId });
  const delta = periodoId => {
    const previo = calcular(original ? [original] : [], periodoId);
    const total = calcular(original ? [original, m] : [m], periodoId);
    return { previo, total, totales: Object.fromEntries(TOTALES.map(k => [k, restarMinor(total[k], previo[k])])) };
  };
  const global = delta(null), periodo = delta(e.periodo.periodoId);
  const incrementar = (previo, cambio) => Object.fromEntries(TOTALES.map(k => [k, sumarMinor([previo[k], cambio[k]])]));
  const estado = congelarEstado({ ...e, revision: a.revisionNueva, ultimoMovimientoId: a.movimientoId,
    acumulado: incrementar(e.acumulado, global.totales),
    periodo: { periodoId: e.periodo.periodoId, ...incrementar(e.periodo, periodo.totales) } });
  validarEstado(estado);
  const cuentas = saldos.map(s => Object.freeze({ ...s, revision: a.revisionNueva, ultimoMovimientoId: a.movimientoId,
    saldoMinor: sumarMinor([s.saldoMinor, restarMinor(global.total.saldoFinalPorCuenta[s.cuentaId], global.previo.saldoFinalPorCuenta[s.cuentaId])]),
    saldoInicialPeriodoMinor: sumarMinor([s.saldoInicialPeriodoMinor, restarMinor(periodo.total.saldoInicialPorCuenta[s.cuentaId], periodo.previo.saldoInicialPorCuenta[s.cuentaId])]),
    saldoFinalPeriodoMinor: sumarMinor([s.saldoFinalPeriodoMinor, restarMinor(periodo.total.saldoFinalPorCuenta[s.cuentaId], periodo.previo.saldoFinalPorCuenta[s.cuentaId])]),
  }));
  return Object.freeze({ estado, cuentas: Object.freeze(cuentas), controlReversion: original ? Object.freeze({
    originalId: original.id, revisionOriginal: entrada.original.revision, reversionId: m.id,
  }) : null });
}

module.exports = Object.freeze({ crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento });
