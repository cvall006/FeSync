'use strict';

const { exigir, registroExacto, validarMontoPositivo, sumarMinor, restarMinor,
  validarFechaYPeriodo } = require('./dinero');
const { crearIngreso, crearGasto } = require('./asientos');
const { exigirPermisoContable } = require('./autorizacion');
const { validarConfiguracionContable, exigirPeriodoContableAbierto } = require('./configuracion');
const { validarCuenta, validarEstadoCuenta, cuentaParaNuevoMovimiento } = require('./cuentas');
const { categoriaParaNuevoMovimiento } = require('./categorias');

const VERSIONES = Object.freeze(['iglesia', 'cuenta', 'categoria', 'configuracion', 'controlPeriodo']);
function validarId(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_OPERACION_INVALIDO');
}
function texto(v, maximo) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= maximo * 2 &&
    v === v.trim() && v === v.normalize('NFC') && Array.from(v).length <= maximo &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v), 'TEXTO_OPERACION_INVALIDO');
  return v;
}
function validarVersion(v) {
  exigir(typeof v === 'string' && /^-?\d{1,12}:\d{1,9}$/.test(v) && v === v.trim(), 'VERSION_OPERACION_INVALIDA');
  const [s, n] = v.split(':').map(Number);
  exigir(Number.isSafeInteger(s) && s >= -62135596800 && s <= 253402300799 &&
    Number.isInteger(n) && n >= 0 && n < 1000000000 && v === `${s}:${n}`, 'VERSION_OPERACION_INVALIDA');
}
function preparar(entrada, clase) {
  registroExacto(entrada, ['solicitud', 'contexto']);
  const { solicitud: s, contexto: c } = entrada;
  registroExacto(s, ['versionEsquema', 'solicitudId', 'idMovimiento', 'iglesiaId', 'cuentaId',
    'categoriaId', 'montoMinor', 'fechaContable', 'periodoId', 'precondiciones'],
  clase === 'ingreso' ? ['descripcion', 'aportante'] : ['descripcion']);
  registroExacto(c, ['autorizacion', 'configuracion', 'estadoLibro', 'cuenta', 'categoria', 'estadoCuenta', 'versiones']);
  exigir(s.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA');
  exigir(typeof s.solicitudId === 'string' && s.solicitudId.length >= 16 && s.solicitudId.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(s.solicitudId) && s.solicitudId === s.solicitudId.trim(), 'SOLICITUD_ID_INVALIDA');
  validarId(s.idMovimiento); validarId(s.cuentaId); validarId(s.categoriaId);
  validarMontoPositivo(s.montoMinor);
  validarFechaYPeriodo(s.fechaContable, s.periodoId);
  registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', ...VERSIONES]);
  registroExacto(c.versiones, VERSIONES);
  exigirPermisoContable(c.autorizacion, 'registrarIngresosGastos');
  exigir(c.autorizacion.iglesiaId === s.iglesiaId, 'OPERACION_OTRA_IGLESIA');
  exigir(s.precondiciones.pertenenciaId === c.autorizacion.pertenenciaIdEsperada &&
    s.precondiciones.acceso === c.autorizacion.versionAccesoEsperada, 'INTENCION_AUTORIZACION_DISTINTA');
  validarVersion(s.precondiciones.acceso);
  for (const k of VERSIONES) {
    validarVersion(s.precondiciones[k]); validarVersion(c.versiones[k]);
    exigir(s.precondiciones[k] === c.versiones[k], 'CONTEXTO_OPERACION_MODIFICADO');
  }
  const configuracion = validarConfiguracionContable(c.configuracion, s.iglesiaId);
  exigirPeriodoContableAbierto(c.estadoLibro, s.iglesiaId, s.periodoId);
  const cuenta = validarCuenta(c.cuenta, s.iglesiaId);
  const referencia = cuentaParaNuevoMovimiento(cuenta, s.iglesiaId);
  const categoria = categoriaParaNuevoMovimiento({ iglesiaId: s.iglesiaId, categoria: c.categoria, clase });
  exigir(cuenta.id === s.cuentaId && categoria.id === s.categoriaId, 'DESTINO_OPERACION_DISTINTO');
  const estado = validarEstadoCuenta(c.estadoCuenta, cuenta);
  exigir(!estado.huboMovimientos || c.estadoLibro.huboMovimientos, 'HISTORIAL_LIBRO_INCOHERENTE');
  exigir(estado.solicitudesInciertas === 0, 'CUENTA_CON_SOLICITUDES_INCIERTAS');
  if (clase === 'gasto') exigir(estado.saldoMinor >= s.montoMinor, 'SALDO_INSUFICIENTE');
  const nuevoMinor = clase === 'ingreso' ? sumarMinor([estado.saldoMinor, s.montoMinor])
    : restarMinor(estado.saldoMinor, s.montoMinor);
  const descripcion = Object.hasOwn(s, 'descripcion') ? texto(s.descripcion, 240) : null;
  let aportante = null;
  if (Object.hasOwn(s, 'aportante') && s.aportante !== null) {
    registroExacto(s.aportante, ['nombre']);
    aportante = Object.freeze({ nombre: texto(s.aportante.nombre, 120) });
  }
  const movimiento = (clase === 'ingreso' ? crearIngreso : crearGasto)({ id: s.idMovimiento,
    fechaContable: s.fechaContable, periodoId: s.periodoId, cuenta: referencia, montoMinor: s.montoMinor,
    configuracion: { moneda: configuracion.moneda, escala: configuracion.escala, zonaHoraria: configuracion.zonaHoraria } });
  // Solo propuesta privada: ni una confirmación, ni escrituras de saldo, ni un recibo.
  return Object.freeze({ versionEsquema: 1, iglesiaId: s.iglesiaId, solicitudId: s.solicitudId,
    movimiento, clasificacion: Object.freeze({ cuentaId: cuenta.id, categoriaId: categoria.id,
      naturaleza: categoria.naturaleza, tipoIngreso: categoria.tipoIngreso }),
    responsable: Object.freeze({ uid: c.autorizacion.auth.uid,
      pertenenciaId: c.autorizacion.perfilActor.datos.pertenenciaId }),
    precondiciones: Object.freeze({ ...s.precondiciones }), descripcion,
    privado: Object.freeze({ aportante }),
    saldoPropuesto: Object.freeze({ iglesiaId: s.iglesiaId, cuentaId: cuenta.id,
      anteriorMinor: estado.saldoMinor, nuevoMinor }) });
}
function prepararIngreso(entrada) { return preparar(entrada, 'ingreso'); }
function prepararGasto(entrada) { return preparar(entrada, 'gasto'); }

module.exports = Object.freeze({ prepararIngreso, prepararGasto });
