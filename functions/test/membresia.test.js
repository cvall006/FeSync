const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { desvincularMiembroIglesia, consultarEstadoSolicitudDesvinculacion,
  recuperarContextoSolicitudDesvinculacion } = require('../membresia');
const { actualizarEncargadoFinanciero } = require('../finanzas');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const periodo = 'a'.repeat(64);
const nuevoPeriodo = 'b'.repeat(64);
const iglesiaRuta = 'iglesias/iglesia';
const perfilRuta = 'usuarios_globales/miembro';
const accesoRuta = `${iglesiaRuta}/finanzas_config/acceso`;
const senalRuta = `${iglesiaRuta}/finanzas_elegibilidad/miembro`;
const reciboRuta = (actor = 'miembro') => `operaciones_desvinculacion/${actor}/solicitudes/solicitud-00000001`;

function escenario(opciones = {}) {
  const documentos = new Map([
    [iglesiaRuta, { adminUid: 'admin' }],
    ['usuarios_globales/admin', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'c'.repeat(64) }],
    [perfilRuta, { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: periodo,
      fcmToken: 'token-sintetico-original', fcmTokenActualizado: 'fecha-sintetica-original',
      nombre: 'PERSONA_PRIVADA', descripcion: 'Servicio', preferencias: { tema: 'oscuro' } }],
  ]);
  if (opciones.encargado) {
    documentos.set(accesoRuta, { encargadoUid: 'miembro', moduloHabilitado: opciones.habilitado ?? false, auxiliar: 'conservar' });
    documentos.set(senalRuta, { habilitado: opciones.habilitado ?? false, esEncargado: true, version: 3 });
  }
  const inicial = structuredClone(documentos);
  const lecturas = [];
  const commits = [];
  let ids = 0;
  let intentos = 0;
  let hookUsado = false;
  const ref = (ruta) => ({ path: ruta, collection: (nombre) => coleccion(`${ruta}/${nombre}`) });
  const coleccion = (ruta) => ({ doc: (id = `evento-${++ids}`) => ref(`${ruta}/${id}`) });
  const db = {
    collection: coleccion,
    async runTransaction(callback) {
      for (let intento = 0; intento < 5; intento += 1) {
        intentos += 1;
        const leidos = new Map();
        const pendientes = [];
        function preparar(tipo, referencia, datos, configuracion) {
          if (opciones.falla === tipo ||
              (opciones.falla === 'auditoria' && referencia.path.includes('/finanzas_auditoria/')) ||
              (opciones.falla === 'senal' && referencia.path.includes('/finanzas_elegibilidad/')) ||
              (opciones.falla === 'recibo' && referencia.path.startsWith('operaciones_desvinculacion/'))) {
            throw new Error('ERROR_PRIVADO');
          }
          pendientes.push({ tipo, ruta: referencia.path, datos: structuredClone(datos), merge: configuracion?.merge });
        }
        const resultado = await callback({
          async get(referencia) {
            assert.equal(pendientes.length, 0, 'Todas las lecturas antes de cualquier escritura');
            if (opciones.falla === 'lectura') throw Object.assign(new Error('ERROR_PRIVADO'), { code: opciones.codigo });
            lecturas.push(referencia.path);
            const datos = structuredClone(documentos.get(referencia.path));
            leidos.set(referencia.path, datos);
            return { exists: documentos.has(referencia.path), data: () => structuredClone(datos) };
          },
          set: (r, d, c) => preparar('set', r, d, c),
          update: (r, d) => preparar('update', r, d),
          create: (r, d) => preparar('create', r, d),
        });
        if (!hookUsado && opciones.antesConfirmar) {
          hookUsado = true;
          await opciones.antesConfirmar(documentos, dependencias);
        }
        if ([...leidos].some(([ruta, datos]) => !isDeepStrictEqual(datos, documentos.get(ruta)))) continue;
        if (opciones.falla === 'commit') throw new Error('ERROR_PRIVADO');
        // Validar todas las precondiciones antes de aplicar el lote pendiente.
        for (const { tipo, ruta } of pendientes) {
          if (tipo === 'create') assert.equal(documentos.has(ruta), false);
          if (tipo === 'update') assert.equal(documentos.has(ruta), true);
        }
        for (const { tipo, ruta, datos, merge } of pendientes) {
          const nuevo = tipo === 'update' || merge ? { ...documentos.get(ruta) } : {};
          for (const [campo, valor] of Object.entries(datos)) {
            if (valor === '__borrar_prueba__') delete nuevo[campo];
            else nuevo[campo] = valor;
          }
          documentos.set(ruta, nuevo);
        }
        if (pendientes.length) commits.push(pendientes);
        return resultado;
      }
      throw Object.assign(new Error('ERROR_PRIVADO'), { code: 10 });
    },
  };
  const dependencias = { db, HttpsError, FieldValue: {
    delete: () => '__borrar_prueba__', serverTimestamp: () => 'timestamp-servidor',
  }, despuesDeDesvincular: opciones.despuesDeDesvincular };
  const solicitud = (datos = {}, actor = 'miembro') => ({ auth: actor === null ? undefined : { uid: actor },
    data: { iglesiaId: 'iglesia', uidObjetivo: 'miembro', accion: 'salir',
      pertenenciaId: periodo, solicitudId: 'solicitud-00000001', ...datos } });
  return { documentos, inicial, dependencias, lecturas, commits, solicitud,
    ejecutar: (request = solicitud()) => desvincularMiembroIglesia(request, dependencias),
    auditorias: () => [...documentos].filter(([ruta]) => ruta.includes('/finanzas_auditoria/')),
    intentos: () => intentos };
}

