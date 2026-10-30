'use strict';
const { autorizar } = require('./autorizacion');
const runtime = autorizar(); // Antes de importar el SDK o construir cualquier cliente.
require('../../functions/contabilidad_preparacion_acreditada_demo/entorno').verificarEntorno();
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const reglasReq = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment } = reglasReq('@firebase/rules-unit-testing');
const { crearPreparador } = require('../../functions/contabilidad_preparacion_v2_admin_demo/preparacion');
const { crearVerificador } = require('../../functions/contabilidad_preparacion_v2_admin_demo/verificacion');
const { crearPreparadorDemo } = require('../../functions/contabilidad_generaciones_v2_demo/preparacion');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { crearAdaptadorFirestoreV2 } = require('../../functions/finanzas_core/adaptador_firestore_v2');
const { sembrar, parametros, foto, conservar, B } = require('../contabilidad_generaciones_v2_aislado/soporte');
const G = `${B}/finanzas_generaciones_demo/nueva_001`;
const R = `${B}/finanzas_preparaciones_admin_v2_demo/preparacion_001`;
const E = `${B}/finanzas_evidencias_admin_v2_demo/preparacion_001`;
const C = `${B}/finanzas_preparaciones_admin_v2_control/cerrojo`;
let db, reglas, semilla, custodia = false;
before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: { host: '127.0.0.1', port: 8088,
    rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
  custodia = true;
});
beforeEach(async () => { await reglas.clearFirestore(); semilla = await sembrar(db, FieldValue); });
after(async () => { custodia = false; if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });
function opciones(cliente = db) { return { db: cliente, runtime, custodia: { verificar: () => custodia } }; }
function arnes({ antesCommit, despuesCommit, alEscribir, soloLectura = false } = {}) {
  const m = { escrituras: [], intentos: 0 };
  const cliente = { projectId: db.projectId, _settings: db._settings, doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: async cb => {
      const r = await db.runTransaction(async tx => {
        m.intentos++; let escribiendo = false;
        const proxy = new Proxy(tx, { get(t, k) {
          if (k === 'get') return ref => { assert.equal(escribiendo, false); return t.get(ref); };
          if (['create', 'update', 'set', 'delete'].includes(k)) return (...args) => {
            assert.equal(soloLectura, false, 'El verificador intento escribir'); escribiendo = true;
            m.escrituras.push(args[0].path); if (alEscribir) alEscribir(); return t[k](...args);
          };
          const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
        } });
        const v = await cb(proxy); if (antesCommit) await antesCommit(); return v;
      });
      if (despuesCommit) await despuesCommit(); return r;
    } };
  return { h: crearPreparador(opciones(cliente)), v: crearVerificador(opciones(cliente)), m };
}
async function terminar(h = crearPreparador(opciones()), p = parametros()) {
  let r = await h.iniciar(p);
  for (let n = 0; n < 100 && !['verificada', 'fallida'].includes(r.estado); n++) r = await h.avanzar(p, r.fence);
  assert.equal(r.estado, 'verificada'); return r;
}
async function hasta(h, estado) {
  let r = await h.iniciar(parametros());
  for (let n = 0; n < 100 && r.estado !== estado; n++) r = await h.avanzar(parametros(), r.fence);
  assert.equal(r.estado, estado); return r;
}
test('libro mixto: procedencia persistida, sello con versiones reales, V1/D2 conservados', async () => {
  const antes = await foto(db), { h, v, m } = arnes();
  await terminar(h); await conservar(db, antes);
  const r = (await db.doc(R).get()).data(), evidencia = (await db.doc(E).get()).data();
  assert.equal(r.procedimiento, 'preparacion_v2_procedencia_administrativa_1');
  assert.equal(r.runtime.inventarioId, 'ensayo-fin-1H-1'); assert.equal(r.runtime.acreditacionAdministrativa, 'PENDIENTE');
  assert.equal(r.estado, 'verificada'); assert.equal(evidencia.fence, r.fence);
  for (const d of evidencia.documentos) {
    const s = await db.doc(d.ruta).get(); assert.equal(d.version, `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`);
    assert.match(d.contenido, /^[a-f0-9]{64}$/);
  }
  const verificada = await v.verificar(parametros()); assert.equal(verificada.elegibleActivacion, false);
  assert.equal(verificada.acreditacionAdministrativa, 'PENDIENTE');
  assert.ok(m.escrituras.every(ruta => ruta.startsWith(G + '/') || [G, R, E, C].includes(ruta)));
  assert.equal((await db.doc(G).get()).data().activa, false);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
  assert.equal((await db.doc(`${B}/finanzas_control/generacion_v2`).get()).exists, false);
});
test('libro vacio: preparacion y evidencia completas sin fabricar historia', async () => {
  await reglas.clearFirestore(); await sembrar(db, FieldValue, false); await terminar();
  assert.equal((await db.doc(`${G}/control/libro`).get()).data().revision, 0);
  assert.equal((await db.doc(`${G}/control/libro`).get()).data().ultimoMovimientoId, null);
  await crearVerificador(opciones()).verificar(parametros());
});
test('reversiones de ingreso/gasto/transferencia entre periodos', async () => {
  await reglas.clearFirestore(); await sembrar(db, FieldValue, true, ['gasto', 'ingreso', 'transferencia']);
  await terminar(); const d = (await db.doc(`${G}/periodos/2026-11`).get()).data().datos;
  assert.equal(d.ingresosNetosMinor, -2000); assert.equal(d.gastosNetosMinor, -1000);
  await crearVerificador(opciones()).verificar(parametros());
});
test('checkpoint antiguo PENDIENTE no es procedencia nueva', async () => {
  const viejo = crearPreparadorDemo({ db, custodia: { verificar: () => true } });
  await viejo.iniciar(parametros({ generacionId: 'vieja_aislada', ejecucionId: 'vieja_aislada' }));
  const datos = (await db.doc(`${B}/finanzas_preparaciones_v2_demo/vieja_aislada`).get()).data();
  await db.doc(R).create(datos); const antes = await foto(db);
  await assert.rejects(crearVerificador(opciones()).verificar(parametros())); assert.deepEqual(await foto(db), antes);
});
for (const estado of ['conciliando', 'preparando', 'verificando']) test('generacion parcial rechazada: ' + estado, async () => {
  const h = crearPreparador(opciones()); await hasta(h, estado); const antes = await foto(db);
  await assert.rejects(crearVerificador(opciones()).verificar(parametros()), e => e.codigo === 'E_NO_VERIFICADA');
  assert.deepEqual(await foto(db), antes);
});
for (const tipo of ['omitido', 'adicional', 'alterado', 'reescrito', 'subcoleccion', 'anidada']) test('destino ' + tipo + ' detectado sin reparar', async () => {
  await terminar(); const ref = db.doc(`${G}/control/libro`);
  if (tipo === 'omitido') await ref.delete();
  if (tipo === 'adicional') await db.doc(`${G}/saldos/ajeno`).create({ falso: true });
  if (tipo === 'alterado') await ref.update({ revision: 999 });
  if (tipo === 'reescrito') {
    // Firestore puede optimizar un set identico sin cambiar updateTime.
    const original = (await ref.get()).data(); await ref.update({ revision: 999 }); await ref.set(original);
  }
  if (tipo === 'subcoleccion') await db.doc(`${G}/intrusa/doc`).create({ falso: true });
  if (tipo === 'anidada') await db.doc(`${G}/control/libro/intrusa/doc`).create({ falso: true });
  const antes = await foto(db); await assert.rejects(crearVerificador(opciones()).verificar(parametros()));
  assert.deepEqual(await foto(db), antes);
});
for (const [campo, valor] of Object.entries({ iglesiaId: 'otra', epoca: 2, generacionId: 'otra',
  versionAlgoritmo: 9, versionProcedimiento: 9, versionEvidencia: 9,
  'runtime.inventarioId': 'admin-4', 'runtime.huellaSoftware': 'f'.repeat(64), 'corte.secuencia': 0,
  'checkpoint.cursor.secuencia': 999 })) test('checkpoint/procedencia alterada ' + campo, async () => {
  await terminar(); await db.doc(R).update({ [campo]: valor }); const antes = await foto(db);
  await assert.rejects(crearVerificador(opciones()).verificar(parametros())); assert.deepEqual(await foto(db), antes);
});
for (const campo of ['sello', 'versionAlgoritmo', 'vinculo.runtime.inventarioId', 'documentos']) test('evidencia alterada ' + campo, async () => {
  await terminar(); await db.doc(E).update({ [campo]: campo === 'documentos' ? [] : 'desconocido' });
  const antes = await foto(db); await assert.rejects(crearVerificador(opciones()).verificar(parametros()));
  assert.deepEqual(await foto(db), antes);
});
test('corte reescrito con mismo contenido se rechaza por version', async () => {
  const h = crearPreparador(opciones()); const r = await h.iniciar(parametros());
  const ref = db.doc(`${B}/finanzas_control/libro`), original = (await ref.get()).data();
  await ref.update({ ultimaSecuencia: 999 }); await ref.set(original);
  await assert.rejects(h.avanzar(parametros(), r.fence));
});
test('dos operadores no comparten ejecucion ni generacion', async () => {
  const h = crearPreparador(opciones());
  const r = await Promise.allSettled([h.iniciar(parametros()), h.iniciar(parametros({ operador: 'c'.repeat(64) }))]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.filter(x => x.status === 'rejected').length, 1);
});
test('dos avances del mismo fence producen un commit y replay', async () => {
  const h = crearPreparador(opciones()), r = await h.iniciar(parametros());
  const a = await Promise.all([h.avanzar(parametros(), r.fence), h.avanzar(parametros(), r.fence)]);
  assert.deepEqual(a[0], a[1]); assert.equal(a[0].fence, r.fence + 1);
  await assert.rejects(h.avanzar(parametros(), 99), e => e.codigo === 'E_FENCING');
});
for (const estado of ['conciliando', 'preparando', 'verificando']) test('respuesta perdida post-commit en ' + estado, async () => {
  const normal = crearPreparador(opciones()), r = await hasta(normal, estado); let primera = true;
  const { h } = arnes({ despuesCommit: () => { if (primera) { primera = false; throw Error('respuesta perdida'); } } });
  await assert.rejects(h.avanzar(parametros(), r.fence), e => e.codigo === 'E_RESULTADO_INCIERTO');
  const antes = await foto(db); const repetido = await h.avanzar(parametros(), r.fence);
  assert.equal(repetido.fence, r.fence + 1); assert.deepEqual(await foto(db), antes);
});
test('error antes de commit no deja cabecera, cerrojo ni checkpoint parcial', async () => {
  const antes = await foto(db), { h } = arnes({ antesCommit: () => { throw Error('antes commit'); } });
  await assert.rejects(h.iniciar(parametros()), e => e.codigo === 'E_RESULTADO_INCIERTO');
  assert.deepEqual(await foto(db), antes);
});
test('fallo dentro del lote no confirma ningun documento', async () => {
  const h = crearPreparador(opciones()), r = await hasta(h, 'preparando'), antes = await foto(db);
  let cuenta = 0; const fallo = arnes({ alEscribir: () => { if (++cuenta === 2) throw Error('lote'); } });
  await assert.rejects(fallo.h.avanzar(parametros(), r.fence)); assert.deepEqual(await foto(db), antes);
});
test('verificador es solo lectura; reconsulta no cambia updateTime', async () => {
  await terminar(); const antes = await foto(db), { v, m } = arnes({ soloLectura: true });
  await v.verificar(parametros()); await v.verificar(parametros());
  assert.equal(m.escrituras.length, 0); assert.deepEqual(await foto(db), antes);
});
test('lectura fallida se distingue de divergencia sin conceder exito', async () => {
  await terminar(); const { v } = arnes({ antesCommit: () => { throw Error('transporte'); } });
  await assert.rejects(v.verificar(parametros()), e => e.codigo === 'E_LECTURA_INCIERTA');
});
test('V1 y V2 reales rechazan nuevas operaciones bajo bloqueo', async () => {
  await terminar(); const e = await semilla.solicitud('gasto', { cuentaId: semilla.caja, categoriaId: semilla.gasto, montoMinor: 1 }, '2026-11');
  const antes = await foto(db);
  await assert.rejects(crearAdaptadorFirestore({ db, FieldValue }).ejecutar(e), x => x.codigo === 'PROTOCOLO_ESCRITURA_BLOQUEADA');
  await assert.rejects(crearAdaptadorFirestoreV2({ db, FieldValue }).ejecutar({ ...e,
    contextoV2: { versionContrato: 1, epoca: 1, generacionId: 'nueva_001' } }), x => x.codigo === 'PROTOCOLO_V2_INCOMPATIBLE');
  assert.deepEqual(await foto(db), antes);
});
test('protocolo cambiado o puntero agregado impiden sellar', async () => {
  const h = crearPreparador(opciones()), r = await hasta(h, 'verificando');
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'transicion' });
  await assert.rejects(h.avanzar(parametros(), r.fence)); assert.equal((await db.doc(E).get()).exists, false);
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'bloqueado' });
  await db.doc(`${B}/finanzas_control/generacion_v2`).create({ falso: true });
  await assert.rejects(h.avanzar(parametros(), r.fence));
});
test('cambio concurrente del protocolo invalida commit y reintento del preparador', async () => {
  let primera = true;
  const { h } = arnes({ antesCommit: async () => {
    if (primera) { primera = false; await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'transicion' }); }
  } });
  await assert.rejects(h.iniciar(parametros()));
  assert.equal((await db.doc(G).get()).exists, false);
  assert.equal((await db.doc(R).get()).exists, false);
  assert.equal((await db.doc(C).get()).exists, false);
});
test('corrupcion de destino durante preparacion conserva evidencia fallida sin reparar', async () => {
  const h = crearPreparador(opciones()); let r = await hasta(h, 'preparando'); r = await h.avanzar(parametros(), r.fence);
  await db.doc(`${G}/control/libro`).update({ revision: 999 });
  const anterior = (await db.doc(`${G}/control/libro`).get()).data();
  const fin = await h.avanzar(parametros(), r.fence); assert.equal(fin.estado, 'fallida');
  assert.deepEqual((await db.doc(`${G}/control/libro`).get()).data(), anterior);
  assert.equal((await db.doc(E).get()).exists, false);
});


