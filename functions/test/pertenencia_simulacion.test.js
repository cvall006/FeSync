const test = require('node:test');
const assert = require('node:assert/strict');
const { simularPertenencias, verificarEntornoEmulador } = require('../migraciones/pertenencia_simulacion');

function escenario(cantidad = 5) {
  const documentos = Array.from({ length: cantidad }, (_, i) => ({
    id: `usuario-${String(i).padStart(3, '0')}`, version: '1:0',
    perfil: { iglesiaId: 'iglesia', rolGlobal: 'servidor', nombre: 'PERSONAL_PRIVADO' },
  }));
  const llamadas = [];
  const lector = {
    async listarPerfiles({ despuesDe, limite }) {
      llamadas.push({ despuesDe, limite });
      return documentos.filter((d) => despuesDe === null || d.id > despuesDe).slice(0, limite);
    },
    async leerPerfil(id) { return structuredClone(documentos.find((d) => d.id === id) ?? null); },
    async leerIglesia(id) { return { id, existe: true, adminUid: 'titular' }; },
  };
  return { lector, documentos, llamadas };
}

test('Paginación exclusiva contabiliza todos los candidatos sin duplicados', async () => {
  const s = escenario();
  const resultado = await simularPertenencias({ lector: s.lector, tamanoPagina: 2 });
  assert.equal(resultado.perfiles, 5);
  assert.equal(resultado.porCategoria.candidato, 5);
  assert.equal(resultado.paginas, 3);
  assert.equal(resultado.completa, true);
  assert.deepEqual(s.llamadas.map((c) => c.despuesDe), [null, 'usuario-001', 'usuario-003']);
});

test('Reutiliza clasificación de omitidos, IDs existentes, iglesia ausente y administración', async () => {
  const s = escenario(7);
  s.documentos[0].perfil = {};
  s.documentos[1].perfil.pertenenciaId = 'a'.repeat(64);
  s.documentos[2].perfil.pertenenciaId = null;
  s.documentos[3].perfil.iglesiaId = 'ausente';
  s.documentos[4].perfil.rolGlobal = 'admin_iglesia';
  s.documentos[5].perfil.rolGlobal = 'desconocido';
  s.lector.leerIglesia = async (id) => ({ id, existe: id !== 'ausente', adminUid: 'titular' });
  const r = await simularPertenencias({ lector: s.lector });
  assert.deepEqual(r.porCategoria, { candidato: 1, omitido: 2, revision: 4, conflicto: 0 });
  for (const motivo of ['sin_pertenencia', 'identificador_existente_procedencia_no_acreditada',
    'identificador_existente_invalido', 'iglesia_inexistente', 'administracion_incoherente',
    'rol_no_reconocido', 'identificador_ausente']) assert.equal(r.porMotivo[motivo], 1);
});

test('Cambios concurrentes y documentos desaparecidos son observables', async () => {
  const s = escenario(2);
  s.lector.leerPerfil = async (id) => id.endsWith('000')
    ? { perfil: s.documentos[0].perfil, version: '2:0' } : null;
  s.lector.leerIglesia = () => assert.fail('No debe consultar iglesia');
  const r = await simularPertenencias({ lector: s.lector });
  assert.equal(r.porMotivo.version_modificada, 1);
  assert.equal(r.porMotivo.perfil_inexistente, 1);
});

test('Errores privados de perfil e iglesia se agregan sin convertirlos en ausencia', async () => {
  const s = escenario(2);
  const original = s.lector.leerPerfil;
  s.lector.leerPerfil = async (id) => {
    if (id.endsWith('000')) throw new Error('CORREO_SECRETO');
    return original(id);
  };
  s.lector.leerIglesia = async () => { throw new Error('TOKEN_SECRETO'); };
  const r = await simularPertenencias({ lector: s.lector });
  assert.equal(r.porMotivo.error_lectura_perfil, 1);
  assert.equal(r.porMotivo.error_lectura_iglesia, 1);
  assert.equal(JSON.stringify(r).includes('SECRETO'), false);
});

test('Fallo de paginación conserva métricas parciales y no afirma recorrido completo', async () => {
  const s = escenario(3);
  const listar = s.lector.listarPerfiles;
  s.lector.listarPerfiles = async (p) => {
    if (p.despuesDe !== null) throw new Error('ID_PRIVADO');
    return listar(p);
  };
  const r = await simularPertenencias({ lector: s.lector, tamanoPagina: 1 });
  assert.equal(r.perfiles, 1);
  assert.equal(r.completa, false);
  assert.equal(r.incidencias.error_paginacion, 1);
});

for (const [nombre, pagina] of [
  ['duplicados', [{ id: 'a' }, { id: 'a' }]],
  ['desorden', [{ id: 'b' }, { id: 'a' }]], ['no lista', {}],
  ['excesiva', Array.from({ length: 3 }, (_, i) => ({ id: String(i) }))],
  ['ID inválido', [{ id: 'a/b' }]],
  ['dispersa', new Array(1)],
]) {
  test(`Página ${nombre} se rechaza antes de procesar perfiles`, async () => {
    const s = escenario();
    s.lector.listarPerfiles = async () => pagina;
    s.lector.leerPerfil = () => assert.fail('No debe leer perfiles');
    const r = await simularPertenencias({ lector: s.lector, tamanoPagina: 2 });
    assert.equal(r.incidencias.pagina_invalida, 1);
    assert.equal(r.perfiles, 0);
  });
}