async function rechazar(s, request, code) {
  const antes = structuredClone(s.documentos);
  await assert.rejects(s.ejecutar(request), (error) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    assert.equal(error.message.includes('PRIVADO'), false);
    return true;
  });
  assert.deepEqual(s.documentos, antes);
}

for (const accion of ['salir', 'expulsar']) {
  for (const encargado of [false, true]) {
    for (const habilitado of [false, true]) {
      test(`${accion}, encargado=${encargado}, módulo=${habilitado}: pertenencia y finanzas atómicas`, async () => {
        const s = escenario({ encargado, habilitado });
        if (!encargado) s.documentos.set(accesoRuta, {
          encargadoUid: null, moduloHabilitado: habilitado, auxiliar: 'conservar',
        });
        const actor = accion === 'salir' ? 'miembro' : 'admin';
        const anterior = structuredClone(s.documentos.get(perfilRuta));
        assert.deepEqual(await s.ejecutar(s.solicitud({ accion }, actor)), { ok: true });
        const esperado = { ...anterior };
        delete esperado.iglesiaId;
        delete esperado.rolGlobal;
        delete esperado.fcmToken;
        delete esperado.fcmTokenActualizado;
        if (accion === 'expulsar') delete esperado.descripcion;
        assert.deepEqual(s.documentos.get(perfilRuta), esperado);
        assert.equal(s.commits.length, 1);
        assert.equal(s.documentos.get(reciboRuta(actor)).pertenenciaId, periodo);
        if (encargado) {
          assert.deepEqual(s.documentos.get(senalRuta), { habilitado: false, esEncargado: false, version: 4 });
          assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
          assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, habilitado);
          assert.equal(s.documentos.get(accesoRuta).auxiliar, 'conservar');
          assert.equal(s.auditorias().length, 1);
          assert.equal(s.auditorias()[0][1].actorUid, actor);
        } else {
          assert.deepEqual(s.documentos.get(accesoRuta), {
            encargadoUid: null, moduloHabilitado: habilitado, auxiliar: 'conservar',
          });
          assert.equal(s.documentos.has(senalRuta), false);
          assert.equal(s.auditorias().length, 0);
        }
      });
    }
  }
}

