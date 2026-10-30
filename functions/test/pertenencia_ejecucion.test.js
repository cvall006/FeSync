const test = require('node:test');
const assert = require('node:assert/strict');
const { migrarPerfilPertenencia } = require('../migraciones/pertenencia_ejecucion');
const { pertenenciaIdValido } = require('../pertenencia');

function escenario(opciones = {}) {
  const documentos = new Map([
    ['usuarios_globales/miembro', { iglesiaId: 'iglesia', rolGlobal: 'servidor',
      nombre: 'NOMBRE_PRIVADO', email: 'CORREO_PRIVADO', preferencias: { tema: 'oscuro' } }],
    ['iglesias/iglesia', { adminUid: 'titular' }],
  ]);
  const versiones = new Map([...documentos.keys()].map((ruta) => [ruta, 1]));
  const eventos = [];
  let intentos = 0;
  let generados = 0;
  function cambiar(ruta, datos) {
    if (datos === null) documentos.delete(ruta);
    else documentos.set(ruta, structuredClone(datos));
    versiones.set(ruta, (versiones.get(ruta) ?? 0) + 1);
  }
  const db = {
    collection(nombre) {
      assert.ok(['usuarios_globales', 'iglesias', 'migraciones_pertenencia'].includes(nombre));
      return { doc: (id) => ({ path: `${nombre}/${id}` }) };
    },
    async runTransaction(callback, configuracion) {
      assert.equal(configuracion.maxAttempts, 5);
      for (let intento = 0; intento < 5; intento += 1) {
        intentos += 1;
        const lecturas = new Map();
        const pendientes = [];
        const resultado = await callback({
          async get(ref) {
            assert.equal(pendientes.length, 0, 'Lecturas siempre antes de escrituras');
            eventos.push(`leer:${ref.path}`);
            if (opciones.fallaLectura) throw new Error('DATOS_PRIVADOS');
            lecturas.set(ref.path, versiones.get(ref.path) ?? 0);
            const datos = structuredClone(documentos.get(ref.path));
            return { exists: documentos.has(ref.path), data: () => datos,
              updateTime: opciones.sinVersion ? undefined :
                { seconds: 1, nanoseconds: versiones.get(ref.path) ?? 0 } };
          },
          update(ref, datos) {
            eventos.push('update');
            assert.deepEqual(Object.keys(datos), ['pertenenciaId']);
            pendientes.push({ ref, datos, tipo: 'update' });
          },
          create(ref, datos) {
            eventos.push('create');
            if (opciones.fallaCrear) throw new Error('ERROR_PRIVADO');
            pendientes.push({ ref, datos, tipo: 'create' });
          },
        });
        if (intento === 0) opciones.antesConfirmar?.({ cambiar, documentos });
        if ([...lecturas].some(([ruta, version]) => version !== (versiones.get(ruta) ?? 0))) continue;
        if (opciones.reintentar && intento === 0) continue;
        if (opciones.fallaCommit) throw new Error('ERROR_PRIVADO');
        for (const { ref, tipo } of pendientes) {
          assert.equal(documentos.has(ref.path), tipo === 'update');
        }
        for (const { ref, datos, tipo } of pendientes) {
          cambiar(ref.path, tipo === 'update' ? { ...documentos.get(ref.path), ...datos } : datos);
        }
        return resultado;
      }
      throw new Error('Conflicto persistente');
    },
  };
  const parametros = { db, seleccion: { uid: 'miembro', iglesiaId: 'iglesia', version: '1:1' },
    FieldValue: { serverTimestamp() { eventos.push('timestamp'); return 'fecha-servidor'; } },
    generarId() { eventos.push('generar'); generados += 1; return generados.toString(16).padStart(64, '0'); },
  };
  return { documentos, cambiar, eventos, parametros, intentos: () => intentos,
    generados: () => generados, ejecutar: (extra = {}) => migrarPerfilPertenencia({ ...parametros, ...extra }) };
}

test('Migra legado y comprobante atómicamente conservando iglesia, rol y auxiliares', async () => {
  const s = escenario();
  const original = structuredClone(s.documentos.get('usuarios_globales/miembro'));
  const r = await s.ejecutar();
  const perfil = s.documentos.get('usuarios_globales/miembro');
  assert.equal(r.categoria, 'migrado');
  assert.deepEqual(perfil, { ...original, pertenenciaId: '1'.padStart(64, '0') });
  assert.deepEqual(s.documentos.get('migraciones_pertenencia/miembro'), {
    version: 1, origen: 'migracion_pertenencia_v1', iglesiaId: 'iglesia',
    pertenenciaId: perfil.pertenenciaId, versionPerfilAnterior: '1:1', fechaCreacion: 'fecha-servidor',
  });
  assert.deepEqual(r.metricas, { procesados: 1, migrados: 1, omitidos: 0,
    revision: 0, conflictos: 0, errores: 0 });
  assert.equal([...s.documentos.keys()].some((ruta) => ruta.startsWith('operaciones_ingreso/')), false);
});

