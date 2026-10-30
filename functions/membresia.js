const { pertenenciaIdValido } = require('./pertenencia');
const { prepararRevocacionFinancieraPorDesvinculacion } = require('./finanzas');

function idValido(valor, limite = 1500) {
  return typeof valor === 'string' && valor.trim().length > 0 &&
    valor.length <= limite && Buffer.byteLength(valor, 'utf8') <= 1500 &&
    !/[\/\u0000-\u001f\u007f]/.test(valor) &&
    valor !== '.' && valor !== '..' && !/^__.*__$/.test(valor);
}

function solicitudValida(valor) {
  return typeof valor === 'string' && valor.length >= 16 && valor.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(valor) && !/^__.*__$/.test(valor);
}

/**
 * Callable interno conectado desde index.js; no inicializa Admin.
 * El actor procede SOLO de Auth. Todos los permisos de una nueva ejecución se
 * validan en la misma transacción que la pertenencia y la revocación financiera.
 *
 * Se conserva pertenenciaId en el perfil como histórico protegido. Salir elimina
 * iglesiaId/rolGlobal; expulsar elimina también descripcion, igual que Flutter.
 * Ambos retiran fcmToken/fcmTokenActualizado en el mismo commit del perfil.
 * No invalidan dispositivos ni el token físico, ni retiran mensajes en tránsito.
 * Los ingresos actuales renuevan el ID: una petición antigua no puede actuar
 * sobre un período nuevo. Perfiles legados sin ID requieren migración previa;
 * formato por sí solo no acredita origen servidor de valores preexistentes.
 *
 * Recibos privados operaciones_desvinculacion/{actor}/solicitudes/{solicitudId},
 * protegidos por el deny general actual. No TTL ni borrado automático. El replay
 * solo devuelve la confirmación histórica del propio actor, incluso si sus roles
 * cambiaron; NO vuelve a autorizar ni ejecutar la acción. Si el objetivo tiene
 * otro período, pertenencia activa o datos no verificables, se rechaza sin cambios.
 *
 * despuesDeDesvincular es un hook opcional post-commit, nunca transaccional ni en
 * replay. Un fallo suyo no revierte la pertenencia ni invita a repetirla. No tiene
 * garantía de entrega tras caída del proceso; una futura necesidad durable requiere
 * outbox separado. index no conecta FCM en este paso: la limpieza actual vive en
 * NotificationService Flutter y su integración sigue pendiente. Un hook futuro
 * deberá revalidar período antes de limpiar tokens para no afectar un reingreso.
 *
 * Esto NO cierra las salidas/expulsiones cliente todavía permitidas por reglas.
 * No debe publicarse como solución global sin migración e integración coordinadas.
 */
