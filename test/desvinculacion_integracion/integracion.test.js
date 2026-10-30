const { verificarEntorno } = require('./entorno');
verificarEntorno(); // Antes de SDK, fixtures o conexiones.
const { conEtapa } = require('./diagnostico');
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = requireFunctions('google-auth-library');
const proyecto = 'demo-fesync';
const iglesia = 'congregacion-a';
const periodo = 'a'.repeat(64);
const p = (uid) => `usuarios_globales/${uid}`;
const acceso = `iglesias/${iglesia}/finanzas_config/acceso`;
const elegibilidad = (uid) => `iglesias/${iglesia}/finanzas_elegibilidad/${uid}`;
const recibo = (actor, id) => `operaciones_desvinculacion/${actor}/solicitudes/${id}`;
const auditoria = `iglesias/${iglesia}/finanzas_auditoria`;
let db;
const usuarios = {};

async function jsonLocal(url, opciones = {}) {
  return conEtapa(url.startsWith('http://127.0.0.1:9098/') ? 'auth' : 'callable', async () => {
    const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(90000) });
    let datos;
    try { datos = await r.json(); }
    catch {
      throw Object.assign(new Error('Respuesta local no JSON.'), {
        code: r.ok ? 'RESPUESTA_NO_JSON' : `HTTP_${r.status}`,
      });
    }
    return { r, datos };
  });
}

async function llamar(nombre, actor, data) {
  const { datos } = await jsonLocal(`http://127.0.0.1:5008/${proyecto}/southamerica-west1/${nombre}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: JSON.stringify({ data }),
  });
  if (datos.error) {
    const error = new Error('Callable rechazó la solicitud ficticia.');
    error.code = datos.error.status;
    throw error;
  }
  assert.ok(Object.hasOwn(datos, 'result'), 'Respuesta callable inválida');
  return datos.result;
}

async function cliente(actor, ruta, { method = 'GET', datos, campos = [] } = {}) {
  const mascara = campos.map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join('&');
  return fetch(`http://127.0.0.1:8088/v1/projects/${proyecto}/databases/(default)/documents/${ruta}${mascara ? `?${mascara}` : ''}`, {
    method, headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    ...(datos ? { body: JSON.stringify(datos) } : {}), signal: AbortSignal.timeout(30000),
  });
}
const datosSalida = (accion = 'salir', solicitudId = 'solicitud-original-0001') => ({
  iglesiaId: iglesia, uidObjetivo: usuarios.miembro.uid, accion, pertenenciaId: periodo, solicitudId,
});
const leer = async (ruta) => (await db.doc(ruta).get()).data();
async function foto() {
  const resultado = [];
  async function visitar(coleccion) {
    const docs = (await coleccion.orderBy('__name__').get()).docs;
    for (const d of docs) {
      resultado.push({ ruta: d.ref.path, datos: d.data(), version: d.updateTime });
      for (const c of await d.ref.listCollections()) await visitar(c);
    }
  }
  // listCollections/listDocuments incluye padres virtuales con subcolecciones.
  for (const c of await db.listCollections()) {
    for (const ref of await c.listDocuments()) {
      const d = await ref.get();
      if (d.exists) resultado.push({ ruta: ref.path, datos: d.data(), version: d.updateTime });
      for (const sub of await ref.listCollections()) await visitar(sub);
    }
  }
  return resultado.sort((a, b) => a.ruta.localeCompare(b.ruta));
}

async function preparar() {
  const r = await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(r.ok, true);
  const b = db.batch();
  for (const [nombre, u] of Object.entries(usuarios)) {
    b.set(db.doc(p(u.uid)), { iglesiaId: nombre === 'ajeno' ? 'congregacion-b' : iglesia,
      rolGlobal: ['admin', 'ajeno'].includes(nombre) ? 'admin_iglesia' : 'servidor',
      pertenenciaId: nombre === 'miembro' ? periodo : 'b'.repeat(64),
      nombre: 'Persona ficticia', descripcion: 'Auxiliar ficticio', temaOscuro: true,
      ...(nombre === 'miembro' ? { fcmToken: 'TOKEN_FICTICIO_NO_ENVIAR', fcmTokenActualizado: 123 } : {}),
    });
  }
  b.set(db.doc(`iglesias/${iglesia}`), { adminUid: usuarios.admin.uid, codigoAcceso: 'FICTICIOA' });
  b.set(db.doc('iglesias/congregacion-b'), { adminUid: usuarios.ajeno.uid, codigoAcceso: 'FICTICIOB' });
  b.set(db.doc(acceso), { encargadoUid: usuarios.miembro.uid, moduloHabilitado: true, moneda: 'CLP' });
  b.set(db.doc(elegibilidad(usuarios.miembro.uid)), { version: 4, habilitado: true, esEncargado: true });
  b.set(db.doc(`${p(usuarios.miembro.uid)}/dispositivos/ficticio`), { activo: true, token: 'TOKEN_DISPOSITIVO_FICTICIO' });
  b.set(db.doc(`iglesias/${iglesia}/finanzas_movimientos/ficticio`), { prueba: true });
  await b.commit();
}

