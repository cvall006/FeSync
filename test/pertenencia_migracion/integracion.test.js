const { simularPertenencias, verificarEntornoEmulador } = require('../../functions/migraciones/pertenencia_simulacion');

// ANTES de importar/inicializar Admin o preparar datos ficticios.
verificarEntornoEmulador({
  proyecto: process.env.GCLOUD_PROJECT,
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
  storageHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
});

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldPath } = requireFunctions('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = requireFunctions('google-auth-library');
let db;

function representar(snapshot) {
  if (!snapshot.exists) return null;
  return {
    id: snapshot.id, perfil: snapshot.data(),
    version: `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}`,
  };
}

function lectorEmulador() {
  return Object.freeze({
    async listarPerfiles({ despuesDe, limite }) {
      let consulta = db.collection('usuarios_globales').orderBy(FieldPath.documentId()).limit(limite);
      if (despuesDe !== null) consulta = consulta.startAfter(despuesDe);
      return (await consulta.get()).docs.map(representar);
    },
    async leerPerfil(id) { return representar(await db.collection('usuarios_globales').doc(id).get()); },
    async leerIglesia(id) {
      const documento = await db.collection('iglesias').doc(id).get();
      return { id, existe: documento.exists, adminUid: documento.data()?.adminUid };
    },
  });
}

async function fotografia() {
  const colecciones = await db.listCollections();
  const documentos = [];
  for (const coleccion of colecciones.sort((a, b) => a.id.localeCompare(b.id))) {
    for (const documento of (await coleccion.orderBy(FieldPath.documentId()).get()).docs) {
      documentos.push({ ruta: documento.ref.path, datos: documento.data(),
        version: `${documento.updateTime.seconds}:${documento.updateTime.nanoseconds}` });
    }
  }
  return documentos;
}

before(() => {
  // Cliente sin credenciales ni ADC. El SDK añade su cabecera ficticia de
  // emulador al usar ssl:false. Auth vacío evita explorar metadatos/archivos ADC.
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }),
  });
});
after(async () => { if (db) await db.terminate(); });
beforeEach(async () => {
  // ÚNICAS escrituras: preparación de datos ficticios, fuera del simulador.
  const respuesta = await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents',
    { method: 'DELETE' });
  assert.equal(respuesta.ok, true);
  const perfiles = {
    a: { iglesiaId: 'congregacion-ficticia', rolGlobal: 'servidor' },
    b: {},
    c: { iglesiaId: 'congregacion-ficticia', rolGlobal: 'lider_area', pertenenciaId: 'a'.repeat(64) },
    d: { iglesiaId: 'congregacion-ficticia', rolGlobal: 'servidor', pertenenciaId: null },
    e: { iglesiaId: 'inexistente', rolGlobal: 'servidor' },
    f: { iglesiaId: 'congregacion-ficticia', rolGlobal: 'admin_iglesia' },
    titular: { iglesiaId: 'congregacion-ficticia', rolGlobal: 'admin_iglesia' },
  };
  for (const [id, perfil] of Object.entries(perfiles)) {
    await db.collection('usuarios_globales').doc(id).set(perfil);
  }
  await db.collection('iglesias').doc('congregacion-ficticia').set({ adminUid: 'titular' });
});

test('Emulador: métricas agregadas correctas, páginas exclusivas y cero escrituras', async () => {
  const antes = await fotografia();
  const r = await simularPertenencias({ lector: lectorEmulador(), tamanoPagina: 2 });
  assert.equal(r.completa, true);
  assert.equal(r.perfiles, 7);
  assert.equal(r.paginas, 4);
  assert.deepEqual(r.porCategoria, { candidato: 2, omitido: 2, revision: 3, conflicto: 0 });
  assert.deepEqual(await fotografia(), antes);
  for (const privado of ['titular', 'congregacion-ficticia', 'a'.repeat(64), 'usuarios_globales']) {
    assert.equal(JSON.stringify(r).includes(privado), false);
  }
});

test('Emulador: cambio concurrente entre listado y relectura produce conflicto', async () => {
  const lector = lectorEmulador();
  let avisar;
  let continuar;
  const esperando = new Promise((resolve) => { avisar = resolve; });
  const permiso = new Promise((resolve) => { continuar = resolve; });
  const ejecucion = simularPertenencias({ lector: {
    ...lector,
    async leerPerfil(id) {
      if (id === 'a') { avisar(); await permiso; }
      return lector.leerPerfil(id);
    },
  } });
  await esperando;
  // Escritor concurrente ficticio, ajeno al simulador.
  try { await db.collection('usuarios_globales').doc('a').update({ descripcion: 'Cambio ficticio' }); }
  finally { continuar(); }
  const r = await ejecucion;
  assert.equal(r.porCategoria.conflicto, 1);
  assert.equal(r.porCategoria.candidato, 1);
});

test('Emulador: documento eliminado después del listado no se recrea', async () => {
  const lector = lectorEmulador();
  const pagina = await lector.listarPerfiles({ despuesDe: null, limite: 10 });
  await db.collection('usuarios_globales').doc('a').delete();
  const antes = await fotografia();
  const r = await simularPertenencias({ lector: { ...lector, listarPerfiles: async () => pagina } });
  assert.equal(r.porMotivo.perfil_inexistente, 1);
  assert.deepEqual(await fotografia(), antes);
});
