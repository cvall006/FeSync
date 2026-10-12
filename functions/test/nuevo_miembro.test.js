const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function escenario(opciones = {}) {
  const enviados = [];
  const secuencia = [];
  const limpiados = [];
  let vinculado = false;
  const usuarios = {
    nuevo: opciones.yaVinculado ? { iglesiaId: 'iglesia' } : {},
    admin: { iglesiaId: opciones.adminOtraIglesia ? 'otra' : 'iglesia', fcmToken: 'legacy' },
    otro: { iglesiaId: 'iglesia', fcmToken: 'token-otro' },
  };
  const usuarioRef = (uid) => ({
    async get() { return { exists: !!usuarios[uid], data: () => usuarios[uid], ref: usuarioRef(uid) }; },
    async set(datos) {
      secuencia.push('guardar');
      if (opciones.fallaGuardado) throw new Error('Firestore failed');
      usuarios[uid] = { ...usuarios[uid], ...datos };
      vinculado = true;
    },
    async update(datos) { limpiados.push({ uid, datos }); },
    collection(nombre) {
      assert.equal(nombre, 'dispositivos');
      return { where(campo, operador, activo) {
        assert.equal(campo, 'activo'); assert.equal(operador, '=='); assert.equal(activo, true);
        return { async get() {
          return { docs: uid === 'admin' ? [
            { data: () => ({ token: 'device' }), ref: { async delete() { limpiados.push('device'); } } },
            { data: () => ({ token: 'legacy' }), ref: { async delete() {} } },
          ] : [] };
        } };
      } };
    },
  });
  const db = { collection(nombre) {
    if (nombre === 'usuarios_globales') return { doc: usuarioRef };
    assert.equal(nombre, 'iglesias');
    return { where(campo, operador, codigo) {
      assert.equal(campo, 'codigoAcceso'); assert.equal(operador, '=='); assert.equal(codigo, 'CODIGO');
      return { limit() { return { async get() { return {
        empty: !!opciones.codigoInvalido,
        docs: [{ id: 'iglesia', data: () => ({ adminUid: opciones.adminUid ?? 'admin' }) }],
      }; } }; } };
    } };
  } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const imports = {
    'firebase-functions/v2/firestore': { onDocumentCreated: (...args) => args.at(-1), onDocumentUpdated: (...args) => args.at(-1) },
    'firebase-functions/v2': { setGlobalOptions() {} },
    'firebase-functions/v2/https': { onCall: (handler) => handler, HttpsError },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { delete: () => 'delete', serverTimestamp: () => 'timestamp', increment: () => 'increment' } },
    'firebase-admin/messaging': { getMessaging: () => ({ async sendEachForMulticast(mensaje) {
      assert.equal(vinculado, true);
      secuencia.push('notificar');
      enviados.push(JSON.parse(JSON.stringify(mensaje)));
      if (opciones.fallaPush) throw new Error('FCM failed');
      return { successCount: opciones.tokenInvalido ? 1 : mensaje.tokens.length, failureCount: opciones.tokenInvalido ? 1 : 0,
        responses: mensaje.tokens.map((_, i) => opciones.tokenInvalido && i === 0
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true }) };
    } }) },
  };
  const sandbox = { exports: {}, require(nombre) { assert.ok(imports[nombre], nombre); return imports[nombre]; }, console: { log() {}, error() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'), sandbox);
  const ejecutar = (datos = {}) => sandbox.exports.vincularUsuarioConCodigo({ auth: { uid: 'nuevo' }, data: { codigo: 'codigo', email: 'privado@test.cl', ...datos } });
  return { ejecutar, enviados, secuencia, limpiados, salir() { delete usuarios.nuevo.iglesiaId; } };
}

test('Vinculación válida: solo admin de esa iglesia, tokens sin duplicar y sin correo', async () => {
  const s = escenario();
  const resultado = await s.ejecutar({ nombre: 'Ana', adminUid: 'otro' });
  assert.equal(resultado.ok, true);
  assert.deepEqual(s.secuencia, ['guardar', 'notificar']);
  assert.equal(s.enviados.length, 1);
  assert.deepEqual(s.enviados[0].tokens, ['device', 'legacy']);
  assert.deepEqual(s.enviados[0].notification, { title: 'Nuevo miembro en FeSync', body: 'Ana se ha registrado en tu iglesia.' });
  assert.deepEqual(s.enviados[0].data, { iglesiaId: 'iglesia', type: 'nuevo_miembro', tipo: 'nuevo_miembro', usuarioUid: 'nuevo' });
  assert.ok(!JSON.stringify(s.enviados).includes('privado@test.cl'));
});
test('Sin nombre usa el cuerpo de fallback', async () => {
  const s = escenario(); await s.ejecutar();
  assert.equal(s.enviados[0].notification.body, 'Un nuevo miembro se ha registrado en tu iglesia.');
});
for (const opciones of [{ adminUid: 'nuevo' }, { adminUid: '' }, { adminOtraIglesia: true }]) {
  test(`No notifica a sí mismo, sin administrador o fuera de iglesia: ${JSON.stringify(opciones)}`, async () => {
    const s = escenario(opciones); await s.ejecutar(); assert.equal(s.enviados.length, 0);
  });
}
for (const opciones of [{ codigoInvalido: true }, { fallaGuardado: true }, { yaVinculado: true }]) {
  test(`Vinculación fallida no notifica: ${JSON.stringify(opciones)}`, async () => {
    const s = escenario(opciones); await assert.rejects(s.ejecutar()); assert.equal(s.enviados.length, 0);
  });
}
test('Fallo FCM conserva una vinculación exitosa', async () => {
  const s = escenario({ fallaPush: true }); const resultado = await s.ejecutar();
  assert.equal(resultado.ok, true); assert.equal(s.enviados.length, 1);
});
test('Tokens inválidos se limpian con la infraestructura existente', async () => {
  const s = escenario({ tokenInvalido: true }); await s.ejecutar();
  assert.deepEqual(s.limpiados, ['device']);
});
test('Reingreso luego de salir puede notificar nuevamente', async () => {
  const s = escenario(); await s.ejecutar({ nombre: 'Reingreso' });
  s.salir(); await s.ejecutar({ nombre: 'Reingreso' });
  assert.equal(s.enviados.length, 2);
});
