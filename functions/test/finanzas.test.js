const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  actualizarEncargadoFinanciero,
  actualizarEstadoModuloFinanzas,
  prepararRevocacionFinancieraPorDesvinculacion,
} = require('../finanzas');

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const iglesiaRuta = 'iglesias/iglesia';
const accesoRuta = `${iglesiaRuta}/finanzas_config/acceso`;
const adminRuta = 'usuarios_globales/admin';
const candidatoRuta = 'usuarios_globales/candidato';
const elegibilidadRuta = (uid) => `${iglesiaRuta}/finanzas_elegibilidad/${uid}`;
const fecha = 'fecha-del-servidor';

function escenario(opciones = {}) {
  const documentos = new Map([
    [iglesiaRuta, { adminUid: 'admin' }],
    [adminRuta, { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia' }],
    [candidatoRuta, { iglesiaId: 'iglesia', rolGlobal: 'servidor' }],
  ]);
  for (const [ruta, datos] of Object.entries(opciones.documentos ?? {})) {
    if (datos === null) documentos.delete(ruta);
    else documentos.set(ruta, structuredClone(datos));
  }
  const inicial = structuredClone(documentos);
  const lecturas = [];
  let intentos = 0;
  let escrituras = 0;
  let ids = 0;
  const referencia = (ruta) => ({
    path: ruta,
    collection: (nombre) => coleccion(`${ruta}/${nombre}`),
  });
  const coleccion = (ruta) => ({
    doc: (id = `evento-${++ids}`) => referencia(`${ruta}/${id}`),
  });
  const db = {
    collection: coleccion,
    async runTransaction(callback) {
      // Doble con escrituras pendientes y reintento por cambios en documentos leídos.
      for (let intento = 0; intento < 3; intento++) {
        intentos++;
        const leidos = new Map();
        const pendientes = [];
        const resultado = await callback({
          async get(ref) {
            assert.equal(pendientes.length, 0, 'Todas las lecturas preceden a las escrituras');
            lecturas.push(ref.path);
            const datos = structuredClone(documentos.get(ref.path));
            leidos.set(ref.path, datos);
            return { exists: datos !== undefined, data: () => structuredClone(datos) };
          },
          set(ref, datos, opcionesSet) {
            escrituras++;
            if (opciones.fallaElegibilidad && ref.path.includes('/finanzas_elegibilidad/')) {
              throw new Error('detalle-interno-elegibilidad');
            }
            pendientes.push({ ruta: ref.path, datos, merge: opcionesSet?.merge });
          },
          create(ref, datos) {
            escrituras++;
            if (opciones.fallaAuditoria) throw new Error('detalle-interno-auditoria');
            assert.equal(documentos.has(ref.path), false);
            pendientes.push({ ruta: ref.path, datos });
          },
        });
        if (intento === 0) opciones.antesConfirmar?.(documentos);
        const conflicto = [...leidos].some(([ruta, datos]) =>
          !require('node:util').isDeepStrictEqual(datos, documentos.get(ruta)));
        if (conflicto) continue;
        if (opciones.fallaCommit) throw new Error('detalle-interno-commit');
        for (const { ruta, datos, merge } of pendientes) {
          documentos.set(ruta, structuredClone({
            ...(merge ? documentos.get(ruta) : {}),
            ...datos,
          }));
        }
        return resultado;
      }
      throw new Error('Conflicto persistente');
    },
  };
  const dependencias = {
    db,
    HttpsError,
    FieldValue: { serverTimestamp: () => fecha },
  };
  const solicitud = (datos = {}) => ({
    auth: { uid: 'admin' },
    data: { iglesiaId: 'iglesia', accion: 'designar', encargadoUid: 'candidato', ...datos },
  });
  return {
    documentos, inicial, lecturas, dependencias, solicitud,
    intentos: () => intentos,
    escrituras: () => escrituras,
    ejecutar: (request = solicitud()) => actualizarEncargadoFinanciero(request, dependencias),
    ejecutarEstado: (request = { auth: { uid: 'admin' }, data: { iglesiaId: 'iglesia', habilitado: true } }) =>
      actualizarEstadoModuloFinanzas(request, dependencias),
    auditoria: () => [...documentos].filter(([ruta]) =>
      ruta.startsWith(`${iglesiaRuta}/finanzas_auditoria/`)),
  };
}

async function rechazar(s, request, codigo) {
  await assert.rejects(s.ejecutar(request), (error) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, codigo);
    assert.ok(!error.message.includes('detalle-interno'));
    return true;
  });
  assert.deepEqual(s.documentos, s.inicial);
}

