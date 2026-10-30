// Las dependencias provienen de index.js; este módulo no inicializa Admin.
function idDocumentoValido(valor) {
  return typeof valor === 'string' &&
    valor.trim().length > 0 &&
    Buffer.byteLength(valor, 'utf8') <= 1500 &&
    !valor.includes('/') &&
    valor !== '.' && valor !== '..' &&
    !/^__.*__$/s.test(valor);
}

function uidValido(valor) {
  // Firebase Auth limita el UID a 128 caracteres. También se usará como doc ID.
  return idDocumentoValido(valor) && valor.length <= 128;
}

// Señal privada de descubrimiento, nunca autorización financiera. Todas las
// lecturas se preparan antes de escribir configuración, señales y auditoría.
async function prepararElegibilidad(transaction, iglesiaRef, estados) {
  const pendientes = [];
  for (const [uid, estado] of estados) {
    const ref = iglesiaRef.collection('finanzas_elegibilidad').doc(uid);
    const snapshot = await transaction.get(ref);
    const anterior = snapshot.data() ?? {};
    const versionValida = Number.isSafeInteger(anterior.version) && anterior.version > 0;
    if (snapshot.exists && Object.keys(anterior).length === 3 && versionValida &&
        anterior.habilitado === estado.habilitado &&
        anterior.esEncargado === estado.esEncargado) continue;
    if (versionValida && anterior.version === Number.MAX_SAFE_INTEGER) {
      throw new Error('Versión de elegibilidad agotada.');
    }
    pendientes.push({ ref, datos: {
      habilitado: estado.habilitado,
      esEncargado: estado.esEncargado,
      version: versionValida ? anterior.version + 1 : 1,
    } });
  }
  return pendientes;
}

// Helper de servidor, no callable ni autorización de membresía. El llamador
// valida Auth, permisos y pertenencia dentro de SU transacción. Primero prepara
// este plan y completa TODAS sus lecturas; solo después llama plan.aplicar().
// El plan está ligado al intento actual: debe prepararse de nuevo en cada
// reintento y nunca reutilizarse fuera del callback de la transacción.
// Una futura operación de desvinculación necesitará identificar la vigencia de
// pertenencia para rechazar solicitudes antiguas tras salir y reingresar.
async function prepararRevocacionFinancieraPorDesvinculacion({
  db, transaction, iglesiaId, uidObjetivo, actorUid, FieldValue,
}) {
  if (!idDocumentoValido(iglesiaId) || !uidValido(uidObjetivo) || !uidValido(actorUid)) {
    throw new TypeError('Identificadores de revocación inválidos.');
  }
  const iglesiaRef = db.collection('iglesias').doc(iglesiaId);
  const accesoRef = iglesiaRef.collection('finanzas_config').doc('acceso');
  const acceso = await transaction.get(accesoRef);
  if (!acceso.exists || acceso.data().encargadoUid !== uidObjetivo) {
    return Object.freeze({ revocada: false, aplicar: () => false });
  }

  const elegibilidad = await prepararElegibilidad(transaction, iglesiaRef, new Map([
    [uidObjetivo, { habilitado: false, esEncargado: false }],
  ]));
  const auditoriaRef = iglesiaRef.collection('finanzas_auditoria').doc();
  let aplicado = false;
  return Object.freeze({
    revocada: true,
    // Sin lecturas ni commit. Cualquier error debe abortar la transacción externa.
    aplicar() {
      if (aplicado) return false;
      aplicado = true;
      const fecha = FieldValue.serverTimestamp();
      transaction.set(accesoRef, {
        encargadoUid: null,
        actualizadoPorUid: actorUid,
        fechaActualizacion: fecha,
      }, { merge: true });
      for (const { ref, datos } of elegibilidad) transaction.set(ref, datos);
      transaction.create(auditoriaRef, {
        tipo: 'designacion_encargado',
        accion: 'revocar',
        motivo: 'desvinculacion',
        actorUid,
        encargadoAnteriorUid: uidObjetivo,
        encargadoUid: null,
        fecha,
      });
      return true;
    },
  });
}

