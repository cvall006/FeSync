'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
// Compatibilidad de identidades contra sus bytes históricos exactos. El rechazo
// del árbol de publicación actual se verifica en finanzas_consolidacion.test.js.
const historico = require('./soporte/runtime_historico').cargarHistorico();
const { obtenerContextoFuentes, verificarFuentes } = historico.cargar('contabilidad_demo/fuentes');
const DIR = historico.DIR;
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'fuentes_v1.json'), 'utf8'));
const sha = v => createHash('sha256').update(v).digest('hex');
const parametros = { iglesiaId: 'iglesia', ejecucionId: 'ejecucion' };
function pareja(legado = false) {
  const c = obtenerContextoFuentes();
  return [{ versionEsquema: 1, versionProcedimiento: 1, versionAlgoritmo: 1, ...parametros,
    epoca: 1, huellaSoftware: legado ? c.identidadHistorica : c.huellaSoftware, ...(legado ? {} : c.metadatos) },
  { versionEsquema: 2, versionProcedimiento: 1, versionAlgoritmo: 1, epoca: 1, activa: false,
    huellaSoftware: legado ? c.identidadHistorica : c.huellaSoftware, ...(legado ? {} : c.metadatos) }];
}
test('Fixture historica: V1 se reproduce con bytes originales y admin-6 tiene otra identidad', () => {
  const c = obtenerContextoFuentes(); assert.notEqual(c.huellaSoftware, c.identidadHistorica);
  const h = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/legado_1.json')));
  const f = createHash('sha256').update(JSON.stringify(base));
  for (const n of ['transicion.js', 'entorno.js', 'fuentes.js']) f.update(Buffer.from(h.archivos[n], 'base64'));
  assert.equal(f.digest('hex'), c.identidadHistorica); assert.equal(c.metadatos.inventarioId, 'admin-6');
});
for (const legado of [false, true]) test('Identidad acreditada sin mutar metadatos, legado=' + legado, () => {
  const [e, g] = pareja(legado), antes = structuredClone([e, g]);
  obtenerContextoFuentes().comprobarEjecucion(e, g, parametros); assert.deepEqual([e, g], antes);
});
for (const ruta of [...Object.keys(base), ...Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_6.json'))).adicionales)]) test('Archivo servidor acreditado alterado: ' + ruta, t => {
  const objetivo = path.resolve(historico.raiz, ruta), leer = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (r, ...args) => path.resolve(String(r)) === objetivo ?
    Buffer.concat([leer(r), Buffer.from('\n// alteracion virtual\n')]) : leer(r, ...args));
  assert.throws(verificarFuentes, e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
for (const archivo of ['fuentes.js', 'transicion.js', 'entorno.js']) test('Runtime alterado aunque declare misma version: ' + archivo, t => {
  const objetivo = path.join(DIR, archivo), leer = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (r, ...args) => path.resolve(String(r)) === objetivo ?
    Buffer.concat([leer(r), Buffer.from('\n// alteracion virtual\n')]) : leer(r, ...args));
  assert.throws(verificarFuentes, e => e.codigo === 'DEMO_RUNTIME_NO_ACREDITADO');
});
for (const archivo of ['runtime_2.json', 'runtime_3.json', 'runtime_4.json', 'runtime_5.json', 'runtime_6.json', 'cambios_identidad_2.json', 'legado_1.json']) test('Descriptor/contrato alterado: ' + archivo, t => {
  const objetivo = path.join(DIR, 'inventarios', archivo), leer = fs.readFileSync.bind(fs);
  t.mock.method(fs, 'readFileSync', (r, ...args) => {
    if (path.resolve(String(r)) !== objetivo) return leer(r, ...args);
    const v = JSON.parse(leer(r, 'utf8'));
    if (Array.isArray(v)) v[0][1] += '\n// cambio'; else if (archivo === 'legado_1.json') v.huellaSoftware = '0'.repeat(64); else v.contrato = 'economia-2-no-revisada';
    return Buffer.from(JSON.stringify(v));
  });
  assert.throws(verificarFuentes);
});
test('Inventario desconocido no se infiere por numero', () => {
  assert.throws(() => obtenerContextoFuentes('admin-999'), e => e.codigo === 'DEMO_INVENTARIO_DESCONOCIDO');
});
for (const [nombre, alterar] of [
  ['huella historica desconocida', (e, g) => { e.huellaSoftware = g.huellaSoftware = '0'.repeat(64); }],
  ['iglesia', e => { e.iglesiaId = 'otra'; }], ['epoca', e => { e.epoca = 2; }],
  ['algoritmo', e => { e.versionAlgoritmo = 2; }], ['procedimiento', e => { e.versionProcedimiento = 2; }],
  ['generacion activa', (_, g) => { g.activa = true; }],
  ['etiqueta parcial', e => { e.inventarioId = 'admin-2'; }],
  ['inventario falso', (e, g) => { e.inventarioId = g.inventarioId = 'falso'; e.versionContratoInventario = g.versionContratoInventario = 2; }],
]) test('Checkpoint historico alterado: ' + nombre, () => {
  const [e, g] = pareja(true); alterar(e, g);
  assert.throws(() => obtenerContextoFuentes().comprobarEjecucion(e, g, parametros), x => x.codigo === 'DEMO_IDENTIDAD_NO_COMPATIBLE');
});

function ampliarVirtualmente(t, acreditar) {
  const id = 'admin-fixture-3', nombre = 'finanzas_core/fixture_inventario.js', codigo = Buffer.from("'use strict';\n");
  const rutaVirtual = path.resolve(historico.raiz, nombre), carpeta = path.dirname(rutaVirtual);
  const leer = fs.readFileSync.bind(fs), listar = fs.readdirSync.bind(fs), stat = fs.lstatSync.bind(fs);
  const registro = JSON.parse(leer(path.join(DIR, 'inventarios/registro.json')));
  const d = JSON.parse(leer(path.join(DIR, 'inventarios/runtime_6.json')));
  d.id = id; d.adicionales = { ...d.adicionales, [nombre]: sha(codigo) }; d.compatibles = ['legado-1', 'admin-2', 'admin-3', 'admin-4', 'admin-5', 'admin-6'];
  const bytes = Buffer.from(JSON.stringify(d));
  if (acreditar) { registro.actual = id; registro.acreditados[id] = { archivo: 'runtime_fixture.json', sha256: sha(bytes) }; }
  t.mock.method(fs, 'readFileSync', (r, ...args) => {
    const p = path.resolve(String(r));
    if (p === rutaVirtual) return codigo;
    if (p === path.join(DIR, 'inventarios/registro.json')) return Buffer.from(JSON.stringify(registro));
    if (p === path.join(DIR, 'inventarios/runtime_fixture.json')) return bytes;
    return leer(r, ...args);
  });
  t.mock.method(fs, 'lstatSync', (r, ...args) => [rutaVirtual, path.join(DIR, 'inventarios/runtime_fixture.json')].includes(path.resolve(String(r))) ?
    { isSymbolicLink: () => false } : stat(r, ...args));
  t.mock.method(fs, 'readdirSync', (r, ...args) => {
    const a = listar(r, ...args);
    return path.resolve(String(r)) === carpeta ? [...a, { name: path.basename(rutaVirtual), isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }] : a;
  });
}
test('JS nuevo no acreditado rechaza (solo simulado en memoria)', t => {
  ampliarVirtualmente(t, false); assert.throws(verificarFuentes, e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('Ampliacion sintetica explicita y completa permite identidad anterior sin reetiquetar', t => {
  const [e, g] = pareja(false), antes = structuredClone([e, g]);
  ampliarVirtualmente(t, true); const c = obtenerContextoFuentes();
  assert.equal(c.metadatos.inventarioId, 'admin-fixture-3'); c.comprobarEjecucion(e, g, parametros);
  assert.deepEqual([e, g], antes);
});
test('V2 existente acreditado expresamente por admin-3, sin alterar descriptor admin-2', () => {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/registro.json')));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_3.json')));
  assert.equal(r.actual, 'admin-6'); assert.deepEqual(r.pendientes, []);
  assert.equal(d.adicionales['finanzas_core/adaptador_firestore_v2.js'],
    sha(fs.readFileSync(path.resolve(historico.raiz, 'finanzas_core/adaptador_firestore_v2.js'))));
  assert.equal(sha(fs.readFileSync(path.join(DIR, 'inventarios/runtime_2.json'))),
    'c4d3279e32bacb8514f54f076614dfe0d7505238e85f6b2789c5de4dc807e1a4');
});
test('Un contrato de parche distinto no se acredita actualizando solo descriptores y hashes', t => {
  const leer = fs.readFileSync.bind(fs), inv = path.join(DIR, 'inventarios');
  const cambios = JSON.parse(leer(path.join(inv, 'cambios_identidad_2.json')));
  const antes = cambios[0][1]; cambios[0][1] += '\nthrow new Error("runtime incompatible de prueba");';
  const transicion = Buffer.from(leer(path.join(DIR, 'transicion.js'), 'utf8').replace(antes, cambios[0][1]));
  const bytesCambios = Buffer.from(JSON.stringify(cambios));
  const d = JSON.parse(leer(path.join(inv, 'runtime_6.json')));
  d.administrativos['transicion.js'] = sha(transicion); d.sha256CambiosIdentidad = sha(bytesCambios);
  const bytesD = Buffer.from(JSON.stringify(d));
  const r = JSON.parse(leer(path.join(inv, 'registro.json'))); r.acreditados['admin-6'].sha256 = sha(bytesD);
  const virtual = new Map([[path.join(DIR,'transicion.js'),transicion], [path.join(inv,'cambios_identidad_2.json'),bytesCambios],
    [path.join(inv,'runtime_6.json'),bytesD], [path.join(inv,'registro.json'),Buffer.from(JSON.stringify(r))]]);
  t.mock.method(fs, 'readFileSync', (p, ...args) => virtual.get(path.resolve(String(p))) ?? leer(p,...args));
  assert.throws(verificarFuentes, e => e.codigo === 'DEMO_CONTRATO_INCOMPATIBLE');
});

function parejaAdmin2() {
  const d = fs.readFileSync(path.join(DIR, 'inventarios/runtime_2.json'));
  const f = createHash('sha256').update('fesync-inventario-runtime-2\0').update(d);
  for (const r of ['entorno.js', 'fuentes.js', 'transicion.js']) f.update(fs.readFileSync(path.join(DIR, r)));
  const h = f.digest('hex');
  assert.equal(h, '0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f');
  const [e, g] = pareja(false);
  for (const v of [e, g]) { v.inventarioId = 'admin-2'; v.huellaSoftware = h; }
  return [e, g];
}
test('admin-3 reproduce huella admin-2 y acepta su historia sin cambiar datos', () => {
  const [e, g] = parejaAdmin2(), antes = structuredClone([e, g]);
  obtenerContextoFuentes().comprobarEjecucion(e, g, parametros); assert.deepEqual([e, g], antes);
});
test('admin-2 es identidad historica compatible, no alias del runtime con 23 fuentes', () => {
  assert.throws(() => obtenerContextoFuentes('admin-2'), e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('admin-3 tiene huella propia y cubre exactamente base mas V2 y mismos JS administrativos', () => {
  const d2 = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_2.json')));
  const d3 = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_3.json')));
  assert.deepEqual(d3.administrativos, d2.administrativos); assert.deepEqual(d2.adicionales, {});
  assert.equal(Object.keys(base).length, 22); assert.equal(Object.keys(d3.adicionales).length, 1);
  assert.deepEqual(d3.compatibles, ['legado-1', 'admin-2']);
  const f = createHash('sha256').update('fesync-inventario-runtime-2\0').update(fs.readFileSync(path.join(DIR, 'inventarios/runtime_3.json')));
  for (const r of ['entorno.js', 'fuentes.js', 'transicion.js']) f.update(fs.readFileSync(path.join(DIR, r)));
  assert.equal(f.digest('hex'), '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c');
  assert.notEqual(verificarFuentes(), '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c');
});
for (const [nombre, cambiar] of [
  ['huella diferente', (e, g) => { e.huellaSoftware = g.huellaSoftware = 'a'.repeat(64); }],
  ['iglesia diferente', e => { e.iglesiaId = 'otra'; }],
  ['epoca diferente', e => { e.epoca = 2; }],
  ['procedimiento diferente', e => { e.versionProcedimiento = 2; }],
  ['inventario desconocido', (e, g) => { e.inventarioId = g.inventarioId = 'admin-no-acreditado'; }],
]) test('historia admin-2 incoherente rechaza: ' + nombre, () => {
  const [e, g] = parejaAdmin2(); cambiar(e, g);
  assert.throws(() => obtenerContextoFuentes().comprobarEjecucion(e, g, parametros),
    x => x.codigo === 'DEMO_IDENTIDAD_NO_COMPATIBLE');
});

test('admin-4 contiene exactamente las fuentes revisadas y tiene identidad propia', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_4.json')));
  const d3 = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_3.json')));
  assert.deepEqual(d.administrativos, d3.administrativos);
  assert.deepEqual(d.compatibles, ['legado-1', 'admin-2', 'admin-3']);
  assert.deepEqual(Object.keys(d.adicionales).sort(), ['finanzas_core/adaptador_firestore_v2.js',
    ...['entorno', 'fuente', 'modelo', 'preparacion', 'util'].map(n => `contabilidad_generaciones_v2_demo/${n}.js`)].sort());
  assert.notEqual(verificarFuentes(), '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7');
  const f = createHash('sha256').update('fesync-inventario-runtime-2\0').update(fs.readFileSync(path.join(DIR, 'inventarios/runtime_4.json')));
  for (const r of ['entorno.js', 'fuentes.js', 'transicion.js']) f.update(fs.readFileSync(path.join(DIR, r)));
  assert.equal(f.digest('hex'), '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7');
});
test('dependencias transitivas del preparador estan acreditadas; no imports dinamicos', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_4.json')));
  const mapa = { ...base, ...d.adicionales }, raiz = path.resolve(DIR, '..'), visitados = new Set();
  function visitar(ruta) {
    if (visitados.has(ruta)) return; visitados.add(ruta);
    assert.ok(Object.hasOwn(mapa, ruta), 'Dependencia no acreditada');
    const bytes = fs.readFileSync(path.join(raiz, ruta)); assert.equal(sha(bytes), mapa[ruta]);
    const fuente = bytes.toString('utf8'), imports = [...fuente.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
    assert.equal((fuente.match(/require\(/g) ?? []).length, imports.length);
    assert.equal(/\bimport\s*\(/.test(fuente), false);
    for (const [, nombre] of imports) {
      if (nombre.startsWith('node:')) { assert.ok(require('node:module').isBuiltin(nombre)); continue; }
      assert.ok(nombre.startsWith('.'));
      visitar(path.relative(raiz, require.resolve(path.resolve(raiz, path.dirname(ruta), nombre))).replaceAll('\\', '/'));
    }
  }
  visitar('contabilidad_generaciones_v2_demo/preparacion.js');
  assert.ok(visitados.has('pertenencia.js')); assert.ok(visitados.has('finanzas_core/autorizacion.js'));
});
test('admin-4 admite historia admin-3 exacta sin reetiquetar; admin-3 no es alias del arbol nuevo', () => {
  const [e, g] = pareja(false);
  for (const v of [e, g]) { v.inventarioId = 'admin-3'; v.huellaSoftware = '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c'; }
  const antes = structuredClone([e, g]); obtenerContextoFuentes().comprobarEjecucion(e, g, parametros);
  assert.deepEqual([e, g], antes);
  assert.throws(() => obtenerContextoFuentes('admin-3'), e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('compatibilidad admin-3 no se infiere si un descriptor no la declara', t => {
  const leer = fs.readFileSync.bind(fs), inv = path.join(DIR, 'inventarios');
  const d = JSON.parse(leer(path.join(inv, 'runtime_6.json'))); d.compatibles = ['legado-1', 'admin-2'];
  const bytes = Buffer.from(JSON.stringify(d)), r = JSON.parse(leer(path.join(inv, 'registro.json')));
  r.acreditados['admin-6'].sha256 = sha(bytes);
  t.mock.method(fs, 'readFileSync', (p, ...args) => path.resolve(String(p)) === path.join(inv, 'runtime_6.json') ? bytes :
    path.resolve(String(p)) === path.join(inv, 'registro.json') ? Buffer.from(JSON.stringify(r)) : leer(p, ...args));
  const [e, g] = pareja(false);
  for (const v of [e, g]) { v.inventarioId = 'admin-3'; v.huellaSoftware = '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c'; }
  assert.throws(() => obtenerContextoFuentes().comprobarEjecucion(e, g, parametros), e => e.codigo === 'DEMO_IDENTIDAD_NO_COMPATIBLE');
});
for (const [nombre, alterar] of [
  ['huella falsificada', (e, g) => { e.huellaSoftware = g.huellaSoftware = '0'.repeat(64); }],
  ['iglesia ajena', e => { e.iglesiaId = 'otra'; }],
  ['epoca distinta', e => { e.epoca = 2; }],
]) test('Checkpoint admin-4 alterado rechaza sin reinterpretar: ' + nombre, () => {
  const [e, g] = pareja(false);
  for (const v of [e, g]) { v.inventarioId = 'admin-4'; v.huellaSoftware = '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7'; }
  alterar(e, g);
  const antes = structuredClone([e, g]);
  assert.throws(() => obtenerContextoFuentes().comprobarEjecucion(e, g, parametros),
    error => error.codigo === 'DEMO_IDENTIDAD_NO_COMPATIBLE');
  assert.deepEqual([e, g], antes);
});

test('admin-5 acredita exactamente 34 fuentes sin cambiar descriptores anteriores', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_5.json')));
  const d4 = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_4.json')));
  assert.deepEqual(d.administrativos, d4.administrativos);
  assert.deepEqual(d.compatibles, ['legado-1', 'admin-2', 'admin-3', 'admin-4']);
  const nuevas = ['entorno', 'estado', 'evidencia', 'preparacion', 'runtime', 'verificacion']
    .map(n => `contabilidad_preparacion_acreditada_demo/${n}.js`);
  assert.deepEqual(Object.keys(d.adicionales).sort(), [...Object.keys(d4.adicionales), ...nuevas].sort());
  assert.equal(Object.keys({ ...base, ...d.adicionales }).length, 34);
  for (const [r, h] of Object.entries(d4.adicionales)) assert.equal(d.adicionales[r], h);
  assert.equal(huellaDescriptor('admin-5'), '175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720');
  assert.throws(() => verificarFuentes('admin-5'), e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
for (const [id, huella] of Object.entries({
  'admin-2': '0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f',
  'admin-3': '4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c',
  'admin-4': '1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7',
  'admin-5': '175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720',
})) test('admin-6 conserva identidad D2 original ' + id, () => {
  const bytes = fs.readFileSync(path.join(DIR, `inventarios/runtime_${id.at(-1)}.json`));
  const f = createHash('sha256').update('fesync-inventario-runtime-2\0').update(bytes);
  for (const n of ['entorno.js', 'fuentes.js', 'transicion.js']) f.update(fs.readFileSync(path.join(DIR, n)));
  assert.equal(f.digest('hex'), huella);
  const [e, g] = pareja(false); for (const v of [e, g]) { v.inventarioId = id; v.huellaSoftware = huella; }
  const antes = structuredClone([e, g]); obtenerContextoFuentes('admin-6').comprobarEjecucion(e, g, parametros);
  assert.deepEqual([e, g], antes);
  assert.throws(() => obtenerContextoFuentes(id), x => x.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('fuente admin-5 ausente rechaza sin aceptar subconjuntos', t => {
  const listar = fs.readdirSync.bind(fs), carpeta = path.resolve(historico.raiz, 'contabilidad_preparacion_acreditada_demo');
  t.mock.method(fs, 'readdirSync', (r, ...args) => {
    const entradas = listar(r, ...args);
    return path.resolve(String(r)) === carpeta ? entradas.filter(e => e.name !== 'runtime.js') : entradas;
  });
  assert.throws(verificarFuentes, e => e.codigo === 'DEMO_FUENTES_NO_ACREDITADAS');
});
test('cierre nuevo de 20 JS acreditado, con imports estaticos exactos', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_5.json'))), mapa = { ...base, ...d.adicionales };
  const raiz = path.resolve(DIR, '..'), vistos = new Set();
  function visitar(r) {
    if (vistos.has(r)) return; vistos.add(r); assert.ok(Object.hasOwn(mapa, r));
    const b = fs.readFileSync(path.join(raiz, r)); assert.equal(sha(b), mapa[r]);
    const s = b.toString(), imports = [...s.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
    assert.equal((s.match(/require\(/g) ?? []).length, imports.length); assert.equal(/\bimport\s*\(/.test(s), false);
    for (const [, n] of imports) {
      if (n.startsWith('node:')) { assert.ok(require('node:module').isBuiltin(n)); continue; }
      assert.ok(n.startsWith('.'));
      visitar(path.relative(raiz, require.resolve(path.resolve(raiz, path.dirname(r), n))).replaceAll('\\', '/'));
    }
  }
  visitar('contabilidad_preparacion_acreditada_demo/preparacion.js');
  visitar('contabilidad_preparacion_acreditada_demo/verificacion.js'); assert.equal(vistos.size, 20);
});
test('acreditar codigo no convierte la capacidad local ni acepta admin-6 como capacidad del preparador', () => {
  const { crearPreparador } = historico.cargar('contabilidad_preparacion_acreditada_demo/preparacion');
  assert.throws(() => crearPreparador({ runtime: obtenerContextoFuentes('admin-6'),
    db: new Proxy({}, { get() { assert.fail('No tocar DB sin capacidad local'); } }) }),
  e => e.message === 'E_RUNTIME_NO_AUTORIZADO');
});

function huellaDescriptor(id) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/registro.json')));
  const b = fs.readFileSync(path.join(DIR, 'inventarios', r.acreditados[id].archivo));
  assert.equal(sha(b), r.acreditados[id].sha256);
  const h = createHash('sha256').update('fesync-inventario-runtime-2\0').update(b);
  for (const n of ['entorno.js', 'fuentes.js', 'transicion.js']) h.update(fs.readFileSync(path.join(DIR, n)));
  return h.digest('hex');
}
test('admin-6 cubre exactamente las 39 fuentes y conserva los 34 hashes anteriores', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_6.json')));
  const anterior = JSON.parse(fs.readFileSync(path.join(DIR, 'inventarios/runtime_5.json')));
  assert.equal(d.versionContratoInventario, 2); assert.equal(d.contrato, 'identidad-2-economia-1');
  assert.deepEqual(d.administrativos, anterior.administrativos);
  assert.deepEqual(d.compatibles, ['legado-1', 'admin-2', 'admin-3', 'admin-4', 'admin-5']);
  const nuevas = ['estado', 'evidencia', 'preparacion', 'runtime', 'verificacion'].map(n => 'contabilidad_preparacion_v2_admin_demo/' + n + '.js');
  assert.deepEqual(Object.keys(d.adicionales).sort(), [...Object.keys(anterior.adicionales), ...nuevas].sort());
  assert.equal(Object.keys({...base,...d.adicionales}).length, 39);
  for (const [r,h] of Object.entries({...base,...anterior.adicionales})) assert.equal(sha(fs.readFileSync(path.resolve(DIR,'..',r))),h);
  assert.equal(verificarFuentes('admin-6'), huellaDescriptor('admin-6'));
  assert.equal(verificarFuentes('admin-6'), '16d281e09313a4a6f80f37b4d686d70fa5135e1e43e120ed91923bf5393b92e1');
});
test('capacidad admin-6 autentica del puente no es el contexto D2 ni una etiqueta', () => {
  const rt = historico.cargar('contabilidad_preparacion_v2_admin_demo/runtime');
  const cap = rt.autorizarAdministrativo({inventarioId:'admin-6'});
  const i = rt.exigirRuntime(cap,true); assert.equal(i.inventarioId,'admin-6');
  assert.equal(i.acreditacionAdministrativa,'ACREDITADA'); assert.equal(i.huellaSoftware,verificarFuentes());
  assert.throws(() => rt.exigirRuntime(obtenerContextoFuentes()), /E_RUNTIME_NO_AUTORIZADO/);
  assert.throws(() => rt.autorizarAdministrativo({inventarioId:'admin-6',huellaSoftware:i.huellaSoftware}), /E_RUNTIME_NO_AUTORIZADO/);
});
test('cierre del puente de 21 JS cubierto por admin-6 incluidos modulos administrativos', () => {
  const d = JSON.parse(fs.readFileSync(path.join(DIR,'inventarios/runtime_6.json')));
  const mapa = {...base,...d.adicionales,...Object.fromEntries(Object.entries(d.administrativos).map(([r,h])=>['contabilidad_demo/'+r,h]))};
  const raiz=path.resolve(DIR,'..'), vistos=new Set();
  function visitar(r) { if(vistos.has(r))return;vistos.add(r);assert.ok(mapa[r],r);
    const s=fs.readFileSync(path.join(raiz,r),'utf8');assert.equal(sha(Buffer.from(s)),mapa[r]);
    const imports=[...s.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
    assert.equal((s.match(/require\(/g)||[]).length,imports.length);assert.equal(/\bimport\s*\(/.test(s),false);
    for(const [,n]of imports)if(n.startsWith('node:'))assert.ok(require('node:module').isBuiltin(n));else {assert.ok(n.startsWith('.'));visitar(path.relative(raiz,require.resolve(path.resolve(raiz,path.dirname(r),n))).replaceAll('\\','/'));}
  }
  visitar('contabilidad_preparacion_v2_admin_demo/runtime.js');visitar('contabilidad_preparacion_v2_admin_demo/preparacion.js');visitar('contabilidad_preparacion_v2_admin_demo/verificacion.js');assert.equal(vistos.size,21);
});