test('Titular designa, inicializa deshabilitado y registra auditoría atómica', async () => {
  const s = escenario();
  assert.deepEqual(await s.ejecutar(), { ok: true, encargadoUid: 'candidato' });
  assert.deepEqual(s.documentos.get(accesoRuta), {
    encargadoUid: 'candidato', moduloHabilitado: false,
    actualizadoPorUid: 'admin', fechaActualizacion: fecha, fechaCreacion: fecha,
  });
  assert.deepEqual(s.auditoria().map(([, datos]) => datos), [{
    tipo: 'designacion_encargado', accion: 'designar', actorUid: 'admin',
    encargadoAnteriorUid: null, encargadoUid: 'candidato', fecha,
  }]);
  assert.deepEqual(s.documentos.get(adminRuta), s.inicial.get(adminRuta));
  assert.deepEqual(s.documentos.get(candidatoRuta), s.inicial.get(candidatoRuta));
  for (const ruta of [iglesiaRuta, adminRuta, candidatoRuta, accesoRuta]) {
    assert.ok(s.lecturas.includes(ruta));
  }
});

test('Revoca sin borrar configuración ni exigir que exista el encargado anterior', async () => {
  const s = escenario({ documentos: { [accesoRuta]: {
    encargadoUid: 'miembro-eliminado', moduloHabilitado: false,
    fechaCreacion: 'fecha-original', otroCampo: 'conservar',
  } } });
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
  assert.equal(s.documentos.get(accesoRuta).otroCampo, 'conservar');
  assert.equal(s.documentos.get(accesoRuta).fechaCreacion, 'fecha-original');
  assert.equal(s.auditoria()[0][1].encargadoAnteriorUid, 'miembro-eliminado');
  assert.equal(s.auditoria()[0][1].accion, 'revocar');
  assert.equal(s.auditoria()[0][1].encargadoUid, null);
  assert.ok(!s.lecturas.includes(candidatoRuta));
});

test('Revocar sin configuración previa crea un documento deshabilitado', async () => {
  const s = escenario();
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, false);
  assert.equal(s.auditoria().length, 1);
});

for (const accion of ['designar', 'revocar']) {
  for (const habilitado of [true, false, null, 'true', 1, undefined]) {
    test(`${accion} preserva booleanos y normaliza habilitación ${habilitado}`, async () => {
      const configuracion = { encargadoUid: 'anterior', fechaCreacion: 'original' };
      if (habilitado !== undefined) configuracion.moduloHabilitado = habilitado;
      const s = escenario({ documentos: { [accesoRuta]: configuracion } });
      await s.ejecutar(s.solicitud({ accion, encargadoUid: accion === 'revocar' ? null : 'candidato' }));
      assert.equal(s.documentos.get(accesoRuta).moduloHabilitado,
        typeof habilitado === 'boolean' ? habilitado : false);
      assert.equal(s.documentos.get(accesoRuta).fechaCreacion, 'original');
      assert.equal(s.auditoria()[0][1].encargadoAnteriorUid, 'anterior');
    });
  }
}

for (const rolGlobal of ['servidor', 'lider_area', '', null]) {
  test(`Rol ${rolGlobal} no designa aunque su UID sea el titular`, async () => {
    const s = escenario({ documentos: { [adminRuta]: { iglesiaId: 'iglesia', rolGlobal } } });
    await rechazar(s, s.solicitud(), 'permission-denied');
  });
}

for (const [nombre, documentos] of [
  ['administrador anterior', { [iglesiaRuta]: { adminUid: 'nuevo-admin' } }],
  ['administrador externo', { [adminRuta]: { iglesiaId: 'otra', rolGlobal: 'admin_iglesia' } }],
  ['perfil inexistente', { [adminRuta]: null }],
  ['iglesia inexistente', { [iglesiaRuta]: null }],
]) {
  test(`${nombre} no puede designar ni revocar`, async () => {
    for (const accion of ['designar', 'revocar']) {
      const s = escenario({ documentos });
      await rechazar(s, s.solicitud({ accion, encargadoUid: accion === 'revocar' ? null : 'candidato' }), 'permission-denied');
    }
  });
}

for (const [nombre, datos] of [
  ['externo', { iglesiaId: 'otra' }], ['inexistente', null],
  ['sin iglesia', {}], ['iglesia con espacios', { iglesiaId: 'iglesia ' }],
]) {
  test(`Candidato ${nombre} es rechazado sin escrituras`, async () => {
    const s = escenario({ documentos: { [candidatoRuta]: datos } });
    await rechazar(s, s.solicitud(), 'failed-precondition');
  });
}

for (const auth of [undefined, null, {}, { uid: '' }]) {
  test(`Sin autenticación válida (${JSON.stringify(auth)})`, async () => {
    const s = escenario();
    await rechazar(s, { ...s.solicitud(), auth }, 'unauthenticated');
    assert.equal(s.intentos(), 0);
  });
}

