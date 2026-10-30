'use strict';

const { CONFIGURACION_INICIAL, exigir, registroExacto, validarConfiguracion,
  validarEnteroMinor, validarMontoPositivo, desdeExacto, sumarMinor,
  validarFechaYPeriodo, periodoValido } = require('./dinero');

const CLASES = Object.freeze(['ingreso', 'gasto', 'transferencia', 'apertura', 'ajuste']);
function validarId(id) {
  exigir(typeof id === 'string' && id.length > 0 && id.length <= 128 && id === id.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(id) && id !== '.' && id !== '..' && !/^__.*__$/.test(id), 'ID_INVALIDO');
  return id;
}
function validarCuenta(cuenta, config) {
  registroExacto(cuenta, ['id', 'moneda', 'escala']);
  validarId(cuenta.id);
  exigir(cuenta.moneda === config.moneda && Object.is(cuenta.escala, config.escala), 'MONEDA_NO_COINCIDE');
  return cuenta.id;
}
function catalogo(cuentas, config) {
  exigir(Array.isArray(cuentas), 'CUENTAS_INVALIDAS');
  const ids = new Set();
  for (const cuenta of cuentas) {
    const id = validarCuenta(cuenta, config);
    exigir(!ids.has(id), 'CUENTA_DUPLICADA');
    ids.add(id);
  }
  return ids;
}
function congelar(m) {
  return Object.freeze({ ...m, asientos: Object.freeze(m.asientos.map((a) => Object.freeze({ ...a }))) });
}
function construir(p, clase, asientos, config, reversaDe = null) {
  validarId(p.id);
  validarFechaYPeriodo(p.fechaContable, p.periodoId);
  return congelar({ id: p.id, clase, moneda: config.moneda, escala: config.escala,
    zonaHoraria: config.zonaHoraria, fechaContable: p.fechaContable,
    periodoId: p.periodoId, asientos, reversaDe });
}
function simple(clase, p) {
  registroExacto(p, ['id', 'fechaContable', 'periodoId', 'cuenta', 'montoMinor'], ['configuracion']);
  const config = validarConfiguracion(p.configuracion);
  const cuentaId = validarCuenta(p.cuenta, config);
  const monto = clase === 'ajuste' ? validarEnteroMinor(p.montoMinor) : validarMontoPositivo(p.montoMinor);
  exigir(monto !== 0, 'DELTA_CERO');
  return construir(p, clase, [{ cuentaId, deltaMinor: clase === 'gasto' ? -monto : monto }], config);
}
function crearIngreso(p) { return simple('ingreso', p); }
function crearGasto(p) { return simple('gasto', p); }
function crearApertura(p) { return simple('apertura', p); }
function crearAjuste(p) { return simple('ajuste', p); }
function crearTransferencia(p) {
  registroExacto(p, ['id', 'fechaContable', 'periodoId', 'origen', 'destino', 'montoMinor'], ['configuracion']);
  const config = validarConfiguracion(p.configuracion);
  const origen = validarCuenta(p.origen, config);
  const destino = validarCuenta(p.destino, config);
  exigir(origen !== destino, 'CUENTAS_IGUALES');
  const monto = validarMontoPositivo(p.montoMinor);
  return construir(p, 'transferencia', [{ cuentaId: origen, deltaMinor: -monto },
    { cuentaId: destino, deltaMinor: monto }], config);
}
function normalizar(m, ids, config) {
  registroExacto(m, ['id', 'clase', 'moneda', 'escala', 'zonaHoraria', 'fechaContable',
    'periodoId', 'asientos', 'reversaDe']);
  validarId(m.id);
  exigir(CLASES.includes(m.clase), 'CLASE_INVALIDA');
  exigir(m.moneda === config.moneda && Object.is(m.escala, config.escala) &&
    m.zonaHoraria === config.zonaHoraria, 'CONFIGURACION_NO_COINCIDE');
  validarFechaYPeriodo(m.fechaContable, m.periodoId);
  if (m.reversaDe !== null) validarId(m.reversaDe);
  exigir(m.reversaDe !== m.id, 'AUTORREVERSA');
  exigir(Array.isArray(m.asientos) && m.asientos.length === (m.clase === 'transferencia' ? 2 : 1),
    'ASIENTOS_INVALIDOS');
  const asientos = [];
  for (const a of m.asientos) {
    registroExacto(a, ['cuentaId', 'deltaMinor']);
    validarId(a.cuentaId);
    exigir(ids.has(a.cuentaId), 'CUENTA_NO_ENCONTRADA');
    validarEnteroMinor(a.deltaMinor);
    exigir(a.deltaMinor !== 0, 'DELTA_CERO');
    asientos.push({ cuentaId: a.cuentaId, deltaMinor: a.deltaMinor });
  }
  if (m.clase === 'transferencia') {
    exigir(asientos[0].cuentaId !== asientos[1].cuentaId, 'CUENTAS_IGUALES');
    exigir(sumarMinor(asientos.map((a) => a.deltaMinor)) === 0, 'TRANSFERENCIA_DESBALANCEADA');
  } else if (m.reversaDe === null) {
    if (m.clase === 'ingreso' || m.clase === 'apertura') exigir(asientos[0].deltaMinor > 0, 'SIGNO_INVALIDO');
    if (m.clase === 'gasto') exigir(asientos[0].deltaMinor < 0, 'SIGNO_INVALIDO');
  }
  return congelar({ ...m, asientos });
}
function comprobarReversion(reversa, original) {
  exigir(original && original.id === reversa.reversaDe, 'REVERSA_HUERFANA');
  exigir(original.reversaDe === null, 'REVERSA_DE_REVERSA');
  exigir(reversa.clase === original.clase && reversa.fechaContable >= original.fechaContable,
    'REVERSA_INCOMPATIBLE');
  const deltas = new Map(original.asientos.map((a) => [a.cuentaId, a.deltaMinor]));
  exigir(reversa.asientos.length === original.asientos.length && reversa.asientos.every((a) =>
    deltas.has(a.cuentaId) && a.deltaMinor === -deltas.get(a.cuentaId)), 'REVERSA_INEXACTA');
}
function validarMovimiento(m, { cuentas, configuracion = CONFIGURACION_INICIAL, original } = {}) {
  const config = validarConfiguracion(configuracion);
  const ids = catalogo(cuentas, config);
  const resultado = normalizar(m, ids, config);
  if (resultado.reversaDe !== null) {
    exigir(original !== undefined, 'REVERSA_HUERFANA');
    comprobarReversion(resultado, normalizar(original, ids, config));
  }
  return resultado;
}
function revertirMovimiento(p) {
  registroExacto(p, ['id', 'fechaContable', 'periodoId', 'original', 'cuentas'], ['configuracion']);
  const config = validarConfiguracion(p.configuracion);
  const original = validarMovimiento(p.original, { cuentas: p.cuentas, configuracion: config });
  exigir(original.reversaDe === null, 'REVERSA_DE_REVERSA');
  const r = construir(p, original.clase, original.asientos.map((a) =>
    ({ cuentaId: a.cuentaId, deltaMinor: -a.deltaMinor })), config, original.id);
  exigir(r.id !== original.id, 'AUTORREVERSA');
  comprobarReversion(r, original);
  return r;
}

