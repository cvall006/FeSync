const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const roles = require('../roles');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const iglesiaRuta = 'iglesias/iglesia';
const actorRuta = 'usuarios_globales/admin';
const objetivoRuta = 'usuarios_globales/miembro';
const periodo = 'a'.repeat(64);
const solicitudId = 'solicitud-roles-00000001';
const reciboRuta = `operaciones_roles/admin/solicitudes/${solicitudId}`;

// Doble optimista con updateTime independiente del contenido: detecta A -> B -> A.
// Las escrituras se preparan y validan en una copia antes de un commit atómico.
// No usa Firebase ni red. No se presenta como una prueba de emulador.
function escenario(opciones = {}) {
  const docs = new Map([
    [iglesiaRuta, { adminUid: 'admin', nombre: 'IGLESIA_PRIVADA' }],
    [actorRuta, { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia' }],
    [objetivoRuta, { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: periodo,
      nombre: 'PERSONA_PRIVADA', email: 'CORREO_PRIVADO', descripcion: 'Conservar',
      preferencias: { oscuro: true }, fcmToken: 'TOKEN_PRIVADO' }],
    ['usuarios_globales/otro', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'b'.repeat(64) }],
    [`${iglesiaRuta}/finanzas_config/acceso`, { encargadoUid: 'miembro', moduloHabilitado: true }],
    [`${iglesiaRuta}/finanzas_elegibilidad/miembro`, { habilitado: true, esEncargado: true, version: 5 }],
    [`${iglesiaRuta}/finanzas_auditoria/anterior`, { conservar: true }],
  ]);
  let reloj = 100;
  let ids = 0;
  let hookUsado = false;
  let intentos = 0;
  const versiones = new Map([...docs.keys()].map((r) => [r, 100]));
  const commits = [];
  const lecturas = [];
  const ref = (ruta) => ({ path: ruta, collection: (c) => coleccion(`${ruta}/${c}`) });
  const coleccion = (ruta) => ({ doc: (id = `evento-${++ids}`) => ref(`${ruta}/${id}`) });
  const version = (ruta) => `1700000000:${versiones.get(ruta)}`;
  const cambiar = (ruta, datos) => {
    if (datos === null) docs.delete(ruta);
    else docs.set(ruta, structuredClone(datos));
    versiones.set(ruta, ++reloj);
  };
  const foto = () => structuredClone({ docs, versiones });
  const db = {
    collection: coleccion,
    async runTransaction(callback, configuracion) {
      for (let intento = 0; intento < 5; intento++) {
        intentos++;
        const leidos = new Map();
        const pendientes = [];
        const guardar = (tipo, r, d) => {
          assert.notEqual(configuracion?.readOnly, true, 'Contexto nunca escribe');
          if (opciones.fallaEscritura === tipo ||
              (opciones.fallaEscritura === 'recibo' && r.path.startsWith('operaciones_roles/')) ||
              (opciones.fallaEscritura === 'auditoria' && r.path.includes('/membresia_auditoria/'))) {
            throw new Error('ERROR_PRIVADO');
          }
          pendientes.push({ tipo, ruta: r.path, datos: structuredClone(d) });
        };
        const resultado = await callback({
          async get(r) {
            assert.equal(pendientes.length, 0, 'Todas las lecturas preceden a escrituras');
            if (opciones.fallaLectura && (!opciones.rutaFallo || opciones.rutaFallo === r.path)) {
              throw Object.assign(new Error('ERROR_PRIVADO'), { code: opciones.fallaLectura });
            }
            lecturas.push(r.path);
            leidos.set(r.path, versiones.get(r.path));
            const datos = structuredClone(docs.get(r.path));
            return { exists: docs.has(r.path), data: () => structuredClone(datos),
              updateTime: opciones.sinVersion === r.path ? undefined :
                opciones.versionSnapshot ?? { seconds: 1700000000, nanoseconds: versiones.get(r.path) } };
          },
          update: (r, d) => guardar('update', r, d),
          create: (r, d) => guardar('create', r, d),
        });
        if (!hookUsado && opciones.antesCommit) {
          hookUsado = true;
          await opciones.antesCommit(s);
        }
        if ([...leidos].some(([r, v]) => versiones.get(r) !== v)) continue;
        if (opciones.fallaCommit) throw Object.assign(new Error('ERROR_PRIVADO'), { code: opciones.fallaCommit });
        const copia = structuredClone(docs);
        for (const w of pendientes) {
          assert.equal(copia.has(w.ruta), w.tipo === 'update', 'Precondición de escritura');
          copia.set(w.ruta, w.tipo === 'update' ? { ...copia.get(w.ruta), ...w.datos } : w.datos);
        }
        if (pendientes.length) {
          const commitTime = ++reloj;
          for (const w of pendientes) {
            docs.set(w.ruta, copia.get(w.ruta));
            versiones.set(w.ruta, commitTime);
          }
          commits.push(pendientes);
        }
        return resultado;
      }
      throw Object.assign(new Error('ERROR_PRIVADO'), { code: 10 });
    },
  };
  const deps = { db, HttpsError, FieldValue: { serverTimestamp: () => 'fecha-servidor' } };
  const contextoRequest = (datos = {}, actor = 'admin') => ({
    auth: actor === null ? null : { uid: actor }, data: { iglesiaId: 'iglesia', uidObjetivo: 'miembro', ...datos },
  });
  const cambioRequest = (datos = {}, actor = 'admin') => contextoRequest({ pertenenciaId: periodo,
    rolNuevo: 'lider_area', versionPerfilEsperada: version(objetivoRuta),
    versionIglesiaEsperada: version(iglesiaRuta), solicitudId, ...datos }, actor);
  const s = { docs, versiones, commits, lecturas, cambiar, foto, deps, opciones, version,
    contextoRequest, cambioRequest, intentos: () => intentos,
    contexto: (r = contextoRequest()) => roles.obtenerContextoCambioRolMiembro(r, deps),
    ejecutar: (r = cambioRequest()) => roles.actualizarRolMiembro(r, deps),
    auditorias: () => [...docs].filter(([r]) => r.includes('/membresia_auditoria/')) };
  return s;
}

async function denegar(s, request, code, contexto = false) {
  const antes = s.foto();
  await assert.rejects(contexto ? s.contexto(request) : s.ejecutar(request), (e) => {
    assert.ok(e instanceof HttpsError);
    assert.equal(e.code, code);
    assert.equal(e.message.includes('PRIVADO'), false);
    return true;
  });
  assert.deepEqual(s.foto(), antes);
}

test('Contexto titular: lectura transaccional mínima, exacta y sin escrituras', async () => {
  const s = escenario();
  const antes = s.foto();
  assert.deepEqual(await s.contexto(), { rolActual: 'servidor', pertenenciaId: periodo,
    versionPerfilEsperada: '1700000000:100', versionIglesiaEsperada: '1700000000:100' });
  assert.deepEqual(s.lecturas, [iglesiaRuta, actorRuta, objetivoRuta]);
  assert.deepEqual(s.foto(), antes);
  assert.equal(s.commits.length, 0);
});

test('Timestamp real del Admin SDK conserva nanosegundos sin inicializar Firebase', async () => {
  const { Timestamp } = require('firebase-admin/firestore');
  const s = escenario({ versionSnapshot: new Timestamp(1700000000, 999999999) });
  const contexto = await s.contexto();
  assert.equal(contexto.versionPerfilEsperada, '1700000000:999999999');
  assert.equal(contexto.versionIglesiaEsperada, '1700000000:999999999');
  assert.equal(s.commits.length, 0);
});

test('Límites documentales y UID no se eluden con tamaño UTF-8', async () => {
  const s = escenario();
  for (const datos of [{ iglesiaId: 'x'.repeat(1501) }, { iglesiaId: 'é'.repeat(751) },
    { uidObjetivo: 'x'.repeat(129) }]) {
    await denegar(s, s.contextoRequest(datos), 'invalid-argument', true);
    await denegar(s, s.cambioRequest(datos), 'invalid-argument');
  }
  assert.equal(s.lecturas.length, 0);
});

for (const rolGlobal of ['servidor', 'lider_area', 'desconocido', null]) {
  test(`Rol actor ${rolGlobal} denegado aunque conserve adminUid, sin autoridad financiera`, async () => {
    const s = escenario();
    s.cambiar(actorRuta, { iglesiaId: 'iglesia', rolGlobal, encargadoUid: 'admin', esFinanciero: true });
    s.cambiar(`${iglesiaRuta}/finanzas_config/acceso`, { encargadoUid: 'admin', moduloHabilitado: true });
    await denegar(s, s.contextoRequest(), 'permission-denied', true);
    await denegar(s, s.cambioRequest(), 'permission-denied');
  });
}

for (const caso of ['otra-iglesia', 'admin-anterior', 'perfil-ausente', 'iglesia-ausente']) {
  test(`Actor ${caso} no obtiene contexto ni cambia roles`, async () => {
    const s = escenario();
    if (caso === 'otra-iglesia') s.cambiar(actorRuta, { iglesiaId: 'otra', rolGlobal: 'admin_iglesia' });
    if (caso === 'admin-anterior') s.cambiar(iglesiaRuta, { adminUid: 'otro' });
    if (caso === 'perfil-ausente') s.cambiar(actorRuta, null);
    if (caso === 'iglesia-ausente') s.cambiar(iglesiaRuta, null);
    await denegar(s, s.contextoRequest(), 'permission-denied', true);
    await denegar(s, s.cambioRequest(), 'permission-denied');
  });
}

test('Auth obligatoria y UID del actor malformado nunca se aceptan', async () => {
  for (const actor of [null, '', ' ', 'x/y', 'a'.repeat(129)]) {
    const s = escenario();
    await denegar(s, s.contextoRequest({}, actor), 'unauthenticated', true);
    await denegar(s, s.cambioRequest({}, actor), 'unauthenticated');
    assert.equal(s.lecturas.length, 0);
  }
});

for (const campo of ['iglesiaId', 'uidObjetivo']) {
  test(`Contexto rechaza ${campo} inválido y parámetros extra`, async () => {
    const s = escenario();
    for (const valor of [undefined, null, '', ' ', '.', '..', '__reservado__', 'a/b', 'dato\n', {}, []]) {
      await denegar(s, s.contextoRequest({ [campo]: valor }), 'invalid-argument', true);
      await denegar(s, s.cambioRequest({ [campo]: valor }), 'invalid-argument');
    }
    for (const extra of ['actorUid', 'rolGlobal', 'isAdmin', 'descripcion', 'pertenenciaId']) {
      await denegar(s, s.contextoRequest({ [extra]: 'falsificado' }), 'invalid-argument', true);
    }
    for (const extra of ['actorUid', 'rolGlobal', 'isAdmin', 'descripcion', 'encargadoUid']) {
      await denegar(s, s.cambioRequest({ [extra]: 'falsificado' }), 'invalid-argument');
    }
    assert.equal(s.lecturas.length, 0);
  });
}

test('Contratos rechazan ausencia, arrays y claves incompletas antes de leer', async () => {
  const s = escenario();
  for (const data of [undefined, null, [], 'texto', {}, { iglesiaId: 'iglesia' }]) {
    await denegar(s, { auth: { uid: 'admin' }, data }, 'invalid-argument', true);
    await denegar(s, { auth: { uid: 'admin' }, data }, 'invalid-argument');
  }
  for (const campo of Object.keys(s.cambioRequest().data)) {
    const r = s.cambioRequest(); delete r.data[campo];
    await denegar(s, r, 'invalid-argument');
  }
  assert.equal(s.lecturas.length, 0);
});

for (const rolNuevo of ['admin_iglesia', 'lider', '', null, true, {}]) {
  test(`Rol nuevo ${JSON.stringify(rolNuevo)} se rechaza estrictamente`, async () => {
    const s = escenario();
    await denegar(s, s.cambioRequest({ rolNuevo }), 'invalid-argument');
    assert.equal(s.lecturas.length, 0);
  });
}

for (const campo of ['versionPerfilEsperada', 'versionIglesiaEsperada']) {
  test(`${campo}: rechaza formatos no canónicos, fuera de rango o imprecisos`, async () => {
    const s = escenario();
    for (const v of [null, {}, 1700000000, '', '1', '1:2\n', '01:2', '-0:2', '1:02',
      '1:-1', '1:1000000000', '253402300800:0', '-62135596801:0', '1.5:2', '1e9:2']) {
      await denegar(s, s.cambioRequest({ [campo]: v }), 'invalid-argument');
    }
    assert.equal(s.lecturas.length, 0);
  });
}

test('SolicitudId y período se validan sin normalizar ni aceptar saltos de línea', async () => {
  const s = escenario();
  for (const id of [null, '', 'a'.repeat(15), 'a'.repeat(129), 'a/bbbbbbbbbbbbbbb', '__reservado_largo__',
    'a'.repeat(16) + '\n', 'a'.repeat(16) + ' ', {}, 123]) {
    await denegar(s, s.cambioRequest({ solicitudId: id }), 'invalid-argument');
  }
  for (const id of [null, '', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), {}, 'a'.repeat(64) + '\n']) {
    await denegar(s, s.cambioRequest({ pertenenciaId: id }), 'invalid-argument');
  }
});

