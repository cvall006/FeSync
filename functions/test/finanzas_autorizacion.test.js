'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { OPERACIONES_CONTABLES, evaluarAutorizacionContable: evaluar,
  exigirPermisoContable: exigir } = require('../finanzas_core/autorizacion');

function contexto(uid = 'admin', rol = 'admin_iglesia') {
  const datosTitular = { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'a'.repeat(64) };
  return { auth: { uid }, iglesiaId: 'iglesia',
    perfilActor: { id: uid, datos: uid === 'admin' ? { ...datosTitular } :
      { iglesiaId: 'iglesia', rolGlobal: rol, pertenenciaId: 'a'.repeat(64) } },
    iglesia: { id: 'iglesia', datos: { adminUid: 'admin' } },
    perfilTitular: { id: 'admin', datos: datosTitular },
    acceso: { id: 'acceso', iglesiaId: 'iglesia', version: '1700000000:123456789',
      datos: { moduloHabilitado: true, encargadoUid: 'encargado' } },
    pertenenciaIdEsperada: 'a'.repeat(64), versionAccesoEsperada: '1700000000:123456789' };
}
function congelar(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); }
  return v;
}
function deniega(c) {
  const r = evaluar(c);
  assert.equal(r.autorizado, false);
  assert.ok(Object.values(r.permisos).every((v) => v === false));
  return r;
}
test('Administrador titular coherente obtiene todos los permisos contables', () => {
  const r = evaluar(contexto());
  assert.equal(r.autorizado, true);
  assert.deepEqual(Object.keys(r.permisos), OPERACIONES_CONTABLES);
  for (const op of OPERACIONES_CONTABLES) assert.equal(exigir(contexto(), op).permisos[op], true);
});
for (const rol of ['servidor', 'lider_area']) {
  test(`Encargado ${rol} solo lee, registra, transfiere y prepara cierre`, () => {
    const c = contexto('encargado', rol); const r = evaluar(c);
    assert.equal(r.autorizado, true);
    for (const op of OPERACIONES_CONTABLES) {
      const permitido = ['leer', 'registrarIngresosGastos', 'transferir', 'prepararCierre'].includes(op);
      assert.equal(r.permisos[op], permitido);
      if (permitido) exigir(c, op);
      else assert.throws(() => exigir(c, op), { codigo: 'CONTABILIDAD_NO_AUTORIZADA' });
    }
  });
  test(`Rol ${rol} sin designación no concede derechos financieros`, () => {
    deniega(contexto('miembro', rol));
  });
}
test('Administrador también designado conserva capacidades exclusivas por titularidad', () => {
  const c = contexto(); c.acceso.datos.encargadoUid = 'admin';
  assert.equal(evaluar(c).permisos.aprobarCierre, true);
  c.acceso.datos.encargadoUid = null;
  assert.equal(evaluar(c).permisos.aprobarCierre, true);
});
test('Revocación de encargado deniega sin depender de la elegibilidad', () => {
  const c = contexto('encargado', 'servidor');
  assert.equal(evaluar(c).autorizado, true);
  c.acceso.datos.encargadoUid = null;
  c.perfilActor.datos.finanzasElegible = true;
  assert.equal(deniega(c).motivo, 'SIN_DESIGNACION');
});
test('Revocar y volver a designar no revive un contexto con versión anterior', () => {
  const c = contexto('encargado', 'lider_area'); c.acceso.version = '1700000000:123456790';
  assert.equal(deniega(c).motivo, 'ACCESO_MODIFICADO');
  c.versionAccesoEsperada = c.acceso.version;
  assert.equal(evaluar(c).autorizado, true);
});
for (const [nombre, modificar] of [
  ['iglesia ajena', (c) => { c.perfilActor.datos.iglesiaId = 'otra'; }],
  ['desvinculado', (c) => { delete c.perfilActor.datos.iglesiaId; delete c.perfilActor.datos.rolGlobal; }],
  ['período anterior', (c) => { c.pertenenciaIdEsperada = 'b'.repeat(64); }],
  ['perfil legado', (c) => { delete c.perfilActor.datos.pertenenciaId; }],
  ['período null', (c) => { c.perfilActor.datos.pertenenciaId = null; }],
  ['período malformado', (c) => { c.pertenenciaIdEsperada = 'A'.repeat(64); }],
  ['titularidad ajena', (c) => { c.iglesia.datos.adminUid = 'nuevo'; }],
  ['perfil titular ajeno', (c) => { c.perfilTitular.datos.iglesiaId = 'otra'; }],
  ['titular con rol servidor', (c) => { c.perfilTitular.datos.rolGlobal = 'servidor'; }],
  ['administrador anterior', (c) => { c.perfilActor.datos.rolGlobal = 'admin_iglesia'; }],
  ['rol desconocido', (c) => { c.perfilActor.datos.rolGlobal = 'tesorero'; }],
  ['iglesia documental distinta', (c) => { c.iglesia.id = 'otra'; }],
  ['ruta de acceso distinta', (c) => { c.acceso.iglesiaId = 'otra'; }],
  ['documento de acceso distinto', (c) => { c.acceso.id = 'otro'; }],
  ['Auth y perfil discrepantes', (c) => { c.auth.uid = 'admin'; }],
  ['UID perfil no vinculado al snapshot', (c) => { c.perfilActor.id = 'admin'; }],
  ['versión ausente', (c) => { delete c.acceso.version; }],
  ['versión no canónica', (c) => { c.versionAccesoEsperada = '1700000000:0123456789'; }],
  ['nanosegundos fuera de rango', (c) => { c.acceso.version = '1700000000:1000000000'; }],
  ['encargadoUid ausente', (c) => { delete c.acceso.datos.encargadoUid; }],
  ['encargadoUid malformado', (c) => { c.acceso.datos.encargadoUid = {}; }],
]) {
  test(`Denegación completa ante ${nombre}`, () => {
    const c = contexto('encargado', 'servidor'); modificar(c); deniega(c);
  });
}
for (const habilitado of [false, undefined, null, 'true', 1, [], {}]) {
  test(`Módulo no habilitado explícitamente (${JSON.stringify(habilitado)}) deniega incluso al titular`, () => {
    const c = contexto(); c.acceso.datos.moduloHabilitado = habilitado; deniega(c);
  });
}
for (const clave of ['auth', 'iglesiaId', 'perfilActor', 'iglesia', 'perfilTitular', 'acceso',
  'pertenenciaIdEsperada', 'versionAccesoEsperada']) {
  test(`Contexto sin ${clave} nunca concede permisos`, () => {
    const c = contexto(); delete c[clave]; deniega(c);
  });
}
test('Suplantación por payload, UID actor o bandera booleana no sustituye Auth', () => {
  const c = contexto('miembro', 'servidor');
  for (const extra of [{ actorUid: 'admin' }, { isAdmin: true },
    { data: { uid: 'admin', auth: { uid: 'admin' }, rolGlobal: 'admin_iglesia' } },
    { elegibilidad: { habilitado: true, esEncargado: true } }]) deniega({ ...c, ...extra });
  c.auth = null; deniega(c);
});
test('Claims financieros o administrativos no sustituyen el perfil ni la designación', () => {
  const c = contexto('miembro', 'servidor');
  c.auth.token = { rolGlobal: 'admin_iglesia', encargado: true, admin: true };
  assert.equal(deniega(c).motivo, 'SIN_DESIGNACION');
});
test('Documentos ausentes, tipos malformados y accesores fallan por defecto', () => {
  for (const c of [null, undefined, [], {}, 1]) deniega(c);
  for (const clave of ['perfilActor', 'iglesia', 'perfilTitular', 'acceso']) {
    const c = contexto(); c[clave] = null; deniega(c);
  }
  const c = contexto(); let lecturas = 0;
  Object.defineProperty(c.auth, 'uid', { enumerable: true, get() { lecturas++; return 'admin'; } });
  deniega(c); assert.equal(lecturas, 0);
});
test('Observaciones contradictorias del mismo perfil titular se rechazan', () => {
  const c = contexto(); c.perfilTitular.datos.pertenenciaId = 'b'.repeat(64);
  assert.equal(deniega(c).motivo, 'TITULAR_INCOHERENTE');
});
test('Legado del titular ajeno no inventa período: el período exigido es el del actor', () => {
  const c = contexto('encargado', 'servidor'); delete c.perfilTitular.datos.pertenenciaId;
  assert.equal(evaluar(c).autorizado, true);
  // Si el mismo legado pretende actuar como titular, sí debe migrarse.
  c.auth.uid = 'admin'; c.perfilActor = structuredClone(c.perfilTitular);
  deniega(c);
});
test('Operación desconocida y propiedades heredadas no conceden permisos', () => {
  for (const op of [undefined, null, 'constructor', '__proto__', 'salir', '', true]) {
    assert.throws(() => exigir(contexto(), op), { codigo: 'OPERACION_CONTABLE_INVALIDA' });
  }
});
test('Cada evaluación usa observaciones actuales; no hay caché ante salida o transferencia', () => {
  const c = contexto(); const primero = evaluar(c);
  c.iglesia.datos.adminUid = 'nuevo'; deniega(c);
  assert.equal(primero.autorizado, true); // Historia, no token vigente.
  const otro = contexto('encargado', 'servidor');
  assert.equal(evaluar(otro).autorizado, true);
  delete otro.perfilActor.datos.iglesiaId; deniega(otro);
});
test('Entradas intactas y resultado sin identidad, documentos o tokens', () => {
  const c = contexto(); c.auth.token = { secreto: 'TOKEN_FICTICIO' };
  c.perfilActor.datos.nombre = 'Persona ficticia'; congelar(c);
  const copia = structuredClone(c); const r = evaluar(c);
  assert.deepEqual(c, copia); assert.deepEqual(evaluar(c), r);
  assert.equal(Object.isFrozen(r), true); assert.equal(Object.isFrozen(r.permisos), true);
  for (const privado of ['TOKEN_FICTICIO', 'Persona ficticia', 'iglesiaId', 'pertenenciaId', 'actorUid']) {
    assert.equal(JSON.stringify(r).includes(privado), false);
  }
});
test('Sin SDK, reloj, red, generador de IDs o persistencia en evaluación pura', () => {
  const sandbox = vm.createContext({ Buffer });
  vm.runInContext("globalThis.Date = class { static now(){throw Error('Reloj prohibido')} };", sandbox);
  function cargar(archivo, requerir) {
    sandbox.modulo = { exports: {} }; sandbox.requerir = requerir;
    const fuente = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    vm.runInContext(`(function(module,require){${fuente}\n})(modulo,requerir)`, sandbox);
    return sandbox.modulo.exports;
  }
  const dinero = cargar('finanzas_core/dinero.js', () => { throw Error('Dependencia prohibida'); });
  const pertenencia = cargar('pertenencia.js', (n) => {
    assert.equal(n, 'node:crypto'); return { randomBytes() { throw Error('Generación prohibida'); } };
  });
  sandbox.api = cargar('finanzas_core/autorizacion.js', (n) => {
    if (n === './dinero') return dinero;
    assert.equal(n, '../pertenencia'); return pertenencia;
  });
  sandbox.texto = JSON.stringify(contexto());
  assert.equal(vm.runInContext('api.evaluarAutorizacionContable(JSON.parse(texto)).permisos.leer', sandbox), true);
});
test('Transferencia correcta conserva solo la designación financiera independiente del antiguo titular', () => {
  const c = contexto();
  c.iglesia.datos.adminUid = 'nuevo';
  c.perfilTitular = { id: 'nuevo', datos: { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'b'.repeat(64) } };
  c.perfilActor.datos.rolGlobal = 'lider_area'; c.acceso.datos.encargadoUid = 'admin';
  const r = evaluar(c);
  assert.equal(r.permisos.leer, true); assert.equal(r.permisos.registrarIngresosGastos, true);
  assert.equal(r.permisos.aprobarCierre, false); assert.equal(r.permisos.administrarCatalogos, false);
  c.acceso.datos.encargadoUid = null; deniega(c);
});
test('Reingreso con el mismo UID no permite utilizar el período original', () => {
  const c = contexto('encargado', 'servidor');
  c.perfilActor.datos.pertenenciaId = 'b'.repeat(64);
  assert.equal(deniega(c).motivo, 'PERTENENCIA_ANTERIOR');
});
