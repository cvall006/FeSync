const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireReglas = createRequire(path.join(__dirname, '..', 'capacitaciones_rules', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = requireReglas('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch,
  runTransaction, setLogLevel, collection, getDocs, query, where,
} = requireReglas('firebase/firestore');

setLogLevel('silent');
let env;
const id = 'a'.repeat(64);
const otroId = 'b'.repeat(64);
const dbUsuario = (uid) => uid === null
  ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid).firestore();
const perfil = (db, uid = 'miembro') => doc(db, 'usuarios_globales', uid);
const datosPerfil = (conId = true) => ({
  iglesiaId: 'a', rolGlobal: 'servidor', nombre: 'Miembro', descripcion: 'Servicio',
  ...(conId ? { pertenenciaId: id } : {}),
});

before(async () => {
  const puertoAislado = process.env.FINANZAS_RULES_EMULATOR_PORT;
  if (puertoAislado !== undefined && puertoAislado !== '8098') {
    throw Error('Solo puerto aislado 8098 o puerto histórico 8088.');
  }
  env = await initializeTestEnvironment({
    projectId: 'demo-fesync',
    firestore: {
      host: '127.0.0.1', port: puertoAislado === '8098' ? 8098 : 8088,
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'docs/membresia_piloto_2026-10-28/firestore.piloto.rules'), 'utf8'),
    },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, datos] of Object.entries({
      admin: { iglesiaId: 'a', rolGlobal: 'admin_iglesia', pertenenciaId: id },
      miembro: datosPerfil(), antiguo: datosPerfil(false),
      lider: { iglesiaId: 'a', rolGlobal: 'lider_area' },
      externo: { iglesiaId: 'b', rolGlobal: 'admin_iglesia' },
    })) await setDoc(perfil(db, uid), datos);
    await setDoc(doc(db, 'iglesias/a'), { adminUid: 'admin' });
  });
});

for (const uid of ['miembro', 'admin', 'lider', 'externo', null]) {
  test(`${uid ?? 'sin sesión'} no cambia, borra ni sustituye pertenenciaId`, async () => {
    const ref = perfil(dbUsuario(uid));
    for (const pertenenciaId of [otroId, null, 1, {}, deleteField()]) {
      await assertFails(updateDoc(ref, { pertenenciaId }));
    }
    await assertFails(setDoc(ref, { ...datosPerfil(), pertenenciaId: otroId }));
    await assertFails(setDoc(ref, datosPerfil(false)));
    await assertFails(setDoc(ref, { pertenenciaId: otroId }, { merge: true }));
    await assertFails(deleteDoc(ref));
  });
}

for (const actor of ['antiguo', 'admin']) {
  test(`${actor} no añade pertenenciaId a un perfil heredado`, async () => {
    const ref = perfil(dbUsuario(actor), 'antiguo');
    for (const pertenenciaId of [otroId, null, '']) {
      await assertFails(updateDoc(ref, { pertenenciaId }));
      await assertFails(setDoc(ref, { pertenenciaId }, { merge: true }));
    }
    await assertFails(setDoc(ref, { ...datosPerfil(false), pertenenciaId: otroId }));
  });
}

for (const uid of ['miembro', 'antiguo']) {
  test(`Edición auxiliar y patrones actuales siguen funcionando para ${uid}`, async () => {
    const db = dbUsuario(uid);
    const ref = perfil(db, uid);
    await assertSucceeds(updateDoc(ref, { nombre: 'Actualizado', descripcion: 'Nueva', fotoUrl: 'foto' }));
    await assertSucceeds(setDoc(ref, { modoOscuro: true }, { merge: true }));
    await assertSucceeds(updateDoc(ref, { 'notificacionesPendientes.agenda': 0 }));
    const batch = writeBatch(db);
    batch.set(ref, { fcmToken: 'token-sintetico', fcmTokenActualizado: 'fecha-sintetica' }, { merge: true });
    batch.set(doc(db, `usuarios_globales/${uid}/dispositivos/prueba`), { activo: true });
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(ref, { fcmToken: deleteField(), fcmTokenActualizado: deleteField() }));
    const datos = (await getDoc(ref)).data();
    assert.equal(datos.nombre, 'Actualizado');
    assert.equal(datos.modoOscuro, true);
    assert.equal(datos.pertenenciaId, uid === 'miembro' ? id : undefined);
  });

  test(`Salida antigua solo para perfil sin generación: ${uid}`, async () => {
    const ref = perfil(dbUsuario(uid), uid);
    await (uid === 'antiguo' ? assertSucceeds : assertFails)(updateDoc(ref, { iglesiaId: deleteField(), rolGlobal: deleteField() }));
    const datos = (await getDoc(ref)).data();
    assert.equal(datos.iglesiaId, uid === 'antiguo' ? undefined : 'a');
    assert.equal(datos.rolGlobal, uid === 'antiguo' ? undefined : 'servidor');
    assert.equal(datos.pertenenciaId, uid === 'miembro' ? id : undefined);
    assert.equal(datos.nombre, 'Miembro');
  });

  test(`Admin gestiona legados; generación impide rol/expulsión directa: ${uid}`, async () => {
    const ref = perfil(dbUsuario('admin'), uid);
    await (uid === 'antiguo' ? assertSucceeds : assertFails)(updateDoc(ref, { descripcion: 'No guardar', rolGlobal: 'lider_area' }));
    await assertSucceeds(updateDoc(ref, { descripcion: 'Editada', rolGlobal: 'servidor' }));
    await (uid === 'antiguo' ? assertSucceeds : assertFails)(updateDoc(ref, {
      iglesiaId: deleteField(), rolGlobal: deleteField(), descripcion: deleteField(),
    }));
    const datos = (await getDoc(perfil(dbUsuario(uid), uid))).data();
    assert.equal(datos.iglesiaId, uid === 'antiguo' ? undefined : 'a');
    assert.equal(datos.rolGlobal, uid === 'antiguo' ? undefined : 'servidor');
    assert.equal(datos.descripcion, uid === 'antiguo' ? undefined : 'Editada');
    assert.equal(datos.pertenenciaId, uid === 'miembro' ? id : undefined);
    assert.equal(datos.nombre, 'Miembro');
  });
}

