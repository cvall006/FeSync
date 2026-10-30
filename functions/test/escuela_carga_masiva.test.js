'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escuelaCargarModulos } = require('../escuela_carga_masiva');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fecha = { toMillis: () => 1234 };
const ruta = 'iglesias/a/escuela_ciclos/c/asignaciones/';
function escenario() {
  const docs = new Map([
    ['usuarios_globales/admin', { iglesiaId: 'a', rolGlobal: 'admin_iglesia' }],
    ['usuarios_globales/ana', { iglesiaId: 'a', nombre: 'Ana' }],
    ['usuarios_globales/beto', { iglesiaId: 'a', nombre: 'Beto' }],
    ['iglesias/a/escuela_ciclos/c', { version: 1, estado: 'abierto' }],
    ...['m1', 'm2', 'm3'].map(m => ['iglesias/a/escuela_modulos/' + m, { titulo: m }]),
  ]);
  const writes = [];
  let perdida = false;
  const ref = path => ({ path, get: async () => ({ data: () => docs.get(path) }),
    collection: c => ({ doc: id => ref(`${path}/${c}/${id}`) }) });
  const db = { doc: ref, runTransaction: async fn => {
    const pendientes = [];
    const r = await fn({ get: r => r.get(), set: (r, d) => pendientes.push([r.path, d]) });
    for (const [p, d] of pendientes) { docs.set(p, d); writes.push(p); }
    if (perdida && pendientes.length) { perdida = false; throw Error('respuesta perdida tras commit'); }
    return r;
  } };
  const data = { iglesiaId: 'a', cicloId: 'c', hermanos: ['ana', 'beto'], confirmar: true,
    modulos: [{ moduloId: 'm1', estado: 'completado' }, { moduloId: 'm2', estado: 'en_curso' }, { moduloId: 'm3', estado: 'pendiente' }] };
  const ejecutar = (patch = {}, uid = 'admin') => escuelaCargarModulos({
    auth: uid ? { uid } : null, data: { ...data, ...patch },
  }, { db, HttpsError, ahora: () => fecha });
  return { docs, writes, ejecutar, perder: () => { perdida = true; } };
}
test('preview no escribe; múltiples hermanos/módulos/estados conservan historial y autor', async () => {
  const e = escenario();
  assert.equal((await e.ejecutar({ confirmar: false })).resultados.length, 6);
  assert.equal(e.writes.length, 0);
  const r = await e.ejecutar();
  assert.ok(r.resultados.every(r => r.resultado === 'creado'));
  for (const uid of ['ana', 'beto']) {
    const d = e.docs.get(ruta + uid);
    assert.equal(d.moduloId, 'm3');
    assert.equal(d.estado, 'pendiente');
    assert.deepEqual(d.historialModulos.map(r => r.estado), ['completado', 'en_curso']);
    assert.ok([...d.historialModulos, d].every(r => r.asignadoPor === 'admin' && r.asignadoEn === fecha));
  }
});
test('reintento e idénticos no escriben ni duplican', async () => {
  const e = escenario(); await e.ejecutar();
  const r = await e.ejecutar();
  assert.ok(r.resultados.every(r => r.resultado === 'omitido'));
  assert.equal(e.writes.length, 2);
});
test('conflictos de módulos actuales y archivados nunca se sobrescriben', async () => {
  const e = escenario(); await e.ejecutar();
  const antes = e.docs.get(ruta + 'ana');
  const r = await e.ejecutar({ modulos: [{ moduloId: 'm1', estado: 'pendiente' }, { moduloId: 'm3', estado: 'completado' }] });
  assert.ok(r.resultados.every(r => r.resultado === 'conflicto'));
  assert.equal(e.docs.get(ruta + 'ana'), antes);
  assert.equal(e.writes.length, 2);
});
test('respuesta perdida tras confirmar se concilia sin duplicar ni completar pendientes ajenos', async () => {
  const e = escenario(); e.perder();
  assert.equal((await e.ejecutar()).resultados.filter(r => r.resultado === 'error').length, 3);
  assert.ok((await e.ejecutar()).resultados.every(r => r.resultado === 'omitido'));
  assert.equal(e.writes.length, 2);
});
test('ciclo distinto puede reutilizar módulos sin tocar anteriores', async () => {
  const e = escenario(); await e.ejecutar();
  const previo = e.docs.get(ruta + 'ana');
  e.docs.set('iglesias/a/escuela_ciclos/otro', { version: 1, estado: 'abierto' });
  await e.ejecutar({ cicloId: 'otro' });
  assert.equal(e.docs.get(ruta + 'ana'), previo);
  assert.equal(e.docs.get('iglesias/a/escuela_ciclos/otro/asignaciones/ana').historialModulos.length, 2);
});
for (const actor of [null, 'ana', 'externo']) test('deniega actor ' + actor, async () => {
  const e = escenario();
  e.docs.set('usuarios_globales/externo', { iglesiaId: 'b', rolGlobal: 'admin_iglesia' });
  await assert.rejects(e.ejecutar({}, actor), err => ['unauthenticated', 'permission-denied'].includes(err.code));
  assert.equal(e.writes.length, 0);
});
test('líder vigente puede cargar; miembro externo se rechaza sin afectar a los demás', async () => {
  const e = escenario();
  e.docs.set('usuarios_globales/admin', { iglesiaId: 'a', rolGlobal: 'lider_area' });
  e.docs.set('usuarios_globales/beto', { iglesiaId: 'b' });
  const r = await e.ejecutar();
  assert.equal(r.resultados.filter(r => r.resultado === 'creado').length, 3);
  assert.equal(r.resultados.filter(r => r.resultado === 'error').length, 3);
  assert.ok(!e.docs.has(ruta + 'beto'));
});
test('cerrado/eliminado, módulo inexistente e historial incoherente no se alteran', async () => {
  for (const cambio of [
    e => e.docs.set('iglesias/a/escuela_ciclos/c', { version: 1, estado: 'cerrado' }),
    e => e.docs.set('iglesias/a/escuela_ciclos/c', { version: 1, estado: 'abierto', eliminado: true }),
    e => e.docs.delete('iglesias/a/escuela_modulos/m1'),
    e => { for (const u of ['ana', 'beto']) e.docs.set(ruta + u, { historialModulos: {} }); },
  ]) {
    const e = escenario(); cambio(e);
    assert.ok((await e.ejecutar()).resultados.every(r => r.resultado === 'error'));
    assert.equal(e.writes.length, 0);
  }
});
test('límites y entradas duplicadas o inválidas se rechazan antes de escribir', async () => {
  for (const patch of [{ hermanos: [] }, { hermanos: ['ana', 'ana'] },
    { hermanos: Array.from({length: 31}, (_, i) => 'u' + i) }, { cicloId: 'otro/x' },
    { modulos: [{ moduloId: 'm1', estado: 'aprobado' }] },
    { modulos: [{ moduloId: 'm1', estado: 'pendiente' }, { moduloId: 'm1', estado: 'pendiente' }] }]) {
    const e = escenario();
    await assert.rejects(e.ejecutar(patch), err => err.code === 'invalid-argument');
    assert.equal(e.writes.length, 0);
  }
});
