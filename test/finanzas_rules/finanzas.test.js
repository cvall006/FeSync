const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Reutiliza las dependencias locales existentes, sin instalar paquetes.
const requireReglas = createRequire(path.join(__dirname, '..', 'capacitaciones_rules', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = requireReglas('@firebase/rules-unit-testing');
const {
  doc, collection, collectionGroup, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, query, where, writeBatch, setLogLevel, documentId,
} = requireReglas('firebase/firestore');

setLogLevel('silent');
let env;
const colecciones = [
  'finanzas_cuentas', 'finanzas_categorias', 'finanzas_movimientos',
  'finanzas_cierres', 'finanzas_auditoria',
];
const rutas = ['finanzas_config/acceso', ...colecciones.map((nombre) => `${nombre}/ejemplo`)];
const dbUsuario = (uid, claims) => uid === null
  ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid, claims).firestore();
const documento = (db, ruta, iglesia = 'a') => doc(db, `iglesias/${iglesia}/${ruta}`);
const acceso = (db) => documento(db, 'finanzas_config/acceso');

async function preparar(cambios) {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [ruta, datos] of Object.entries(cambios)) {
      const referencia = doc(context.firestore(), ruta);
      if (datos === null) await deleteDoc(referencia);
      else await setDoc(referencia, datos);
    }
  });
}

