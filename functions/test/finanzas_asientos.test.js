'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const a = require('../finanzas_core/asientos');
const { CONFIGURACION_INICIAL, ErrorContable } = require('../finanzas_core/dinero');
const caja = Object.freeze({ id: 'caja', moneda: 'CLP', escala: 0 });
const banco = Object.freeze({ id: 'banco', moneda: 'CLP', escala: 0 });
const cuentas = Object.freeze([caja, banco]);
const p = (id, montoMinor = 10000, fechaContable = '2026-10-17') =>
  ({ id, montoMinor, fechaContable, periodoId: fechaContable.slice(0, 7), cuenta: caja });
const transferencia = (id = 't', montoMinor = 4000) => {
  const { cuenta, ...datos } = p(id, montoMinor);
  return a.crearTransferencia({ ...datos, origen: cuenta, destino: banco });
};
const reversa = (original, id = 'r', fechaContable = original.fechaContable) =>
  a.revertirMovimiento({ id, fechaContable, periodoId: fechaContable.slice(0, 7), original, cuentas });
const libro = (movimientos, extra = {}) => a.calcularLibro({ movimientos, cuentas, ...extra });
const error = (codigo) => ({ name: 'ErrorContable', codigo });
function congelar(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); }
  return v;
}

test('Ingreso 10000 y gasto 4000: signos, saldos y resultado', () => {
  const ingreso = a.crearIngreso(p('i'));
  const gasto = a.crearGasto(p('g', 4000));
  assert.deepEqual(ingreso.asientos, [{ cuentaId: 'caja', deltaMinor: 10000 }]);
  assert.deepEqual(gasto.asientos, [{ cuentaId: 'caja', deltaMinor: -4000 }]);
  const r = libro([ingreso, gasto]);
  assert.equal(r.saldoFinalMinor, 6000);
  assert.equal(r.ingresosNetosMinor, 10000); assert.equal(r.gastosNetosMinor, 4000);
  assert.equal(r.resultadoMinor, 6000);
});
test('Transferir 4000 no duplica ingresos ni modifica el consolidado', () => {
  const t = transferencia(); const r = libro([a.crearIngreso(p('i')), t]);
  assert.deepEqual(t.asientos, [{ cuentaId: 'caja', deltaMinor: -4000 }, { cuentaId: 'banco', deltaMinor: 4000 }]);
  assert.deepEqual(r.saldoFinalPorCuenta, { banco: 4000, caja: 6000 });
  assert.equal(r.saldoFinalMinor, 10000); assert.equal(r.ingresosNetosMinor, 10000);
  assert.equal(r.gastosNetosMinor, 0); assert.equal(r.resultadoMinor, 10000);
});
test('Apertura y ajustes son patrimoniales, nunca ingresos/gastos operativos', () => {
  const r = libro([a.crearApertura(p('a', 50000)), a.crearAjuste(p('j', -3000)),
    a.crearAjuste(p('j2', 1000))]);
  assert.equal(r.saldoFinalMinor, 48000); assert.equal(r.aperturasNetasMinor, 50000);
  assert.equal(r.ajustesNetosMinor, -2000); assert.equal(r.ingresosNetosMinor, 0);
  assert.equal(r.gastosNetosMinor, 0); assert.equal(r.resultadoMinor, 0);
});
for (const [nombre, crear] of Object.entries({ ingreso: a.crearIngreso, gasto: a.crearGasto,
  apertura: a.crearApertura, ajuste: a.crearAjuste })) {
  test(`${nombre}: cero, negativos y límites según operación`, () => {
    assert.throws(() => crear(p('x', 0)), ErrorContable);
    assert.equal(Math.abs(crear(p('x', Number.MAX_SAFE_INTEGER)).asientos[0].deltaMinor), Number.MAX_SAFE_INTEGER);
    if (nombre === 'ajuste') assert.equal(crear(p('x', -1)).asientos[0].deltaMinor, -1);
    else assert.throws(() => crear(p('x', -1)), error('MONTO_NO_POSITIVO'));
    for (const n of [NaN, Infinity, -Infinity, '100', 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => crear(p('x', n)), error('ENTERO_MINOR_INVALIDO'));
    }
  });
}
test('Transferencias con misma cuenta y monedas diferentes prohibidas', () => {
  const { cuenta, ...datos } = p('t');
  assert.throws(() => a.crearTransferencia({ ...datos, origen: cuenta, destino: cuenta }), error('CUENTAS_IGUALES'));
  assert.throws(() => a.crearTransferencia({ ...datos, origen: cuenta,
    destino: { ...banco, moneda: 'USD', escala: 2 } }), error('MONEDA_NO_COINCIDE'));
  assert.throws(() => transferencia('t', 0), error('MONTO_NO_POSITIVO'));
  assert.throws(() => transferencia('t', -1), error('MONTO_NO_POSITIVO'));
});
test('Transferencia adulterada sin total cero no es un movimiento válido', () => {
  const t = structuredClone(transferencia()); t.asientos[1].deltaMinor = 3000;
  assert.throws(() => a.validarMovimiento(t, { cuentas }), error('TRANSFERENCIA_DESBALANCEADA'));
  assert.throws(() => libro([t]), error('TRANSFERENCIA_DESBALANCEADA'));
});
for (const [nombre, crear] of Object.entries({ ingreso: a.crearIngreso, gasto: a.crearGasto,
  apertura: a.crearApertura, ajuste: a.crearAjuste, transferencia })) {
  test(`Reversión exacta de ${nombre}, sin mutación ni doble descuento`, () => {
    const original = nombre === 'transferencia' ? crear() : crear(p('o', nombre === 'ajuste' ? -200 : 10000));
    const antes = structuredClone(original); const r = reversa(original);
    assert.deepEqual(original, antes);
    assert.equal(r.clase, original.clase); assert.equal(r.reversaDe, original.id);
    assert.deepEqual(r.asientos, original.asientos.map((s) => ({ ...s, deltaMinor: -s.deltaMinor })));
    assert.deepEqual(a.validarMovimiento(r, { cuentas, original }), r);
    const resultado = libro([original, r]);
    for (const k of ['saldoFinalMinor', 'ingresosNetosMinor', 'gastosNetosMinor', 'resultadoMinor',
      'aperturasNetasMinor', 'ajustesNetosMinor']) assert.equal(resultado[k], 0);
    assert.deepEqual(resultado.saldoFinalPorCuenta, { banco: 0, caja: 0 });
  });
}
test('Reversión en mes siguiente reduce su rubro ese mes y conserva saldos anteriores', () => {
  const original = a.crearIngreso(p('i', 10000, '2026-09-30'));
  const r = reversa(original, 'r', '2026-10-01');
  const septiembre = libro([r, original], { periodoId: '2026-09' });
  assert.equal(septiembre.saldoInicialMinor, 0); assert.equal(septiembre.saldoFinalMinor, 10000);
  assert.equal(septiembre.ingresosNetosMinor, 10000);
  const octubre = libro([original, r], { periodoId: '2026-10' });
  assert.equal(octubre.saldoInicialMinor, 10000); assert.equal(octubre.saldoFinalMinor, 0);
  assert.equal(octubre.ingresosNetosMinor, -10000); assert.equal(octubre.resultadoMinor, -10000);
});
test('Libro exige original, IDs únicos y una sola reversa por original', () => {
  const o = a.crearIngreso(p('i')); const r = reversa(o);
  assert.throws(() => libro([r]), error('REVERSA_HUERFANA'));
  assert.throws(() => a.validarMovimiento(r, { cuentas }), error('REVERSA_HUERFANA'));
  assert.throws(() => libro([o, o]), error('MOVIMIENTO_DUPLICADO'));
  assert.throws(() => libro([o, r, reversa(o, 'r2')]), error('REVERSA_DUPLICADA'));
  assert.throws(() => reversa(o, o.id), error('AUTORREVERSA'));
  assert.throws(() => reversa(o, 'r', '2026-10-16'), error('REVERSA_INCOMPATIBLE'));
  assert.throws(() => reversa(r, 'r2'), ErrorContable);
});
test('Reversas de reversas, importes y cuentas adulteradas se rechazan', () => {
  const o = a.crearIngreso(p('i')); const r = reversa(o);
  const cadena = { ...structuredClone(o), id: 'r2', reversaDe: r.id };
  assert.throws(() => libro([o, r, cadena]), error('REVERSA_DE_REVERSA'));
  const incorrecta = structuredClone(r); incorrecta.asientos[0].deltaMinor = -9999;
  assert.throws(() => libro([o, incorrecta]), error('REVERSA_INEXACTA'));
  const cuentaCambiada = structuredClone(r); cuentaCambiada.asientos[0].cuentaId = 'banco';
  assert.throws(() => libro([o, cuentaCambiada]), error('REVERSA_INEXACTA'));
});
test('Cambiar clase de una reversa no altera resultados silenciosamente', () => {
  const o = a.crearIngreso(p('i')); const r = { ...reversa(o), clase: 'ajuste' };
  assert.throws(() => libro([o, r]), error('REVERSA_INCOMPATIBLE'));
});
test('Bandera anulado no se ignora ni descuenta el original de nuevo', () => {
  const o = a.crearIngreso(p('i'));
  assert.throws(() => libro([{ ...o, anulado: true }]), error('CAMPOS_INVALIDOS'));
  const r = reversa(o);
  assert.equal(libro([o, r]).saldoFinalMinor, 0);
});
test('Cuenta faltante, duplicada, moneda o escala incompatibles se rechazan', () => {
  const o = a.crearIngreso(p('i'));
  assert.throws(() => libro([o], { cuentas: [banco] }), error('CUENTA_NO_ENCONTRADA'));
  assert.throws(() => libro([o], { cuentas: [caja, caja] }), error('CUENTA_DUPLICADA'));
  assert.throws(() => libro([o], { cuentas: [{ ...caja, moneda: 'USD' }] }), error('MONEDA_NO_COINCIDE'));
  assert.throws(() => libro([{ ...o, moneda: 'USD' }]), error('CONFIGURACION_NO_COINCIDE'));
  assert.throws(() => libro([{ ...o, escala: 2 }]), error('CONFIGURACION_NO_COINCIDE'));
});
test('Libro vacío reconstruye ceros, y el núcleo permite saldos negativos sin política de sobregiro', () => {
  assert.deepEqual(libro([]).saldoFinalPorCuenta, { banco: 0, caja: 0 });
  assert.equal(libro([a.crearGasto(p('g', 4000))]).saldoFinalMinor, -4000);
  assert.equal(libro([]).resultadoMinor, 0);
});
test('Desbordamiento de cuenta, consolidado y rubros se detecta al emitir resultados', () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  assert.throws(() => libro([a.crearIngreso(p('i', MAX)), a.crearIngreso(p('i2', 1))]), error('DESBORDAMIENTO'));
  assert.throws(() => libro([a.crearApertura(p('a', MAX)),
    a.crearApertura({ ...p('b', 1), cuenta: banco })]), error('DESBORDAMIENTO'));
  assert.throws(() => libro([a.crearIngreso(p('i', MAX)), a.crearIngreso(p('i2', 1)),
    a.crearGasto(p('g', MAX))]), error('DESBORDAMIENTO'));
});
test('Configuración explícita alternativa se conserva homogénea', () => {
  const configuracion = { moneda: 'USD', escala: 2, zonaHoraria: 'UTC' };
  const c = { id: 'usd', moneda: 'USD', escala: 2 };
  const o = a.crearIngreso({ ...p('i', 1050), cuenta: c, configuracion });
  const r = a.calcularLibro({ movimientos: [o], cuentas: [c], configuracion });
  assert.equal(r.saldoFinalMinor, 1050); assert.equal(r.escala, 2);
  assert.throws(() => libro([o]), error('CONFIGURACION_NO_COINCIDE'));
});
test('Entradas congeladas permanecen intactas y salidas no comparten objetos mutables', () => {
  const datos = congelar(p('i')); const antes = structuredClone(datos);
  const o = a.crearIngreso(datos);
  assert.deepEqual(datos, antes);
  const movimientos = congelar([o, transferencia(), reversa(o)]);
  const copia = structuredClone(movimientos); const r = libro(movimientos);
  assert.deepEqual(movimientos, copia);
  assert.equal(Object.isFrozen(o.asientos), true);
  assert.equal(Object.isFrozen(o.asientos[0]), true);
  assert.equal(Object.isFrozen(r.saldoFinalPorCuenta), true);
  assert.throws(() => { o.asientos[0].deltaMinor = 1; }, TypeError);
  const entrada = structuredClone(o); const validado = a.validarMovimiento(entrada, { cuentas });
  entrada.asientos[0].deltaMinor = 5;
  assert.equal(validado.asientos[0].deltaMinor, 10000);
});
test('Fechas, períodos, estructura y signos son estrictos incluso para objetos reconstruidos', () => {
  const o = a.crearIngreso(p('i'));
  for (const cambio of [{ id: '' }, { clase: 'otro' }, { asientos: [] }, { periodoId: '2026-09' },
    { fechaContable: '2026-02-30' }, { asientos: [{ cuentaId: 'caja', deltaMinor: 0 }] },
    { asientos: [{ cuentaId: 'caja', deltaMinor: -1 }] }, { extra: true }]) {
    assert.throws(() => libro([{ ...o, ...cambio }]), ErrorContable);
  }
  assert.throws(() => libro([o], { periodoId: '2026-13' }), error('PERIODO_INVALIDO'));
});
test('Propiedades: transferencia conserva patrimonio y el par original/reversa es neutro', () => {
  const muestras = [1, 2, 10000, Number.MAX_SAFE_INTEGER];
  for (let i = 1; i <= 200; i++) muestras.push(i * 7919);
  for (const n of muestras) {
    const t = transferencia('t', n);
    const r = libro([t]);
    assert.equal(r.saldoFinalMinor, 0); assert.equal(r.resultadoMinor, 0);
    assert.equal(r.saldoFinalPorCuenta.banco, n); assert.equal(r.saldoFinalPorCuenta.caja, -n);
    assert.equal(libro([t, reversa(t)]).saldoFinalMinor, 0);
  }
});
test('Propiedades: reconstrucción independiente, ecuación patrimonial y orden de entradas', () => {
  const movimientos = [];
  let saldoCaja = 0n, saldoBanco = 0n;
  for (let i = 1; i <= 150; i++) {
    const ingreso = a.crearIngreso(p(`i${i}`, i * 100));
    const gasto = a.crearGasto(p(`g${i}`, i * 10));
    const t = transferencia(`t${i}`, i * 20);
    movimientos.push(ingreso, gasto, t);
    saldoCaja += BigInt(i * 100 - i * 10 - i * 20); saldoBanco += BigInt(i * 20);
    if (i % 3 === 0) { movimientos.push(reversa(gasto, `r${i}`)); saldoCaja += BigInt(i * 10); }
  }
  const antes = structuredClone(movimientos);
  const r = libro(movimientos);
  assert.deepEqual(r.saldoFinalPorCuenta, { banco: Number(saldoBanco), caja: Number(saldoCaja) });
  assert.equal(r.saldoFinalMinor, r.saldoInicialMinor + r.resultadoMinor + r.aperturasNetasMinor + r.ajustesNetosMinor);
  assert.deepEqual(libro([...movimientos].reverse()), r);
  assert.deepEqual(movimientos, antes);
});
test('Sin reloj, Firebase, persistencia, red o estado mutable entre invocaciones', () => {
  const contexto = vm.createContext({});
  const cargar = (nombre, requerir) => {
    contexto.modulo = { exports: {} }; contexto.requerir = requerir;
    const fuente = fs.readFileSync(path.join(__dirname, '../finanzas_core', nombre), 'utf8');
    vm.runInContext(`(function(module,require){${fuente}\n})(modulo,requerir)`, contexto);
    return contexto.modulo.exports;
  };
  vm.runInContext("globalThis.Date = class { constructor(){throw Error('Reloj prohibido')} static now(){throw Error('Reloj prohibido')} };", contexto);
  const dinero = cargar('dinero.js', () => { throw Error('Dependencia prohibida'); });
  contexto.nucleo = cargar('asientos.js', (nombre) => {
    assert.equal(nombre, './dinero'); return dinero;
  });
  const resultado = vm.runInContext(`JSON.stringify(nucleo.calcularLibro({movimientos:[nucleo.crearIngreso({id:'i',montoMinor:10000,fechaContable:'2026-10-17',periodoId:'2026-10',cuenta:{id:'caja',moneda:'CLP',escala:0}})],cuentas:[{id:'caja',moneda:'CLP',escala:0}]}))`, contexto);
  assert.equal(JSON.parse(resultado).saldoFinalMinor, 10000);
  assert.deepEqual(libro([]), libro([]));
  assert.equal(Object.isFrozen(a), true); assert.equal(Object.isFrozen(CONFIGURACION_INICIAL), true);
});
test('Apertura única por cuenta y sin operaciones con fecha anterior', () => {
  const apertura = a.crearApertura(p('a', 1000, '2026-10-01'));
  assert.throws(() => libro([apertura, a.crearApertura(p('a2', 2000))]), error('APERTURA_DUPLICADA'));
  assert.throws(() => libro([apertura, a.crearIngreso(p('i', 1, '2026-09-30'))]), error('APERTURA_NO_INICIAL'));
  assert.throws(() => libro([apertura, reversa(apertura), a.crearApertura(p('a2', 2000))]), error('APERTURA_DUPLICADA'));
  assert.equal(libro([apertura, a.crearIngreso(p('i', 1, '2026-10-01'))]).saldoFinalMinor, 1001);
});
test('Saldo inicial/final mensual y resultado excluyen movimientos posteriores', () => {
  const movimientos = [a.crearApertura(p('a', 1000, '2026-09-01')),
    a.crearIngreso(p('i', 10000)), a.crearGasto(p('g', 4000)), transferencia(),
    a.crearAjuste(p('j', -500)), a.crearIngreso(p('futuro', 90000, '2026-11-01'))];
  const r = libro(movimientos, { periodoId: '2026-10' });
  assert.equal(r.saldoInicialMinor, 1000); assert.equal(r.saldoFinalMinor, 6500);
  assert.deepEqual(r.saldoFinalPorCuenta, { banco: 4000, caja: 2500 });
  assert.equal(r.ingresosNetosMinor, 10000); assert.equal(r.gastosNetosMinor, 4000);
  assert.equal(r.aperturasNetasMinor, 0); assert.equal(r.ajustesNetosMinor, -500);
  assert.equal(r.saldoFinalMinor, r.saldoInicialMinor + r.resultadoMinor + r.ajustesNetosMinor);
});
test('Anular gasto reduce gastos netos, no crea ingreso', () => {
  const gasto = a.crearGasto(p('g', 4000));
  const r = libro([a.crearIngreso(p('i')), gasto, reversa(gasto)]);
  assert.equal(r.ingresosNetosMinor, 10000); assert.equal(r.gastosNetosMinor, 0);
  assert.equal(r.resultadoMinor, 10000); assert.equal(r.saldoFinalMinor, 10000);
});
test('Reconstrucción exacta no depende del orden ni pierde unidades próximas al límite', () => {
  const movimientos = [a.crearAjuste(p('j1', Number.MAX_SAFE_INTEGER)),
    a.crearAjuste(p('j2', 1)), a.crearAjuste(p('j3', -1))];
  assert.equal(libro(movimientos).saldoFinalMinor, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(libro([...movimientos].reverse()), libro(movimientos));
});
test('Reversión de transferencia admite orden de patas distinto pero exige las mismas cuentas', () => {
  const t = transferencia(); const r = structuredClone(reversa(t));
  r.asientos.reverse();
  assert.equal(libro([t, r]).saldoFinalMinor, 0);
  r.asientos[0].cuentaId = 'caja';
  assert.throws(() => libro([t, r]), error('CUENTAS_IGUALES'));
});
test('Identificadores malformados, estructura dispersa y deltas inseguros no se aceptan', () => {
  for (const id of ['', ' ', 'con/diagonal', 'con\ncontrol', '__reservado__', '.', '..', 'x'.repeat(129), null]) {
    assert.throws(() => a.crearIngreso(p(id)), error('ID_INVALIDO'));
  }
  const o = a.crearIngreso(p('i'));
  for (const asientos of [null, Array(1), [{ cuentaId: 'caja', deltaMinor: '100' }],
    [{ cuentaId: 'caja', deltaMinor: Number.MAX_SAFE_INTEGER + 1 }]]) {
    assert.throws(() => libro([{ ...o, asientos }]), ErrorContable);
  }
  assert.throws(() => libro([{ ...o, escala: -0 }]), error('CONFIGURACION_NO_COINCIDE'));
  assert.throws(() => libro([o], { cuentas: [{ ...caja, escala: -0 }] }), error('MONEDA_NO_COINCIDE'));
});
test('Un ID que coincide con propiedades heredadas se maneja sin contaminación de prototipos', () => {
  const cuenta = { id: 'constructor', moneda: 'CLP', escala: 0 };
  const o = a.crearIngreso({ ...p('i'), cuenta });
  const r = a.calcularLibro({ movimientos: [o], cuentas: [cuenta] });
  assert.equal(Object.hasOwn(r.saldoFinalPorCuenta, 'constructor'), true);
  assert.equal(r.saldoFinalPorCuenta.constructor, 10000);
  assert.equal(Object.getPrototypeOf(r.saldoFinalPorCuenta), Object.prototype);
});
test('Los argumentos de todos los constructores y de reversión permanecen sin mutar', () => {
  for (const crear of [a.crearIngreso, a.crearGasto, a.crearApertura, a.crearAjuste]) {
    const entrada = congelar(p('o')); const antes = structuredClone(entrada);
    crear(entrada); assert.deepEqual(entrada, antes);
  }
  const entrada = congelar({ id: 't', fechaContable: '2026-10-17', periodoId: '2026-10',
    origen: caja, destino: banco, montoMinor: 4000 });
  const antes = structuredClone(entrada); a.crearTransferencia(entrada); assert.deepEqual(entrada, antes);
  const argumentos = congelar({ id: 'r', fechaContable: '2026-10-17', periodoId: '2026-10',
    original: a.crearIngreso(p('i')), cuentas });
  const copia = structuredClone(argumentos); a.revertirMovimiento(argumentos); assert.deepEqual(argumentos, copia);
});
