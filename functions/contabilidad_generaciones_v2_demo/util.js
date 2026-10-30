'use strict';
const { createHash } = require('node:crypto');
const { exigir, registroExacto, periodoValido } = require('../finanzas_core/dinero');
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ?
  `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
const hash = v => createHash('sha256').update(canon(v)).digest('hex');
const version = s => s.exists ? `${s.updateTime.seconds}:${s.updateTime.nanoseconds}` : null;
const id = v => exigir(typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v), 'PREP_ID_INVALIDO');
function parametros(v) {
  registroExacto(v, ['iglesiaId', 'ejecucionId', 'generacionId', 'operador', 'epoca', 'periodoId', 'pagina', 'lote']);
  [v.iglesiaId, v.ejecucionId, v.generacionId].forEach(id);
  exigir(typeof v.operador === 'string' && /^[a-f0-9]{64}$/.test(v.operador), 'PREP_OPERADOR_INVALIDO');
  exigir(v.epoca === 1 && periodoValido(v.periodoId), 'PREP_CONTEXTO_INVALIDO');
  exigir(Number.isInteger(v.pagina) && v.pagina >= 1 && v.pagina <= 50 &&
    Number.isInteger(v.lote) && v.lote >= 1 && v.lote <= 25, 'PREP_LIMITES_INVALIDOS');
  return { ...v, operador: hash(v.operador) };
}
module.exports = Object.freeze({ canon, hash, version, id, parametros });
