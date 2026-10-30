'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('../finanzas_core/proyecciones');
const { crearIngreso, crearGasto, crearTransferencia, crearApertura, crearAjuste,
  revertirMovimiento, calcularLibro } = require('../finanzas_core/asientos');
const { prepararTransferencia, prepararAjuste, prepararReversion } = require('../finanzas_core/correcciones');
const { prepararIngreso, prepararGasto } = require('../finanzas_core/operaciones');

const C = Object.freeze({ moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
const I = 'iglesia_ficticia', P = '2026-10';
const ref = id => ({ id, moneda: 'CLP', escala: 0 });
const campos = ['saldoInicialMinor', 'saldoFinalMinor', 'ingresosNetosMinor', 'gastosNetosMinor',
  'resultadoMinor', 'aperturasNetasMinor', 'ajustesNetosMinor'];
const seleccionar = v => Object.fromEntries(campos.map(k => [k, v[k]]));
const copiar = v => structuredClone(v);
const cod = c => e => e.codigo === c;
function freeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function simple(clase, id = 'm1', montoMinor = 1000, cuentaId = 'caja', fecha = '2026-10-01') {
  return ({ ingreso: crearIngreso, gasto: crearGasto, apertura: crearApertura, ajuste: crearAjuste })[clase]({
    id, montoMinor, cuenta: ref(cuentaId), fechaContable: fecha, periodoId: fecha.slice(0, 7), configuracion: C });
}
function transferencia(id = 'm1', origen = 'caja', destino = 'banco', montoMinor = 1000, fecha = '2026-10-01') {
  return crearTransferencia({ id, origen: ref(origen), destino: ref(destino), montoMinor,
    fechaContable: fecha, periodoId: fecha.slice(0, 7), configuracion: C });
}
function entorno(periodoId = P, ids = ['caja', 'banco', 'otra']) {
  return { estado: crearProyeccionInicial({ iglesiaId: I, configuracion: C, periodoId }),
    saldos: new Map(ids.map(cuentaId => [cuentaId, crearSaldoInicial({ iglesiaId: I, cuentaId, periodoId })])),
    movimientos: [], originales: new Map(), reversiones: new Map() };
}
function entrada(h, movimiento) {
  const o = movimiento.reversaDe ? h.originales.get(movimiento.reversaDe) : null;
  return { estadoAnterior: h.estado, cuentasAnteriores: movimiento.asientos.map(a => h.saldos.get(a.cuentaId)), movimiento,
    original: o ? { movimiento: o.movimiento, revision: o.revision, reversionId: h.reversiones.get(o.movimiento.id) ?? null } : null,
    aplicacion: { revisionAnterior: h.estado.revision, revisionNueva: h.estado.revision + 1, movimientoId: movimiento.id } };
}
function aplicar(h, m) {
  const r = proyectarMovimiento(entrada(h, m));
  h.estado = r.estado; for (const s of r.cuentas) h.saldos.set(s.cuentaId, s);
  h.movimientos.push(m); h.originales.set(m.id, { movimiento: m, revision: h.estado.revision });
  if (r.controlReversion) h.reversiones.set(r.controlReversion.originalId, r.controlReversion.reversionId);
  return r;
}
function equivalente(h) {
  const cuentas = [...h.saldos.keys()].map(ref);
  const global = calcularLibro({ movimientos: h.movimientos, cuentas, configuracion: C });
  const periodo = calcularLibro({ movimientos: h.movimientos, cuentas, configuracion: C, periodoId: h.estado.periodo.periodoId });
  assert.deepEqual(h.estado.acumulado, seleccionar(global));
  assert.deepEqual(h.estado.periodo, { periodoId: periodo.periodoId, ...seleccionar(periodo) });
  for (const s of h.saldos.values()) {
    assert.equal(s.saldoMinor, global.saldoFinalPorCuenta[s.cuentaId]);
    assert.equal(s.saldoInicialPeriodoMinor, periodo.saldoInicialPorCuenta[s.cuentaId]);
    assert.equal(s.saldoFinalPeriodoMinor, periodo.saldoFinalPorCuenta[s.cuentaId]);
  }
}

test('Estado y cuenta vacios explicitos son equivalentes al libro vacio', () => {
  const h = entorno(); equivalente(h); assert.equal(h.estado.revision, 0); assert.equal(h.estado.ultimoMovimientoId, null);
  assert.ok(Object.isFrozen(h.estado)); assert.ok(Object.isFrozen(h.estado.configuracion));
  assert.ok(Object.isFrozen(h.estado.acumulado)); assert.ok(Object.isFrozen(h.estado.periodo));
  assert.ok(Object.isFrozen(h.saldos.get('caja')));
});
for (const clase of ['ingreso', 'gasto', 'apertura', 'ajuste']) test(`${clase}: operacion unica y equivalencia FIN-2`, () => {
  const h = entorno(); aplicar(h, simple(clase)); equivalente(h);
  if (clase === 'ingreso') assert.equal(h.estado.periodo.resultadoMinor, 1000);
  if (clase === 'gasto') assert.equal(h.estado.periodo.gastosNetosMinor, 1000);
  if (clase === 'apertura' || clase === 'ajuste') assert.equal(h.estado.periodo.resultadoMinor, 0);
});
for (const clase of ['ingreso', 'gasto']) test(`Secuencia ${clase}: saldo y resultado netos`, () => {
  const h = entorno(); aplicar(h, simple('apertura', 'apertura', 10000));
  for (let i = 0; i < 8; i++) { aplicar(h, simple(clase, `m_${i}`, 100)); equivalente(h); }
  assert.equal(h.estado.periodo.resultadoMinor, clase === 'ingreso' ? 800 : -800);
});
for (const delta of [1000, -1000]) test(`Ajuste ${delta} es patrimonial`, () => {
  const h = entorno(); aplicar(h, simple('apertura', 'a', 10000)); aplicar(h, simple('ajuste', 'j', delta)); equivalente(h);
  assert.equal(h.estado.periodo.ajustesNetosMinor, delta); assert.equal(h.estado.periodo.resultadoMinor, 0);
});
test('Transferencia solo devuelve las dos cuentas afectadas y conserva consolidado', () => {
  const h = entorno(); aplicar(h, simple('apertura', 'a', 10000)); const otra = h.saldos.get('otra');
  const r = aplicar(h, transferencia('t', 'caja', 'banco', 4000)); equivalente(h);
  assert.equal(r.cuentas.length, 2); assert.equal(h.saldos.get('otra'), otra);
  assert.equal(h.saldos.get('caja').saldoMinor, 6000); assert.equal(h.saldos.get('banco').saldoMinor, 4000);
  assert.equal(h.estado.periodo.saldoFinalMinor, 10000); assert.equal(h.estado.periodo.resultadoMinor, 0);
});
for (const clase of ['ingreso', 'gasto', 'transferencia']) for (const otroPeriodo of [false, true]) {
  test(`Reversion ${clase}, ${otroPeriodo ? 'otro periodo' : 'mismo periodo'}: original mas contrapartida una vez`, () => {
    const h = entorno(otroPeriodo ? '2026-11' : P); aplicar(h, simple('apertura', 'a', 10000));
    const original = clase === 'transferencia' ? transferencia('original') : simple(clase, 'original');
    aplicar(h, original);
    const fecha = otroPeriodo ? '2026-11-01' : '2026-10-02';
    const reversa = revertirMovimiento({ id: 'reversa', fechaContable: fecha, periodoId: fecha.slice(0, 7),
      original, cuentas: [...h.saldos.keys()].map(ref), configuracion: C });
    const antesOriginal = copiar(original), r = aplicar(h, reversa); equivalente(h); assert.deepEqual(original, antesOriginal);
    assert.equal(h.estado.acumulado.saldoFinalMinor, 10000); assert.equal(h.estado.acumulado.resultadoMinor, 0);
    assert.equal(r.controlReversion.originalId, 'original'); assert.equal(r.controlReversion.reversionId, 'reversa');
    if (otroPeriodo && clase === 'ingreso') assert.equal(h.estado.periodo.ingresosNetosMinor, -1000);
    if (otroPeriodo && clase === 'gasto') assert.equal(h.estado.periodo.gastosNetosMinor, -1000);
  });
}
for (const periodoId of ['2026-09', P, '2026-11']) test(`Movimiento anterior, igual o posterior al periodo consultado ${periodoId}`, () => {
  const h = entorno(periodoId); aplicar(h, simple('ingreso')); equivalente(h);
  assert.equal(h.estado.periodo.saldoInicialMinor, periodoId > P ? 1000 : 0);
  assert.equal(h.estado.periodo.saldoFinalMinor, periodoId < P ? 0 : 1000);
  assert.equal(h.estado.periodo.resultadoMinor, periodoId === P ? 1000 : 0);
});
test('Revisiones de cuentas no afectadas pueden tener huecos frente a la revision global', () => {
  const h = entorno(); aplicar(h, simple('ingreso', 'c1')); const caja = h.saldos.get('caja');
  aplicar(h, simple('ingreso', 'b1', 1000, 'banco')); assert.equal(h.saldos.get('caja'), caja);
  aplicar(h, simple('ingreso', 'c2')); equivalente(h); assert.equal(h.saldos.get('caja').revision, 3);
});
test('Entradas profundamente congeladas, salida inmutable y determinismo', () => {
  const h = entorno(), e = freeze(entrada(h, simple('ingreso'))), antes = copiar(e);
  const a = proyectarMovimiento(e), b = proyectarMovimiento(e);
  assert.deepEqual(a, b); assert.deepEqual(e, antes); assert.notEqual(a.estado, e.estadoAnterior);
  assert.notEqual(a.cuentas[0], e.cuentasAnteriores[0]); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.cuentas));
  assert.throws(() => { a.cuentas[0].saldoMinor = 20; }, TypeError);
  assert.throws(() => { a.estado.periodo.saldoFinalMinor = 20; }, TypeError);
});
test('Misma aplicacion contra estado resultante rechaza doble acumulacion', () => {
  const h = entorno(), m = simple('ingreso'), e = entrada(h, m), r = aplicar(h, m);
  const otra = { ...e, estadoAnterior: r.estado, cuentasAnteriores: r.cuentas };
  assert.throws(() => proyectarMovimiento(otra), cod('REVISION_APLICACION_NO_COINCIDE'));
  assert.throws(() => proyectarMovimiento(entrada(h, m)), cod('MOVIMIENTO_YA_APLICADO'));
});
test('Marcador de reversa observado impide otra contrapartida con revision nueva', () => {
  const h = entorno(), original = simple('ingreso', 'original'); aplicar(h, original);
  const r = id => revertirMovimiento({ id, fechaContable: '2026-10-02', periodoId: P, original, cuentas: [ref('caja')], configuracion: C });
  aplicar(h, r('r1')); assert.throws(() => proyectarMovimiento(entrada(h, r('r2'))), cod('ORIGINAL_PROYECCION_NO_ACREDITADO'));
});