for (const accion of ['salir', 'expulsar']) {
  test(`${accion}: retira ambos campos legados en la única actualización transaccional del objetivo`, async () => {
    const s = escenario({ encargado: true, habilitado: true });
    const dispositivoRuta = `${perfilRuta}/dispositivos/dispositivo-sintetico`;
    const dispositivo = { token: 'token-sintetico-original', activo: true, actualizado: 'fecha-sintetica' };
    s.documentos.set(dispositivoRuta, dispositivo);
    const admin = structuredClone(s.documentos.get('usuarios_globales/admin'));
    const anterior = structuredClone(s.documentos.get(perfilRuta));
    const actor = accion === 'salir' ? 'miembro' : 'admin';
    assert.deepEqual(await s.ejecutar(s.solicitud({ accion }, actor)), { ok: true });
    const perfil = s.documentos.get(perfilRuta);
    assert.equal(Object.hasOwn(perfil, 'fcmToken'), false);
    assert.equal(Object.hasOwn(perfil, 'fcmTokenActualizado'), false);
    assert.equal(perfil.pertenenciaId, anterior.pertenenciaId);
    assert.equal(perfil.nombre, anterior.nombre);
    assert.deepEqual(perfil.preferencias, anterior.preferencias);
    assert.deepEqual(s.documentos.get(dispositivoRuta), dispositivo);
    assert.deepEqual(s.documentos.get('usuarios_globales/admin'), admin);
    assert.equal(s.commits.length, 1);
    const actualizaciones = s.commits[0].filter((e) => e.ruta === perfilRuta);
    assert.equal(actualizaciones.length, 1);
    assert.equal(actualizaciones[0].tipo, 'update');
    assert.equal(actualizaciones[0].datos.fcmToken, '__borrar_prueba__');
    assert.equal(actualizaciones[0].datos.fcmTokenActualizado, '__borrar_prueba__');
    assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
    assert.deepEqual(s.documentos.get(senalRuta), { habilitado: false, esEncargado: false, version: 4 });
    assert.equal(s.auditorias().length, 1);
    assert.equal(s.documentos.has(reciboRuta(actor)), true);
    assert.ok(s.commits[0].every((e) => !e.ruta.includes('/dispositivos/')));
  });

  test(`${accion}: renovación concurrente descarta el intento obsoleto y relee antes de limpiar`, async () => {
    const s = escenario({ encargado: true, antesConfirmar(documentos) {
      Object.assign(documentos.get(perfilRuta), { fcmToken: 'token-sintetico-renovado',
        fcmTokenActualizado: 'fecha-sintetica-renovada', auxiliarConcurrente: 'conservar' });
    } });
    await s.ejecutar(s.solicitud({ accion }, accion === 'salir' ? 'miembro' : 'admin'));
    assert.equal(s.intentos(), 2);
    assert.equal(s.commits.length, 1);
    assert.equal(s.lecturas.filter((ruta) => ruta === perfilRuta).length, 2);
    const perfil = s.documentos.get(perfilRuta);
    assert.equal(Object.hasOwn(perfil, 'fcmToken'), false);
    assert.equal(Object.hasOwn(perfil, 'fcmTokenActualizado'), false);
    assert.equal(perfil.auxiliarConcurrente, 'conservar');
    assert.equal(s.auditorias().length, 1);
  });
}

for (const [nombre, campos] of [
  ['ausentes', {}], ['nulos', { fcmToken: null, fcmTokenActualizado: null }],
  ['solo token', { fcmToken: 'token-sintetico' }],
  ['solo fecha', { fcmTokenActualizado: 'fecha-sintetica' }],
]) {
  test(`Campos FCM ${nombre}: la salida elimina las claves sin alterar auxiliares`, async () => {
    const s = escenario();
    const perfil = s.documentos.get(perfilRuta);
    delete perfil.fcmToken;
    delete perfil.fcmTokenActualizado;
    Object.assign(perfil, campos);
    await s.ejecutar();
    assert.equal(Object.hasOwn(s.documentos.get(perfilRuta), 'fcmToken'), false);
    assert.equal(Object.hasOwn(s.documentos.get(perfilRuta), 'fcmTokenActualizado'), false);
    assert.deepEqual(s.documentos.get(perfilRuta).preferencias, { tema: 'oscuro' });
    assert.equal(s.commits.length, 1);
  });
}

