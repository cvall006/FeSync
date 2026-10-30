'use strict';

const { exigir, registroExacto } = require('./dinero');

// Esta compilacion V1 solo puede escribir en esta epoca. Nunca se adopta la
// epoca remota automaticamente; reanudar otra epoca requiere otro paso revisado.
const PROTOCOLO_V1 = Object.freeze({ versionProtocolo: 1, epoca: 1 });
const ESTADOS = Object.freeze(['operativo_v1', 'bloqueado', 'transicion', 'operativo_v2']);

/** Datos obtenidos de una lectura documental en la MISMA transaccion escritora.
 * Ausencia, borrado o recreacion incompatible deniegan, tambien en libros vacios.
 * No inicializa documentos, no cambia estados y no autoriza al actor.
 */
function exigirEscrituraV1(datos, iglesiaId) {
  exigir(datos !== undefined && datos !== null, 'PROTOCOLO_AUSENTE');
  registroExacto(datos, ['iglesiaId', 'versionProtocolo', 'epoca', 'estado']);
  exigir(typeof iglesiaId === 'string' && iglesiaId.length > 0 && datos.iglesiaId === iglesiaId,
    'PROTOCOLO_IGLESIA_INCOHERENTE');
  exigir(datos.versionProtocolo === PROTOCOLO_V1.versionProtocolo, 'PROTOCOLO_VERSION_INCOMPATIBLE');
  exigir(datos.epoca === PROTOCOLO_V1.epoca, 'PROTOCOLO_EPOCA_INCOMPATIBLE');
  exigir(ESTADOS.includes(datos.estado), 'PROTOCOLO_ESTADO_INVALIDO');
  exigir(datos.estado === 'operativo_v1', 'PROTOCOLO_ESCRITURA_BLOQUEADA');
}

module.exports = Object.freeze({ exigirEscrituraV1, PROTOCOLO_V1, ESTADOS });
