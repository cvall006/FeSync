'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../finanzas_core/categorias');
const categoria = (extra = {}) => ({ versionEsquema: 1, id: 'ofrendas', iglesiaId: 'iglesia',
  codigo: 'OFRENDAS', nombre: 'Ofrendas', naturaleza: 'ingreso', tipoIngreso: 'ofrendas',
  estado: 'activa', ...extra });
const uso = (extra = {}) => ({ iglesiaId: 'iglesia', categoriaId: 'ofrendas',
  huboMovimientos: false, solicitudesInciertas: 0, ...extra });
const cambio = (extra = {}) => ({ iglesiaId: 'iglesia', actual: categoria(), propuesta: categoria(),
  catalogo: [categoria()], estadoUso: uso(), ...extra });

for (const tipoIngreso of c.TIPOS_INGRESO) test(`Categoría de ingresos ${tipoIngreso}`, () => {
  assert.equal(c.crearCategoria({ iglesiaId: 'iglesia', categoria: categoria({ tipoIngreso }), catalogo: [] }).tipoIngreso, tipoIngreso);
});
test('Categorías iniciales son cuatro datos inmutables, sin generar documentos', () => {
  const iniciales = c.categoriasIngresoIniciales('iglesia');
  assert.deepEqual(iniciales.map(x => x.tipoIngreso), ['diezmos', 'ofrendas', 'donaciones', 'otros']);
  assert.equal(new Set(iniciales.map(x => x.codigo)).size, 4);
  assert.ok(Object.isFrozen(iniciales) && iniciales.every(Object.isFrozen));
  assert.deepEqual(iniciales, c.categoriasIngresoIniciales('iglesia'));
  assert.throws(() => c.categoriasIngresoIniciales(''));
});
test('Gastos admiten códigos y nombres configurables, sin tipo de ingreso', () => {
  const gasto = categoria({ id: 'mantencion', codigo: 'MANTENCION', nombre: 'Mantención del templo', naturaleza: 'gasto', tipoIngreso: null });
  assert.deepEqual(c.crearCategoria({ iglesiaId: 'iglesia', categoria: gasto, catalogo: [] }), gasto);
});
for (const [campo, valores] of Object.entries({
  id: ['', 'x/y', '__privado__', null], iglesiaId: ['otra', null], versionEsquema: ['1', 2],
  codigo: ['', 'ofrendas', ' OFRENDAS', 'OFRENDAS\n', 'X'.repeat(33), 'A/B', 'TRANSFERENCIA', 'APERTURA', 'AJUSTE'],
  nombre: ['', ' Ofrendas', 'Ofrendas ', 'x\n', 'x\u200b', 'e\u0301', 'x'.repeat(81), null],
  naturaleza: ['transferencia', 'apertura', 'ajuste', null], tipoIngreso: ['sueldo', null, 1],
  estado: ['eliminada', false, null],
})) for (const [i, valor] of valores.entries()) test(`Categoría rechaza ${campo} inválido ${i}`, () => {
  assert.throws(() => c.validarCategoria(categoria({ [campo]: valor }), 'iglesia'));
});
test('Datos incompletos, campos extra y getters se rechazan sin efectos secundarios', () => {
  for (const k of Object.keys(categoria())) {
    const p = categoria(); delete p[k]; assert.throws(() => c.validarCategoria(p, 'iglesia'));
  }
  for (const extra of [{ saldoMinor: 0 }, { rolGlobal: 'admin_iglesia' }, { descripcion: 'no prevista' }]) {
    assert.throws(() => c.validarCategoria(categoria(extra), 'iglesia'));
  }
  const p = categoria(); let llamadas = 0;
  Object.defineProperty(p, 'nombre', { enumerable: true, get() { llamadas++; return 'Nombre'; } });
  assert.throws(() => c.validarCategoria(p, 'iglesia')); assert.equal(llamadas, 0);
  assert.throws(() => c.validarCategoria(categoria({ naturaleza: 'gasto' }), 'iglesia'));
});
test('Catálogo rechaza ID o código repetidos, también si estaban archivados', () => {
  for (const otra of [categoria({ codigo: 'OTRA' }), categoria({ id: 'otra', estado: 'archivada' })]) {
    assert.throws(() => c.crearCategoria({ iglesiaId: 'iglesia', categoria: categoria(), catalogo: [otra] }));
  }
  for (const catalogo of [null, {}, [null], Array(1)]) {
    assert.throws(() => c.validarCatalogoCategorias(catalogo, 'iglesia'));
  }
  assert.throws(() => c.crearCategoria({ iglesiaId: 'iglesia', categoria: categoria({ estado: 'archivada' }), catalogo: [] }));
});
test('Catálogos independientes por iglesia; no se mezclan documentos ajenos', () => {
  assert.equal(c.categoriasIngresoIniciales('otra')[0].iglesiaId, 'otra');
  assert.throws(() => c.validarCatalogoCategorias([categoria({ iglesiaId: 'otra' })], 'iglesia'));
  assert.throws(() => c.actualizarCategoria(cambio({ estadoUso: uso({ iglesiaId: 'otra' }) })));
});
test('Naturaleza puede cambiar antes de uso; después del uso, incluso revertido, no', () => {
  const propuesta = categoria({ naturaleza: 'gasto', tipoIngreso: null });
  assert.equal(c.actualizarCategoria(cambio({ propuesta })).naturaleza, 'gasto');
  for (const estadoUso of [uso({ huboMovimientos: true }), uso({ solicitudesInciertas: 1 })]) {
    assert.throws(() => c.actualizarCategoria(cambio({ propuesta, estadoUso })), { codigo: 'CATEGORIA_USADA_INMUTABLE' });
  }
});
test('Tipo de ingreso histórico no se reinterpreta, pero se admite antes de usar', () => {
  const propuesta = categoria({ tipoIngreso: 'donaciones' });
  assert.equal(c.actualizarCategoria(cambio({ propuesta })).tipoIngreso, 'donaciones');
  assert.throws(() => c.actualizarCategoria(cambio({ propuesta, estadoUso: uso({ huboMovimientos: true }) })),
    { codigo: 'CATEGORIA_USADA_INMUTABLE' });
});
test('Identidad/código estables y catálogo observado deben corresponder al actual', () => {
  for (const extra of [{ id: 'nueva' }, { codigo: 'NUEVA' }, { iglesiaId: 'otra' }]) {
    assert.throws(() => c.actualizarCategoria(cambio({ propuesta: categoria(extra) })));
  }
  assert.throws(() => c.actualizarCategoria(cambio({ catalogo: [] })));
  assert.throws(() => c.actualizarCategoria(cambio({ catalogo: [categoria({ nombre: 'Nombre concurrente' })] })));
});
test('Archivar una categoría utilizada conserva historia y bloquea uso nuevo', () => {
  const entrada = cambio({ propuesta: categoria({ estado: 'archivada', nombre: 'Ofrendas históricas' }),
    estadoUso: uso({ huboMovimientos: true }) });
  const antes = structuredClone(entrada); const archivada = c.actualizarCategoria(entrada);
  assert.equal(archivada.estado, 'archivada'); assert.deepEqual(entrada, antes);
  assert.throws(() => c.categoriaParaNuevoMovimiento({ iglesiaId: 'iglesia', categoria: archivada, clase: 'ingreso' }),
    { codigo: 'CATEGORIA_ARCHIVADA' });
  assert.throws(() => c.actualizarCategoria(cambio({ actual: archivada, catalogo: [archivada] })),
    { codigo: 'CATEGORIA_ARCHIVO_TERMINAL' });
});
test('Archivar bloquea solicitudes inciertas y contexto de uso incompleto', () => {
  assert.throws(() => c.actualizarCategoria(cambio({ propuesta: categoria({ estado: 'archivada' }),
    estadoUso: uso({ solicitudesInciertas: 1 }) })), { codigo: 'CATEGORIA_CON_SOLICITUDES_INCIERTAS' });
  for (const estadoUso of [null, {}, uso({ huboMovimientos: null }), uso({ categoriaId: 'otra' }),
    uso({ solicitudesInciertas: -1 }), uso({ solicitudesInciertas: '0' }), uso({ solicitudesInciertas: 0.5 })]) {
    assert.throws(() => c.actualizarCategoria(cambio({ estadoUso })));
  }
});
test('Solo ingresos y gastos compatibles reciben categoría; no transferencias ni aperturas', () => {
  const p = { iglesiaId: 'iglesia', categoria: categoria(), clase: 'ingreso' };
  assert.equal(c.categoriaParaNuevoMovimiento(p).naturaleza, 'ingreso');
  for (const clase of ['gasto', 'transferencia', 'apertura', 'ajuste', null]) {
    assert.throws(() => c.categoriaParaNuevoMovimiento({ ...p, clase }));
  }
  assert.equal(c.categoriaParaNuevoMovimiento({ ...p, clase: 'gasto',
    categoria: categoria({ naturaleza: 'gasto', tipoIngreso: null }) }).naturaleza, 'gasto');
});
test('Concurrencia modelada: duplicado, primer uso y archivo se rechazan tras releer', () => {
  const creada = c.crearCategoria({ iglesiaId: 'iglesia', categoria: categoria(), catalogo: [] });
  assert.throws(() => c.crearCategoria({ iglesiaId: 'iglesia', categoria: categoria(), catalogo: [creada] }));
  const editar = cambio({ propuesta: categoria({ naturaleza: 'gasto', tipoIngreso: null }) });
  c.actualizarCategoria(editar);
  assert.throws(() => c.actualizarCategoria({ ...editar, estadoUso: uso({ huboMovimientos: true }) }));
  const archivada = c.actualizarCategoria(cambio({ propuesta: categoria({ estado: 'archivada' }) }));
  assert.throws(() => c.categoriaParaNuevoMovimiento({ iglesiaId: 'iglesia', categoria: archivada, clase: 'ingreso' }));
});
test('Determinismo, inmutabilidad y propiedades de unicidad por iglesia', () => {
  for (let n = 1; n <= 30; n++) {
    const lista = Object.freeze(Array.from({ length: n }, (_, i) => Object.freeze(categoria({ id: `c${i}`, codigo: `C_${i}` }))));
    const copia = structuredClone(lista); const validas = c.validarCatalogoCategorias(lista, 'iglesia');
    assert.deepEqual(lista, copia); assert.equal(validas.length, n);
    assert.equal(new Set(validas.map(x => x.codigo)).size, n);
    assert.ok(Object.isFrozen(validas) && validas.every(Object.isFrozen));
    assert.deepEqual(validas, c.validarCatalogoCategorias(lista, 'iglesia'));
  }
  const p = cambio(); Object.values(p).forEach(Object.freeze); Object.freeze(p);
  assert.ok(Object.isFrozen(c.actualizarCategoria(p)));
});