test('Replay confirmado no vuelve a limpiar campos legados añadidos posteriormente', async () => {
  const s = escenario();
  await s.ejecutar();
  Object.assign(s.documentos.get(perfilRuta), { fcmToken: 'token-sintetico-posterior',
    fcmTokenActualizado: 'fecha-sintetica-posterior' });
  const antes = structuredClone(s.documentos);
  await s.ejecutar();
  assert.deepEqual(s.documentos, antes);
  assert.equal(s.commits.length, 1);
});

test('Líder puede salir; su rol no concede capacidad de expulsar', async () => {
  const s = escenario();
  s.documentos.get(perfilRuta).rolGlobal = 'lider_area';
  await rechazar(s, s.solicitud({ accion: 'expulsar' }), 'permission-denied');
  assert.deepEqual(await s.ejecutar(), { ok: true });
});

test('Miembro no designado no altera la configuración ni la señal de otro encargado', async () => {
  const s = escenario();
  s.documentos.set(accesoRuta, { encargadoUid: 'otro', moduloHabilitado: true });
  const datos = { habilitado: true, esEncargado: true, version: 8 };
  s.documentos.set(`${iglesiaRuta}/finanzas_elegibilidad/otro`, datos);
  await s.ejecutar();
  assert.deepEqual(s.documentos.get(accesoRuta), { encargadoUid: 'otro', moduloHabilitado: true });
  assert.deepEqual(s.documentos.get(`${iglesiaRuta}/finanzas_elegibilidad/otro`), datos);
  assert.equal(s.documentos.has(senalRuta), false);
});

test('Encargado sin señal recibe invalidación; una señal ya invalidada no aumenta versión', async () => {
  for (const senal of [null, { habilitado: false, esEncargado: false, version: 7 }]) {
    const s = escenario({ encargado: true });
    if (senal === null) s.documentos.delete(senalRuta);
    else s.documentos.set(senalRuta, senal);
    await s.ejecutar();
    assert.deepEqual(s.documentos.get(senalRuta), {
      habilitado: false, esEncargado: false, version: senal === null ? 1 : 7,
    });
  }
});

test('Titular no sale ni puede ser expulsado, aunque su rol esté incorrecto', async () => {
  for (const rol of ['admin_iglesia', 'servidor']) {
    for (const accion of ['salir', 'expulsar']) {
      const s = escenario();
      s.documentos.get('usuarios_globales/admin').rolGlobal = rol;
      await rechazar(s, s.solicitud({ uidObjetivo: 'admin', accion, pertenenciaId: 'c'.repeat(64) }, 'admin'),
        accion === 'expulsar' && rol !== 'admin_iglesia' ? 'permission-denied' : 'failed-precondition');
    }
  }
});

test('Líder, servidor y administrador anterior no expulsan', async () => {
  for (const rol of ['lider_area', 'servidor', 'admin_iglesia']) {
    const s = escenario();
    s.documentos.get(perfilRuta).rolGlobal = rol;
    await rechazar(s, s.solicitud({ accion: 'expulsar' }), 'permission-denied');
  }
});

test('Salir exige identidad propia y autenticación válida', async () => {
  const s = escenario();
  await rechazar(s, s.solicitud({}, null), 'unauthenticated');
  await rechazar(s, s.solicitud({}, ''), 'unauthenticated');
  await rechazar(s, s.solicitud({}, 'admin'), 'permission-denied');
});