test('evidencia PENDIENTE creada por runtime original no se adopta ni modifica', async () => {
  const raiz = process.env.FESYNC_1H_HISTORICO; assert.ok(raiz, 'Solo desde lanzador protegido');
  const rt = require(path.join(raiz, 'functions/contabilidad_preparacion_acreditada_demo/runtime'));
  const cap = rt.autorizarRuntime({ manifiesto: fs.readFileSync(path.join(__dirname, '../contabilidad_preparacion_acreditada_aislado/runtime_ensayo_admin5.json')),
    sha256Autorizado: '755eb57a6874f0d8ed0f0e80dc4e2187509844a076ffdaf7b988565672a8f9a6' });
  const viejo = require(path.join(raiz, 'functions/contabilidad_preparacion_acreditada_demo/preparacion')).crearPreparador;
  const p = parametros({ generacionId: 'local_original', ejecucionId: 'local_original' });
  await terminar(viejo({ db, runtime: cap, custodia: { verificar: () => custodia } }), p);
  const antes = await foto(db);
  const original = (await db.doc(B + '/finanzas_preparaciones_procedencia_demo/local_original').get()).data();
  assert.equal(original.runtime.acreditacionAdministrativa, 'PENDIENTE');
  await assert.rejects(crearPreparador(opciones()).iniciar(parametros()), e => e.codigo === 'E_OTRO_PROCEDIMIENTO_OCUPADO');
  await assert.rejects(crearPreparador(opciones()).iniciar(p));
  assert.deepEqual(await foto(db), antes);
});