test('Reemplazo auxiliar propio solo se permite conservando toda la pertenencia', async () => {
  const ref = perfil(dbUsuario('miembro'));
  await assertSucceeds(setDoc(ref, { ...datosPerfil(), nombre: 'Nuevo' }));
  assert.equal((await getDoc(ref)).data().pertenenciaId, id);
  const antiguo = perfil(dbUsuario('antiguo'), 'antiguo');
  await assertSucceeds(setDoc(antiguo, { ...datosPerfil(false), nombre: 'Nuevo' }));
  assert.equal(Object.hasOwn((await getDoc(antiguo)).data(), 'pertenenciaId'), false);
});

for (const objetivo of ['miembro', 'antiguo']) {
  for (const actor of [objetivo, 'admin', 'lider', 'externo', null]) {
    test(`${actor ?? 'sin sesión'} no altera iglesia/rol mediante update, merge o reemplazo: ${objetivo}`, async () => {
      const ref = perfil(dbUsuario(actor), objetivo);
      for (const cambio of [
        { iglesiaId: 'b' }, { iglesiaId: null }, { iglesiaId: deleteField() },
        { rolGlobal: 'lider_area' }, { rolGlobal: null }, { rolGlobal: deleteField() },
        { iglesiaId: 'b', rolGlobal: 'lider_area', nombre: 'No guardar' },
        { iglesiaId: deleteField(), rolGlobal: deleteField(), descripcion: deleteField() },
      ]) {
        if (objetivo === 'antiguo' && ((actor === 'admin' && cambio.rolGlobal === 'lider_area' && !Object.hasOwn(cambio,'iglesiaId')) || ([objetivo,'admin'].includes(actor) && typeof cambio.iglesiaId === 'object' && typeof cambio.rolGlobal === 'object'))) continue;
        await assertFails(updateDoc(ref, cambio));
        await assertFails(setDoc(ref, cambio, { merge: true }));
      }
      const original = datosPerfil(objetivo === 'miembro');
      for (const campo of ['iglesiaId', 'rolGlobal', ...(objetivo === 'miembro' ? ['pertenenciaId'] : [])]) {
        const incompleto = { ...original };
        delete incompleto[campo];
        await assertFails(setDoc(ref, incompleto));
      }
      await assertFails(setDoc(ref, { ...original, iglesiaId: 'b', rolGlobal: 'lider_area' }));
      await assertFails(setDoc(ref, { iglesiaId: 'b' }, { mergeFields: ['iglesiaId'] }));
      for (const campo of ['iglesiaId', 'rolGlobal', 'pertenenciaId']) {
        await assertFails(updateDoc(ref, { [`${campo}.falso`]: 'valor' }));
      }
      assert.deepEqual((await getDoc(perfil(dbUsuario(objetivo), objetivo))).data(), original);
    });
  }
}

test('Batch y transacción no terminan pertenencia ni guardan efectos auxiliares parciales', async () => {
  for (const uid of ['miembro', 'antiguo']) {
    const db = dbUsuario(uid);
    const ref = perfil(db, uid);
    const batch = writeBatch(db);
    batch.update(ref, { iglesiaId: deleteField(), rolGlobal: deleteField(), nombre: 'No guardar' });
    batch.set(doc(db, `usuarios_globales/${uid}/dispositivos/no-guardar-salida`), { activo: true });
    await assertFails(batch.commit());
    assert.equal((await getDoc(doc(db, `usuarios_globales/${uid}/dispositivos/no-guardar-salida`))).exists(), false);
    await assertFails(runTransaction(db, async (tx) => {
      await tx.get(ref);
      tx.update(ref, { iglesiaId: 'b', rolGlobal: 'lider_area' });
    }));
    assert.equal((await getDoc(ref)).data().nombre, 'Miembro');
  }
});

