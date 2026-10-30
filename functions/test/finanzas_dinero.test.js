'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const d = require('../finanzas_core/dinero');
const error = (codigo) => ({ name: 'ErrorContable', codigo });
const MAX = Number.MAX_SAFE_INTEGER;

test('Configuración inicial explícita CLP cero y Santiago, inmutable', () => {
  assert.deepEqual(d.CONFIGURACION_INICIAL, { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
  assert.equal(Object.isFrozen(d.CONFIGURACION_INICIAL), true);
  assert.deepEqual(d.validarConfiguracion(), d.CONFIGURACION_INICIAL);
  assert.notEqual(d.validarConfiguracion(), d.CONFIGURACION_INICIAL);
  assert.throws(() => { d.CONFIGURACION_INICIAL.moneda = 'USD'; }, TypeError);
});
test('Configuración alternativa explícita, sin conversión ni registro mundial de monedas', () => {
  const config = { moneda: 'USD', escala: 2, zonaHoraria: 'UTC' };
  const antes = structuredClone(config);
  assert.deepEqual(d.validarConfiguracion(config), config);
  assert.deepEqual(config, antes);
});
for (const valor of [0, 1, -1, 10000, MAX, -MAX]) {
  test(`Entero minor seguro: ${valor}`, () => assert.equal(d.validarEnteroMinor(valor), valor));
}
for (const [nombre, valor] of [
  ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['fracción', 1.5],
  ['fracción negativa', -0.1], ['inseguro', MAX + 1], ['inseguro negativo', -MAX - 1],
  ['cadena', '1000'], ['decimal textual', '1.000'], ['vacío', ''], ['espacios', ' 10 '],
  ['notación textual', '1e3'], ['booleano', true], ['null', null], ['undefined', undefined],
  ['bigint', 1n], ['objeto', new Number(1)], ['menos cero', -0],
]) {
  test(`Rechaza dinero ambiguo/no seguro: ${nombre}`, () => {
    assert.throws(() => d.validarEnteroMinor(valor), error('ENTERO_MINOR_INVALIDO'));
    assert.throws(() => d.sumarMinor([valor]), error('ENTERO_MINOR_INVALIDO'));
  });
}
test('Montos positivos excluyen cero y negativos, incluyen límite', () => {
  assert.equal(d.validarMontoPositivo(MAX), MAX);
  for (const n of [0, -1, -MAX]) assert.throws(() => d.validarMontoPositivo(n), error('MONTO_NO_POSITIVO'));
});
test('Suma/resta exactas, vacío cero y entradas intactas', () => {
  const valores = Object.freeze([10000, -4000, -1000]);
  assert.equal(d.sumarMinor(valores), 5000);
  assert.equal(d.sumarMinor([]), 0);
  assert.equal(d.restarMinor(10000, 4000), 6000);
  assert.equal(d.restarMinor(-10000, -4000), -6000);
  assert.equal(d.restarMinor(MAX, MAX), 0);
  assert.equal(Object.is(d.restarMinor(MAX, MAX), -0), false);
});
test('BigInt interno evita pérdida en cancelaciones que superan el rango intermedio', () => {
  assert.equal(d.sumarMinor([MAX, 1, -1]), MAX);
  assert.equal(d.sumarMinor([MAX, MAX, -MAX]), MAX);
  assert.equal(d.sumarMinor([-MAX, -1, 1]), -MAX);
});
for (const [nombre, operacion] of [
  ['suma superior', () => d.sumarMinor([MAX, 1])],
  ['suma inferior', () => d.sumarMinor([-MAX, -1])],
  ['resta superior', () => d.restarMinor(MAX, -1)],
  ['resta inferior', () => d.restarMinor(-MAX, 1)],
]) test(`Desbordamiento explícito: ${nombre}`, () => assert.throws(operacion, error('DESBORDAMIENTO')));
test('No coerción de listas ni valores exactos', () => {
  for (const v of [null, {}, 1, '1,2']) assert.throws(() => d.sumarMinor(v), error('LISTA_INVALIDA'));
  assert.throws(() => d.sumarMinor(Array(1)), error('ENTERO_MINOR_INVALIDO'));
  assert.throws(() => d.desdeExacto(1), error('ENTERO_EXACTO_INVALIDO'));
});
for (const fecha of ['0001-01-01', '9999-12-31', '2026-10-17', '2024-02-29',
  '2000-02-29', '2400-02-29', '2026-04-30', '2026-12-31']) {
  test(`Fecha gregoriana válida: ${fecha}`, () => {
    assert.equal(d.fechaContableValida(fecha), true);
    assert.deepEqual(d.validarFechaYPeriodo(fecha, fecha.slice(0, 7)),
      { fechaContable: fecha, periodoId: fecha.slice(0, 7) });
  });
}
for (const [nombre, fecha] of [
  ['no bisiesto', '2026-02-29'], ['siglo 1900', '1900-02-29'], ['siglo 2100', '2100-02-29'],
  ['febrero 30', '2024-02-30'], ['abril 31', '2026-04-31'], ['día cero', '2026-01-00'],
  ['día 32', '2026-01-32'], ['mes cero', '2026-00-01'], ['mes 13', '2026-13-01'],
  ['año cero', '0000-01-01'], ['año corto', '26-01-01'], ['año largo', '10000-01-01'],
  ['sin relleno', '2026-1-1'], ['hora', '2026-01-01T00:00:00Z'], ['espacios', ' 2026-01-01'],
  ['salto final', '2026-01-01\n'], ['separador', '2026/01/01'], ['null', null], ['número', 20260101],
]) test(`Fecha inválida: ${nombre}`, () => {
  assert.equal(d.fechaContableValida(fecha), false);
  assert.throws(() => d.validarFechaYPeriodo(fecha, '2026-01'), error('FECHA_INVALIDA'));
});
test('Período estricto y correspondencia de fecha', () => {
  for (const p of ['0001-01', '2026-12', '9999-12']) assert.equal(d.periodoValido(p), true);
  for (const p of ['0000-01', '2026-00', '2026-13', '2026-1', '2026-01\n', '', null, 202601]) {
    assert.equal(d.periodoValido(p), false);
    assert.throws(() => d.validarFechaYPeriodo('2026-01-01', p), error('PERIODO_INVALIDO'));
  }
  assert.throws(() => d.validarFechaYPeriodo('2026-01-01', '2026-02'), error('PERIODO_NO_COINCIDE'));
});
test('Configuraciones malformadas y datos accesorios se rechazan', () => {
  for (const config of [null, [], {}, { ...d.CONFIGURACION_INICIAL, extra: true },
    { ...d.CONFIGURACION_INICIAL, moneda: 'clp' }, { ...d.CONFIGURACION_INICIAL, moneda: 'CLP\n' },
    { ...d.CONFIGURACION_INICIAL, escala: 2 }, { ...d.CONFIGURACION_INICIAL, escala: -0 },
    { ...d.CONFIGURACION_INICIAL, escala: 0.5 }, { ...d.CONFIGURACION_INICIAL, escala: '0' },
    { ...d.CONFIGURACION_INICIAL, escala: 7 }, { ...d.CONFIGURACION_INICIAL, zonaHoraria: 'zona/inexistente' },
    { ...d.CONFIGURACION_INICIAL, zonaHoraria: '' }]) assert.throws(() => d.validarConfiguracion(config));
});
test('Registros con getters/símbolos no se evalúan silenciosamente', () => {
  let lecturas = 0;
  const config = { ...d.CONFIGURACION_INICIAL };
  Object.defineProperty(config, 'moneda', { enumerable: true, get() { lecturas++; return 'CLP'; } });
  assert.throws(() => d.validarConfiguracion(config), error('CAMPOS_INVALIDOS'));
  assert.equal(lecturas, 0);
  assert.throws(() => d.validarConfiguracion({ ...d.CONFIGURACION_INICIAL, [Symbol('extra')]: 1 }));
});
test('Propiedad: todos los días de varios ciclos gregorianos, sin Date local', () => {
  for (let anio = 1600; anio <= 2400; anio++) {
    const esperado = anio % 400 === 0 || (anio % 4 === 0 && anio % 100 !== 0);
    assert.equal(d.fechaContableValida(`${anio}-02-29`), esperado);
  }
  for (let mes = 1; mes <= 12; mes++) {
    assert.equal(d.fechaContableValida(`2026-${String(mes).padStart(2, '0')}-01`), true);
    assert.equal(d.fechaContableValida(`2026-${String(mes).padStart(2, '0')}-32`), false);
  }
});
test('Propiedad: inversa de resta y suma en límites y muestras deterministas', () => {
  const muestras = [0, 1, -1, MAX, -MAX, MAX - 1, -MAX + 1];
  for (let n = -1000; n <= 1000; n += 17) muestras.push(n * 100003);
  for (const a of muestras) for (const b of [0, 1, -1, a]) {
    const exacto = BigInt(a) - BigInt(b);
    if (exacto >= -BigInt(MAX) && exacto <= BigInt(MAX)) {
      assert.equal(d.restarMinor(a, b), Number(exacto));
      assert.equal(d.sumarMinor([d.restarMinor(a, b), b]), a);
    } else assert.throws(() => d.restarMinor(a, b), error('DESBORDAMIENTO'));
  }
});
test('Zona local del proceso no cambia fechas, períodos ni configuración inicial', () => {
  const archivo = path.resolve(__dirname, '../finanzas_core/dinero.js');
  const script = `const d=require(${JSON.stringify(archivo)});process.stdout.write(JSON.stringify([d.CONFIGURACION_INICIAL,['2024-02-29','1900-02-29','2026-09-06','2026-04-05'].map(d.fechaContableValida)]))`;
  const resultados = ['UTC', 'America/Santiago', 'Asia/Tokyo'].map((TZ) => {
    const r = spawnSync(process.execPath, ['-e', script], { env: { TZ }, encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0); return r.stdout;
  });
  assert.equal(new Set(resultados).size, 1);
});
