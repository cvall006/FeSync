// Entrada EXCLUSIVA de infraestructura de pruebas. Nunca desplegar.
const { verificarEntorno, CALLABLES } = require('../../../test/desvinculacion_integracion/entorno');
verificarEntorno(process.env, { runtime: true });

// FCM no tiene emulador. Bloqueo explícito incluso si una fixture añade un token.
// Los callables/Firestore/Auth NO se reemplazan por dobles.
const messagingPath = require.resolve('firebase-admin/messaging');
const messaging = require(messagingPath);
require.cache[messagingPath].exports = {
  ...messaging,
  getMessaging() { throw new Error('Firebase Messaging está prohibido en esta suite.'); },
};
const reales = require('../../index');
for (const nombre of CALLABLES) {
  if (!reales[nombre]?.__endpoint?.callableTrigger ||
      reales[nombre].__endpoint.region?.[0] !== 'southamerica-west1') {
    throw new Error('Callable real o región de prueba no disponibles.');
  }
  exports[nombre] = reales[nombre];
}
// No se exporta ningún trigger Firestore; preparar fixtures no envía avisos.
