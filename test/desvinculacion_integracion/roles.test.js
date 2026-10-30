const { verificarEntorno } = require('./entorno');
verificarEntorno(); // Antes de SDKs, autenticación y preparación de fixtures.
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const requireFunctions = createRequire(path.join(__dirname, '../../functions/package.json'));
const requireCliente = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = requireFunctions('google-auth-library');
const { initializeApp, deleteApp } = requireCliente('firebase/app');
const { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInAnonymously } = requireCliente('firebase/auth');
const { getFirestore, connectFirestoreEmulator, terminate, doc, collection,
  getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc, setLogLevel } = requireCliente('firebase/firestore');
setLogLevel('silent');

const proyecto = 'demo-fesync';
const iglesiaId = 'roles-ficticia-a';
const periodo = 'a'.repeat(64);
const iglesiaRuta = `iglesias/${iglesiaId}`;
const perfil = (u) => `usuarios_globales/${u.uid}`;
const acceso = `${iglesiaRuta}/finanzas_config/acceso`;
const auditoria = `${iglesiaRuta}/membresia_auditoria`;
const usuarios = {};
let db;
let numero = 0;
const nuevaClave = () => `roles-prueba-ficticia-${++numero}`;
const version = (s) => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
const leer = async (ruta) => (await db.doc(ruta).get()).data();
const recibo = (r, actor = usuarios.admin) => `operaciones_roles/${actor.uid}/solicitudes/${r.solicitudId}`;

