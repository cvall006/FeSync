'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../finanzas_core/cuentas');
const a = require('../finanzas_core/asientos');
const cuenta = (extra = {}) => ({ versionEsquema: 1, id: 'caja', iglesiaId: 'iglesia',
  codigo: 'CAJA', nombre: 'Caja principal', tipo: 'caja', moneda: 'CLP', escala: 0,
  estado: 'activa', ...extra });
const estado = (extra = {}) => ({ iglesiaId: 'iglesia', cuentaId: 'caja', huboMovimientos: false,
  saldoMinor: 0, solicitudesInciertas: 0, aperturaRegistrada: false, ...extra });
const cambio = (extra = {}) => ({ iglesiaId: 'iglesia', actual: cuenta(), propuesta: cuenta(),
  catalogo: [cuenta()], estadoCuenta: estado(), ...extra });
const apertura = () => ({ iglesiaId: 'iglesia', cuenta: cuenta(), estadoCuenta: estado(),
  movimiento: a.crearApertura({ id: 'apertura', fechaContable: '2026-10-01', periodoId: '2026-10',
    cuenta: c.cuentaParaNuevoMovimiento(cuenta(), 'iglesia'), montoMinor: 10000 }) });

for (const tipo of ['caja', 'banco']) test(`Cuenta ${tipo} CLP válida y creación activa`, () => {
  const entrada = cuenta({ tipo });
  assert.deepEqual(c.crearCuenta({ iglesiaId: 'iglesia', cuenta: entrada, catalogo: [] }), entrada);
});
for (const [campo, valores] of Object.entries({
  id: ['', ' ', '../caja', '__reservado__', 'x'.repeat(129), null],
  iglesiaId: ['otra', '', null], versionEsquema: [2, '1', null],
  codigo: ['', 'caja', ' CAJA', 'CAJA ', 'CAJA\n', '1CAJA', 'CAJA/BANCO', 'X'.repeat(33), null],
  nombre: ['', ' ', ' Caja', 'Caja ', 'Caja\nprivada', 'Caja\u200b', 'e\u0301', 'x'.repeat(81), null],
  tipo: ['ahorro', 'Caja', null], moneda: ['USD', 'clp', null], escala: [2, '0', -0, null],
  estado: ['eliminada', true, null],
})) for (const [i, valor] of valores.entries()) test(`Cuenta rechaza ${campo} inválido ${i}`, () => {
  assert.throws(() => c.validarCuenta(cuenta({ [campo]: valor }), 'iglesia'));
});
for (const campo of ['saldoMinor', 'saldo', 'montoMinor', 'actorUid', 'isAdmin']) {
  test(`Cuenta no acepta campo externo ${campo}`, () => {
    assert.throws(() => c.validarCuenta(cuenta({ [campo]: 100 }), 'iglesia'), { codigo: 'CAMPOS_INVALIDOS' });
  });
}
test('Cuenta exige todos los campos y rechaza getters sin ejecutarlos', () => {
  for (const k of Object.keys(cuenta())) {
    const p = cuenta(); delete p[k]; assert.throws(() => c.validarCuenta(p, 'iglesia'));
  }
  let llamadas = 0; const p = cuenta(); Object.defineProperty(p, 'nombre', {
    enumerable: true, get() { llamadas++; throw Error('No ejecutar'); },
  });
  assert.throws(() => c.validarCuenta(p, 'iglesia')); assert.equal(llamadas, 0);
});
test('Código e ID únicos, incluidas cuentas archivadas; aislamiento entre iglesias', () => {
  for (const otra of [cuenta({ codigo: 'BANCO' }), cuenta({ id: 'banco', estado: 'archivada' })]) {
    assert.throws(() => c.crearCuenta({ iglesiaId: 'iglesia', cuenta: cuenta(), catalogo: [otra] }));
  }
  assert.throws(() => c.validarCatalogoCuentas([cuenta({ iglesiaId: 'otra' })], 'iglesia'));
  assert.equal(c.crearCuenta({ iglesiaId: 'otra', cuenta: cuenta({ iglesiaId: 'otra' }), catalogo: [] }).codigo, 'CAJA');
  assert.throws(() => c.crearCuenta({ iglesiaId: 'iglesia', cuenta: cuenta({ estado: 'archivada' }), catalogo: [] }));
});
test('Catálogo incompleto/malformado y estado faltante no se suponen vacíos', () => {
  for (const catalogo of [null, {}, [null], Array(1)]) {
    assert.throws(() => c.crearCuenta({ iglesiaId: 'iglesia', cuenta: cuenta(), catalogo }));
  }
  assert.throws(() => c.actualizarCuenta(cambio({ catalogo: [] })));
  assert.throws(() => c.actualizarCuenta(cambio({ estadoCuenta: null })));
});
test('Nombre editable con historia; tipo editable solamente antes del uso', () => {
  assert.equal(c.actualizarCuenta(cambio({ propuesta: cuenta({ nombre: 'Caja nueva' }),
    estadoCuenta: estado({ huboMovimientos: true, saldoMinor: 123 }) })).nombre, 'Caja nueva');
  assert.equal(c.actualizarCuenta(cambio({ propuesta: cuenta({ tipo: 'banco' }) })).tipo, 'banco');
  for (const estadoCuenta of [estado({ huboMovimientos: true }), estado({ solicitudesInciertas: 1 })]) {
    assert.throws(() => c.actualizarCuenta(cambio({ propuesta: cuenta({ tipo: 'banco' }), estadoCuenta })),
      { codigo: 'CUENTA_USADA_INMUTABLE' });
  }
});
for (const propuesta of [cuenta({ id: 'otra' }), cuenta({ codigo: 'OTRA' }),
  cuenta({ iglesiaId: 'otra' }), cuenta({ moneda: 'USD', escala: 2 })]) {
  test(`Cuenta conserva identidad/moneda: ${propuesta.id}/${propuesta.codigo}/${propuesta.moneda}`, () => {
    assert.throws(() => c.actualizarCuenta(cambio({ propuesta })));
  });
}
test('Archivar a saldo cero conserva identidad e historial; archivo terminal', () => {
  const entrada = cambio({ propuesta: cuenta({ estado: 'archivada' }),
    estadoCuenta: estado({ huboMovimientos: true, aperturaRegistrada: true }) });
  const antes = structuredClone(entrada); const r = c.actualizarCuenta(entrada);
  assert.equal(r.estado, 'archivada'); assert.deepEqual(entrada, antes);
  assert.throws(() => c.actualizarCuenta(cambio({ actual: r, catalogo: [r] })), { codigo: 'CUENTA_ARCHIVO_TERMINAL' });
});
for (const saldoMinor of [1, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
  test(`Archivar rechaza saldo no cero ${saldoMinor}`, () => {
    assert.throws(() => c.actualizarCuenta(cambio({ propuesta: cuenta({ estado: 'archivada' }),
      estadoCuenta: estado({ huboMovimientos: true, saldoMinor }) })), { codigo: 'CUENTA_CON_SALDO' });
  });
}
test('Archivar bloquea solicitudes inciertas, aunque no exista uso confirmado', () => {
  assert.throws(() => c.actualizarCuenta(cambio({ propuesta: cuenta({ estado: 'archivada' }),
    estadoCuenta: estado({ solicitudesInciertas: 1 }) })), { codigo: 'CUENTA_CON_SOLICITUDES_INCIERTAS' });
});
for (const extra of [{ saldoMinor: NaN }, { saldoMinor: Infinity }, { saldoMinor: 0.5 },
  { saldoMinor: Number.MAX_SAFE_INTEGER + 1 }, { saldoMinor: -0 }, { saldoMinor: '0' },
  { solicitudesInciertas: -1 }, { solicitudesInciertas: 0.5 }, { solicitudesInciertas: null },
  { huboMovimientos: null }, { aperturaRegistrada: null }, { cuentaId: 'otra' },
  { iglesiaId: 'otra' }, { saldoMinor: 1 }, { aperturaRegistrada: true }]) {
  test(`Estado de cuenta inválido: ${JSON.stringify(extra)}`, () => {
    assert.throws(() => c.validarEstadoCuenta(estado(extra), cuenta()));
  });
}
test('No se proyecta una cuenta archivada para ingresos, gastos, transferencias o apertura nuevos', () => {
  assert.throws(() => c.cuentaParaNuevoMovimiento(cuenta({ estado: 'archivada' }), 'iglesia'), { codigo: 'CUENTA_ARCHIVADA' });
  const referencia = c.cuentaParaNuevoMovimiento(cuenta(), 'iglesia');
  assert.deepEqual(referencia, { id: 'caja', moneda: 'CLP', escala: 0 });
  assert.equal(a.crearIngreso({ id: 'ingreso', fechaContable: '2026-10-01', periodoId: '2026-10',
    cuenta: referencia, montoMinor: 10000 }).asientos[0].deltaMinor, 10000);
});
test('Apertura única válida usa FIN-2 y nunca se registra como ingreso operativo', () => {
  const entrada = apertura(); const antes = structuredClone(entrada);
  const m = c.validarAperturaCuenta(entrada);
  const libro = a.calcularLibro({ movimientos: [m], cuentas: [c.cuentaParaNuevoMovimiento(cuenta(), 'iglesia')] });
  assert.equal(libro.aperturasNetasMinor, 10000); assert.equal(libro.ingresosNetosMinor, 0);
  assert.deepEqual(entrada, antes);
});
test('Apertura histórica incluso revertida no permite abrir otra vez', () => {
  const p = apertura(); p.estadoCuenta = estado({ huboMovimientos: true, aperturaRegistrada: true });
  assert.throws(() => c.validarAperturaCuenta(p), { codigo: 'APERTURA_DUPLICADA' });
  p.estadoCuenta = estado({ huboMovimientos: true });
  assert.throws(() => c.validarAperturaCuenta(p), { codigo: 'APERTURA_NO_INICIAL' });
});
test('Apertura bloquea incertidumbre, cuenta ajena, archivada, reversas y movimientos incompatibles', () => {
  for (const modificar of [p => { p.estadoCuenta.solicitudesInciertas = 1; },
    p => { p.cuenta.estado = 'archivada'; }, p => { p.movimiento.asientos[0].cuentaId = 'otra'; },
    p => { p.movimiento.reversaDe = 'anterior'; }, p => { p.movimiento.clase = 'ingreso'; },
    p => { p.movimiento.asientos[0].deltaMinor = 0; }, p => { p.movimiento.moneda = 'USD'; },
    p => { p.movimiento.fechaContable = '2026-02-30'; }]) {
    const p = structuredClone(apertura()); modificar(p); assert.throws(() => c.validarAperturaCuenta(p));
  }
});
test('Concurrencia modelada: releer evita código duplicado, archivo tras ingreso y segunda apertura', () => {
  const nueva = { iglesiaId: 'iglesia', cuenta: cuenta(), catalogo: [] };
  const primera = c.crearCuenta(nueva);
  assert.throws(() => c.crearCuenta({ ...nueva, catalogo: [primera] }));
  const archivar = cambio({ propuesta: cuenta({ estado: 'archivada' }) });
  c.actualizarCuenta(archivar);
  assert.throws(() => c.actualizarCuenta({ ...archivar, estadoCuenta: estado({ huboMovimientos: true, saldoMinor: 100 }) }));
  const abrir = apertura(); c.validarAperturaCuenta(abrir);
  assert.throws(() => c.validarAperturaCuenta({ ...abrir,
    estadoCuenta: estado({ huboMovimientos: true, saldoMinor: 10000, aperturaRegistrada: true }) }));
  assert.throws(() => c.actualizarCuenta(cambio({ catalogo: [cuenta({ nombre: 'Edición concurrente' })] })));
});
test('Entradas congeladas, salidas inmutables y determinismo sobre catálogos', () => {
  for (let i = 1; i <= 30; i++) {
    const lista = Object.freeze(Array.from({ length: i }, (_, n) => Object.freeze(cuenta({ id: `c${n}`, codigo: `C_${n}` }))));
    const r = c.validarCatalogoCuentas(lista, 'iglesia');
    assert.equal(r.length, i); assert.equal(new Set(r.map(x => x.codigo)).size, i);
    assert.ok(Object.isFrozen(r) && r.every(Object.isFrozen));
    assert.deepEqual(c.validarCatalogoCuentas(lista, 'iglesia'), r);
  }
  const p = cambio(); Object.values(p).forEach(Object.freeze); Object.freeze(p);
  assert.ok(Object.isFrozen(c.actualizarCuenta(p)));
});
test('FIN-4 se ejecuta en VM sin reloj, SDKs, filesystem ni red', () => {
  const fuentes = Object.fromEntries(['dinero', 'asientos', 'cuentas', 'categorias'].map(n =>
    [`./${n}`, fs.readFileSync(path.join(__dirname, `../finanzas_core/${n}.js`), 'utf8')]));
  const contexto = vm.createContext({ fuentes, Buffer });
  vm.runInContext(`
    Date.now = () => { throw Error('Reloj prohibido'); };
    const cache = Object.create(null);
    function cargar(n) {
      if (!Object.hasOwn(fuentes, n)) throw Error('Dependencia prohibida');
      if (!cache[n]) { const m = { exports: {} }; cache[n] = m;
        new Function('require', 'module', fuentes[n])(cargar, m); }
      return cache[n].exports;
    }
    const categorias = cargar('./categorias').categoriasIngresoIniciales('iglesia');
    if (categorias.length !== 4) throw Error('Catálogo incorrecto');
    const cuentas = cargar('./cuentas').validarCatalogoCuentas([], 'iglesia');
    if (cuentas.length !== 0) throw Error('Catálogo incorrecto');
  `, contexto);
});
