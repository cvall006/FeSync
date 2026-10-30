const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { clasificarPerfilPertenencia: clasificar } = require('../migraciones/pertenencia_plan');

function entrada(perfil = {}, iglesia = {}) {
  return {
    uid: 'miembro',
    perfil: { iglesiaId: 'iglesia', rolGlobal: 'servidor', ...perfil },
    iglesia: { id: 'iglesia', existe: true, adminUid: 'titular', ...iglesia },
  };
}

function comprobar(datos, categoria, motivo, estadoIdentificador = 'ausente') {
  const valor = clasificar(datos);
  assert.deepEqual(valor, { categoria, motivo, estadoIdentificador });
  assert.equal(Object.isFrozen(valor), true);
  return valor;
}

test('Perfil vinculado sin campo es candidato para roles no administrativos reconocidos', () => {
  for (const rolGlobal of ['servidor', 'lider_area']) {
    comprobar(entrada({ rolGlobal }), 'candidato', 'identificador_ausente');
  }
});

test('Sin clave iglesiaId se omite, incluso si queda un identificador de una pertenencia anterior', () => {
  comprobar({ uid: 'miembro', perfil: {} }, 'omitido', 'sin_pertenencia');
  comprobar({ uid: 'miembro', perfil: { pertenenciaId: 'a'.repeat(64) } },
    'omitido', 'sin_pertenencia', 'existente_formato_valido');
});

test('Administrador titular coherente es candidato sin que esto conceda permisos', () => {
  comprobar({ ...entrada({ rolGlobal: 'admin_iglesia' }), uid: 'titular' },
    'candidato', 'identificador_ausente');
});

test('Administrador anterior y titular con rol incompatible requieren revisión', () => {
  comprobar(entrada({ rolGlobal: 'admin_iglesia' }), 'revision', 'administracion_incoherente');
  comprobar({ ...entrada(), uid: 'titular' }, 'revision', 'administracion_incoherente');
});

for (const [nombre, pertenenciaId] of [
  ['null', null], ['undefined presente', undefined], ['vacío', ''], ['número', 1],
  ['booleano', true], ['mapa', {}], ['lista', []], ['corto', 'abc'],
  ['mayúsculas', 'A'.repeat(64)], ['no hexadecimal', 'z'.repeat(64)],
  ['espacios', ` ${'a'.repeat(64)}`], ['salto final', `${'a'.repeat(64)}\n`],
]) {
  test(`Identificador presente ${nombre} se conserva y exige revisión`, () => {
    const datos = entrada({ pertenenciaId });
    const antes = structuredClone(datos);
    comprobar(datos, 'revision', 'identificador_existente_invalido', 'existente_invalido');
    assert.deepEqual(datos, antes);
    assert.equal(Object.hasOwn(datos.perfil, 'pertenenciaId'), true);
  });
}

test('Identificador válido se omite sin acreditar procedencia ni devolver su valor', () => {
  const datos = entrada({ pertenenciaId: 'a'.repeat(64) });
  const antes = structuredClone(datos);
  comprobar(datos, 'omitido', 'identificador_existente_procedencia_no_acreditada',
    'existente_formato_valido');
  assert.deepEqual(datos, antes);
});

test('Iglesia inexistente se revisa; contexto de iglesia ausente no prueba inexistencia', () => {
  comprobar(entrada({}, { existe: false }), 'revision', 'iglesia_inexistente');
  const datos = entrada();
  delete datos.iglesia;
  comprobar(datos, 'revision', 'iglesia_no_verificable');
});

test('Documento de otra iglesia requiere revisión', () => {
  comprobar(entrada({}, { id: 'otra' }), 'revision', 'iglesia_no_coincidente');
});

test('Roles ausentes, desconocidos o con tipo incorrecto no generan candidatos', () => {
  for (const rolGlobal of [undefined, null, '', 'admin', 'Admin_iglesia', 1, {}]) {
    comprobar(entrada({ rolGlobal }), 'revision', 'rol_no_reconocido');
  }
  const datos = entrada();
  delete datos.perfil.rolGlobal;
  comprobar(datos, 'revision', 'rol_no_reconocido');
});

test('IglesiaId presente inválido no se interpreta como salida', () => {
  for (const iglesiaId of [undefined, null, '', ' ', ' otra', 'a/b', '.', '..', 1, {}]) {
    comprobar(entrada({ iglesiaId }), 'revision', 'iglesia_id_invalido');
  }
});

test('Administración incompleta y contexto de iglesia malformado se revisan', () => {
  for (const adminUid of [undefined, null, '', ' ', 'a/b', 1]) {
    comprobar(entrada({}, { adminUid }), 'revision', 'administracion_no_verificable');
  }
  for (const iglesia of [undefined, null, [], {}, { id: 'iglesia', existe: 'true' }]) {
    comprobar({ ...entrada(), iglesia }, 'revision', 'iglesia_no_verificable');
  }
});