test('Utiliza generador criptográfico existente por defecto', async () => {
  const s = escenario();
  assert.equal((await s.ejecutar({ generarId: undefined })).categoria, 'migrado');
  assert.equal(pertenenciaIdValido(s.documentos.get('usuarios_globales/miembro').pertenenciaId), true);
});

for (const [nombre, datos, categoria, motivo] of [
  ['desvinculado', {}, 'omitido', 'sin_pertenencia'],
  ['inexistente', null, 'revision', 'perfil_inexistente'],
  ['ID válido', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'a'.repeat(64) },
    'omitido', 'identificador_existente_procedencia_no_acreditada'],
  ...[null, '', 1, {}, 'incorrecto'].map((pertenenciaId, i) => [`ID inválido ${i}`,
    { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId }, 'revision', 'identificador_existente_invalido']),
  ['administrador incoherente', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia' },
    'revision', 'administracion_incoherente'],
  ['rol desconocido', { iglesiaId: 'iglesia', rolGlobal: 'otro' }, 'revision', 'rol_no_reconocido'],
]) {
  test(`${nombre} no se modifica ni genera identificador o comprobante`, async () => {
    const s = escenario();
    s.cambiar('usuarios_globales/miembro', datos);
    const antes = structuredClone(s.documentos);
    const r = await s.ejecutar();
    assert.equal(r.categoria, categoria);
    assert.equal(r.motivo, motivo);
    assert.equal(s.generados(), 0);
    assert.deepEqual(s.documentos, antes);
  });
}

test('Iglesia inexistente y administración incompleta requieren revisión sin escrituras', async () => {
  for (const iglesia of [null, {}, { adminUid: '' }]) {
    const s = escenario();
    s.cambiar('iglesias/iglesia', iglesia);
    assert.equal((await s.ejecutar()).categoria, 'revision');
    assert.equal(s.generados(), 0);
  }
});

test('Administrador titular coherente puede ser migrado sin cambiar rol', async () => {
  const s = escenario();
  s.documentos.set('usuarios_globales/miembro', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia' });
  s.documentos.set('iglesias/iglesia', { adminUid: 'miembro' });
  assert.equal((await s.ejecutar()).categoria, 'migrado');
  assert.equal(s.documentos.get('usuarios_globales/miembro').rolGlobal, 'admin_iglesia');
});

test('Doble ejecución con la misma selección omite sin duplicar comprobante', async () => {
  const s = escenario();
  await s.ejecutar();
  const antes = structuredClone(s.documentos);
  const r = await s.ejecutar();
  assert.equal(r.categoria, 'omitido');
  assert.equal(s.generados(), 1);
  assert.deepEqual(s.documentos, antes);
});

test('Dos ejecuciones concurrentes confirman solo una asignación', async () => {
  const s = escenario();
  const resultados = await Promise.all([s.ejecutar(), s.ejecutar()]);
  assert.deepEqual(resultados.map((r) => r.categoria).sort(), ['migrado', 'omitido']);
  assert.equal(resultados.reduce((total, r) => total + r.metricas.migrados, 0), 1);
  assert.equal(s.documentos.size, 3);
});

test('Selección obsoleta, cambio de iglesia y ausencia de updateTime impiden migrar', async () => {
  const s = escenario();
  assert.equal((await s.ejecutar({ seleccion: { ...s.parametros.seleccion, version: '1:0' } })).categoria,
    'conflicto');
  assert.equal((await s.ejecutar({ seleccion: { ...s.parametros.seleccion, iglesiaId: 'otra' } })).motivo,
    'iglesia_modificada');
  const sinVersion = escenario({ sinVersion: true });
  assert.equal((await sinVersion.ejecutar()).motivo, 'versiones_invalidas');
  assert.equal(s.generados() + sinVersion.generados(), 0);
});

for (const [nombre, perfil, categoria] of [
  ['salida', {}, 'omitido'],
  ['reingreso', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'b'.repeat(64) }, 'omitido'],
  ['cambio auxiliar', { iglesiaId: 'iglesia', rolGlobal: 'servidor', tema: 'nuevo' }, 'conflicto'],
]) {
  test(`${nombre} concurrente obliga a revalidar sin confirmar el ID descartado`, async () => {
    const s = escenario({ antesConfirmar({ cambiar }) { cambiar('usuarios_globales/miembro', perfil); } });
    const r = await s.ejecutar();
    assert.equal(r.categoria, categoria);
    assert.deepEqual(s.documentos.get('usuarios_globales/miembro'), perfil);
    assert.equal(s.documentos.has('migraciones_pertenencia/miembro'), false);
    assert.equal(s.intentos(), 2);
  });
}