test('Legados sin ID conservan lectura propia, congregacional y consultas acotadas', async () => {
  const db = dbUsuario('antiguo');
  assert.equal(Object.hasOwn((await assertSucceeds(getDoc(perfil(db, 'antiguo')))).data(), 'pertenenciaId'), false);
  await assertSucceeds(getDoc(perfil(db, 'miembro')));
  await assertSucceeds(getDoc(doc(db, 'iglesias/a')));
  const lista = await assertSucceeds(getDocs(query(collection(db, 'usuarios_globales'), where('iglesiaId', '==', 'a'))));
  assert.equal(lista.size, 4);
  await assertFails(getDoc(perfil(db, 'externo')));
  await assertFails(getDocs(collection(db, 'usuarios_globales')));
});

test('Perfil desvinculado no puede incorporar iglesia, rol o ID desde SDK, ni por otro administrador', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(perfil(context.firestore(), 'desvinculado'), { nombre: 'Sin iglesia' });
  });
  const propietario = perfil(dbUsuario('desvinculado'), 'desvinculado');
  await assertSucceeds(getDoc(propietario));
  for (const actor of ['desvinculado', 'admin']) {
    const ref = perfil(dbUsuario(actor), 'desvinculado');
    for (const cambio of [
      { iglesiaId: 'a', rolGlobal: 'servidor' },
      { pertenenciaId: id },
      { iglesiaId: 'a', rolGlobal: 'servidor', pertenenciaId: id },
    ]) {
      await assertFails(updateDoc(ref, cambio));
      await assertFails(setDoc(ref, cambio, { merge: true }));
      await assertFails(setDoc(ref, { nombre: 'No guardar', ...cambio }));
    }
  }
  assert.deepEqual((await getDoc(propietario)).data(), { nombre: 'Sin iglesia' });
});

for (const uid of ['miembro', 'antiguo']) {
  test(`Salida no permite falsificar o borrar el identificador: ${uid}`, async () => {
    const ref = perfil(dbUsuario(uid), uid);
    for (const pertenenciaId of [otroId, null, ...(uid === 'miembro' ? [deleteField()] : [])]) {
      await assertFails(updateDoc(ref, {
        iglesiaId: deleteField(), rolGlobal: deleteField(), pertenenciaId,
      }));
    }
    if (uid === 'miembro') await assertFails(setDoc(ref, { nombre: 'Reemplazo sin identificador' }));
    assert.equal((await getDoc(ref)).data().iglesiaId, 'a');
  });
}

test('Expulsión no permite modificar o borrar el identificador simultáneamente', async () => {
  const ref = perfil(dbUsuario('admin'));
  for (const pertenenciaId of [otroId, null, deleteField()]) {
    await assertFails(updateDoc(ref, {
      iglesiaId: deleteField(), rolGlobal: deleteField(), descripcion: deleteField(), pertenenciaId,
    }));
  }
  await assertFails(setDoc(ref, { nombre: 'Sin identificador' }));
});

test('Escrituras agrupadas y transacciones cliente no eluden la protección', async () => {
  const db = dbUsuario('miembro');
  const ref = perfil(db);
  const batch = writeBatch(db);
  batch.update(ref, { nombre: 'No guardar', pertenenciaId: otroId });
  batch.set(doc(db, 'usuarios_globales/miembro/dispositivos/no-guardar'), { activo: true });
  await assertFails(batch.commit());
  assert.equal((await getDoc(ref)).data().nombre, 'Miembro');
  assert.equal((await getDoc(doc(db, 'usuarios_globales/miembro/dispositivos/no-guardar'))).exists(), false);
  await assertFails(runTransaction(db, async (transaction) => {
    await transaction.get(ref);
    transaction.update(ref, { pertenenciaId: deleteField() });
  }));
});

test('Rutas generales no permiten crear perfiles ni sustituir el campo por mapa anidado', async () => {
  for (const uid of ['miembro', 'admin', null]) {
    const db = dbUsuario(uid);
    await assertFails(setDoc(perfil(db, 'nuevo'), { ...datosPerfil(), pertenenciaId: otroId }));
    await assertFails(updateDoc(perfil(db), { 'pertenenciaId.falso': otroId }));
    await assertFails(setDoc(doc(db, 'usuarios_globales/miembro/pertenencia/vigente'), { pertenenciaId: otroId }));
    await assertFails(setDoc(doc(db, 'pertenencias/miembro'), { pertenenciaId: otroId }));
  }
});

test('Administrador titular conserva la restricción existente de salida', async () => {
  await assertFails(updateDoc(perfil(dbUsuario('admin'), 'admin'), {
    iglesiaId: deleteField(), rolGlobal: deleteField(),
  }));
});