for (const caso of ['legado', 'periodo-invalido', 'rol-admin', 'rol-desconocido', 'otra-iglesia', 'ausente', 'titular']) {
  test(`Objetivo ${caso} se deniega en contexto y actualización`, async () => {
    const s = escenario();
    const perfil = { ...s.docs.get(objetivoRuta) };
    if (caso === 'legado') delete perfil.pertenenciaId;
    if (caso === 'periodo-invalido') perfil.pertenenciaId = null;
    if (caso === 'rol-admin') perfil.rolGlobal = 'admin_iglesia';
    if (caso === 'rol-desconocido') perfil.rolGlobal = 'desconocido';
    if (caso === 'otra-iglesia') perfil.iglesiaId = 'otra';
    s.cambiar(objetivoRuta, caso === 'ausente' ? null : perfil);
    const datos = caso === 'titular' ? { uidObjetivo: 'admin' } : {};
    const code = caso === 'ausente' ? 'not-found' : caso === 'otra-iglesia' ? 'permission-denied' : 'failed-precondition';
    await denegar(s, s.contextoRequest(datos), code, true);
    await denegar(s, s.cambioRequest(datos), code);
  });
}

for (const rolAnterior of ['servidor', 'lider_area']) {
  test(`${rolAnterior} cambia al otro rol; perfil, recibo y auditoría atómicos; Finanzas intactas`, async () => {
    const s = escenario();
    s.cambiar(objetivoRuta, { ...s.docs.get(objetivoRuta), rolGlobal: rolAnterior });
    const rolNuevo = rolAnterior === 'servidor' ? 'lider_area' : 'servidor';
    const antes = structuredClone(s.docs);
    assert.deepEqual(await s.ejecutar(s.cambioRequest({ rolNuevo })), { estado: 'CONFIRMADA', huboCambio: true });
    assert.deepEqual(s.docs.get(objetivoRuta), { ...antes.get(objetivoRuta), rolGlobal: rolNuevo });
    for (const [ruta, datos] of antes) if (ruta !== objetivoRuta) assert.deepEqual(s.docs.get(ruta), datos);
    assert.equal(s.commits.length, 1);
    assert.equal(s.commits[0].length, 3);
    assert.equal(s.auditorias().length, 1);
    const evento = s.auditorias()[0];
    assert.equal(evento[1].tipo, 'cambio_rol');
    assert.equal(evento[1].rolAnterior, rolAnterior);
    assert.equal(evento[1].rolNuevo, rolNuevo);
    assert.equal(evento[1].fecha, 'fecha-servidor');
    assert.equal(s.versiones.get(objetivoRuta), s.versiones.get(reciboRuta));
    assert.equal(s.versiones.get(objetivoRuta), s.versiones.get(evento[0]));
    assert.deepEqual(s.lecturas, [reciboRuta, iglesiaRuta, actorRuta, objetivoRuta]);
  });
}

