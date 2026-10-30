'use strict';

const CONFIGURACION_INICIAL = Object.freeze({
  moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago',
});
const LIMITE = BigInt(Number.MAX_SAFE_INTEGER);

class ErrorContable extends Error {
  constructor(codigo) {
    super(`Datos contables no válidos: ${codigo}.`);
    this.name = 'ErrorContable';
    this.codigo = codigo;
  }
}
function exigir(condicion, codigo) {
  if (!condicion) throw new ErrorContable(codigo);
}

// Solo mapas de datos propios; no ejecutar getters ni aceptar campos ignorados.
function registroExacto(valor, requeridas, opcionales = []) {
  exigir(valor !== null && typeof valor === 'object' && !Array.isArray(valor), 'REGISTRO_INVALIDO');
  const proto = Object.getPrototypeOf(valor);
  exigir(proto === Object.prototype || proto === null, 'REGISTRO_INVALIDO');
  const descriptores = Object.getOwnPropertyDescriptors(valor);
  exigir(Reflect.ownKeys(descriptores).every((k) => typeof k === 'string' &&
    [...requeridas, ...opcionales].includes(k) && 'value' in descriptores[k] &&
    descriptores[k].enumerable), 'CAMPOS_INVALIDOS');
  exigir(requeridas.every((k) => Object.hasOwn(descriptores, k)), 'CAMPOS_INVALIDOS');
}
function validarConfiguracion(configuracion = CONFIGURACION_INICIAL) {
  registroExacto(configuracion, ['moneda', 'escala', 'zonaHoraria']);
  const { moneda, escala, zonaHoraria } = configuracion;
  exigir(typeof moneda === 'string' && moneda.length === 3 && /^[A-Z]{3}$/.test(moneda), 'MONEDA_INVALIDA');
  exigir(Number.isSafeInteger(escala) && !Object.is(escala, -0) && escala >= 0 && escala <= 6,
    'ESCALA_INVALIDA');
  exigir(moneda !== 'CLP' || escala === 0, 'ESCALA_CLP_INVALIDA');
  exigir(typeof zonaHoraria === 'string' && zonaHoraria.length > 0 &&
    zonaHoraria === zonaHoraria.trim(), 'ZONA_INVALIDA');
  try {
    // Solo valida el identificador explícito; no consulta reloj ni zona local.
    new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria });
  } catch { throw new ErrorContable('ZONA_INVALIDA'); }
  return Object.freeze({ moneda, escala, zonaHoraria });
}
function validarEnteroMinor(valor) {
  exigir(typeof valor === 'number' && Number.isSafeInteger(valor) && !Object.is(valor, -0),
    'ENTERO_MINOR_INVALIDO');
  return valor;
}
function validarMontoPositivo(valor) {
  validarEnteroMinor(valor);
  exigir(valor > 0, 'MONTO_NO_POSITIVO');
  return valor;
}
function desdeExacto(valor) {
  exigir(typeof valor === 'bigint', 'ENTERO_EXACTO_INVALIDO');
  exigir(valor >= -LIMITE && valor <= LIMITE, 'DESBORDAMIENTO');
  return Number(valor);
}
function sumarMinor(valores) {
  exigir(Array.isArray(valores), 'LISTA_INVALIDA');
  let total = 0n;
  for (const valor of valores) total += BigInt(validarEnteroMinor(valor));
  return desdeExacto(total);
}
function restarMinor(a, b) {
  return desdeExacto(BigInt(validarEnteroMinor(a)) - BigInt(validarEnteroMinor(b)));
}
function periodoValido(valor) {
  return typeof valor === 'string' && valor.length === 7 &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) && valor.slice(0, 4) !== '0000';
}
function fechaContableValida(valor) {
  if (typeof valor !== 'string' || valor.length !== 10 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(valor) || !periodoValido(valor.slice(0, 7))) return false;
  const anio = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const dia = Number(valor.slice(8, 10));
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia >= 1 && dia <= dias[mes - 1];
}
function validarFechaYPeriodo(fecha, periodo) {
  exigir(fechaContableValida(fecha), 'FECHA_INVALIDA');
  exigir(periodoValido(periodo), 'PERIODO_INVALIDO');
  exigir(fecha.slice(0, 7) === periodo, 'PERIODO_NO_COINCIDE');
  return Object.freeze({ fechaContable: fecha, periodoId: periodo });
}

module.exports = Object.freeze({ CONFIGURACION_INICIAL, ErrorContable, exigir, registroExacto,
  validarConfiguracion, validarEnteroMinor, validarMontoPositivo, desdeExacto,
  sumarMinor, restarMinor, fechaContableValida, periodoValido, validarFechaYPeriodo });