test('Actor externo, sin perfil y objetivo externo o inexistente son rechazados', async () => {
  for (const situacion of ['actor externo', 'actor ausente', 'objetivo externo', 'objetivo ausente', 'iglesia ausente']) {
    const s = escenario();
    if (situacion === 'actor externo') s.documentos.get('usuarios_globales/admin').iglesiaId = 'otra';
    if (situacion === 'actor ausente') s.documentos.delete('usuarios_globales/admin');
    if (situacion === 'objetivo externo') s.documentos.get(perfilRuta).iglesiaId = 'otra';
    if (situacion === 'objetivo ausente') s.documentos.delete(perfilRuta);
    if (situacion === 'iglesia ausente') s.documentos.delete(iglesiaRuta);
    await rechazar(s, s.solicitud({ accion: 'expulsar' }, 'admin'),
      situacion.endsWith('ausente') && !situacion.startsWith('actor') ? 'not-found' : 'permission-denied');
  }
});

test('Período diferente, perfil legado y valores inválidos se rechazan sin fallback', async () => {
  for (const id of [undefined, null, '', 1, nuevoPeriodo]) {
    const s = escenario({ encargado: true });
    if (id === undefined) delete s.documentos.get(perfilRuta).pertenenciaId;
    else s.documentos.get(perfilRuta).pertenenciaId = id;
    await rechazar(s, s.solicitud(), 'failed-precondition');
  }
});

test('Contrato exacto: rechaza datos incompletos, roles/actor del cliente y formatos inválidos', async () => {
  const s = escenario();
  const casos = [null, [], {}, ...[
    { actorUid: 'admin' }, { rolGlobal: 'admin_iglesia' }, { accion: 'borrar' },
    { uidObjetivo: '' }, { uidObjetivo: 'a/b' }, { uidObjetivo: 'x'.repeat(129) },
    { iglesiaId: '' }, { iglesiaId: '../otra' }, { pertenenciaId: 'A'.repeat(64) },
    { pertenenciaId: null }, { solicitudId: '' }, { solicitudId: 'corta' },
    { solicitudId: 'x'.repeat(129) }, { solicitudId: 'a/b'.repeat(10) }, { solicitudId: '__reservado_largo__' },
  ].map((datos) => s.solicitud(datos).data)];
  for (const data of casos) await rechazar(s, { auth: { uid: 'miembro' }, data }, 'invalid-argument');
  for (const clave of Object.keys(s.solicitud().data)) {
    const request = s.solicitud();
    delete request.data[clave];
    await rechazar(s, request, 'invalid-argument');
  }
  assert.equal(s.lecturas.length, 0);
});

test('Reintentos confirmados no escriben perfil, señal, recibo ni auditoría nuevamente', async () => {
  for (const accion of ['salir', 'expulsar']) {
    const s = escenario({ encargado: true });
    const request = s.solicitud({ accion }, accion === 'salir' ? 'miembro' : 'admin');
    const resultado = await s.ejecutar(request);
    const antes = structuredClone(s.documentos);
    const recuperada = await recuperarContextoSolicitudDesvinculacion({ auth: request.auth,
      data: { solicitudId: request.data.solicitudId } }, s.dependencias);
    assert.deepEqual(recuperada, { estado: 'CONFIRMADA', contexto: request.data });
    assert.deepEqual(await s.ejecutar(request), resultado);
    assert.deepEqual(s.documentos, antes);
    assert.equal(s.commits.length, 1);
    assert.equal(s.auditorias().length, 1);
  }
});

test('Reutilizar clave con cualquier parámetro diferente se rechaza', async () => {
  const s = escenario();
  await s.ejecutar();
  for (const datos of [{ uidObjetivo: 'otro' }, { iglesiaId: 'otra' },
    { accion: 'expulsar' }, { pertenenciaId: nuevoPeriodo }]) {
    await rechazar(s, s.solicitud(datos), datos.uidObjetivo ? 'permission-denied' : 'invalid-argument');
  }
});

test('Recibo privado se consulta solo bajo el UID autenticado y se valida su integridad', async () => {
  const s = escenario();
  await s.ejecutar();
  assert.ok(s.lecturas.filter((ruta) => ruta.startsWith('operaciones_desvinculacion/'))
    .every((ruta) => ruta.startsWith('operaciones_desvinculacion/miembro/')));
  s.documentos.get(reciboRuta()).version = 99;
  await rechazar(s, s.solicitud(), 'failed-precondition');
});

