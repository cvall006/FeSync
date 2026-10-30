'use strict';

const { CONFIGURACION_INICIAL, exigir, registroExacto, validarConfiguracion,
  periodoValido } = require('./dinero');

const CAMPOS = Object.freeze(['versionEsquema', 'iglesiaId', 'moneda', 'escala', 'zonaHoraria']);
function iglesiaValida(id) {
  exigir(typeof id === 'string' && id.length > 0 && id === id.trim() &&
    Buffer.byteLength(id, 'utf8') <= 1500 && !/[\/\u0000-\u001f\u007f]/.test(id) &&
    id !== '.' && id !== '..' && !/^__.*__$/.test(id), 'IGLESIA_INVALIDA');
}
function validarDocumento(configuracion, iglesiaId, exigirInicial) {
  iglesiaValida(iglesiaId);
  registroExacto(configuracion, CAMPOS);
  exigir(configuracion.iglesiaId === iglesiaId, 'CONFIGURACION_OTRA_IGLESIA');
  exigir(configuracion.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA');
  const dinero = validarConfiguracion({ moneda: configuracion.moneda,
    escala: configuracion.escala, zonaHoraria: configuracion.zonaHoraria });
  if (exigirInicial) exigir(Object.keys(CONFIGURACION_INICIAL).every((k) =>
    dinero[k] === CONFIGURACION_INICIAL[k]), 'CONFIGURACION_V1_NO_SOPORTADA');
  return Object.freeze({ versionEsquema: 1, iglesiaId, ...dinero });
}
function validarConfiguracionContable(configuracion, iglesiaId) {
  return validarDocumento(configuracion, iglesiaId, true);
}
function validarEstadoLibro(estadoLibro, iglesiaId) {
  iglesiaValida(iglesiaId);
  registroExacto(estadoLibro, ['iglesiaId', 'huboMovimientos', 'periodosAbiertos']);
  exigir(estadoLibro.iglesiaId === iglesiaId, 'ESTADO_OTRA_IGLESIA');
  exigir(typeof estadoLibro.huboMovimientos === 'boolean', 'HISTORIAL_NO_VERIFICABLE');
  exigir(Array.isArray(estadoLibro.periodosAbiertos) && estadoLibro.periodosAbiertos.length <= 1,
    'MULTIPLES_PERIODOS_O_ESTADO_INVALIDO');
  for (const periodo of estadoLibro.periodosAbiertos) exigir(periodoValido(periodo), 'PERIODO_INVALIDO');
  return Object.freeze({ iglesiaId, huboMovimientos: estadoLibro.huboMovimientos,
    periodoAbierto: estadoLibro.periodosAbiertos[0] ?? null });
}
/** Solo plan de datos; NO crea documentos ni autoriza a quien lo solicita.
 * Historial y períodos deben proceder del servidor, no del formulario cliente.
 * huboMovimientos es histórico: anulaciones o saldo cero NO lo vuelven false.
 */
function validarConfiguracionInicial(entrada) {
  registroExacto(entrada, ['iglesiaId', 'propuesta', 'estadoLibro', 'primerPeriodo']);
  const { iglesiaId, propuesta, estadoLibro, primerPeriodo } = entrada;
  const configuracion = validarConfiguracionContable(propuesta, iglesiaId);
  const estado = validarEstadoLibro(estadoLibro, iglesiaId);
  exigir(!estado.huboMovimientos, 'NO_REINICIALIZAR_CON_MOVIMIENTOS');
  exigir(estado.periodoAbierto === null, 'PERIODO_YA_ABIERTO');
  exigir(periodoValido(primerPeriodo), 'PERIODO_INVALIDO');
  return Object.freeze({ configuracion,
    control: Object.freeze({ versionEsquema: 1, iglesiaId, periodoAbierto: primerPeriodo }) });
}
function validarCambioConfiguracion(entrada) {
  registroExacto(entrada, ['iglesiaId', 'actual', 'propuesta', 'estadoLibro']);
  const { iglesiaId, actual, propuesta, estadoLibro } = entrada;
  const vigente = validarConfiguracionContable(actual, iglesiaId);
  const estado = validarEstadoLibro(estadoLibro, iglesiaId);
  // Primero valida estructura/versión; no interpreta solicitudes de migración.
  registroExacto(propuesta, CAMPOS);
  exigir(propuesta.iglesiaId === iglesiaId, 'CONFIGURACION_OTRA_IGLESIA');
  exigir(propuesta.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA');
  if (estado.huboMovimientos) {
    exigir(['moneda', 'escala', 'zonaHoraria'].every((k) => Object.is(propuesta[k], vigente[k])),
      'CONFIGURACION_BLOQUEADA_POR_HISTORIAL');
  }
  // V1 solo admite CLP/0/Santiago incluso antes del primer movimiento.
  return validarConfiguracionContable(propuesta, iglesiaId);
}
function exigirPeriodoContableAbierto(estadoLibro, iglesiaId, periodoEsperado) {
  exigir(periodoValido(periodoEsperado), 'PERIODO_INVALIDO');
  const estado = validarEstadoLibro(estadoLibro, iglesiaId);
  exigir(estado.periodoAbierto !== null, 'SIN_PERIODO_ABIERTO');
  exigir(estado.periodoAbierto === periodoEsperado, 'PERIODO_NO_ABIERTO');
  return estado.periodoAbierto;
}

module.exports = Object.freeze({ validarConfiguracionContable, validarEstadoLibro,
  validarConfiguracionInicial, validarCambioConfiguracion, exigirPeriodoContableAbierto });