test('Rechaza datos incompletos, acciones inválidas y parámetros adicionales', async () => {
  const s = escenario();
  const validos = s.solicitud().data;
  const invalidos = [null, undefined, [], 'designar', {},
    { ...validos, accion: 'activar' },
    { ...validos, accion: 'revocar' },
    { ...validos, accion: 'revocar', encargadoUid: '' },
    { ...validos, adminUid: 'admin' },
    { ...validos, rolGlobal: 'admin_iglesia' },
    { ...validos, uid: 'admin' },
    { ...validos, moduloHabilitado: true },
  ];
  for (const clave of Object.keys(validos)) {
    const incompleto = { ...validos };
    delete incompleto[clave];
    invalidos.push(incompleto);
  }
  for (const data of invalidos) {
    await rechazar(s, { ...s.solicitud(), data }, 'invalid-argument');
  }
  assert.equal(s.intentos(), 0);
});

test('Rechaza UIDs y documentos vacíos, reservados o malformados', async () => {
  const s = escenario();
  for (const encargadoUid of [null, '', '   ', '/', 'a/b', '.', '..', '__reservado__', 12, 'a'.repeat(129)]) {
    await rechazar(s, s.solicitud({ encargadoUid }), 'invalid-argument');
  }
  for (const iglesiaId of [null, '', '  ', '.', '..', '__reservado__', 'a/b', 12, 'a'.repeat(1501), 'é'.repeat(751)]) {
    await rechazar(s, s.solicitud({ iglesiaId }), 'invalid-argument');
  }
  assert.equal(s.intentos(), 0);
});

test('Acepta UID válido de 128 caracteres y conserva identidad exacta', async () => {
  const encargadoUid = 'á'.repeat(128);
  const s = escenario({ documentos: { [`usuarios_globales/${encargadoUid}`]: { iglesiaId: 'iglesia' } } });
  await s.ejecutar(s.solicitud({ encargadoUid }));
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, encargadoUid);
});

for (const falla of ['fallaAuditoria', 'fallaCommit']) {
  test(`${falla}: error sanitizado sin configuración o auditoría parcial`, async () => {
    const s = escenario({ [falla]: true });
    await rechazar(s, s.solicitud(), 'internal');
  });
}

for (const [nombre, ruta, datos, codigo] of [
  ['transferencia administrativa', iglesiaRuta, { adminUid: 'nuevo-admin' }, 'permission-denied'],
  ['cambio de rol', adminRuta, { iglesiaId: 'iglesia', rolGlobal: 'lider_area' }, 'permission-denied'],
  ['salida del candidato', candidatoRuta, { iglesiaId: 'otra' }, 'failed-precondition'],
]) {
  test(`Reintento por ${nombre} vuelve a validar y deniega`, async () => {
    const s = escenario({ antesConfirmar(documentos) { documentos.set(ruta, datos); } });
    await assert.rejects(s.ejecutar(), { code: codigo });
    assert.equal(s.intentos(), 2);
    assert.equal(s.documentos.has(accesoRuta), false);
    assert.equal(s.auditoria().length, 0);
    const esperado = structuredClone(s.inicial);
    esperado.set(ruta, datos);
    assert.deepEqual(s.documentos, esperado);
  });
}

test('Cambio concurrente de habilitación se preserva con una sola auditoría', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.set(accesoRuta, { moduloHabilitado: true, encargadoUid: 'anterior' });
  } });
  await s.ejecutar();
  assert.equal(s.intentos(), 2);
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.equal(s.auditoria().length, 1);
  assert.equal(s.auditoria()[0][1].encargadoAnteriorUid, 'anterior');
});

test('index exporta callable v2, reutiliza dependencias y conserva funciones existentes', async () => {
  const s = escenario();
  let inicializaciones = 0;
  let opcionesGlobales;
  const imports = {
    'firebase-functions/v2/firestore': { onDocumentCreated: (...args) => args.at(-1), onDocumentUpdated: (...args) => args.at(-1) },
    'firebase-functions/v2': { setGlobalOptions(opciones) { opcionesGlobales = opciones; } },
    'firebase-functions/v2/https': { onCall: (handler) => handler, HttpsError },
    'firebase-admin/app': { initializeApp() { inicializaciones++; } },
    'firebase-admin/firestore': { getFirestore: () => s.dependencias.db, FieldValue: s.dependencias.FieldValue },
    'firebase-admin/messaging': { getMessaging: () => ({}) },
    './finanzas': { actualizarEncargadoFinanciero, actualizarEstadoModuloFinanzas },
  };
  const sandbox = { exports: {}, require(nombre) {
    assert.ok(Object.hasOwn(imports, nombre), `Import inesperado: ${nombre}`);
    return imports[nombre];
  } };
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  vm.runInNewContext(codigo, sandbox);
  assert.equal(inicializaciones, 1);
  assert.equal(opcionesGlobales.region, 'southamerica-west1');
  for (const [, nombre] of codigo.matchAll(/exports\.(\w+)\s*=/g)) {
    assert.equal(typeof sandbox.exports[nombre], 'function', nombre);
  }
  const resultado = await sandbox.exports.actualizarEncargadoFinanciero(s.solicitud());
  assert.equal(resultado.ok, true);
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, 'candidato');
  const estado = await sandbox.exports.actualizarEstadoModuloFinanzas({
    auth: { uid: 'admin' }, data: { iglesiaId: 'iglesia', habilitado: true },
  });
  assert.equal(estado.cambiado, true);
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.equal(inicializaciones, 1);
});

