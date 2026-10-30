const { generarPertenenciaId, pertenenciaIdValido } = require('../pertenencia');
const { clasificarPerfilPertenencia } = require('./pertenencia_plan');

function idValido(valor, limite) {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= limite &&
    valor === valor.trim() && !/[\/\u0000-\u001f\u007f]/.test(valor) &&
    valor !== '.' && valor !== '..' && !/^__.*__$/.test(valor);
}

function versionDocumento(snapshot) {
  const tiempo = snapshot.updateTime;
  if (!tiempo || !Number.isSafeInteger(tiempo.seconds) ||
      !Number.isSafeInteger(tiempo.nanoseconds) || tiempo.nanoseconds < 0 ||
      tiempo.nanoseconds >= 1000000000) return null;
  return `${tiempo.seconds}:${tiempo.nanoseconds}`;
}

function finalizar({ categoria, motivo }) {
  // Se construye SOLO después de resolver runTransaction: nunca por intento.
  return Object.freeze({ categoria, motivo, metricas: Object.freeze({
    procesados: 1,
    migrados: Number(categoria === 'migrado'),
    omitidos: Number(categoria === 'omitido'),
    revision: Number(categoria === 'revision'),
    conflictos: Number(categoria === 'conflicto'),
    errores: Number(categoria === 'error'),
  }) });
}

/**
 * Motor de UN perfil, invocado programáticamente con db explícito.
 * seleccion = { uid, iglesiaId, version: 'segundos:nanosegundos' } representa
 * la selección previa; no es autoridad administrativa ni una orden cliente.
 * FieldValue solo aporta serverTimestamp(); generarId es inyectable para pruebas.
 * No inicializa SDKs, lee credenciales, pagina, registra logs ni expone endpoints.
 *
 * Ante ID existente o datos inconsistentes se devuelve la clasificación vigente
 * sin escribir, aunque haya cambiado la versión: nunca se intenta repararlos.
 * Solo un candidato con iglesia y updateTime EXACTOS a la selección puede recibir ID.
 * El comprobante privado por UID impide volver a asignar si un escritor privilegiado
 * eliminara después el ID. No acredita IDs preexistentes ni inventa recibos de ingreso.
 * No autoriza desvinculación ni resuelve reenvíos de clientes antiguos.
 */
async function migrarPerfilPertenencia({ db, seleccion, FieldValue,
  generarId = generarPertenenciaId } = {}) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function' ||
      !seleccion || !idValido(seleccion.uid, 128) || !idValido(seleccion.iglesiaId, 1500) ||
      typeof seleccion.version !== 'string' || !/^-?\d+:\d{1,9}$/.test(seleccion.version) ||
      !FieldValue || typeof FieldValue.serverTimestamp !== 'function' || typeof generarId !== 'function') {
    throw new Error('Configuración de ejecución inválida.');
  }
  // Captura inmutable: el llamador no puede cambiar el objetivo durante un await/reintento.
  const { uid, iglesiaId, version } = seleccion;
  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const perfilRef = db.collection('usuarios_globales').doc(uid);
      const snapshot = await transaction.get(perfilRef);
      const perfil = snapshot.exists ? snapshot.data() : null;
      const entrada = { uid, perfil };
      let clasificacion = clasificarPerfilPertenencia(entrada);
      if (clasificacion.motivo === 'iglesia_no_verificable') {
        const iglesia = await transaction.get(db.collection('iglesias').doc(perfil.iglesiaId));
        entrada.iglesia = { id: perfil.iglesiaId, existe: iglesia.exists,
          adminUid: iglesia.exists ? iglesia.data().adminUid : undefined };
        clasificacion = clasificarPerfilPertenencia(entrada);
      }
      if (clasificacion.categoria !== 'candidato') return clasificacion;
      if (perfil.iglesiaId !== iglesiaId) {
        return { categoria: 'conflicto', motivo: 'iglesia_modificada' };
      }
      clasificacion = clasificarPerfilPertenencia({ ...entrada,
        versionEsperada: version, versionActual: versionDocumento(snapshot) });
      if (clasificacion.categoria !== 'candidato') return clasificacion;

      const comprobanteRef = db.collection('migraciones_pertenencia').doc(uid);
      const comprobante = await transaction.get(comprobanteRef);
      if (comprobante.exists) return { categoria: 'revision', motivo: 'comprobante_existente' };

      // Todas las lecturas terminaron. IDs de intentos abortados nunca se publican.
      const pertenenciaId = generarId();
      if (!pertenenciaIdValido(pertenenciaId)) throw new Error('Generador inválido.');
      const fechaCreacion = FieldValue.serverTimestamp();
      transaction.update(perfilRef, { pertenenciaId });
      transaction.create(comprobanteRef, { version: 1, origen: 'migracion_pertenencia_v1',
        iglesiaId, pertenenciaId, versionPerfilAnterior: version, fechaCreacion });
      return { categoria: 'migrado', motivo: 'identificador_asignado' };
    }, { maxAttempts: 5 });
    return finalizar(resultado);
  } catch {
    // No se devuelven errores originales, rutas, IDs ni documentos privados.
    // Un fallo de confirmación puede ser incierto: se puede repetir la misma selección,
    // nunca restaurar/borrar ID o comprobante como compensación automática.
    return finalizar({ categoria: 'error', motivo: 'transaccion_fallida' });
  }
}

module.exports = { migrarPerfilPertenencia };
