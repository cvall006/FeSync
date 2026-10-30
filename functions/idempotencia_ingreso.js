const { createHash } = require('node:crypto');
const { pertenenciaIdValido } = require('./pertenencia');

function solicitudIdValido(valor) {
  return typeof valor === 'string' && valor.length >= 16 && valor.length <= 128 &&
    !/[^a-zA-Z0-9_-]/.test(valor) && !/^__.*__$/.test(valor);
}

function documentoIdValido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0 &&
    Buffer.byteLength(valor, 'utf8') <= 1500 && !valor.includes('/') &&
    valor !== '.' && valor !== '..' && !/^__.*__$/s.test(valor);
}

// Solo servidor. La clave identifica una intención; nunca autoriza el ingreso.
// Los parámetros deben ser strings normalizados por el callable, no request.data.
// Recibos privados bajo el deny general de firestore.rules, sin TTL: eliminarlos
// permitiría volver a ejecutar solicitudes antiguas. Conservarlos también tras
// salida/reingreso; cualquier limpieza futura necesita una marca permanente.
// La huella evita guardar códigos y datos personales en claro; no es cifrado.
function prepararIdempotenciaIngreso({ db, uid, datos, tipo, parametros, HttpsError }) {
  if (!Object.prototype.hasOwnProperty.call(datos ?? {}, 'solicitudId')) return null;
  const solicitudId = datos.solicitudId;
  if (!solicitudIdValido(solicitudId)) {
    throw new HttpsError('invalid-argument', 'El identificador de solicitud no es válido.');
  }
  const canonico = JSON.stringify(Object.keys(parametros).sort().map((clave) => [clave, parametros[clave]]));
  const huella = createHash('sha256').update(canonico).digest('hex');
  // El mismo espacio por UID detecta también reutilización entre ambos tipos.
  const ref = db.collection('operaciones_ingreso').doc(uid).collection('solicitudes').doc(solicitudId);
  return {
    async leer(transaction, perfil) {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const recibo = snapshot.data() ?? {};
      if (recibo.uid !== uid || recibo.tipo !== tipo || recibo.huella !== huella) {
        throw new HttpsError('invalid-argument', 'La solicitud ya se utilizó con otros parámetros.');
      }
      if (recibo.version !== 1 || !pertenenciaIdValido(recibo.pertenenciaId) ||
          typeof recibo.iglesiaId !== 'string' || !recibo.iglesiaId ||
          recibo.resultado?.ok !== true || recibo.resultado.iglesiaId !== recibo.iglesiaId ||
          !perfil.exists || perfil.data().iglesiaId !== recibo.iglesiaId ||
          perfil.data().pertenenciaId !== recibo.pertenenciaId) {
        throw new HttpsError('failed-precondition', 'La pertenencia de esta solicitud ya no está vigente.');
      }
      return { ok: true, iglesiaId: recibo.iglesiaId };
    },
    // Aplicar solo tras completar TODAS las lecturas del intento actual.
    registrar(transaction, { iglesiaId, pertenenciaId }, FieldValue) {
      transaction.create(ref, {
        version: 1, uid, tipo, huella, iglesiaId, pertenenciaId,
        resultado: { ok: true, iglesiaId },
        fechaCreacion: FieldValue.serverTimestamp(),
      });
    },
  };
}

// Consulta de reconciliación, no autorización financiera ni administrativa.
// Snapshot coherente de recibo y perfil, sin caché cliente ni escrituras.
// NO_VERIFICABLE no prueba que la operación no ocurrió y no permite crear otra
// intención automáticamente. Un perfil legado sin ID en la misma iglesia tampoco
// permite demostrar a qué período pertenece. La vigencia es solo al consultar.
async function consultarEstadoSolicitudIngreso(request, { db, HttpsError }) {
  const uid = request.auth?.uid;
  if (!documentoIdValido(uid) || uid.length > 128) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const datos = request.data;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !Object.hasOwn(datos, 'solicitudId') ||
      !Object.hasOwn(datos, 'tipo') || !solicitudIdValido(datos.solicitudId) ||
      !['vincular', 'crear'].includes(datos.tipo)) {
    throw new HttpsError('invalid-argument', 'Indica una solicitud y un tipo de ingreso válidos.');
  }
  try {
    const reciboRef = db.collection('operaciones_ingreso').doc(uid)
      .collection('solicitudes').doc(datos.solicitudId);
    const perfilRef = db.collection('usuarios_globales').doc(uid);
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reciboRef);
      if (!snapshot.exists) return { estado: 'NO_VERIFICABLE' };
      const recibo = snapshot.data() ?? {};
      if (recibo.uid !== uid) {
        throw new HttpsError('permission-denied', 'No se puede consultar esta solicitud.');
      }
      if (recibo.tipo !== datos.tipo) {
        throw new HttpsError('invalid-argument', 'El tipo no coincide con la solicitud registrada.');
      }
      if (recibo.version !== 1 || !documentoIdValido(recibo.iglesiaId) ||
          !pertenenciaIdValido(recibo.pertenenciaId) || !pertenenciaIdValido(recibo.huella) ||
          recibo.resultado?.ok !== true || recibo.resultado.iglesiaId !== recibo.iglesiaId) {
        return { estado: 'NO_VERIFICABLE' };
      }
      const perfilSnapshot = await transaction.get(perfilRef);
      if (!perfilSnapshot.exists) return { estado: 'CONFIRMADA_NO_VIGENTE' };
      const perfil = perfilSnapshot.data() ?? {};
      if (!Object.hasOwn(perfil, 'iglesiaId') || perfil.iglesiaId === null || perfil.iglesiaId === '') {
        return { estado: 'CONFIRMADA_NO_VIGENTE' };
      }
      if (!documentoIdValido(perfil.iglesiaId)) return { estado: 'NO_VERIFICABLE' };
      if (perfil.iglesiaId !== recibo.iglesiaId) return { estado: 'CONFIRMADA_NO_VIGENTE' };
      if (!pertenenciaIdValido(perfil.pertenenciaId)) return { estado: 'NO_VERIFICABLE' };
      return { estado: perfil.pertenenciaId === recibo.pertenenciaId
        ? 'CONFIRMADA_VIGENTE' : 'CONFIRMADA_NO_VIGENTE' };
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if ([14, 'unavailable', 'firestore/unavailable'].includes(error?.code)) {
      throw new HttpsError('unavailable', 'No se pudo consultar la solicitud. Inténtalo más tarde.');
    }
    if ([4, 'deadline-exceeded', 'firestore/deadline-exceeded'].includes(error?.code)) {
      throw new HttpsError('deadline-exceeded', 'La consulta no pudo completarse a tiempo.');
    }
    throw new HttpsError('internal', 'No fue posible verificar la solicitud.');
  }
}

module.exports = { prepararIdempotenciaIngreso, consultarEstadoSolicitudIngreso };