/** Libro completo, sin filtros previos: necesita originales para acreditar reversas.
 * Con periodoId: saldos iniciales anteriores al mes, finales hasta su fin y
 * resultado SOLO de ese mes. Sin periodo: inicial cero y totales del libro.
 * Apertura/ajuste son patrimoniales. No se excluye el original revertido.
 */
function calcularLibro({ movimientos, cuentas, periodoId = null,
  configuracion = CONFIGURACION_INICIAL } = {}) {
  const config = validarConfiguracion(configuracion);
  const ids = catalogo(cuentas, config);
  exigir(Array.isArray(movimientos), 'LIBRO_INVALIDO');
  exigir(periodoId === null || periodoValido(periodoId), 'PERIODO_INVALIDO');
  const libro = new Map();
  for (const m of movimientos) {
    const valido = normalizar(m, ids, config);
    exigir(!libro.has(valido.id), 'MOVIMIENTO_DUPLICADO');
    libro.set(valido.id, valido);
  }
  const revertidos = new Set();
  const aperturasPorCuenta = new Map();
  for (const m of libro.values()) {
    if (m.clase === 'apertura' && m.reversaDe === null) {
      const cuenta = m.asientos[0].cuentaId;
      exigir(!aperturasPorCuenta.has(cuenta), 'APERTURA_DUPLICADA');
      aperturasPorCuenta.set(cuenta, m.fechaContable);
    }
    if (m.reversaDe === null) continue;
    exigir(!revertidos.has(m.reversaDe), 'REVERSA_DUPLICADA');
    comprobarReversion(m, libro.get(m.reversaDe));
    revertidos.add(m.reversaDe);
  }
  for (const m of libro.values()) for (const asiento of m.asientos) {
    const fechaApertura = aperturasPorCuenta.get(asiento.cuentaId);
    exigir(!fechaApertura || m.fechaContable >= fechaApertura, 'APERTURA_NO_INICIAL');
  }
  const inicial = new Map([...ids].sort().map((id) => [id, 0n]));
  const final = new Map(inicial);
  let ingresos = 0n, gastos = 0n, aperturas = 0n, ajustes = 0n;
  for (const m of libro.values()) {
    let delta = 0n;
    for (const a of m.asientos) {
      const n = BigInt(a.deltaMinor);
      delta += n;
      if (periodoId !== null && m.periodoId < periodoId) inicial.set(a.cuentaId, inicial.get(a.cuentaId) + n);
      if (periodoId === null || m.periodoId <= periodoId) final.set(a.cuentaId, final.get(a.cuentaId) + n);
    }
    if (periodoId !== null && m.periodoId !== periodoId) continue;
    if (m.clase === 'ingreso') ingresos += delta;
    if (m.clase === 'gasto') gastos -= delta;
    if (m.clase === 'apertura') aperturas += delta;
    if (m.clase === 'ajuste') ajustes += delta;
  }
  const sumar = (mapa) => [...mapa.values()].reduce((a, b) => a + b, 0n);
  const convertir = (mapa) => Object.freeze(Object.fromEntries([...mapa].map(([id, n]) => [id, desdeExacto(n)])));
  return Object.freeze({ ...config, periodoId,
    saldoInicialPorCuenta: convertir(inicial), saldoFinalPorCuenta: convertir(final),
    saldoInicialMinor: desdeExacto(sumar(inicial)), saldoFinalMinor: desdeExacto(sumar(final)),
    ingresosNetosMinor: desdeExacto(ingresos), gastosNetosMinor: desdeExacto(gastos),
    resultadoMinor: desdeExacto(ingresos - gastos),
    aperturasNetasMinor: desdeExacto(aperturas), ajustesNetosMinor: desdeExacto(ajustes) });
}

module.exports = Object.freeze({ crearIngreso, crearGasto, crearTransferencia, crearApertura,
  crearAjuste, revertirMovimiento, validarMovimiento, calcularLibro });
