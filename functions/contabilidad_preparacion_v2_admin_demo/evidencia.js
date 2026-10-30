'use strict';
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto } = require('../finanzas_core/dinero');
const { hash, version } = require('../contabilidad_generaciones_v2_demo/util');
const PROCEDIMIENTO = 'preparacion_v2_procedencia_administrativa_1';
const VERSIONES = Object.freeze({ versionEsquema: 2, procedimiento: PROCEDIMIENTO,
  versionProcedimiento: 1, versionAlgoritmo: 1, versionEvidencia: 2 });
function vinculo(p, runtime, f) {
  return { ...VERSIONES, iglesiaId: p.iglesiaId, ejecucionId: p.ejecucionId,
    generacionId: p.generacionId, epoca: p.epoca, periodoId: p.periodoId,
    runtime, identidad: hash(p), operador: p.operador, corte: f.proyecciones.corte,
    manifiesto: f.manifiesto };
}
function validarVinculo(e, esperado) {
  registroExacto(e, [...Object.keys(esperado), 'cabecera', 'checkpoint', 'preparados', 'estado',
    'fence', 'ultimoPaso', 'evidencia'], ['error']);
  exigir(Object.entries(esperado).every(([k, v]) => isDeepStrictEqual(e[k], v)), 'E_PROCEDENCIA_INCOMPATIBLE');
  exigir(['conciliando', 'preparando', 'verificando', 'verificada', 'fallida'].includes(e.estado) &&
    Number.isSafeInteger(e.fence) && e.fence >= 0 && Number.isSafeInteger(e.preparados) && e.preparados >= 0,
  'E_CHECKPOINT_INVALIDO');
  exigir(e.ultimoPaso === (e.fence === 0 ? null : e.fence - 1) &&
    (e.estado === 'fallida' ? typeof e.error === 'string' : !Object.hasOwn(e, 'error')), 'E_CHECKPOINT_INVALIDO');
}
function documento(s) {
  exigir(s.exists && s.updateTime, 'E_DOCUMENTO_AUSENTE');
  return { ruta: s.ref.path, version: version(s), contenido: hash(s.data()) };
}
function sellar({ vinculo: v, fence, checkpoint, documentos }) {
  // Todos los documentos ya fueron confirmados en commits anteriores. No se
  // incluyen updateTime de esta evidencia ni timestamps aun no resueltos.
  const cuerpo = { ...VERSIONES, vinculo: v, fence, checkpoint: hash(checkpoint),
    documentos: [...documentos].sort((a, b) => a.ruta.localeCompare(b.ruta)) };
  return { ...cuerpo, sello: hash(cuerpo) };
}
function validarSello(actual, esperado) {
  exigir(isDeepStrictEqual(actual, esperado), 'E_EVIDENCIA_DIVERGENTE');
}
module.exports = Object.freeze({ VERSIONES, PROCEDIMIENTO, vinculo, validarVinculo, documento, sellar, validarSello });
