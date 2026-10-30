const { verificarEntornoEmulador } = require('../../functions/migraciones/pertenencia_simulacion');
verificarEntornoEmulador({ proyecto: process.env.GCLOUD_PROJECT,
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
  storageHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST });

// Todo SDK y toda escritura quedan detrás de la guarda demo/local.
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = requireFunctions('google-auth-library');
const requireReglas = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { initializeTestEnvironment, assertFails } = requireReglas('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, setLogLevel } = requireReglas('firebase/firestore');
const { migrarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_ejecucion');
const { pertenenciaIdValido } = require('../../functions/pertenencia');
setLogLevel('silent');
let db;
let reglas;
const perfilRef = () => db.collection('usuarios_globales').doc('legado');
const comprobanteRef = () => db.collection('migraciones_pertenencia').doc('legado');
const datosOriginales = () => ({ iglesiaId: 'congregacion-demo', rolGlobal: 'servidor',
  nombre: 'Nombre ficticio', preferencias: { tema: 'oscuro' } });

async function seleccion() {
  const perfil = await perfilRef().get();
  return { uid: 'legado', iglesiaId: 'congregacion-demo',
    version: `${perfil.updateTime.seconds}:${perfil.updateTime.nanoseconds}` };
}

async function ejecutar(extra = {}) {
  return migrarPerfilPertenencia({ db, FieldValue, seleccion: await seleccion(), ...extra });
}

async function fotografia() {
  const [perfil, comprobante] = await Promise.all([perfilRef().get(), comprobanteRef().get()]);
  return [perfil, comprobante].map((d) => ({ existe: d.exists, datos: d.data(),
    version: d.updateTime ? `${d.updateTime.seconds}:${d.updateTime.nanoseconds}` : null }));
}

before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync',
    firestore: { host: '127.0.0.1', port: 8088 } });
});
after(async () => {
  if (reglas) await reglas.cleanup();
  if (db) await db.terminate();
});
beforeEach(async () => {
  // Preparación exclusiva del emulador; fuera del motor.
  await reglas.clearFirestore();
  await perfilRef().set(datosOriginales());
  await db.collection('usuarios_globales').doc('titular').set({
    iglesiaId: 'congregacion-demo', rolGlobal: 'admin_iglesia' });
  await db.collection('iglesias').doc('congregacion-demo').set({ adminUid: 'titular' });
});

test('Motor emulado: asignación y comprobante conservan perfil y no crean recibos de ingreso', async () => {
  const r = await ejecutar();
  const perfil = (await perfilRef().get()).data();
  const comprobante = (await comprobanteRef().get()).data();
  assert.equal(r.categoria, 'migrado');
  assert.equal(pertenenciaIdValido(perfil.pertenenciaId), true);
  assert.deepEqual(perfil, { ...datosOriginales(), pertenenciaId: perfil.pertenenciaId });
  assert.equal(comprobante.pertenenciaId, perfil.pertenenciaId);
  assert.equal(typeof comprobante.fechaCreacion.seconds, 'number');
  assert.deepEqual(Object.keys(comprobante).sort(), ['version', 'origen', 'iglesiaId',
    'pertenenciaId', 'versionPerfilAnterior', 'fechaCreacion'].sort());
  assert.equal((await db.collection('operaciones_ingreso').get()).empty, true);
  assert.equal((await db.collection('operaciones_ingreso').doc('legado').collection('solicitudes').get()).empty, true);
});

test('Motor emulado: doble ejecución omite, sin cambiar ID, timestamp o comprobante', async () => {
  const inicial = await seleccion();
  await ejecutar({ seleccion: inicial });
  const antes = await fotografia();
  assert.equal((await ejecutar({ seleccion: inicial })).categoria, 'omitido');
  assert.deepEqual(await fotografia(), antes);
});

test('Motor emulado: dos transacciones concurrentes confirman una asignación', async () => {
  const inicial = await seleccion();
  const resultados = await Promise.all([ejecutar({ seleccion: inicial }), ejecutar({ seleccion: inicial })]);
  assert.deepEqual(resultados.map((r) => r.categoria).sort(), ['migrado', 'omitido']);
  assert.equal(resultados.reduce((total, r) => total + r.metricas.migrados, 0), 1);
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 1);
});

test('Motor emulado: perfiles desvinculados, IDs existentes e inválidos nunca se reparan', async () => {
  for (const [perfil, categoria] of [[{}, 'omitido'],
    [{ ...datosOriginales(), pertenenciaId: 'a'.repeat(64) }, 'omitido'],
    ...[null, '', 'incorrecto'].map((pertenenciaId) => [{ ...datosOriginales(), pertenenciaId }, 'revision'])]) {
    await perfilRef().set(perfil);
    const antes = await fotografia();
    assert.equal((await ejecutar()).categoria, categoria);
    assert.deepEqual(await fotografia(), antes);
  }
});