async function desvincularMiembroIglesia(request, {
  db, FieldValue, HttpsError, despuesDeDesvincular,
}) {
  const actorUid = request.auth?.uid;
  if (!idValido(actorUid, 128)) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const datos = request.data;
  const claves = ['iglesiaId', 'uidObjetivo', 'accion', 'pertenenciaId', 'solicitudId'];
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== claves.length || !claves.every((c) => Object.hasOwn(datos, c)) ||
      !idValido(datos.iglesiaId) || !idValido(datos.uidObjetivo, 128) ||
      !['salir', 'expulsar'].includes(datos.accion) ||
      !pertenenciaIdValido(datos.pertenenciaId) || !solicitudValida(datos.solicitudId)) {
    throw new HttpsError('invalid-argument', 'Indica una solicitud de desvinculación válida.');
  }
  const { iglesiaId, uidObjetivo, accion, pertenenciaId, solicitudId } = datos;
  if (accion === 'salir' && uidObjetivo !== actorUid) {
    throw new HttpsError('permission-denied', 'Solo puedes solicitar tu propia salida.');
  }
  let confirmado;
  try {
    confirmado = await db.runTransaction(async (transaction) => {
      const iglesiaRef = db.collection('iglesias').doc(iglesiaId);
      const actorRef = db.collection('usuarios_globales').doc(actorUid);
      const objetivoRef = db.collection('usuarios_globales').doc(uidObjetivo);
      const reciboRef = db.collection('operaciones_desvinculacion').doc(actorUid)
        .collection('solicitudes').doc(solicitudId);
      const recibo = await transaction.get(reciboRef);
      const iglesia = await transaction.get(iglesiaRef);
      const actor = await transaction.get(actorRef);
      const objetivo = actorUid === uidObjetivo ? actor : await transaction.get(objetivoRef);
      const perfilObjetivo = objetivo.exists ? objetivo.data() : null;

      if (recibo.exists) {
        const anterior = recibo.data();
        if (anterior.actorUid !== actorUid || anterior.uidObjetivo !== uidObjetivo ||
            anterior.iglesiaId !== iglesiaId || anterior.accion !== accion ||
            anterior.pertenenciaId !== pertenenciaId) {
          throw new HttpsError('invalid-argument', 'La solicitud ya se utilizó con otros parámetros.');
        }
        if (anterior.version !== 1 || anterior.resultado?.ok !== true) {
          throw new HttpsError('failed-precondition', 'No es posible verificar esta solicitud.');
        }
        if (!perfilObjetivo || perfilObjetivo.pertenenciaId !== pertenenciaId ||
            Object.hasOwn(perfilObjetivo, 'iglesiaId') || Object.hasOwn(perfilObjetivo, 'rolGlobal')) {
          throw new HttpsError('failed-precondition', 'La solicitud corresponde a una pertenencia anterior.');
        }
        return { nueva: false };
      }

      if (!iglesia.exists) throw new HttpsError('not-found', 'La congregación no está disponible.');
      if (!idValido(iglesia.data().adminUid, 128)) {
        throw new HttpsError('failed-precondition', 'La administración requiere verificación previa.');
      }
      if (!actor.exists || actor.data().iglesiaId !== iglesiaId) {
        throw new HttpsError('permission-denied', 'No tienes permiso para esta operación.');
      }
      if (accion === 'expulsar' && (actor.data().rolGlobal !== 'admin_iglesia' ||
          iglesia.data().adminUid !== actorUid)) {
        throw new HttpsError('permission-denied', 'Solo el administrador titular puede expulsar miembros.');
      }
      if (!objetivo.exists) throw new HttpsError('not-found', 'El miembro no está disponible.');
      if (perfilObjetivo.iglesiaId !== iglesiaId) {
        throw new HttpsError('permission-denied', 'No tienes permiso para esta operación.');
      }
      if (iglesia.data().adminUid === uidObjetivo ||
          (accion === 'salir' && perfilObjetivo.rolGlobal === 'admin_iglesia')) {
        throw new HttpsError('failed-precondition', 'Primero debe transferirse la administración.');
      }
      if (!['admin_iglesia', 'lider_area', 'servidor'].includes(perfilObjetivo.rolGlobal) ||
          !pertenenciaIdValido(perfilObjetivo.pertenenciaId) ||
          perfilObjetivo.pertenenciaId !== pertenenciaId) {
        throw new HttpsError('failed-precondition', 'La pertenencia no está vigente o requiere preparación previa.');
      }

      const revocacion = await prepararRevocacionFinancieraPorDesvinculacion({
        db, transaction, iglesiaId, uidObjetivo, actorUid, FieldValue,
      });
      // No quedan lecturas: aplica finanzas, perfil y recibo en el mismo commit.
      revocacion.aplicar();
      transaction.update(objetivoRef, { iglesiaId: FieldValue.delete(), rolGlobal: FieldValue.delete(),
        fcmToken: FieldValue.delete(), fcmTokenActualizado: FieldValue.delete(),
        ...(accion === 'expulsar' ? { descripcion: FieldValue.delete() } : {}) });
      transaction.create(reciboRef, { version: 1, actorUid, uidObjetivo, iglesiaId, accion,
        pertenenciaId, resultado: { ok: true }, fechaCreacion: FieldValue.serverTimestamp() });
      return { nueva: true };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const codigo = new Map([[14, 'unavailable'], ['unavailable', 'unavailable'],
      [4, 'deadline-exceeded'], ['deadline-exceeded', 'deadline-exceeded'],
      [10, 'aborted'], ['aborted', 'aborted']]).get(error?.code) ?? 'internal';
    throw new HttpsError(codigo, 'No fue posible confirmar la desvinculación. Revisa su estado antes de reintentar.');
  }
  if (confirmado.nueva && typeof despuesDeDesvincular === 'function') {
    try { await despuesDeDesvincular({ actorUid, uidObjetivo, iglesiaId, accion, pertenenciaId }); }
    catch { /* Efecto posterior no crítico; nunca exponer errores ni datos FCM. */ }
  }
  return { ok: true };
}

/**
 * Consulta histórica, sin autorizar operaciones nuevas. Entrada: los mismos cinco
 * parámetros de desvincularMiembroIglesia. Auth determina EXCLUSIVAMENTE el actor;
 * solicitudId identifica el documento dentro de SU ruta privada (no figura como
 * campo del recibo). No requiere conservar el rol ni la iglesia del actor original.
 *
 * Respuesta única { estado }, sin IDs, perfiles, huellas ni datos financieros:
 * - NO_VERIFICABLE: falta recibo válido y coincidente; NO demuestra que no ocurrió.
 * - CONFIRMADA_PERTENENCIA_TERMINADA: recibo coincidente y perfil conserva el período
 *   original sin iglesiaId ni rolGlobal, como lo deja el callable de escritura.
 * - CONFIRMADA_NUEVA_PERTENENCIA: recibo coincidente y perfil tiene OTRO ID válido,
 *   con pertenencia coherente o ya terminado. No afirma que esté activo ahora.
 * - CONFIRMADA_ESTADO_ACTUAL_NO_VERIFICABLE: el recibo prueba la operación original,
 *   pero perfil ausente, legado o incoherente impide describir su estado actual.
 *
 * Un recibo válido acredita el commit histórico; el perfil solo matiza el presente.
 * Ningún estado autoriza otra solicitud, FCM ni finanzas. Los cambios se observan
 * en una transacción de SOLO lectura. No se renueva el período ni se limpia nada.
 * Procedencia de IDs previos no se acredita por formato; distinguir otro período
 * presupone los escritores de ingreso confiables y las reglas protectoras previstas.
 */
async function consultarEstadoSolicitudDesvinculacion(request, { db, HttpsError }) {
  const actorUid = request?.auth?.uid;
  if (!idValido(actorUid, 128)) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const datos = request.data;
  const claves = ['solicitudId', 'iglesiaId', 'uidObjetivo', 'accion', 'pertenenciaId'];
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== claves.length || !claves.every((c) => Object.hasOwn(datos, c)) ||
      !solicitudValida(datos.solicitudId) || !idValido(datos.iglesiaId) ||
      !idValido(datos.uidObjetivo, 128) || !['salir', 'expulsar'].includes(datos.accion) ||
      !pertenenciaIdValido(datos.pertenenciaId)) {
    throw new HttpsError('invalid-argument', 'Indica el contexto original de la solicitud.');
  }
  const { solicitudId, iglesiaId, uidObjetivo, accion, pertenenciaId } = datos;
  if (accion === 'salir' && uidObjetivo !== actorUid) {
    throw new HttpsError('permission-denied', 'No se puede consultar esta solicitud.');
  }
  try {
    const reciboRef = db.collection('operaciones_desvinculacion').doc(actorUid)
      .collection('solicitudes').doc(solicitudId);
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reciboRef);
      if (!snapshot.exists) return { estado: 'NO_VERIFICABLE' };
      const recibo = snapshot.data() ?? {};
      if (recibo.version !== 1 || recibo.actorUid !== actorUid ||
          recibo.uidObjetivo !== uidObjetivo || recibo.iglesiaId !== iglesiaId ||
          recibo.accion !== accion || recibo.pertenenciaId !== pertenenciaId ||
          !recibo.resultado || typeof recibo.resultado !== 'object' ||
          Array.isArray(recibo.resultado) || Object.keys(recibo.resultado).length !== 1 ||
          recibo.resultado.ok !== true) return { estado: 'NO_VERIFICABLE' };

      const perfilSnapshot = await transaction.get(db.collection('usuarios_globales').doc(uidObjetivo));
      const noActual = { estado: 'CONFIRMADA_ESTADO_ACTUAL_NO_VERIFICABLE' };
      if (!perfilSnapshot.exists) return noActual;
      const perfil = perfilSnapshot.data() ?? {};
      if (!pertenenciaIdValido(perfil.pertenenciaId)) return noActual;
      const sinPertenencia = !Object.hasOwn(perfil, 'iglesiaId') && !Object.hasOwn(perfil, 'rolGlobal');
      if (perfil.pertenenciaId === pertenenciaId) {
        return sinPertenencia ? { estado: 'CONFIRMADA_PERTENENCIA_TERMINADA' } : noActual;
      }
      const pertenenciaCoherente = idValido(perfil.iglesiaId) &&
        ['admin_iglesia', 'lider_area', 'servidor'].includes(perfil.rolGlobal);
      return sinPertenencia || pertenenciaCoherente
        ? { estado: 'CONFIRMADA_NUEVA_PERTENENCIA' } : noActual;
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const codigo = new Map([[14, 'unavailable'], ['unavailable', 'unavailable'],
      ['firestore/unavailable', 'unavailable'], [4, 'deadline-exceeded'],
      ['deadline-exceeded', 'deadline-exceeded'], ['firestore/deadline-exceeded', 'deadline-exceeded'],
      [10, 'aborted'], ['aborted', 'aborted']]).get(error?.code) ?? 'internal';
    throw new HttpsError(codigo, 'No fue posible consultar la solicitud. Inténtalo más tarde.');
  }
}

