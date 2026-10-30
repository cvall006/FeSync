'use strict';
// Captura de intención y envoltura Auth extraídas sin cambiar contratos ni recibos.
const { LIMITES } = require('../finanzas_core/adaptador_firestore');
const { exigirPermisoContable } = require('../finanzas_core/autorizacion');
const { exigir, registroExacto, ErrorContable } = require('../finanzas_core/dinero');
const { createHash } = require('node:crypto');
const { entornoOperacion } = require('./entorno');
const version = s => { exigir(s.exists && s.updateTime, 'CONFIGURACION_REQUERIDA'); return `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`; };
const id = v => exigir(typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v), 'ID_INVALIDO');
function canon(v) { return v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canon).join(',')}]` :
  `{${Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',')}}` : JSON.stringify(v); }
const huella = v => createHash('sha256').update(canon(v)).digest('hex');
const permisos = { crearCuenta: 'administrarCatalogos', crearCategoria: 'administrarCatalogos',
  apertura: 'registrarAjustes', ingreso: 'registrarIngresosGastos', gasto: 'registrarIngresosGastos',
  transferencia: 'transferir', reversion: 'anularMovimientos', ajuste: 'registrarAjustes' };

function crearSolicitudes({ db, HttpsError, adaptador }) {
  const adapter = adaptador;
  // Todos los documentos de autorización se leen dentro del mismo intento.
  async function contexto(tx, uid, permiso = 'leer') {
    const actorS = await tx.get(db.doc(`usuarios_globales/${uid}`)), actor = actorS.data();
    exigir(actor && typeof actor.iglesiaId === 'string', 'CONTABILIDAD_NO_AUTORIZADA'); id(actor.iglesiaId);
    const iglesiaId = actor.iglesiaId, base = `iglesias/${iglesiaId}`;
    const [iglesiaS, accesoS] = await Promise.all([tx.get(db.doc(base)), tx.get(db.doc(`${base}/finanzas_config/acceso`))]);
    const iglesia = iglesiaS.data(); exigir(iglesia && typeof iglesia.adminUid === 'string', 'CONTABILIDAD_NO_AUTORIZADA'); id(iglesia.adminUid);
    const titularS = iglesia.adminUid === uid ? actorS : await tx.get(db.doc(`usuarios_globales/${iglesia.adminUid}`));
    const resultado = exigirPermisoContable({ auth: { uid }, iglesiaId,
      perfilActor: { id: uid, datos: actor }, iglesia: { id: iglesiaId, datos: iglesia },
      perfilTitular: { id: iglesia.adminUid, datos: titularS.data() },
      acceso: { id: 'acceso', iglesiaId, version: version(accesoS), datos: accesoS.data() },
      pertenenciaIdEsperada: actor.pertenenciaId, versionAccesoEsperada: version(accesoS) }, permiso);
    return { iglesiaId, base, actor, iglesiaS, accesoS, permisos: resultado.permisos,
      contexto: { iglesiaId, pertenenciaId: actor.pertenenciaId } };
  }
  async function ejecutar(uid, data) {
    registroExacto(data, ['solicitudId', 'contexto', 'operacion', 'campos']);
    exigir(/^[A-Za-z0-9_-]{16,128}$/.test(data.solicitudId), 'SOLICITUD_ID_INVALIDA');
    exigir(Object.hasOwn(permisos, data.operacion), 'OPERACION_NO_IMPLEMENTADA');
    exigir(Buffer.byteLength(JSON.stringify(data)) <= LIMITES.bytesSolicitud, 'SOLICITUD_DEMASIADO_GRANDE');
    const op = data.operacion, campos = data.campos, catalogo = ['crearCuenta', 'crearCategoria'].includes(op);
    const requeridos = op === 'crearCuenta' ? ['cuenta'] : op === 'crearCategoria' ? ['categoria'] :
      op === 'transferencia' ? ['origenId', 'destinoId', 'montoMinor', 'fechaContable'] :
      op === 'reversion' ? ['originalId', 'fechaContable', 'motivo', 'referenciaAuditoria'] :
      op === 'ajuste' ? ['cuentaId', 'deltaMinor', 'fechaContable', 'motivo', 'referenciaAuditoria'] :
      ['cuentaId', 'montoMinor', 'fechaContable', ...(['ingreso', 'gasto'].includes(op) ? ['categoriaId'] : [])];
    registroExacto(campos, requeridos, ['ingreso', 'gasto', 'apertura'].includes(op) ? ['descripcion'] : []);
    const entrada = await db.runTransaction(async tx => {
      const c = await contexto(tx, uid, permisos[op]);
      exigir(canon(data.contexto) === canon(c.contexto), 'PERTENENCIA_ANTERIOR');
      const intentRef = db.doc(`finanzas_mvp_solicitudes/${uid}/solicitudes/${data.solicitudId}`);
      const descartada = await tx.get(db.doc(`finanzas_resoluciones/${uid}/solicitudes/${data.solicitudId}`));
      exigir(!descartada.exists, 'SOLICITUD_DESCARTADA');
      const anterior = await tx.get(intentRef), fingerprint = huella(data);
      if (anterior.exists) { exigir(anterior.data().huella === fingerprint, 'SOLICITUD_ID_REUTILIZADA'); return anterior.data().entrada; }
      const [config, periodo] = await Promise.all(['finanzas_config/contabilidad', 'finanzas_control/periodo'].map(r => tx.get(db.doc(`${c.base}/${r}`))));
      const precondiciones = { pertenenciaId: c.actor.pertenenciaId, acceso: version(c.accesoS), iglesia: version(c.iglesiaS), configuracion: version(config), controlPeriodo: version(periodo) };
      const vers = async (nombre, key) => { id(key); return version(await tx.get(db.doc(`${c.base}/${nombre}/${key}`))); };
      if (['ingreso', 'gasto'].includes(op)) precondiciones.categoria = await vers('finanzas_categorias', campos.categoriaId);
      if (['ingreso', 'gasto', 'apertura'].includes(op)) precondiciones.cuenta = await vers('finanzas_cuentas', campos.cuentaId);
      if (['transferencia', 'ajuste', 'reversion'].includes(op)) {
        let ids;
        if (op === 'reversion') {
          id(campos.originalId);
          const original = await tx.get(db.doc(`${c.base}/finanzas_movimientos/${campos.originalId}`));
          const reversa = await tx.get(db.doc(`${c.base}/finanzas_reversiones/${campos.originalId}`));
          precondiciones.original = { version: version(original), versionReversion: reversa.exists ? version(reversa) : null };
          ids = original.data().movimiento.asientos.map(a => a.cuentaId);
        } else ids = op === 'ajuste' ? [campos.cuentaId] : [campos.origenId, campos.destinoId];
        precondiciones.cuentas = await Promise.all(ids.map(async cuentaId => ({ cuentaId, version: await vers('finanzas_cuentas', cuentaId) })));
      }
      const entrada = { auth: { uid }, operacion: op, solicitud: { ...campos, versionEsquema: 1,
        solicitudId: data.solicitudId, iglesiaId: c.iglesiaId, periodoId: catalogo ? periodo.data().periodosAbiertos[0] : campos.fechaContable.slice(0, 7), precondiciones } };
      tx.create(intentRef, { huella: fingerprint, entrada }); // Inmutable: jamás regenerar precondiciones al reintentar.
      return entrada;
    });
    return adapter.ejecutar(entrada);
  }
  function callable(fn) { return async request => {
    entornoOperacion();
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    try { id(request.auth.uid); return await fn(request.auth.uid, request.data); }
    catch (e) {
      if (e instanceof ErrorContable) throw new HttpsError(e.codigo === 'CONTABILIDAD_NO_AUTORIZADA' ? 'permission-denied' :
        e.codigo === 'RESULTADO_INCIERTO' ? 'unavailable' : 'failed-precondition', e.codigo, { codigo: e.codigo });
      throw new HttpsError('unavailable', 'Resultado incierto. Recupera la misma solicitud.');
    }
  }; }
  return { contexto, callable, ejecutar: callable(ejecutar) };
}
module.exports = { crearSolicitudes, PERMISOS_OPERACION: Object.freeze(permisos), version, id, canon };