test('Perfil inexistente o malformado no se confunde con perfil desvinculado', () => {
  comprobar({ ...entrada(), perfil: null }, 'revision', 'perfil_inexistente', 'no_evaluado');
  for (const perfil of [undefined, [], 'perfil', 1, new Date(0)]) {
    comprobar({ ...entrada(), perfil }, 'revision', 'perfil_invalido', 'no_evaluado');
  }
});

test('Entradas e identidad malformadas se rechazan sin datos personales', () => {
  for (const datos of [undefined, null, [], '', 1, {}, ...[
    '', ' ', 'a/b', '__reservado__', 1, 'a'.repeat(129),
  ].map((uid) => ({ ...entrada(), uid }))]) {
    comprobar(datos, 'revision', 'entrada_invalida', 'no_evaluado');
  }
});

test('Versiones distintas detectan conflicto sin inferir cuál período está vigente', () => {
  comprobar({ ...entrada(), versionEsperada: '100:000000001', versionActual: '100:000000002' },
    'conflicto', 'version_modificada');
});

test('Versiones iguales permiten clasificar; sin versiones no se afirma ausencia de concurrencia', () => {
  comprobar({ ...entrada(), versionEsperada: '1:2', versionActual: '1:2' },
    'candidato', 'identificador_ausente');
  comprobar(entrada(), 'candidato', 'identificador_ausente');
});

test('Versiones incompletas o inválidas requieren revisión', () => {
  for (const versiones of [
    { versionEsperada: '1' }, { versionActual: '1' },
    { versionEsperada: undefined, versionActual: undefined },
    { versionEsperada: null, versionActual: '1' },
    { versionEsperada: '', versionActual: '' },
    { versionEsperada: ' ', versionActual: ' ' },
    { versionEsperada: 1, versionActual: 1 },
  ]) comprobar({ ...entrada(), ...versiones }, 'revision', 'versiones_invalidas');
});

test('Determinismo, objetos congelados y ausencia de mutaciones en ejecuciones repetidas', () => {
  const datos = entrada({ preferencias: Object.freeze({ tema: 'oscuro' }) });
  Object.freeze(datos.perfil);
  Object.freeze(datos.iglesia);
  Object.freeze(datos);
  const inicial = structuredClone(datos);
  const esperado = clasificar(datos);
  for (let intento = 0; intento < 20; intento += 1) assert.deepEqual(clasificar(datos), esperado);
  assert.deepEqual(datos, inicial);
});

test('No se ejecutan getters ni se aceptan propiedades heredadas como datos observados', () => {
  let lecturas = 0;
  const perfil = Object.defineProperty({}, 'iglesiaId', { get() { lecturas += 1; return 'iglesia'; } });
  comprobar({ ...entrada(), perfil }, 'revision', 'perfil_invalido', 'no_evaluado');
  comprobar({ ...entrada(), perfil: Object.create({ iglesiaId: 'iglesia' }) },
    'revision', 'perfil_invalido', 'no_evaluado');
  assert.equal(lecturas, 0);
});

test('Métricas contienen exclusivamente etiquetas, sin identidad ni datos del perfil', () => {
  const datos = entrada({ nombre: 'NOMBRE_PRIVADO', email: 'CORREO_PRIVADO',
    pertenenciaId: 'b'.repeat(64), telefono: 'TELEFONO_PRIVADO' });
  const valor = clasificar(datos);
  assert.deepEqual(Object.keys(valor).sort(), ['categoria', 'estadoIdentificador', 'motivo']);
  const serializado = JSON.stringify(valor);
  for (const privado of [datos.uid, datos.iglesia.id, datos.iglesia.adminUid,
    datos.perfil.nombre, datos.perfil.email, datos.perfil.telefono, datos.perfil.pertenenciaId]) {
    assert.equal(serializado.includes(privado), false);
  }
});

test('Módulo no solicita Firebase, red, archivos, reloj ni aleatoriedad durante la clasificación', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../migraciones/pertenencia_plan.js'), 'utf8');
  const dependencias = [];
  const modulo = { exports: {} };
  // Solo el validador puro está disponible; no se expone el generador al módulo.
  const contexto = vm.createContext({
    module: modulo,
    require(nombre) {
      dependencias.push(nombre);
      assert.equal(nombre, '../pertenencia');
      return { pertenenciaIdValido: require('../pertenencia').pertenenciaIdValido };
    },
  });
  vm.runInContext(`Date = undefined; Math.random = undefined;\n${fuente}\n` +
    `module.exports.prueba = clasificarPerfilPertenencia({uid:'miembro',` +
    `perfil:{iglesiaId:'iglesia',rolGlobal:'servidor'},` +
    `iglesia:{id:'iglesia',existe:true,adminUid:'titular'}});`, contexto);
  assert.equal(modulo.exports.prueba.categoria, 'candidato');
  assert.deepEqual(dependencias, ['../pertenencia']);
});
