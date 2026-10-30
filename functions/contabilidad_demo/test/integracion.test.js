'use strict';
require('../entorno').verificarEntorno();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../package.json'));
const cliente = createRequire(path.join(__dirname, '../../../test/capacitaciones_rules/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment, assertFails } = cliente('@firebase/rules-unit-testing');
const { getDoc, doc, setDoc } = cliente('firebase/firestore');
const { crearAdaptadorFirestore } = require('../../finanzas_core/adaptador_firestore');
const { crearTransicionDemo, ESCRITORES } = require('../transicion');

const I = 'iglesia_demo_generacion', B = `iglesias/${I}`, P = 'a'.repeat(64), UID = 'admin_ficticio';
let db, reglas, detener = false, contador = 0;
const custodia = { emuladorExclusivo: true, administrador: true, escritores: [...ESCRITORES] };
const parametros = (extra = {}) => ({ iglesiaId: I, ejecucionId: 'ensayo_generacion_001', operador: 'b'.repeat(64),
  periodos: ['2026-10', '2026-11'], pagina: 2, lote: 2, ...extra });
const herramienta = (clienteDB = db) => crearTransicionDemo({ db: clienteDB, custodia });
const version = s => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
const codigo = esperado => e => e.codigo === esperado;
function escenario(nombre, callback) {
  test(nombre, { timeout: 60000 }, async t => {
    if (detener) return t.skip('Suite detenida tras fallo anterior, sin reintentos artificiales');
    try { await callback(t); } catch (e) { detener = true; throw e; }
  });
}
before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: { host: '127.0.0.1', port: 8088,
    rules: fs.readFileSync(path.join(__dirname, '../../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => {
  if (detener) return;
  contador = 0; await reglas.clearFirestore();
  const batch = db.batch();
  for (const [ruta, datos] of Object.entries({
    [B]: { adminUid: UID }, [`usuarios_globales/${UID}`]: { iglesiaId: I, rolGlobal: 'admin_iglesia', pertenenciaId: P },
    [`${B}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: null },
    [`${B}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: I, moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
    [`${B}/finanzas_control/libro`]: { versionEsquema: 1, iglesiaId: I, ultimaSecuencia: 0, huboMovimientos: false },
    [`${B}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: I, periodosAbiertos: ['2026-10'] },
  })) batch.create(db.doc(ruta), datos);
  await batch.commit();
});
after(async () => { if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });

async function solicitud(op, campos = {}, mes = '2026-10') {
  const vers = async ruta => version(await db.doc(ruta).get());
  const precondiciones = { pertenenciaId: P, acceso: await vers(`${B}/finanzas_config/acceso`), iglesia: await vers(B),
    configuracion: await vers(`${B}/finanzas_config/contabilidad`), controlPeriodo: await vers(`${B}/finanzas_control/periodo`) };
  const catalogo = ['crearCuenta', 'crearCategoria'].includes(op);
  if (['gasto', 'ingreso'].includes(op)) precondiciones.categoria = await vers(`${B}/finanzas_categorias/${campos.categoriaId}`);
  if (['gasto', 'ingreso', 'apertura'].includes(op)) precondiciones.cuenta = await vers(`${B}/finanzas_cuentas/${campos.cuentaId}`);
  if (['transferencia', 'ajuste', 'reversion'].includes(op)) {
    const original = op === 'reversion' ? await db.doc(`${B}/finanzas_movimientos/${campos.originalId}`).get() : null;
    const ids = original ? original.data().movimiento.asientos.map(a => a.cuentaId) : op === 'transferencia' ?
      [campos.origenId, campos.destinoId] : [campos.cuentaId];
    precondiciones.cuentas = await Promise.all(ids.map(async cuentaId => ({ cuentaId, version: await vers(`${B}/finanzas_cuentas/${cuentaId}`) })));
    if (original) precondiciones.original = { version: version(original), versionReversion: null };
  }
  return { auth: { uid: UID }, operacion: op, solicitud: { versionEsquema: 1, solicitudId: `demo_operacion_${String(++contador).padStart(8, '0')}`,
    iglesiaId: I, periodoId: mes, ...(!catalogo ? { fechaContable: `${mes}-17` } : {}),
    ...(['ajuste', 'reversion'].includes(op) ? { motivo: 'Correccion ficticia', referenciaAuditoria: 'referencia_ficticia' } : {}),
    ...campos, precondiciones } };
}
async function ejecutar(op, campos, mes) {
  return crearAdaptadorFirestore({ db, FieldValue }).ejecutar(await solicitud(op, campos, mes));
}
async function mixto() {
  await herramienta().inicializarProtocolo(I);
  const caja = (await ejecutar('crearCuenta', { cuenta: { codigo: 'CAJA', nombre: 'Caja', tipo: 'caja' } })).cuentaId;
  const banco = (await ejecutar('crearCuenta', { cuenta: { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' } })).cuentaId;
  const ingreso = (await ejecutar('crearCategoria', { categoria: { codigo: 'DIEZMOS', nombre: 'Diezmos', naturaleza: 'ingreso', tipoIngreso: 'diezmos' } })).categoriaId;
  const gasto = (await ejecutar('crearCategoria', { categoria: { codigo: 'GASTOS', nombre: 'Gastos', naturaleza: 'gasto', tipoIngreso: null } })).categoriaId;
  await ejecutar('apertura', { cuentaId: caja, montoMinor: 10000 });
  await ejecutar('ingreso', { cuentaId: caja, categoriaId: ingreso, montoMinor: 2000, aportante: { nombre: 'Persona ficticia privada' } });
  const original = (await ejecutar('gasto', { cuentaId: caja, categoriaId: gasto, montoMinor: 1000 })).movimientoId;
  await ejecutar('transferencia', { origenId: caja, destinoId: banco, montoMinor: 1000 });
  await ejecutar('ajuste', { cuentaId: caja, deltaMinor: -100 });
  await db.doc(`${B}/finanzas_control/periodo`).update({ periodosAbiertos: ['2026-11'] });
  await ejecutar('reversion', { originalId: original }, '2026-11');
  return { caja, banco, ingreso, gasto, original };
}
async function terminar(p = parametros(), h = herramienta()) {
  let r = await h.iniciar(p);
  for (let n = 0; n < 100 && !['verificada', 'fallida'].includes(r.estado); n++) r = await h.avanzar(p, r.fence);
  return r;
}
async function fotoV1() {
  const resultado = {};
  for (const c of ['finanzas_movimientos', 'finanzas_saldos', 'finanzas_resumenes', 'finanzas_cuentas',
    'finanzas_categorias', 'finanzas_reversiones', 'finanzas_auditoria']) {
    for (const d of (await db.collection(`${B}/${c}`).get()).docs) resultado[d.ref.path] = { version: version(d), datos: d.data() };
  }
  return resultado;
}

// Ejecutar SOLO en pruebas los bytes historicos acreditados. No se copia una
// huella a fixtures nuevas: el motor original crea sus documentos en Firestore.
function herramientaOriginal(identidad = 'legado-1') {
  const vm = require('node:vm'), directorio = path.resolve(__dirname, '..');
  const actual = require('../fuentes').obtenerContextoFuentes(); // acredita archivos originales antes de ejecutarlos
  const archivo = JSON.parse(fs.readFileSync(path.join(directorio, 'inventarios/legado_1.json')));
  assert.equal(archivo.huellaSoftware, actual.identidadHistorica);
  assert.ok(['legado-1', 'admin-2', 'admin-3', 'admin-4', 'admin-5'].includes(identidad));
  const originales = Object.fromEntries(Object.entries(archivo.archivos).map(([r,b]) => [path.join(directorio,r),
    identidad === 'legado-1' ? Buffer.from(b,'base64') : fs.readFileSync(path.join(directorio, r))]));
  const reqOriginal = createRequire(path.join(directorio, 'transicion.js'));
  const fsHistorico = Object.create(fs);
  // Vista de un arbol HISTORICO independiente, solo dentro de esta VM de prueba.
  // El verificador actual ya ha acreditado TODO el arbol real (incluido V2).
  // El runtime viejo conserva sus 22 fuentes y registro originales; no se
  // modifica el verificador actual ni se copian huellas sobre datos nuevos.
  const registroViejo = fs.readFileSync(path.join(__dirname, identidad === 'admin-5' ? 'registro_admin5.json' : identidad === 'admin-4' ? 'registro_admin4.json' :
    identidad === 'admin-3' ? 'registro_admin3.json' : 'registro_admin2.json'));
  const sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
  assert.equal(sha(registroViejo), identidad === 'admin-5' ?
    '36b25259333a9c22476d46dd447b43f9052b617d60d9be5527dd3320cabb0c88' : identidad === 'admin-4' ?
    '5ea83c890e99688379b6a3b33e5ed7bd66f71ccb64cb63c0e378eac955ca1de4' : identidad === 'admin-3' ?
    '6030b171bcf086be3b794858a886b9e6d598c87add787414330bb2f315cf829d' :
    'f870f107f5ce281755d73227343aae673159ca912ff2a9575c9edc160a7dfa0b');
  const anterior = JSON.parse(fs.readFileSync(path.join(directorio, identidad === 'admin-5' ? 'inventarios/runtime_5.json' : identidad === 'admin-4' ? 'inventarios/runtime_4.json' :
    identidad === 'admin-3' ? 'inventarios/runtime_3.json' : 'inventarios/runtime_2.json')));
  for (const [r, h] of Object.entries(anterior.administrativos)) if (identidad !== 'legado-1') {
    assert.equal(sha(originales[path.join(directorio, r)]), h);
  }
  fsHistorico.readdirSync = (ruta, ...args) => {
    const resultado = fs.readdirSync(ruta, ...args);
    if (path.resolve(String(ruta)) === path.resolve(directorio, '..')) {
      return resultado.filter(v => {
        const nombre = typeof v === 'string' ? v : v.name;
        return nombre !== 'contabilidad_preparacion_v2_admin_demo' &&
          (identidad === 'admin-5' || nombre !== 'contabilidad_preparacion_acreditada_demo') &&
          (['admin-4', 'admin-5'].includes(identidad) || nombre !== 'contabilidad_generaciones_v2_demo');
      });
    }
    return !['admin-3', 'admin-4', 'admin-5'].includes(identidad) && path.resolve(String(ruta)) === path.resolve(directorio, '../finanzas_core') ?
      resultado.filter(v => (typeof v === 'string' ? v : v.name) !== 'adaptador_firestore_v2.js') : resultado;
  };
  fsHistorico.readFileSync = (ruta, opciones) => {
    const p = path.resolve(String(ruta));
    const buffer = p === path.join(directorio, 'inventarios/registro.json') ? registroViejo : originales[p];
    if (!buffer) return fs.readFileSync(ruta, opciones);
    return typeof opciones === 'string' ? buffer.toString(opciones) : Buffer.from(buffer);
  };
  function compilar(nombre, importar) {
    const modulo = { exports: {} }, ruta = path.join(directorio, nombre);
    const funcion = new vm.Script('(function(require,module,exports,__dirname,__filename){\n' + originales[ruta].toString('utf8') + '\n})', { filename: ruta }).runInThisContext();
    funcion(importar, modulo, modulo.exports, directorio, ruta); return modulo.exports;
  }
  const fuentesViejas = compilar('fuentes.js', id => id === 'node:fs' ? fsHistorico : reqOriginal(id));
  assert.equal(fuentesViejas.verificarFuentes(), identidad === 'admin-5' ?
    '175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720' : identidad === 'admin-4' ?
    '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7' : identidad === 'legado-1' ? actual.identidadHistorica :
    identidad === 'admin-3' ? '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c' :
    '0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f');
  const modulo = compilar('transicion.js', id => id === './fuentes' ? fuentesViejas : reqOriginal(id));
  return modulo.crearTransicionDemo({ db, custodia });
}
async function legado(identidad = 'legado-1') {
  const m = await mixto(); const p = parametros(), viejo = herramientaOriginal(identidad);
  await viejo.iniciar(p); const avance = await viejo.avanzar(p, 0);
  const ref = db.doc(`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`);
  const gen = db.doc(`${B}/finanzas_generaciones_demo/${p.ejecucionId}`);
  const s = await ref.get(), g = await gen.get();
  assert.equal(Object.hasOwn(s.data(), 'inventarioId'), identidad !== 'legado-1');
  assert.equal(Object.hasOwn(g.data(), 'inventarioId'), identidad !== 'legado-1');
  assert.equal(s.data().huellaSoftware, identidad === 'admin-5' ?
    '175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720' : identidad === 'admin-4' ?
    '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7' : identidad === 'legado-1' ?
    require('../fuentes').obtenerContextoFuentes().identidadHistorica :
    identidad === 'admin-3' ? '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c' :
    '0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f');
  return { p, ref, gen, s, g, avance, m };
}
function envolver(hook) {
  return { projectId: db.projectId, _settings: db._settings, doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: async cb => { const r = await db.runTransaction(async tx => { const resultado = await cb(tx); await hook('antes'); return resultado; }); await hook('despues'); return r; } };
}
escenario('Legado autentico: iniciar con runtime compatible no reescribe ejecucion, generacion ni checkpoint', async () => {
  const e = await legado(), antes = await fotoV1();
  const r = await herramienta().iniciar(e.p); assert.equal(r.fence, e.avance.fence);
  const s = await e.ref.get(), g = await e.gen.get();
  assert.deepEqual(s.data(), e.s.data()); assert.equal(version(s), version(e.s));
  assert.deepEqual(g.data(), e.g.data()); assert.equal(version(g), version(e.g));
  assert.deepEqual(await fotoV1(), antes);
});
escenario('Reanudar checkpoint historico entre paginas conserva identidad y contrato originales', async () => {
  const e = await legado(), antes = await fotoV1();
  const r = await herramienta().avanzar(e.p, e.avance.fence);
  assert.equal(r.cursor.secuencia, 4); assert.equal(r.fence, 2);
  const s = (await e.ref.get()).data(), g = (await e.gen.get()).data();
  for (const k of ['huellaSoftware','versionEsquema','versionProcedimiento','versionAlgoritmo','identidad','operador','epoca','corte','manifiesto','huellaObservada']) assert.deepEqual(s[k], e.s.data()[k]);
  assert.equal(Object.hasOwn(s, 'inventarioId'), false); assert.equal(Object.hasOwn(g, 'inventarioId'), false);
  assert.equal(g.huellaSoftware, e.g.data().huellaSoftware); assert.deepEqual(await fotoV1(), antes);
});
escenario('Nueva ejecucion declara inventario actual sin usar identidad historica', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p);
  const e = (await db.doc(`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`).get()).data();
  const g = (await db.doc(`${B}/finanzas_generaciones_demo/${p.ejecucionId}`).get()).data();
  assert.equal(e.inventarioId, 'admin-6'); assert.equal(g.inventarioId, e.inventarioId);
  assert.equal(e.versionContratoInventario, 2); assert.notEqual(e.huellaSoftware, require('../fuentes').obtenerContextoFuentes().identidadHistorica);
  assert.equal(g.activa, false);
});
for (const fase of ['antes','despues']) escenario('Checkpoint historico, interrupcion ' + fase + ': mismo fence sin doble avance', async () => {
  const e = await legado(); let hecho = false;
  const interrumpido = herramienta(envolver(momento => { if (!hecho && momento === fase) { hecho = true; throw Error('Interrupcion ficticia'); } }));
  await assert.rejects(interrumpido.avanzar(e.p, e.avance.fence));
  const r = await herramienta().avanzar(e.p, e.avance.fence);
  assert.equal(r.cursor.secuencia, 4); assert.equal(r.fence, 2);
  assert.equal((await e.ref.get()).data().huellaSoftware, e.s.data().huellaSoftware);
});
escenario('Fencing historico: dos ejecutores avanzan una pagina y otro operador no toma propiedad', async () => {
  const e = await legado();
  await assert.rejects(herramienta().avanzar({ ...e.p, operador: 'c'.repeat(64) }, e.avance.fence), codigo('DEMO_FENCING'));
  const r = await Promise.all([herramienta().avanzar(e.p, e.avance.fence), herramienta().avanzar(e.p, e.avance.fence)]);
  assert.deepEqual(r[0], r[1]); assert.equal(r[0].cursor.secuencia, 4); assert.equal(r[0].fence, 2);
});
for (const campo of ['huellaSoftware','inventarioId','iglesiaId','epoca']) escenario('Identidad historica alterada: ' + campo + ' se bloquea sin reparar', async () => {
  const e = await legado();
  if (campo === 'huellaSoftware') { await e.ref.update({huellaSoftware:'0'.repeat(64)}); await e.gen.update({huellaSoftware:'0'.repeat(64)}); }
  else if (campo === 'inventarioId') {
    await e.ref.update({inventarioId:'no-acreditado',versionContratoInventario:2});
    await e.gen.update({inventarioId:'no-acreditado',versionContratoInventario:2});
  } else await e.ref.update({[campo]:campo==='epoca'?2:'otra'});
  const antes = await e.ref.get(), finanzas = await fotoV1();
  await assert.rejects(herramienta().avanzar(e.p,e.avance.fence));
  assert.deepEqual((await e.ref.get()).data(), antes.data()); assert.deepEqual(await fotoV1(), finanzas);
});
escenario('Checkpoint historico corrupto conserva evidencia y bloqueo', async () => {
  const e = await legado(), cp = structuredClone(e.s.data().checkpoint); cp.cursor.secuencia++;
  await e.ref.update({checkpoint:cp});
  assert.equal((await herramienta().avanzar(e.p,e.avance.fence)).estado,'fallida');
  assert.equal((await e.ref.get()).data().huellaSoftware,e.s.data().huellaSoftware);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado,'bloqueado');
});
for (const caso of ['protocolo','generacion']) escenario('Reanudacion historica con ' + caso + ' incoherente rechaza', async () => {
  const e = await legado();
  if(caso==='protocolo') await db.doc(`${B}/finanzas_control/protocolo`).update({estado:'desconocido'});
  else await e.gen.update({activa:true});
  const antes = await e.ref.get(); await assert.rejects(herramienta().avanzar(e.p,e.avance.fence));
  assert.deepEqual((await e.ref.get()).data(),antes.data());
});

escenario('admin-2 autentico: lectura bajo admin-3 no altera checkpoint, generacion ni updateTime', async () => {
  const e = await legado('admin-2'), finanzas = await fotoV1();
  assert.equal(e.s.data().inventarioId, 'admin-2');
  const r = await herramienta().iniciar(e.p); assert.equal(r.fence, e.avance.fence);
  for (const [ref, anterior] of [[e.ref, e.s], [e.gen, e.g]]) {
    const actual = await ref.get(); assert.deepEqual(actual.data(), anterior.data());
    assert.equal(version(actual), version(anterior));
  }
  assert.deepEqual(await fotoV1(), finanzas);
});
escenario('admin-2 reanuda hasta verificar con identidad original; D2 inactiva sigue sin ser escribible por V2', async () => {
  const e = await legado('admin-2'), finanzas = await fotoV1();
  const r = await terminar(e.p); assert.equal(r.estado, 'verificada');
  const final = await e.ref.get(), generacion = await e.gen.get();
  for (const k of ['inventarioId', 'huellaSoftware', 'versionContratoInventario', 'corte', 'identidad', 'manifiesto', 'epoca']) {
    assert.deepEqual(final.data()[k], e.s.data()[k]);
  }
  assert.equal(generacion.data().inventarioId, 'admin-2'); assert.equal(generacion.data().activa, false);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
  assert.equal((await db.doc(`${B}/finanzas_control/generacion_v2`).get()).exists, false);
  const saldos = await e.gen.collection('saldos').get();
  assert.ok(saldos.size > 0); assert.ok(saldos.docs.every(d => !Object.hasOwn(d.data(), 'proyeccion')));
  const v2 = require('../../finanzas_core/adaptador_firestore_v2').crearAdaptadorFirestoreV2({ db, FieldValue });
  const entrada = await solicitud('gasto', { cuentaId: e.m.caja, categoriaId: e.m.gasto, montoMinor: 1 }, '2026-11');
  entrada.contextoV2 = { versionContrato: 1, epoca: 1, generacionId: e.p.ejecucionId };
  await assert.rejects(v2.ejecutar(entrada), codigo('PROTOCOLO_V2_INCOMPATIBLE'));
  assert.deepEqual((await e.gen.get()).data(), generacion.data());
  assert.equal(version(await e.gen.get()), version(generacion));
  assert.deepEqual(await fotoV1(), finanzas);
});
for (const fase of ['antes', 'despues']) escenario('admin-2 recupera interrupcion ' + fase + ' bajo admin-3 sin doble avance', async () => {
  const e = await legado('admin-2'); let hecho = false;
  const h = herramienta(envolver(momento => { if (!hecho && momento === fase) { hecho = true; throw Error('Fallo simulado'); } }));
  await assert.rejects(h.avanzar(e.p, e.avance.fence));
  const r = await herramienta().avanzar(e.p, e.avance.fence);
  assert.equal(r.fence, 2); assert.equal(r.cursor.secuencia, 4);
  assert.equal((await e.ref.get()).data().huellaSoftware, e.s.data().huellaSoftware);
});
escenario('admin-2 mantiene fencing al competir dos ejecutores y otro operador bajo admin-3', async () => {
  const e = await legado('admin-2');
  await assert.rejects(herramienta().avanzar({ ...e.p, operador: 'c'.repeat(64) }, e.avance.fence), codigo('DEMO_FENCING'));
  const rs = await Promise.all([herramienta().avanzar(e.p, e.avance.fence), herramienta().avanzar(e.p, e.avance.fence)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].fence, 2); assert.equal(rs[0].cursor.secuencia, 4);
});
escenario('admin-2 con huella no acreditada rechaza sin reescribir evidencia', async () => {
  const e = await legado('admin-2');
  await e.ref.update({ huellaSoftware: '0'.repeat(64) }); await e.gen.update({ huellaSoftware: '0'.repeat(64) });
  const anterior = await e.ref.get();
  await assert.rejects(herramienta().avanzar(e.p, e.avance.fence), codigo('DEMO_IDENTIDAD_NO_COMPATIBLE'));
  const actual = await e.ref.get(); assert.deepEqual(actual.data(), anterior.data()); assert.equal(version(actual), version(anterior));
});

escenario('admin-3 autentico se consulta bajo admin-4 sin reescribir su checkpoint', async () => {
  const e = await legado('admin-3'), antes = await fotoV1();
  await herramienta().iniciar(e.p);
  for (const [ref, previo] of [[e.ref, e.s], [e.gen, e.g]]) {
    const s = await ref.get(); assert.deepEqual(s.data(), previo.data()); assert.equal(version(s), version(previo));
  }
  assert.deepEqual(await fotoV1(), antes);
});
escenario('admin-3 recupera post-commit y fencing bajo admin-4 preservando identidad', async () => {
  const e = await legado('admin-3'); let perdido = false;
  const h = herramienta(envolver(fase => { if (fase === 'despues' && !perdido) { perdido = true; throw Error('Respuesta perdida'); } }));
  await assert.rejects(h.avanzar(e.p, e.avance.fence));
  await assert.rejects(herramienta().avanzar({ ...e.p, operador: 'c'.repeat(64) }, e.avance.fence), codigo('DEMO_FENCING'));
  const rs = await Promise.all([herramienta().avanzar(e.p, e.avance.fence), herramienta().avanzar(e.p, e.avance.fence)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].fence, 2);
  assert.equal((await terminar(e.p)).estado, 'verificada');
  assert.equal((await e.ref.get()).data().inventarioId, 'admin-3');
  assert.equal((await e.ref.get()).data().huellaSoftware, e.s.data().huellaSoftware);
});
escenario('checkpoint D2 nuevo admin-6 recupera respuesta perdida sin doble acumulacion', async () => {
  await mixto(); const p = parametros(); await herramienta().iniciar(p); let perdido = false;
  const h = herramienta(envolver(fase => { if (fase === 'despues' && !perdido) { perdido = true; throw Error('Respuesta perdida'); } }));
  await assert.rejects(h.avanzar(p, 0)); const r = await herramienta().avanzar(p, 0);
  assert.equal(r.fence, 1); assert.equal(r.cursor.secuencia, 2);
  const ref = db.doc(`${B}/finanzas_ejecuciones_demo/${p.ejecucionId}`), antes = await ref.get();
  assert.equal(antes.data().inventarioId, 'admin-6'); await herramienta().iniciar(p);
  assert.equal(version(await ref.get()), version(antes)); assert.equal((await terminar(p)).estado, 'verificada');
});
escenario('fuentes admin-6 verificadas preparan V2 inactivo sin reinterpretar D2', async () => {
  const fuentes = require('../fuentes').obtenerContextoFuentes(); assert.equal(fuentes.metadatos.inventarioId, 'admin-6');
  const e = await legado('admin-3'); assert.equal((await terminar(e.p)).estado, 'verificada');
  const anteriores = await Promise.all([e.ref.get(), e.gen.get()]), finanzas = await fotoV1();
  const { crearPreparadorDemo } = require('../../contabilidad_generaciones_v2_demo/preparacion');
  const p = { iglesiaId: I, ejecucionId: 'preparacion_admin4', generacionId: 'generacion_admin4',
    operador: 'd'.repeat(64), epoca: 1, periodoId: '2026-11', pagina: 2, lote: 2 };
  const crear = () => crearPreparadorDemo({ db, custodia: { verificar: () => !detener } });
  let r = await crear().iniciar(p); r = await crear().avanzar(p, r.fence);
  const ref = db.doc(`${B}/finanzas_preparaciones_v2_demo/${p.ejecucionId}`), cp = await ref.get();
  await crear().iniciar(p); assert.equal(version(await ref.get()), version(cp));
  for (let i = 0; i < 30 && r.estado !== 'preparada'; i++) r = await crear().avanzar(p, r.fence);
  assert.equal(r.estado, 'preparada'); const gen = await db.doc(`${B}/finanzas_generaciones_demo/${p.generacionId}`).get();
  assert.equal(gen.data().activa, false); assert.equal((await ref.get()).data().acreditacion, 'PENDIENTE');
  assert.throws(() => fuentes.comprobarEjecucion((cp.data()), gen.data(), p), codigo('DEMO_IDENTIDAD_NO_COMPATIBLE'));
  for (const anterior of anteriores) {
    const ahora = await anterior.ref.get(); assert.deepEqual(ahora.data(), anterior.data()); assert.equal(version(ahora), version(anterior));
  }
  assert.deepEqual(await fotoV1(), finanzas);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
  assert.equal((await db.doc(`${B}/finanzas_control/generacion_v2`).get()).exists, false);
});

escenario('admin-4 autentico se consulta bajo admin-5 sin reescribir checkpoint ni updateTime', async () => {
  const e = await legado('admin-4'), antes = await fotoV1();
  await herramienta().iniciar(e.p);
  for (const [ref, previo] of [[e.ref, e.s], [e.gen, e.g]]) {
    const ahora = await ref.get(); assert.deepEqual(ahora.data(), previo.data()); assert.equal(version(ahora), version(previo));
  }
  assert.deepEqual(await fotoV1(), antes);
});
escenario('admin-4 recupera respuesta perdida y fencing bajo admin-5 con identidad original', async () => {
  const e = await legado('admin-4'); let perdido = false;
  const h = herramienta(envolver(fase => { if (fase === 'despues' && !perdido) { perdido = true; throw Error('Respuesta perdida'); } }));
  await assert.rejects(h.avanzar(e.p, e.avance.fence));
  await assert.rejects(herramienta().avanzar({ ...e.p, operador: 'c'.repeat(64) }, e.avance.fence), codigo('DEMO_FENCING'));
  const rs = await Promise.all([herramienta().avanzar(e.p, e.avance.fence), herramienta().avanzar(e.p, e.avance.fence)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].fence, 2);
  assert.equal((await terminar(e.p)).estado, 'verificada');
  const final = (await e.ref.get()).data();
  for (const k of ['inventarioId', 'huellaSoftware', 'versionContratoInventario', 'identidad', 'corte', 'manifiesto', 'epoca']) {
    assert.deepEqual(final[k], e.s.data()[k]);
  }
  assert.equal((await e.gen.get()).data().activa, false);
});


escenario('admin-5 autentico se consulta bajo admin-6 sin reescribir datos ni updateTime', async () => {
  const e = await legado('admin-5'), antes = await fotoV1(); await herramienta().iniciar(e.p);
  for (const [ref, previo] of [[e.ref,e.s],[e.gen,e.g]]) { const s=await ref.get(); assert.deepEqual(s.data(),previo.data());assert.equal(version(s),version(previo)); }
  assert.deepEqual(await fotoV1(),antes);
});
escenario('admin-5 recupera respuesta perdida y fencing bajo admin-6 con identidad original', async () => {
  const e=await legado('admin-5');let perdido=false;
  const h=herramienta(envolver(fase=>{if(fase==='despues'&&!perdido){perdido=true;throw Error('Respuesta perdida');}}));
  await assert.rejects(h.avanzar(e.p,e.avance.fence));
  await assert.rejects(herramienta().avanzar({...e.p,operador:'c'.repeat(64)},e.avance.fence),codigo('DEMO_FENCING'));
  const r=await Promise.all([herramienta().avanzar(e.p,e.avance.fence),herramienta().avanzar(e.p,e.avance.fence)]);assert.deepEqual(r[0],r[1]);
  assert.equal((await terminar(e.p)).estado,'verificada');const fin=(await e.ref.get()).data();
  for(const k of ['inventarioId','huellaSoftware','versionContratoInventario','identidad','corte','manifiesto','epoca'])assert.deepEqual(fin[k],e.s.data()[k]);
  assert.equal((await e.gen.get()).data().activa,false);assert.equal((await db.doc(B+'/finanzas_control/protocolo').get()).data().estado,'bloqueado');
});