before(() => conEtapa('preparacion', async () => {
  db = new Firestore({ projectId: proyecto, host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }),
  });
  for (const nombre of ['admin', 'miembro', 'otro', 'ajeno']) {
    const { r, datos } = await jsonLocal('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=ficticia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    assert.equal(r.ok, true, 'Auth emulado no disponible');
    usuarios[nombre] = { uid: datos.localId, token: datos.idToken };
  }
}));
after(async () => { if (db) await db.terminate(); });
beforeEach(() => conEtapa('fixtures', preparar));

for (const accion of ['salir', 'expulsar']) {
  test(`Callable real: ${accion} revoca finanzas, elegibilidad, FCM legado y recibo en UN commit`, async () => {
    const d = datosSalida(accion);
    const actor = usuarios[accion === 'salir' ? 'miembro' : 'admin'];
    assert.equal((await cliente(usuarios.miembro, `iglesias/${iglesia}/finanzas_movimientos/ficticio`)).status, 200);
    assert.deepEqual(await llamar('desvincularMiembroIglesia', actor, d), { ok: true });
    const rutas = [p(usuarios.miembro.uid), acceso, elegibilidad(usuarios.miembro.uid), recibo(actor.uid, d.solicitudId)];
    const audit = (await db.collection(auditoria).get()).docs;
    assert.equal(audit.length, 1);
    rutas.push(audit[0].ref.path);
    const docs = await Promise.all(rutas.map((ruta) => db.doc(ruta).get()));
    assert.ok(docs.every((s) => s.updateTime.isEqual(docs[0].updateTime)), 'Todos los efectos comparten timestamp de commit');
    const perfil = docs[0].data();
    for (const campo of ['iglesiaId', 'rolGlobal', 'fcmToken', 'fcmTokenActualizado']) assert.equal(Object.hasOwn(perfil, campo), false);
    assert.equal(perfil.pertenenciaId, periodo);
    assert.equal(perfil.temaOscuro, true);
    assert.equal(Object.hasOwn(perfil, 'descripcion'), accion === 'salir');
    assert.equal(docs[1].data().encargadoUid, null);
    assert.equal(docs[1].data().moduloHabilitado, true);
    assert.equal(docs[1].data().moneda, 'CLP');
    assert.deepEqual(docs[2].data(), { habilitado: false, esEncargado: false, version: 5 });
    assert.equal(docs[3].data().resultado.ok, true);
    assert.equal(audit[0].data().motivo, 'desvinculacion');
    assert.equal((await leer(`${p(usuarios.miembro.uid)}/dispositivos/ficticio`)).activo, true, 'Dispositivos legados NO quedan resueltos');
    assert.equal((await cliente(usuarios.miembro, `iglesias/${iglesia}/finanzas_movimientos/ficticio`)).status, 403);
    const antes = await foto();
    await llamar('desvincularMiembroIglesia', actor, d);
    assert.deepEqual(await foto(), antes, 'Replay no escribe ni duplica auditoría');
    assert.deepEqual(await llamar('consultarEstadoSolicitudDesvinculacion', actor, d), { estado: 'CONFIRMADA_PERTENENCIA_TERMINADA' });
    assert.deepEqual(await llamar('recuperarContextoSolicitudDesvinculacion', actor, { solicitudId: d.solicitudId }), { estado: 'CONFIRMADA', contexto: d });
  });
}