/**
 * Recuperación histórica SOLO desde el recibo privado del actor de Auth.
 * Entrada exacta { solicitudId }. No consulta perfiles ni administración actual.
 * CONFIRMADA incluye exclusivamente los cinco parámetros originales necesarios
 * para la consulta existente; no concede permisos ni vuelve a ejecutar nada.
 * RECIBO_AUSENTE no prueba que la operación no ocurrió (puede estar en vuelo).
 * NO_VERIFICABLE indica un recibo presente cuyo contrato no puede acreditarse.
 * Ninguno permite generar otra intención automáticamente.
 *
 * Los clientes actuales generan 256 bits con Random.secure; el validador legado
 * solo acredita formato, NO entropía. La seguridad depende de Auth y de la ruta
 * privada, nunca de que solicitudId sea un secreto. No hay listados ni UID libre.
 * No recuperar contexto si se perdió también solicitudId; no reconstruir desde
 * perfiles. Un fallo local previo al envío no crea recibo; un timeout puede dejarlo
 * ausente temporalmente. Conservar la clave y reconciliar explícitamente después.
 * Los recibos atómicos deben conservarse sin TTL; no se altera su esquema.
 */
async function recuperarContextoSolicitudDesvinculacion(request, { db, HttpsError }) {
  const actorUid = request?.auth?.uid;
  if (!idValido(actorUid, 128)) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const datos = request.data;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 1 || !Object.hasOwn(datos, 'solicitudId') ||
      !solicitudValida(datos.solicitudId)) {
    throw new HttpsError('invalid-argument', 'Indica una solicitud válida.');
  }
  const { solicitudId } = datos;
  try {
    const reciboRef = db.collection('operaciones_desvinculacion').doc(actorUid)
      .collection('solicitudes').doc(solicitudId);
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reciboRef);
      if (!snapshot.exists) return { estado: 'RECIBO_AUSENTE' };
      const recibo = snapshot.data();
      if (!recibo || recibo.version !== 1 || recibo.actorUid !== actorUid ||
          !idValido(recibo.uidObjetivo, 128) || !idValido(recibo.iglesiaId) ||
          !['salir', 'expulsar'].includes(recibo.accion) ||
          (recibo.accion === 'salir' && recibo.uidObjetivo !== actorUid) ||
          !pertenenciaIdValido(recibo.pertenenciaId) ||
          !recibo.resultado || typeof recibo.resultado !== 'object' ||
          Array.isArray(recibo.resultado) || Object.keys(recibo.resultado).length !== 1 ||
          recibo.resultado.ok !== true) return { estado: 'NO_VERIFICABLE' };
      return { estado: 'CONFIRMADA', contexto: { solicitudId,
        iglesiaId: recibo.iglesiaId, uidObjetivo: recibo.uidObjetivo,
        accion: recibo.accion, pertenenciaId: recibo.pertenenciaId } };
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const codigo = new Map([[14, 'unavailable'], ['unavailable', 'unavailable'],
      ['firestore/unavailable', 'unavailable'], [4, 'deadline-exceeded'],
      ['deadline-exceeded', 'deadline-exceeded'], ['firestore/deadline-exceeded', 'deadline-exceeded'],
      [10, 'aborted'], ['aborted', 'aborted']]).get(error?.code) ?? 'internal';
    throw new HttpsError(codigo, 'No fue posible recuperar la solicitud. Inténtalo más tarde.');
  }
}

module.exports = { desvincularMiembroIglesia, consultarEstadoSolicitudDesvinculacion,
  recuperarContextoSolicitudDesvinculacion };