test('Cursor inicial es exclusivo y se rechaza un lector que lo repite', async () => {
  const s = escenario(3);
  const r = await simularPertenencias({ lector: s.lector, cursorInicial: 'usuario-001' });
  assert.equal(r.perfiles, 1);
  s.lector.listarPerfiles = async () => [s.documentos[1]];
  const invalido = await simularPertenencias({ lector: s.lector, cursorInicial: 'usuario-001' });
  assert.equal(invalido.incidencias.pagina_invalida, 1);
});

test('Conjunto vacío y múltiplo exacto terminan mediante página corta sin omisiones', async () => {
  for (const cantidad of [0, 4]) {
    const s = escenario(cantidad);
    const r = await simularPertenencias({ lector: s.lector, tamanoPagina: 2 });
    assert.equal(r.completa, true);
    assert.equal(r.perfiles, cantidad);
    assert.equal(r.paginas, cantidad === 0 ? 1 : 3);
  }
});

test('Orden documental usa UTF-8, sin depender de comparación regional', async () => {
  const s = escenario(3);
  for (const [i, id] of ['z', 'á', '😀'].entries()) s.documentos[i].id = id;
  const r = await simularPertenencias({ lector: s.lector, tamanoPagina: 2 });
  assert.equal(r.perfiles, 3);
  assert.equal(r.completa, true);
});

test('Límites de perfiles y páginas detienen lecturas, sin afirmar fin', async () => {
  for (const opciones of [{ maxPerfiles: 2 }, { maxPaginas: 1 }]) {
    const s = escenario(5);
    const r = await simularPertenencias({ lector: s.lector, tamanoPagina: 2, ...opciones });
    assert.equal(r.perfiles, 2);
    assert.equal(r.completa, false);
    assert.equal(r.incidencias.limite_alcanzado, 1);
    assert.equal(r.lecturas, 5);
  }
});

test('Configuración inválida no realiza lecturas', async () => {
  const s = escenario();
  for (const opciones of [{ tamanoPagina: 101 }, { maxPaginas: 101 }, { maxPerfiles: 10001 },
    { tamanoPagina: 0 }, { maxPaginas: NaN }, { maxPerfiles: 1.5 }, { cursorInicial: '' }]) {
    await assert.rejects(simularPertenencias({ lector: s.lector, ...opciones }), /inválida/);
  }
  assert.equal(s.llamadas.length, 0);
});

test('Sin versiones se exige revisión y no se consulta iglesia', async () => {
  const s = escenario(1);
  delete s.documentos[0].version;
  s.lector.leerIglesia = () => assert.fail('No debe consultar iglesia');
  const r = await simularPertenencias({ lector: s.lector });
  assert.equal(r.porMotivo.versiones_invalidas, 1);
});

test('Cero escrituras, mutaciones o datos individuales en resultados', async () => {
  const s = escenario();
  const antes = structuredClone(s.documentos);
  const lector = new Proxy(s.lector, {
    get(objeto, propiedad) {
      assert.ok(['listarPerfiles', 'leerPerfil', 'leerIglesia'].includes(propiedad));
      return objeto[propiedad];
    },
  });
  const r = await simularPertenencias({ lector });
  assert.deepEqual(s.documentos, antes);
  const serializado = JSON.stringify(r);
  for (const secreto of ['usuario-', 'PERSONAL_PRIVADO', 'titular', 'iglesia']) {
    assert.equal(serializado.includes(secreto), false);
  }
});

test('Guarda exige proyecto demo y hosts locales exactos', () => {
  const correcto = { proyecto: 'demo-fesync', firestoreHost: '127.0.0.1:8088' };
  assert.doesNotThrow(() => verificarEntornoEmulador(correcto));
  for (const cambios of [{ proyecto: 'fesync-real' }, { proyecto: undefined },
    { firestoreHost: undefined }, { firestoreHost: 'firestore.googleapis.com' },
    { firestoreHost: 'localhost:8088' }, { storageHost: 'storage.googleapis.com' }]) {
    assert.throws(() => verificarEntornoEmulador({ ...correcto, ...cambios }), /no autorizado/);
  }
});

for (const archivo of ['ejecutar_pruebas.js', 'integracion.test.js']) {
  test(`Ejecutor ${archivo} aborta ante proyecto real antes de inicializar SDKs`, () => {
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    const r = spawnSync(process.execPath,
      [path.join(__dirname, '../../test/pertenencia_migracion', archivo)], {
        env: { GCLOUD_PROJECT: 'proyecto-no-autorizado',
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088',
          FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9198' },
        encoding: 'utf8', timeout: 5000,
      });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Entorno de emuladores no autorizado/);
    assert.equal(r.stdout, '');
  });
}

test('No se solicita generador, Firebase, logs ni capacidades de escritura', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const modulo = { exports: {} };
  const contexto = vm.createContext({ module: modulo, Buffer,
    console: new Proxy({}, { get() { assert.fail('No debe registrar datos'); } }),
    require(nombre) {
      assert.equal(nombre, './pertenencia_plan');
      return require('../migraciones/pertenencia_plan');
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../migraciones/pertenencia_simulacion.js'), 'utf8'), contexto);
  const s = escenario();
  assert.equal((await modulo.exports.simularPertenencias({ lector: s.lector })).perfiles, 5);
});
