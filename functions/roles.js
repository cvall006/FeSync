const { createHash } = require('node:crypto');
const { pertenenciaIdValido } = require('./pertenencia');

const ordinarios = ['servidor', 'lider_area'];
const clavesContexto = ['iglesiaId', 'uidObjetivo'];
const clavesCambio = [...clavesContexto, 'pertenenciaId', 'rolNuevo',
  'versionPerfilEsperada', 'versionIglesiaEsperada', 'solicitudId'];
const clavesParametros = clavesCambio.filter((c) => c !== 'solicitudId');

function idValido(v, limite = 1500) {
  return typeof v === 'string' && v.length > 0 && v.length <= limite &&
    v === v.trim() && Buffer.byteLength(v, 'utf8') <= 1500 &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}

function solicitudValida(v) {
  return typeof v === 'string' && v.length >= 16 && v.length <= 128 &&
    !/[^a-zA-Z0-9_-]/.test(v) && !/^__.*__$/.test(v);
}

// Formato canónico, sin conversión a milisegundos ni pérdida de nanosegundos.
// Rango de Timestamp de Firestore. El valor es precondición, nunca autoridad.
function versionValida(v) {
  if (typeof v !== 'string' || !/^-?\d{1,12}:\d{1,9}$/.test(v)) return false;
  const [s, n] = v.split(':').map(Number);
  return Number.isSafeInteger(s) && s >= -62135596800 && s <= 253402300799 &&
    Number.isInteger(n) && n >= 0 && n < 1000000000 && v === `${s}:${n}`;
}

function versionDocumento(snapshot, HttpsError) {
  const t = snapshot.updateTime;
  if (!t || !Number.isSafeInteger(t.seconds) || !Number.isInteger(t.nanoseconds) ||
      !versionValida(`${t.seconds}:${t.nanoseconds}`)) {
    throw new HttpsError('failed-precondition', 'No es posible acreditar la versión del contexto.');
  }
  return `${t.seconds}:${t.nanoseconds}`;
}

function objetoExacto(v, claves) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length === claves.length && claves.every((c) => Object.hasOwn(v, c));
}

function validar(request, cambio, HttpsError) {
  const actorUid = request?.auth?.uid;
  if (!idValido(actorUid, 128)) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const d = request.data;
  if (!objetoExacto(d, cambio ? clavesCambio : clavesContexto) ||
      !idValido(d.iglesiaId) || !idValido(d.uidObjetivo, 128) ||
      (cambio && (!pertenenciaIdValido(d.pertenenciaId) || !ordinarios.includes(d.rolNuevo) ||
        !versionValida(d.versionPerfilEsperada) || !versionValida(d.versionIglesiaEsperada) ||
        !solicitudValida(d.solicitudId)))) {
    throw new HttpsError('invalid-argument', 'Indica un contexto de cambio de rol válido.');
  }
  // Copia inmutable de parámetros primitivos antes de cualquier await/reintento.
  return { actorUid, datos: Object.freeze({ ...d }) };
}

function referencias(db, actorUid, d) {
  return {
    iglesia: db.collection('iglesias').doc(d.iglesiaId),
    actor: db.collection('usuarios_globales').doc(actorUid),
    objetivo: db.collection('usuarios_globales').doc(d.uidObjetivo),
  };
}

function autorizar(actorUid, d, iglesia, actor, objetivo, HttpsError) {
  if (!iglesia.exists || !actor.exists || iglesia.data().adminUid !== actorUid ||
      actor.data().iglesiaId !== d.iglesiaId || actor.data().rolGlobal !== 'admin_iglesia') {
    throw new HttpsError('permission-denied', 'Solo el administrador titular puede gestionar roles.');
  }
  if (!objetivo.exists) throw new HttpsError('not-found', 'El miembro no está disponible.');
  const perfil = objetivo.data();
  if (perfil.iglesiaId !== d.iglesiaId) {
    throw new HttpsError('permission-denied', 'El miembro no pertenece a esta congregación.');
  }
  if (d.uidObjetivo === actorUid || d.uidObjetivo === iglesia.data().adminUid ||
      !ordinarios.includes(perfil.rolGlobal) || !pertenenciaIdValido(perfil.pertenenciaId)) {
    throw new HttpsError('failed-precondition', 'El miembro requiere verificación previa o transferencia administrativa.');
  }
}

function errorPublico(error, HttpsError) {
  if (error instanceof HttpsError) return error;
  const codigo = new Map([[14, 'unavailable'], ['unavailable', 'unavailable'],
    ['firestore/unavailable', 'unavailable'], [4, 'deadline-exceeded'],
    ['deadline-exceeded', 'deadline-exceeded'], ['firestore/deadline-exceeded', 'deadline-exceeded'],
    [10, 'aborted'], ['aborted', 'aborted']]).get(error?.code) ?? 'internal';
  return new HttpsError(codigo, 'No fue posible verificar la operación. Conserva la solicitud antes de reintentar.');
}

/**
 * Solo lectura transaccional. Respuesta mínima con rolActual, pertenenciaId y
 * versionPerfilEsperada/versionIglesiaEsperada ('segundos:nanosegundos'). No
 * devuelve perfiles, UID, datos personales o financieros. Contexto no permanente.
 * El actor legado puede acreditar titularidad sin ID; el objetivo sí requiere ID.
 * El formato del ID no acredita procedencia: la migración coordinada sigue pendiente.
 */