test('Solicitud antigua tras reingreso se rechaza, con recibo anterior o clave diferente', async () => {
  const s = escenario({ encargado: true });
  await s.ejecutar();
  s.documentos.set(perfilRuta, { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: nuevoPeriodo,
    fcmToken: 'token-sintetico-nuevo-periodo', fcmTokenActualizado: 'fecha-sintetica-nuevo-periodo' });
  await rechazar(s, s.solicitud(), 'failed-precondition');
  await rechazar(s, s.solicitud({ solicitudId: 'solicitud-00000002' }), 'failed-precondition');
});

test('Replay no afirma vigencia del recibo con perfil ausente, legado o período posterior ya terminado', async () => {
  for (const perfil of [null, {}, { pertenenciaId: nuevoPeriodo }]) {
    const s = escenario();
    await s.ejecutar();
    if (perfil === null) s.documentos.delete(perfilRuta);
    else s.documentos.set(perfilRuta, perfil);
    await rechazar(s, s.solicitud(), 'failed-precondition');
  }
});

test('Administración no verificable bloquea una nueva salida', async () => {
  const s = escenario();
  delete s.documentos.get(iglesiaRuta).adminUid;
  await rechazar(s, s.solicitud(), 'failed-precondition');
});

test('Nueva intención de salida puede operar solo sobre el nuevo período', async () => {
  const s = escenario();
  await s.ejecutar();
  s.documentos.set(perfilRuta, { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: nuevoPeriodo });
  assert.deepEqual(await s.ejecutar(s.solicitud({ pertenenciaId: nuevoPeriodo,
    solicitudId: 'solicitud-00000002' })), { ok: true });
  assert.equal(s.documentos.get(perfilRuta).pertenenciaId, nuevoPeriodo);
});

test('Replay histórico del antiguo administrador no ejecuta ni autoriza acciones nuevas', async () => {
  const s = escenario();
  const request = s.solicitud({ accion: 'expulsar' }, 'admin');
  await s.ejecutar(request);
  s.documentos.get(iglesiaRuta).adminUid = 'otro';
  s.documentos.get('usuarios_globales/admin').rolGlobal = 'lider_area';
  const antes = structuredClone(s.documentos);
  assert.deepEqual(await s.ejecutar(request), { ok: true });
  assert.deepEqual(s.documentos, antes);
  await rechazar(s, s.solicitud({ accion: 'expulsar', solicitudId: 'solicitud-00000002' }, 'admin'), 'permission-denied');
});

test('Solicitudes concurrentes idénticas confirman una sola salida y revocación', async () => {
  const s = escenario({ encargado: true });
  assert.deepEqual(await Promise.all([s.ejecutar(), s.ejecutar()]), [{ ok: true }, { ok: true }]);
  assert.equal(s.commits.length, 1);
  assert.equal(s.auditorias().length, 1);
});

for (const falla of ['lectura', 'update', 'senal', 'auditoria', 'recibo', 'commit']) {
  test(`Fallo de ${falla} revierte perfil, configuración, elegibilidad, auditoría y recibo`, async () => {
    const s = escenario({ encargado: true, falla });
    await rechazar(s, s.solicitud(), 'internal');
    assert.deepEqual(s.documentos, s.inicial);
  });
}

test('Errores de transporte conservan categoría sin filtrar detalles internos', async () => {
  for (const [codigo, esperado] of [[14, 'unavailable'], [4, 'deadline-exceeded'], [10, 'aborted']]) {
    const s = escenario({ falla: 'lectura', codigo });
    await rechazar(s, s.solicitud(), esperado);
  }
});

