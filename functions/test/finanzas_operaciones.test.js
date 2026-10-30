'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prepararIngreso, prepararGasto } = require('../finanzas_core/operaciones');
const { calcularLibro } = require('../finanzas_core/asientos');
const VERSION = '1700000000:123456789';
function entrada(clase = 'ingreso', uid = 'admin') {
  const titular = { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'a'.repeat(64) };
  const versiones = { iglesia: VERSION, cuenta: VERSION, categoria: VERSION,
    configuracion: VERSION, controlPeriodo: VERSION };
  return {
    solicitud: { versionEsquema: 1, solicitudId: 's'.repeat(32), idMovimiento: 'movimiento',
      iglesiaId: 'iglesia', cuentaId: 'caja', categoriaId: 'categoria', montoMinor: 10000,
      fechaContable: '2026-10-17', periodoId: '2026-10',
      precondiciones: { pertenenciaId: 'a'.repeat(64), acceso: VERSION, ...versiones } },
    contexto: {
      autorizacion: { auth: { uid }, iglesiaId: 'iglesia',
        perfilActor: { id: uid, datos: uid === 'admin' ? { ...titular } :
          { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'a'.repeat(64) } },
        iglesia: { id: 'iglesia', datos: { adminUid: 'admin' } },
        perfilTitular: { id: 'admin', datos: titular },
        acceso: { id: 'acceso', iglesiaId: 'iglesia', version: VERSION,
          datos: { moduloHabilitado: true, encargadoUid: 'encargado' } },
        pertenenciaIdEsperada: 'a'.repeat(64), versionAccesoEsperada: VERSION },
      configuracion: { versionEsquema: 1, iglesiaId: 'iglesia', moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
      estadoLibro: { iglesiaId: 'iglesia', huboMovimientos: true, periodosAbiertos: ['2026-10'] },
      cuenta: { versionEsquema: 1, id: 'caja', iglesiaId: 'iglesia', codigo: 'CAJA', nombre: 'Caja',
        tipo: 'caja', moneda: 'CLP', escala: 0, estado: 'activa' },
      categoria: { versionEsquema: 1, id: 'categoria', iglesiaId: 'iglesia', codigo: 'CATEGORIA', nombre: 'Categoría',
        naturaleza: clase, tipoIngreso: clase === 'ingreso' ? 'diezmos' : null, estado: 'activa' },
      estadoCuenta: { iglesiaId: 'iglesia', cuentaId: 'caja', huboMovimientos: true,
        saldoMinor: 20000, solicitudesInciertas: 0, aperturaRegistrada: false }, versiones,
    },
  };
}
function congelar(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); }
  return v;
}

