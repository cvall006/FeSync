const { test } = require('node:test');
const assert = require('node:assert/strict');
const { limpiarTokenSiCoincide } = require('../fcm_limpieza');

for (const legacy of [false, true]) {
  for (const estado of ['original', 'renovado', 'ausente', 'eliminado', 'tipo_invalido']) {
    test(`FCM tardío: ${legacy ? 'legado' : 'dispositivo'} ${estado}`, async () => {
      const ref = {};
      const campo = legacy ? 'fcmToken' : 'token';
      const datos = { [campo]: estado === 'original' ? ' token-enviado ' :
        estado === 'renovado' ? 'token-nuevo' : estado === 'tipo_invalido' ? 123 : undefined };
      const escrituras = [];
      let transacciones = 0;
      const db = { async runTransaction(callback) {
        transacciones++;
        await callback({
          async get(r) {
            assert.equal(r, ref);
            assert.equal(escrituras.length, 0);
            return { exists: estado !== 'eliminado', data: () => datos };
          },
          delete(r) { assert.equal(r, ref); escrituras.push('delete'); },
          update(r, d) { assert.equal(r, ref); escrituras.push(d); },
        });
      } };
      await limpiarTokenSiCoincide({ token: 'token-enviado', legacy,
        ...(legacy ? { usuarioRef: ref } : { dispositivoRef: ref }),
      }, { db, FieldValue: { delete: () => 'DELETE' } });
      assert.equal(transacciones, 1);
      assert.deepEqual(escrituras, estado === 'original' ?
        legacy ? [{ fcmToken: 'DELETE', fcmTokenActualizado: 'DELETE' }] : ['delete'] : []);
    });
  }
}

test('FCM: reintento transaccional relee y conserva renovación concurrente', async () => {
  const escrituras = [];
  const ref = {};
  await limpiarTokenSiCoincide({ token: 'viejo', dispositivoRef: ref }, {
    db: { async runTransaction(callback) {
      for (const token of ['viejo', 'nuevo']) {
        const pendientes = [];
        await callback({
          async get() { return { exists: true, data: () => ({ token }) }; },
          delete() { pendientes.push('delete'); },
        });
        // El primer intento se descarta, como en un conflicto de Firestore.
        if (token === 'nuevo') escrituras.push(...pendientes);
      }
    } }, FieldValue: {},
  });
  assert.deepEqual(escrituras, []);
});

test('FCM: error transaccional no utiliza un borrado no condicionado', async () => {
  await assert.rejects(limpiarTokenSiCoincide({ token: 'viejo', dispositivoRef: {} }, {
    db: { async runTransaction() { throw new Error('fallo ficticio'); } }, FieldValue: {},
  }), /fallo ficticio/);
});
