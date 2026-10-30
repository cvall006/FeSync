const test = require('node:test');
const assert = require('node:assert/strict');
const { generarPertenenciaId, pertenenciaIdValido } = require('../pertenencia');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');

test('Generador devuelve 32 bytes aleatorios en hexadecimal canónico', () => {
  const ids = Array.from({ length: 128 }, () => generarPertenenciaId());
  assert.ok(ids.every((id) => pertenenciaIdValido(id)));
  assert.ok(ids.every((id) => Buffer.from(id, 'hex').length === 32));
  assert.equal(new Set(ids).size, ids.length);
});

test('Validador acepta formato canónico sin afirmar procedencia servidor', () => {
  assert.equal(pertenenciaIdValido('a'.repeat(64)), true);
  assert.equal(pertenenciaIdValido('0123456789abcdef'.repeat(4)), true);
});

test('Validador rechaza tipos, longitudes y formatos incorrectos sin normalizar', () => {
  for (const valor of [undefined, null, true, 42, {}, [], new String('a'.repeat(64)),
    '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64),
    ` ${'a'.repeat(64)}`, `${'a'.repeat(64)} `, `${'a'.repeat(64)}\n`,
    '00000000-0000-4000-8000-000000000000']) {
    assert.equal(pertenenciaIdValido(valor), false);
  }
});

