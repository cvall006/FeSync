const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararIdempotenciaIngreso, consultarEstadoSolicitudIngreso } = require('../idempotencia_ingreso');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

test('Sin clave no crea referencias ni introduce escrituras para clientes antiguos', () => {
  const db = { collection() { throw new Error('No debe consultar recibos'); } };
  assert.equal(prepararIdempotenciaIngreso({ db, datos: {}, HttpsError }), null);
});

test('Huella canónica independiente del orden, recibo mínimo y separación de fases', async () => {
  const referencia = { collection: () => ({ doc: () => referencia }) };
  const db = { collection: () => ({ doc: () => referencia }) };
  const escrituras = [];
  const base = { db, uid: 'actor', datos: { solicitudId: 'solicitud_prueba_01' }, tipo: 'vincular', HttpsError };
  const primero = prepararIdempotenciaIngreso({ ...base, parametros: { codigo: 'SECRETO', nombre: 'Privado' } });
  const segundo = prepararIdempotenciaIngreso({ ...base, parametros: { nombre: 'Privado', codigo: 'SECRETO' } });
  const transaction = {
    async get() { assert.equal(escrituras.length, 0); return { exists: false }; },
    create(ref, datos) { escrituras.push(datos); },
  };
  assert.equal(await primero.leer(transaction, { exists: false }), null);
  const resultado = { iglesiaId: 'iglesia', pertenenciaId: 'a'.repeat(64) };
  const FieldValue = { serverTimestamp: () => 'servidor' };
  primero.registrar(transaction, resultado, FieldValue);
  segundo.registrar(transaction, resultado, FieldValue);
  assert.deepEqual(escrituras[0], escrituras[1]);
  assert.ok(!JSON.stringify(escrituras).includes('SECRETO'));
  assert.ok(!JSON.stringify(escrituras).includes('Privado'));
});

test('Recibos ausentes o malformados nunca se interpretan como pertenencia vigente', async () => {
  const referencia = { collection: () => ({ doc: () => referencia }) };
  const contexto = prepararIdempotenciaIngreso({
    db: { collection: () => ({ doc: () => referencia }) }, uid: 'actor',
    datos: { solicitudId: 'solicitud_prueba_01' }, tipo: 'vincular', parametros: {}, HttpsError,
  });
  for (const datos of [undefined, {}, { uid: 'otro' }]) {
    await assert.rejects(contexto.leer({ get: async () => ({ exists: true, data: () => datos }) },
      { exists: true, data: () => ({ iglesiaId: 'iglesia', pertenenciaId: 'a'.repeat(64) }) }),
    { code: 'invalid-argument' });
  }
});

const solicitudId = 'solicitud_consulta_01';
const reciboRuta = `operaciones_ingreso/actor/solicitudes/${solicitudId}`;
const perfilRuta = 'usuarios_globales/actor';
function escenarioConsulta(opciones = {}) {
  const documentos = new Map([
    [reciboRuta, {
      version: 1, uid: 'actor', tipo: 'vincular', huella: 'b'.repeat(64),
      iglesiaId: 'iglesia', pertenenciaId: 'a'.repeat(64),
      resultado: { ok: true, iglesiaId: 'iglesia' }, fechaCreacion: 'servidor',
    }],
    [perfilRuta, { iglesiaId: 'iglesia', pertenenciaId: 'a'.repeat(64), nombre: 'Privado' }],
  ]);
  for (const [ruta, datos] of Object.entries(opciones.documentos ?? {})) {
    if (datos === null) documentos.delete(ruta);
    else documentos.set(ruta, structuredClone(datos));
  }
  const inicial = structuredClone(documentos);
  const lecturas = [];
  let transacciones = 0;
  const referencia = (ruta) => ({ path: ruta,
    collection: (nombre) => ({ doc: (id) => referencia(`${ruta}/${nombre}/${id}`) }),
  });
  const db = {
    collection: (nombre) => ({ doc: (id) => referencia(`${nombre}/${id}`) }),
    async runTransaction(callback, opcionesTransaccion) {
      transacciones++;
      assert.equal(opcionesTransaccion.readOnly, true);
      // Un snapshot único para las lecturas de recibo y perfil.
      const snapshot = structuredClone(documentos);
      if (opciones.errorTransaccion) throw opciones.errorTransaccion;
      return callback({
        async get(ref) {
          lecturas.push(ref.path);
          if (opciones.errorLectura && (!opciones.errorPerfil || ref.path === perfilRuta)) {
            throw opciones.errorLectura;
          }
          return { exists: snapshot.has(ref.path), data: () => snapshot.get(ref.path) };
        },
        set() { assert.fail('La consulta no debe escribir'); },
        update() { assert.fail('La consulta no debe escribir'); },
        create() { assert.fail('La consulta no debe escribir'); },
        delete() { assert.fail('La consulta no debe escribir'); },
      });
    },
  };
  const request = { auth: { uid: 'actor' }, data: { solicitudId, tipo: 'vincular' } };
  return {
    documentos, inicial, lecturas, db, request, transacciones: () => transacciones,
    ejecutar: (solicitud = request) => consultarEstadoSolicitudIngreso(solicitud, { db, HttpsError }),
  };
}

