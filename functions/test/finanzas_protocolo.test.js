'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exigirEscrituraV1, PROTOCOLO_V1, ESTADOS } = require('../finanzas_core/protocolo');
const valido = () => ({ iglesiaId: 'iglesia', versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' });

test('Protocolo V1 explicito, determinista y sin mutar entrada', () => {
  const p = valido(), antes = structuredClone(p);
  exigirEscrituraV1(p, 'iglesia'); exigirEscrituraV1(p, 'iglesia');
  assert.deepEqual(p, antes); assert.ok(Object.isFrozen(PROTOCOLO_V1)); assert.ok(Object.isFrozen(ESTADOS));
});
for (const estado of ESTADOS.slice(1)) test(`Estado ${estado} bloquea V1`, () => {
  assert.throws(() => exigirEscrituraV1({ ...valido(), estado }, 'iglesia'),
    e => e.codigo === 'PROTOCOLO_ESCRITURA_BLOQUEADA');
});
for (const [campo, valores] of Object.entries({
  versionProtocolo: [0, 2, '1', null, NaN, Infinity],
  epoca: [0, -0, -1, 2, 1.5, '1', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1],
  estado: ['', 'OPERATIVO_V1', 'desconocido', true, null],
  iglesiaId: ['', 'otra', null, 1],
})) for (const valor of valores) test(`Protocolo rechaza ${campo}: ${String(valor)}`, () => {
  assert.throws(() => exigirEscrituraV1({ ...valido(), [campo]: valor }, 'iglesia'));
});
for (const valor of [undefined, null, {}, [], 'operativo_v1', false]) test(`Ausente o malformado: ${JSON.stringify(valor)}`, () => {
  assert.throws(() => exigirEscrituraV1(valor, 'iglesia'));
});
for (const campo of Object.keys(valido())) test(`Campo obligatorio ${campo}`, () => {
  const p = valido(); delete p[campo]; assert.throws(() => exigirEscrituraV1(p, 'iglesia'));
});
test('Campos extra, getters y prototipos no confiables rechazados', () => {
  assert.throws(() => exigirEscrituraV1({ ...valido(), omitirBloqueo: true }, 'iglesia'));
  const p = valido(); Object.defineProperty(p, 'estado', { enumerable: true, get() { assert.fail('No invocar'); } });
  assert.throws(() => exigirEscrituraV1(p, 'iglesia'), e => e.codigo === 'CAMPOS_INVALIDOS');
  assert.throws(() => exigirEscrituraV1(Object.create(valido()), 'iglesia'));
});