test('Transferencia concurrente retira permiso de expulsar al antiguo titular', async () => {
  const s = escenario({ encargado: true, antesConfirmar(documentos) {
    documentos.get(iglesiaRuta).adminUid = 'otro';
    documentos.get('usuarios_globales/admin').rolGlobal = 'lider_area';
  } });
  await assert.rejects(s.ejecutar(s.solicitud({ accion: 'expulsar' }, 'admin')), { code: 'permission-denied' });
  assert.equal(s.documentos.get(perfilRuta).iglesiaId, 'iglesia');
  assert.equal(s.auditorias().length, 0);
  assert.equal(s.documentos.has(reciboRuta('admin')), false);
});

test('Objetivo promovido concurrentemente a titular no puede salir', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.get(iglesiaRuta).adminUid = 'miembro';
    documentos.get(perfilRuta).rolGlobal = 'admin_iglesia';
  } });
  await assert.rejects(s.ejecutar(), { code: 'failed-precondition' });
  assert.equal(s.commits.length, 0);
});

test('Reemplazo de encargado concurrente preserva designación nueva y elegibilidad sincronizada', async () => {
  const s = escenario({ encargado: true, habilitado: true,
    async antesConfirmar(documentos, dependencias) {
      documentos.set('usuarios_globales/otro', { iglesiaId: 'iglesia', rolGlobal: 'servidor' });
      await actualizarEncargadoFinanciero({ auth: { uid: 'admin' }, data: {
        iglesiaId: 'iglesia', accion: 'designar', encargadoUid: 'otro',
      } }, dependencias);
    } });
  await s.ejecutar();
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, 'otro');
  assert.equal(s.documentos.get(accesoRuta).moduloHabilitado, true);
  assert.deepEqual(s.documentos.get(senalRuta), { habilitado: false, esEncargado: false, version: 4 });
  assert.deepEqual(s.documentos.get(`${iglesiaRuta}/finanzas_elegibilidad/otro`), {
    habilitado: true, esEncargado: true, version: 1,
  });
  assert.equal(s.auditorias().filter(([, datos]) => datos.motivo === 'desvinculacion').length, 0);
});

test('Designación concurrente del objetivo obliga a revocarla antes de confirmar salida', async () => {
  const s = escenario({ async antesConfirmar(documentos, dependencias) {
    await actualizarEncargadoFinanciero({ auth: { uid: 'admin' }, data: {
      iglesiaId: 'iglesia', accion: 'designar', encargadoUid: 'miembro',
    } }, dependencias);
  } });
  await s.ejecutar();
  assert.equal(s.documentos.get(accesoRuta).encargadoUid, null);
  assert.deepEqual(s.documentos.get(senalRuta), { habilitado: false, esEncargado: false, version: 2 });
  assert.equal(s.auditorias().filter(([, datos]) => datos.motivo === 'desvinculacion').length, 1);
});

test('Reingreso concurrente impide que una expulsión pendiente quite la nueva pertenencia', async () => {
  const s = escenario({ antesConfirmar(documentos) {
    documentos.get(perfilRuta).pertenenciaId = nuevoPeriodo;
    documentos.get(perfilRuta).fcmToken = 'token-sintetico-nuevo-periodo';
    documentos.get(perfilRuta).fcmTokenActualizado = 'fecha-sintetica-nuevo-periodo';
  } });
  await assert.rejects(s.ejecutar(s.solicitud({ accion: 'expulsar' }, 'admin')), { code: 'failed-precondition' });
  assert.equal(s.documentos.get(perfilRuta).pertenenciaId, nuevoPeriodo);
  assert.equal(s.documentos.get(perfilRuta).fcmToken, 'token-sintetico-nuevo-periodo');
  assert.equal(s.documentos.get(perfilRuta).fcmTokenActualizado, 'fecha-sintetica-nuevo-periodo');
  assert.equal(s.commits.length, 0);
});

test('Hook posterior se ejecuta después del commit, una vez; un fallo FCM no altera éxito', async () => {
  let llamadas = 0;
  const s = escenario({ despuesDeDesvincular: async () => {
    llamadas += 1;
    assert.equal(s.commits.length, 1);
    assert.equal(s.documentos.has(reciboRuta()), true);
    throw new Error('TOKEN_PRIVADO');
  } });
  assert.deepEqual(await s.ejecutar(), { ok: true });
  await s.ejecutar();
  assert.equal(llamadas, 1);
});

