'use strict';

const { exigir, registroExacto, validarEnteroMinor } = require('./dinero');
const { validarMovimiento } = require('./asientos');
const CAMPOS = Object.freeze(['versionEsquema', 'id', 'iglesiaId', 'codigo', 'nombre',
  'tipo', 'moneda', 'escala', 'estado']);

function idValido(v, limite = 128) {
  return typeof v === 'string' && v.length > 0 && v.length <= limite &&
    Buffer.byteLength(v, 'utf8') <= 1500 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}
function validarCuenta(cuenta, iglesiaId) {
  registroExacto(cuenta, CAMPOS);
  exigir(idValido(iglesiaId, 1500) && cuenta.iglesiaId === iglesiaId, 'CUENTA_OTRA_IGLESIA');
  exigir(idValido(cuenta.id), 'CUENTA_ID_INVALIDO');
  exigir(cuenta.versionEsquema === 1, 'CUENTA_VERSION_INVALIDA');
  exigir(typeof cuenta.codigo === 'string' && cuenta.codigo === cuenta.codigo.trim() &&
    /^[A-Z][A-Z0-9_]{0,31}$/.test(cuenta.codigo), 'CUENTA_CODIGO_INVALIDO');
  exigir(typeof cuenta.nombre === 'string' && cuenta.nombre === cuenta.nombre.trim() &&
    cuenta.nombre === cuenta.nombre.normalize('NFC') && Array.from(cuenta.nombre).length >= 1 &&
    Array.from(cuenta.nombre).length <= 80 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(cuenta.nombre), 'CUENTA_NOMBRE_INVALIDO');
  exigir(['caja', 'banco'].includes(cuenta.tipo), 'CUENTA_TIPO_INVALIDO');
  exigir(cuenta.moneda === 'CLP' && Object.is(cuenta.escala, 0), 'CUENTA_MONEDA_INVALIDA');
  exigir(['activa', 'archivada'].includes(cuenta.estado), 'CUENTA_ESTADO_INVALIDO');
  return Object.freeze({ ...cuenta });
}
function validarCatalogoCuentas(cuentas, iglesiaId) {
  exigir(idValido(iglesiaId, 1500) && Array.isArray(cuentas), 'CATALOGO_CUENTAS_INVALIDO');
  const ids = new Set(), codigos = new Set(), resultado = [];
  for (const entrada of cuentas) {
    const cuenta = validarCuenta(entrada, iglesiaId);
    exigir(!ids.has(cuenta.id), 'CUENTA_ID_DUPLICADO');
    exigir(!codigos.has(cuenta.codigo), 'CUENTA_CODIGO_DUPLICADO');
    ids.add(cuenta.id); codigos.add(cuenta.codigo); resultado.push(cuenta);
  }
  return Object.freeze(resultado);
}
function validarEstadoCuenta(estadoCuenta, cuenta) {
  registroExacto(cuenta, CAMPOS);
  validarCuenta(cuenta, cuenta.iglesiaId);
  registroExacto(estadoCuenta, ['iglesiaId', 'cuentaId', 'huboMovimientos', 'saldoMinor',
    'solicitudesInciertas', 'aperturaRegistrada']);
  exigir(estadoCuenta.iglesiaId === cuenta.iglesiaId && estadoCuenta.cuentaId === cuenta.id, 'ESTADO_CUENTA_AJENO');
  exigir(typeof estadoCuenta.huboMovimientos === 'boolean' &&
    typeof estadoCuenta.aperturaRegistrada === 'boolean', 'HISTORIAL_CUENTA_INVALIDO');
  validarEnteroMinor(estadoCuenta.saldoMinor);
  validarEnteroMinor(estadoCuenta.solicitudesInciertas);
  exigir(estadoCuenta.solicitudesInciertas >= 0, 'SOLICITUDES_INVALIDAS');
  exigir(estadoCuenta.huboMovimientos || (estadoCuenta.saldoMinor === 0 &&
    !estadoCuenta.aperturaRegistrada), 'HISTORIAL_CUENTA_INCOHERENTE');
  return Object.freeze({ ...estadoCuenta });
}
function crearCuenta(entrada) {
  registroExacto(entrada, ['iglesiaId', 'cuenta', 'catalogo']);
  const cuenta = validarCuenta(entrada.cuenta, entrada.iglesiaId);
  exigir(cuenta.estado === 'activa', 'CUENTA_NUEVA_INACTIVA');
  validarCatalogoCuentas([...validarCatalogoCuentas(entrada.catalogo, entrada.iglesiaId), cuenta], entrada.iglesiaId);
  return cuenta;
}
function actualizarCuenta(entrada) {
  registroExacto(entrada, ['iglesiaId', 'actual', 'propuesta', 'catalogo', 'estadoCuenta']);
  const { iglesiaId } = entrada;
  const actual = validarCuenta(entrada.actual, iglesiaId);
  const propuesta = validarCuenta(entrada.propuesta, iglesiaId);
  const catalogo = validarCatalogoCuentas(entrada.catalogo, iglesiaId);
  const observada = catalogo.find((c) => c.id === actual.id);
  exigir(observada && CAMPOS.every((k) => observada[k] === actual[k]), 'CUENTA_ACTUAL_NO_COINCIDE');
  exigir(propuesta.id === actual.id && propuesta.codigo === actual.codigo, 'CUENTA_IDENTIDAD_INMUTABLE');
  const estado = validarEstadoCuenta(entrada.estadoCuenta, actual);
  if (estado.huboMovimientos || estado.solicitudesInciertas > 0) {
    exigir(['tipo', 'moneda', 'escala'].every((k) => Object.is(actual[k], propuesta[k])), 'CUENTA_USADA_INMUTABLE');
  }
  exigir(actual.estado !== 'archivada' || propuesta.estado === 'archivada', 'CUENTA_ARCHIVO_TERMINAL');
  if (propuesta.estado === 'archivada') {
    exigir(estado.saldoMinor === 0, 'CUENTA_CON_SALDO');
    exigir(estado.solicitudesInciertas === 0, 'CUENTA_CON_SOLICITUDES_INCIERTAS');
  }
  validarCatalogoCuentas(catalogo.map((c) => c.id === actual.id ? propuesta : c), iglesiaId);
  return propuesta;
}
function cuentaParaNuevoMovimiento(cuenta, iglesiaId) {
  const valida = validarCuenta(cuenta, iglesiaId);
  exigir(valida.estado === 'activa', 'CUENTA_ARCHIVADA');
  // Proyección exacta requerida por FIN-2, sin inventar un saldo editable.
  return Object.freeze({ id: valida.id, moneda: valida.moneda, escala: valida.escala });
}
function validarAperturaCuenta(entrada) {
  registroExacto(entrada, ['iglesiaId', 'cuenta', 'estadoCuenta', 'movimiento']);
  const cuenta = validarCuenta(entrada.cuenta, entrada.iglesiaId);
  const referencia = cuentaParaNuevoMovimiento(cuenta, entrada.iglesiaId);
  const estado = validarEstadoCuenta(entrada.estadoCuenta, cuenta);
  exigir(!estado.aperturaRegistrada, 'APERTURA_DUPLICADA');
  exigir(!estado.huboMovimientos && estado.saldoMinor === 0, 'APERTURA_NO_INICIAL');
  exigir(estado.solicitudesInciertas === 0, 'CUENTA_CON_SOLICITUDES_INCIERTAS');
  const movimiento = validarMovimiento(entrada.movimiento, { cuentas: [referencia] });
  exigir(movimiento.clase === 'apertura' && movimiento.reversaDe === null, 'MOVIMIENTO_NO_ES_APERTURA');
  return movimiento;
}

module.exports = Object.freeze({ validarCuenta, validarCatalogoCuentas, validarEstadoCuenta,
  crearCuenta, actualizarCuenta, cuentaParaNuevoMovimiento, validarAperturaCuenta });