test('Miembro ordinario expulsado no revoca al encargado de otra persona; FCM ausente/nulo', async () => {
  await db.doc(acceso).update({ encargadoUid: usuarios.otro.uid });
  await db.doc(p(usuarios.miembro.uid)).update({ fcmToken: null, fcmTokenActualizado: FieldValue.delete() });
  await llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar'));
  assert.equal((await leer(acceso)).encargadoUid, usuarios.otro.uid);
  assert.equal((await db.collection(auditoria).get()).size, 0);
  assert.equal(Object.hasOwn(await leer(p(usuarios.miembro.uid)), 'fcmToken'), false);
});

test('Callables financieros reales: designar inicia deshabilitado y activar repetidamente no duplica auditoría', async () => {
  await db.doc(acceso).delete();
  await llamar('actualizarEncargadoFinanciero', usuarios.admin, {
    iglesiaId: iglesia, accion: 'designar', encargadoUid: usuarios.miembro.uid,
  });
  assert.equal((await leer(acceso)).moduloHabilitado, false);
  assert.equal((await cliente(usuarios.miembro, `iglesias/${iglesia}/finanzas_movimientos/ficticio`)).status, 403);
  assert.equal((await cliente(usuarios.admin, acceso)).status, 200);
  await llamar('actualizarEstadoModuloFinanzas', usuarios.admin, { iglesiaId: iglesia, habilitado: true });
  const antes = await foto();
  await llamar('actualizarEstadoModuloFinanzas', usuarios.admin, { iglesiaId: iglesia, habilitado: true });
  assert.deepEqual(await foto(), antes);
  assert.equal((await cliente(usuarios.miembro, `iglesias/${iglesia}/finanzas_movimientos/ficticio`)).status, 200);
});

test('Rechazos de Auth, autorización, período y perfil legado no dejan cambios parciales', async () => {
  for (const [actor, d, code] of [
    [null, datosSalida(), 'UNAUTHENTICATED'],
    [usuarios.otro, datosSalida('expulsar'), 'PERMISSION_DENIED'],
    [usuarios.ajeno, datosSalida('expulsar'), 'PERMISSION_DENIED'],
    [usuarios.miembro, { ...datosSalida(), pertenenciaId: 'c'.repeat(64) }, 'FAILED_PRECONDITION'],
  ]) {
    const antes = await foto();
    await assert.rejects(llamar('desvincularMiembroIglesia', actor, d), { code });
    assert.deepEqual(await foto(), antes);
  }
  await db.doc(p(usuarios.miembro.uid)).update({ pertenenciaId: FieldValue.delete() });
  const antes = await foto();
  await assert.rejects(llamar('desvincularMiembroIglesia', usuarios.miembro, datosSalida()), { code: 'FAILED_PRECONDITION' });
  assert.deepEqual(await foto(), antes);
});

test('Error financiero dentro de transacción no deja perfil, FCM, auditoría ni recibo parciales', async () => {
  await db.doc(elegibilidad(usuarios.miembro.uid)).update({ version: Number.MAX_SAFE_INTEGER });
  const antes = await foto();
  await assert.rejects(llamar('desvincularMiembroIglesia', usuarios.miembro, datosSalida()), { code: 'INTERNAL' });
  assert.deepEqual(await foto(), antes);
});

