// Limpieza conservadora post-envío. No envía mensajes ni cambia la membresía.
// El resultado tardío de FCM solo invalida el token que realmente se envió.
async function limpiarTokenSiCoincide(destino, { db, FieldValue }) {
  if (typeof destino.token !== 'string' || !destino.token) return;
  const ref = destino.dispositivoRef ?? (destino.legacy ? destino.usuarioRef : null);
  if (!ref) return;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const campo = destino.dispositivoRef ? 'token' : 'fcmToken';
    const actual = snapshot.data()?.[campo];
    if (typeof actual !== 'string' || actual.trim() !== destino.token) return;
    if (destino.dispositivoRef) transaction.delete(ref);
    else transaction.update(ref, {
      fcmToken: FieldValue.delete(),
      fcmTokenActualizado: FieldValue.delete(),
    });
  });
}

module.exports = { limpiarTokenSiCoincide };
