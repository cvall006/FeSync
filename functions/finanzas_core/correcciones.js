'use strict';

const { exigir, registroExacto, validarEnteroMinor, validarMontoPositivo,
  sumarMinor, validarFechaYPeriodo } = require('./dinero');
const { crearTransferencia, crearAjuste, revertirMovimiento, validarMovimiento } = require('./asientos');
const { exigirPermisoContable } = require('./autorizacion');
const { validarConfiguracionContable, exigirPeriodoContableAbierto } = require('./configuracion');
const { validarEstadoCuenta, cuentaParaNuevoMovimiento } = require('./cuentas');
const { TIPOS_INGRESO } = require('./categorias');
const VERSIONES = Object.freeze(['iglesia', 'configuracion', 'controlPeriodo']);

function id(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_CORRECCION_INVALIDO');
}
function version(v) {
  exigir(typeof v === 'string' && /^-?\d{1,12}:\d{1,9}$/.test(v) && v === v.trim(), 'VERSION_CORRECCION_INVALIDA');
  const [s, n] = v.split(':').map(Number);
  exigir(Number.isSafeInteger(s) && s >= -62135596800 && s <= 253402300799 &&
    Number.isInteger(n) && n >= 0 && n < 1000000000 && v === `${s}:${n}`, 'VERSION_CORRECCION_INVALIDA');
}
function motivo(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 480 && v === v.trim() &&
    v === v.normalize('NFC') && Array.from(v).length <= 240 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v), 'MOTIVO_CORRECCION_INVALIDO');
}
function preparar(entrada, tipo) {
  registroExacto(entrada, ['solicitud', 'contexto']);
  const { solicitud: s, contexto: c } = entrada;
  const esReversion = tipo === 'reversion';
  const extras = tipo === 'transferencia' ? ['origenId', 'destinoId', 'montoMinor'] :
    [...(esReversion ? ['originalId'] : ['cuentaId', 'deltaMinor']), 'motivo', 'referenciaAuditoria'];
  registroExacto(s, ['versionEsquema', 'solicitudId', 'idMovimiento', 'iglesiaId', 'fechaContable', 'periodoId', 'precondiciones', ...extras]);
  registroExacto(c, ['autorizacion', 'configuracion', 'estadoLibro', 'versiones', 'cuentas', ...(esReversion ? ['original'] : [])]);
  exigir(s.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA'); id(s.idMovimiento);
  exigir(typeof s.solicitudId === 'string' && s.solicitudId.length >= 16 && s.solicitudId.length <= 128 &&
    s.solicitudId === s.solicitudId.trim() && /^[A-Za-z0-9_-]+$/.test(s.solicitudId), 'SOLICITUD_ID_INVALIDA');
  validarFechaYPeriodo(s.fechaContable, s.periodoId);
  registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', ...VERSIONES, 'cuentas', ...(esReversion ? ['original'] : [])]);
  registroExacto(c.versiones, VERSIONES);
  exigirPermisoContable(c.autorizacion, tipo === 'transferencia' ? 'transferir' :
    esReversion ? 'anularMovimientos' : 'registrarAjustes');
  exigir(c.autorizacion.iglesiaId === s.iglesiaId, 'CORRECCION_OTRA_IGLESIA');
  exigir(s.precondiciones.pertenenciaId === c.autorizacion.pertenenciaIdEsperada &&
    s.precondiciones.acceso === c.autorizacion.versionAccesoEsperada, 'INTENCION_AUTORIZACION_DISTINTA');
  version(s.precondiciones.acceso);
  for (const k of VERSIONES) {
    version(s.precondiciones[k]); version(c.versiones[k]);
    exigir(s.precondiciones[k] === c.versiones[k], 'CONTEXTO_CORRECCION_MODIFICADO');
  }
  const cfg = validarConfiguracionContable(c.configuracion, s.iglesiaId);
  const configuracion = { moneda: cfg.moneda, escala: cfg.escala, zonaHoraria: cfg.zonaHoraria };
  exigirPeriodoContableAbierto(c.estadoLibro, s.iglesiaId, s.periodoId);
  exigir(Array.isArray(c.cuentas) && c.cuentas.length >= 1 && c.cuentas.length <= 2 &&
    Array.isArray(s.precondiciones.cuentas) && s.precondiciones.cuentas.length === c.cuentas.length, 'CUENTAS_CORRECCION_INVALIDAS');
  const esperadas = new Map();
  for (const e of s.precondiciones.cuentas) {
    registroExacto(e, ['cuentaId', 'version']); id(e.cuentaId); version(e.version);
    exigir(!esperadas.has(e.cuentaId), 'CUENTA_DUPLICADA'); esperadas.set(e.cuentaId, e.version);
  }
  const cuentas = new Map();
  for (const e of c.cuentas) {
    registroExacto(e, ['cuenta', 'estado', 'version']);
    const ref = cuentaParaNuevoMovimiento(e.cuenta, s.iglesiaId);
    const estado = validarEstadoCuenta(e.estado, e.cuenta); version(e.version);
    exigir(!cuentas.has(ref.id), 'CUENTA_DUPLICADA');
    exigir(esperadas.get(ref.id) === e.version, 'CONTEXTO_CORRECCION_MODIFICADO');
    exigir(!estado.huboMovimientos || c.estadoLibro.huboMovimientos, 'HISTORIAL_LIBRO_INCOHERENTE');
    exigir(estado.solicitudesInciertas === 0, 'CUENTA_CON_SOLICITUDES_INCIERTAS');
    cuentas.set(ref.id, { ref, estado });
  }
  const base = { id: s.idMovimiento, fechaContable: s.fechaContable, periodoId: s.periodoId, configuracion };
  let movimiento, clasificacion = null, controlReversion = null;
  if (tipo === 'transferencia') {
    id(s.origenId); id(s.destinoId); validarMontoPositivo(s.montoMinor);
    exigir(cuentas.size === 2 && s.origenId !== s.destinoId && cuentas.has(s.origenId) && cuentas.has(s.destinoId), 'DESTINOS_TRANSFERENCIA_INVALIDOS');
    movimiento = crearTransferencia({ ...base, origen: cuentas.get(s.origenId).ref,
      destino: cuentas.get(s.destinoId).ref, montoMinor: s.montoMinor });
  } else {
    motivo(s.motivo); id(s.referenciaAuditoria);
    if (!esReversion) {
      id(s.cuentaId); validarEnteroMinor(s.deltaMinor);
      exigir(cuentas.size === 1 && cuentas.has(s.cuentaId), 'CUENTA_AJUSTE_INVALIDA');
      movimiento = crearAjuste({ ...base, cuenta: cuentas.get(s.cuentaId).ref, montoMinor: s.deltaMinor });
    } else {
      id(s.originalId);
      const o = c.original, p = s.precondiciones.original;
      registroExacto(o, ['iglesiaId', 'version', 'estado', 'movimiento', 'clasificacion', 'reversion']);
      registroExacto(p, ['version', 'versionReversion']);
      registroExacto(o.reversion, ['version', 'movimientoId']);
      version(o.version); version(p.version);
      exigir(o.iglesiaId === s.iglesiaId && o.estado === 'confirmado' && o.version === p.version, 'ORIGINAL_NO_ACREDITADO');
      if (o.reversion.version !== null) version(o.reversion.version);
      if (p.versionReversion !== null) version(p.versionReversion);
      exigir(o.reversion.version === p.versionReversion && o.reversion.movimientoId === null, 'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
      const refs = [...cuentas.values()].map(x => x.ref);
      const original = validarMovimiento(o.movimiento, { cuentas: refs, configuracion });
      exigir(original.id === s.originalId && original.reversaDe === null &&
        ['ingreso', 'gasto', 'transferencia'].includes(original.clase), 'ORIGINAL_NO_REVERSIBLE');
      exigir(original.asientos.length === cuentas.size && [...cuentas.values()].every(x => x.estado.huboMovimientos), 'HISTORIAL_ORIGINAL_INCOHERENTE');
      if (original.clase === 'transferencia') exigir(o.clasificacion === null, 'CLASIFICACION_ORIGINAL_INVALIDA');
      else {
        registroExacto(o.clasificacion, ['cuentaId', 'categoriaId', 'naturaleza', 'tipoIngreso']);
        id(o.clasificacion.categoriaId);
        exigir(o.clasificacion.cuentaId === original.asientos[0].cuentaId && o.clasificacion.naturaleza === original.clase &&
          (original.clase === 'ingreso' ? TIPOS_INGRESO.includes(o.clasificacion.tipoIngreso) : o.clasificacion.tipoIngreso === null), 'CLASIFICACION_ORIGINAL_INVALIDA');
        clasificacion = Object.freeze({ ...o.clasificacion });
      }
      movimiento = revertirMovimiento({ ...base, original, cuentas: refs });
      controlReversion = Object.freeze({ originalId: original.id, versionOriginal: o.version,
        versionControlAnterior: o.reversion.version, reversionId: s.idMovimiento });
    }
  }
  const saldosPropuestos = movimiento.asientos.map(({ cuentaId, deltaMinor }) => {
    const anteriorMinor = cuentas.get(cuentaId).estado.saldoMinor;
    if (deltaMinor < 0) exigir(anteriorMinor >= -deltaMinor, 'SALDO_INSUFICIENTE');
    return Object.freeze({ iglesiaId: s.iglesiaId, cuentaId, anteriorMinor,
      nuevoMinor: sumarMinor([anteriorMinor, deltaMinor]) });
  });
  const precondiciones = Object.freeze({ ...s.precondiciones,
    cuentas: Object.freeze(s.precondiciones.cuentas.map(x => Object.freeze({ ...x }))),
    ...(esReversion ? { original: Object.freeze({ ...s.precondiciones.original }) } : {}) });
  return Object.freeze({ versionEsquema: 1, iglesiaId: s.iglesiaId, solicitudId: s.solicitudId,
    tipoOperacion: tipo, movimiento, clasificacion, precondiciones,
    responsable: Object.freeze({ uid: c.autorizacion.auth.uid, pertenenciaId: c.autorizacion.perfilActor.datos.pertenenciaId }),
    motivo: tipo === 'transferencia' ? null : s.motivo,
    referenciaAuditoria: tipo === 'transferencia' ? null : s.referenciaAuditoria,
    saldosPropuestos: Object.freeze(saldosPropuestos), controlReversion });
}
function prepararTransferencia(entrada) { return preparar(entrada, 'transferencia'); }
function prepararReversion(entrada) { return preparar(entrada, 'reversion'); }
function prepararAjuste(entrada) { return preparar(entrada, 'ajuste'); }

module.exports = Object.freeze({ prepararTransferencia, prepararReversion, prepararAjuste });