test('Recibo mínimo no almacena perfil personal, tokens ni formularios; respuesta es pequeña', async () => {
  const s = escenario();
  assert.deepEqual(await s.ejecutar(), { ok: true });
  const recibo = s.documentos.get(reciboRuta());
  assert.deepEqual(Object.keys(recibo).sort(), ['version', 'actorUid', 'uidObjetivo', 'iglesiaId',
    'accion', 'pertenenciaId', 'resultado', 'fechaCreacion'].sort());
  assert.equal(JSON.stringify(recibo).includes('PERSONA_PRIVADA'), false);
});

for (const accion of ['salir', 'expulsar']) {
  test(`Consulta verifica recibo real de ${accion} sin duplicar escrituras`, async () => {
    const s = escenario({ encargado: true });
    const request = s.solicitud({ accion }, accion === 'salir' ? 'miembro' : 'admin');
    await s.ejecutar(request);
    const antes = structuredClone(s.documentos);
    assert.deepEqual(await consultarEstadoSolicitudDesvinculacion(request, s.dependencias),
      { estado: 'CONFIRMADA_PERTENENCIA_TERMINADA' });
    assert.deepEqual(s.documentos, antes);
    assert.equal(s.commits.length, 1);
  });
}

test('index conecta callable v2 sin alterar región ni inicializar Admin nuevamente', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  let inicializaciones = 0;
  let region;
  const entrada = { auth: { uid: 'actor' }, data: {} };
  const resultado = { ok: true };
  const entorno = { exports: {}, require(nombre) {
    const imports = {
      'firebase-functions/v2/firestore': { onDocumentCreated: (...a) => a.at(-1), onDocumentUpdated: (...a) => a.at(-1) },
      'firebase-functions/v2': { setGlobalOptions(o) { region = o.region; } },
      'firebase-functions/v2/https': { onCall: (h) => h, HttpsError },
      'firebase-admin/app': { initializeApp() { inicializaciones += 1; } },
      'firebase-admin/firestore': { getFirestore: () => ({}), FieldValue: {} },
      'firebase-admin/messaging': { getMessaging: () => ({}) },
      './membresia': { async desvincularMiembroIglesia(request, deps) {
        assert.equal(request, entrada);
        assert.equal(deps.HttpsError, HttpsError);
        assert.deepEqual(Object.keys(deps).sort(), ['db', 'FieldValue', 'HttpsError'].sort());
        return resultado;
      }, async consultarEstadoSolicitudDesvinculacion(request, deps) {
        assert.equal(request, entrada);
        assert.deepEqual(Object.keys(deps).sort(), ['db', 'HttpsError'].sort());
        return { estado: 'NO_VERIFICABLE' };
      }, async recuperarContextoSolicitudDesvinculacion(request, deps) {
        assert.equal(request, entrada);
        assert.equal(deps.HttpsError, HttpsError);
        assert.deepEqual(Object.keys(deps).sort(), ['db', 'HttpsError'].sort());
        return { estado: 'RECIBO_AUSENTE' };
      } },
    };
    assert.ok(Object.hasOwn(imports, nombre), nombre);
    return imports[nombre];
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8'), entorno);
  assert.equal(await entorno.exports.desvincularMiembroIglesia(entrada), resultado);
  assert.equal((await entorno.exports.consultarEstadoSolicitudDesvinculacion(entrada)).estado, 'NO_VERIFICABLE');
  assert.equal((await entorno.exports.recuperarContextoSolicitudDesvinculacion(entrada)).estado, 'RECIBO_AUSENTE');
  assert.equal(inicializaciones, 1);
  assert.equal(region, 'southamerica-west1');
  for (const nombre of ['vincularUsuarioConCodigo', 'registrarNuevaIglesiaSegura',
    'transferirAdministracionIglesia', 'actualizarEncargadoFinanciero']) {
    assert.equal(typeof entorno.exports[nombre], 'function');
  }
});
