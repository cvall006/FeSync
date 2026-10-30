const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { consultarEstadoSolicitudDesvinculacion: consultar } = require('../membresia');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const periodo = 'a'.repeat(64);
const posterior = 'b'.repeat(64);
const rutaRecibo = 'operaciones_desvinculacion/actor/solicitudes/solicitud-00000001';
const rutaPerfil = 'usuarios_globales/objetivo';

function escenario() {
  const request = { auth: { uid: 'actor' }, data: { iglesiaId: 'iglesia-original',
    uidObjetivo: 'objetivo', accion: 'expulsar', pertenenciaId: periodo,
    solicitudId: 'solicitud-00000001' } };
  const documentos = new Map([
    [rutaRecibo, { version: 1, actorUid: 'actor', uidObjetivo: 'objetivo',
      iglesiaId: 'iglesia-original', accion: 'expulsar', pertenenciaId: periodo,
      resultado: { ok: true }, fechaCreacion: 'timestamp-servidor' }],
    [rutaPerfil, { pertenenciaId: periodo, nombre: 'NOMBRE_PRIVADO', correo: 'CORREO_PRIVADO' }],
  ]);
  const lecturas = [];
  let falla;
  let rutaFalla;
  const ref = (ruta) => ({ path: ruta, collection: (nombre) => coleccion(`${ruta}/${nombre}`) });
  const coleccion = (ruta) => ({ doc(id) {
    assert.equal(typeof id, 'string', 'No se permiten IDs generados');
    return ref(`${ruta}/${id}`);
  } });
  const db = { collection: coleccion, async runTransaction(callback, opciones) {
    assert.equal(opciones.readOnly, true);
    assert.equal(Object.keys(opciones).length, 1);
    const tx = new Proxy({}, { get(_, propiedad) {
      assert.equal(propiedad, 'get', 'La consulta no dispone de escrituras ni commits');
      return async (referencia) => {
        lecturas.push(referencia.path);
        if (falla && (!rutaFalla || rutaFalla === referencia.path)) throw falla;
        return { exists: documentos.has(referencia.path),
          data: () => structuredClone(documentos.get(referencia.path)) };
      };
    } });
    return callback(tx);
  } };
  return { request, documentos, lecturas, db, deps: { db, HttpsError },
    ejecutar: () => consultar(request, { db, HttpsError }),
    fallar(error, ruta) { falla = error; rutaFalla = ruta; } };
}

async function comprobar(s, estado) {
  const antes = structuredClone(s.documentos);
  assert.deepEqual(await s.ejecutar(), { estado });
  assert.deepEqual(s.documentos, antes);
}

test('Expulsión confirmada por actor original verifica historia y período terminado', async () => {
  const s = escenario();
  await comprobar(s, 'CONFIRMADA_PERTENENCIA_TERMINADA');
  assert.deepEqual(s.lecturas, [rutaRecibo, rutaPerfil]);
});

test('Salida propia usa la ruta de Auth y el perfil del mismo UID', async () => {
  const s = escenario();
  s.request.data.accion = 'salir';
  s.request.data.uidObjetivo = 'actor';
  Object.assign(s.documentos.get(rutaRecibo), { accion: 'salir', uidObjetivo: 'actor' });
  s.documentos.set('usuarios_globales/actor', s.documentos.get(rutaPerfil));
  await comprobar(s, 'CONFIRMADA_PERTENENCIA_TERMINADA');
  assert.deepEqual(s.lecturas, [rutaRecibo, 'usuarios_globales/actor']);
});

test('Transferencia o salida posterior del actor no le impide consultar su propio recibo', async () => {
  for (const perfil of [null, { rolGlobal: 'lider_area', iglesiaId: 'otra' }]) {
    const s = escenario();
    s.documentos.set('iglesias/iglesia-original', { adminUid: 'otro' });
    if (perfil) s.documentos.set('usuarios_globales/actor', perfil);
    await comprobar(s, 'CONFIRMADA_PERTENENCIA_TERMINADA');
    assert.deepEqual(s.lecturas, [rutaRecibo, rutaPerfil]);
  }
});

