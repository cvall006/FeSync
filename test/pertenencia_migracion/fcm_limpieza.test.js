const { verificarEntorno } = require('../desvinculacion_integracion/entorno');
verificarEntorno(); // Antes de importar SDKs y abrir conexiones.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const iglesia = 'fcm-ficticia';
let db;
before(() => {
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
});
after(async () => { if (db) await db.terminate(); });


// La limpieza se invoca directamente contra Firestore emulado; FCM sigue bloqueado.
for (const legacy of [false, true]) {
  test(`FCM tardío emulado: ${legacy ? 'legado' : 'dispositivo'} conserva token renovado`, async () => {
    const { limpiarTokenSiCoincide } = require('../../functions/fcm_limpieza');
    const usuarioRef = db.doc(`usuarios_globales/fcm-ficticio-${legacy}`);
    const dispositivoRef = usuarioRef.collection('dispositivos').doc('ficticio');
    const ref = legacy ? usuarioRef : dispositivoRef;
    const campo = legacy ? 'fcmToken' : 'token';
    await usuarioRef.set({ iglesiaId: iglesia, rolGlobal: 'servidor' });
    await ref.set({ [campo]: 'TOKEN_NUEVO_FICTICIO', activo: true }, { merge: true });
    const antes = await ref.get();
    const destino = { token: 'TOKEN_ANTERIOR_FICTICIO', usuarioRef, legacy,
      dispositivoRef: legacy ? null : dispositivoRef };
    await limpiarTokenSiCoincide(destino, { db, FieldValue });
    const despues = await ref.get();
    assert.deepEqual(despues.data(), antes.data());
    assert.ok(despues.updateTime.isEqual(antes.updateTime));
    await limpiarTokenSiCoincide({ ...destino, token: 'TOKEN_NUEVO_FICTICIO' }, { db, FieldValue });
    const final = await ref.get();
    if (legacy) {
      assert.equal(Object.hasOwn(final.data(), campo), false);
      assert.equal(final.data().iglesiaId, iglesia);
    } else assert.equal(final.exists, false);
  });
}
