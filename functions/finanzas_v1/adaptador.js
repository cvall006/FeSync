'use strict';
// Único adaptador V1 incremental compartido por entrada normal y demo.
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto, ErrorContable, validarFechaYPeriodo } = require('../finanzas_core/dinero');
const { validarConfiguracionContable, exigirPeriodoContableAbierto } = require('../finanzas_core/configuracion');
const { validarCuenta, validarEstadoCuenta, validarAperturaCuenta } = require('../finanzas_core/cuentas');
const { crearApertura } = require('../finanzas_core/asientos');
const { prepararIngreso, prepararGasto } = require('../finanzas_core/operaciones');
const { prepararTransferencia, prepararReversion, prepararAjuste } = require('../finanzas_core/correcciones');
const { proyectarMovimiento } = require('../finanzas_core/proyecciones');
const c = require('./comun');
const { PERMISOS_OPERACION: permisos } = require('./solicitudes');
const camposEstado = ['iglesiaId', 'cuentaId', 'huboMovimientos', 'saldoMinor', 'solicitudesInciertas', 'aperturaRegistrada'];
const seleccionar = (v, campos) => Object.fromEntries(campos.map(k => [k, v[k]]));
function preparar(entrada) {
  registroExacto(entrada, ['auth', 'operacion', 'solicitud']); registroExacto(entrada.auth, ['uid']); c.id(entrada.auth.uid);
  exigir(Object.hasOwn(permisos, entrada.operacion), 'OPERACION_INCREMENTAL_NO_IMPLEMENTADA');
  const s = entrada.solicitud, op = entrada.operacion;
  registroExacto(s, ['versionEsquema', 'solicitudId', 'iglesiaId', 'periodoId', 'precondiciones', 'fechaContable',
    ...(op === 'transferencia' ? ['origenId', 'destinoId', 'montoMinor'] : op === 'reversion' ? ['originalId', 'motivo', 'referenciaAuditoria'] :
      ['cuentaId', ...(op === 'ajuste' ? ['deltaMinor', 'motivo', 'referenciaAuditoria'] : ['montoMinor']),
        ...(['ingreso', 'gasto'].includes(op) ? ['categoriaId'] : [])])],
  ['ingreso', 'gasto', 'apertura'].includes(op) ? ['descripcion', ...(op === 'ingreso' ? ['aportante'] : [])] : []);
  exigir(s.versionEsquema === 1 && typeof s.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId), 'SOLICITUD_ID_INVALIDA');
  c.base(s.iglesiaId); validarFechaYPeriodo(s.fechaContable, s.periodoId);
  const copia = JSON.parse(c.canon({ uid: entrada.auth.uid, operacion: op, solicitud: s }));
  exigir(Buffer.byteLength(c.canon(copia)) <= 16384, 'SOLICITUD_DEMASIADO_GRANDE');
  return { ...copia, huella: c.hash(copia), movimientoId: c.hash([`finanzas-${op}-v1`, copia.uid, s.iglesiaId, s.solicitudId]) };
}
function crearAdaptadorIncremental({ db, FieldValue }) {
  async function ejecutar(entrada) {
    if (['crearCuenta', 'crearCategoria'].includes(entrada.operacion)) {
      return require('./catalogos').ejecutarCatalogo({ db, FieldValue, entrada });
    }
    c.entornoOperacion(); const e = preparar(entrada), s = e.solicitud, b = c.base(s.iglesiaId), op = e.operacion;
    const ref = x => db.doc(`${b}/${x}`), reciboRef = db.doc(`operaciones_financieras/${e.uid}/solicitudes/${s.solicitudId}`);
    try { return await db.runTransaction(async tx => {
      const recibo = await tx.get(reciboRef);
      const descartada = await tx.get(db.doc(`finanzas_resoluciones/${e.uid}/solicitudes/${s.solicitudId}`));
      exigir(!descartada.exists, 'SOLICITUD_DESCARTADA');
      if (recibo.exists) {
        const r = recibo.data(), m = await tx.get(ref(`finanzas_movimientos/${e.movimientoId}`));
        exigir(r.estado === 'confirmado' && r.versionEsquema === 1 && r.uid === e.uid && r.iglesiaId === s.iglesiaId &&
          r.operacion === op && r.huella === e.huella && r.movimientoId === e.movimientoId &&
          r.solicitudId === s.solicitudId && r.pertenenciaId === s.precondiciones.pertenenciaId &&
          m.exists && m.data().huella === e.huella && m.data().secuencia === r.secuencia &&
          m.data().responsable.uid === e.uid && m.data().responsable.pertenenciaId === r.pertenenciaId,
        'RECIBO_NO_COINCIDE');
        return { estado: 'CONFIRMADA', historica: true, movimientoId: e.movimientoId, secuencia: r.secuencia };
      }
      const ps = await tx.get(ref('finanzas_control/protocolo')); c.protocolo(ps.data(), s.iglesiaId);
      const auth = await c.autorizar(db, tx, e.uid, s.iglesiaId, permisos[op], s.precondiciones);
      const [configS, periodoS, controlS, incrementalS, resumenS, auditoriaS, movimientoS] = await Promise.all([
        'finanzas_config/contabilidad', 'finanzas_control/periodo', 'finanzas_control/libro', 'finanzas_control/incremental_v1',
        `finanzas_resumenes/${s.periodoId}`, `finanzas_auditoria/${e.movimientoId}`, `finanzas_movimientos/${e.movimientoId}`
      ].map(x => tx.get(ref(x))));
      exigir(configS.exists && periodoS.exists && controlS.exists, 'DOCUMENTO_REQUERIDO');
      const cfg = validarConfiguracionContable(configS.data(), s.iglesiaId), control = controlS.data();
      const v = c.verificar(incrementalS.data(), control, s.iglesiaId);
      exigir(v.proyeccion.periodo.periodoId === s.periodoId && c.canon(v.proyeccion.configuracion) === c.canon(c.configDinero(cfg)), 'PERIODO_PROYECCION_DISTINTO');
      exigir(resumenS.exists && resumenS.data().ultimaSecuencia === control.ultimaSecuencia &&
        isDeepStrictEqual(resumenS.data().datos, c.resumen(v)), 'RESUMEN_PROYECCION_DIVERGENTE');
      exigir(!auditoriaS.exists && !movimientoS.exists, 'MOVIMIENTO_SIN_RECIBO');
      const estadoLibro = { iglesiaId: s.iglesiaId, huboMovimientos: control.huboMovimientos, periodosAbiertos: periodoS.data().periodosAbiertos };
      exigirPeriodoContableAbierto(estadoLibro, s.iglesiaId, s.periodoId);
      let originalS, marcaS;
      if (op === 'reversion') {
        c.id(s.originalId); [originalS, marcaS] = await Promise.all([
          tx.get(ref(`finanzas_movimientos/${s.originalId}`)), tx.get(ref(`finanzas_reversiones/${s.originalId}`))]);
        exigir(originalS.exists && !marcaS.exists, 'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
      }
      const ids = op === 'transferencia' ? [s.origenId, s.destinoId] : op === 'reversion' ?
        originalS.data().movimiento.asientos.map(a => a.cuentaId) : [s.cuentaId];
      exigir(ids.length >= 1 && ids.length <= 2 && new Set(ids).size === ids.length, 'CUENTAS_CORRECCION_INVALIDAS');
      const seleccionadas = [];
      for (const cuentaId of ids) {
        c.id(cuentaId); const [cs, ss] = await Promise.all([
          tx.get(ref(`finanzas_cuentas/${cuentaId}`)), tx.get(ref(`finanzas_saldos/${cuentaId}`))]);
        exigir(cs.exists && ss.exists && v.cuentas[cuentaId], 'DESTINO_NO_EXISTE');
        const cuenta = validarCuenta(cs.data().cuenta, s.iglesiaId);
        exigir(cuenta.id === cuentaId, 'CUENTA_DOCUMENTO_DISTINTO');
        const estado = validarEstadoCuenta(seleccionar(ss.data(), camposEstado), cuenta), p = v.cuentas[cuentaId];
        exigir(estado.saldoMinor === p.saldoMinor && ss.data().ultimaSecuencia === p.revision &&
          estado.huboMovimientos === (p.revision > 0) && estado.aperturaRegistrada === Boolean(v.aperturas[cuentaId]), 'SALDO_PROYECCION_DIVERGENTE');
        exigir(!v.aperturas[cuentaId] || s.fechaContable >= v.aperturas[cuentaId].fechaContable, 'APERTURA_NO_INICIAL');
        seleccionadas.push({ cuenta, estado, version: c.ver(cs) });
      }
      const versiones = { iglesia: c.ver(auth.iglesia), configuracion: c.ver(configS), controlPeriodo: c.ver(periodoS) };
      let plan, aperturaS;
      const solicitud = { ...s, idMovimiento: e.movimientoId };
      if (['ingreso', 'gasto'].includes(op)) {
        c.id(s.categoriaId); const categoriaS = await tx.get(ref(`finanzas_categorias/${s.categoriaId}`));
        exigir(categoriaS.exists && categoriaS.data().categoria.id === s.categoriaId, 'DESTINO_NO_EXISTE');
        plan = (op === 'ingreso' ? prepararIngreso : prepararGasto)({ solicitud, contexto: {
          autorizacion: auth.contexto, configuracion: cfg, estadoLibro, cuenta: seleccionadas[0].cuenta,
          estadoCuenta: seleccionadas[0].estado, categoria: categoriaS.data().categoria,
          versiones: { ...versiones, cuenta: seleccionadas[0].version, categoria: c.ver(categoriaS) } } });
      } else if (op === 'apertura') {
        registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', 'iglesia', 'configuracion', 'controlPeriodo', 'cuenta']);
        for (const [k, version] of Object.entries({ ...versiones, cuenta: seleccionadas[0].version })) exigir(s.precondiciones[k] === version, 'CONTEXTO_OPERACION_MODIFICADO');
        aperturaS = await tx.get(ref(`finanzas_aperturas/${s.cuentaId}`)); exigir(!aperturaS.exists, 'APERTURA_DUPLICADA');
        const movimiento = crearApertura({ id: e.movimientoId, cuenta: seleccionar(seleccionadas[0].cuenta, ['id', 'moneda', 'escala']),
          montoMinor: s.montoMinor, fechaContable: s.fechaContable, periodoId: s.periodoId, configuracion: c.configDinero(cfg) });
        validarAperturaCuenta({ iglesiaId: s.iglesiaId, cuenta: seleccionadas[0].cuenta, estadoCuenta: seleccionadas[0].estado, movimiento });
        plan = { movimiento, clasificacion: { cuentaId: s.cuentaId, categoriaId: null, naturaleza: 'patrimonial', tipoIngreso: null },
          responsable: { uid: e.uid, pertenenciaId: auth.actor.data().pertenenciaId }, descripcion: s.descripcion ?? null,
          privado: { aportante: null }, precondiciones: s.precondiciones };
      } else {
        plan = ({ transferencia: prepararTransferencia, reversion: prepararReversion, ajuste: prepararAjuste })[op]({ solicitud,
          contexto: { autorizacion: auth.contexto, configuracion: cfg, estadoLibro, versiones, cuentas: seleccionadas,
            ...(op === 'reversion' ? { original: { iglesiaId: originalS.data().iglesiaId, estado: originalS.data().estado,
              version: c.ver(originalS), movimiento: originalS.data().movimiento, clasificacion: originalS.data().clasificacion,
              reversion: { version: null, movimientoId: null } } } : {}) } });
      }
      const siguiente = control.ultimaSecuencia + 1;
      const proyeccion = proyectarMovimiento({ estadoAnterior: v.proyeccion,
        cuentasAnteriores: ids.map(id => v.cuentas[id]), movimiento: plan.movimiento,
        original: op === 'reversion' ? { movimiento: originalS.data().movimiento, revision: originalS.data().secuencia, reversionId: null } : null,
        aplicacion: { revisionAnterior: control.ultimaSecuencia, revisionNueva: siguiente, movimientoId: e.movimientoId } });
      const nuevo = { ...v, proyeccion: proyeccion.estado, cuentas: { ...v.cuentas }, aperturas: { ...v.aperturas } };
      for (const saldo of proyeccion.cuentas) nuevo.cuentas[saldo.cuentaId] = saldo;
      if (op === 'apertura') nuevo.aperturas[s.cuentaId] = { id: e.movimientoId, fechaContable: s.fechaContable, secuencia: siguiente };
      const timestamp = FieldValue.serverTimestamp();
      // Barrera: todas las lecturas y validaciones preceden a cualquier escritura.
      tx.create(ref(`finanzas_movimientos/${e.movimientoId}`), { versionEsquema: 1, iglesiaId: s.iglesiaId,
        estado: 'confirmado', secuencia: siguiente, movimiento: plan.movimiento, clasificacion: plan.clasificacion,
        responsable: plan.responsable, solicitudId: s.solicitudId, huella: e.huella,
        descripcion: plan.descripcion ?? null, privado: plan.privado ?? { aportante: null,
          ...(op === 'reversion' || op === 'ajuste' ? { motivo: plan.motivo, referenciaAuditoria: plan.referenciaAuditoria } : {}) },
        precondiciones: plan.precondiciones, fechaCreacion: timestamp });
      for (const saldo of proyeccion.cuentas) tx.update(ref(`finanzas_saldos/${saldo.cuentaId}`), {
        saldoMinor: saldo.saldoMinor, huboMovimientos: true, ultimaSecuencia: siguiente,
        ...(op === 'apertura' ? { aperturaRegistrada: true } : {}), fechaActualizacion: timestamp });
      if (op === 'reversion') tx.create(ref(`finanzas_reversiones/${s.originalId}`), { versionEsquema: 1,
        iglesiaId: s.iglesiaId, ...plan.controlReversion, secuencia: siguiente, fechaCreacion: timestamp });
      if (op === 'apertura') tx.create(ref(`finanzas_aperturas/${s.cuentaId}`), { versionEsquema: 1,
        iglesiaId: s.iglesiaId, cuentaId: s.cuentaId, movimientoId: e.movimientoId, secuencia: siguiente, fechaCreacion: timestamp });
      tx.update(ref('finanzas_control/incremental_v1'), c.sellar(nuevo));
      tx.update(ref('finanzas_control/libro'), { ultimaSecuencia: siguiente, huboMovimientos: true, fechaActualizacion: timestamp });
      tx.update(ref(`finanzas_resumenes/${s.periodoId}`), { datos: c.resumen(nuevo), ultimaSecuencia: siguiente, fechaActualizacion: timestamp });
      tx.create(ref(`finanzas_auditoria/${e.movimientoId}`), { versionEsquema: 1, iglesiaId: s.iglesiaId,
        evento: `${op}_registrado`, responsable: plan.responsable, solicitudId: s.solicitudId,
        movimientoId: e.movimientoId, secuencia: siguiente, fechaCreacion: timestamp });
      tx.create(reciboRef, { versionEsquema: 1, uid: e.uid, operacion: op, iglesiaId: s.iglesiaId,
        solicitudId: s.solicitudId, huella: e.huella, pertenenciaId: plan.responsable.pertenenciaId,
        movimientoId: e.movimientoId, estado: 'confirmado', secuencia: siguiente, fechaCreacion: timestamp });
      return { estado: 'CONFIRMADA', historica: false, movimientoId: e.movimientoId, secuencia: siguiente };
    }); } catch (error) { if (error instanceof ErrorContable) throw error; throw new ErrorContable('RESULTADO_INCIERTO'); }
  }
  return { ejecutar };
}
module.exports = { crearAdaptadorIncremental };