for (const [nombre, cambiar] of [
  ['estado ausente', e => { e.estadoAnterior = null; }], ['campo faltante', e => { delete e.estadoAnterior.acumulado.resultadoMinor; }],
  ['campo desconocido', e => { e.estadoAnterior.secreto = 'rechazar'; }],
  ['esquema', e => { e.estadoAnterior.versionEsquema = 2; }], ['moneda', e => { e.estadoAnterior.configuracion.moneda = 'USD'; }],
  ['escala', e => { e.estadoAnterior.configuracion.escala = 2; }], ['periodo', e => { e.estadoAnterior.periodo.periodoId = '2026-13'; }],
  ['revision negativa', e => { e.estadoAnterior.revision = -1; }], ['referencia vacia', e => { e.estadoAnterior.ultimoMovimientoId = 'x'; }],
  ['estado cero con saldo', e => { e.estadoAnterior.acumulado.saldoFinalMinor = 1; }],
  ['cuenta ausente', e => { e.cuentasAnteriores = []; }], ['cuenta extra', e => { e.cuentasAnteriores.push(crearSaldoInicial({ iglesiaId: I, cuentaId: 'otra', periodoId: P })); }],
  ['otra iglesia', e => { e.cuentasAnteriores[0].iglesiaId = 'ajena'; }], ['otro periodo', e => { e.cuentasAnteriores[0].periodoId = '2026-09'; }],
  ['saldo inseguro', e => { e.cuentasAnteriores[0].saldoMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ['saldo sin historial', e => { e.cuentasAnteriores[0].saldoMinor = 1; }], ['referencia cuenta futura', e => { e.cuentasAnteriores[0].revision = 1; e.cuentasAnteriores[0].ultimoMovimientoId = 'x'; }],
  ['ID distinto', e => { e.aplicacion.movimientoId = 'otra'; }], ['revision omitida', e => { delete e.aplicacion.revisionNueva; }],
  ['salto de revision', e => { e.aplicacion.revisionNueva = 2; }], ['revision fraccionaria', e => { e.aplicacion.revisionNueva = 0.1; }],
  ['saldo arbitrario', e => { e.saldoMinor = 100000; }], ['original inesperado', e => { e.original = { movimiento: e.movimiento, revision: 1, reversionId: null }; }],
  ['movimiento ambiguo', e => { e.movimiento.asientos.push({ cuentaId: 'caja', deltaMinor: 1 }); }],
]) test(`Estado o contexto invalido: ${nombre}`, () => {
  const e = copiar(entrada(entorno(), simple('ingreso'))); cambiar(e); const antes = copiar(e);
  assert.throws(() => proyectarMovimiento(e)); assert.deepEqual(e, antes);
});
for (const [nombre, cambiar] of [
  ['resultado inconsistente', e => { e.estadoAnterior.acumulado.resultadoMinor++; }],
  ['patrimonio inconsistente', e => { e.estadoAnterior.acumulado.ajustesNetosMinor++; }],
  ['saldo inicial global', e => { e.estadoAnterior.acumulado.saldoInicialMinor = 1; }],
  ['resumen inconsistente', e => { e.estadoAnterior.periodo.saldoFinalMinor++; }],
  ['referencia de ultima cuenta', e => { e.cuentasAnteriores[0].ultimoMovimientoId = 'otra'; }],
]) test(`Estado previo no vacio incoherente: ${nombre}`, () => {
  const h = entorno(); aplicar(h, simple('ingreso', 'm1')); const e = copiar(entrada(h, simple('gasto', 'm2', 1)));
  cambiar(e); assert.throws(() => proyectarMovimiento(e));
});
for (const valor of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 0.5, '1000', -0]) test(`Entero minor invalido ${String(valor)}`, () => {
  const e = copiar(entrada(entorno(), simple('ingreso'))); e.movimiento.asientos[0].deltaMinor = valor;
  assert.throws(() => proyectarMovimiento(e));
});
for (const delta of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) test(`Limite entero exacto ${delta}`, () => {
  const h = entorno(); aplicar(h, simple('ajuste', 'limite', delta)); equivalente(h);
  assert.equal(h.saldos.get('caja').saldoMinor, delta);
  const e = entrada(h, simple('ajuste', 'desborde', Math.sign(delta)));
  assert.throws(() => proyectarMovimiento(e), cod('DESBORDAMIENTO'));
});
test('Transferencia evita desbordamiento por suma intermediaria no exacta', () => {
  const h = entorno(); aplicar(h, simple('apertura', 'a', Number.MAX_SAFE_INTEGER));
  aplicar(h, transferencia('t', 'caja', 'banco', Number.MAX_SAFE_INTEGER)); equivalente(h);
  assert.equal(h.estado.acumulado.saldoFinalMinor, Number.MAX_SAFE_INTEGER);
});
test('Desbordamiento por cuenta detectado aunque el consolidado este compensado', () => {
  const h = entorno(); aplicar(h, simple('ajuste', 'a', -1000, 'otra'));
  aplicar(h, simple('ajuste', 'b', Number.MAX_SAFE_INTEGER, 'banco')); aplicar(h, simple('ajuste', 'c', 1000, 'caja'));
  assert.equal(h.estado.acumulado.saldoFinalMinor, Number.MAX_SAFE_INTEGER);
  assert.throws(() => proyectarMovimiento(entrada(h, transferencia('t', 'caja', 'banco', 1))), cod('DESBORDAMIENTO'));
});
test('No consulta cuentas ajenas: solo exige los saldos de los asientos del movimiento', () => {
  const h = entorno(P, ['caja']); const r = aplicar(h, simple('ingreso'));
  assert.equal(r.cuentas.length, 1); equivalente(h);
});
for (const donde of ['estado', 'cuenta', 'asiento', 'elementoAsiento', 'original']) test(`No ejecuta getter en ${donde}`, () => {
  const e = copiar(entrada(entorno(), simple('ingreso'))); let ejecutado = false;
  const getter = { enumerable: true, get() { ejecutado = true; throw Error('No ejecutar'); } };
  if (donde === 'estado') Object.defineProperty(e.estadoAnterior, 'revision', getter);
  if (donde === 'cuenta') Object.defineProperty(e.cuentasAnteriores, '0', getter);
  if (donde === 'asiento') Object.defineProperty(e.movimiento.asientos, '0', getter);
  if (donde === 'elementoAsiento') Object.defineProperty(e.movimiento.asientos[0], 'deltaMinor', getter);
  if (donde === 'original') {
    e.original = { movimiento: simple('ingreso', 'o'), revision: 1, reversionId: null };
    Object.defineProperty(e.original, 'movimiento', getter);
  }
  assert.throws(() => proyectarMovimiento(e)); assert.equal(ejecutado, false);
});
for (const caso of ['faltaOriginal', 'revisionFutura', 'versionCero', 'reversionAnterior', 'contrapartidaInexacta', 'claseDistinta', 'fechaAnterior']) {
  test(`Contrapartida invalida: ${caso}`, () => {
    const h = entorno(), o = simple('ingreso', 'o'); aplicar(h, o);
    const r = revertirMovimiento({ id: 'r', original: o, fechaContable: '2026-10-02', periodoId: P, cuentas: [ref('caja')], configuracion: C });
    const e = copiar(entrada(h, r));
    if (caso === 'faltaOriginal') e.original = null;
    if (caso === 'revisionFutura') e.original.revision = 2;
    if (caso === 'versionCero') e.original.revision = 0;
    if (caso === 'reversionAnterior') e.original.reversionId = 'otra';
    if (caso === 'contrapartidaInexacta') e.movimiento.asientos[0].deltaMinor++;
    if (caso === 'claseDistinta') e.movimiento.clase = 'gasto';
    if (caso === 'fechaAnterior') e.movimiento.fechaContable = '2026-09-30';
    assert.throws(() => proyectarMovimiento(e));
  });
}
for (const clase of ['apertura', 'ajuste']) test(`Reversa de ${clase} no admitida por FIN-6`, () => {
  const h = entorno(), o = simple(clase, 'o'); aplicar(h, o);
  const r = revertirMovimiento({ id: 'r', original: o, fechaContable: '2026-10-02', periodoId: P, cuentas: [ref('caja')], configuracion: C });
  assert.throws(() => proyectarMovimiento(entrada(h, r)), cod('ORIGINAL_NO_REVERSIBLE'));
});
test('Revision maxima no permite incrementar ni generar revision insegura', () => {
  const h = entorno(); aplicar(h, simple('ingreso', 'a')); const e = copiar(entrada(h, simple('ingreso', 'b')));
  e.estadoAnterior.revision = Number.MAX_SAFE_INTEGER; e.aplicacion.revisionAnterior = Number.MAX_SAFE_INTEGER;
  e.aplicacion.revisionNueva = Number.MAX_SAFE_INTEGER; e.cuentasAnteriores[0].revision = Number.MAX_SAFE_INTEGER;
  assert.throws(() => proyectarMovimiento(e), cod('DESBORDAMIENTO'));
});
test('Misma propuesta puede recalcularse sin estado global ni confirmacion implicita', () => {
  const h = entorno(), e = entrada(h, simple('ingreso'));
  const a = proyectarMovimiento(e); const b = proyectarMovimiento(e);
  assert.deepEqual(a, b); assert.equal(e.estadoAnterior.revision, 0);
});
// Contexto sintetico valido de FIN-6. Se consume su campo movimiento real, no
// se reinventa la clasificacion ni se trata esta prueba como autorizacion remota.
function contextoFin6() {
  const version = '1700000000:1', pertenenciaId = 'a'.repeat(64);
  const perfil = { iglesiaId: I, rolGlobal: 'admin_iglesia', pertenenciaId };
  return { version, pertenenciaId, contexto: {
    autorizacion: { auth: { uid: 'admin' }, iglesiaId: I,
      perfilActor: { id: 'admin', datos: perfil }, iglesia: { id: I, datos: { adminUid: 'admin' } },
      perfilTitular: { id: 'admin', datos: perfil }, acceso: { id: 'acceso', iglesiaId: I, version,
        datos: { moduloHabilitado: true, encargadoUid: null } }, pertenenciaIdEsperada: pertenenciaId, versionAccesoEsperada: version },
    configuracion: { versionEsquema: 1, iglesiaId: I, ...C },
    estadoLibro: { iglesiaId: I, huboMovimientos: true, periodosAbiertos: [P] },
    versiones: { iglesia: version, configuracion: version, controlPeriodo: version },
    cuentas: ['caja', 'banco'].map(id => ({ version,
      cuenta: { versionEsquema: 1, id, iglesiaId: I, codigo: id.toUpperCase(), nombre: id,
        tipo: id === 'caja' ? 'caja' : 'banco', moneda: 'CLP', escala: 0, estado: 'activa' },
      estado: { iglesiaId: I, cuentaId: id, huboMovimientos: true, saldoMinor: 10000,
        aperturaRegistrada: true, solicitudesInciertas: 0 } })),
  } };
}
for (const tipo of ['transferencia', 'ajuste', 'reversion']) test(`Movimiento preparado por FIN-6 ${tipo} mantiene equivalencia`, () => {
  const h = entorno(); aplicar(h, simple('apertura', 'ac', 10000)); aplicar(h, simple('apertura', 'ab', 10000, 'banco'));
  const original = simple('ingreso', 'o'); aplicar(h, original);
  const { version, pertenenciaId, contexto } = contextoFin6();
  contexto.cuentas.forEach(c => { c.estado.saldoMinor = h.saldos.get(c.cuenta.id).saldoMinor; });
  const solicitud = { versionEsquema: 1, solicitudId: 'solicitud_ficticia_001', idMovimiento: 'preparado', iglesiaId: I,
    fechaContable: '2026-10-02', periodoId: P, precondiciones: { pertenenciaId, acceso: version,
      ...contexto.versiones, cuentas: [{ cuentaId: 'caja', version }] } };
  if (tipo === 'transferencia') {
    solicitud.precondiciones.cuentas.push({ cuentaId: 'banco', version });
    Object.assign(solicitud, { origenId: 'caja', destinoId: 'banco', montoMinor: 1000 });
  } else {
    contexto.cuentas = contexto.cuentas.slice(0, 1);
    Object.assign(solicitud, { motivo: 'Motivo ficticio', referenciaAuditoria: 'referencia' });
    if (tipo === 'ajuste') Object.assign(solicitud, { cuentaId: 'caja', deltaMinor: -1000 });
    else {
      solicitud.originalId = 'o'; solicitud.precondiciones.original = { version, versionReversion: null };
      contexto.original = { iglesiaId: I, version, estado: 'confirmado', movimiento: original,
        clasificacion: { cuentaId: 'caja', categoriaId: 'diezmos', naturaleza: 'ingreso', tipoIngreso: 'diezmos' },
        reversion: { version: null, movimientoId: null } };
    }
  }
  const plan = ({ transferencia: prepararTransferencia, ajuste: prepararAjuste, reversion: prepararReversion })[tipo]({ solicitud, contexto });
  const r = aplicar(h, plan.movimiento); equivalente(h);
  for (const s of plan.saldosPropuestos) assert.equal(r.cuentas.find(c => c.cuentaId === s.cuentaId).saldoMinor, s.nuevoMinor);
});
for (const clase of ['ingreso', 'gasto']) test(`Movimiento preparado por FIN-5 ${clase}: propuesta y proyeccion coinciden`, () => {
  const h = entorno(); aplicar(h, simple('apertura', 'a', 10000));
  const { contexto: c, version, pertenenciaId } = contextoFin6();
  const versiones = { ...c.versiones, cuenta: version, categoria: version };
  const categoria = { versionEsquema: 1, id: 'categoria', iglesiaId: I, codigo: 'CATEGORIA', nombre: 'Categoria ficticia',
    naturaleza: clase, tipoIngreso: clase === 'ingreso' ? 'diezmos' : null, estado: 'activa' };
  const solicitud = { versionEsquema: 1, solicitudId: 'solicitud_ficticia_001', idMovimiento: 'preparado', iglesiaId: I,
    cuentaId: 'caja', categoriaId: categoria.id, montoMinor: 1000, fechaContable: '2026-10-02', periodoId: P,
    precondiciones: { pertenenciaId, acceso: version, ...versiones } };
  const contexto = { autorizacion: c.autorizacion, configuracion: c.configuracion, estadoLibro: c.estadoLibro,
    cuenta: c.cuentas[0].cuenta, estadoCuenta: c.cuentas[0].estado, categoria, versiones };
  const plan = (clase === 'ingreso' ? prepararIngreso : prepararGasto)({ solicitud, contexto });
  aplicar(h, plan.movimiento); equivalente(h); assert.equal(h.saldos.get('caja').saldoMinor, plan.saldoPropuesto.nuevoMinor);
});

function aleatorio(semilla) {
  let valor = semilla >>> 0;
  return limite => { valor = (Math.imul(valor, 1664525) + 1013904223) >>> 0; return valor % limite; };
}
function secuencia(semilla, cantidad) {
  const azar = aleatorio(semilla), ids = ['caja', 'banco', 'otra'], movimientos = [], saldos = new Map(ids.map(id => [id, 100000]));
  ids.forEach(id => movimientos.push(simple('apertura', `apertura_${id}`, 100000, id, '2026-09-01')));
  const disponibles = [];
  for (let i = 0; i < cantidad; i++) {
    const fecha = `2026-${['09', '10', '11'][Math.floor(i * 3 / cantidad)]}-20`, id = `m_${i}`;
    const cuenta = ids[azar(ids.length)], tipo = azar(6), monto = 1 + azar(100);
    let m;
    if (tipo === 5 && disponibles.length) {
      const original = disponibles.splice(azar(disponibles.length), 1)[0];
      m = revertirMovimiento({ id, fechaContable: fecha, periodoId: fecha.slice(0, 7), original, cuentas: ids.map(ref), configuracion: C });
    } else if (tipo === 2) {
      const destino = ids[(ids.indexOf(cuenta) + 1 + azar(2)) % ids.length]; m = transferencia(id, cuenta, destino, monto, fecha);
    } else m = simple(tipo === 0 ? 'ingreso' : tipo === 1 ? 'gasto' : 'ajuste', id, tipo === 4 ? -monto : monto, cuenta, fecha);
    for (const a of m.asientos) saldos.set(a.cuentaId, saldos.get(a.cuentaId) + a.deltaMinor);
    assert.ok([...saldos.values()].every(v => v >= 0)); // Semillas pequenas: no sobregiro en las secuencias financieras.
    movimientos.push(m);
    if (m.reversaDe === null && ['ingreso', 'gasto', 'transferencia'].includes(m.clase)) disponibles.push(m);
  }
  return movimientos;
}
for (const semilla of [1, 73, 0x12345678, 0xdeadbeef]) for (const periodoId of ['2026-09', P, '2026-11']) {
  test(`Equivalencia por cada prefijo mixto: semilla ${semilla}, periodo ${periodoId}`, () => {
    const h = entorno(periodoId), movimientos = secuencia(semilla, 90);
    assert.deepEqual(movimientos, secuencia(semilla, 90));
    for (const m of movimientos) { aplicar(h, m); equivalente(h); }
  });
}
test('1001 movimientos puros: memoria del resultado limitada a agregado y cuentas afectadas', () => {
  const h = entorno();
  for (const m of secuencia(7, 998)) {
    const r = aplicar(h, m); assert.ok(r.cuentas.length <= 2); assert.equal(Object.hasOwn(r.estado, 'movimientos'), false);
  }
  assert.equal(h.movimientos.length, 1001); equivalente(h);
});
