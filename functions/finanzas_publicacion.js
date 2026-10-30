'use strict';

// Conexión de la entrada normal al MISMO backend de FIN-RELEASE-2.
// Selección de entorno explícita; no exporta mantenimiento ni fixtures.
const { exigir, registroExacto } = require('./finanzas_core/dinero');
const { validarConfiguracionContable, exigirPeriodoContableAbierto } = require('./finanzas_core/configuracion');
const { crearApiIncremental } = require('./finanzas_v1/api');
const c = require('./finanzas_v1/comun');

const { PERMISOS_OPERACION: permisos } = require('./finanzas_v1/solicitudes');

function habilitacionValida(datos, iglesiaId) {
  return c.habilitacionValida(datos, iglesiaId);
}

function crearApiPublicacion({ db, FieldValue, HttpsError }) {
  async function atender(nombre, request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    // Antes de cualquier acceso a Firestore. Ni flags del cliente ni un documento
    // habilitado pueden quitar esta barrera de entorno de servidor.
    try { c.entornoOperacion(); } catch {
      throw new HttpsError('failed-precondition', 'ENTORNO_FINANCIERO_NO_HABILITADO');
    }
    // Un único transporte público; los motores y sus autorizaciones no cambian.
    if (nombre === 'ejecutar' && Object.hasOwn(request.data ?? {}, 'tipo')) {
      try {
        registroExacto(request.data, ['tipo', 'datos']);
        exigir(['resolverSolicitud', 'mantenimiento'].includes(request.data.tipo), 'TIPO_NO_ADMITIDO');
      } catch (e) {
        throw new HttpsError('invalid-argument', e.codigo ?? 'SOLICITUD_INVALIDA');
      }
      const opciones = { db, FieldValue, HttpsError };
      const api = request.data.tipo === 'resolverSolicitud'
        ? require('./finanzas_v1/resolucion').crearResolucion(opciones)
        : require('./finanzas_v1/administracion').crearAdministracion(opciones);
      return api({ ...request, data: request.data.datos });
    }
    try {
      c.id(request.auth.uid);
      registroExacto(request.data, nombre === 'ejecutar' ?
        ['solicitudId', 'contexto', 'operacion', 'campos'] : [],
      nombre === 'consultar' ? ['contexto', 'limite', 'cursor', 'historialPaginado'] : []);
      if (nombre === 'ejecutar') exigir(Object.hasOwn(permisos, request.data.operacion), 'OPERACION_NO_IMPLEMENTADA');
    } catch (e) {
      throw new HttpsError('invalid-argument', e.codigo ?? 'SOLICITUD_INVALIDA');
    }
    const permiso = nombre === 'consultar' ? 'leer' : permisos[request.data.operacion];
    const uid = request.auth.uid;
    // El API conserva sus referencias, cálculos, hashes y recibos. Esta envoltura
    // agrega las barreras al MISMO intento de cada transacción, no a un preflight
    // que pudiera quedar obsoleto antes del commit o del replay.
    const protegido = {
      doc: db.doc.bind(db), collection: db.collection.bind(db),
      runTransaction: (fn, ...opciones) => db.runTransaction(async tx => {
        const perfil = await tx.get(db.doc(`usuarios_globales/${uid}`));
        exigir(perfil.exists, 'CONTABILIDAD_NO_AUTORIZADA');
        const iglesiaId = perfil.data().iglesiaId, b = c.base(iglesiaId);
        const auth = await c.autorizar(db, tx, uid, iglesiaId, permiso);
        const contexto = { iglesiaId, pertenenciaId: auth.actor.data().pertenenciaId };
        if (nombre === 'ejecutar' || request.data.contexto !== undefined) {
          exigir(c.canon(request.data.contexto) === c.canon(contexto), 'PERTENENCIA_ANTERIOR');
        }
        const habilitacion = await tx.get(db.doc(`${b}/finanzas_control/publicacion_v1`));
        exigir(habilitacionValida(habilitacion.data(), iglesiaId), 'CIRCUITO_FINANCIERO_NO_HABILITADO');
        const [protocolo, control, estado, config, periodo, generacionV2] = await Promise.all([
          'finanzas_control/protocolo', 'finanzas_control/libro', 'finanzas_control/incremental_v1',
          'finanzas_config/contabilidad', 'finanzas_control/periodo', 'finanzas_control/generacion_v2',
        ].map(r => tx.get(db.doc(`${b}/${r}`))));
        c.protocolo(protocolo.data(), iglesiaId);
        exigir(!generacionV2.exists && control.exists && config.exists && periodo.exists, 'LIBRO_INCOHERENTE');
        const v = c.verificar(estado.data(), control.data(), iglesiaId);
        const cfg = validarConfiguracionContable(config.data(), iglesiaId);
        const p = periodo.data(), mes = v.proyeccion.periodo.periodoId;
        exigir(p.versionEsquema === 1 && p.iglesiaId === iglesiaId &&
          Array.isArray(p.periodosAbiertos) && p.periodosAbiertos.length === 1 &&
          p.periodosAbiertos[0] === mes && c.canon(v.proyeccion.configuracion) === c.canon(c.configDinero(cfg)),
        'PERIODO_PROYECCION_DISTINTO');
        exigirPeriodoContableAbierto({ iglesiaId, huboMovimientos: control.data().huboMovimientos,
          periodosAbiertos: p.periodosAbiertos }, iglesiaId, mes);
        const resumen = await tx.get(db.doc(`${b}/finanzas_resumenes/${mes}`));
        exigir(resumen.exists && resumen.data().ultimaSecuencia === control.data().ultimaSecuencia &&
          c.canon(resumen.data().datos) === c.canon(c.resumen(v)), 'RESUMEN_PROYECCION_DIVERGENTE');
        return fn(tx);
      }, ...opciones),
    };
    return crearApiIncremental({ db: protegido, FieldValue, HttpsError })[nombre](request);
  }
  return {
    consultar: request => atender('consultar', request),
    ejecutar: request => atender('ejecutar', request),
  };
}

module.exports = { crearApiPublicacion };