for (const tipo of ['vincular', 'crear']) {
  test(`Consulta confirma ${tipo} vigente sin devolver identificadores ni datos privados`, async () => {
    const s = escenarioConsulta();
    s.documentos.get(reciboRuta).tipo = tipo;
    assert.deepEqual(await s.ejecutar({ ...s.request, data: { solicitudId, tipo } }), {
      estado: 'CONFIRMADA_VIGENTE',
    });
    assert.deepEqual(s.lecturas, [reciboRuta, perfilRuta]);
    assert.deepEqual([...s.documentos.keys()], [...s.inicial.keys()]);
  });
}

for (const [nombre, perfil] of [
  ['perfil ausente', null], ['salida', {}], ['iglesia eliminada', { pertenenciaId: 'a'.repeat(64) }],
  ['iglesia null', { iglesiaId: null }], ['iglesia vacía', { iglesiaId: '' }],
  ['otra iglesia', { iglesiaId: 'otra', pertenenciaId: 'a'.repeat(64) }],
  ['otro período en misma iglesia', { iglesiaId: 'iglesia', pertenenciaId: 'c'.repeat(64) }],
]) {
  test(`Consulta distingue pertenencia terminada por ${nombre}`, async () => {
    const s = escenarioConsulta({ documentos: { [perfilRuta]: perfil } });
    assert.deepEqual(await s.ejecutar(), { estado: 'CONFIRMADA_NO_VIGENTE' });
    assert.deepEqual(s.documentos, s.inicial);
  });
}

for (const perfil of [
  { iglesiaId: 'iglesia' }, { iglesiaId: 'iglesia', pertenenciaId: null },
  { iglesiaId: 'iglesia', pertenenciaId: 'legado' }, { iglesiaId: 42 },
]) {
  test(`Perfil legado o malformado devuelve NO_VERIFICABLE: ${JSON.stringify(perfil)}`, async () => {
    const s = escenarioConsulta({ documentos: { [perfilRuta]: perfil } });
    assert.deepEqual(await s.ejecutar(), { estado: 'NO_VERIFICABLE' });
    assert.deepEqual(s.documentos, s.inicial);
  });
}

test('Recibo ausente no afirma que no se ejecutó y no crea ninguna operación', async () => {
  const s = escenarioConsulta({ documentos: { [reciboRuta]: null } });
  assert.deepEqual(await s.ejecutar(), { estado: 'NO_VERIFICABLE' });
  assert.deepEqual(s.lecturas, [reciboRuta]);
  assert.deepEqual(s.documentos, s.inicial);
});

test('Exige Auth válido antes de realizar cualquier lectura', async () => {
  const s = escenarioConsulta();
  for (const auth of [null, undefined, {}, { uid: '' }, { uid: '  ' }, { uid: 'a/b' },
    { uid: '.' }, { uid: '__reservado__' }, { uid: 'a'.repeat(129) }, { uid: 42 }]) {
    await assert.rejects(s.ejecutar({ ...s.request, auth }), { code: 'unauthenticated' });
  }
  assert.equal(s.transacciones(), 0);
});

test('Parámetros y clave estrictos; no admite UID objetivo, rol ni campos extra', async () => {
  const s = escenarioConsulta();
  const valido = s.request.data;
  const invalidos = [null, undefined, [], 'solicitud', {}, { solicitudId }, { tipo: 'vincular' },
    ...['', null, 42, {}, 'activar', 'VINCULAR'].map((tipo) => ({ ...valido, tipo })),
    ...['', null, 42, [], 'a'.repeat(15), 'a'.repeat(129), 'a/b'.repeat(8),
      '__reservado______', `${'a'.repeat(16)}\n`].map((solicitudId) => ({ ...valido, solicitudId })),
    ...['uid', 'uidObjetivo', 'rolGlobal', 'pertenenciaId', 'huella'].map((clave) => ({ ...valido, [clave]: 'falso' })),
  ];
  for (const data of invalidos) {
    await assert.rejects(s.ejecutar({ ...s.request, data }), { code: 'invalid-argument' });
  }
  assert.equal(s.transacciones(), 0);
});