for (const tipo of ['diezmos', 'ofrendas', 'donaciones', 'otros']) {
  test(`Ingreso ${tipo} válido: positivo, clasificado y sin aportar identidad obligatoria`, () => {
    const p = entrada(); p.contexto.categoria.tipoIngreso = tipo;
    const r = prepararIngreso(p);
    assert.equal(r.movimiento.clase, 'ingreso'); assert.equal(r.clasificacion.tipoIngreso, tipo);
    assert.deepEqual(r.movimiento.asientos, [{ cuentaId: 'caja', deltaMinor: 10000 }]);
    assert.equal(r.saldoPropuesto.nuevoMinor, 30000); assert.equal(r.privado.aportante, null);
    assert.equal(r.responsable.uid, 'admin'); assert.equal(r.movimiento.reversaDe, null);
  });
}
test('Gasto válido y gasto de saldo completo: no sobregiro y asiento negativo', () => {
  const p = entrada('gasto'); const r = prepararGasto(p);
  assert.equal(r.movimiento.clase, 'gasto'); assert.equal(r.clasificacion.naturaleza, 'gasto');
  assert.equal(r.clasificacion.tipoIngreso, null); assert.equal(r.movimiento.asientos[0].deltaMinor, -10000);
  assert.equal(r.saldoPropuesto.nuevoMinor, 10000);
  p.solicitud.montoMinor = 20000; assert.equal(prepararGasto(p).saldoPropuesto.nuevoMinor, 0);
});
test('Proyección exacta FIN-2 reconstruye ingresos/gastos y saldo', () => {
  const i = prepararIngreso(entrada()); const p = entrada('gasto');
  p.solicitud.idMovimiento = 'gasto'; p.solicitud.montoMinor = 4000;
  const g = prepararGasto(p);
  const libro = calcularLibro({ movimientos: [i.movimiento, g.movimiento],
    cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }] });
  assert.equal(libro.ingresosNetosMinor, 10000); assert.equal(libro.gastosNetosMinor, 4000);
  assert.equal(libro.resultadoMinor, 6000); assert.equal(libro.aperturasNetasMinor, 0);
});
for (const [nombre, modificar] of [
  ['categoría de gasto', p => { p.contexto.categoria.naturaleza = 'gasto'; p.contexto.categoria.tipoIngreso = null; }],
  ['cuenta archivada', p => { p.contexto.cuenta.estado = 'archivada'; }],
  ['categoría archivada', p => { p.contexto.categoria.estado = 'archivada'; }],
  ['cuenta de otra iglesia', p => { p.contexto.cuenta.iglesiaId = 'otra'; }],
  ['categoría de otra iglesia', p => { p.contexto.categoria.iglesiaId = 'otra'; }],
  ['cuenta diferente', p => { p.solicitud.cuentaId = 'otra'; }],
  ['categoría diferente', p => { p.solicitud.categoriaId = 'otra'; }],
  ['período cerrado', p => { p.contexto.estadoLibro.periodosAbiertos = []; }],
  ['período distinto', p => { p.contexto.estadoLibro.periodosAbiertos = ['2026-11']; }],
  ['dos períodos abiertos', p => { p.contexto.estadoLibro.periodosAbiertos = ['2026-10', '2026-11']; }],
  ['fecha imposible', p => { p.solicitud.fechaContable = '2026-02-30'; }],
  ['fecha de otro período', p => { p.solicitud.fechaContable = '2026-11-01'; }],
  ['fecha con hora', p => { p.solicitud.fechaContable += 'T00:00:00Z'; }],
  ['historial contradictorio', p => { p.contexto.estadoLibro.huboMovimientos = false; }],
  ['saldo ajeno', p => { p.contexto.estadoCuenta.cuentaId = 'otra'; }],
  ['incertidumbre en cuenta', p => { p.contexto.estadoCuenta.solicitudesInciertas = 1; }],
  ['moneda USD', p => { p.contexto.configuracion.moneda = 'USD'; p.contexto.configuracion.escala = 2; }],
  ['escala fraccionaria CLP', p => { p.contexto.configuracion.escala = 2; }],
  ['zona distinta', p => { p.contexto.configuracion.zonaHoraria = 'UTC'; }],
]) test(`Ingreso rechaza ${nombre}`, () => {
  const p = entrada(); modificar(p); assert.throws(() => prepararIngreso(p));
});
test('Gasto rechaza una categoría de ingreso y aportante incluso nulo', () => {
  assert.throws(() => prepararGasto(entrada()));
  const p = entrada('gasto'); p.solicitud.aportante = null;
  assert.throws(() => prepararGasto(p), { codigo: 'CAMPOS_INVALIDOS' });
});
for (const saldoMinor of [0, 9999, -1, -Number.MAX_SAFE_INTEGER]) {
  test(`No sobregiro: saldo ${saldoMinor}`, () => {
    const p = entrada('gasto'); p.contexto.estadoCuenta.saldoMinor = saldoMinor;
    assert.throws(() => prepararGasto(p), { codigo: 'SALDO_INSUFICIENTE' });
  });
}
for (const [i, monto] of [0, -0, -1, 0.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER + 1, '10000', null, undefined, 1n].entries()) {
  test(`Ingreso/gasto rechazan monto inválido ${i}`, () => {
    for (const clase of ['ingreso', 'gasto']) {
      const p = entrada(clase); p.solicitud.montoMinor = monto;
      assert.throws(() => (clase === 'ingreso' ? prepararIngreso : prepararGasto)(p));
    }
  });
}
test('Desbordamiento de suma se rechaza y los límites seguros exactos se conservan', () => {
  const p = entrada(); p.contexto.estadoCuenta.saldoMinor = Number.MAX_SAFE_INTEGER;
  assert.throws(() => prepararIngreso(p), { codigo: 'DESBORDAMIENTO' });
  p.contexto.estadoCuenta.saldoMinor = 0; p.solicitud.montoMinor = Number.MAX_SAFE_INTEGER;
  assert.equal(prepararIngreso(p).saldoPropuesto.nuevoMinor, Number.MAX_SAFE_INTEGER);
  p.contexto.estadoCuenta.saldoMinor = -Number.MAX_SAFE_INTEGER;
  assert.equal(prepararIngreso(p).saldoPropuesto.nuevoMinor, 0);
  const g = entrada('gasto'); g.contexto.estadoCuenta.saldoMinor = Number.MAX_SAFE_INTEGER;
  g.solicitud.montoMinor = Number.MAX_SAFE_INTEGER; assert.equal(prepararGasto(g).saldoPropuesto.nuevoMinor, 0);
});
for (const [i, saldo] of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '20000', -0, null].entries()) {
  test(`Saldo observado inválido ${i}`, () => {
    const p = entrada(); p.contexto.estadoCuenta.saldoMinor = saldo; assert.throws(() => prepararIngreso(p));
  });
}
for (const rol of ['servidor', 'lider_area']) test(`Encargado vigente ${rol} prepara ingreso y gasto`, () => {
  for (const clase of ['ingreso', 'gasto']) {
    const p = entrada(clase, 'encargado'); p.contexto.autorizacion.perfilActor.datos.rolGlobal = rol;
    assert.equal((clase === 'ingreso' ? prepararIngreso : prepararGasto)(p).responsable.uid, 'encargado');
  }
});
for (const [nombre, modificar] of [
  ['encargado revocado', a => { a.acceso.datos.encargadoUid = null; }],
  ['módulo apagado', a => { a.acceso.datos.moduloHabilitado = false; }],
  ['sin Auth', a => { a.auth = null; }],
  ['usuario externo', a => { a.perfilActor.datos.iglesiaId = 'otra'; }],
  ['desvinculado', a => { a.perfilActor.datos.iglesiaId = null; }],
  ['período anterior', a => { a.perfilActor.datos.pertenenciaId = 'b'.repeat(64); }],
  ['perfil legado', a => { delete a.perfilActor.datos.pertenenciaId; }],
  ['señal falsa de elegibilidad', a => { a.acceso.datos.encargadoUid = null; a.elegibilidad = true; }],
  ['Auth ajeno al perfil', a => { a.auth.uid = 'suplantado'; }],
  ['líder sin designación', a => { a.perfilActor.datos.rolGlobal = 'lider_area'; a.acceso.datos.encargadoUid = null; }],
  ['servidor sin designación', a => { a.acceso.datos.encargadoUid = null; }],
  ['versión de acceso revocada/reasignada', a => { a.acceso.version = '1700000000:123456790'; }],
]) test(`FIN-3 deniega ${nombre}`, () => {
  const p = entrada('ingreso', 'encargado'); modificar(p.contexto.autorizacion);
  assert.throws(() => prepararIngreso(p), { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
});
test('Transferencia de administración no conserva autorización administrativa antigua', () => {
  const p = entrada(); p.contexto.autorizacion.iglesia.datos.adminUid = 'nuevo';
  p.contexto.autorizacion.perfilTitular.id = 'nuevo';
  assert.throws(() => prepararIngreso(p), { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
  p.contexto.autorizacion.perfilActor.datos.rolGlobal = 'servidor';
  p.contexto.autorizacion.acceso.datos.encargadoUid = 'admin';
  p.contexto.versiones.iglesia = '1700000001:0';
  assert.throws(() => prepararIngreso(p), { codigo: 'CONTEXTO_OPERACION_MODIFICADO' });
});
for (const k of ['iglesia', 'cuenta', 'categoria', 'configuracion', 'controlPeriodo']) {
  test(`Cambio de contexto durante intención: ${k}`, () => {
    const p = entrada(); p.contexto.versiones[k] = '1700000000:123456790';
    assert.throws(() => prepararIngreso(p), { codigo: 'CONTEXTO_OPERACION_MODIFICADO' });
  });
}
test('No sustituir precondiciones originales por un nuevo período o versión de acceso', () => {
  for (const k of ['pertenenciaId', 'acceso']) {
    const p = entrada(); p.solicitud.precondiciones[k] = k === 'acceso' ? '1700000001:0' : 'b'.repeat(64);
    assert.throws(() => prepararIngreso(p), { codigo: 'INTENCION_AUTORIZACION_DISTINTA' });
  }
});
test('Titular tampoco registra con módulo deshabilitado', () => {
  const p = entrada(); p.contexto.autorizacion.acceso.datos.moduloHabilitado = false;
  assert.throws(() => prepararIngreso(p), { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
});
test('Reingreso coherente del mismo UID no reactiva su intención anterior', () => {
  const p = entrada(); const a = p.contexto.autorizacion;
  a.perfilActor.datos.pertenenciaId = a.perfilTitular.datos.pertenenciaId = a.pertenenciaIdEsperada = 'b'.repeat(64);
  assert.throws(() => prepararIngreso(p), { codigo: 'INTENCION_AUTORIZACION_DISTINTA' });
});
test('Acceso refrescado tras revocar/reasignar no reemplaza la intención original', () => {
  const p = entrada('ingreso', 'encargado');
  p.contexto.autorizacion.acceso.version = p.contexto.autorizacion.versionAccesoEsperada = '1700000001:0';
  assert.throws(() => prepararIngreso(p), { codigo: 'INTENCION_AUTORIZACION_DISTINTA' });
});
test('Transferencia de ida y vuelta no vuelve válida una versión anterior de iglesia', () => {
  const p = entrada(); p.contexto.versiones.iglesia = '1700000002:0';
  assert.throws(() => prepararIngreso(p), { codigo: 'CONTEXTO_OPERACION_MODIFICADO' });
});
test('Primer ingreso sin apertura es válido y no inventa historial o marcador', () => {
  const p = entrada(); p.contexto.estadoLibro.huboMovimientos = false;
  p.contexto.estadoCuenta.huboMovimientos = false; p.contexto.estadoCuenta.saldoMinor = 0;
  const antes = structuredClone(p); const r = prepararIngreso(p);
  assert.equal(r.saldoPropuesto.nuevoMinor, 10000); assert.deepEqual(p, antes);
  assert.equal(Object.hasOwn(r, 'aperturaRegistrada'), false);
});
test('IDs explícitos tienen tamaño acotado y rechazan rutas o espacios', () => {
  for (const campo of ['idMovimiento', 'cuentaId', 'categoriaId']) {
    for (const valor of ['', 'x'.repeat(129), 'x/y', '__reservado__', ' x', 'x\n', null]) {
      const p = entrada(); p.solicitud[campo] = valor; assert.throws(() => prepararIngreso(p));
    }
  }
});
test('Donación anónima o con nombre privado, sin cuenta de usuario ni datos adicionales', () => {
  for (const aportante of [undefined, null, { nombre: 'Aportante ficticio' }]) {
    const p = entrada(); p.contexto.categoria.tipoIngreso = 'donaciones';
    if (aportante !== undefined) p.solicitud.aportante = aportante;
    const r = prepararIngreso(p);
    assert.deepEqual(r.privado.aportante, aportante ?? null);
    assert.equal(Object.hasOwn(r.movimiento, 'aportante'), false);
    assert.equal(Object.hasOwn(r.clasificacion, 'aportante'), false);
  }
});
for (const [i, aportante] of [{}, { nombre: '' }, { nombre: ' x ' }, { nombre: 'x'.repeat(121) },
  { nombre: 'x\n' }, { nombre: 'x\u200b' }, { nombre: 'e\u0301' }, { nombre: '\ud800' },
  { nombre: 'Nombre', uid: 'usuario' }, { nombre: 'Nombre', correo: 'no-guardar' }, 'persona', []].entries()) {
  test(`Datos privados del aportante controlados ${i}`, () => {
    const p = entrada(); p.solicitud.aportante = aportante; assert.throws(() => prepararIngreso(p));
  });
}
test('Descripción opcional acotada y nombres Unicode válidos en sus límites', () => {
  const p = entrada(); p.solicitud.descripcion = 'x'.repeat(240); p.solicitud.aportante = { nombre: 'Á'.repeat(120) };
  assert.equal(prepararIngreso(p).descripcion.length, 240);
  for (const descripcion of ['', ' x', 'x\n', 'x'.repeat(241), null, 1]) {
    p.solicitud.descripcion = descripcion; assert.throws(() => prepararIngreso(p));
  }
});
for (const [i, solicitudId] of ['', 'x'.repeat(15), 'x'.repeat(129), 'x/y'.repeat(10), 'x'.repeat(16) + '\n', null].entries()) {
  test(`SolicitudId inválida ${i}`, () => {
    const p = entrada(); p.solicitud.solicitudId = solicitudId; assert.throws(() => prepararIngreso(p));
  });
}
test('Contexto de solicitud y esquema explícitos; no IDs, timestamps o secuencias inventados', () => {
  const p = entrada(); const r = prepararIngreso(p);
  assert.equal(r.solicitudId, p.solicitud.solicitudId); assert.equal(r.movimiento.id, p.solicitud.idMovimiento);
  for (const k of ['timestamp', 'secuencia', 'confirmada']) assert.equal(Object.hasOwn(r, k), false);
  for (const versionEsquema of [undefined, null, '1', 2]) {
    p.solicitud.versionEsquema = versionEsquema; assert.throws(() => prepararIngreso(p));
  }
});
test('Campos desconocidos, saldo arbitrario, actorUid e historia no conceden autoridad', () => {
  for (const nivel of ['raiz', 'solicitud', 'contexto']) for (const k of ['actorUid', 'saldoMinor', 'confirmacionHistorica', 'clase']) {
    const p = entrada(); const destino = nivel === 'raiz' ? p : p[nivel]; destino[k] = 'falso';
    assert.throws(() => prepararIngreso(p), { codigo: 'CAMPOS_INVALIDOS' });
  }
  const p = entrada(); p.contexto.autorizacion.auth.token = { admin: true, uid: 'otro' };
  assert.equal(prepararIngreso(p).responsable.uid, 'admin');
});
test('Todos los campos requeridos deben existir; getters no se ejecutan', () => {
  for (const nivel of ['solicitud', 'contexto']) for (const k of Object.keys(entrada()[nivel])) {
    const p = entrada(); delete p[nivel][k]; assert.throws(() => prepararIngreso(p));
  }
  let llamadas = 0; const p = entrada();
  Object.defineProperty(p.solicitud, 'montoMinor', { enumerable: true, get() { llamadas++; return 100; } });
  assert.throws(() => prepararIngreso(p)); assert.equal(llamadas, 0);
});
for (const version of ['1:1000000000', '01:0', '1:00', '1:0\n', '253402300800:0', 'texto', null]) {
  test(`Versiones estrictas de contexto: ${String(version)}`, () => {
    const p = entrada(); p.contexto.versiones.cuenta = version; p.solicitud.precondiciones.cuenta = version;
    assert.throws(() => prepararIngreso(p));
  });
}
test('Concurrencia modelada reevalúa saldo, archivo y cierre sin mutar la intención', () => {
  const p = entrada('gasto'); prepararGasto(p); const solicitud = structuredClone(p.solicitud);
  p.contexto.estadoCuenta.saldoMinor = 5000;
  assert.throws(() => prepararGasto(p), { codigo: 'SALDO_INSUFICIENTE' });
  p.contexto.estadoCuenta.saldoMinor = 20000; p.contexto.cuenta.estado = 'archivada';
  assert.throws(() => prepararGasto(p)); p.contexto.cuenta.estado = 'activa';
  p.contexto.estadoLibro.periodosAbiertos = []; assert.throws(() => prepararGasto(p));
  assert.deepEqual(p.solicitud, solicitud);
});
test('Propuesta profundamente inmutable, entradas intactas y resultados deterministas', () => {
  const p = entrada(); p.solicitud.aportante = { nombre: 'Persona ficticia' }; p.solicitud.descripcion = 'Aporte';
  const antes = structuredClone(p); congelar(p); const r = prepararIngreso(p);
  assert.deepEqual(p, antes); assert.deepEqual(r, prepararIngreso(p));
  function comprobar(v) { if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(comprobar); } }
  comprobar(r); assert.notEqual(r.privado.aportante, p.solicitud.aportante);
});
test('Propiedades de conservación: delta y saldo exactos para ingresos y gastos', () => {
  for (let monto = 1; monto <= 100; monto++) {
    for (const clase of ['ingreso', 'gasto']) {
      const p = entrada(clase); p.solicitud.montoMinor = monto;
      const r = (clase === 'ingreso' ? prepararIngreso : prepararGasto)(p);
      const delta = r.movimiento.asientos[0].deltaMinor;
      assert.equal(BigInt(r.saldoPropuesto.nuevoMinor) - BigInt(r.saldoPropuesto.anteriorMinor), BigInt(delta));
      assert.equal(delta, clase === 'ingreso' ? monto : -monto);
    }
  }
});
test('Pureza en VM: sin SDKs, red, filesystem, reloj, aleatoriedad ni logs', () => {
  const fuentes = Object.fromEntries(['dinero', 'asientos', 'autorizacion', 'configuracion', 'cuentas', 'categorias', 'operaciones'].map(n =>
    [`./${n}`, fs.readFileSync(path.join(__dirname, `../finanzas_core/${n}.js`), 'utf8')]));
  fuentes['../pertenencia'] = fs.readFileSync(path.join(__dirname, '../pertenencia.js'), 'utf8');
  const sandbox = vm.createContext({ fuentes, Buffer, datos: JSON.stringify(entrada()) });
  vm.runInContext(`
    Date.now = Math.random = () => { throw Error('Efecto prohibido'); };
    console = { log() { throw Error('Log prohibido'); }, error() { throw Error('Log prohibido'); } };
    const cache = Object.create(null);
    function cargar(n) {
      if (n === 'node:crypto') return { randomBytes() { throw Error('ID prohibido'); } };
      if (!Object.hasOwn(fuentes, n)) throw Error('Dependencia prohibida');
      if (!cache[n]) { const m = { exports: {} }; cache[n] = m;
        new Function('require', 'module', fuentes[n])(cargar, m); }
      return cache[n].exports;
    }
    const r = cargar('./operaciones').prepararIngreso(JSON.parse(datos));
    if (r.saldoPropuesto.nuevoMinor !== 30000) throw Error('Saldo incorrecto');
  `, sandbox);
});