test('Dos callables concurrentes con la misma solicitud producen solo un commit efectivo', async () => {
  await Promise.all([1, 2].map(() => llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar'))));
  assert.equal((await db.collection(auditoria).get()).size, 1);
  assert.equal((await db.collection(`operaciones_desvinculacion/${usuarios.admin.uid}/solicitudes`).get()).size, 1);
  assert.equal((await leer(elegibilidad(usuarios.miembro.uid))).version, 5);
});

for (const codigo of ['FICTICIOA', 'FICTICIOB']) {
  test(`Reingreso/cambio de iglesia ${codigo}: solicitud antigua no modifica período ni token nuevos`, async () => {
    const d = datosSalida();
    await llamar('desvincularMiembroIglesia', usuarios.miembro, d);
    const ingreso = { codigo, solicitudId: 'ingreso-nueva-intencion-0001' };
    const r = await llamar('vincularUsuarioConCodigo', usuarios.miembro, ingreso);
    const nuevo = await leer(p(usuarios.miembro.uid));
    assert.match(nuevo.pertenenciaId, /^[a-f0-9]{64}$/);
    assert.notEqual(nuevo.pertenenciaId, periodo);
    assert.equal(nuevo.iglesiaId, r.iglesiaId);
    await db.doc(p(usuarios.miembro.uid)).update({ fcmToken: 'TOKEN_NUEVO_FICTICIO' });
    const antes = await foto();
    await assert.rejects(llamar('desvincularMiembroIglesia', usuarios.miembro, d), { code: 'FAILED_PRECONDITION' });
    assert.deepEqual(await foto(), antes);
    assert.deepEqual(await llamar('consultarEstadoSolicitudDesvinculacion', usuarios.miembro, d), { estado: 'CONFIRMADA_NUEVA_PERTENENCIA' });
    assert.equal((await llamar('recuperarContextoSolicitudDesvinculacion', usuarios.miembro, { solicitudId: d.solicitudId })).contexto.pertenenciaId, periodo);
    const previa = await foto();
    assert.deepEqual(await llamar('vincularUsuarioConCodigo', usuarios.miembro, ingreso), r);
    assert.deepEqual(await foto(), previa);
    assert.deepEqual(await llamar('consultarEstadoSolicitudIngreso', usuarios.miembro, { solicitudId: ingreso.solicitudId, tipo: 'vincular' }), { estado: 'CONFIRMADA_VIGENTE' });
    assert.equal((await leer(acceso)).encargadoUid, null);
  });
}

test('Creación callable real mantiene recibo y pertenencia idempotentes, sin otra iglesia', async () => {
  await db.doc(p(usuarios.otro.uid)).delete();
  const datos = { codigo: 'NUEVAFICTICIA', nombreIglesia: 'Congregación ficticia', solicitudId: 'creacion-idempotente-0001' };
  const r = await llamar('registrarNuevaIglesiaSegura', usuarios.otro, datos);
  assert.match((await leer(p(usuarios.otro.uid))).pertenenciaId, /^[a-f0-9]{64}$/);
  const antes = await foto();
  assert.deepEqual(await llamar('registrarNuevaIglesiaSegura', usuarios.otro, datos), r);
  assert.deepEqual(await foto(), antes);
  assert.deepEqual(await llamar('consultarEstadoSolicitudIngreso', usuarios.otro, { solicitudId: datos.solicitudId, tipo: 'crear' }), { estado: 'CONFIRMADA_VIGENTE' });
});

for (const reemplazar of [false, true]) {
  test(`Concurrencia real: expulsar y designar ${reemplazar ? 'reemplazo' : 'mismo objetivo'}`, async () => {
    const resultados = await Promise.allSettled([
      llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar')),
      llamar('actualizarEncargadoFinanciero', usuarios.admin, { iglesiaId: iglesia, accion: 'designar', encargadoUid: usuarios[reemplazar ? 'otro' : 'miembro'].uid }),
    ]);
    assert.equal(resultados[0].status, 'fulfilled');
    if (resultados[1].status === 'rejected') assert.equal(resultados[1].reason.code, 'FAILED_PRECONDITION');
    assert.equal((await leer(acceso)).encargadoUid, reemplazar ? usuarios.otro.uid : null);
    assert.equal((await leer(elegibilidad(usuarios.miembro.uid))).esEncargado, false);
    assert.equal(Object.hasOwn(await leer(p(usuarios.miembro.uid)), 'iglesiaId'), false);
    const eventos = (await db.collection(auditoria).get()).docs;
    assert.ok(eventos.length >= 1 && eventos.length <= 2);
    assert.ok(eventos.filter((e) => e.data().motivo === 'desvinculacion').length <= 1);
  });
}

test('Transferencia concurrente: expulsión se ordena antes o es rechazada; titular anterior pierde permisos', async () => {
  const [expulsion, transferencia] = await Promise.allSettled([
    llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar')),
    llamar('transferirAdministracionIglesia', usuarios.admin, { iglesiaId: iglesia, nuevoAdminUid: usuarios.otro.uid }),
  ]);
  assert.equal(transferencia.status, 'fulfilled');
  assert.equal((await leer(`iglesias/${iglesia}`)).adminUid, usuarios.otro.uid);
  if (expulsion.status === 'fulfilled') {
    assert.equal((await llamar('recuperarContextoSolicitudDesvinculacion', usuarios.admin, { solicitudId: datosSalida().solicitudId })).estado, 'CONFIRMADA');
  } else {
    assert.equal(expulsion.reason.code, 'PERMISSION_DENIED');
    assert.equal((await leer(p(usuarios.miembro.uid))).iglesiaId, iglesia);
    assert.equal((await db.collection(auditoria).get()).size, 0);
  }
  const antes = await foto();
  await assert.rejects(llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar', 'solicitud-posterior-0002')), { code: 'PERMISSION_DENIED' });
  assert.deepEqual(await foto(), antes);
});

test('Actor original verifica recibo después de transferir administración; otro actor no lo recupera', async () => {
  const d = datosSalida('expulsar');
  await llamar('desvincularMiembroIglesia', usuarios.admin, d);
  await llamar('transferirAdministracionIglesia', usuarios.admin, { iglesiaId: iglesia, nuevoAdminUid: usuarios.otro.uid });
  const antes = await foto();
  assert.deepEqual(await llamar('recuperarContextoSolicitudDesvinculacion', usuarios.admin, { solicitudId: d.solicitudId }), { estado: 'CONFIRMADA', contexto: d });
  assert.deepEqual(await llamar('recuperarContextoSolicitudDesvinculacion', usuarios.otro, { solicitudId: d.solicitudId }), { estado: 'RECIBO_AUSENTE' });
  assert.deepEqual(await llamar('consultarEstadoSolicitudDesvinculacion', usuarios.otro, d), { estado: 'NO_VERIFICABLE' });
  assert.deepEqual(await foto(), antes);
});

test('Reglas reales: recibos privados inaccesibles incluso al actor, ni lectura/listado/escritura', async () => {
  await llamar('desvincularMiembroIglesia', usuarios.admin, datosSalida('expulsar'));
  for (const actor of [usuarios.admin, usuarios.ajeno, usuarios.otro]) {
    for (const ruta of [recibo(usuarios.admin.uid, datosSalida().solicitudId), `operaciones_desvinculacion/${usuarios.admin.uid}/solicitudes`,
      `operaciones_ingreso/${usuarios.admin.uid}/solicitudes/ficticia`]) {
      assert.equal((await cliente(actor, ruta)).status, 403);
    }
    assert.equal((await cliente(actor, recibo(usuarios.admin.uid, datosSalida().solicitudId), { method: 'PATCH', datos: { fields: {} } })).status, 403);
  }
});

for (const propia of [true, false]) {
  test(`6B: ${propia ? 'salida' : 'expulsión'} SDK denegada; callable revoca y reingreso no recupera Finanzas`, async () => {
    const campos = ['iglesiaId', 'rolGlobal', ...(!propia ? ['descripcion'] : [])];
    const antes = await foto();
    const r = await cliente(usuarios[propia ? 'miembro' : 'admin'], p(usuarios.miembro.uid), { method: 'PATCH', campos, datos: { fields: {} } });
    assert.equal(r.status, 403);
    assert.deepEqual(await foto(), antes, 'La ruta cliente no escribe ningún efecto parcial');
    assert.equal((await leer(acceso)).encargadoUid, usuarios.miembro.uid);
    assert.equal((await leer(elegibilidad(usuarios.miembro.uid))).esEncargado, true);
    assert.equal((await db.collection(auditoria).get()).size, 0);
    assert.equal((await leer(p(usuarios.miembro.uid))).fcmToken, 'TOKEN_FICTICIO_NO_ENVIAR');
    await assert.rejects(llamar('vincularUsuarioConCodigo', usuarios.miembro, {
      codigo: 'FICTICIOA', solicitudId: 'ingreso-tras-intento-denegado-0001',
    }), { code: 'FAILED_PRECONDITION' });
    await llamar('desvincularMiembroIglesia', usuarios[propia ? 'miembro' : 'admin'], datosSalida(propia ? 'salir' : 'expulsar'));
    await llamar('vincularUsuarioConCodigo', usuarios.miembro, { codigo: 'FICTICIOA', solicitudId: 'reingreso-tras-callable-0001' });
    assert.notEqual((await leer(p(usuarios.miembro.uid))).pertenenciaId, periodo);
    assert.equal((await leer(acceso)).encargadoUid, null);
    assert.equal((await leer(elegibilidad(usuarios.miembro.uid))).esEncargado, false);
    assert.equal((await cliente(usuarios.miembro, `iglesias/${iglesia}/finanzas_movimientos/ficticio`)).status, 403,
      'El reingreso legítimo no recupera la designación revocada');
  });
}