async function obtenerContextoCambioRolMiembro(request, { db, HttpsError }) {
  const { actorUid, datos: d } = validar(request, false, HttpsError);
  const ref = referencias(db, actorUid, d);
  try {
    return await db.runTransaction(async (tx) => {
      const iglesia = await tx.get(ref.iglesia);
      const actor = await tx.get(ref.actor);
      const objetivo = await tx.get(ref.objetivo);
      autorizar(actorUid, d, iglesia, actor, objetivo, HttpsError);
      return { rolActual: objetivo.data().rolGlobal, pertenenciaId: objetivo.data().pertenenciaId,
        versionPerfilEsperada: versionDocumento(objetivo, HttpsError),
        versionIglesiaEsperada: versionDocumento(iglesia, HttpsError) };
    }, { readOnly: true });
  } catch (error) { throw errorPublico(error, HttpsError); }
}

function huella(actorUid, d) {
  return createHash('sha256').update(JSON.stringify([actorUid,
    ...clavesParametros.map((c) => [c, d[c]])])).digest('hex');
}

/**
 * Sin inicializar Admin ni transacciones anidadas. Todas las lecturas preceden
 * a las escrituras. Solo cambia rolGlobal; nunca titularidad, período, auxiliares,
 * Finanzas, elegibilidad o FCM. updateTime de perfil e iglesia detecta incluso
 * cambios de ida/vuelta sin modificar la transferencia existente. También cambios
 * auxiliares/configuración provocan conflicto; no se refrescan precondiciones.
 *
 * Recibos privados operaciones_roles/{actor}/solicitudes/{solicitudId}, sin TTL.
 * El deny general actual los protege, igual que membresia_auditoria de la iglesia.
 * CONFIRMADA/huboCambio siempre describe HISTORIA, no el rol/permisos actuales.
 * Replay propio confirmado se permite tras perder titularidad o cambiar período:
 * no ejecuta nada. Errores de lectura NO se convierten en confirmaciones.
 * El no-op autorizado guarda recibo, sin actualizar perfil ni crear auditoría.
 * El cliente futuro debe persistir clave y parámetros antes del primer envío y
 * conservarlos ante resultado incierto. Este módulo no resuelve esa integración.
 */
async function actualizarRolMiembro(request, { db, FieldValue, HttpsError }) {
  const { actorUid, datos: d } = validar(request, true, HttpsError);
  const ref = referencias(db, actorUid, d);
  const reciboRef = db.collection('operaciones_roles').doc(actorUid).collection('solicitudes').doc(d.solicitudId);
  const auditoriaRef = ref.iglesia.collection('membresia_auditoria').doc();
  const firma = huella(actorUid, d);
  try {
    return await db.runTransaction(async (tx) => {
      const recibo = await tx.get(reciboRef);
      const iglesia = await tx.get(ref.iglesia);
      const actor = await tx.get(ref.actor);
      const objetivo = await tx.get(ref.objetivo);
      if (recibo.exists) {
        const anterior = recibo.data();
        if (!anterior || anterior.version !== 1 || anterior.actorUid !== actorUid) {
          throw new HttpsError('failed-precondition', 'No es posible verificar la solicitud original.');
        }
        if (clavesParametros.some((c) => anterior[c] !== d[c])) {
          throw new HttpsError('invalid-argument', 'La solicitud ya se utilizó con otros parámetros.');
        }
        if (anterior.huella !== firma || !objetoExacto(anterior.resultado, ['estado', 'huboCambio']) ||
            anterior.resultado.estado !== 'CONFIRMADA' || typeof anterior.resultado.huboCambio !== 'boolean') {
          throw new HttpsError('failed-precondition', 'No es posible verificar la solicitud original.');
        }
        return { estado: 'CONFIRMADA', huboCambio: anterior.resultado.huboCambio };
      }
      autorizar(actorUid, d, iglesia, actor, objetivo, HttpsError);
      if (objetivo.data().pertenenciaId !== d.pertenenciaId) {
        throw new HttpsError('failed-precondition', 'La solicitud corresponde a otra pertenencia.');
      }
      if (versionDocumento(objetivo, HttpsError) !== d.versionPerfilEsperada ||
          versionDocumento(iglesia, HttpsError) !== d.versionIglesiaEsperada) {
        throw new HttpsError('aborted', 'El contexto cambió. Revisa los datos antes de decidir otra operación.');
      }
      const rolAnterior = objetivo.data().rolGlobal;
      const resultado = { estado: 'CONFIRMADA', huboCambio: rolAnterior !== d.rolNuevo };
      const fecha = FieldValue.serverTimestamp();
      if (resultado.huboCambio) {
        tx.update(ref.objetivo, { rolGlobal: d.rolNuevo });
        tx.create(auditoriaRef, { tipo: 'cambio_rol', actorUid, uidObjetivo: d.uidObjetivo,
          iglesiaId: d.iglesiaId, pertenenciaId: d.pertenenciaId, solicitudId: d.solicitudId,
          rolAnterior, rolNuevo: d.rolNuevo, fecha });
      }
      tx.create(reciboRef, { version: 1, actorUid,
        ...Object.fromEntries(clavesParametros.map((c) => [c, d[c]])),
        huella: firma, resultado, fechaCreacion: fecha });
      return resultado;
    });
  } catch (error) { throw errorPublico(error, HttpsError); }
}

module.exports = { obtenerContextoCambioRolMiembro, actualizarRolMiembro };