async function llamar(nombre, actor, data) {
  const r = await fetch(`http://127.0.0.1:5008/${proyecto}/southamerica-west1/${nombre}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
    body: JSON.stringify({ data }), signal: AbortSignal.timeout(90000),
  });
  const d = await r.json();
  if (d.error) {
    const error = new Error('Callable de prueba rechazó la operación.');
    error.code = d.error.status;
    throw error;
  }
  assert.equal(r.ok, true);
  assert.ok(Object.hasOwn(d, 'result'));
  return d.result;
}

async function contexto(actor = usuarios.admin, objetivo = usuarios.miembro) {
  return llamar('obtenerContextoCambioRolMiembro', actor, { iglesiaId, uidObjetivo: objetivo.uid });
}

async function solicitud(rolNuevo = 'lider_area') {
  const c = await contexto();
  return { iglesiaId, uidObjetivo: usuarios.miembro.uid, pertenenciaId: c.pertenenciaId,
    rolNuevo, versionPerfilEsperada: c.versionPerfilEsperada,
    versionIglesiaEsperada: c.versionIglesiaEsperada, solicitudId: nuevaClave() };
}
const actualizar = (r, actor = usuarios.admin) => llamar('actualizarRolMiembro', actor, r);
const transferir = (actor, nuevoAdmin) => llamar('transferirAdministracionIglesia', actor,
  { iglesiaId, nuevoAdminUid: nuevoAdmin.uid });
const salir = (accion = 'salir') => llamar('desvincularMiembroIglesia',
  usuarios[accion === 'salir' ? 'miembro' : 'admin'],
  { iglesiaId, uidObjetivo: usuarios.miembro.uid, accion, pertenenciaId: periodo, solicitudId: nuevaClave() });

// Incluye documentos padre virtuales: no omite recibos en subcolecciones privadas.
async function foto() {
  const filas = [];
  async function visitar(c) {
    for (const ref of await c.listDocuments()) {
      const s = await ref.get();
      if (s.exists) filas.push({ ruta: ref.path, datos: s.data(), version: version(s) });
      for (const sub of await ref.listCollections()) await visitar(sub);
    }
  }
  for (const c of await db.listCollections()) await visitar(c);
  return filas.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

async function sinCambios(operacion, code) {
  const antes = await foto();
  await assert.rejects(operacion(), { code });
  assert.deepEqual(await foto(), antes);
}

before(async () => {
  db = new Firestore({ projectId: proyecto, host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }),
  });
  for (const nombre of ['admin', 'miembro', 'lider', 'servidor', 'encargado', 'otro', 'externo', 'anterior']) {
    const app = initializeApp({ projectId: proyecto, apiKey: 'ficticia', appId: 'ficticia' }, `roles-6c2-${nombre}`);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
    const cliente = getFirestore(app);
    connectFirestoreEmulator(cliente, '127.0.0.1', 8088);
    const { user } = await signInAnonymously(auth);
    usuarios[nombre] = { uid: user.uid, token: await user.getIdToken(), app, cliente };
  }
});
after(async () => {
  for (const u of Object.values(usuarios)) { await terminate(u.cliente); await deleteApp(u.app); }
  if (db) await db.terminate();
});
beforeEach(async () => {
  const r = await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(r.ok, true);
  const b = db.batch();
  for (const [nombre, u] of Object.entries(usuarios)) {
    b.set(db.doc(perfil(u)), { iglesiaId: nombre === 'externo' ? 'roles-ficticia-b' : iglesiaId,
      rolGlobal: ['admin', 'externo', 'anterior'].includes(nombre) ? 'admin_iglesia' : nombre === 'lider' ? 'lider_area' : 'servidor',
      pertenenciaId: nombre === 'miembro' ? periodo : 'b'.repeat(64),
      nombre: 'Persona ficticia', email: 'ficticio@example.invalid', descripcion: 'Conservar descripción',
      preferencias: { oscuro: true }, ...(nombre === 'miembro' ? { fcmToken: 'TOKEN_FICTICIO_NO_ENVIAR' } : {}),
    });
  }
  b.set(db.doc(iglesiaRuta), { adminUid: usuarios.admin.uid, codigoAcceso: 'ROLESFICTICIAA' });
  b.set(db.doc('iglesias/roles-ficticia-b'), { adminUid: usuarios.externo.uid, codigoAcceso: 'ROLESFICTICIAB' });
  b.set(db.doc(acceso), { encargadoUid: usuarios.miembro.uid, moduloHabilitado: true });
  b.set(db.doc(`${iglesiaRuta}/finanzas_elegibilidad/${usuarios.miembro.uid}`), { habilitado: true, esEncargado: true, version: 7 });
  b.set(db.doc(`${iglesiaRuta}/finanzas_auditoria/anterior`), { ficticio: true });
  b.set(db.doc(`${iglesiaRuta}/finanzas_movimientos/ficticio`), { ficticio: true });
  await b.commit();
});

test('Contexto real coincide con segundos/nanosegundos de updateTime y no escribe', async () => {
  const antes = await foto();
  const c = await contexto();
  assert.deepEqual(Object.keys(c).sort(), ['pertenenciaId', 'rolActual', 'versionIglesiaEsperada', 'versionPerfilEsperada']);
  assert.equal(c.rolActual, 'servidor');
  assert.equal(c.pertenenciaId, periodo);
  assert.equal(c.versionPerfilEsperada, version(await db.doc(perfil(usuarios.miembro)).get()));
  assert.equal(c.versionIglesiaEsperada, version(await db.doc(iglesiaRuta).get()));
  assert.deepEqual(await foto(), antes);
});

for (const rolAnterior of ['servidor', 'lider_area']) {
  test(`Cambio real desde ${rolAnterior}: commit atómico, auxiliares y Finanzas conservados`, async () => {
    await db.doc(perfil(usuarios.miembro)).update({ rolGlobal: rolAnterior });
    const r = await solicitud(rolAnterior === 'servidor' ? 'lider_area' : 'servidor');
    const antes = await foto();
    const original = await leer(perfil(usuarios.miembro));
    assert.deepEqual(await actualizar(r), { estado: 'CONFIRMADA', huboCambio: true });
    assert.deepEqual(await leer(perfil(usuarios.miembro)), { ...original, rolGlobal: r.rolNuevo });
    const eventos = (await db.collection(auditoria).get()).docs;
    assert.equal(eventos.length, 1);
    const comprobante = await db.doc(recibo(r)).get();
    const p = await db.doc(perfil(usuarios.miembro)).get();
    assert.ok(p.updateTime.isEqual(comprobante.updateTime));
    assert.ok(p.updateTime.isEqual(eventos[0].updateTime));
    assert.equal(eventos[0].data().rolAnterior, rolAnterior);
    assert.equal(eventos[0].data().rolNuevo, r.rolNuevo);
    const despues = await foto();
    for (const fila of antes.filter((f) => f.ruta !== perfil(usuarios.miembro))) {
      assert.deepEqual(despues.find((f) => f.ruta === fila.ruta), fila);
    }
    assert.equal(despues.length, antes.length + 2);
    // El encargado sigue accediendo por designación tanto siendo líder como servidor.
    await getDocFromServer(doc(usuarios.miembro.cliente, `${iglesiaRuta}/finanzas_movimientos/ficticio`));
  });
}

for (const nombre of ['lider', 'servidor', 'encargado', 'externo', 'anterior']) {
  test(`Actor ${nombre} no obtiene contexto ni altera roles`, async () => {
    const r = await solicitud();
    if (nombre === 'encargado') {
      await db.doc(acceso).update({ encargadoUid: usuarios.encargado.uid });
      await db.doc(`${iglesiaRuta}/finanzas_elegibilidad/${usuarios.encargado.uid}`).set({ habilitado: true, esEncargado: true, version: 1 });
    }
    await sinCambios(() => contexto(usuarios[nombre]), 'PERMISSION_DENIED');
    await sinCambios(() => actualizar(r, usuarios[nombre]), 'PERMISSION_DENIED');
  });
}

test('Auth obligatoria, identidad del cliente y rol administrativo se rechazan', async () => {
  const r = await solicitud();
  await sinCambios(() => contexto(null), 'UNAUTHENTICATED');
  await sinCambios(() => actualizar(r, null), 'UNAUTHENTICATED');
  await sinCambios(() => actualizar({ ...r, actorUid: usuarios.admin.uid }), 'INVALID_ARGUMENT');
  await sinCambios(() => actualizar({ ...r, rolNuevo: 'admin_iglesia' }), 'INVALID_ARGUMENT');
  await sinCambios(() => contexto(usuarios.admin, usuarios.admin), 'FAILED_PRECONDITION');
  await sinCambios(() => actualizar({ ...r, uidObjetivo: usuarios.admin.uid }), 'FAILED_PRECONDITION');
});

test('Perfil legado y administrador incoherente no pueden usarse como objetivos', async () => {
  const r = await solicitud();
  await db.doc(perfil(usuarios.miembro)).update({ pertenenciaId: FieldValue.delete() });
  await sinCambios(() => contexto(), 'FAILED_PRECONDITION');
  await sinCambios(() => actualizar(r), 'FAILED_PRECONDITION');
  await db.doc(perfil(usuarios.miembro)).update({ pertenenciaId: periodo, rolGlobal: 'admin_iglesia' });
  await sinCambios(() => contexto(), 'FAILED_PRECONDITION');
  await sinCambios(() => actualizar(r), 'FAILED_PRECONDITION');
});

for (const campo of ['versionPerfilEsperada', 'versionIglesiaEsperada']) {
  test(`Diferencia de un nanosegundo en ${campo}, sin cambiar milisegundo, produce conflicto real`, async () => {
    const r = await solicitud();
    const [s, n] = r[campo].split(':').map(Number);
    const otro = n % 1000000 === 999999 ? n - 1 : n + 1;
    assert.equal(Math.floor(n / 1000000), Math.floor(otro / 1000000));
    await sinCambios(() => actualizar({ ...r, [campo]: `${s}:${otro}` }), 'ABORTED');
  });
}

test('Modificar descripción tras obtener contexto invalida la operación sin sobrescribir auxiliares', async () => {
  const r = await solicitud();
  await db.doc(perfil(usuarios.miembro)).update({ descripcion: 'Cambio auxiliar ficticio posterior' });
  await sinCambios(() => actualizar(r), 'ABORTED');
});

test('Ida/vuelta de roles por callables invalida contexto antiguo aunque el rol final sea igual', async () => {
  const original = await solicitud();
  await actualizar(await solicitud('lider_area'));
  await actualizar(await solicitud('servidor'));
  await sinCambios(() => actualizar(original), 'ABORTED');
  assert.equal((await leer(perfil(usuarios.miembro))).rolGlobal, 'servidor');
});

test('Transferencia de ida/vuelta invalida contexto por versión de iglesia, sin cambiar contrato de transferencia', async () => {
  const r = await solicitud();
  await transferir(usuarios.admin, usuarios.otro);
  await transferir(usuarios.otro, usuarios.admin);
  assert.equal((await leer(iglesiaRuta)).adminUid, usuarios.admin.uid);
  await sinCambios(() => actualizar(r), 'ABORTED');
});

test('Contexto previo no es autorización permanente si el actor pierde el rol', async () => {
  const r = await solicitud();
  await transferir(usuarios.admin, usuarios.otro);
  await sinCambios(() => actualizar(r), 'PERMISSION_DENIED');
});

test('No-op guarda recibo, sin modificar perfil ni crear auditoría; replay no escribe', async () => {
  const r = await solicitud('servidor');
  const p = await db.doc(perfil(usuarios.miembro)).get();
  assert.deepEqual(await actualizar(r), { estado: 'CONFIRMADA', huboCambio: false });
  assert.ok((await db.doc(perfil(usuarios.miembro)).get()).updateTime.isEqual(p.updateTime));
  assert.equal((await db.collection(auditoria).get()).size, 0);
  assert.equal((await db.doc(recibo(r)).get()).exists, true);
  const antes = await foto();
  assert.deepEqual(await actualizar(r), { estado: 'CONFIRMADA', huboCambio: false });
  assert.deepEqual(await foto(), antes);
});

test('Solicitud repetida confirma historia sin auditoría duplicada; reutilizar parámetros distintos se rechaza', async () => {
  const r = await solicitud();
  const resultado = await actualizar(r);
  const antes = await foto();
  assert.deepEqual(await actualizar(r), resultado);
  assert.deepEqual(await foto(), antes);
  await sinCambios(() => actualizar({ ...r, rolNuevo: 'servidor' }), 'INVALID_ARGUMENT');
  await sinCambios(() => actualizar({ ...r, uidObjetivo: usuarios.otro.uid }), 'INVALID_ARGUMENT');
  assert.equal((await db.collection(auditoria).get()).size, 1);
});

test('Repetición concurrente de la misma solicitud produce una sola auditoría y recibo', async () => {
  const r = await solicitud();
  const resultados = await Promise.all([actualizar(r), actualizar(r)]);
  assert.deepEqual(resultados[0], resultados[1]);
  assert.equal((await db.collection(auditoria).get()).size, 1);
  assert.equal((await db.collection(`operaciones_roles/${usuarios.admin.uid}/solicitudes`).get()).size, 1);
});

test('Transferencia concurrente: cambio de rol anterior al traspaso o rechazo, sin recuperar autoridad', async () => {
  const r = await solicitud();
  const [rol, transferencia] = await Promise.allSettled([actualizar(r), transferir(usuarios.admin, usuarios.otro)]);
  assert.equal(transferencia.status, 'fulfilled');
  assert.equal((await leer(iglesiaRuta)).adminUid, usuarios.otro.uid);
  if (rol.status === 'rejected') assert.ok(['ABORTED', 'PERMISSION_DENIED'].includes(rol.reason.code));
  assert.equal((await db.doc(recibo(r)).get()).exists, rol.status === 'fulfilled');
  await sinCambios(() => actualizar({ ...r, solicitudId: nuevaClave() }), 'PERMISSION_DENIED');
});

for (const accion of ['salir', 'expulsar']) {
  test(`Concurrencia con ${accion}: no restaura pertenencia ni interfiere con revocación financiera`, async () => {
    const r = await solicitud();
    const [rol, membresia] = await Promise.allSettled([actualizar(r), salir(accion)]);
    assert.equal(membresia.status, 'fulfilled');
    if (rol.status === 'rejected') assert.ok(['ABORTED', 'PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(rol.reason.code));
    const p = await leer(perfil(usuarios.miembro));
    assert.equal(Object.hasOwn(p, 'iglesiaId'), false);
    assert.equal(Object.hasOwn(p, 'rolGlobal'), false);
    assert.equal(p.pertenenciaId, periodo);
    assert.equal((await leer(acceso)).encargadoUid, null);
    assert.equal((await db.doc(recibo(r)).get()).exists, rol.status === 'fulfilled');
    assert.equal((await db.collection(auditoria).get()).size, rol.status === 'fulfilled' ? 1 : 0);
  });
}

for (const codigo of ['ROLESFICTICIAA', 'ROLESFICTICIAB']) {
  test(`Solicitud no ejecutada anterior a reingreso ${codigo} no actúa sobre el nuevo período`, async () => {
    const r = await solicitud();
    await salir();
    await llamar('vincularUsuarioConCodigo', usuarios.miembro, { codigo, solicitudId: nuevaClave() });
    assert.notEqual((await leer(perfil(usuarios.miembro))).pertenenciaId, periodo);
    await sinCambios(() => actualizar(r), codigo === 'ROLESFICTICIAA' ? 'FAILED_PRECONDITION' : 'PERMISSION_DENIED');
  });
}

test('Concurrencia con salida y reingreso: solicitud vieja no cambia el rol del nuevo período', async () => {
  const r = await solicitud();
  const [rol, ingreso] = await Promise.allSettled([actualizar(r), (async () => {
    await salir();
    return llamar('vincularUsuarioConCodigo', usuarios.miembro, { codigo: 'ROLESFICTICIAA', solicitudId: nuevaClave() });
  })()]);
  assert.equal(ingreso.status, 'fulfilled');
  if (rol.status === 'rejected') assert.ok(['ABORTED', 'PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(rol.reason.code));
  const p = await leer(perfil(usuarios.miembro));
  assert.notEqual(p.pertenenciaId, periodo);
  assert.equal(p.rolGlobal, 'servidor');
  const antes = await foto();
  if (rol.status === 'fulfilled') assert.deepEqual(await actualizar(r), { estado: 'CONFIRMADA', huboCambio: true });
  else await assert.rejects(actualizar(r), { code: 'FAILED_PRECONDITION' });
  assert.deepEqual(await foto(), antes);
});

test('Historia confirmada sobrevive a transferencia y nuevo período sin mutarlos', async () => {
  const r = await solicitud();
  await actualizar(r);
  await salir('expulsar');
  await llamar('vincularUsuarioConCodigo', usuarios.miembro, { codigo: 'ROLESFICTICIAA', solicitudId: nuevaClave() });
  await transferir(usuarios.admin, usuarios.otro);
  const antes = await foto();
  assert.deepEqual(await actualizar(r), { estado: 'CONFIRMADA', huboCambio: true });
  assert.deepEqual(await foto(), antes);
});

test('SDK cliente real no lee/lista/escribe recibos ni auditoría privada, incluso siendo titular', async () => {
  const r = await solicitud();
  await actualizar(r);
  const evento = (await db.collection(auditoria).get()).docs[0].ref.path;
  const antes = await foto();
  for (const u of [usuarios.admin, usuarios.miembro, usuarios.externo]) {
    const reciboRef = doc(u.cliente, recibo(r));
    const eventoRef = doc(u.cliente, evento);
    for (const operacion of [
      () => getDocFromServer(reciboRef), () => getDocsFromServer(collection(u.cliente, `operaciones_roles/${usuarios.admin.uid}/solicitudes`)),
      () => setDoc(reciboRef, { falso: true }), () => updateDoc(reciboRef, { falso: true }), () => deleteDoc(reciboRef),
      () => getDocFromServer(eventoRef), () => getDocsFromServer(collection(u.cliente, auditoria)),
      () => setDoc(eventoRef, { falso: true }), () => deleteDoc(eventoRef),
      () => updateDoc(doc(u.cliente, perfil(usuarios.miembro)), { rolGlobal: 'lider_area' === r.rolNuevo ? 'servidor' : 'lider_area' }),
    ]) await assert.rejects(operacion(), (e) => e.code === 'permission-denied');
  }
  assert.deepEqual(await foto(), antes);
});