for (const nombre of ['finanzas_preparaciones_v2_control', 'finanzas_preparaciones_procedencia_control', 'finanzas_transicion_demo'])
  test('cerrojo de otro procedimiento bloquea sin liberarlo: ' + nombre, async () => {
    await db.doc(B + '/' + nombre + '/cerrojo').create({ ajeno: true });
    const antes = await foto(db);
    await assert.rejects(crearPreparador(opciones()).iniciar(parametros()), e => e.codigo === 'E_OTRO_PROCEDIMIENTO_OCUPADO');
    assert.deepEqual(await foto(db), antes);
  });

test('custodia y revalidacion de fuentes permanecen fuera del callback transaccional', async t => {
  let dentro = false, verificaciones = 0;
  const leer = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (r, ...args) => {
    assert.equal(dentro, false, 'Lectura FS en callback'); return leer(r, ...args);
  });
  const cliente = { projectId: db.projectId, _settings: db._settings, doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: cb => db.runTransaction(async tx => { dentro = true; try { return await cb(tx); } finally { dentro = false; } }) };
  const opt = { db: cliente, runtime, custodia: { verificar: () => { assert.equal(dentro, false); verificaciones++; return custodia; } } };
  await terminar(crearPreparador(opt)); await crearVerificador(opt).verificar(parametros());
  assert.ok(verificaciones > 3);
});