function solicitudEstado(habilitado = true) {
  return { auth: { uid: 'admin' }, data: { iglesiaId: 'iglesia', habilitado } };
}

async function rechazarEstado(s, request, codigo) {
  await assert.rejects(s.ejecutarEstado(request), (error) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, codigo);
    assert.ok(!error.message.includes('detalle-interno'));
    return true;
  });
  assert.deepEqual(s.documentos, s.inicial);
}

for (const habilitado of [true, false]) {
  test(`Titular cambia estado a ${habilitado}, conserva configuración y audita`, async () => {
    const anterior = {
      encargadoUid: 'candidato', moduloHabilitado: !habilitado,
      fechaCreacion: 'original', preferencias: { moneda: 'CLP' },
    };
    const s = escenario({ documentos: { [accesoRuta]: anterior } });
    assert.deepEqual(await s.ejecutarEstado(solicitudEstado(habilitado)), {
      ok: true, moduloHabilitado: habilitado, cambiado: true,
    });
    assert.deepEqual(s.documentos.get(accesoRuta), {
      ...anterior, moduloHabilitado: habilitado,
      actualizadoPorUid: 'admin', fechaActualizacion: fecha,
    });
    assert.deepEqual(s.auditoria().map(([, datos]) => datos), [{
      tipo: 'estado_modulo_finanzas', accion: habilitado ? 'activar' : 'desactivar',
      actorUid: 'admin', estadoAnterior: !habilitado, estadoNuevo: habilitado, fecha,
    }]);
    for (const ruta of [iglesiaRuta, adminRuta, accesoRuta]) assert.ok(s.lecturas.includes(ruta));
    assert.deepEqual(s.documentos.get(adminRuta), s.inicial.get(adminRuta));
    assert.deepEqual(s.documentos.get(iglesiaRuta), s.inicial.get(iglesiaRuta));
  });

  test(`Configuración inexistente se crea con estado ${habilitado} y encargado null`, async () => {
    const s = escenario();
    const resultado = await s.ejecutarEstado(solicitudEstado(habilitado));
    assert.equal(resultado.cambiado, true);
    assert.deepEqual(s.documentos.get(accesoRuta), {
      encargadoUid: null, moduloHabilitado: habilitado, fechaCreacion: fecha,
      actualizadoPorUid: 'admin', fechaActualizacion: fecha,
    });
    assert.equal(s.auditoria()[0][1].estadoAnterior, null);
    assert.equal(s.auditoria()[0][1].estadoNuevo, habilitado);
  });

  test(`Estado ${habilitado} repetido no escribe metadatos ni auditoría`, async () => {
    const s = escenario({ documentos: {
      [accesoRuta]: {
        encargadoUid: 'candidato', moduloHabilitado: habilitado,
        actualizadoPorUid: 'original', fechaActualizacion: 'original',
      },
      [elegibilidadRuta('candidato')]: { habilitado, esEncargado: true, version: 1 },
    } });
    assert.deepEqual(await s.ejecutarEstado(solicitudEstado(habilitado)), {
      ok: true, moduloHabilitado: habilitado, cambiado: false,
    });
    assert.deepEqual(s.documentos, s.inicial);
    assert.equal(s.escrituras(), 0);
    assert.equal(s.auditoria().length, 0);
  });
}

test('Activación repetida conserva un único evento de cambio', async () => {
  const s = escenario();
  await s.ejecutarEstado();
  const confirmado = structuredClone(s.documentos);
  const escrituras = s.escrituras();
  assert.equal((await s.ejecutarEstado()).cambiado, false);
  assert.equal(s.escrituras(), escrituras);
  assert.equal(s.auditoria().length, 1);
  assert.deepEqual(s.documentos, confirmado);
});

for (const anterior of [undefined, null, 'true', 1]) {
  test(`Estado previo ${JSON.stringify(anterior)} no se confunde con booleano`, async () => {
    const configuracion = { encargadoUid: null };
    if (anterior !== undefined) configuracion.moduloHabilitado = anterior;
    const s = escenario({ documentos: { [accesoRuta]: configuracion } });
    assert.equal((await s.ejecutarEstado(solicitudEstado(false))).cambiado, true);
    assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, false);
    assert.equal(s.auditoria()[0][1].estadoAnterior, null);
  });
}

