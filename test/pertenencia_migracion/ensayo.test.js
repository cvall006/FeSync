const { verificarEntorno } = require('../desvinculacion_integracion/entorno');
verificarEntorno(); // Antes de SDKs o fixtures.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { simular, ejecutarLote, completar, version } = require('./ensayo_emulador');
const { migrarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_ejecucion');
const { pertenenciaIdValido } = require('../../functions/pertenencia');
const usuarios = {};
const iglesia = 'ensayo-ficticio-a';
const perfil = (u) => `usuarios_globales/${u.uid}`;
const acceso = `iglesias/${iglesia}/finanzas_config/acceso`;
let db, originales;
let nonce = 0;
const nuevaClave = () => `ensayo-ficticio-solicitud-${++nonce}`;

async function local(url, opciones = {}) {
  return fetch(url, { ...opciones, signal: AbortSignal.timeout(90000) });
}
async function llamar(nombre, u, data) {
  const r = await local(`http://127.0.0.1:5008/demo-fesync/southamerica-west1/${nombre}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
    body: JSON.stringify({ data }),
  });
  const d = await r.json();
  if (d.error) throw Object.assign(new Error('Callable de ensayo rechazado.'), { code: d.error.status });
  assert.equal(r.ok, true); assert.ok(Object.hasOwn(d, 'result'));
  return d.result;
}
async function cliente(u, ruta, method = 'GET', datos) {
  return local(`http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/${ruta}`, {
    method, headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' },
    ...(datos ? { body: JSON.stringify(datos) } : {}),
  });
}
async function foto() {
  const salida = [];
  async function visitar(c) {
    for (const ref of await c.listDocuments()) {
      const s = await ref.get();
      if (s.exists) salida.push({ ruta: s.ref.path, datos: s.data(), version: version(s) });
      for (const sub of await ref.listCollections()) await visitar(sub);
    }
  }
  for (const c of await db.listCollections()) await visitar(c);
  return salida.sort((a, b) => a.ruta.localeCompare(b.ruta));
}
async function seleccion(u) {
  const s = await db.doc(perfil(u)).get();
  return { uid: u.uid, iglesiaId: iglesia, version: version(s) };
}
const migrar = (s, clienteDb = db) => migrarPerfilPertenencia({ db: clienteDb, FieldValue, seleccion: s });
async function salir(u, accion = 'salir', actor = u) {
  const d = (await db.doc(perfil(u)).get()).data();
  return llamar('desvincularMiembroIglesia', actor, { iglesiaId: iglesia, uidObjetivo: u.uid,
    accion, pertenenciaId: d.pertenenciaId, solicitudId: nuevaClave() });
}
async function rol(u) {
  const c = await llamar('obtenerContextoCambioRolMiembro', usuarios.admin,
    { iglesiaId: iglesia, uidObjetivo: u.uid });
  const { rolActual, ...versiones } = c;
  return llamar('actualizarRolMiembro', usuarios.admin, { iglesiaId: iglesia,
    uidObjetivo: u.uid, ...versiones, rolNuevo: rolActual === 'servidor' ? 'lider_area' : 'servidor', solicitudId: nuevaClave() });
}
async function transferir() {
  return llamar('transferirAdministracionIglesia', usuarios.admin,
    { iglesiaId: iglesia, nuevoAdminUid: usuarios.miembro.uid });
}
function pausa() {
  let avisar, continuar;
  const esperando = new Promise((r) => { avisar = r; });
  const permiso = new Promise((r) => { continuar = r; });
  // Barrera ANTES de la primera lectura; almacenamiento y commit siguen siendo
  // del SDK/emulador real. No forzar escrituras bajo un lock de lectura (deadlock).
  const clienteDb = { collection: db.collection.bind(db), runTransaction(callback, opciones) {
    return db.runTransaction(async (tx) => { avisar(); await permiso; return callback(tx); }, opciones);
  } };
  return { clienteDb, esperando, continuar };
}
async function verificarEstables() {
  for (const s of (await db.collection('usuarios_globales').get()).docs) {
    const original = originales[s.id];
    const datos = s.data();
    const comprobante = await db.doc(`migraciones_pertenencia/${s.id}`).get();
    if (comprobante.exists) {
      assert.equal(pertenenciaIdValido(datos.pertenenciaId), true);
      assert.deepEqual(datos, { ...original, pertenenciaId: datos.pertenenciaId });
      assert.equal(comprobante.data().pertenenciaId, datos.pertenenciaId);
      assert.equal(comprobante.data().iglesiaId, datos.iglesiaId);
      assert.equal(comprobante.data().origen, 'migracion_pertenencia_v1');
      assert.equal(comprobante.data().version, 1);
      assert.ok(s.updateTime.isEqual(comprobante.updateTime));
      assert.equal(comprobante.data().versionPerfilAnterior, originales.versiones[s.id]);
    } else {
      assert.deepEqual(datos, original);
      assert.equal(version(s), originales.versiones[s.id]);
    }
  }
}

before(async () => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  for (const nombre of ['admin', 'miembro', 'lider', 'otro', 'externo']) {
    const r = await local('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=ficticia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    const d = await r.json(); assert.equal(r.ok, true, 'Auth emulado no disponible');
    usuarios[nombre] = { uid: d.localId, token: d.idToken };
  }
});
after(async () => { if (db) await db.terminate(); });
beforeEach(async () => {
  const r = await local('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(r.ok, true);
  originales = { versiones: {} };
  const b = db.batch();
  for (const [nombre, u] of Object.entries(usuarios)) {
    originales[u.uid] = { iglesiaId: nombre === 'externo' ? 'ensayo-ficticio-b' : iglesia,
      rolGlobal: ['admin', 'externo'].includes(nombre) ? 'admin_iglesia' : nombre === 'lider' ? 'lider_area' : 'servidor',
      descripcion: 'Descripción ficticia', preferencias: { tema: 'oscuro', avisos: true },
      ...(nombre === 'otro' || nombre === 'externo' ? { pertenenciaId: 'a'.repeat(64) } : {}),
    };
  }
  const base = { iglesiaId: iglesia, rolGlobal: 'servidor', auxiliar: 'Conservar' };
  Object.assign(originales, {
    ficticio_sin_iglesia: { preferencias: { tema: 'claro' } },
    ficticio_id_invalido: { ...base, pertenenciaId: 'invalido' },
    ficticio_id_null: { ...base, pertenenciaId: null },
    ficticio_iglesia_inexistente: { ...base, iglesiaId: 'no-existe' },
    ficticio_rol_desconocido: { ...base, rolGlobal: 'desconocido' },
    ficticio_admin_incoherente: { ...base, rolGlobal: 'admin_iglesia' },
  });
  for (const [uid, datos] of Object.entries(originales)) {
    if (uid !== 'versiones') b.set(db.doc(`usuarios_globales/${uid}`), datos);
  }
  b.set(db.doc(`iglesias/${iglesia}`), { adminUid: usuarios.admin.uid, codigoAcceso: 'ENSAYOFICTICIOA' });
  b.set(db.doc('iglesias/ensayo-ficticio-b'), { adminUid: usuarios.externo.uid, codigoAcceso: 'ENSAYOFICTICIOB' });
  b.set(db.doc(acceso), { encargadoUid: usuarios.miembro.uid, moduloHabilitado: true });
  b.set(db.doc(`iglesias/${iglesia}/finanzas_elegibilidad/${usuarios.miembro.uid}`),
    { habilitado: true, esEncargado: true, version: 1 });
  await b.commit();
  for (const s of (await db.collection('usuarios_globales').get()).docs) originales.versiones[s.id] = version(s);
});

test('Ensayo operativo: simulación sin escrituras y solo métricas agregadas', async () => {
  const antes = await foto();
  const r = await simular(db);
  assert.deepEqual(r.porCategoria, { candidato: 3, omitido: 3, revision: 5, conflicto: 0 });
  assert.equal(r.perfiles, 11); assert.equal(r.completa, true);
  console.log('METRICAS_ENSAYO ' + JSON.stringify({ fase: 'simulacion', perfiles: r.perfiles,
    candidatos: r.porCategoria.candidato, omitidos: r.porCategoria.omitido,
    revision: r.porCategoria.revision, conflictos: r.porCategoria.conflicto }));
  assert.deepEqual(await foto(), antes);
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 0);
  for (const uid of Object.keys(originales)) assert.equal(JSON.stringify(r).includes(uid), false);
});
test('Ensayo operativo: lotes pequeños, comprobantes atómicos y verificación posterior', async () => {
  await simular(db);
  const primero = await ejecutarLote(db);
  assert.ok(primero.metricas.procesados <= 2);
  assert.equal((await completar(db)).completa, true);
  await verificarEstables();
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 3);
  assert.equal((await simular(db)).porCategoria.candidato, 0);
  console.log('METRICAS_ENSAYO ' + JSON.stringify({ fase: 'posterior', candidatos: 0, comprobantes: 3 }));
});
test('Ensayo operativo: repaso completo idempotente sin cambiar perfiles o comprobantes', async () => {
  await completar(db);
  const antes = (await foto()).filter((d) => !d.ruta.startsWith('ensayos_pertenencia/'));
  const r = await completar(db, { corrida: 'repaso' });
  assert.equal(r.metricas.migrados, 0);
  assert.deepEqual((await foto()).filter((d) => !d.ruta.startsWith('ensayos_pertenencia/')), antes);
  assert.deepEqual((await completar(db)).metricas.procesados, 0);
});
test('Ensayo operativo: interrupción tras commit y reanudación con selección original', async () => {
  let r;
  for (let i = 0; i < 8; i++) {
    r = await ejecutarLote(db, { interrumpirTrasConfirmar: true });
    if (r.interrumpida) break;
  }
  assert.equal(r.interrumpida, true);
  const pendiente = (await db.doc('ensayos_pertenencia/principal').get()).data().pendiente;
  const comprobante = await db.doc(`migraciones_pertenencia/${pendiente.uid}`).get();
  assert.equal(comprobante.exists, true);
  assert.equal(comprobante.data().versionPerfilAnterior, pendiente.version);
  const antes = version(comprobante);
  // Sin estado de cursor en memoria: se recupera exclusivamente desde el emulador.
  assert.equal((await completar(db)).completa, true);
  assert.equal(version(await comprobante.ref.get()), antes);
  await verificarEstables();
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 3);
});
test('Ensayo operativo: dos migradores independientes sin IDs o comprobantes duplicados', async () => {
  const r = await Promise.all([completar(db, { corrida: 'concurrente_a' }), completar(db, { corrida: 'concurrente_b' })]);
  assert.ok(r.every((x) => x.completa));
  assert.equal(r.reduce((t, x) => t + x.metricas.migrados, 0), 3);
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 3);
  await verificarEstables();
});
test('Ensayo operativo: perfil legado bloqueado antes y habilitado para roles después de migrar', async () => {
  await assert.rejects(rol(usuarios.miembro), { code: 'FAILED_PRECONDITION' });
  await assert.rejects(salir(usuarios.miembro), { code: 'INVALID_ARGUMENT' });
  await completar(db); // Incluye al administrador legado.
  assert.deepEqual(await rol(usuarios.miembro), { estado: 'CONFIRMADA', huboCambio: true });
  assert.equal((await db.doc(perfil(usuarios.miembro)).get()).data().rolGlobal, 'lider_area');
  assert.equal((await db.doc(acceso).get()).data().encargadoUid, usuarios.miembro.uid);
});
for (const accion of ['salir', 'expulsar']) {
  test(`Ensayo operativo: ${accion} posterior conserva revocación financiera atómica`, async () => {
    await completar(db);
    const u = usuarios.miembro;
    await db.doc(perfil(u)).update({ fcmToken: 'TOKEN_FICTICIO', fcmTokenActualizado: 1 });
    await salir(u, accion, accion === 'salir' ? u : usuarios.admin);
    const p = await db.doc(perfil(u)).get();
    assert.equal(Object.hasOwn(p.data(), 'iglesiaId'), false);
    assert.equal(Object.hasOwn(p.data(), 'fcmToken'), false);
    const c = await db.doc(acceso).get();
    assert.equal(c.data().encargadoUid, null);
    assert.ok(c.updateTime.isEqual(p.updateTime));
    const e = await db.doc(`iglesias/${iglesia}/finanzas_elegibilidad/${u.uid}`).get();
    assert.equal(e.data().habilitado, false); assert.ok(e.updateTime.isEqual(p.updateTime));
    assert.equal((await db.doc(`migraciones_pertenencia/${u.uid}`).get()).exists, true);
  });
}
for (const cambio of ['salida', 'reingreso', 'otra_iglesia', 'roles', 'transferencia']) {
  test(`Ensayo operativo: selección detenida y ${cambio} real no sobrescribe pertenencia posterior`, async () => {
    const s = await seleccion(usuarios.miembro);
    const barrera = pausa(); const tarea = migrar(s, barrera.clienteDb);
    await barrera.esperando;
    let antes;
    try {
      assert.equal((await migrar(s)).categoria, 'migrado');
      if (['salida', 'reingreso', 'otra_iglesia'].includes(cambio)) await salir(usuarios.miembro);
      if (cambio === 'reingreso' || cambio === 'otra_iglesia') {
        await llamar('vincularUsuarioConCodigo', usuarios.miembro, { codigo: cambio === 'otra_iglesia' ? 'ENSAYOFICTICIOB' : 'ENSAYOFICTICIOA', solicitudId: nuevaClave() });
        assert.equal((await db.doc(perfil(usuarios.miembro)).get()).data().iglesiaId,
          cambio === 'otra_iglesia' ? 'ensayo-ficticio-b' : iglesia);
        const periodo = (await db.doc(perfil(usuarios.miembro)).get()).data().pertenenciaId;
        assert.notEqual(periodo, (await db.doc(`migraciones_pertenencia/${s.uid}`).get()).data().pertenenciaId);
      }
      if (cambio === 'roles') await rol(usuarios.miembro);
      if (cambio === 'transferencia') await transferir();
      antes = await foto();
    } finally { barrera.continuar(); }
    assert.equal((await tarea).categoria, 'omitido');
    assert.deepEqual(await foto(), antes);
  });
}
test('Ensayo operativo: transferencia de legado durante espera produce conflicto sin asignación', async () => {
  const s = await seleccion(usuarios.miembro);
  const barrera = pausa(); const tarea = migrar(s, barrera.clienteDb);
  await barrera.esperando;
  let antes;
  try { await transferir(); antes = await foto(); } finally { barrera.continuar(); }
  assert.equal((await tarea).categoria, 'conflicto');
  assert.deepEqual(await foto(), antes);
});
test('Ensayo operativo: checkpoint incierto no avanza ante conflicto ni refresca versión', async () => {
  // Crear una selección candidata pendiente conocida, exclusivamente fixture.
  const s = await seleccion(usuarios.miembro);
  await db.doc('ensayos_pertenencia/principal').set({ version: 1, cursor: null, pendiente: s, completa: false });
  await db.doc(perfil(usuarios.miembro)).update({ descripcion: 'Cambio auxiliar ficticio' });
  const antes = await foto(); const r = await ejecutarLote(db);
  assert.equal(r.detenida, true); assert.equal(r.metricas.conflictos, 1);
  assert.deepEqual(await foto(), antes);
});
test('Ensayo operativo: comprobantes privados y reglas 6B protegen a perfiles migrados y legados', async () => {
  await completar(db);
  const comprobante = `migraciones_pertenencia/${usuarios.miembro.uid}`;
  const antes = await foto();
  for (const u of [usuarios.admin, usuarios.miembro, usuarios.externo]) {
    for (const [ruta, method, datos] of [
      [comprobante, 'GET'], ['migraciones_pertenencia', 'GET'],
      [comprobante, 'PATCH', { fields: { version: { integerValue: '2' } } }], [comprobante, 'DELETE'],
      [perfil(usuarios.miembro), 'PATCH', { fields: { iglesiaId: { stringValue: 'otra' } } }],
      [perfil(usuarios.miembro), 'PATCH', { fields: { rolGlobal: { stringValue: 'lider_area' } } }],
      ['usuarios_globales/ficticio_id_null', 'PATCH', { fields: { rolGlobal: { stringValue: 'lider_area' } } }],
    ]) assert.equal((await cliente(u, ruta, method, datos)).status, 403);
  }
  assert.deepEqual(await foto(), antes);
});