test('reanudacion en otra instancia conserva procedimiento e identidad original', async () => {
  const r = await crearPreparador(opciones()).iniciar(parametros());
  const antes = (await db.doc(R).get()).data();
  const respuesta = await crearPreparador(opciones()).avanzar(parametros(), r.fence);
  const despues = (await db.doc(R).get()).data();
  assert.deepEqual(despues.runtime, antes.runtime); assert.equal(despues.procedimiento, antes.procedimiento);
  assert.equal(respuesta.acreditacionAdministrativa, 'PENDIENTE');
  assert.equal((await db.doc(G).get()).data().activa, false);
});

test('fuentes cambiadas entre pasos impiden reanudar antes de DB', async t => {
  const h = crearPreparador(opciones()), r = await h.iniciar(parametros()), antes = await foto(db);
  const leer = fs.readFileSync.bind(fs), objetivo = path.resolve(__dirname, '../../functions/contabilidad_preparacion_v2_admin_demo/preparacion.js');
  t.mock.method(fs, 'readFileSync', (f, ...args) => path.resolve(String(f)) === objetivo ? Buffer.concat([leer(f), Buffer.from('// cambio')]) : leer(f, ...args));
  await assert.rejects(h.avanzar(parametros(), r.fence), /E_RUNTIME_NO_AUTORIZADO/);
  assert.deepEqual(await foto(db), antes);
});