test('Transferencia concurrente que vuelve incoherente el rol impide migrar', async () => {
  const s = escenario({ antesConfirmar({ cambiar }) {
    cambiar('iglesias/iglesia', { adminUid: 'miembro' });
  } });
  assert.equal((await s.ejecutar()).motivo, 'administracion_incoherente');
  assert.equal(s.documentos.has('migraciones_pertenencia/miembro'), false);
});

test('Reintento interno puede generar otro ID, pero solo confirma uno y cuenta una vez', async () => {
  const s = escenario({ reintentar: true });
  const r = await s.ejecutar();
  assert.equal(s.intentos(), 2);
  assert.equal(s.generados(), 2);
  assert.equal(r.metricas.procesados, 1);
  assert.equal(r.metricas.migrados, 1);
  assert.equal(s.documentos.get('usuarios_globales/miembro').pertenenciaId, '2'.padStart(64, '0'));
});

for (const falla of ['fallaCrear', 'fallaCommit', 'fallaLectura']) {
  test(`${falla} no deja cambios parciales ni expone errores privados`, async () => {
    const s = escenario({ [falla]: true });
    const antes = structuredClone(s.documentos);
    const r = await s.ejecutar();
    assert.equal(r.categoria, 'error');
    assert.equal(r.metricas.errores, 1);
    assert.deepEqual(s.documentos, antes);
    assert.equal(JSON.stringify(r).includes('PRIVADO'), false);
  });
}

test('Comprobante existente bloquea una nueva asignación si falta el ID', async () => {
  const s = escenario();
  s.documentos.set('migraciones_pertenencia/miembro', { version: 1 });
  const antes = structuredClone(s.documentos);
  assert.equal((await s.ejecutar()).motivo, 'comprobante_existente');
  assert.deepEqual(s.documentos, antes);
  assert.equal(s.generados(), 0);
});

test('Lecturas terminan antes de generación, timestamp y escrituras', async () => {
  const s = escenario();
  await s.ejecutar();
  assert.deepEqual(s.eventos, ['leer:usuarios_globales/miembro', 'leer:iglesias/iglesia',
    'leer:migraciones_pertenencia/miembro', 'generar', 'timestamp', 'update', 'create']);
});

test('Generador defectuoso falla sin escrituras', async () => {
  const s = escenario();
  const antes = structuredClone(s.documentos);
  assert.equal((await s.ejecutar({ generarId: () => 'incorrecto' })).categoria, 'error');
  assert.deepEqual(s.documentos, antes);
});

test('Resultado contiene solo etiquetas y métricas, sin datos personales o identificadores', async () => {
  const s = escenario();
  const r = await s.ejecutar();
  assert.deepEqual(Object.keys(r), ['categoria', 'motivo', 'metricas']);
  assert.equal(Object.isFrozen(r.metricas), true);
  for (const privado of ['miembro', 'iglesia', 'NOMBRE_PRIVADO', 'CORREO_PRIVADO', 'fecha-servidor']) {
    assert.equal(JSON.stringify(r).includes(privado), false);
  }
});

test('Configuración inválida se rechaza antes de utilizar db', async () => {
  const s = escenario();
  for (const extra of [{ db: undefined }, { FieldValue: {} }, { generarId: 1 },
    { seleccion: {} }, { seleccion: { ...s.parametros.seleccion, version: 'local' } },
    { seleccion: { ...s.parametros.seleccion, uid: 'a/b' } }]) {
    await assert.rejects(s.ejecutar(extra), /Configuración de ejecución inválida/);
  }
  assert.deepEqual(s.eventos, []);
});

for (const [nombre, entorno] of [
  ['proyecto real', { GCLOUD_PROJECT: 'no-autorizado', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' }],
  ['sin emulador', { GCLOUD_PROJECT: 'demo-fesync' }],
  ['host externo', { GCLOUD_PROJECT: 'demo-fesync', FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com' }],
]) {
  test(`Suite del motor rechaza ${nombre} antes de inicializar SDKs`, () => {
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    const r = spawnSync(process.execPath,
      [path.join(__dirname, '../../test/pertenencia_migracion/ejecucion.test.js')],
      { env: entorno, encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Entorno de emuladores no autorizado/);
    assert.equal(r.stdout, '');
  });
}