function escenarioIngreso(opciones = {}) {
  const documentos = new Map([
    ['iglesias/iglesia', { codigoAcceso: 'CODIGO', adminUid: '' }],
    ['usuarios_globales/miembro', { modoOscuro: true, preferencias: { idioma: 'es' } }],
  ]);
  for (const [ruta, datos] of Object.entries(opciones.documentos ?? {})) {
    if (datos === null) documentos.delete(ruta);
    else documentos.set(ruta, structuredClone(datos));
  }
  const inicial = structuredClone(documentos);
  const generados = [];
  let ids = 0;
  let intentos = 0;
  const ref = (ruta) => ({
    path: ruta, id: ruta.split('/').at(-1),
    collection: (nombre) => ({ doc: (id) => ref(`${ruta}/${nombre}/${id}`) }),
  });
  const resolver = (referencia) => referencia.codigo === undefined
    ? documentos.get(referencia.path)
    : [...documentos].filter(([ruta, datos]) =>
      ruta.startsWith('iglesias/') && datos.codigoAcceso === referencia.codigo).slice(0, 1);
  const db = {
    collection(nombre) {
      assert.ok(['usuarios_globales', 'iglesias', 'operaciones_ingreso'].includes(nombre));
      return {
        doc: (id = `nueva-${++ids}`) => ref(`${nombre}/${id}`),
        where(campo, operador, codigo) {
          assert.equal(campo, 'codigoAcceso');
          assert.equal(operador, '==');
          return { limit(cantidad) { assert.equal(cantidad, 1); return { codigo }; } };
        },
      };
    },
    async runTransaction(callback) {
      for (let intento = 0; intento < 4; intento++) {
        intentos++;
        const leidos = [];
        const pendientes = [];
        const resultado = await callback({
          async get(referencia) {
            assert.equal(pendientes.length, 0, 'Todas las lecturas antes de las escrituras');
            const datos = structuredClone(resolver(referencia));
            leidos.push({ referencia, datos });
            if (referencia.codigo !== undefined) return {
              empty: datos.length === 0,
              docs: datos.map(([ruta, valor]) => ({ ...ref(ruta), data: () => structuredClone(valor) })),
            };
            return { exists: datos !== undefined, data: () => structuredClone(datos) };
          },
          set(referencia, datos, opcionesSet) {
            assert.equal(opcionesSet?.merge, true);
            if (opciones.fallaPerfil) throw new Error('fallo-perfil-simulado');
            pendientes.push({ referencia, datos, merge: true });
          },
          create(referencia, datos) {
            if (opciones.fallaRecibo && referencia.path.startsWith('operaciones_ingreso/')) {
              throw new Error('fallo-recibo-simulado');
            }
            pendientes.push({ referencia, datos, crear: true });
          },
        });
        if (intento === 0) opciones.antesConfirmar?.(documentos);
        if (leidos.some(({ referencia, datos }) => !isDeepStrictEqual(datos, resolver(referencia)))) continue;
        if (opciones.fallaCommit) throw new Error('fallo-commit-simulado');
        for (const { referencia, crear } of pendientes) {
          if (crear) assert.equal(documentos.has(referencia.path), false);
        }
        for (const { referencia, datos, merge } of pendientes) {
          documentos.set(referencia.path, structuredClone({
            ...(merge ? documentos.get(referencia.path) : {}), ...datos,
          }));
        }
        return resultado;
      }
      throw new Error('Conflicto persistente');
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const imports = {
    'firebase-functions/v2/firestore': { onDocumentCreated: (...args) => args.at(-1), onDocumentUpdated: (...args) => args.at(-1) },
    'firebase-functions/v2': { setGlobalOptions(opcionesGlobales) { assert.equal(opcionesGlobales.region, 'southamerica-west1'); } },
    'firebase-functions/v2/https': { onCall: (handler) => handler, HttpsError },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'fecha-servidor' } },
    'firebase-admin/messaging': { getMessaging: () => ({}) },
    './pertenencia': { generarPertenenciaId() {
      const id = generarPertenenciaId(); generados.push(id); return id;
    } },
    './idempotencia_ingreso': require('../idempotencia_ingreso'),
  };
  const sandbox = { exports: {}, require(nombre) {
    assert.ok(Object.hasOwn(imports, nombre), nombre); return imports[nombre];
  }, console: { log() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'), sandbox);
  return {
    documentos, inicial, generados, intentos: () => intentos,
    vincular: (data = {}, auth = { uid: 'miembro' }) => sandbox.exports.vincularUsuarioConCodigo({
      auth, data: { codigo: ' codigo ', ...data },
    }),
    crear: (data = {}, auth = { uid: 'miembro' }) => sandbox.exports.registrarNuevaIglesiaSegura({
      auth, data: { nombreIglesia: 'Nueva', codigo: ' nuevo ', ...data },
    }),
  };
}

for (const operacion of ['vincular', 'crear']) {
  test(`${operacion} genera pertenencia confirmada, conserva auxiliares y contrato público`, async () => {
    const s = escenarioIngreso();
    const resultado = await s[operacion]();
    assert.deepEqual(JSON.parse(JSON.stringify(resultado)), {
      ok: true, iglesiaId: operacion === 'vincular' ? 'iglesia' : 'nueva-1',
    });
    const perfil = s.documentos.get('usuarios_globales/miembro');
    assert.equal(perfil.iglesiaId, resultado.iglesiaId);
    assert.equal(perfil.rolGlobal, operacion === 'vincular' ? 'servidor' : 'admin_iglesia');
    assert.equal(perfil.pertenenciaId, s.generados.at(-1));
    assert.equal(pertenenciaIdValido(perfil.pertenenciaId), true);
    assert.equal(perfil.modoOscuro, true);
    assert.deepEqual(perfil.preferencias, { idioma: 'es' });
    if (operacion === 'crear') assert.equal(s.documentos.get(`iglesias/${resultado.iglesiaId}`).adminUid, 'miembro');
    const confirmado = structuredClone(s.documentos);
    await assert.rejects(s[operacion](), { code: 'failed-precondition' });
    assert.deepEqual(s.documentos, confirmado);
    assert.equal(s.generados.length, 1);
  });

  test(`${operacion} no modifica usuario ya vinculado, con ID o sin él`, async () => {
    for (const pertenenciaId of [undefined, generarPertenenciaId()]) {
      const s = escenarioIngreso({ documentos: {
        'usuarios_globales/miembro': { iglesiaId: 'otra', rolGlobal: 'lider_area',
          ...(pertenenciaId ? { pertenenciaId } : {}) },
      } });
      await assert.rejects(s[operacion](), { code: 'failed-precondition' });
      assert.deepEqual(s.documentos, s.inicial);
      assert.equal(s.generados.length, 0);
    }
  });

  test(`${operacion} rechaza pertenenciaId del cliente y exige Auth y código`, async () => {
    const s = escenarioIngreso();
    for (const pertenenciaId of [generarPertenenciaId(), null, '']) {
      await assert.rejects(s[operacion]({ pertenenciaId }), { code: 'invalid-argument' });
    }
    await assert.rejects(s[operacion]({}, null), { code: 'unauthenticated' });
    await assert.rejects(s[operacion]({ codigo: ' ' }), { code: 'invalid-argument' });
    assert.deepEqual(s.documentos, s.inicial);
  });

  for (const falla of ['fallaPerfil', 'fallaCommit']) {
    test(`${operacion} con ${falla} no deja iglesia o perfil parcialmente escritos`, async () => {
      const s = escenarioIngreso({ [falla]: true });
      await assert.rejects(s[operacion](), /fallo-/);
      assert.deepEqual(s.documentos, s.inicial);
    });
  }

  test(`${operacion} revalida pertenencia ganadora al reintentar`, async () => {
    const ganador = { iglesiaId: 'otra', rolGlobal: 'servidor', pertenenciaId: generarPertenenciaId() };
    const s = escenarioIngreso({ antesConfirmar(documentos) {
      documentos.set('usuarios_globales/miembro', ganador);
    } });
    await assert.rejects(s[operacion](), { code: 'failed-precondition' });
    assert.equal(s.intentos(), 2);
    assert.deepEqual(s.documentos, new Map([...s.inicial, ['usuarios_globales/miembro', ganador]]));
  });
}

test('Reingreso a la misma iglesia renueva un ID anterior sin migrar otros perfiles', async () => {
  const s = escenarioIngreso();
  await s.vincular();
  const perfil = s.documentos.get('usuarios_globales/miembro');
  const anterior = perfil.pertenenciaId;
  // Simula la salida actual: el campo permanece, pero ya no hay pertenencia.
  delete perfil.iglesiaId;
  delete perfil.rolGlobal;
  await s.vincular();
  assert.notEqual(s.documentos.get('usuarios_globales/miembro').pertenenciaId, anterior);
  assert.equal(s.documentos.get('usuarios_globales/miembro').iglesiaId, 'iglesia');
});

for (const operaciones of [['vincular', 'vincular'], ['crear', 'crear'], ['vincular', 'crear']]) {
  test(`Ingresos simultáneos ${operaciones.join('/')} confirman una única pertenencia`, async () => {
    const s = escenarioIngreso();
    const resultados = await Promise.allSettled(operaciones.map((operacion) => s[operacion]()));
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
    const ganador = resultados.find((r) => r.status === 'fulfilled').value;
    const perfil = s.documentos.get('usuarios_globales/miembro');
    assert.equal(perfil.iglesiaId, ganador.iglesiaId);
    assert.ok(s.generados.includes(perfil.pertenenciaId));
    assert.equal([...s.documentos.keys()].filter((ruta) => ruta.startsWith('iglesias/nueva-')).length,
      ganador.iglesiaId === 'iglesia' ? 0 : 1);
  });
}

test('Código inexistente, código ocupado y nombre vacío mantienen sus rechazos', async () => {
  const s = escenarioIngreso();
  await assert.rejects(s.vincular({ codigo: 'inexistente' }), { code: 'not-found' });
  await assert.rejects(s.crear({ codigo: 'codigo' }), { code: 'already-exists' });
  await assert.rejects(s.crear({ nombreIglesia: ' ' }), { code: 'invalid-argument' });
  assert.deepEqual(s.documentos, s.inicial);
});

test('Cambio concurrente de código reintenta y no vincula mediante un código retirado', async () => {
  const s = escenarioIngreso({ antesConfirmar(documentos) {
    documentos.set('iglesias/iglesia', { codigoAcceso: 'RETIRADO', adminUid: '' });
  } });
  await assert.rejects(s.vincular(), { code: 'not-found' });
  assert.equal(s.intentos(), 2);
  assert.deepEqual(s.documentos.get('usuarios_globales/miembro'), s.inicial.get('usuarios_globales/miembro'));
});

test('Reintento conserva auxiliares concurrentes y persiste solo el ID del intento confirmado', async () => {
  const s = escenarioIngreso({ antesConfirmar(documentos) {
    documentos.set('usuarios_globales/miembro', { modoOscuro: false, auxiliar: 'concurrente' });
  } });
  await s.vincular();
  const perfil = s.documentos.get('usuarios_globales/miembro');
  assert.equal(s.intentos(), 2);
  assert.equal(s.generados.length, 2);
  assert.equal(perfil.pertenenciaId, s.generados[1]);
  assert.notEqual(perfil.pertenenciaId, s.generados[0]);
  assert.equal(perfil.auxiliar, 'concurrente');
  assert.equal(perfil.modoOscuro, false);
});

const solicitudId = 'solicitud_ingreso_0001';
const recibos = (s) => [...s.documentos].filter(([ruta]) => ruta.startsWith('operaciones_ingreso/'));
function simularSalida(s) {
  const perfil = s.documentos.get('usuarios_globales/miembro');
  delete perfil.iglesiaId;
  delete perfil.rolGlobal;
}

for (const operacion of ['vincular', 'crear']) {
  test(`${operacion} identificada crea recibo privado y repetición exacta no escribe`, async () => {
    const s = escenarioIngreso();
    const resultado = await s[operacion]({ solicitudId });
    const confirmado = structuredClone(s.documentos);
    assert.deepEqual(structuredClone(await s[operacion]({ solicitudId })), structuredClone(resultado));
    assert.deepEqual(s.documentos, confirmado);
    assert.equal(s.generados.length, 1);
    assert.equal(recibos(s).length, 1);
    const [ruta, recibo] = recibos(s)[0];
    assert.equal(ruta, `operaciones_ingreso/miembro/solicitudes/${solicitudId}`);
    assert.equal(recibo.uid, 'miembro');
    assert.equal(recibo.tipo, operacion);
    assert.equal(recibo.pertenenciaId, s.documentos.get('usuarios_globales/miembro').pertenenciaId);
    assert.equal(recibo.iglesiaId, resultado.iglesiaId);
    assert.equal(recibo.fechaCreacion, 'fecha-servidor');
    assert.match(recibo.huella, /^[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(JSON.stringify(recibo.resultado)), JSON.parse(JSON.stringify(resultado)));
  });

  test(`${operacion} repetida después de salir no reingresa; nueva clave permite intención nueva`, async () => {
    const s = escenarioIngreso();
    await s[operacion]({ solicitudId });
    const idAnterior = s.documentos.get('usuarios_globales/miembro').pertenenciaId;
    simularSalida(s);
    const trasSalida = structuredClone(s.documentos);
    await assert.rejects(s[operacion]({ solicitudId }), { code: 'failed-precondition' });
    assert.deepEqual(s.documentos, trasSalida);
    await s[operacion]({ solicitudId: 'solicitud_ingreso_0002',
      ...(operacion === 'crear' ? { codigo: 'OTRA' } : {}),
    });
    assert.notEqual(s.documentos.get('usuarios_globales/miembro').pertenenciaId, idAnterior);
    const reingreso = structuredClone(s.documentos);
    await assert.rejects(s[operacion]({ solicitudId }), { code: 'failed-precondition' });
    assert.deepEqual(s.documentos, reingreso);
    assert.equal(recibos(s).length, 2);
  });

  test(`${operacion} rechaza reutilización con parámetros distintos`, async () => {
    const s = escenarioIngreso();
    await s[operacion]({ solicitudId });
    const confirmado = structuredClone(s.documentos);
    for (const cambios of [{ codigo: 'CAMBIADO' }, { email: 'otro@example.invalid' }, { fotoUrl: 'otra' },
      operacion === 'crear' ? { nombreIglesia: 'Otra' } : { descripcion: 'Otra' }]) {
      await assert.rejects(s[operacion]({ solicitudId, ...cambios }), { code: 'invalid-argument' });
    }
    assert.deepEqual(s.documentos, confirmado);
  });

  test(`${operacion} identificada concurrente devuelve un único resultado y recibo`, async () => {
    const s = escenarioIngreso();
    const resultados = await Promise.all([s[operacion]({ solicitudId }), s[operacion]({ solicitudId })]);
    assert.deepEqual(structuredClone(resultados[0]), structuredClone(resultados[1]));
    assert.equal(recibos(s).length, 1);
    assert.equal([...s.documentos.keys()].filter((ruta) => ruta.startsWith('iglesias/nueva-')).length,
      operacion === 'crear' ? 1 : 0);
  });

  for (const falla of ['fallaPerfil', 'fallaRecibo', 'fallaCommit']) {
    test(`${operacion} identificada con ${falla} no deja escrituras parciales`, async () => {
      const s = escenarioIngreso({ [falla]: true });
      await assert.rejects(s[operacion]({ solicitudId }), /fallo-/);
      assert.deepEqual(s.documentos, s.inicial);
    });
  }

  test(`${operacion} valida clave presente sin normalizarla ni crear recibos inválidos`, async () => {
    const s = escenarioIngreso();
    for (const solicitudId of [null, undefined, '', 42, {}, [], 'a'.repeat(15), 'a'.repeat(129),
      'a/b'.repeat(8), ` ${'a'.repeat(16)}`, `${'a'.repeat(16)}\n`, '__reservado______']) {
      // El identificador reservado también se rechaza como doc ID de Firestore.
      await assert.rejects(s[operacion]({ solicitudId }), { code: 'invalid-argument' });
    }
    assert.deepEqual(s.documentos, s.inicial);
  });

  test(`${operacion} no almacena código ni datos personales en recibos ni confía en actor enviado`, async () => {
    const s = escenarioIngreso();
    const resultado = await s[operacion]({ solicitudId, codigo: operacion === 'crear' ? 'NUEVO' : 'CODIGO',
      email: 'privado@example.invalid', nombre: 'Persona privada', nombreAdmin: 'Persona privada',
      descripcion: 'Texto privado', descripcionAdmin: 'Texto privado',
      uid: 'falsificado', rolGlobal: 'admin_iglesia',
    });
    const recibo = recibos(s)[0][1];
    const serializado = JSON.stringify(recibo);
    for (const texto of ['CODIGO', 'NUEVO', 'privado@example.invalid', 'Persona privada', 'Texto privado', 'falsificado']) {
      assert.ok(!serializado.includes(texto));
    }
    assert.deepEqual(Object.keys(recibo).sort(), [
      'version', 'uid', 'tipo', 'huella', 'iglesiaId', 'pertenenciaId', 'resultado', 'fechaCreacion',
    ].sort());
    assert.equal(s.documentos.get('usuarios_globales/miembro').iglesiaId, resultado.iglesiaId);
    assert.equal(s.documentos.get('usuarios_globales/miembro').rolGlobal,
      operacion === 'crear' ? 'admin_iglesia' : 'servidor');
  });
}

test('Clave no se reutiliza entre vinculación y creación; UID tiene espacio propio', async () => {
  const s = escenarioIngreso();
  await s.vincular({ solicitudId });
  await assert.rejects(s.crear({ solicitudId }), { code: 'invalid-argument' });
  await s.vincular({ solicitudId }, { uid: 'otra-persona' });
  assert.equal(recibos(s).length, 2);
});

test('Repetición reconoce parámetros normalizados y no depende de que siga disponible el código', async () => {
  const s = escenarioIngreso();
  const resultado = await s.vincular({ solicitudId, nombre: ' Ana ' });
  s.documentos.set('iglesias/iglesia', { codigoAcceso: 'RETIRADO', adminUid: '' });
  assert.deepEqual(structuredClone(await s.vincular({ solicitudId, codigo: 'CODIGO', nombre: 'Ana' })),
    structuredClone(resultado));
});

test('Perfil legado ya vinculado sin ID no se migra ni recibe recibo', async () => {
  const s = escenarioIngreso({ documentos: {
    'usuarios_globales/miembro': { iglesiaId: 'iglesia', rolGlobal: 'servidor' },
  } });
  await assert.rejects(s.vincular({ solicitudId }), { code: 'failed-precondition' });
  assert.deepEqual(s.documentos, s.inicial);
});

test('Sin clave se conserva la vía antigua, sin recibo y sin protección frente a reenvío tardío', async () => {
  const s = escenarioIngreso();
  await s.vincular();
  simularSalida(s);
  await s.vincular();
  assert.equal(recibos(s).length, 0);
});