test('Estado solo acepta booleanos estrictos y exactamente dos parámetros', async () => {
  const s = escenario();
  const valido = solicitudEstado().data;
  const invalidos = [null, undefined, [], 'true', {},
    { iglesiaId: 'iglesia' }, { habilitado: true },
    ...[null, undefined, 0, 1, 'true', 'false', [], {}, new Boolean(true)]
      .map((habilitado) => ({ ...valido, habilitado })),
    ...['uid', 'adminUid', 'rolGlobal', 'encargadoUid', 'moduloHabilitado']
      .map((clave) => ({ ...valido, [clave]: 'falsificado' })),
    ...[null, '', '   ', '/', 'a/b', '.', '..', '__reservado__', 42, 'a'.repeat(1501), 'é'.repeat(751)]
      .map((iglesiaId) => ({ ...valido, iglesiaId })),
  ];
  for (const data of invalidos) {
    await rechazarEstado(s, { ...solicitudEstado(), data }, 'invalid-argument');
  }
  assert.equal(s.intentos(), 0);
});

test('Estado exige autenticación del contexto y no acepta UID administrativo del cliente', async () => {
  const s = escenario();
  for (const auth of [undefined, null, {}, { uid: '' }, { uid: '   ' }, { uid: 'a/b' }]) {
    await rechazarEstado(s, { ...solicitudEstado(), auth }, 'unauthenticated');
  }
  assert.equal(s.intentos(), 0);
});

for (const [nombre, documentos] of [
  ['líder', { [adminRuta]: { iglesiaId: 'iglesia', rolGlobal: 'lider_area' } }],
  ['servidor', { [adminRuta]: { iglesiaId: 'iglesia', rolGlobal: 'servidor' } }],
  ['administrador anterior', { [iglesiaRuta]: { adminUid: 'otro' } }],
  ['usuario externo', { [adminRuta]: { iglesiaId: 'otra', rolGlobal: 'admin_iglesia' } }],
  ['iglesia no coincidente exactamente', { [adminRuta]: { iglesiaId: 'iglesia ', rolGlobal: 'admin_iglesia' } }],
  ['perfil inexistente', { [adminRuta]: null }],
  ['iglesia inexistente', { [iglesiaRuta]: null }],
]) {
  test(`${nombre} no cambia estado ni aprovecha solicitudes repetidas`, async () => {
    for (const habilitado of [true, false]) {
      const s = escenario({ documentos: { ...documentos,
        [accesoRuta]: { encargadoUid: 'admin', moduloHabilitado: true },
      } });
      await rechazarEstado(s, solicitudEstado(habilitado), 'permission-denied');
      assert.equal(s.escrituras(), 0);
    }
  });
}

test('Encargado designado no puede habilitar el módulo', async () => {
  const s = escenario({ documentos: { [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: false } } });
  await rechazarEstado(s, { ...solicitudEstado(), auth: { uid: 'candidato' } }, 'permission-denied');
});

for (const falla of ['fallaAuditoria', 'fallaCommit']) {
  test(`Cambio de estado con ${falla} no deja escrituras parciales`, async () => {
    const s = escenario({ [falla]: true, documentos: {
      [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: false },
    } });
    await rechazarEstado(s, solicitudEstado(), 'internal');
  });
}

for (const [nombre, ruta, datos] of [
  ['transferencia', iglesiaRuta, { adminUid: 'otro' }],
  ['cambio de rol', adminRuta, { iglesiaId: 'iglesia', rolGlobal: 'lider_area' }],
  ['salida del administrador', adminRuta, { iglesiaId: 'otra', rolGlobal: 'admin_iglesia' }],
]) {
  test(`Cambio de estado revalida permisos tras ${nombre} concurrente`, async () => {
    const s = escenario({ antesConfirmar(documentos) { documentos.set(ruta, datos); } });
    await assert.rejects(s.ejecutarEstado(), { code: 'permission-denied' });
    assert.equal(s.intentos(), 2);
    const esperado = structuredClone(s.inicial);
    esperado.set(ruta, datos);
    assert.deepEqual(s.documentos, esperado);
  });
}

test('Activación concurrente evita segunda auditoría al reintentar', async () => {
  const concurrente = { encargadoUid: 'candidato', moduloHabilitado: true };
  const s = escenario({ antesConfirmar(documentos) { documentos.set(accesoRuta, concurrente); } });
  assert.equal((await s.ejecutarEstado()).cambiado, false);
  assert.equal(s.intentos(), 2);
  assert.deepEqual(s.documentos.get(accesoRuta), concurrente);
  assert.equal(s.auditoria().length, 0);
});

test('Cambio concurrente de encargado se conserva al activar', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.set(accesoRuta, { encargadoUid: 'nuevo', moduloHabilitado: false, fechaCreacion: 'original' });
  } });
  await s.ejecutarEstado();
  assert.equal(s.intentos(), 2);
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, 'nuevo');
  assert.equal(s.documentos.get(accesoRuta).fechaCreacion, 'original');
  assert.equal(s.auditoria().length, 1);
  assert.equal(s.auditoria()[0][1].estadoAnterior, false);
});

test('Designación y revocación siguen preservando el estado del módulo', async () => {
  const s = escenario();
  await s.ejecutar();
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, false);
  await s.ejecutarEstado();
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, 'candidato');
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
  await s.ejecutarEstado(solicitudEstado(false));
  assert.deepEqual(s.auditoria().map(([, datos]) => datos.tipo), [
    'designacion_encargado', 'estado_modulo_finanzas',
    'designacion_encargado', 'estado_modulo_finanzas',
  ]);
});