test('Período distinto se rechaza sin sustituirlo ni escribir', async () => {
  const s = escenario();
  await denegar(s, s.cambioRequest({ pertenenciaId: 'b'.repeat(64) }), 'failed-precondition');
});

for (const campo of ['versionPerfilEsperada', 'versionIglesiaEsperada']) {
  test(`${campo}: diferencia de UN nanosegundo dentro del mismo milisegundo impide escribir`, async () => {
    const s = escenario();
    await denegar(s, s.cambioRequest({ [campo]: '1700000000:101' }), 'aborted');
  });
}

for (const ruta of [objetivoRuta, iglesiaRuta]) {
  test(`Snapshot sin versión verificable ${ruta} no produce contexto ni cambio`, async () => {
    const s = escenario({ sinVersion: ruta });
    await denegar(s, s.contextoRequest(), 'failed-precondition', true);
    await denegar(s, s.cambioRequest(), 'failed-precondition');
  });
}

test('Ida/vuelta de rol invalida solicitud antigua aunque contenido vuelva a ser igual', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  const perfil = { ...s.docs.get(objetivoRuta) };
  s.cambiar(objetivoRuta, { ...perfil, rolGlobal: 'lider_area' });
  s.cambiar(objetivoRuta, perfil);
  await denegar(s, r, 'aborted');
});