test('API existente inicia y verifica NUEVA preparacion admin-6 autentica, sin activar', async () => {
  const rt = require('../../functions/contabilidad_preparacion_v2_admin_demo/runtime');
  const cap = rt.autorizarAdministrativo({ inventarioId: 'admin-6' });
  const identidad = rt.exigirRuntime(cap, true), antes = await foto(db);
  const p = parametros({ ejecucionId: 'admin6_nueva', generacionId: 'admin6_nueva' });
  const opt = { ...opciones(), runtime: cap };
  await terminar(crearPreparador(opt), p); await conservar(db, antes);
  const r = (await db.doc(B + '/finanzas_preparaciones_admin_v2_demo/admin6_nueva').get()).data();
  const e = (await db.doc(B + '/finanzas_evidencias_admin_v2_demo/admin6_nueva').get()).data();
  assert.deepEqual(r.runtime, identidad); assert.deepEqual(e.vinculo.runtime, identidad);
  assert.equal(r.runtime.acreditacionAdministrativa, 'ACREDITADA');
  const fin = await crearVerificador(opt).verificar(p);
  assert.equal(fin.acreditacionAdministrativa, 'ACREDITADA'); assert.equal(fin.elegibleActivacion, false);
  assert.deepEqual(fin.runtimeCreacion, identidad); assert.deepEqual(fin.runtimeVerificador, identidad);
  assert.equal((await db.doc(B + '/finanzas_generaciones_demo/admin6_nueva').get()).data().activa, false);
  assert.equal((await db.doc(B + '/finanzas_control/protocolo').get()).data().estado, 'bloqueado');
  assert.equal((await db.doc(B + '/finanzas_control/generacion_v2').get()).exists, false);
});

test('evidencia H PENDIENTE autentica no se convierte en admin-6 ni se reescribe', async () => {
  const origen = process.env.FESYNC_1I_PUENTE_LOCAL_ORIGINAL; assert.ok(origen);
  const rt = require(path.join(origen, 'functions/contabilidad_preparacion_v2_admin_demo/runtime'));
  const anterior = rt.autorizarEnsayo({ manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin5.json')),
    sha256Autorizado: '7fd4230de6414d577b91bb8850472727b6c0b8bd0bc56c4b0c672e231b8abd3b' });
  const opt = { ...opciones(), runtime: anterior };
  await terminar(require(path.join(origen, 'functions/contabilidad_preparacion_v2_admin_demo/preparacion')).crearPreparador(opt));
  assert.equal((await require(path.join(origen, 'functions/contabilidad_preparacion_v2_admin_demo/verificacion')).crearVerificador(opt).verificar(parametros())).elegibleActivacion, false);
  const antes = await foto(db);
  const cap = require('../../functions/contabilidad_preparacion_v2_admin_demo/runtime').autorizarAdministrativo({ inventarioId: 'admin-6' });
  for (const optActual of [opciones(), { ...opciones(), runtime: cap }]) {
    await assert.rejects(crearVerificador(optActual).verificar(parametros()), e => e.codigo === 'E_PROCEDENCIA_INCOMPATIBLE');
    await assert.rejects(crearPreparador(optActual).iniciar(parametros()), e => e.codigo === 'E_PROCEDENCIA_INCOMPATIBLE');
  }
  assert.equal((await db.doc(R).get()).data().runtime.acreditacionAdministrativa, 'PENDIENTE');
  assert.deepEqual(await foto(db), antes);
});
