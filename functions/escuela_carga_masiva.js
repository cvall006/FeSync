'use strict';

// Conserva el contrato actual: un documento por alumno/ciclo y sus registros
// anteriores en historialModulos. No crea un segundo historial ni usa notas.
async function escuelaCargarModulos(request, { db, HttpsError, ahora }) {
  const fallo = (code, message) => { throw new HttpsError(code, message); };
  if (!request.auth?.uid) fallo('unauthenticated', 'Inicia sesión para continuar.');
  const d = request.data || {};
  const id = x => typeof x === 'string' && x.length > 0 && x.length <= 128 && !x.includes('/');
  const estados = ['pendiente', 'en_curso', 'completado'];
  if (!id(d.iglesiaId) || !id(d.cicloId) || typeof d.confirmar !== 'boolean' ||
      !Array.isArray(d.hermanos) || !d.hermanos.length || d.hermanos.length > 30 ||
      !d.hermanos.every(id) || new Set(d.hermanos).size !== d.hermanos.length ||
      !Array.isArray(d.modulos) || !d.modulos.length || d.modulos.length > 30 ||
      !d.modulos.every(m => m && id(m.moduloId) && estados.includes(m.estado)) ||
      new Set(d.modulos.map(m => m.moduloId)).size !== d.modulos.length) {
    fallo('invalid-argument', 'Selecciona entre 1 y 30 hermanos y módulos por lote.');
  }
  const actor = db.doc(`usuarios_globales/${request.auth.uid}`);
  const ciclo = db.doc(`iglesias/${d.iglesiaId}/escuela_ciclos/${d.cicloId}`);
  const autorizar = perfil => {
    if (perfil?.iglesiaId !== d.iglesiaId || !['admin_iglesia', 'lider_area'].includes(perfil.rolGlobal)) {
      fallo('permission-denied', 'No tienes autorización vigente para administrar esta Escuela.');
    }
  };
  autorizar((await actor.get()).data());
  const resultados = [];
  for (const uid of d.hermanos) {
    try {
      const filas = await db.runTransaction(async tx => {
        // Relectura transaccional: salida, expulsión, cambio de rol y cierre
        // concurrentes invalidan la escritura; no se confía en el rol del cliente.
        autorizar((await tx.get(actor)).data());
        const c = (await tx.get(ciclo)).data();
        if (c?.version !== 1 || c.estado !== 'abierto' || c.eliminado === true) {
          fallo('failed-precondition', 'El ciclo está cerrado, eliminado o no existe.');
        }
        const miembro = (await tx.get(db.doc(`usuarios_globales/${uid}`))).data();
        if (miembro?.iglesiaId !== d.iglesiaId) fallo('permission-denied', 'El hermano ya no pertenece a esta iglesia.');
        const nombre = typeof miembro.nombre === 'string' ? miembro.nombre : 'Sin nombre';
        if (nombre.length > 300) fallo('failed-precondition', 'El nombre del hermano excede el límite del modelo actual.');
        const catalogo = new Map();
        for (const m of d.modulos) {
          const modulo = (await tx.get(db.doc(`iglesias/${d.iglesiaId}/escuela_modulos/${m.moduloId}`))).data();
          if (typeof modulo?.titulo !== 'string' || !modulo.titulo.length || modulo.titulo.length > 500) {
            fallo('failed-precondition', 'Un módulo ya no existe o no es válido.');
          }
          catalogo.set(m.moduloId, modulo.titulo);
        }
        const ref = ciclo.collection('asignaciones').doc(uid);
        const anterior = (await tx.get(ref)).data();
        const historial = anterior?.historialModulos ?? [];
        if (!Array.isArray(historial)) fallo('failed-precondition', 'El historial necesita revisión; no se ha modificado.');
        const registros = anterior ? [...historial, anterior] : [];
        const valido = r => r && r.version === 1 && r.hermanoUid === uid && id(r.moduloId) &&
          estados.includes(r.estado) && Number.isInteger(r.revision) && r.revision > 0 &&
          typeof r.nombreHermano === 'string' && typeof r.tituloModulo === 'string' &&
          typeof r.asignadoPor === 'string' && typeof r.actualizadoPor === 'string' &&
          typeof r.asignadoEn?.toMillis === 'function' && typeof r.actualizadoEn?.toMillis === 'function';
        if (!Array.isArray(historial) || historial.length > 100 || !registros.every(valido) ||
            historial.some(r => 'historialModulos' in r)) {
          fallo('failed-precondition', 'El historial necesita revisión; no se ha modificado.');
        }
        const nuevas = [];
        const filas = d.modulos.map(m => {
          const existentes = registros.filter(r => r.moduloId === m.moduloId);
          const resultado = !existentes.length ? 'creado' :
            existentes.every(r => r.estado === m.estado) ? 'omitido' : 'conflicto';
          if (resultado === 'creado') nuevas.push(m);
          return { hermanoUid: uid, moduloId: m.moduloId, resultado,
            mensaje: resultado === 'conflicto' ? 'Estado diferente ya registrado; se conserva.' : '' };
        });
        if (registros.length + nuevas.length > 101) {
          fallo('resource-exhausted', 'El ciclo admite hasta 101 registros por hermano; utiliza otro ciclo.');
        }
        if (d.confirmar && nuevas.length) {
          let actual = anterior;
          const archivo = [...historial];
          let revision = anterior?.revision ?? 0;
          const fecha = ahora(); // Fecha de carga, no una fecha histórica inventada.
          for (const m of nuevas) {
            if (actual) {
              const { historialModulos: ignorado, ...registro } = actual;
              archivo.push(registro);
            }
            actual = { version: 1, hermanoUid: uid,
              nombreHermano: nombre,
              moduloId: m.moduloId, tituloModulo: catalogo.get(m.moduloId), estado: m.estado,
              asignadoPor: request.auth.uid, asignadoEn: fecha,
              actualizadoPor: request.auth.uid, actualizadoEn: fecha, revision: ++revision };
          }
          tx.set(ref, { ...actual, ...(archivo.length ? { historialModulos: archivo } : {}) });
        }
        return filas;
      });
      resultados.push(...filas);
    } catch (e) {
      if (e.code === 'permission-denied') {
        // No continuar lotes con un actor revocado. El reintento concilia lo ya confirmado.
        autorizar((await actor.get()).data());
      }
      for (const m of d.modulos) resultados.push({ hermanoUid: uid, moduloId: m.moduloId,
        resultado: 'error', mensaje: e instanceof HttpsError ? e.message :
          'No se pudo confirmar. Reintenta para conciliar sin duplicar.' });
    }
  }
  return { confirmar: d.confirmar, resultados };
}

module.exports = { escuelaCargarModulos };