test('Designar, activar, desactivar y revocar sincronizan señal mínima y versión', async () => {
  const s = escenario();
  await s.ejecutar();
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: true, version: 1,
  });
  await s.ejecutarEstado();
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: true, esEncargado: true, version: 2,
  });
  await s.ejecutarEstado(solicitudEstado(false));
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: true, version: 3,
  });
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: false, version: 4,
  });
});

test('Reemplazar encargado invalida al anterior en la misma transacción', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'anterior', moduloHabilitado: true },
    [elegibilidadRuta('anterior')]: { habilitado: true, esEncargado: true, version: 7 },
  } });
  await s.ejecutar();
  assert.deepEqual(s.documentos.get(elegibilidadRuta('anterior')), {
    habilitado: false, esEncargado: false, version: 8,
  });
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: true, esEncargado: true, version: 1,
  });
  assert.equal(s.auditoria().length, 1);
});

test('Designación y revocación repetidas no escriben ni auditan otra vez', async () => {
  const s = escenario();
  await s.ejecutar();
  let confirmado = structuredClone(s.documentos);
  let escrituras = s.escrituras();
  await s.ejecutar();
  assert.deepEqual(s.documentos, confirmado);
  assert.equal(s.escrituras(), escrituras);
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  confirmado = structuredClone(s.documentos);
  escrituras = s.escrituras();
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.deepEqual(s.documentos, confirmado);
  assert.equal(s.escrituras(), escrituras);
  assert.equal(s.auditoria().length, 2);
});

for (const operacion of ['designacion', 'estado']) {
  test(`${operacion} repetida repara señal ausente sin reescribir configuración ni auditar`, async () => {
    const previo = { encargadoUid: 'candidato', moduloHabilitado: true, fechaActualizacion: 'original' };
    const s = escenario({ documentos: { [accesoRuta]: previo } });
    if (operacion === 'designacion') await s.ejecutar();
    else assert.equal((await s.ejecutarEstado()).cambiado, false);
    assert.deepEqual(s.documentos.get(accesoRuta), previo);
    assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
      habilitado: true, esEncargado: true, version: 1,
    });
    assert.equal(s.escrituras(), 1);
    assert.equal(s.auditoria().length, 0);
  });
}

for (const operacion of ['designacion', 'estado']) {
  for (const falla of ['fallaElegibilidad', 'fallaAuditoria', 'fallaCommit']) {
    test(`${operacion} con ${falla} revierte también elegibilidad`, async () => {
      const s = escenario({ [falla]: true, documentos: {
        [accesoRuta]: { encargadoUid: 'anterior', moduloHabilitado: false },
        'usuarios_globales/anterior': { iglesiaId: 'iglesia', rolGlobal: 'servidor' },
        [elegibilidadRuta('anterior')]: { habilitado: false, esEncargado: true, version: 1 },
      } });
      if (operacion === 'designacion') await rechazar(s, s.solicitud(), 'internal');
      else await rechazarEstado(s, solicitudEstado(), 'internal');
    });
  }
}

test('Administrador también encargado usa una señal única y conserva administración al revocar', async () => {
  const s = escenario();
  await s.ejecutar(s.solicitud({ encargadoUid: 'admin' }));
  await s.ejecutarEstado();
  assert.deepEqual(s.documentos.get(elegibilidadRuta('admin')), {
    habilitado: true, esEncargado: true, version: 2,
  });
  await s.ejecutar(s.solicitud({ accion: 'revocar', encargadoUid: null }));
  assert.deepEqual(s.documentos.get(elegibilidadRuta('admin')), {
    habilitado: false, esEncargado: false, version: 3,
  });
  await s.ejecutarEstado(solicitudEstado(false));
  assert.equal(s.documentos.get(adminRuta).rolGlobal, 'admin_iglesia');
  assert.equal(s.documentos.get(iglesiaRuta).adminUid, 'admin');
});

for (const perfilEncargado of [null, { iglesiaId: 'otra' }, {}]) {
  test(`Cambio de estado no concede señal a perfil inválido ${JSON.stringify(perfilEncargado)}`, async () => {
    const s = escenario({ documentos: {
      [candidatoRuta]: perfilEncargado,
      [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: false },
      [elegibilidadRuta('candidato')]: { habilitado: true, esEncargado: true, version: 1 },
    } });
    await s.ejecutarEstado();
    assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
      habilitado: false, esEncargado: false, version: 2,
    });
  });
}

test('Conflicto de versión reintenta sin perder actualización de señal ni duplicar auditoría', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.set(elegibilidadRuta('candidato'), { habilitado: true, esEncargado: false, version: 9 });
  } });
  await s.ejecutar();
  assert.equal(s.intentos(), 2);
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: true, version: 10,
  });
  assert.equal(s.auditoria().length, 1);
});