test('Transferencia ida/vuelta a otro miembro invalida versión de iglesia, sin tocar al objetivo', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  const iglesia = { ...s.docs.get(iglesiaRuta) };
  s.cambiar(iglesiaRuta, { ...iglesia, adminUid: 'otro' });
  s.cambiar(iglesiaRuta, iglesia);
  await denegar(s, r, 'aborted');
});

test('Rol coincidente registra recibo histórico pero no modifica perfil ni audita', async () => {
  const s = escenario();
  const versionAnterior = s.version(objetivoRuta);
  const r = s.cambioRequest({ rolNuevo: 'servidor' });
  assert.deepEqual(await s.ejecutar(r), { estado: 'CONFIRMADA', huboCambio: false });
  assert.equal(s.version(objetivoRuta), versionAnterior);
  assert.equal(s.auditorias().length, 0);
  assert.equal(s.commits[0].length, 1);
  const antes = s.foto();
  assert.deepEqual(await s.ejecutar(r), { estado: 'CONFIRMADA', huboCambio: false });
  assert.deepEqual(s.foto(), antes);
});

test('Repetición confirmada devuelve el resultado original sin nuevas escrituras', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  const resultado = await s.ejecutar(r);
  const antes = s.foto();
  assert.deepEqual(await s.ejecutar(r), resultado);
  assert.deepEqual(s.foto(), antes);
  assert.equal(s.commits.length, 1);
});