test('Motor emulado: iglesia inexistente y administrador incoherente quedan para revisión', async () => {
  await db.collection('iglesias').doc('congregacion-demo').delete();
  assert.equal((await ejecutar()).motivo, 'iglesia_inexistente');
  await db.collection('iglesias').doc('congregacion-demo').set({ adminUid: 'titular' });
  await perfilRef().update({ rolGlobal: 'admin_iglesia' });
  assert.equal((await ejecutar()).motivo, 'administracion_incoherente');
  assert.equal((await comprobanteRef().get()).exists, false);
});

test('Motor emulado: updateTime compara nanosegundos, no solo contenido o milisegundos', async () => {
  const inicial = await seleccion();
  await perfilRef().update({ preferencias: { tema: 'claro' } });
  assert.equal((await ejecutar({ seleccion: inicial })).categoria, 'conflicto');
  assert.equal((await comprobanteRef().get()).exists, false);
  assert.equal(Object.hasOwn((await perfilRef().get()).data(), 'pertenenciaId'), false);
});

for (const cambio of ['salida', 'reingreso', 'transferencia']) {
  test(`Motor emulado: ${cambio} mientras espera la primera lectura invalida la selección`, async () => {
    const inicial = await seleccion();
    let avisar;
    let continuar;
    const esperando = new Promise((resolve) => { avisar = resolve; });
    const permiso = new Promise((resolve) => { continuar = resolve; });
    const cliente = { collection: db.collection.bind(db),
      runTransaction(callback, opciones) {
        return db.runTransaction(async (tx) => {
          avisar();
          await permiso;
          return callback(tx);
        }, opciones);
      } };
    const tarea = ejecutar({ db: cliente, seleccion: inicial });
    await esperando;
    try {
      if (cambio === 'salida') {
        await perfilRef().update({ iglesiaId: FieldValue.delete(), rolGlobal: FieldValue.delete() });
      } else if (cambio === 'reingreso') {
        // Estado confirmado por otro ingreso: el motor no lo sustituye.
        await perfilRef().update({ pertenenciaId: 'b'.repeat(64) });
      } else {
        await db.runTransaction(async (tx) => {
          tx.update(perfilRef(), { rolGlobal: 'admin_iglesia' });
          tx.update(db.collection('iglesias').doc('congregacion-demo'), { adminUid: 'legado' });
          tx.update(db.collection('usuarios_globales').doc('titular'), { rolGlobal: 'lider_area' });
        });
      }
    } finally { continuar(); }
    const r = await tarea;
    assert.equal(r.categoria, cambio === 'transferencia' ? 'conflicto' : 'omitido');
    assert.equal((await comprobanteRef().get()).exists, false);
  });
}

test('Motor emulado: fallo tras preparar update no confirma ni perfil ni comprobante', async () => {
  const antes = await fotografia();
  const cliente = { collection: db.collection.bind(db),
    runTransaction(callback, opciones) {
      return db.runTransaction((tx) => callback({ get: tx.get.bind(tx), update: tx.update.bind(tx),
        create() { throw new Error('Fallo ficticio privado'); } }), opciones);
    } };
  assert.equal((await ejecutar({ db: cliente })).categoria, 'error');
  assert.deepEqual(await fotografia(), antes);
});

test('Motor emulado: ABORTED antes de commit reintenta sin duplicar métricas', async () => {
  let intentos = 0;
  const cliente = { collection: db.collection.bind(db),
    runTransaction(callback, opciones) {
      return db.runTransaction(async (tx) => {
        intentos += 1;
        const resultado = await callback(tx);
        if (intentos === 1) throw Object.assign(new Error('Abortado ficticio'), { code: 10 });
        return resultado;
      }, opciones);
    } };
  const r = await ejecutar({ db: cliente });
  assert.equal(intentos, 2);
  assert.equal(r.categoria, 'migrado');
  assert.equal(r.metricas.procesados, 1);
  assert.equal(r.metricas.migrados, 1);
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 1);
});

test('Motor emulado: comprobante privado no es legible ni escribible por clientes', async () => {
  await ejecutar();
  for (const uid of ['legado', 'titular', null]) {
    const contexto = uid === null ? reglas.unauthenticatedContext() : reglas.authenticatedContext(uid);
    const ref = doc(contexto.firestore(), 'migraciones_pertenencia', 'legado');
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { version: 2 }));
  }
});
