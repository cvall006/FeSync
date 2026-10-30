'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../finanzas_core/correcciones');
const a = require('../finanzas_core/asientos');
const V = '1700000000:123456789';
const W = '1700000000:123456790';
const funciones = { transferencia: c.prepararTransferencia, reversion: c.prepararReversion, ajuste: c.prepararAjuste };
const ref = id => ({ id, moneda: 'CLP', escala: 0 });
function cuenta(id, saldoMinor) {
  return { version: V, cuenta: { versionEsquema: 1, id, iglesiaId: 'iglesia', codigo: id.toUpperCase(),
    nombre: id, tipo: id === 'caja' ? 'caja' : 'banco', moneda: 'CLP', escala: 0, estado: 'activa' },
  estado: { iglesiaId: 'iglesia', cuentaId: id, huboMovimientos: true, saldoMinor,
    solicitudesInciertas: 0, aperturaRegistrada: false } };
}
function entrada(tipo = 'transferencia', claseOriginal = 'ingreso', uid = 'admin') {
  const titular = { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'a'.repeat(64) };
  const cuentas = tipo === 'transferencia' || claseOriginal === 'transferencia' ?
    [cuenta('caja', 30000), cuenta('banco', 10000)] : [cuenta('caja', 30000)];
  const versiones = { iglesia: V, configuracion: V, controlPeriodo: V };
  const s = { versionEsquema: 1, solicitudId: 's'.repeat(32), idMovimiento: 'nuevo', iglesiaId: 'iglesia',
    fechaContable: '2026-10-17', periodoId: '2026-10', precondiciones: {
      pertenenciaId: 'a'.repeat(64), acceso: V, ...versiones,
      cuentas: cuentas.map(x => ({ cuentaId: x.cuenta.id, version: V })) } };
  const contexto = { autorizacion: { auth: { uid }, iglesiaId: 'iglesia',
    perfilActor: { id: uid, datos: uid === 'admin' ? { ...titular } :
      { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'a'.repeat(64) } },
    iglesia: { id: 'iglesia', datos: { adminUid: 'admin' } }, perfilTitular: { id: 'admin', datos: titular },
    acceso: { id: 'acceso', iglesiaId: 'iglesia', version: V, datos: { moduloHabilitado: true, encargadoUid: 'encargado' } },
    pertenenciaIdEsperada: 'a'.repeat(64), versionAccesoEsperada: V },
  configuracion: { versionEsquema: 1, iglesiaId: 'iglesia', moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
  estadoLibro: { iglesiaId: 'iglesia', huboMovimientos: true, periodosAbiertos: ['2026-10'] }, versiones, cuentas };
  if (tipo === 'transferencia') Object.assign(s, { origenId: 'caja', destinoId: 'banco', montoMinor: 4000 });
  else {
    Object.assign(s, { motivo: 'Corrección ficticia documentada', referenciaAuditoria: 'auditoria-original' });
    if (tipo === 'ajuste') Object.assign(s, { cuentaId: 'caja', deltaMinor: 1000 });
    else {
      s.originalId = 'original'; s.precondiciones.original = { version: V, versionReversion: null };
      const p = { id: 'original', fechaContable: '2026-09-10', periodoId: '2026-09', cuenta: ref('caja'), montoMinor: 4000 };
      const movimiento = claseOriginal === 'transferencia' ? a.crearTransferencia({ id: p.id,
        fechaContable: p.fechaContable, periodoId: p.periodoId, origen: ref('caja'), destino: ref('banco'), montoMinor: 4000 }) :
        ({ ingreso: a.crearIngreso, gasto: a.crearGasto, apertura: a.crearApertura, ajuste: a.crearAjuste })[claseOriginal](p);
      contexto.original = { iglesiaId: 'iglesia', version: V, estado: 'confirmado', movimiento,
        clasificacion: claseOriginal === 'transferencia' ? null : { cuentaId: 'caja', categoriaId: 'categoria-original',
          naturaleza: claseOriginal, tipoIngreso: claseOriginal === 'ingreso' ? 'diezmos' : null },
        reversion: { version: null, movimientoId: null } };
    }
  }
  return { solicitud: s, contexto };
}
function congelar(v) { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; }

for (const origen of ['caja', 'banco']) test(`Transferencia ${origen} a otra cuenta: dos asientos, suma cero`, () => {
  const p = entrada(); p.solicitud.origenId = origen; p.solicitud.destinoId = origen === 'caja' ? 'banco' : 'caja';
  const r = c.prepararTransferencia(p);
  assert.equal(r.movimiento.clase, 'transferencia'); assert.equal(r.clasificacion, null);
  assert.equal(r.movimiento.asientos.length, 2); assert.equal(r.movimiento.asientos[0].deltaMinor, -4000);
  assert.equal(r.movimiento.asientos.reduce((n, x) => n + x.deltaMinor, 0), 0);
  assert.equal(r.saldosPropuestos.reduce((n, x) => n + BigInt(x.nuevoMinor) - BigInt(x.anteriorMinor), 0n), 0n);
  const libro = a.calcularLibro({ movimientos: [r.movimiento], cuentas: [ref('caja'), ref('banco')] });
  assert.equal(libro.resultadoMinor, 0); assert.equal(libro.ingresosNetosMinor, 0); assert.equal(libro.gastosNetosMinor, 0);
});
for (const [nombre, modificar] of [
  ['misma cuenta', p => { p.solicitud.destinoId = 'caja'; }],
  ['origen desconocido', p => { p.solicitud.origenId = 'otro'; }],
  ['saldo insuficiente', p => { p.contexto.cuentas[0].estado.saldoMinor = 3999; }],
  ['saldo negativo', p => { p.contexto.cuentas[0].estado.saldoMinor = -1; }],
  ['cuenta origen archivada', p => { p.contexto.cuentas[0].cuenta.estado = 'archivada'; }],
  ['cuenta destino archivada', p => { p.contexto.cuentas[1].cuenta.estado = 'archivada'; }],
  ['otra iglesia', p => { p.contexto.cuentas[1].cuenta.iglesiaId = 'otra'; }],
  ['otra moneda', p => { p.contexto.cuentas[1].cuenta.moneda = 'USD'; }],
  ['destino desborda', p => { p.contexto.cuentas[1].estado.saldoMinor = Number.MAX_SAFE_INTEGER; }],
  ['cuenta repetida', p => { p.contexto.cuentas[1] = p.contexto.cuentas[0]; }],
  ['precondición duplicada', p => { p.solicitud.precondiciones.cuentas[1] = p.solicitud.precondiciones.cuentas[0]; }],
]) test(`Transferencia rechaza ${nombre}`, () => {
  const p = entrada(); modificar(p); assert.throws(() => c.prepararTransferencia(p));
});
test('Transferencia del saldo completo y límites exactos', () => {
  const p = entrada(); p.solicitud.montoMinor = 30000;
  assert.equal(c.prepararTransferencia(p).saldosPropuestos[0].nuevoMinor, 0);
  p.solicitud.montoMinor = Number.MAX_SAFE_INTEGER; p.contexto.cuentas[0].estado.saldoMinor = Number.MAX_SAFE_INTEGER;
  p.contexto.cuentas[1].estado.saldoMinor = 0;
  assert.equal(c.prepararTransferencia(p).saldosPropuestos[1].nuevoMinor, Number.MAX_SAFE_INTEGER);
});
for (const [i, monto] of [0, -0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '4000', null].entries()) {
  test(`Monto de transferencia inválido ${i}`, () => {
    const p = entrada(); p.solicitud.montoMinor = monto; assert.throws(() => c.prepararTransferencia(p));
  });
}
for (const clase of ['ingreso', 'gasto', 'transferencia']) test(`Reversión exacta de ${clase}, preservando original y clasificación`, () => {
  const p = entrada('reversion', clase); const antes = structuredClone(p); const r = c.prepararReversion(p);
  assert.equal(r.movimiento.reversaDe, 'original'); assert.equal(r.movimiento.clase, clase);
  assert.equal(r.tipoOperacion, 'reversion'); assert.deepEqual(r.clasificacion, p.contexto.original.clasificacion);
  for (const x of p.contexto.original.movimiento.asientos) {
    assert.equal(r.movimiento.asientos.find(y => y.cuentaId === x.cuentaId).deltaMinor, -x.deltaMinor);
  }
  const libro = a.calcularLibro({ movimientos: [p.contexto.original.movimiento, r.movimiento],
    cuentas: p.contexto.cuentas.map(x => ref(x.cuenta.id)) });
  assert.equal(libro.resultadoMinor, 0); assert.equal(libro.saldoFinalMinor, 0);
  assert.deepEqual(p, antes); assert.equal(r.controlReversion.reversionId, 'nuevo');
});
test('Original cerrado se revierte solo con contrapartida en mes abierto, sin reescribir septiembre', () => {
  const p = entrada('reversion'); const r = c.prepararReversion(p);
  const septiembre = a.calcularLibro({ movimientos: [p.contexto.original.movimiento, r.movimiento],
    cuentas: [ref('caja')], periodoId: '2026-09' });
  const octubre = a.calcularLibro({ movimientos: [p.contexto.original.movimiento, r.movimiento],
    cuentas: [ref('caja')], periodoId: '2026-10' });
  assert.equal(septiembre.ingresosNetosMinor, 4000); assert.equal(octubre.ingresosNetosMinor, -4000);
  p.solicitud.fechaContable = '2026-09-10'; p.solicitud.periodoId = '2026-09';
  assert.throws(() => c.prepararReversion(p));
});
test('Doble reversión y respuestas inciertas no crean una excepción de idempotencia', () => {
  const p = entrada('reversion'); const r = c.prepararReversion(p);
  // Sin persistencia, la misma observación todavía genera la misma propuesta.
  assert.deepEqual(c.prepararReversion(p), r);
  p.contexto.original.reversion = { version: W, movimientoId: 'ya-revertido' };
  assert.throws(() => c.prepararReversion(p)); p.solicitud.precondiciones.original.versionReversion = W;
  assert.throws(() => c.prepararReversion(p));
});
for (const [nombre, modificar] of [
  ['ausente', p => { p.contexto.original = null; }],
  ['incierto', p => { p.contexto.original.estado = 'incierto'; }],
  ['revertido', p => { p.contexto.original.estado = 'revertido'; }],
  ['otra iglesia', p => { p.contexto.original.iglesiaId = 'otra'; }],
  ['versión modificada', p => { p.contexto.original.version = W; }],
  ['control modificado', p => { p.contexto.original.reversion.version = W; }],
  ['ID original distinto', p => { p.solicitud.originalId = 'otro'; }],
  ['autorrevierte', p => { p.solicitud.idMovimiento = 'original'; }],
  ['signo original incoherente', p => { p.contexto.original.movimiento.asientos[0].deltaMinor = -4000; }],
  ['otra cuenta histórica', p => { p.contexto.original.movimiento.asientos[0].cuentaId = 'otra'; }],
  ['categoría ausente', p => { p.contexto.original.clasificacion = null; }],
  ['naturaleza histórica falsa', p => { p.contexto.original.clasificacion.naturaleza = 'gasto'; }],
  ['historial inexistente', p => { p.contexto.cuentas[0].estado.huboMovimientos = false; p.contexto.cuentas[0].estado.saldoMinor = 0; }],
  ['sobregiro de reversa de ingreso', p => { p.contexto.cuentas[0].estado.saldoMinor = 3999; }],
  ['cuenta archivada', p => { p.contexto.cuentas[0].cuenta.estado = 'archivada'; }],
  ['fecha anterior al original', p => { p.solicitud.fechaContable = '2026-08-10'; p.solicitud.periodoId = '2026-08'; p.contexto.estadoLibro.periodosAbiertos = ['2026-08']; }],
  ['reversa de reversa', p => { p.contexto.original.movimiento.reversaDe = 'anterior'; }],
]) test(`Reversión rechaza original ${nombre}`, () => {
  const p = structuredClone(entrada('reversion')); modificar(p); assert.throws(() => c.prepararReversion(p));
});
test('Reversión de transferencia exige fondos en el destino original y no admite desbalance', () => {
  const p = structuredClone(entrada('reversion', 'transferencia')); p.contexto.cuentas[1].estado.saldoMinor = 3999;
  assert.throws(() => c.prepararReversion(p), { codigo: 'SALDO_INSUFICIENTE' });
  p.contexto.cuentas[1].estado.saldoMinor = 10000; p.contexto.original.movimiento.asientos[1].deltaMinor = 3999;
  assert.throws(() => c.prepararReversion(p), { codigo: 'TRANSFERENCIA_DESBALANCEADA' });
});
for (const clase of ['apertura', 'ajuste']) test(`Reversión de ${clase} no implementada en V1`, () => {
  assert.throws(() => c.prepararReversion(entrada('reversion', clase)), { codigo: 'ORIGINAL_NO_REVERSIBLE' });
});
for (const deltaMinor of [1000, -1000, -30000]) test(`Ajuste excepcional ${deltaMinor}, separado de ingresos y gastos`, () => {
  const p = entrada('ajuste'); p.solicitud.deltaMinor = deltaMinor; const r = c.prepararAjuste(p);
  assert.equal(r.movimiento.clase, 'ajuste'); assert.equal(r.movimiento.asientos[0].deltaMinor, deltaMinor);
  assert.equal(r.clasificacion, null); assert.equal(r.motivo, p.solicitud.motivo);
  assert.equal(r.referenciaAuditoria, p.solicitud.referenciaAuditoria);
  const libro = a.calcularLibro({ movimientos: [r.movimiento], cuentas: [ref('caja')] });
  assert.equal(libro.ingresosNetosMinor, 0); assert.equal(libro.gastosNetosMinor, 0);
  assert.equal(libro.ajustesNetosMinor, deltaMinor);
});
for (const [i, delta] of [0, -0, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null, -30001].entries()) {
  test(`Ajuste rechaza delta inválido o sobregiro ${i}`, () => {
    const p = entrada('ajuste'); p.solicitud.deltaMinor = delta; assert.throws(() => c.prepararAjuste(p));
  });
}
test('Créditos de ajuste/reversión rechazan desbordamiento de saldo', () => {
  for (const tipo of ['ajuste', 'reversion']) {
    const p = entrada(tipo, 'gasto'); p.contexto.cuentas[0].estado.saldoMinor = Number.MAX_SAFE_INTEGER;
    assert.throws(() => funciones[tipo](p), { codigo: 'DESBORDAMIENTO' });
  }
});
for (const tipo of ['ajuste', 'reversion']) {
  test(`${tipo} requiere motivo y referencia explícitos y acotados`, () => {
    for (const motivo of [undefined, '', ' ', ' x', 'x\n', 'x'.repeat(241), 'x\u200b', null]) {
      const p = entrada(tipo); p.solicitud.motivo = motivo; assert.throws(() => funciones[tipo](p));
    }
    const p = entrada(tipo); delete p.solicitud.referenciaAuditoria; assert.throws(() => funciones[tipo](p));
  });
}
test('Encargado vigente transfiere pero no puede revertir ni ajustar', () => {
  assert.equal(c.prepararTransferencia(entrada('transferencia', 'ingreso', 'encargado')).responsable.uid, 'encargado');
  for (const tipo of ['ajuste', 'reversion']) assert.throws(() => funciones[tipo](entrada(tipo, 'ingreso', 'encargado')),
    { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
});
for (const tipo of Object.keys(funciones)) {
  for (const [nombre, modificar] of [
    ['módulo apagado', a => { a.acceso.datos.moduloHabilitado = false; }],
    ['sin sesión', a => { a.auth = null; }],
    ['iglesia ajena', a => { a.perfilActor.datos.iglesiaId = 'otra'; }],
    ['pertenencia anterior', a => { a.perfilActor.datos.pertenenciaId = 'b'.repeat(64); }],
    ['transferencia de titularidad', a => { a.iglesia.datos.adminUid = 'nuevo'; a.perfilTitular.id = 'nuevo'; }],
  ]) test(`${tipo} deniega ${nombre}`, () => {
    const p = entrada(tipo); modificar(p.contexto.autorizacion);
    assert.throws(() => funciones[tipo](p), { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
  });
  test(`${tipo} rechaza encargado revocado y datos de actor suministrados como autoridad`, () => {
    const p = entrada(tipo, 'ingreso', 'encargado'); p.contexto.autorizacion.acceso.datos.encargadoUid = null;
    assert.throws(() => funciones[tipo](p));
    const q = entrada(tipo); q.solicitud.actorUid = 'admin'; assert.throws(() => funciones[tipo](q));
  });
  for (const [nombre, modificar] of [
    ['período cerrado', p => { p.contexto.estadoLibro.periodosAbiertos = []; }],
    ['fecha imposible', p => { p.solicitud.fechaContable = '2026-02-30'; }],
    ['fecha fuera del período', p => { p.solicitud.fechaContable = '2026-11-01'; }],
    ['período inválido', p => { p.solicitud.periodoId = '2026-13'; }],
    ['versión de iglesia antigua', p => { p.contexto.versiones.iglesia = W; }],
    ['versión de cuenta antigua', p => { p.contexto.cuentas[0].version = W; }],
    ['cuenta con incertidumbre', p => { p.contexto.cuentas[0].estado.solicitudesInciertas = 1; }],
    ['sin cuentas', p => { p.contexto.cuentas = []; }],
    ['configuración incompleta', p => { p.contexto.configuracion = {}; }],
  ]) test(`${tipo} rechaza ${nombre}`, () => {
    const p = entrada(tipo); modificar(p); assert.throws(() => funciones[tipo](p));
  });
  test(`${tipo} exige campos completos, esquema y solicitud sin datos inventados`, () => {
    for (const nivel of ['solicitud', 'contexto']) for (const k of Object.keys(entrada(tipo)[nivel])) {
      const p = entrada(tipo); delete p[nivel][k]; assert.throws(() => funciones[tipo](p));
    }
    for (const extra of [{ versionEsquema: 2 }, { solicitudId: 'x'.repeat(15) }, { saldoMinor: 100 },
      { categoriaId: 'sustituida' }, { timestamp: 123 }, { montoOriginal: 1 }]) {
      const p = entrada(tipo); Object.assign(p.solicitud, extra); assert.throws(() => funciones[tipo](p));
    }
  });
  test(`${tipo} mantiene todas las entradas y congela profundamente la propuesta`, () => {
    const p = entrada(tipo), antes = structuredClone(p); congelar(p); const r = funciones[tipo](p);
    assert.deepEqual(p, antes); assert.deepEqual(r, funciones[tipo](p));
    function revisar(v) { if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(revisar); } }
    revisar(r); assert.equal(r.movimiento.id, 'nuevo'); assert.equal(r.solicitudId, p.solicitud.solicitudId);
    assert.equal(Object.hasOwn(r, 'timestamp'), false);
  });
}
test('Guardas de versión estrictas y originales sin getters ejecutados', () => {
  for (const v of ['1:1000000000', '01:0', '1:00', '1:0\n', null]) {
    const p = entrada(); p.solicitud.precondiciones.iglesia = p.contexto.versiones.iglesia = v;
    assert.throws(() => c.prepararTransferencia(p));
  }
  let llamadas = 0; const p = entrada('reversion');
  Object.defineProperty(p.contexto.original, 'estado', { enumerable: true, get() { llamadas++; return 'confirmado'; } });
  assert.throws(() => c.prepararReversion(p)); assert.equal(llamadas, 0);
});
test('Concurrencia modelada: nuevas observaciones de saldo y control invalidan el plan previo', () => {
  const p = entrada(); c.prepararTransferencia(p); p.contexto.cuentas[0].estado.saldoMinor = 100;
  assert.throws(() => c.prepararTransferencia(p));
  const q = entrada('reversion'); c.prepararReversion(q); q.contexto.original.reversion = { version: V, movimientoId: 'otra' };
  assert.throws(() => c.prepararReversion(q));
});
test('FIN-2 rechaza dos contrapartidas del mismo original aunque cada propuesta aislada sea válida', () => {
  const p = entrada('reversion'); const primera = c.prepararReversion(p);
  p.solicitud.idMovimiento = 'segunda'; const segunda = c.prepararReversion(p);
  assert.throws(() => a.calcularLibro({ movimientos: [p.contexto.original.movimiento,
    primera.movimiento, segunda.movimiento], cuentas: [ref('caja')] }), { codigo: 'REVERSA_DUPLICADA' });
});
test('Reingreso y acceso refrescados no sustituyen las precondiciones originales de FIN-6', () => {
  for (const tipo of Object.keys(funciones)) {
    const p = entrada(tipo), auth = p.contexto.autorizacion;
    auth.perfilActor.datos.pertenenciaId = auth.perfilTitular.datos.pertenenciaId = auth.pertenenciaIdEsperada = 'b'.repeat(64);
    assert.throws(() => funciones[tipo](p), { codigo: 'INTENCION_AUTORIZACION_DISTINTA' });
    const q = entrada(tipo); q.contexto.autorizacion.acceso.version = q.contexto.autorizacion.versionAccesoEsperada = W;
    assert.throws(() => funciones[tipo](q), { codigo: 'INTENCION_AUTORIZACION_DISTINTA' });
  }
});
test('Propiedades: conservación de transferencia y cancelación exacta de pares', () => {
  for (let n = 1; n <= 50; n++) {
    const p = entrada(); p.solicitud.montoMinor = n;
    const r = c.prepararTransferencia(p);
    assert.equal(r.movimiento.asientos.reduce((s, x) => s + BigInt(x.deltaMinor), 0n), 0n);
    const q = entrada('reversion', 'transferencia');
    q.contexto.original.movimiento = a.crearTransferencia({ id: 'original', fechaContable: '2026-09-10', periodoId: '2026-09',
      origen: ref('caja'), destino: ref('banco'), montoMinor: n });
    const reversa = c.prepararReversion(q);
    assert.deepEqual(reversa.movimiento.asientos.map(x => x.deltaMinor), q.contexto.original.movimiento.asientos.map(x => -x.deltaMinor));
  }
});
test('VM sin SDKs, red, filesystem, reloj, aleatoriedad ni logs ejecuta FIN-6', () => {
  const fuentes = Object.fromEntries(['dinero', 'asientos', 'autorizacion', 'configuracion', 'cuentas', 'categorias', 'correcciones'].map(n =>
    [`./${n}`, fs.readFileSync(path.join(__dirname, `../finanzas_core/${n}.js`), 'utf8')]));
  fuentes['../pertenencia'] = fs.readFileSync(path.join(__dirname, '../pertenencia.js'), 'utf8');
  vm.runInNewContext(`Date.now = Math.random = () => { throw Error('Efecto prohibido'); };
    console = { log() { throw Error('Log prohibido'); }, error() { throw Error('Log prohibido'); } };
    const cache = Object.create(null);
    function cargar(n) { if (n === 'node:crypto') return { randomBytes() { throw Error('ID prohibido'); } };
      if (!Object.hasOwn(fuentes,n)) throw Error('Dependencia prohibida');
      if (!cache[n]) { const m={exports:{}}; cache[n]=m; new Function('require','module',fuentes[n])(cargar,m); } return cache[n].exports; }
    const r=cargar('./correcciones').prepararTransferencia(JSON.parse(datos));
    if(r.saldosPropuestos[0].nuevoMinor!==26000) throw Error('Saldo incorrecto');`,
  { fuentes, Buffer, datos: JSON.stringify(entrada()) });
});
