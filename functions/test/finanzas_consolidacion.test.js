'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const raiz = path.resolve(__dirname,'..');

test('Consolidación: cierre de publicación y mantenimiento no importa rutas de pruebas ni fixtures', () => {
  const vistos = new Set();
  function visitar(archivo) {
    archivo = require.resolve(archivo);
    if(vistos.has(archivo)) return; vistos.add(archivo);
    assert.equal(archivo.startsWith(path.join(raiz,'test')+path.sep),false,archivo);
    const texto = fs.readFileSync(archivo,'utf8');
    const imports = [...texto.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
    assert.equal((texto.match(/require\(/g)||[]).length,imports.length,'Imports estáticos: '+archivo);
    assert.equal(/\bimport\s*\(/.test(texto),false);
    assert.equal(texto.includes('finanzas_mvp_fixtures'),false,'Sin inicializador demo: '+archivo);
    for(const [,nombre] of imports) if(nombre.startsWith('.')) visitar(path.resolve(path.dirname(archivo),nombre));
  }
  visitar(path.join(raiz,'finanzas_publicacion.js'));
  visitar(path.join(raiz,'finanzas_v1/mantenimiento.js'));
  assert.ok(vistos.has(path.join(raiz,'finanzas_core/proyecciones.js')));
  assert.ok(vistos.has(path.join(raiz,'finanzas_core/conciliacion.js')));
  assert.ok(vistos.has(path.join(raiz,'finanzas_core/autorizacion.js')));
});

test('Consolidación: rutas anteriores delegan a los mismos módulos; API incremental no expone inicialización', () => {
  for(const nombre of ['api','adaptador','catalogos','comun','mantenimiento']) {
    assert.equal(require('./finanzas_v1_incremental/'+nombre),require('../finanzas_v1/'+nombre));
  }
  const {crearApiIncremental} = require('../finanzas_v1/api');
  assert.deepEqual(Object.keys(crearApiIncremental({db:null})).sort(),['consultar','ejecutar']);
});

test('Árbol nuevo rechazado como admin-6: no hereda identidad ni capacidad histórica', () => {
  const {obtenerContextoFuentes} = require('../contabilidad_demo/fuentes');
  assert.throws(()=>obtenerContextoFuentes('admin-6'),e=>e.codigo==='DEMO_FUENTES_NO_ACREDITADAS');
  const {autorizarAdministrativo} = require('../contabilidad_preparacion_v2_admin_demo/runtime');
  assert.throws(()=>autorizarAdministrativo({inventarioId:'admin-6'}),e=>e.codigo==='DEMO_FUENTES_NO_ACREDITADAS');
});

test('Fixture admin-6 usa index original autorizado; no sustituye el index de publicación', () => {
  const {createHash} = require('node:crypto'),sha=b=>createHash('sha256').update(b).digest('hex');
  const original=fs.readFileSync(path.join(__dirname,'fixtures/index_admin6.js.txt'));
  const mapa=JSON.parse(fs.readFileSync(path.join(raiz,'contabilidad_demo/fuentes_v1.json')));
  assert.equal(sha(original),mapa['index.js']);
  assert.notEqual(sha(fs.readFileSync(path.join(raiz,'index.js'))),mapa['index.js']);
  const historico=require('./soporte/runtime_historico').cargarHistorico();
  assert.notEqual(historico.raiz,raiz);
  assert.equal(historico.identidad.huellaSoftware,'16d281e09313a4a6f80f37b4d686d70fa5135e1e43e120ed91923bf5393b92e1');
});
