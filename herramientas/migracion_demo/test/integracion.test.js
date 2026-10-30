const { validarEntorno } = require('../entorno'); validarEntorno();
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { cliente, preparar, foto, cp, usar, FieldValue } = require('./soporte');
let db;
before(() => { db = cliente(); });
after(async () => { await db.terminate(); });
beforeEach(async () => { await preparar(db); });
const demora = (ms) => new Promise((r) => setTimeout(r, ms));
function barrera() {
  let aviso, liberar;
  const esperando = new Promise((r) => { aviso = r; });
  const permiso = new Promise((r) => { liberar = r; });
  return { esperando, liberar, async esperar() { aviso(); await permiso; } };
}
const error = (codigo) => (e) => e.codigo === codigo;

test('Preflight, simulación y verificación inicial no escriben', async () => {
  const antes = await foto(db, true);
  await usar({}, async (t) => {
    assert.equal((await t.preflight()).proyecto, 'demo-fesync');
    const s = await t.simular();
    assert.equal(s.completa, true); assert.equal(s.porCategoria.candidato, 3);
    assert.equal(s.porCategoria.omitido, 2); assert.equal(s.porCategoria.revision, 1);
    assert.equal((await t.verificar()).completa, true);
  });
  assert.deepEqual(await foto(db, true), antes);
});
test('Aplicación conserva todos los auxiliares, iglesias y centinelas financieros', async () => {
  const antes = await foto(db);
  const r = await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  assert.equal(r.completa, true); assert.equal(r.metricas.migrados, 3);
  const despues = await foto(db);
  for (const a of antes) {
    const b = despues.find((x) => x.ruta === a.ruta); assert.ok(b);
    if (['usuarios_globales/lider_demo', 'usuarios_globales/miembro_demo', 'usuarios_globales/titular_demo'].includes(a.ruta)) {
      assert.match(b.datos.pertenenciaId, /^[a-f0-9]{64}$/);
      const { pertenenciaId, ...otros } = b.datos; assert.deepEqual(otros, a.datos);
      const c = despues.find((x) => x.ruta === `migraciones_pertenencia/${a.ruta.split('/')[1]}`);
      assert.equal(c.version, b.version); assert.equal(c.datos.pertenenciaId, pertenenciaId);
      assert.equal(c.datos.versionPerfilAnterior, a.version);
    } else assert.deepEqual(b, a);
  }
  assert.equal(despues.length, antes.length + 3);
  assert.equal((await cp(db).get()).data().propietario, null);
});
test('Repetición y repaso no renuevan IDs ni comprobantes; aplicar no sobreescribe checkpoint', async () => {
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  const antes = await foto(db);
  await usar({ lote: 20 }, async (t) => {
    assert.equal((await t.ejecutar('reanudar', 'ensayo')).metricas.migrados, 0);
    await assert.rejects(t.ejecutar('aplicar', 'ensayo'), error('CHECKPOINT_EXISTE'));
    assert.equal((await t.ejecutar('aplicar', 'repaso')).metricas.migrados, 0);
    const v = await t.verificar('ensayo');
    assert.equal(v.comprobantes.vigentes, 3); assert.equal(v.simulacion.porCategoria.candidato, 0);
    assert.equal(v.checkpoint.completa, true);
  });
  assert.deepEqual(await foto(db), antes);
});
test('Lote acotado se reanuda y el límite de simulación es explícito', async () => {
  const r = await usar({ lote: 1, limite: 1 }, async (t) => {
    assert.equal((await t.simular()).completa, false);
    return t.ejecutar('aplicar', 'ensayo');
  });
  assert.equal(r.metricas.procesados, 1); assert.equal(r.limiteAlcanzado, true);
  assert.equal((await usar({ lote: 20 }, (t) => t.ejecutar('reanudar', 'ensayo'))).completa, true);
});
test('Conflicto conserva selección/versiones originales y no avanza cursor al reintentar', async () => {
  await preparar(db, true);
  let original;
  const r = await usar({ ganchos: { async antesDeMotor() {
    original = (await cp(db).get()).data().pendiente;
    await db.doc('usuarios_globales/perfil_demo').update({ auxiliar: 'cambio_ficticio' });
  } } }, (t) => t.ejecutar('aplicar', 'ensayo'));
  assert.equal(r.detenida, true); assert.equal(r.metricas.conflictos, 1);
  const p = (await cp(db).get()).data(); assert.deepEqual(p.pendiente, original); assert.equal(p.cursor, null);
  const antes = await foto(db);
  const otro = await usar({}, (t) => t.ejecutar('reanudar', 'ensayo'));
  assert.equal(otro.metricas.conflictos, 1);
  assert.deepEqual((await cp(db).get()).data().pendiente, original);
  assert.deepEqual(await foto(db), antes);
});
for (const otraIglesia of [false, true]) {
  test(`Reingreso concurrente de fixture, otra iglesia=${otraIglesia}: no sobrescribe período nuevo`, async () => {
    await preparar(db, true);
    await db.doc('iglesias/otra_demo').set({ adminUid: 'titular_otro_demo' });
    let fotoPosterior;
    const r = await usar({ lote: 20, ganchos: { async antesDeMotor() {
      // Cambio de estado real en emulador; no se presenta como callable Auth/Functions.
      await db.doc('usuarios_globales/perfil_demo').update({ pertenenciaId: 'b'.repeat(64),
        iglesiaId: otraIglesia ? 'otra_demo' : 'iglesia_demo' });
      fotoPosterior = await foto(db);
    } } }, (t) => t.ejecutar('aplicar', 'ensayo'));
    assert.equal(r.metricas.migrados, 0); assert.equal(r.completa, true);
    assert.deepEqual(await foto(db), fotoPosterior);
  });
}
test('Comprobante existente impide reasignar un ID eliminado por escritor privilegiado', async () => {
  await preparar(db, true);
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  await db.doc('usuarios_globales/perfil_demo').update({ pertenenciaId: FieldValue.delete() });
  const antes = await foto(db);
  const r = await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'repaso'));
  assert.equal(r.detenida, true); assert.equal(r.metricas.revision, 1);
  assert.deepEqual(await foto(db), antes);
});
test('Dos coordinadores con checkpoints distintos conservan una sola asignación por perfil', async () => {
  const r = await Promise.all(['uno', 'dos'].map((n) => usar({ lote: 20 }, (t) => t.ejecutar('aplicar', n))));
  assert.ok(r.every((x) => x.completa));
  assert.equal((await db.collection('migraciones_pertenencia').get()).size, 3);
  assert.equal(r.reduce((s, x) => s + x.metricas.migrados, 0), 3);
});
test('Segundo operador no comparte checkpoint mientras la reserva está vigente', async () => {
  await preparar(db, true); const b = barrera();
  const tarea = usar({ ganchos: { antesDeMotor: b.esperar } }, (t) => t.ejecutar('aplicar', 'ensayo'));
  await b.esperando;
  try { await usar({}, (t) => assert.rejects(t.ejecutar('reanudar', 'ensayo'), error('CHECKPOINT_OCUPADO'))); }
  finally { b.liberar(); }
  await tarea;
});
test('Fencing: takeover tras vencimiento bloquea al operador anterior antes del motor', async () => {
  await preparar(db, true); const b = barrera();
  const tarea = usar({ reservaMs: 1000, ganchos: { antesDeMotor: b.esperar } },
    (t) => t.ejecutar('aplicar', 'ensayo'));
  // Instalar el rechazo antes de liberar la barrera evita un rechazo sin observador.
  const rechazado = assert.rejects(tarea, error('RESERVA_PERDIDA'));
  await b.esperando; const original = (await cp(db).get()).data().pendiente;
  await demora(1150);
  await usar({ lote: 20 }, (t) => t.ejecutar('reanudar', 'ensayo'));
  const antes = await foto(db, true);
  b.liberar(); await rechazado;
  assert.deepEqual(await foto(db, true), antes);
  assert.equal((await db.doc('migraciones_pertenencia/perfil_demo').get()).data().versionPerfilAnterior, original.version);
});
test('Caída real de proceso después del commit: reanuda desde selección persistida sin duplicar', { timeout: 30000 }, async () => {
  await preparar(db, true);
  const child = spawn(process.execPath, [path.join(__dirname, 'operador_fixture.js'), 'caida'],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let datos = '';
  const listo = new Promise((resolve, reject) => {
    child.stdout.on('data', (b) => { datos += b; if (datos.includes('COMMIT_DEMO_CONFIRMADO')) resolve(); });
    child.on('error', reject);
    child.on('exit', (code) => { if (!datos.includes('COMMIT_DEMO_CONFIRMADO')) reject(new Error(`Fixture terminó: ${code}`)); });
  });
  try {
    await Promise.race([listo, demora(15000).then(() => { throw new Error('Fixture no confirmó a tiempo.'); })]);
    const original = (await cp(db, 'caida').get()).data().pendiente;
    assert.ok(original);
    const antes = await db.doc('migraciones_pertenencia/perfil_demo').get();
    const salida = once(child, 'exit'); child.kill('SIGKILL'); await salida;
    await demora(1150);
    const r = await usar({ lote: 20 }, (t) => t.ejecutar('reanudar', 'caida'));
    assert.equal(r.completa, true); assert.equal(r.metricas.migrados, 0);
    const despues = await db.doc('migraciones_pertenencia/perfil_demo').get();
    assert.deepEqual(despues.data(), antes.data()); assert.ok(despues.updateTime.isEqual(antes.updateTime));
    assert.equal(despues.data().versionPerfilAnterior, original.version);
    assert.equal((await db.collection('migraciones_pertenencia').get()).size, 1);
  } finally { child.kill('SIGKILL'); }
});
test('Checkpoint corrupto o de otro motor se rechaza sin escribir perfiles', async () => {
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  const antes = await foto(db);
  await cp(db).update({ motorHash: '0'.repeat(64) });
  await usar({}, (t) => assert.rejects(t.ejecutar('reanudar', 'ensayo'), error('CHECKPOINT_INVALIDO')));
  assert.deepEqual(await foto(db), antes);
});
test('Verificación distingue comprobante histórico y no repara el perfil', async () => {
  await preparar(db, true);
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  await db.doc('usuarios_globales/perfil_demo').update({ pertenenciaId: 'c'.repeat(64) });
  const antes = await foto(db, true);
  const r = await usar({}, (t) => t.verificar('ensayo'));
  assert.equal(r.comprobantes.historicos, 1); assert.equal(r.comprobantes.vigentes, 0);
  assert.deepEqual(await foto(db, true), antes);
});
test('Cambiar entorno después de abrir el cliente detiene operaciones', async () => {
  await usar({}, async (t) => {
    const previo = process.env.GCLOUD_PROJECT;
    process.env.GCLOUD_PROJECT = 'real-no-autorizado';
    try { await assert.rejects(t.simular(), error('PROYECTO_PROHIBIDO')); }
    finally { process.env.GCLOUD_PROJECT = previo; }
  });
});
test('CLI solo emite métricas agregadas; no IDs de perfil, iglesia, checkpoint ni pertenencia', async () => {
  const c = spawn(process.execPath, [path.join(__dirname, '../cli.js'), 'simular'],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '', errores = '';
  c.stdout.on('data', (b) => { salida += b; }); c.stderr.on('data', (b) => { errores += b; });
  const [code] = await once(c, 'exit'); assert.equal(code, 0); assert.equal(errores, '');
  const d = JSON.parse(salida); assert.equal(d.resultado.porCategoria.candidato, 3);
  for (const privado of ['titular_demo', 'miembro_demo', 'iglesia_demo', 'Persona ficticia', 'encargadoUid']) {
    assert.ok(!salida.includes(privado));
  }
});
test('Checkpoint y comprobantes siguen privados con reglas reales y Auth sintético', async () => {
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  const r = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=ficticia',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
  assert.equal(r.ok, true); const { idToken } = await r.json();
  for (const ruta of ['herramienta_migracion_demo/ensayo', 'migraciones_pertenencia/miembro_demo']) {
    const url = `http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/${ruta}`;
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const d = await fetch(url, { method, headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        ...(method === 'PATCH' ? { body: '{"fields":{}}' } : {}) });
      assert.equal(d.status, 403);
    }
  }
});


test('Límites y opciones ajenas se rechazan sin tocar documentos', async () => {
  const antes = await foto(db, true);
  const { abrir } = require('../herramienta');
  for (const o of [{ lote: 0 }, { lote: 21 }, { limite: 0 }, { limite: 2001 },
    { reservaMs: 999 }, { reservaMs: 60001 }, { projectId: 'real-no-autorizado' },
    { db: {} }, { ganchos: { desconocido() {} } }]) {
    assert.throws(() => abrir(o), error('OPCIONES_INVALIDAS'));
  }
  assert.deepEqual(await foto(db, true), antes);
});

test('CLI completa los cinco modos y mantiene checkpoint entre procesos', async () => {
  await preparar(db, true);
  async function cli(args, esperado) {
    const c = spawn(process.execPath, [path.join(__dirname, '../cli.js'), ...args],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '', errores = '';
    c.stdout.on('data', (b) => { salida += b; }); c.stderr.on('data', (b) => { errores += b; });
    const [code] = await once(c, 'exit'); assert.equal(code, esperado); assert.equal(errores, '');
    return JSON.parse(salida).resultado;
  }
  assert.equal((await cli(['preflight'], 0)).proyecto, 'demo-fesync');
  assert.equal((await cli(['simular'], 0)).porCategoria.candidato, 1);
  assert.equal((await cli(['aplicar', '--checkpoint', 'cli-ensayo', '--lote', '1'], 2)).metricas.migrados, 1);
  const p = (await cp(db, 'cli-ensayo').get()).data(); assert.equal(p.pendiente, null);
  assert.equal((await cli(['verificar', '--checkpoint', 'cli-ensayo'], 2)).comprobantes.vigentes, 1);
  assert.equal((await cli(['reanudar', '--checkpoint', 'cli-ensayo'], 0)).metricas.migrados, 0);
  const antes = await foto(db);
  assert.equal((await cli(['verificar', '--checkpoint', 'cli-ensayo'], 0)).checkpoint.completa, true);
  assert.deepEqual(await foto(db), antes);
});


test('Verificación rechaza comprobante malformado sin reparar ni revelar contenido', async () => {
  await preparar(db, true);
  await usar({ lote: 20 }, (t) => t.ejecutar('aplicar', 'ensayo'));
  await db.doc('migraciones_pertenencia/perfil_demo').update({ fechaCreacion: 'METADATO_FICTICIO_INVALIDO' });
  const antes = await foto(db, true);
  const r = await usar({}, (t) => t.verificar('ensayo'));
  assert.equal(r.requiereRevision, true); assert.equal(r.comprobantes.revision, 1);
  assert.equal(r.comprobantes.vigentes, 0);
  assert.ok(!JSON.stringify(r).includes('METADATO_FICTICIO_INVALIDO'));
  assert.deepEqual(await foto(db, true), antes);
});


test('Dos procesos independientes no comparten un checkpoint reservado', { timeout: 30000 }, async () => {
  await preparar(db, true);
  const a = spawn(process.execPath, [path.join(__dirname, 'operador_fixture.js'), 'reserva'],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let salidaA = '';
  const listo = new Promise((resolve, reject) => {
    a.stdout.on('data', (b) => { salidaA += b; if (salidaA.includes('RESERVA_DEMO_ADQUIRIDA')) resolve(); });
    a.on('error', reject);
    a.on('exit', () => { if (!salidaA.includes('RESERVA_DEMO_ADQUIRIDA')) reject(new Error('Reserva de fixture no disponible.')); });
  });
  try {
    await Promise.race([listo, demora(15000).then(() => { throw new Error('Reserva no disponible a tiempo.'); })]);
    const antes = await foto(db, true);
    const b = spawn(process.execPath, [path.join(__dirname, '../cli.js'), 'reanudar', '--checkpoint', 'reserva'],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '', errores = '';
    b.stdout.on('data', (d) => { salida += d; }); b.stderr.on('data', (d) => { errores += d; });
    const [code] = await once(b, 'exit');
    assert.equal(code, 20); assert.equal(salida, '');
    assert.deepEqual(JSON.parse(errores), { error: 'CHECKPOINT_OCUPADO' });
    assert.deepEqual(await foto(db, true), antes);
  } finally {
    const fin = once(a, 'exit'); a.kill('SIGKILL'); await fin;
  }
});
