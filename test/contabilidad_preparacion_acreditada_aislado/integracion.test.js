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
const { crearPreparador } = require('../../functions/contabilidad_preparacion_acreditada_demo/preparacion');
const { crearVerificador } = require('../../functions/contabilidad_preparacion_acreditada_demo/verificacion');
const { crearPreparadorDemo } = require('../../functions/contabilidad_generaciones_v2_demo/preparacion');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { crearAdaptadorFirestoreV2 } = require('../../functions/finanzas_core/adaptador_firestore_v2');
const { sembrar, parametros, foto, conservar, B } = require('../contabilidad_generaciones_v2_aislado/soporte');
const G = `${B}/finanzas_generaciones_demo/nueva_001`;
const R = `${B}/finanzas_preparaciones_procedencia_demo/preparacion_001`;
const E = `${B}/finanzas_evidencias_preparacion_demo/preparacion_001`;
const C = `${B}/finanzas_preparaciones_procedencia_control/cerrojo`;
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
  assert.equal(r.procedimiento, 'preparacion_v2_procedencia_ensayo_1');
  assert.equal(r.runtime.inventarioId, 'ensayo-fin-1E-1'); assert.equal(r.runtime.acreditacionAdministrativa, 'PENDIENTE');
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
test('D2 creada por software admin-4 original se conserva con versiones exactas', async () => {
  const historia = process.env.FESYNC_1E_HISTORICO; assert.ok(historia, 'Solo desde arnes protegido');
  const fuentes = require(path.join(historia, 'functions/contabilidad_demo/fuentes'));
  assert.equal(fuentes.obtenerContextoFuentes('admin-4').metadatos.inventarioId, 'admin-4');
  // Retirar SOLO antecedentes sinteticos de esta fixture antes de crear D2 real.
  await db.recursiveDelete(db.doc(`${B}/finanzas_generaciones_demo/d2_original`));
  await db.doc(`${B}/finanzas_ejecuciones_demo/d2_original`).delete();
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'operativo_v1' });
  const { crearTransicionDemo, ESCRITORES } = require(path.join(historia, 'functions/contabilidad_demo/transicion'));
  const h = crearTransicionDemo({ db, custodia: { emuladorExclusivo: true, administrador: true,
    escritores: ESCRITORES }, inventarioId: 'admin-4' });
  const p = { iglesiaId: parametros().iglesiaId, ejecucionId: 'd2_admin4_real', operador: 'd'.repeat(64),
    periodos: ['2026-10', '2026-11'], pagina: 2, lote: 2 };
  let r = await h.iniciar(p);
  for (let n = 0; n < 100 && !['verificada', 'fallida'].includes(r.estado); n++) r = await h.avanzar(p, r.fence);
  assert.equal(r.estado, 'verificada');
  const antes = await foto(db); await terminar(); await conservar(db, antes);
  await crearVerificador(opciones()).verificar(parametros());
});

test('evidencia local original no se convierte a admin-5 ni se adopta por cambiar el registro', async () => {
  const origen = process.env.FESYNC_1F_LOCAL_ORIGINAL; assert.ok(origen);
  const rt = require(path.join(origen, 'functions/contabilidad_preparacion_acreditada_demo/runtime'));
  const oldRuntime = rt.autorizarRuntime({ manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo_admin4.json')),
    sha256Autorizado: 'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2' });
  const crear = require(path.join(origen, 'functions/contabilidad_preparacion_acreditada_demo/preparacion')).crearPreparador;
  const verificar = require(path.join(origen, 'functions/contabilidad_preparacion_acreditada_demo/verificacion')).crearVerificador;
  const opt = { db, runtime: oldRuntime, custodia: { verificar: () => custodia } };
  await terminar(crear(opt)); const antes = await foto(db);
  const anterior = (await db.doc(R).get()).data();
  assert.equal(anterior.runtime.huellaSoftware, 'c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2');
  assert.equal(anterior.runtime.acreditacionAdministrativa, 'PENDIENTE');
  assert.equal((await verificar(opt).verificar(parametros())).elegibleActivacion, false);
  await assert.rejects(crearVerificador(opciones()).verificar(parametros()), x => x.codigo === 'E_PROCEDENCIA_INCOMPATIBLE');
  await assert.rejects(crearPreparador(opciones()).iniciar(parametros()), x => x.codigo === 'E_PROCEDENCIA_INCOMPATIBLE');
  const f = require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-6');
  const generacion = (await db.doc(G).get()).data();
  assert.throws(() => f.comprobarEjecucion(anterior, generacion, parametros()));
  assert.deepEqual(await foto(db), antes);
});
