const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { recuperarContextoSolicitudDesvinculacion: recuperar,
  consultarEstadoSolicitudDesvinculacion: consultar } = require('../membresia');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const solicitudId = 'a'.repeat(64);
const pertenenciaId = 'b'.repeat(64);
const ruta = `operaciones_desvinculacion/actor/solicitudes/${solicitudId}`;

function escenario() {
  const contexto = { solicitudId, iglesiaId: 'iglesia', uidObjetivo: 'objetivo',
    accion: 'expulsar', pertenenciaId };
  const documentos = new Map([[ruta, { version: 1, actorUid: 'actor',
    iglesiaId: 'iglesia', uidObjetivo: 'objetivo', accion: 'expulsar', pertenenciaId,
    resultado: { ok: true }, fechaCreacion: 'timestamp-servidor' }]]);
  const request = { auth: { uid: 'actor' }, data: { solicitudId } };
  const lecturas = [];
  let error;
  const referencia = (ruta) => ({ path: ruta, collection: (nombre) => coleccion(`${ruta}/${nombre}`) });
  const coleccion = (ruta) => ({ doc(id) {
    assert.equal(typeof id, 'string', 'No se permite generar IDs');
    return referencia(`${ruta}/${id}`);
  } });
  const db = { collection: coleccion, async runTransaction(callback, opciones) {
    assert.equal(opciones.readOnly, true);
    assert.deepEqual(Object.keys(opciones), ['readOnly']);
    return callback(new Proxy({}, { get(_, propiedad) {
      assert.equal(propiedad, 'get', 'No se permiten escrituras');
      return async (ref) => {
        lecturas.push(ref.path);
        if (error) throw error;
        return { exists: documentos.has(ref.path), data: () => structuredClone(documentos.get(ref.path)) };
      };
    } }));
  } };
  return { request, contexto, documentos, lecturas, deps: { db, HttpsError },
    ejecutar: () => recuperar(request, { db, HttpsError }),
    fallar(e) { error = e; } };
}

test('Actor original recupera únicamente contexto acreditado sin consultar perfiles', async () => {
  const s = escenario();
  const antes = structuredClone(s.documentos);
  assert.deepEqual(await s.ejecutar(), { estado: 'CONFIRMADA', contexto: s.contexto });
  assert.deepEqual(s.lecturas, [ruta]);
  assert.deepEqual(s.documentos, antes);
});

test('Salida propia recupera el período original', async () => {
  const s = escenario();
  Object.assign(s.documentos.get(ruta), { uidObjetivo: 'actor', accion: 'salir' });
  assert.deepEqual(await s.ejecutar(), { estado: 'CONFIRMADA',
    contexto: { ...s.contexto, uidObjetivo: 'actor', accion: 'salir' } });
});

test('Transferencia administrativa y nuevo ingreso no alteran contexto histórico', async () => {
  const s = escenario();
  s.documentos.set('usuarios_globales/actor', { iglesiaId: 'otra', rolGlobal: 'servidor' });
  s.documentos.set('iglesias/iglesia', { adminUid: 'nuevo-admin' });
  s.documentos.set('usuarios_globales/objetivo', { iglesiaId: 'otra',
    rolGlobal: 'servidor', pertenenciaId: 'c'.repeat(64) });
  const r = await s.ejecutar();
  assert.deepEqual(r, { estado: 'CONFIRMADA', contexto: s.contexto });
  assert.deepEqual(s.lecturas, [ruta]);
  assert.deepEqual(await consultar({ auth: s.request.auth, data: r.contexto }, s.deps),
    { estado: 'CONFIRMADA_NUEVA_PERTENENCIA' });
});

test('Otro actor no accede ni siquiera conociendo la clave; solo se lee su propio espacio', async () => {
  const s = escenario();
  s.request.auth.uid = 'ajeno';
  assert.deepEqual(await s.ejecutar(), { estado: 'RECIBO_AUSENTE' });
  assert.deepEqual(s.lecturas, [`operaciones_desvinculacion/ajeno/solicitudes/${solicitudId}`]);
  for (const campo of ['actorUid', 'uid', 'uidObjetivo']) {
    s.request.data = { solicitudId, [campo]: 'actor' };
    await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
  }
  assert.equal(s.lecturas.length, 1);
});

test('Recibo ausente no afirma fracaso y puede aparecer tras un timeout', async () => {
  const s = escenario();
  const recibo = s.documentos.get(ruta);
  s.documentos.delete(ruta);
  assert.deepEqual(await s.ejecutar(), { estado: 'RECIBO_AUSENTE' });
  s.documentos.set(ruta, recibo);
  assert.equal((await s.ejecutar()).estado, 'CONFIRMADA');
});