test('Cambio concurrente de encargado invalida al anterior real después del reintento', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.set(accesoRuta, { encargadoUid: 'intermedio', moduloHabilitado: true });
    documentos.set(elegibilidadRuta('intermedio'), { habilitado: true, esEncargado: true, version: 2 });
  } });
  await s.ejecutar();
  assert.equal(s.intentos(), 2);
  assert.deepEqual(s.documentos.get(elegibilidadRuta('intermedio')), {
    habilitado: false, esEncargado: false, version: 3,
  });
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: true, esEncargado: true, version: 1,
  });
  assert.equal(s.auditoria().length, 1);
});

test('Señal malformada se reemplaza por el documento mínimo', async () => {
  const s = escenario({ documentos: {
    [elegibilidadRuta('candidato')]: { habilitado: 'true', esEncargado: true, version: -1, extra: 'descartar' },
  } });
  await s.ejecutar();
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: true, version: 1,
  });
});

// Simula al futuro llamador; el helper no abre ni confirma transacciones.
function revocarPorDesvinculacion(s, opciones = {}) {
  return s.dependencias.db.runTransaction(async (transaction) => {
    const plan = await prepararRevocacionFinancieraPorDesvinculacion({
      ...s.dependencias, transaction, iglesiaId: 'iglesia',
      uidObjetivo: 'candidato', actorUid: 'admin', ...opciones,
    });
    // Aún se pueden leer los documentos de membresía tras preparar el plan.
    await transaction.get(s.dependencias.db.collection('usuarios_globales').doc('candidato'));
    return plan.aplicar();
  });
}

for (const moduloHabilitado of [true, false]) {
  test(`Helper revoca atómicamente conservando módulo ${moduloHabilitado} y otros campos`, async () => {
    const anterior = {
      encargadoUid: 'candidato', moduloHabilitado, fechaCreacion: 'original',
      preferencias: { moneda: 'CLP' }, otroCampo: ['conservar'],
    };
    const s = escenario({ documentos: {
      [accesoRuta]: anterior,
      [elegibilidadRuta('candidato')]: { habilitado: moduloHabilitado, esEncargado: true, version: 7 },
    } });
    assert.equal(await revocarPorDesvinculacion(s), true);
    assert.equal(s.intentos(), 1);
    assert.deepEqual(s.documentos.get(accesoRuta), {
      ...anterior, encargadoUid: null, actualizadoPorUid: 'admin', fechaActualizacion: fecha,
    });
    assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
      habilitado: false, esEncargado: false, version: 8,
    });
    assert.deepEqual(s.auditoria().map(([, datos]) => datos), [{
      tipo: 'designacion_encargado', accion: 'revocar', motivo: 'desvinculacion',
      actorUid: 'admin', encargadoAnteriorUid: 'candidato', encargadoUid: null, fecha,
    }]);
    assert.deepEqual(s.documentos.get(candidatoRuta), s.inicial.get(candidatoRuta));
  });
}

for (const configuracion of [null, {}, { encargadoUid: null },
  { encargadoUid: 'otro', moduloHabilitado: true }]) {
  test(`Helper no modifica nada sin designación del objetivo: ${JSON.stringify(configuracion)}`, async () => {
    const s = escenario({ documentos: {
      [accesoRuta]: configuracion,
      [elegibilidadRuta('otro')]: { habilitado: true, esEncargado: true, version: 3 },
    } });
    assert.equal(await revocarPorDesvinculacion(s), false);
    assert.deepEqual(s.documentos, s.inicial);
    assert.equal(s.escrituras(), 0);
    assert.equal(s.auditoria().length, 0);
    assert.ok(!s.lecturas.some((ruta) => ruta.includes('/finanzas_elegibilidad/')));
  });
}

for (const [nombre, elegibilidad, version] of [
  ['ausente', null, 1],
  ['ya invalidada', { habilitado: false, esEncargado: false, version: 4 }, 4],
  ['malformada', { habilitado: 'true', esEncargado: true, version: -1, extra: 'quitar' }, 1],
]) {
  test(`Helper revoca con elegibilidad ${nombre}`, async () => {
    const s = escenario({ documentos: {
      [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: false },
      [elegibilidadRuta('candidato')]: elegibilidad,
    } });
    await revocarPorDesvinculacion(s);
    assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
      habilitado: false, esEncargado: false, version,
    });
    assert.equal(s.auditoria().length, 1);
    assert.equal(s.escrituras(), nombre === 'ya invalidada' ? 2 : 3);
  });
}

test('Helper repetido no escribe ni duplica auditoría', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
  } });
  await revocarPorDesvinculacion(s);
  const confirmado = structuredClone(s.documentos);
  const escrituras = s.escrituras();
  assert.equal(await revocarPorDesvinculacion(s), false);
  assert.deepEqual(s.documentos, confirmado);
  assert.equal(s.escrituras(), escrituras);
  assert.equal(s.auditoria().length, 1);
});

