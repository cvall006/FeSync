'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../finanzas_core/configuracion');
const { evaluarAutorizacionContable } = require('../finanzas_core/autorizacion');
const configuracion = () => ({ versionEsquema: 1, iglesiaId: 'iglesia',
  moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
const estado = (huboMovimientos = false, periodosAbiertos = []) =>
  ({ iglesiaId: 'iglesia', huboMovimientos, periodosAbiertos });
const inicial = (extra = {}) => ({ iglesiaId: 'iglesia', propuesta: configuracion(),
  estadoLibro: estado(), primerPeriodo: '2026-10', ...extra });
const cambio = (extra = {}) => ({ iglesiaId: 'iglesia', actual: configuracion(),
  propuesta: configuracion(), estadoLibro: estado(true, ['2026-10']), ...extra });
test('Configuración inicial CLP y plan de un único período, sin crear documentos', () => {
  const datos = inicial(); const antes = structuredClone(datos);
  assert.deepEqual(c.validarConfiguracionInicial(datos), { configuracion: configuracion(),
    control: { versionEsquema: 1, iglesiaId: 'iglesia', periodoAbierto: '2026-10' } });
  assert.deepEqual(datos, antes);
});
test('Documento contable válido, separado del acceso y sin datos personales', () => {
  const r = c.validarConfiguracionContable(configuracion(), 'iglesia');
  assert.deepEqual(r, configuracion()); assert.equal(Object.isFrozen(r), true);
  for (const extra of [{ encargadoUid: 'usuario' }, { moduloHabilitado: true },
    { nombre: 'Persona' }, { actorUid: 'admin' }, { correo: 'ficticio@example.invalid' }]) {
    assert.throws(() => c.validarConfiguracionContable({ ...r, ...extra }, 'iglesia'), { codigo: 'CAMPOS_INVALIDOS' });
  }
});
for (const [nombre, modificar] of [
  ['moneda diferente', (v) => { v.moneda = 'USD'; v.escala = 2; }],
  ['moneda minúscula', (v) => { v.moneda = 'clp'; }],
  ['moneda ausente', (v) => { delete v.moneda; }],
  ['escala dos', (v) => { v.escala = 2; }],
  ['escala textual', (v) => { v.escala = '0'; }],
  ['escala menos cero', (v) => { v.escala = -0; }],
  ['zona distinta', (v) => { v.zonaHoraria = 'UTC'; }],
  ['zona inválida', (v) => { v.zonaHoraria = 'incorrecta'; }],
  ['zona ausente', (v) => { delete v.zonaHoraria; }],
  ['versión futura', (v) => { v.versionEsquema = 2; }],
  ['versión textual', (v) => { v.versionEsquema = '1'; }],
  ['iglesia distinta', (v) => { v.iglesiaId = 'otra'; }],
]) test(`Configuración inicial rechaza ${nombre}`, () => {
  const p = inicial(); modificar(p.propuesta); assert.throws(() => c.validarConfiguracionInicial(p));
});
for (const [campo, valor] of [['moneda', 'USD'], ['escala', 2], ['zonaHoraria', 'UTC']]) {
  test(`Tras primer movimiento no cambia ${campo}, aunque haya anulaciones o saldo cero`, () => {
    const p = cambio(); p.propuesta[campo] = valor;
    assert.throws(() => c.validarCambioConfiguracion(p), { codigo: 'CONFIGURACION_BLOQUEADA_POR_HISTORIAL' });
  });
}
test('Historial existente con configuración idéntica permite validación repetida', () => {
  assert.deepEqual(c.validarCambioConfiguracion(cambio()), configuracion());
  assert.deepEqual(c.validarCambioConfiguracion(cambio({ estadoLibro: estado(true) })), configuracion());
});
test('Antes del primer movimiento V1 tampoco habilita monedas o zonas no implementadas', () => {
  const p = cambio({ estadoLibro: estado(false) }); p.propuesta.zonaHoraria = 'UTC';
  assert.throws(() => c.validarCambioConfiguracion(p), { codigo: 'CONFIGURACION_V1_NO_SOPORTADA' });
});
test('No reinicializa configuración ausente cuando ya hubo movimientos', () => {
  assert.throws(() => c.validarConfiguracionInicial(inicial({ estadoLibro: estado(true) })),
    { codigo: 'NO_REINICIALIZAR_CON_MOVIMIENTOS' });
});
test('Inicialización no abre otro período si ya existe uno', () => {
  assert.throws(() => c.validarConfiguracionInicial(inicial({ estadoLibro: estado(false, ['2026-09']) })),
    { codigo: 'PERIODO_YA_ABIERTO' });
});
test('Único período abierto y ausencia explícita de período', () => {
  assert.equal(c.validarEstadoLibro(estado(false), 'iglesia').periodoAbierto, null);
  assert.equal(c.exigirPeriodoContableAbierto(estado(true, ['2026-10']), 'iglesia', '2026-10'), '2026-10');
  assert.throws(() => c.exigirPeriodoContableAbierto(estado(true), 'iglesia', '2026-10'), { codigo: 'SIN_PERIODO_ABIERTO' });
  assert.throws(() => c.exigirPeriodoContableAbierto(estado(true, ['2026-10']), 'iglesia', '2026-09'),
    { codigo: 'PERIODO_NO_ABIERTO' });
});
for (const periodos of [['2026-09', '2026-10'], ['2026-10', '2026-10'], ['2026-13'],
  ['2026-1'], ['2026-10\n'], [null], Array(1), '2026-10', null]) {
  test(`Control de períodos inválido (${JSON.stringify(periodos)}) no autoriza apertura`, () => {
    assert.throws(() => c.validarEstadoLibro(estado(false, periodos), 'iglesia'));
  });
}
test('Contextos incompletos y booleanos ambiguos no se interpretan como libro vacío', () => {
  for (const s of [null, {}, { iglesiaId: 'iglesia', periodosAbiertos: [] },
    estado('false'), estado(0), estado(null), { ...estado(), iglesiaId: 'otra' }]) {
    assert.throws(() => c.validarConfiguracionInicial(inicial({ estadoLibro: s })));
    assert.throws(() => c.validarCambioConfiguracion(cambio({ estadoLibro: s })));
  }
});
test('Versiones antiguas/futuras o cambio de iglesia nunca pasan como migración implícita', () => {
  for (const version of [0, 2, '1', null, undefined]) {
    const p = cambio(); p.propuesta.versionEsquema = version;
    assert.throws(() => c.validarCambioConfiguracion(p), { codigo: 'VERSION_ESQUEMA_NO_SOPORTADA' });
  }
  const p = cambio(); p.propuesta.iglesiaId = 'otra';
  assert.throws(() => c.validarCambioConfiguracion(p), { codigo: 'CONFIGURACION_OTRA_IGLESIA' });
});
test('Cambio de configuración no incluye transición de período, autorización ni acceso', () => {
  const p = cambio(); p.propuesta.periodoAbierto = '2026-11';
  assert.throws(() => c.validarCambioConfiguracion(p), { codigo: 'CAMPOS_INVALIDOS' });
  const plan = c.validarConfiguracionInicial(inicial());
  assert.equal(Object.hasOwn(plan.configuracion, 'moduloHabilitado'), false);
  assert.equal(evaluarAutorizacionContable({ configuracion: plan.configuracion }).autorizado, false);
});
test('Validación repetible, sin mutación de datos y con resultados congelados', () => {
  const p = inicial(); const antes = structuredClone(p);
  const r = c.validarConfiguracionInicial(p);
  assert.deepEqual(c.validarConfiguracionInicial(p), r); assert.deepEqual(p, antes);
  assert.equal(Object.isFrozen(r), true); assert.equal(Object.isFrozen(r.configuracion), true);
  assert.equal(Object.isFrozen(r.control), true);
  const e = estado(true, ['2026-10']); const copia = structuredClone(e);
  Object.freeze(e.periodosAbiertos); Object.freeze(e);
  assert.deepEqual(c.validarEstadoLibro(e, 'iglesia'), { iglesiaId: 'iglesia', huboMovimientos: true, periodoAbierto: '2026-10' });
  assert.deepEqual(e, copia);
});
test('Configuración con getter no se ejecuta como efecto secundario', () => {
  const p = inicial(); let n = 0;
  Object.defineProperty(p.propuesta, 'moneda', { enumerable: true, get() { n++; return 'CLP'; } });
  assert.throws(() => c.validarConfiguracionInicial(p)); assert.equal(n, 0);
});
test('Primer período y referencias de iglesia estrictos', () => {
  for (const primerPeriodo of ['', '2026-00', '2026-13', '0000-01', '2026-1', null]) {
    assert.throws(() => c.validarConfiguracionInicial(inicial({ primerPeriodo })), { codigo: 'PERIODO_INVALIDO' });
  }
  for (const id of ['', ' ', 'otra/iglesia', '__reservada__', '..']) {
    assert.throws(() => c.validarConfiguracionContable(configuracion(), id), { codigo: 'IGLESIA_INVALIDA' });
  }
});
test('Plan inicial en VM sin reloj, persistencia o dependencias Firebase', () => {
  const sandbox = vm.createContext({ Buffer });
  vm.runInContext("globalThis.Date = class { constructor(){throw Error('Reloj prohibido')} static now(){throw Error('Reloj prohibido')} };", sandbox);
  function cargar(archivo, requerir) {
    sandbox.modulo = { exports: {} }; sandbox.requerir = requerir;
    const fuente = fs.readFileSync(path.join(__dirname, '../finanzas_core', archivo), 'utf8');
    vm.runInContext(`(function(module,require){${fuente}\n})(modulo,requerir)`, sandbox);
    return sandbox.modulo.exports;
  }
  const dinero = cargar('dinero.js', () => { throw Error('Dependencia prohibida'); });
  sandbox.api = cargar('configuracion.js', (n) => { assert.equal(n, './dinero'); return dinero; });
  sandbox.texto = JSON.stringify(inicial());
  assert.equal(vm.runInContext('api.validarConfiguracionInicial(JSON.parse(texto)).control.periodoAbierto', sandbox), '2026-10');
});