test('Historia propia no revierte nuevo período, transferencia ni roles posteriores', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  await s.ejecutar(r);
  s.cambiar(iglesiaRuta, { adminUid: 'miembro' });
  s.cambiar(actorRuta, { iglesiaId: 'otra', rolGlobal: 'servidor' });
  s.cambiar(objetivoRuta, { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: 'b'.repeat(64) });
  const antes = s.foto();
  assert.deepEqual(await s.ejecutar(r), { estado: 'CONFIRMADA', huboCambio: true });
  assert.deepEqual(s.foto(), antes);
});

for (const [campo, valor] of Object.entries({ iglesiaId: 'otra', uidObjetivo: 'otro',
  pertenenciaId: 'b'.repeat(64), rolNuevo: 'servidor', versionPerfilEsperada: '1700000000:102',
  versionIglesiaEsperada: '1700000000:102' })) {
  test(`Clave confirmada con ${campo} diferente se rechaza`, async () => {
    const s = escenario();
    const r = s.cambioRequest();
    await s.ejecutar(r);
    await denegar(s, { ...r, data: { ...r.data, [campo]: valor } }, 'invalid-argument');
  });
}

for (const campo of ['version', 'actorUid', 'huella', 'resultado']) {
  test(`Recibo con ${campo} incoherente nunca se presenta como éxito`, async () => {
    const s = escenario();
    const r = s.cambioRequest();
    await s.ejecutar(r);
    s.cambiar(reciboRuta, { ...s.docs.get(reciboRuta), [campo]: 'DATO_PRIVADO' });
    await denegar(s, r, 'failed-precondition');
  });
}