before(async () => {
  // Host y proyecto fijos: la suite nunca usa el proyecto de producción.
  const puertoAislado = process.env.FINANZAS_RULES_EMULATOR_PORT;
  if(puertoAislado !== undefined && puertoAislado !== '8098') {
    throw Error('Solo puerto aislado 8098 o puerto histórico 8088.');
  }
  env = await initializeTestEnvironment({
    projectId: 'demo-fesync',
    firestore: {
      host: '127.0.0.1', port: puertoAislado === '8098' ? 8098 : 8088,
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
    },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  const datos = {
    'iglesias/a': { adminUid: 'admin' },
    'iglesias/b': { adminUid: 'externo' },
    'iglesias/a/finanzas_config/acceso': { encargadoUid: 'encargado', moduloHabilitado: true },
    'iglesias/b/finanzas_config/acceso': { encargadoUid: 'externo', moduloHabilitado: true },
    'iglesias/a/finanzas_config/otro': { privado: true },
  };
  for (const [uid, rolGlobal, iglesiaId] of [
    ['admin', 'admin_iglesia', 'a'], ['encargado', 'servidor', 'a'],
    ['lider', 'lider_area', 'a'], ['miembro', 'servidor', 'a'],
    ['anterior', 'admin_iglesia', 'a'], ['externo', 'admin_iglesia', 'b'],
  ]) datos[`usuarios_globales/${uid}`] = { iglesiaId, rolGlobal };
  for (const iglesia of ['a', 'b']) {
    for (const nombre of colecciones) {
      datos[`iglesias/${iglesia}/${nombre}/ejemplo`] = { ejemplo: true };
    }
  }
  await preparar(datos);
});

for (const configuracion of [
  { encargadoUid: 'encargado', moduloHabilitado: false },
  { encargadoUid: 'encargado' },
  null,
]) {
  test(`Titular obtiene configuración sin habilitación: ${JSON.stringify(configuracion)}`, async () => {
    await preparar({ 'iglesias/a/finanzas_config/acceso': configuracion });
    await assertSucceeds(getDoc(acceso(dbUsuario('admin'))));
    await assertFails(getDoc(acceso(dbUsuario('encargado'))));
    for (const uid of ['admin', 'encargado']) {
      await assertFails(getDoc(documento(dbUsuario(uid), 'finanzas_movimientos/ejemplo')));
    }
  });
}

for (const uid of ['admin', 'encargado']) {
  test(`${uid} conserva configuración y catálogos; libro y auditoría requieren servidor`, async () => {
    const db = dbUsuario(uid);
    await assertSucceeds(getDoc(acceso(db)));
    for (const nombre of colecciones) {
      if (['finanzas_cuentas', 'finanzas_categorias'].includes(nombre)) {
        await assertSucceeds(getDoc(documento(db, `${nombre}/ejemplo`)));
        const resultado = await assertSucceeds(getDocs(collection(db, `iglesias/a/${nombre}`)));
        assert.equal(resultado.size, 1);
      } else {
        await assertFails(getDoc(documento(db, `${nombre}/ejemplo`)));
        await assertFails(getDocs(collection(db, `iglesias/a/${nombre}`)));
      }
    }
    await assertFails(getDocs(collection(db, 'iglesias/a/finanzas_config')));
    await assertFails(getDoc(documento(db, 'finanzas_config/otro')));
  });
}

for (const uid of ['lider', 'miembro', 'anterior', 'externo', 'sin-perfil', null]) {
  test(`${uid ?? 'sin sesión'} no obtiene ni consulta rutas financieras`, async () => {
    const db = dbUsuario(uid);
    for (const ruta of rutas) await assertFails(getDoc(documento(db, ruta)));
    for (const nombre of ['finanzas_config', ...colecciones]) {
      await assertFails(getDocs(collection(db, `iglesias/a/${nombre}`)));
    }
  });
}

for (const moduloHabilitado of [false, null, 'true', 1]) {
  test(`Habilitación ${JSON.stringify(moduloHabilitado)} no concede lecturas financieras`, async () => {
    await preparar({ 'iglesias/a/finanzas_config/acceso': { encargadoUid: 'encargado', moduloHabilitado } });
    for (const uid of ['admin', 'encargado']) {
      const db = dbUsuario(uid);
      for (const nombre of colecciones) {
        await assertFails(getDoc(documento(db, `${nombre}/ejemplo`)));
        await assertFails(getDocs(collection(db, `iglesias/a/${nombre}`)));
      }
    }
    await assertSucceeds(getDoc(acceso(dbUsuario('admin'))));
    await assertFails(getDoc(acceso(dbUsuario('encargado'))));
  });
}

for (const [nombre, cambios] of [
  ['iglesia ausente', { 'iglesias/a': null }],
  ['adminUid ausente', { 'iglesias/a': {} }],
  ['adminUid inválido', { 'iglesias/a': { adminUid: 42 } }],
  ['perfil titular ausente', { 'usuarios_globales/admin': null }],
  ['titular con rol incorrecto', { 'usuarios_globales/admin': { iglesiaId: 'a', rolGlobal: 'lider_area' } }],
  ['titular fuera de iglesia', { 'usuarios_globales/admin': { iglesiaId: 'b', rolGlobal: 'admin_iglesia' } }],
]) {
  test(`Sin titular válido (${nombre}) se deniega incluso al encargado`, async () => {
    await preparar(cambios);
    for (const uid of ['admin', 'encargado']) {
      const db = dbUsuario(uid);
      for (const ruta of rutas) await assertFails(getDoc(documento(db, ruta)));
    }
  });
}

test('Revocación, cambio de iglesia y transferencia administrativa retiran acceso', async () => {
  const encargadoDb = dbUsuario('encargado');
  await assertSucceeds(getDoc(acceso(encargadoDb)));
  await preparar({ 'iglesias/a/finanzas_config/acceso': { encargadoUid: null, moduloHabilitado: true } });
  await assertFails(getDoc(acceso(encargadoDb)));
  await preparar({ 'iglesias/a/finanzas_config/acceso': { encargadoUid: 'encargado', moduloHabilitado: true },
    'usuarios_globales/encargado': { iglesiaId: 'b', rolGlobal: 'servidor' } });
  await assertFails(getDoc(acceso(encargadoDb)));
  await preparar({ 'iglesias/a': { adminUid: 'anterior' } });
  await assertFails(getDoc(acceso(dbUsuario('admin'))));
  await assertSucceeds(getDoc(acceso(dbUsuario('anterior'))));
});

for (const uid of ['admin', 'encargado', 'lider', 'miembro', 'anterior', 'externo', null]) {
  test(`${uid ?? 'sin sesión'} no crea, actualiza ni elimina documentos financieros`, async () => {
    const db = dbUsuario(uid);
    for (const ruta of rutas) {
      const ref = documento(db, ruta);
      const nuevaRuta = ruta === 'finanzas_config/acceso' ? 'finanzas_config/nuevo' : ruta.replace('/ejemplo', '/nuevo');
      await assertFails(setDoc(documento(db, nuevaRuta), { encargadoUid: uid, rolGlobal: 'admin_iglesia', moduloHabilitado: true }));
      await assertFails(updateDoc(ref, { encargadoUid: uid, moduloHabilitado: true }));
      await assertFails(deleteDoc(ref));
    }
  });
}

test('No se puede crear acceso directamente cuando falta el documento', async () => {
  await preparar({ 'iglesias/a/finanzas_config/acceso': null });
  await assertFails(setDoc(acceso(dbUsuario('admin')), { encargadoUid: 'admin', moduloHabilitado: true }));
});

test('Claims y campos de perfil falsificados no conceden permisos', async () => {
  const db = dbUsuario('miembro', { rolGlobal: 'admin_iglesia', adminUid: 'miembro', encargadoUid: 'miembro' });
  await assertFails(getDoc(acceso(db)));
  await assertFails(updateDoc(doc(db, 'usuarios_globales/miembro'), { rolGlobal: 'admin_iglesia' }));
  await assertFails(updateDoc(doc(db, 'iglesias/a'), { adminUid: 'miembro' }));
  // El perfil propio admite campos auxiliares; la política financiera los ignora.
  await assertSucceeds(updateDoc(doc(db, 'usuarios_globales/miembro'), { encargadoUid: 'miembro', esFinanciero: true }));
  await assertFails(getDoc(documento(db, 'finanzas_movimientos/ejemplo')));
  await assertFails(updateDoc(acceso(db), { encargadoUid: 'miembro', moduloHabilitado: true }));
});

test('Escrituras agrupadas no habilitan acceso ni crean movimientos', async () => {
  const db = dbUsuario('admin');
  const batch = writeBatch(db);
  batch.update(acceso(db), { encargadoUid: 'admin', moduloHabilitado: true });
  batch.set(documento(db, 'finanzas_movimientos/nuevo'), { importe: 1 });
  await assertFails(batch.commit());
});

for (const uid of ['admin', 'encargado', 'externo']) {
  test(`${uid} no consulta finanzas de otra iglesia ni grupos globales`, async () => {
    const db = dbUsuario(uid);
    const iglesiaAjena = uid === 'externo' ? 'a' : 'b';
    for (const ruta of rutas) await assertFails(getDoc(documento(db, ruta, iglesiaAjena)));
    for (const nombre of colecciones) {
      await assertFails(getDocs(collection(db, `iglesias/${iglesiaAjena}/${nombre}`)));
      await assertFails(getDocs(collectionGroup(db, nombre)));
      await assertFails(getDocs(query(collectionGroup(db, nombre), where('ejemplo', '==', true))));
    }
  });
}

test('Comodines no abren subcolecciones anidadas ni rutas financieras desconocidas', async () => {
  const db = dbUsuario('admin');
  await assertFails(getDoc(documento(db, 'finanzas_movimientos/ejemplo/detalles/privado')));
  await assertFails(setDoc(documento(db, 'finanzas_movimientos/ejemplo/detalles/privado'), { importe: 1 }));
  await assertFails(getDoc(documento(db, 'finanzas_desconocida/ejemplo')));
  await assertFails(getDoc(doc(db, 'finanzas_movimientos/global')));
});

const senal = { habilitado: true, esEncargado: true, version: 1 };
const elegibilidad = (db, uid, iglesia = 'a') => documento(db, `finanzas_elegibilidad/${uid}`, iglesia);

test('Cada usuario obtiene únicamente su señal, incluso deshabilitada o ausente', async () => {
  for (const uid of ['admin', 'encargado', 'lider', 'miembro', 'anterior', 'externo']) {
    const iglesia = uid === 'externo' ? 'b' : 'a';
    const db = dbUsuario(uid);
    const inexistente = await assertSucceeds(getDoc(elegibilidad(db, uid, iglesia)));
    assert.equal(inexistente.exists(), false);
    await preparar({ [`iglesias/${iglesia}/finanzas_elegibilidad/${uid}`]: senal });
    assert.deepEqual((await assertSucceeds(getDoc(elegibilidad(db, uid, iglesia)))).data(), senal);
    await preparar({ [`iglesias/${iglesia}/finanzas_elegibilidad/${uid}`]: { habilitado: false, esEncargado: false, version: 2 } });
    await assertSucceeds(getDoc(elegibilidad(db, uid, iglesia)));
  }
});

test('Ni el titular puede leer señales individuales ajenas', async () => {
  await preparar({ 'iglesias/a/finanzas_elegibilidad/encargado': senal });
  for (const uid of ['admin', 'miembro', 'lider', 'anterior', 'externo', null]) {
    await assertFails(getDoc(elegibilidad(dbUsuario(uid), 'encargado')));
  }
});

test('Pertenencia vigente es obligatoria para obtener la señal propia', async () => {
  await preparar({
    'iglesias/a/finanzas_elegibilidad/externo': senal,
    'iglesias/a/finanzas_elegibilidad/encargado': senal,
    'iglesias/a/finanzas_elegibilidad/sin-perfil': senal,
  });
  await assertFails(getDoc(elegibilidad(dbUsuario('externo'), 'externo')));
  await assertFails(getDoc(elegibilidad(dbUsuario('sin-perfil'), 'sin-perfil')));
  await preparar({ 'usuarios_globales/encargado': { iglesiaId: 'b', rolGlobal: 'servidor' } });
  await assertFails(getDoc(elegibilidad(dbUsuario('encargado'), 'encargado')));
});

test('No se enumeran señales ni con filtros por UID ni mediante collectionGroup', async () => {
  for (const uid of ['admin', 'encargado', 'miembro', null]) {
    const db = dbUsuario(uid);
    const ref = collection(db, 'iglesias/a/finanzas_elegibilidad');
    await assertFails(getDocs(ref));
    await assertFails(getDocs(query(ref, where(documentId(), '==', uid ?? 'anonimo'))));
    await assertFails(getDocs(query(ref, where('esEncargado', '==', true))));
    await assertFails(getDocs(collectionGroup(db, 'finanzas_elegibilidad')));
  }
});

test('Ningún cliente crea, actualiza ni elimina elegibilidad propia o ajena', async () => {
  await preparar({ 'iglesias/a/finanzas_elegibilidad/encargado': senal });
  for (const uid of ['admin', 'encargado', 'miembro', 'lider', 'anterior', 'externo', null]) {
    const db = dbUsuario(uid);
    await assertFails(setDoc(elegibilidad(db, uid ?? 'anonimo'), senal));
    await assertFails(updateDoc(elegibilidad(db, 'encargado'), { habilitado: false }));
    await assertFails(deleteDoc(elegibilidad(db, 'encargado')));
  }
});

for (const [nombre, cambios] of [
  ['configuración deshabilitada', { 'iglesias/a/finanzas_config/acceso': { encargadoUid: 'encargado', moduloHabilitado: false } }],
  ['designación revocada', { 'iglesias/a/finanzas_config/acceso': { encargadoUid: null, moduloHabilitado: true } }],
  ['configuración ausente', { 'iglesias/a/finanzas_config/acceso': null }],
  ['titular sin rol', { 'usuarios_globales/admin': { iglesiaId: 'a', rolGlobal: 'lider_area' } }],
]) {
  test(`Señal positiva no concede acceso con ${nombre}`, async () => {
    await preparar({ 'iglesias/a/finanzas_elegibilidad/encargado': senal, ...cambios });
    const db = dbUsuario('encargado');
    await assertSucceeds(getDoc(elegibilidad(db, 'encargado')));
    for (const ruta of rutas) await assertFails(getDoc(documento(db, ruta)));
    for (const nombre of colecciones) await assertFails(getDocs(collection(db, `iglesias/a/${nombre}`)));
  });
}

test('Señal propia no otorga administración a servidor o líder no designado', async () => {
  for (const uid of ['miembro', 'lider', 'anterior']) {
    await preparar({ [`iglesias/a/finanzas_elegibilidad/${uid}`]: senal });
    const db = dbUsuario(uid);
    await assertSucceeds(getDoc(elegibilidad(db, uid)));
    await assertFails(getDoc(acceso(db)));
    await assertFails(getDoc(documento(db, 'finanzas_movimientos/ejemplo')));
  }
});