test('Acepta longitudes límite de clave sin consultar otras rutas', async () => {
  for (const longitud of [16, 128]) {
    const s = escenarioConsulta();
    assert.deepEqual(await s.ejecutar({ ...s.request, data: { tipo: 'crear', solicitudId: 'a'.repeat(longitud) } }),
      { estado: 'NO_VERIFICABLE' });
    assert.deepEqual(s.lecturas, [`operaciones_ingreso/actor/solicitudes/${'a'.repeat(longitud)}`]);
  }
});

test('Recibo de otro tipo es rechazado sin leer el perfil', async () => {
  const s = escenarioConsulta();
  await assert.rejects(s.ejecutar({ ...s.request, data: { solicitudId, tipo: 'crear' } }), { code: 'invalid-argument' });
  assert.deepEqual(s.lecturas, [reciboRuta]);
});

test('UID diferente solo consulta su propio espacio aunque conozca la clave ajena', async () => {
  const s = escenarioConsulta();
  assert.deepEqual(await s.ejecutar({ ...s.request, auth: { uid: 'otro' } }), { estado: 'NO_VERIFICABLE' });
  assert.deepEqual(s.lecturas, [`operaciones_ingreso/otro/solicitudes/${solicitudId}`]);
  assert.deepEqual(s.documentos, s.inicial);
});

test('UID incoherente dentro del recibo se rechaza sin filtrar su contenido', async () => {
  const s = escenarioConsulta();
  s.documentos.get(reciboRuta).uid = 'otro';
  await assert.rejects(s.ejecutar(), { code: 'permission-denied' });
  assert.deepEqual(s.lecturas, [reciboRuta]);
});

for (const cambios of [
  { version: 2 }, { pertenenciaId: 'legado' }, { iglesiaId: 'a/b' }, { huella: null },
  { resultado: { ok: true, iglesiaId: 'distinta' } }, { resultado: null },
]) {
  test(`Recibo incompleto o inconsistente no confirma: ${JSON.stringify(cambios)}`, async () => {
    const s = escenarioConsulta();
    Object.assign(s.documentos.get(reciboRuta), cambios);
    assert.deepEqual(await s.ejecutar(), { estado: 'NO_VERIFICABLE' });
    assert.deepEqual(s.lecturas, [reciboRuta]);
  });
}

for (const [codigo, esperado] of [[14, 'unavailable'], ['unavailable', 'unavailable'],
  [4, 'deadline-exceeded'], ['deadline-exceeded', 'deadline-exceeded'], [7, 'internal'], [undefined, 'internal']]) {
  test(`Error Firestore ${codigo} es ${esperado}, nunca ausencia`, async () => {
    for (const errorPerfil of [false, true]) {
      const s = escenarioConsulta({ errorLectura: Object.assign(new Error('detalle-privado'), { code: codigo }), errorPerfil });
      await assert.rejects(s.ejecutar(), (error) => {
        assert.equal(error.code, esperado);
        assert.ok(!error.message.includes('detalle-privado'));
        return true;
      });
      assert.deepEqual(s.documentos, s.inicial);
    }
  });
}

test('Error de transacción de solo lectura no se convierte en estado', async () => {
  const s = escenarioConsulta({ errorTransaccion: new Error('detalle-privado') });
  await assert.rejects(s.ejecutar(), { code: 'internal' });
});

test('Consultas repetidas no escriben ni cambian identidad, rol o recibo', async () => {
  const s = escenarioConsulta();
  for (let i = 0; i < 3; i++) assert.deepEqual(await s.ejecutar(), { estado: 'CONFIRMADA_VIGENTE' });
  assert.deepEqual(s.documentos, s.inicial);
});

test('index exporta consulta v2 con dependencias existentes y región vigente', async () => {
  const s = escenarioConsulta();
  let inicializaciones = 0;
  const imports = {
    'firebase-functions/v2/firestore': { onDocumentCreated: (...args) => args.at(-1), onDocumentUpdated: (...args) => args.at(-1) },
    'firebase-functions/v2': { setGlobalOptions(opciones) { assert.equal(opciones.region, 'southamerica-west1'); } },
    'firebase-functions/v2/https': { onCall: (handler) => handler, HttpsError },
    'firebase-admin/app': { initializeApp() { inicializaciones++; } },
    'firebase-admin/firestore': { getFirestore: () => s.db },
    'firebase-admin/messaging': { getMessaging: () => ({}) },
    './idempotencia_ingreso': { consultarEstadoSolicitudIngreso },
  };
  const sandbox = { exports: {}, require(nombre) { assert.ok(Object.hasOwn(imports, nombre), nombre); return imports[nombre]; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'), sandbox);
  assert.deepEqual(await sandbox.exports.consultarEstadoSolicitudIngreso(s.request), { estado: 'CONFIRMADA_VIGENTE' });
  assert.equal(inicializaciones, 1);
});