for (const iglesiaId of ['iglesia-original', 'otra-iglesia']) {
  test(`Otro período en ${iglesiaId} no convierte la expulsión confirmada en fallida`, async () => {
    const s = escenario();
    s.documentos.set(rutaPerfil, { iglesiaId, rolGlobal: 'servidor', pertenenciaId: posterior });
    await comprobar(s, 'CONFIRMADA_NUEVA_PERTENENCIA');
  });
}

test('Período posterior que también terminó sigue evidenciando un ingreso posterior', async () => {
  const s = escenario();
  s.documentos.set(rutaPerfil, { pertenenciaId: posterior });
  await comprobar(s, 'CONFIRMADA_NUEVA_PERTENENCIA');
});

for (const [nombre, perfil] of [
  ['ausente', null], ['legado', {}], ['ID inválido', { pertenenciaId: 'incorrecto' }],
  ['iglesia sin rol', { pertenenciaId: periodo, iglesiaId: 'iglesia-original' }],
  ['rol sin iglesia', { pertenenciaId: periodo, rolGlobal: 'servidor' }],
  ['período original restaurado', { pertenenciaId: periodo, iglesiaId: 'iglesia-original', rolGlobal: 'servidor' }],
  ['iglesia diferente sin renovar ID', { pertenenciaId: periodo, iglesiaId: 'otra', rolGlobal: 'servidor' }],
  ['otro ID y contexto inválido', { pertenenciaId: posterior, iglesiaId: null }],
]) {
  test(`Perfil ${nombre}: conserva confirmación histórica, sin afirmar estado actual`, async () => {
    const s = escenario();
    if (perfil === null) s.documentos.delete(rutaPerfil);
    else s.documentos.set(rutaPerfil, perfil);
    await comprobar(s, 'CONFIRMADA_ESTADO_ACTUAL_NO_VERIFICABLE');
  });
}

test('Ausencia de recibo no prueba fracaso aunque el perfil parezca desvinculado', async () => {
  const s = escenario();
  s.documentos.delete(rutaRecibo);
  await comprobar(s, 'NO_VERIFICABLE');
  assert.deepEqual(s.lecturas, [rutaRecibo]);
});

for (const [campo, valor] of [
  ['uidObjetivo', 'otro'], ['iglesiaId', 'otra'], ['accion', 'salir'],
  ['pertenenciaId', posterior], ['solicitudId', 'solicitud-00000002'],
]) {
  test(`Contexto incorrecto ${campo} no revela el recibo ni consulta perfiles`, async () => {
    const s = escenario();
    s.request.data[campo] = valor;
    if (campo === 'accion') {
      await assert.rejects(s.ejecutar(), { code: 'permission-denied' });
      assert.deepEqual(s.lecturas, []);
    } else {
      await comprobar(s, 'NO_VERIFICABLE');
      assert.equal(s.lecturas.length, 1);
    }
  });
}

for (const [campo, valor] of [
  ['version', 2], ['actorUid', 'otro'], ['uidObjetivo', 'otro'],
  ['resultado', { ok: 'true' }], ['resultado', null], ['resultado', { ok: true, extra: 1 }],
]) {
  test(`Recibo no acreditable (${campo}) devuelve NO_VERIFICABLE sin consultar perfil`, async () => {
    const s = escenario();
    s.documentos.get(rutaRecibo)[campo] = valor;
    await comprobar(s, 'NO_VERIFICABLE');
    assert.deepEqual(s.lecturas, [rutaRecibo]);
  });
}

test('Otro actor solo consulta su propio espacio; no puede enumerar ni acceder al recibo ajeno', async () => {
  const s = escenario();
  s.request.auth.uid = 'otro-actor';
  await comprobar(s, 'NO_VERIFICABLE');
  assert.deepEqual(s.lecturas, ['operaciones_desvinculacion/otro-actor/solicitudes/solicitud-00000001']);
  s.request.data.actorUid = 'actor';
  await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
});