test('Preparación solo lee; aplicación no lee y solo se ejecuta una vez por plan', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
  } });
  await s.dependencias.db.runTransaction(async (transaction) => {
    const plan = await prepararRevocacionFinancieraPorDesvinculacion({
      ...s.dependencias, transaction, iglesiaId: 'iglesia', uidObjetivo: 'candidato', actorUid: 'admin',
    });
    assert.equal(plan.revocada, true);
    assert.equal(s.escrituras(), 0);
    await transaction.get(s.dependencias.db.collection('iglesias').doc('iglesia'));
    const lecturas = s.lecturas.length;
    assert.equal(plan.aplicar(), true);
    assert.equal(plan.aplicar(), false);
    assert.equal(s.lecturas.length, lecturas);
  });
  assert.equal(s.auditoria().length, 1);
});

for (const falla of ['fallaElegibilidad', 'fallaAuditoria', 'fallaCommit']) {
  test(`Helper con ${falla} no deja cambios parciales`, async () => {
    const s = escenario({ [falla]: true, documentos: {
      [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
      [elegibilidadRuta('candidato')]: { habilitado: true, esEncargado: true, version: 2 },
    } });
    await assert.rejects(revocarPorDesvinculacion(s), /detalle-interno/);
    assert.deepEqual(s.documentos, s.inicial);
  });
}

test('Error del llamador después de aplicar también aborta todas las escrituras', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
  } });
  await assert.rejects(s.dependencias.db.runTransaction(async (transaction) => {
    const plan = await prepararRevocacionFinancieraPorDesvinculacion({
      ...s.dependencias, transaction, iglesiaId: 'iglesia', uidObjetivo: 'candidato', actorUid: 'admin',
    });
    plan.aplicar();
    transaction.set(s.dependencias.db.collection('usuarios_globales').doc('candidato'),
      { cambioSimuladoDeMembresia: true }, { merge: true });
    throw new Error('fallo-del-llamador');
  }), /fallo-del-llamador/);
  assert.deepEqual(s.documentos, s.inicial);
});

test('Reemplazo concurrente conserva al nuevo encargado sin auditar revocación obsoleta', async () => {
  const nuevoAcceso = { encargadoUid: 'otro', moduloHabilitado: true, preferencias: 'nuevas' };
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
  }, antesConfirmar(documentos) { documentos.set(accesoRuta, nuevoAcceso); } });
  assert.equal(await revocarPorDesvinculacion(s), false);
  assert.equal(s.intentos(), 2);
  const esperado = structuredClone(s.inicial);
  esperado.set(accesoRuta, nuevoAcceso);
  assert.deepEqual(s.documentos, esperado);
  assert.equal(s.auditoria().length, 0);
});

test('Conflicto revalida versión de elegibilidad y preserva otros cambios de configuración', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: false },
  }, antesConfirmar(documentos) {
    documentos.set(accesoRuta, { encargadoUid: 'candidato', moduloHabilitado: true, extra: 'concurrente' });
    documentos.set(elegibilidadRuta('candidato'), { habilitado: true, esEncargado: true, version: 10 });
  } });
  await revocarPorDesvinculacion(s);
  assert.equal(s.intentos(), 2);
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.equal(s.documentos.get(accesoRuta).extra, 'concurrente');
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: false, esEncargado: false, version: 11,
  });
  assert.equal(s.auditoria().length, 1);
});

test('Helper rechaza identificadores inválidos antes de leer o escribir', async () => {
  for (const opciones of [{ iglesiaId: 'a/b' }, { uidObjetivo: '' }, { actorUid: 'a'.repeat(129) }]) {
    const s = escenario();
    await assert.rejects(revocarPorDesvinculacion(s, opciones), TypeError);
    assert.equal(s.lecturas.length, 0);
    assert.equal(s.escrituras(), 0);
  }
});

test('Versión agotada aborta la revocación sin escrituras', async () => {
  const s = escenario({ documentos: {
    [accesoRuta]: { encargadoUid: 'candidato', moduloHabilitado: true },
    [elegibilidadRuta('candidato')]: { habilitado: true, esEncargado: true, version: Number.MAX_SAFE_INTEGER },
  } });
  await assert.rejects(revocarPorDesvinculacion(s), /Versión de elegibilidad agotada/);
  assert.deepEqual(s.documentos, s.inicial);
  assert.equal(s.escrituras(), 0);
});

test('Designación y activación actuales siguen funcionando después del helper', async () => {
  const s = escenario();
  await s.ejecutar();
  await s.ejecutarEstado();
  await revocarPorDesvinculacion(s);
  await s.ejecutarEstado(solicitudEstado(false));
  await s.ejecutar();
  await s.ejecutarEstado();
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, 'candidato');
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.deepEqual(s.documentos.get(elegibilidadRuta('candidato')), {
    habilitado: true, esEncargado: true, version: 5,
  });
});