// Dependencia pendiente antes de integrar Flutter: salida y expulsión cambian
// usuarios_globales desde cliente sin revocar encargadoUid ni esta señal. Un
// reingreso podría recuperar la designación: se necesita revocación coordinada
// en servidor. Transferencia vive en index.js y no cancela una designación
// independiente; la administración siempre deriva del adminUid y rol vigentes.
// Perfil/iglesia/rol/configuración deben revalidarse, nunca basta esta señal.
async function actualizarEncargadoFinanciero(request, { db, FieldValue, HttpsError }) {
  const uid = request.auth?.uid;
  if (!uidValido(uid)) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const datos = request.data;
  const claves = ['iglesiaId', 'accion', 'encargadoUid'];
  if (
    !datos || typeof datos !== 'object' || Array.isArray(datos) ||
    Object.keys(datos).length !== claves.length ||
    !claves.every((clave) => Object.hasOwn(datos, clave)) ||
    !idDocumentoValido(datos.iglesiaId) ||
    !['designar', 'revocar'].includes(datos.accion) ||
    (datos.accion === 'designar' && !uidValido(datos.encargadoUid)) ||
    (datos.accion === 'revocar' && datos.encargadoUid !== null)
  ) {
    throw new HttpsError('invalid-argument', 'Indica una operación financiera válida.');
  }

  const { iglesiaId, accion, encargadoUid } = datos;
  try {
    const iglesiaRef = db.collection('iglesias').doc(iglesiaId);
    const solicitanteRef = db.collection('usuarios_globales').doc(uid);
    const accesoRef = iglesiaRef.collection('finanzas_config').doc('acceso');
    // Una referencia estable evita generar IDs distintos al reintentar la transacción.
    const auditoriaRef = iglesiaRef.collection('finanzas_auditoria').doc();

    await db.runTransaction(async (transaction) => {
      const iglesia = await transaction.get(iglesiaRef);
      const solicitante = await transaction.get(solicitanteRef);
      if (
        !iglesia.exists || !solicitante.exists ||
        iglesia.data().adminUid !== uid ||
        solicitante.data().iglesiaId !== iglesiaId ||
        solicitante.data().rolGlobal !== 'admin_iglesia'
      ) {
        throw new HttpsError(
          'permission-denied',
          'Solo el administrador titular puede modificar la designación.',
        );
      }

      if (accion === 'designar') {
        const candidatoRef = db.collection('usuarios_globales').doc(encargadoUid);
        const candidato = await transaction.get(candidatoRef);
        if (!candidato.exists || candidato.data().iglesiaId !== iglesiaId) {
          throw new HttpsError(
            'failed-precondition',
            'El encargado debe ser un miembro vigente de esta congregación.',
          );
        }
      }

      const acceso = await transaction.get(accesoRef);
      const anterior = acceso.data() ?? {};
      const moduloHabilitado = typeof anterior.moduloHabilitado === 'boolean'
        ? anterior.moduloHabilitado
        : false;
      const estados = new Map();
      if (uidValido(anterior.encargadoUid)) {
        estados.set(anterior.encargadoUid, { habilitado: false, esEncargado: false });
      }
      if (encargadoUid !== null) {
        estados.set(encargadoUid, { habilitado: moduloHabilitado, esEncargado: true });
      }
      const elegibilidad = await prepararElegibilidad(transaction, iglesiaRef, estados);
      const cambiado = !acceso.exists || anterior.encargadoUid !== encargadoUid ||
        typeof anterior.moduloHabilitado !== 'boolean';

      if (cambiado) {
        const fecha = FieldValue.serverTimestamp();
        transaction.set(accesoRef, {
          encargadoUid,
          moduloHabilitado,
          actualizadoPorUid: uid,
          fechaActualizacion: fecha,
          ...(!acceso.exists ? { fechaCreacion: fecha } : {}),
        }, { merge: true });
        transaction.create(auditoriaRef, {
          tipo: 'designacion_encargado',
          accion,
          actorUid: uid,
          encargadoAnteriorUid: typeof anterior.encargadoUid === 'string'
            ? anterior.encargadoUid
            : null,
          encargadoUid,
          fecha,
        });
      }
      for (const { ref, datos } of elegibilidad) transaction.set(ref, datos);
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No fue posible actualizar la designación.');
  }

  return { ok: true, encargadoUid };
}

// Las futuras operaciones financieras deben validar moduloHabilitado dentro
// de su propia transacción: las reglas cliente no protegen al Admin SDK.
async function actualizarEstadoModuloFinanzas(request, { db, FieldValue, HttpsError }) {
  const uid = request.auth?.uid;
  if (!uidValido(uid)) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const datos = request.data;
  const claves = ['iglesiaId', 'habilitado'];
  if (
    !datos || typeof datos !== 'object' || Array.isArray(datos) ||
    Object.keys(datos).length !== claves.length ||
    !claves.every((clave) => Object.hasOwn(datos, clave)) ||
    !idDocumentoValido(datos.iglesiaId) ||
    typeof datos.habilitado !== 'boolean'
  ) {
    throw new HttpsError('invalid-argument', 'Indica un estado financiero válido.');
  }

  const { iglesiaId, habilitado } = datos;
  try {
    const iglesiaRef = db.collection('iglesias').doc(iglesiaId);
    const solicitanteRef = db.collection('usuarios_globales').doc(uid);
    const accesoRef = iglesiaRef.collection('finanzas_config').doc('acceso');
    const auditoriaRef = iglesiaRef.collection('finanzas_auditoria').doc();

    const cambiado = await db.runTransaction(async (transaction) => {
      const iglesia = await transaction.get(iglesiaRef);
      const solicitante = await transaction.get(solicitanteRef);
      if (
        !iglesia.exists || !solicitante.exists ||
        iglesia.data().adminUid !== uid ||
        solicitante.data().iglesiaId !== iglesiaId ||
        solicitante.data().rolGlobal !== 'admin_iglesia'
      ) {
        throw new HttpsError(
          'permission-denied',
          'Solo el administrador titular puede cambiar el estado de Finanzas.',
        );
      }

      const acceso = await transaction.get(accesoRef);
      const anterior = acceso.data() ?? {};
      const estados = new Map();
      if (uidValido(anterior.encargadoUid)) {
        const encargado = await transaction.get(
          db.collection('usuarios_globales').doc(anterior.encargadoUid),
        );
        const esEncargado = encargado.exists && encargado.data().iglesiaId === iglesiaId;
        estados.set(anterior.encargadoUid, { habilitado: esEncargado && habilitado, esEncargado });
      }
      const elegibilidad = await prepararElegibilidad(transaction, iglesiaRef, estados);
      // Repetir no audita ni modifica configuración. Si falta o quedó antigua
      // la señal, solo la repara; repetir con todo sincronizado no escribe nada.
      if (anterior.moduloHabilitado === habilitado) {
        for (const { ref, datos } of elegibilidad) transaction.set(ref, datos);
        return false;
      }

      const fecha = FieldValue.serverTimestamp();
      transaction.set(accesoRef, {
        moduloHabilitado: habilitado,
        actualizadoPorUid: uid,
        fechaActualizacion: fecha,
        ...(!acceso.exists ? { encargadoUid: null, fechaCreacion: fecha } : {}),
      }, { merge: true });
      transaction.create(auditoriaRef, {
        tipo: 'estado_modulo_finanzas',
        accion: habilitado ? 'activar' : 'desactivar',
        actorUid: uid,
        estadoAnterior: typeof anterior.moduloHabilitado === 'boolean'
          ? anterior.moduloHabilitado
          : null,
        estadoNuevo: habilitado,
        fecha,
      });
      for (const { ref, datos } of elegibilidad) transaction.set(ref, datos);
      return true;
    });

    return { ok: true, moduloHabilitado: habilitado, cambiado };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'No fue posible actualizar el estado de Finanzas.');
  }
}

module.exports = {
  actualizarEncargadoFinanciero,
  actualizarEstadoModuloFinanzas,
  prepararRevocacionFinancieraPorDesvinculacion,
};
