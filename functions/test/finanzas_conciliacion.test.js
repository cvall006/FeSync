'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { conciliarPaginas, LIMITES } = require('../finanzas_core/conciliacion');
const { crearApertura, crearIngreso, crearGasto, crearAjuste, crearTransferencia, revertirMovimiento,
  calcularLibro } = require('../finanzas_core/asientos');

const I = 'iglesia_ficticia', C = Object.freeze({ moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
const CUENTAS = ['caja', 'banco'].map(id => ({ id, moneda: 'CLP', escala: 0 }));
const V = '1700010000:0';
const copiar = v => structuredClone(v);
const congelar = v => { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; };
function movimiento(clase, id, monto = 10, fecha = '2026-10-15') {
  const p = { id, montoMinor: monto, fechaContable: fecha, periodoId: fecha.slice(0, 7), configuracion: C };
  return clase === 'transferencia' ? crearTransferencia({ ...p, origen: CUENTAS[0], destino: CUENTAS[1] }) :
    ({ ingreso: crearIngreso, gasto: crearGasto, ajuste: crearAjuste, apertura: crearApertura })[clase]({ ...p, cuenta: CUENTAS[0] });
}
function documento(m, i) {
  const clase = m.clase;
  const clasificacion = ['ingreso', 'gasto'].includes(clase) ? { cuentaId: m.asientos[0].cuentaId,
    categoriaId: clase === 'ingreso' ? 'diezmos' : 'gastos', naturaleza: clase, tipoIngreso: clase === 'ingreso' ? 'diezmos' : null } :
    clase === 'apertura' ? { cuentaId: m.asientos[0].cuentaId, categoriaId: null, naturaleza: 'patrimonial', tipoIngreso: null } : null;
  return { id: m.id, version: `1700000000:${i}`, datos: { versionEsquema: 1, iglesiaId: I, secuencia: i,
    estado: 'confirmado', movimiento: m, clasificacion, privado: { aportante: { nombre: 'Dato ficticio privado no exportable' } } } };
}
function fixture(cantidad = 12, reversas = false) {
  const docs = [];
  if (cantidad) docs.push(documento(movimiento('apertura', 'apertura', 100000, '2026-10-01'), 1));
  for (let i = 1; i < cantidad; i++) {
    const fecha = i < cantidad / 2 ? '2026-10-15' : '2026-11-15';
    const clase = ['ingreso', 'gasto', 'transferencia', 'ajuste', 'ajuste'][i % 5];
    docs.push(documento(movimiento(clase, `m_${i}`, clase === 'ajuste' && i % 2 ? -1 : clase === 'ingreso' ? 10 : 3, fecha), i + 1));
  }
  if (reversas) for (const clase of ['ingreso', 'gasto', 'transferencia']) {
    const original = docs.find(d => d.datos.movimiento.clase === clase);
    const m = revertirMovimiento({ id: `reversa_${clase}`, original: original.datos.movimiento,
      fechaContable: '2026-11-20', periodoId: '2026-11', cuentas: CUENTAS, configuracion: C });
    docs.push(documento(m, docs.length + 1));
  }
  const control = { version: V, datos: { versionEsquema: 1, iglesiaId: I, ultimaSecuencia: docs.length,
    huboMovimientos: docs.length > 0, auxiliar: 'No exportar' } };
  const contexto = { iglesiaId: I, configuracion: C, cuentas: CUENTAS, periodos: ['2026-10', '2026-11'],
    controlInicial: control, modoLectura: 'PAUSA_EXTERNA_DECLARADA' };
  const movimientos = docs.map(d => d.datos.movimiento), global = calcularLibro({ movimientos, cuentas: CUENTAS, configuracion: C });
  const saldos = CUENTAS.map(c => {
    const toques = docs.filter(d => d.datos.movimiento.asientos.some(a => a.cuentaId === c.id));
    return { cuentaId: c.id, datos: { versionEsquema: 1, iglesiaId: I, cuentaId: c.id,
      saldoMinor: global.saldoFinalPorCuenta[c.id], huboMovimientos: toques.length > 0,
      ultimaSecuencia: toques.at(-1)?.datos.secuencia ?? 0,
      aperturaRegistrada: toques.some(d => d.datos.movimiento.clase === 'apertura'), solicitudesInciertas: 0 } };
  });
  const resumenes = contexto.periodos.map(periodoId => ({ periodoId, datos: { versionEsquema: 1, iglesiaId: I, periodoId,
    ultimaSecuencia: docs.filter(d => d.datos.movimiento.periodoId <= periodoId).at(-1)?.datos.secuencia ?? 0,
    datos: calcularLibro({ movimientos, cuentas: CUENTAS, configuracion: C, periodoId }) } }));
  const marcadores = docs.filter(d => d.datos.movimiento.reversaDe !== null).map(d => {
    const originalId = d.datos.movimiento.reversaDe, o = docs.find(x => x.id === originalId);
    return { originalId, datos: { versionEsquema: 1, iglesiaId: I, originalId, reversionId: d.id,
      versionOriginal: o.version, versionControlAnterior: null, secuencia: d.datos.secuencia } };
  });
  return copiar({ docs, contexto, control, proyecciones: { corte: { secuencia: docs.length, versionControl: V }, saldos, resumenes, marcadores } });
}
function paginas(docs, tamano = 7) {
  const r = []; for (let i = 0; i < docs.length; i += tamano) r.push(docs.slice(i, i + tamano)); return r;
}
function entrada(f, extra = {}) {
  return { contexto: f.contexto, checkpoint: null, paginas: paginas(f.docs), finDelListado: true,
    controlFinal: copiar(f.control), proyecciones: f.proyecciones, ...extra };
}
function tiene(r, codigo, nivel) { return r.reporte.incidencias.some(i => i.codigo === codigo && (!nivel || i.nivel === nivel)); }
function equivalente(f, r) {
  const movimientos = f.docs.map(d => d.datos.movimiento);
  assert.deepEqual(r.reporte.reconstruccion.global, calcularLibro({ movimientos, cuentas: CUENTAS, configuracion: C }));
  for (const p of r.reporte.reconstruccion.periodos) assert.deepEqual(p,
    calcularLibro({ movimientos, cuentas: CUENTAS, configuracion: C, periodoId: p.periodoId }));
}

for (const cantidad of [0, 1, 3, 201, 1001, 10000]) test(`Libro ficticio ${cantidad}: paginas, equivalencia y corte declarado`, () => {
  const f = fixture(cantidad), r = conciliarPaginas(entrada(f, { paginas: paginas(f.docs, 500) }));
  assert.equal(r.reporte.estado, 'SIN_DIFERENCIAS_OBSERVADAS'); assert.equal(r.reporte.completoHastaCorte, true);
  assert.equal(r.reporte.certificacionHistorica, false); assert.equal(r.checkpoint.documentos.length, cantidad); equivalente(f, r);
});
test('Cambiar particion de paginas no cambia reporte, checkpoint ni orden', () => {
  const f = fixture(35, true), a = conciliarPaginas(entrada(f));
  for (const tamano of [1, 3, 11, 100]) assert.deepEqual(conciliarPaginas(entrada(f, { paginas: paginas(f.docs, tamano) })), a);
  equivalente(f, a);
});
test('Reanudar checkpoint JSON validado reconstruye prefijo sin doble suma', () => {
  const f = fixture(35, true), a = conciliarPaginas(entrada(f, { paginas: paginas(f.docs.slice(0, 15)), finDelListado: false, proyecciones: null, controlFinal: null }));
  assert.equal(a.reporte.completoHastaCorte, false); assert.equal(a.checkpoint.cursor.secuencia, 15);
  const b = conciliarPaginas(entrada(f, { checkpoint: JSON.parse(JSON.stringify(a.checkpoint)), paginas: paginas(f.docs.slice(15)) }));
  assert.deepEqual(b, conciliarPaginas(entrada(f))); equivalente(f, b);
});
for (const [nombre, cambiar] of [
  ['otra iglesia', cp => { cp.contexto.iglesiaId = 'otra'; }], ['version', cp => { cp.versionAlgoritmo = 2; }],
  ['cursor', cp => { cp.cursor.secuencia++; }], ['rango', cp => { cp.rango.hasta++; }],
  ['saldo', cp => { cp.reconstruccion.global.saldoFinalMinor++; }],
  ['movimiento', cp => { cp.documentos[1].movimiento.asientos[0].deltaMinor--; }],
  ['duplicado', cp => { cp.documentos.push(cp.documentos[0]); }], ['campo extra', cp => { cp.token = 'no-admitir'; }],
]) test(`Checkpoint alterado ${nombre}: rechazo sin acumulacion`, () => {
  const f = fixture(), cp = copiar(conciliarPaginas(entrada(f, { paginas: [f.docs.slice(0, 5)], finDelListado: false })).checkpoint);
  cambiar(cp); const antes = copiar(cp); assert.throws(() => conciliarPaginas(entrada(f, { checkpoint: cp, paginas: [f.docs.slice(5)] })));
  assert.deepEqual(cp, antes);
});
for (const caso of ['omitida', 'duplicada', 'idDuplicado', 'paginaRepetida', 'fueraDeOrden', 'posteriorAlCorte']) test(`Secuencia ${caso}: divergencia y prefijo sin doble aplicacion`, () => {
  const f = fixture(), e = copiar(entrada(f));
  const p = f.docs;
  if (caso === 'omitida') e.paginas = [[p[0], ...p.slice(2)]];
  if (caso === 'duplicada') e.paginas = [[p[0], p[0], ...p.slice(1)]];
  if (caso === 'idDuplicado') { e.paginas = [copiar(p)]; e.paginas[0][1].id = p[0].id; e.paginas[0][1].datos.movimiento.id = p[0].id; }
  if (caso === 'paginaRepetida') e.paginas = [p.slice(0, 3), p.slice(0, 3)];
  if (caso === 'fueraDeOrden') e.paginas = [[p[1], p[0], ...p.slice(2)]];
  if (caso === 'posteriorAlCorte') { e.paginas = [p]; e.contexto.controlInicial.datos.ultimaSecuencia = 2; }
  const r = conciliarPaginas(e); assert.equal(r.reporte.estado, 'DIVERGENCIAS'); assert.equal(r.reporte.completoHastaCorte, false);
  assert.equal(r.checkpoint.documentos.length, caso === 'paginaRepetida' ? 3 : caso === 'fueraDeOrden' ? 0 : caso === 'posteriorAlCorte' ? 2 : 1);
});
for (const [nombre, cambiar, codigo] of [
  ['transferencia desbalanceada', f => { f.docs.find(d => d.datos.movimiento.clase === 'transferencia').datos.movimiento.asientos[0].deltaMinor--; }, 'TRANSFERENCIA_DESBALANCEADA'],
  ['valor inseguro', f => { f.docs[1].datos.movimiento.asientos[0].deltaMinor = Number.MAX_SAFE_INTEGER + 1; }, 'ENTERO_MINOR_INVALIDO'],
  ['otra iglesia', f => { f.docs[1].datos.iglesiaId = 'otra'; }, 'DOCUMENTO_HISTORICO_INCOHERENTE'],
  ['incierto', f => { f.docs[1].datos.estado = 'incierto'; }, 'DOCUMENTO_HISTORICO_INCOHERENTE'],
  ['clasificacion', f => { f.docs[1].datos.clasificacion.naturaleza = 'ingreso'; }, 'CLASIFICACION_INCOHERENTE'],
  ['cuenta inexistente', f => { f.docs[1].datos.movimiento.asientos[0].cuentaId = 'ausente'; }, 'CUENTA_NO_ENCONTRADA'],
]) test(`Documento incoherente ${nombre}: diagnostico confirmado`, () => {
  const f = fixture(); cambiar(f); const r = conciliarPaginas(entrada(f));
  assert.ok(tiene(r, codigo, 'INCONSISTENCIA')); assert.equal(r.reporte.certificacionHistorica, false);
});
test('Movimiento modificado coherente localmente: diferencia detectable contra proyeccion', () => {
  const f = fixture(); f.docs.find(d => d.datos.movimiento.clase === 'ingreso').datos.movimiento.asientos[0].deltaMinor++;
  const r = conciliarPaginas(entrada(f)); assert.equal(r.reporte.completoHastaCorte, true); assert.ok(tiene(r, 'PROYECCION_DIFIERE'));
});
for (const campo of ['saldoMinor', 'ultimaSecuencia', 'aperturaRegistrada', 'huboMovimientos']) test(`Proyeccion de cuenta corrupta: ${campo}`, () => {
  const f = fixture(); const d = f.proyecciones.saldos[0].datos; d[campo] = typeof d[campo] === 'number' ? d[campo] + 1 : !d[campo];
  const r = conciliarPaginas(entrada(f)); assert.ok(tiene(r, 'PROYECCION_DIFIERE')); assert.equal(r.reporte.estado, 'DIVERGENCIAS');
});
for (const campo of ['saldoInicialMinor', 'saldoFinalMinor', 'resultadoMinor', 'ingresosNetosMinor', 'gastosNetosMinor', 'ajustesNetosMinor']) {
  test(`Resumen corrupto: ${campo}`, () => {
    const f = fixture(); f.proyecciones.resumenes[0].datos.datos[campo]++;
    assert.ok(tiene(conciliarPaginas(entrada(f)), 'PROYECCION_DIFIERE'));
  });
}
for (const campo of ['reversionId', 'versionOriginal', 'iglesiaId', 'secuencia', 'originalId', 'versionControlAnterior']) {
  test(`Marcador incoherente: ${campo}`, () => {
    const f = fixture(12, true); f.proyecciones.marcadores[0].datos[campo] = campo === 'secuencia' ? 500 : 'incoherente';
    assert.ok(tiene(conciliarPaginas(entrada(f)), 'MARCADOR_REVERSION_INCOHERENTE'));
  });
}
test('Reversas entre paginas y meses coinciden con FIN-2', () => {
  const f = fixture(12, true), r = conciliarPaginas(entrada(f, { paginas: paginas(f.docs, 1) })); equivalente(f, r);
  assert.equal(r.reporte.estado, 'SIN_DIFERENCIAS_OBSERVADAS');
});
test('Doble reversa con ID distinto es divergencia aunque las sumas parezcan validas', () => {
  const f = fixture(12, true), anterior = f.docs.at(-1), extra = copiar(anterior);
  extra.id = 'segunda'; extra.datos.movimiento.id = extra.id; extra.datos.secuencia = f.docs.length + 1;
  f.docs.push(extra); f.contexto.controlInicial.datos.ultimaSecuencia = f.docs.length;
  const r = conciliarPaginas(entrada(f)); assert.ok(tiene(r, 'REVERSA_DUPLICADA'));
});
test('Referencia de original incompatible rechazada sin inventar contrapartida', () => {
  const f = fixture(12, true); f.docs.at(-1).datos.movimiento.reversaDe = 'inexistente';
  assert.ok(tiene(conciliarPaginas(entrada(f)), 'REVERSA_HUERFANA'));
});
test('Original y contrapartida deben conservar clasificacion', () => {
  const f = fixture(12, true); f.docs.find(d => d.id === 'reversa_ingreso').datos.clasificacion.tipoIngreso = 'ofrendas';
  assert.ok(tiene(conciliarPaginas(entrada(f)), 'CLASIFICACION_REVERSA_DISTINTA'));
});
test('Clasificacion ausente V1 permite reconstruir pero no se inventa evidencia', () => {
  const f = fixture(); delete f.docs[0].datos.clasificacion; const r = conciliarPaginas(entrada(f)); equivalente(f, r);
  assert.ok(tiene(r, 'CLASIFICACION_AUSENTE', 'DATOS_INSUFICIENTES')); assert.equal(r.reporte.estado, 'DATOS_INSUFICIENTES');
});
for (const caso of ['sinProyecciones', 'sinControlFinal', 'controlCambiado', 'otroCorte', 'sinPaginas', 'finNoConfirmado', 'bestEffort', 'sinMarcadores']) {
  test(`Datos insuficientes o consistencia no demostrada: ${caso}`, () => {
    const f = fixture(12, true), e = copiar(entrada(f));
    if (caso === 'sinProyecciones') e.proyecciones = null;
    if (caso === 'sinControlFinal') e.controlFinal = null;
    if (caso === 'controlCambiado') e.controlFinal.version = '1700010001:0';
    if (caso === 'otroCorte') e.proyecciones.corte.secuencia++;
    if (caso === 'sinPaginas') e.paginas = [];
    if (caso === 'finNoConfirmado') e.finDelListado = false;
    if (caso === 'bestEffort') e.contexto.modoLectura = 'BEST_EFFORT';
    if (caso === 'sinMarcadores') e.proyecciones.marcadores = null;
    const r = conciliarPaginas(e); assert.equal(r.reporte.estado, 'DATOS_INSUFICIENTES'); assert.equal(r.reporte.certificacionHistorica, false);
    if (caso === 'controlCambiado' || caso === 'otroCorte') assert.equal(tiene(r, 'PROYECCION_DIFIERE'), false);
    if (caso === 'controlCambiado') assert.equal(r.reporte.consistencia.controlSinCambios, false);
  });
}
test('Marcador ausente en listado completo frente a marcador no observado', () => {
  const f = fixture(12, true); f.proyecciones.marcadores = [];
  assert.ok(tiene(conciliarPaginas(entrada(f)), 'MARCADOR_REVERSION_AUSENTE', 'INCONSISTENCIA'));
});
test('Entradas congeladas, reporte determinista y datos privados excluidos de checkpoint', () => {
  const e = congelar(entrada(fixture(12, true))), antes = copiar(e), a = conciliarPaginas(e), b = conciliarPaginas(e);
  assert.deepEqual(a, b); assert.deepEqual(e, antes);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.checkpoint.documentos[0].movimiento.asientos));
  assert.equal(JSON.stringify(a).includes('Dato ficticio privado no exportable'), false);
  assert.equal(Object.hasOwn(a.checkpoint, 'hash'), false);
  assert.throws(() => { a.checkpoint.cursor.secuencia = 80; }, TypeError);
});
test('Checkpoint con getter se rechaza sin ejecutar codigo proporcionado', () => {
  const f = fixture(), cp = copiar(conciliarPaginas(entrada(f)).checkpoint); let ejecutado = false;
  Object.defineProperty(cp.reconstruccion.global, 'saldoFinalMinor', { enumerable: true, get() { ejecutado = true; return 0; } });
  assert.throws(() => conciliarPaginas(entrada(f, { checkpoint: cp, paginas: [] }))); assert.equal(ejecutado, false);
});
test('Limites del conciliador son independientes; no retirar limites del adaptador', () => {
  assert.ok(LIMITES.documentos >= 10000); const f = fixture();
  assert.throws(() => conciliarPaginas(entrada(f, { paginas: [Array(LIMITES.pagina + 1).fill(f.docs[0])] })));
});
test('Entrada mutable conserva valores, referencias y estado de congelacion', () => {
  const e = entrada(fixture(12, true)), antes = copiar(e), movimiento = e.paginas[0][0].datos.movimiento;
  conciliarPaginas(e); assert.deepEqual(e, antes); assert.equal(e.paginas[0][0].datos.movimiento, movimiento);
  assert.equal(Object.isFrozen(movimiento), false); assert.equal(Object.isFrozen(e.contexto), false);
});
test('Version de snapshot ausente no se inventa ni se confunde con importe corrupto', () => {
  const f = fixture(); delete f.docs[1].version; const r = conciliarPaginas(entrada(f));
  assert.ok(tiene(r, 'VERSION_OBSERVACION_AUSENTE', 'DATOS_INSUFICIENTES'));
  assert.equal(r.reporte.estado, 'DATOS_INSUFICIENTES'); assert.equal(r.reporte.completoHastaCorte, false);
});
test('Resumen legado sin cuenta futura: informacion insuficiente, no suma cero inventada', () => {
  const f = fixture(); delete f.proyecciones.resumenes[0].datos.datos.saldoFinalPorCuenta.banco;
  const r = conciliarPaginas(entrada(f)); assert.ok(tiene(r, 'CAMPO_PROYECCION_AUSENTE', 'DATOS_INSUFICIENTES'));
  assert.equal(r.reporte.estado, 'DATOS_INSUFICIENTES');
});
test('Marcador huerfano en observacion completa se distingue de ausencia de observacion', () => {
  const f = fixture(); f.proyecciones.marcadores.push({ originalId: 'inexistente', datos: { reversionId: 'sin_original' } });
  assert.ok(tiene(conciliarPaginas(entrada(f)), 'MARCADOR_SIN_REVERSA', 'INCONSISTENCIA'));
});
test('Una pagina vacia no demuestra fin ni oculta una cola omitida', () => {
  const f = fixture(); const r = conciliarPaginas(entrada(f, { paginas: [[]], finDelListado: true }));
  assert.equal(r.reporte.completoHastaCorte, false); assert.equal(r.checkpoint.cursor, null);
  assert.ok(tiene(r, 'PAGINAS_PENDIENTES_O_INVALIDAS'));
});
test('Observacion de proyecciones de otro corte no se compara aunque tenga saldos absurdos', () => {
  const f = fixture(); f.proyecciones.corte.versionControl = '1700010001:0'; f.proyecciones.saldos[0].datos.saldoMinor = -9999;
  const r = conciliarPaginas(entrada(f)); assert.ok(tiene(r, 'PROYECCIONES_OTRO_CORTE')); assert.equal(tiene(r, 'PROYECCION_DIFIERE'), false);
});