test('Auth diferente no puede reutilizar el recibo del actor original', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  await s.ejecutar(r);
  await denegar(s, { ...r, auth: { uid: 'otro' } }, 'permission-denied');
  assert.ok(s.lecturas.includes(`operaciones_roles/otro/solicitudes/${solicitudId}`));
});

for (const fallaEscritura of ['update', 'auditoria', 'recibo']) {
  test(`Fallo preparando ${fallaEscritura}: ninguna escritura parcial`, async () => {
    const s = escenario({ fallaEscritura });
    await denegar(s, s.cambioRequest(), 'internal');
    assert.equal(s.commits.length, 0);
  });
}

for (const codigo of [14, 4, 10, 'firestore/unavailable', 'firestore/deadline-exceeded', 'desconocido']) {
  test(`Errores de lectura ${codigo} conservan naturaleza y no exponen detalles`, async () => {
    const s = escenario({ fallaLectura: codigo });
    const code = [14, 'firestore/unavailable'].includes(codigo) ? 'unavailable' :
      [4, 'firestore/deadline-exceeded'].includes(codigo) ? 'deadline-exceeded' : codigo === 10 ? 'aborted' : 'internal';
    await denegar(s, s.contextoRequest(), code, true);
    await denegar(s, s.cambioRequest(), code);
  });
}

test('Lectura fallida después de un recibo confirmado no se convierte en éxito', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  await s.ejecutar(r);
  s.opciones.fallaLectura = 14;
  s.opciones.rutaFallo = iglesiaRuta;
  await denegar(s, r, 'unavailable');
});

test('Fallo de commit no confirma perfil, auditoría ni recibo', async () => {
  const s = escenario({ fallaCommit: 14 });
  await denegar(s, s.cambioRequest(), 'unavailable');
  assert.equal(s.commits.length, 0);
});

