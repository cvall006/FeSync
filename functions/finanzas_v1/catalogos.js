'use strict';
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto } = require('../finanzas_core/dinero');
const { crearCuenta } = require('../finanzas_core/cuentas');
const { crearCategoria } = require('../finanzas_core/categorias');
const { crearSaldoInicial } = require('../finanzas_core/proyecciones');
const { exigirPeriodoContableAbierto, validarConfiguracionContable } = require('../finanzas_core/configuracion');
const c = require('./comun');
async function ejecutarCatalogo({ db, FieldValue, entrada }) {
  c.entornoOperacion(); registroExacto(entrada, ['auth', 'operacion', 'solicitud']); registroExacto(entrada.auth, ['uid']);
  const esCuenta = entrada.operacion === 'crearCuenta', campo = esCuenta ? 'cuenta' : 'categoria';
  const copia = JSON.parse(c.canon({ uid: entrada.auth.uid, operacion: entrada.operacion, solicitud: entrada.solicitud }));
  const s = copia.solicitud; c.id(copia.uid); c.base(s.iglesiaId);
  registroExacto(s, ['versionEsquema', 'solicitudId', 'iglesiaId', 'periodoId', 'precondiciones', campo]);
  exigir(s.versionEsquema === 1 && typeof s.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId) &&
    Buffer.byteLength(c.canon(copia)) <= 16384, 'SOLICITUD_INVALIDA');
  registroExacto(s[campo], esCuenta ? ['codigo', 'nombre', 'tipo'] : ['codigo', 'nombre', 'naturaleza', 'tipoIngreso']);
  const huella = c.hash(copia), entidadId = c.hash([`finanzas-${entrada.operacion}-v1`, copia.uid, s.iglesiaId, s.solicitudId]);
  const b = c.base(s.iglesiaId), ref = r => db.doc(`${b}/${r}`), coleccion = esCuenta ? 'cuentas' : 'categorias';
  const reciboRef = db.doc(`operaciones_financieras/${copia.uid}/solicitudes/${s.solicitudId}`), entidadRef = ref(`finanzas_${coleccion}/${entidadId}`);
  return db.runTransaction(async tx => {
    const recibo = await tx.get(reciboRef);
    const descartada = await tx.get(db.doc(`finanzas_resoluciones/${copia.uid}/solicitudes/${s.solicitudId}`));
    exigir(!descartada.exists, 'SOLICITUD_DESCARTADA');
    if (recibo.exists) {
      const entidad = await tx.get(entidadRef), r = recibo.data();
      exigir(r.uid === copia.uid && r.huella === huella && r.estado === 'confirmado' && r.iglesiaId === s.iglesiaId &&
        r.solicitudId === s.solicitudId && r.operacion === entrada.operacion && r.movimientoId === entidadId &&
        r.pertenenciaId === s.precondiciones.pertenenciaId && entidad.exists && entidad.data().huella === huella &&
        entidad.data()[campo].id === entidadId && entidad.data().responsable.uid === copia.uid, 'RECIBO_NO_COINCIDE');
      return { estado: 'CONFIRMADA', historica: true, [esCuenta ? 'cuentaId' : 'categoriaId']: entidadId };
    }
    const protocolo = await tx.get(ref('finanzas_control/protocolo')); c.protocolo(protocolo.data(), s.iglesiaId);
    const auth = await c.autorizar(db, tx, copia.uid, s.iglesiaId, 'administrarCatalogos', s.precondiciones);
    const [config, periodo, control, estado, reserva, auditoria, entidadS, resumenS] = await Promise.all([
      'finanzas_config/contabilidad', 'finanzas_control/periodo', 'finanzas_control/libro', 'finanzas_control/incremental_v1',
      `finanzas_reservas_${coleccion}/${s[campo].codigo}`, `finanzas_auditoria/${entidadId}`, `finanzas_${coleccion}/${entidadId}`,
      `finanzas_resumenes/${s.periodoId}`].map(r => tx.get(ref(r))));
    const cfg = validarConfiguracionContable(config.data(), s.iglesiaId), v = c.verificar(estado.data(), control.data(), s.iglesiaId);
    exigir(v.proyeccion.periodo.periodoId === s.periodoId && resumenS.exists &&
      isDeepStrictEqual(resumenS.data().datos, c.resumen(v)) && resumenS.data().ultimaSecuencia === control.data().ultimaSecuencia, 'RESUMEN_PROYECCION_DIVERGENTE');
    registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', 'iglesia', 'configuracion', 'controlPeriodo']);
    for (const [k, snap] of [['iglesia', auth.iglesia], ['configuracion', config], ['controlPeriodo', periodo]]) exigir(s.precondiciones[k] === c.ver(snap), 'CONTEXTO_OPERACION_MODIFICADO');
    exigirPeriodoContableAbierto({ iglesiaId: s.iglesiaId, huboMovimientos: control.data().huboMovimientos,
      periodosAbiertos: periodo.data().periodosAbiertos }, s.iglesiaId, s.periodoId);
    c.id(s[campo].codigo); exigir(!reserva.exists && !auditoria.exists && !entidadS.exists, 'CODIGO_RESERVADO');
    const catalogo = await tx.get(db.collection(`${b}/finanzas_${coleccion}`).limit(51));
    exigir(catalogo.size < 50, 'LIMITE_LIBRO_EXCEDIDO');
    const entidad = esCuenta ? crearCuenta({ iglesiaId: s.iglesiaId, catalogo: catalogo.docs.map(d => d.data().cuenta),
      cuenta: { ...s.cuenta, versionEsquema: 1, id: entidadId, iglesiaId: s.iglesiaId, moneda: cfg.moneda, escala: cfg.escala, estado: 'activa' } }) :
      crearCategoria({ iglesiaId: s.iglesiaId, catalogo: catalogo.docs.map(d => d.data().categoria),
        categoria: { ...s.categoria, versionEsquema: 1, id: entidadId, iglesiaId: s.iglesiaId, estado: 'activa' } });
    let resumenes;
    if (esCuenta) { resumenes = await tx.get(db.collection(`${b}/finanzas_resumenes`).limit(25)); exigir(resumenes.size <= 24, 'LIMITE_MANTENIMIENTO_EXCEDIDO'); }
    const responsable = { uid: copia.uid, pertenenciaId: auth.actor.data().pertenenciaId }, fecha = FieldValue.serverTimestamp();
    tx.create(entidadRef, { [campo]: entidad, huella, solicitudId: s.solicitudId, responsable, fechaCreacion: fecha });
    tx.create(reserva.ref, { versionEsquema: 1, iglesiaId: s.iglesiaId, codigo: entidad.codigo, entidadId, fechaCreacion: fecha });
    if (esCuenta) {
      const nuevo = { ...v, cuentas: { ...v.cuentas, [entidadId]: crearSaldoInicial({ iglesiaId: s.iglesiaId, cuentaId: entidadId, periodoId: s.periodoId }) } };
      tx.create(ref(`finanzas_saldos/${entidadId}`), { versionEsquema: 1, iglesiaId: s.iglesiaId, cuentaId: entidadId,
        saldoMinor: 0, huboMovimientos: false, aperturaRegistrada: false, solicitudesInciertas: 0, ultimaSecuencia: 0, fechaActualizacion: fecha });
      tx.update(estado.ref, c.sellar(nuevo));
      // Una cuenta nueva extiende mapas con cero; conserva importes y secuencias cerrados.
      for (const r of resumenes.docs) tx.update(r.ref, { datos: { ...r.data().datos,
        saldoInicialPorCuenta: { ...r.data().datos.saldoInicialPorCuenta, [entidadId]: 0 },
        saldoFinalPorCuenta: { ...r.data().datos.saldoFinalPorCuenta, [entidadId]: 0 } } });
    }
    tx.update(control.ref, { fechaActualizacion: fecha });
    tx.create(auditoria.ref, { versionEsquema: 1, iglesiaId: s.iglesiaId, evento: entrada.operacion,
      responsable, entidadId, solicitudId: s.solicitudId, fechaCreacion: fecha });
    tx.create(reciboRef, { versionEsquema: 1, uid: copia.uid, operacion: entrada.operacion, iglesiaId: s.iglesiaId,
      solicitudId: s.solicitudId, huella, pertenenciaId: responsable.pertenenciaId, movimientoId: entidadId,
      estado: 'confirmado', secuencia: null, fechaCreacion: fecha });
    return { estado: 'CONFIRMADA', historica: false, [esCuenta ? 'cuentaId' : 'categoriaId']: entidadId };
  });
}
module.exports = { ejecutarCatalogo };