test('Sin Auth o UID malformado no hay lecturas', async () => {
  for (const auth of [undefined, null, {}, { uid: '' }, { uid: 'a/b' }, { uid: 'x'.repeat(129) }]) {
    const s = escenario();
    s.request.auth = auth;
    await assert.rejects(s.ejecutar(), { code: 'unauthenticated' });
    assert.deepEqual(s.lecturas, []);
  }
});

test('Entrada estricta y formato de solicitud idéntico al contrato existente', async () => {
  for (const data of [null, [], {}, 'id', { solicitudId: null },
    { solicitudId: 'a'.repeat(15) }, { solicitudId: 'a'.repeat(129) },
    { solicitudId: '../ruta/ajena' }, { solicitudId: '__reservado_largo__' },
    { solicitudId: ' '.repeat(16) }, { solicitudId, rolGlobal: 'admin_iglesia' }]) {
    const s = escenario();
    s.request.data = data;
    await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
    assert.deepEqual(s.lecturas, []);
  }
  for (const id of ['a'.repeat(16), 'a'.repeat(128), 'ABC_def-0123456789']) {
    const s = escenario();
    s.request.data = { solicitudId: id };
    assert.deepEqual(await s.ejecutar(), { estado: 'RECIBO_AUSENTE' });
  }
});

for (const [campo, valor] of [
  ['version', 2], ['actorUid', 'ajeno'], ['uidObjetivo', 'a/b'],
  ['uidObjetivo', 'x'.repeat(129)], ['iglesiaId', ''], ['iglesiaId', '../otra'],
  ['accion', 'crear'], ['accion', 'salir'], ['pertenenciaId', null],
  ['pertenenciaId', 'B'.repeat(64)], ['resultado', null],
  ['resultado', { ok: 'true' }], ['resultado', { ok: true, extra: 'privado' }],
]) {
  test(`Recibo no acreditado por ${campo} no devuelve contexto`, async () => {
    const s = escenario();
    s.documentos.get(ruta)[campo] = valor;
    assert.deepEqual(await s.ejecutar(), { estado: 'NO_VERIFICABLE' });
    assert.deepEqual(s.lecturas, [ruta]);
  });
}

test('Recibo presente sin datos tampoco se confunde con ausencia', async () => {
  const s = escenario();
  s.documentos.set(ruta, null);
  assert.deepEqual(await s.ejecutar(), { estado: 'NO_VERIFICABLE' });
});

for (const [code, esperado] of [[14, 'unavailable'], [4, 'deadline-exceeded'],
  [10, 'aborted'], ['firestore/unavailable', 'unavailable'], [undefined, 'internal']]) {
  test(`Lectura fallida ${code} no se convierte en ausencia`, async () => {
    const s = escenario();
    s.fallar(Object.assign(new Error('TOKEN_PRIVADO'), { code }));
    await assert.rejects(s.ejecutar(), (error) => {
      assert.equal(error.code, esperado);
      assert.equal(error.message.includes('PRIVADO'), false);
      return true;
    });
  });
}

test('Proyección explícita sin datos adicionales, logs, FCM, generación ni escrituras', async () => {
  const s = escenario();
  Object.assign(s.documentos.get(ruta), { nombre: 'NOMBRE_PRIVADO', correo: 'CORREO_PRIVADO',
    token: 'TOKEN_PRIVADO', finanzas: { saldo: 99 }, huella: 'HUELLA_PRIVADA' });
  const antes = structuredClone(s.documentos);
  const modulo = { exports: {} };
  const contexto = vm.createContext({ module: modulo, Buffer, Map, Object,
    console: new Proxy({}, { get() { assert.fail('No debe registrar datos'); } }),
    require(nombre) {
      if (nombre === './pertenencia') return { pertenenciaIdValido: require('../pertenencia').pertenenciaIdValido };
      assert.equal(nombre, './finanzas');
      return { prepararRevocacionFinancieraPorDesvinculacion() { assert.fail('No debe tocar finanzas'); } };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../membresia.js'), 'utf8'), contexto);
  const respuesta = await modulo.exports.recuperarContextoSolicitudDesvinculacion(s.request, s.deps);
  assert.deepEqual(JSON.parse(JSON.stringify(respuesta)), { estado: 'CONFIRMADA', contexto: s.contexto });
  assert.equal(JSON.stringify(respuesta).includes('PRIVADO'), false);
  assert.deepEqual(s.documentos, antes);
  assert.deepEqual(s.lecturas, [ruta]);
});