for (const caso of ['salida', 'expulsion', 'reingreso', 'transferencia', 'rol-ida-vuelta', 'iglesia-ida-vuelta']) {
  test(`Escritor concurrente ${caso} obliga a revalidar sin refrescar precondiciones`, async () => {
    const s = escenario({ antesCommit(s) {
      if (caso === 'salida' || caso === 'expulsion') {
        const perfil = { ...s.docs.get(objetivoRuta) }; delete perfil.iglesiaId; delete perfil.rolGlobal;
        if (caso === 'expulsion') delete perfil.descripcion;
        s.cambiar(objetivoRuta, perfil);
      } else if (caso === 'reingreso') {
        s.cambiar(objetivoRuta, { ...s.docs.get(objetivoRuta), pertenenciaId: 'b'.repeat(64) });
      } else if (caso === 'transferencia') {
        s.cambiar(iglesiaRuta, { adminUid: 'otro' });
      } else {
        const ruta = caso === 'rol-ida-vuelta' ? objetivoRuta : iglesiaRuta;
        const original = { ...s.docs.get(ruta) };
        s.cambiar(ruta, { ...original, ...(ruta === objetivoRuta ? { rolGlobal: 'lider_area' } : { adminUid: 'otro' }) });
        s.cambiar(ruta, original);
      }
    } });
    await assert.rejects(s.ejecutar(), (e) => e instanceof HttpsError &&
      ['aborted', 'permission-denied', 'failed-precondition'].includes(e.code));
    assert.ok(s.intentos() >= 2);
    assert.equal(s.commits.length, 0);
    assert.equal(s.docs.has(reciboRuta), false);
    assert.equal(s.auditorias().length, 0);
    if (caso === 'reingreso') assert.equal(s.docs.get(objetivoRuta).pertenenciaId, 'b'.repeat(64));
  });
}

test('Dos ejecuciones concurrentes de la misma clave confirman una sola actualización', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  const resultados = await Promise.all([s.ejecutar(r), s.ejecutar(structuredClone(r))]);
  assert.deepEqual(resultados[0], resultados[1]);
  assert.equal(s.commits.length, 1);
  assert.equal(s.auditorias().length, 1);
});

test('Dos claves simultáneas con el mismo contexto no sobrescriben el cambio ganador', async () => {
  const s = escenario();
  const r = s.cambioRequest();
  const resultados = await Promise.allSettled([
    s.ejecutar(r), s.ejecutar({ ...r, data: { ...r.data, solicitudId: 'solicitud-roles-00000002' } }),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find((r) => r.status === 'rejected').reason.code, 'aborted');
  assert.equal(s.commits.length, 1);
});

test('Contexto y respuestas excluyen nombres, correos, UID, tokens y huellas internas', async () => {
  const s = escenario();
  const contexto = await s.contexto();
  const resultado = await s.ejecutar();
  const publico = JSON.stringify({ contexto, resultado });
  for (const privado of ['PERSONA_PRIVADA', 'IGLESIA_PRIVADA', 'CORREO_PRIVADO', 'TOKEN_PRIVADO',
    'admin', 'miembro', 'iglesia', 'huella', 'descripcion', 'finanzas', solicitudId]) {
    assert.equal(publico.includes(privado), false);
  }
});

test('Index conecta ambos callables al módulo real, una inicialización y región existente', async () => {
  const s = escenario();
  const exports = {};
  let inicializaciones = 0;
  let opciones;
  const imports = {
    './roles': roles,
    'firebase-functions/v2/firestore': { onDocumentCreated: (...args) => args.at(-1), onDocumentUpdated: (...args) => args.at(-1) },
    'firebase-functions/v2': { setGlobalOptions(v) { opciones = v; } },
    'firebase-functions/v2/https': { onCall: (handler) => handler, HttpsError },
    'firebase-admin/app': { initializeApp() { inicializaciones++; } },
    'firebase-admin/firestore': { getFirestore: () => s.deps.db, FieldValue: s.deps.FieldValue },
    'firebase-admin/messaging': { getMessaging() { throw new Error('FCM prohibido'); } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8'), {
    exports, require(nombre) { assert.ok(Object.hasOwn(imports, nombre)); return imports[nombre]; },
    console: { log() { assert.fail('Sin logs'); }, error() { assert.fail('Sin logs'); } },
  });
  assert.equal(inicializaciones, 1);
  assert.equal(opciones.region, 'southamerica-west1');
  assert.equal((await exports.obtenerContextoCambioRolMiembro(s.contextoRequest())).rolActual, 'servidor');
  assert.deepEqual(await exports.actualizarRolMiembro(s.cambioRequest()), { estado: 'CONFIRMADA', huboCambio: true });
  assert.equal(typeof exports.transferirAdministracionIglesia, 'function');
});