test('Sin Auth o con UID inválido se rechaza antes de leer', async () => {
  for (const auth of [undefined, null, {}, { uid: '' }, { uid: 'a/b' }, { uid: 'x'.repeat(129) }]) {
    const s = escenario();
    s.request.auth = auth;
    await assert.rejects(s.ejecutar(), { code: 'unauthenticated' });
    assert.deepEqual(s.lecturas, []);
  }
});

test('Contrato exige cinco claves exactas y formatos iguales al callable de escritura', async () => {
  const variaciones = [
    { solicitudId: '' }, { solicitudId: 'x'.repeat(15) }, { solicitudId: 'x'.repeat(129) },
    { solicitudId: '../operacion-ajena' }, { solicitudId: '__reservado_largo__' },
    { uidObjetivo: '' }, { uidObjetivo: 'x'.repeat(129) }, { iglesiaId: 'a/b' },
    { iglesiaId: '' }, { accion: 'crear' }, { pertenenciaId: 'A'.repeat(64) },
    { pertenenciaId: null }, { rolGlobal: 'admin_iglesia' },
  ];
  for (const cambio of variaciones) {
    const s = escenario();
    Object.assign(s.request.data, cambio);
    await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
    assert.deepEqual(s.lecturas, []);
  }
  for (const clave of Object.keys(escenario().request.data)) {
    const s = escenario();
    delete s.request.data[clave];
    await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
  }
  for (const data of [null, [], 'datos']) {
    const s = escenario();
    s.request.data = data;
    await assert.rejects(s.ejecutar(), { code: 'invalid-argument' });
  }
});

for (const [codigo, esperado] of [[14, 'unavailable'], [4, 'deadline-exceeded'],
  [10, 'aborted'], ['firestore/unavailable', 'unavailable'], [undefined, 'internal']]) {
  test(`Fallo de lectura ${codigo} se propaga sanitizado, nunca como ausencia`, async () => {
    const s = escenario();
    s.fallar(Object.assign(new Error('TOKEN_PRIVADO'), { code: codigo }));
    await assert.rejects(s.ejecutar(), (error) => {
      assert.equal(error.code, esperado);
      assert.equal(error.message.includes('PRIVADO'), false);
      return true;
    });
  });
}

test('Error al leer el perfil tras acreditar el recibo sigue siendo error, no estado desconocido', async () => {
  const s = escenario();
  s.fallar(Object.assign(new Error('DETALLE_PRIVADO'), { code: 14 }), rutaPerfil);
  await assert.rejects(s.ejecutar(), { code: 'unavailable' });
  assert.deepEqual(s.lecturas, [rutaRecibo, rutaPerfil]);
});

test('No tiene escrituras, generador, FCM ni logs; respuesta solo contiene una etiqueta', async () => {
  const s = escenario();
  const modulo = { exports: {} };
  const dependencias = [];
  const contexto = vm.createContext({ module: modulo, Buffer, Map, Object,
    console: new Proxy({}, { get() { assert.fail('No debe registrar datos'); } }),
    require(nombre) {
      dependencias.push(nombre);
      if (nombre === './pertenencia') return { pertenenciaIdValido: require('../pertenencia').pertenenciaIdValido };
      assert.equal(nombre, './finanzas');
      return { prepararRevocacionFinancieraPorDesvinculacion() { assert.fail('No debe tocar finanzas'); } };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../membresia.js'), 'utf8'), contexto);
  const respuesta = await modulo.exports.consultarEstadoSolicitudDesvinculacion(s.request, s.deps);
  assert.deepEqual(Object.keys(respuesta), ['estado']);
  assert.equal(respuesta.estado, 'CONFIRMADA_PERTENENCIA_TERMINADA');
  assert.deepEqual(dependencias, ['./pertenencia', './finanzas']);
  for (const privado of ['actor', 'objetivo', 'iglesia-original', periodo, 'NOMBRE_PRIVADO', 'CORREO_PRIVADO']) {
    assert.equal(JSON.stringify(respuesta).includes(privado), false);
  }
});
