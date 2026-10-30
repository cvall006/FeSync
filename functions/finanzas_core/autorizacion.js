'use strict';

const { exigir, registroExacto, ErrorContable } = require('./dinero');
const { pertenenciaIdValido } = require('../pertenencia');

const OPERACIONES_CONTABLES = Object.freeze(['leer', 'registrarIngresosGastos', 'transferir',
  'administrarCatalogos', 'registrarAjustes', 'anularMovimientos', 'prepararCierre',
  'aprobarCierre', 'reabrirCierre', 'administrarConfiguracion']);
const OPERACIONES_ENCARGADO = Object.freeze(['leer', 'registrarIngresosGastos', 'transferir', 'prepararCierre']);
const campos = Object.freeze(['auth', 'iglesiaId', 'perfilActor', 'iglesia', 'perfilTitular',
  'acceso', 'pertenenciaIdEsperada', 'versionAccesoEsperada']);

function idValido(v, limite = 1500) {
  return typeof v === 'string' && v.length > 0 && v.length <= limite &&
    Buffer.byteLength(v, 'utf8') <= 1500 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}
function versionValida(v) {
  if (typeof v !== 'string' || !/^-?\d{1,12}:\d{1,9}$/.test(v)) return false;
  const [s, n] = v.split(':').map(Number);
  return Number.isSafeInteger(s) && s >= -62135596800 && s <= 253402300799 &&
    Number.isInteger(n) && n >= 0 && n < 1000000000 && v === `${s}:${n}`;
}
function mapa(v) {
  exigir(v !== null && typeof v === 'object' && !Array.isArray(v), 'CONTEXTO_INVALIDO');
  // Los documentos admiten campos auxiliares, pero no getters o símbolos.
  registroExacto(v, Object.keys(v));
}
function documento(v) {
  registroExacto(v, ['id', 'datos']);
  mapa(v.datos);
}
function decision(motivo, titular = false, encargado = false) {
  return Object.freeze({ autorizado: motivo === 'AUTORIZADO', motivo,
    permisos: Object.freeze(Object.fromEntries(OPERACIONES_CONTABLES.map((op) =>
      [op, titular || (encargado && OPERACIONES_ENCARGADO.includes(op))]))) });
}

/**
 * Evaluación PURA de observaciones confiables del servidor; no autentica tokens.
 * auth se toma exclusivamente de request.auth, nunca de request.data.
 * Documentos y versiones: snapshots actuales del MISMO intento transaccional.
 * La versión de acceso es updateTime canónico segundos:nanosegundos, no un
 * campo nuevo. La precondición recibida no concede autoridad.
 * No sustituye las funciones actuales, no lee elegibilidad ni conserva decisiones.
 */
function evaluarAutorizacionContable(contexto) {
  try {
    registroExacto(contexto, campos);
    const { auth, iglesiaId, perfilActor, iglesia, perfilTitular, acceso,
      pertenenciaIdEsperada, versionAccesoEsperada } = contexto;
    if (auth === null || auth === undefined) return decision('SIN_AUTENTICACION');
    mapa(auth);
    if (!idValido(auth.uid, 128)) return decision('SIN_AUTENTICACION');
    exigir(idValido(iglesiaId), 'CONTEXTO_INVALIDO');
    documento(perfilActor); documento(iglesia); documento(perfilTitular);
    registroExacto(acceso, ['id', 'iglesiaId', 'version', 'datos']);
    mapa(acceso.datos);
    exigir(perfilActor.id === auth.uid && iglesia.id === iglesiaId &&
      acceso.id === 'acceso' && acceso.iglesiaId === iglesiaId, 'IDENTIDAD_O_RUTA_INCOHERENTE');
    const actor = perfilActor.datos;
    const titular = perfilTitular.datos;
    exigir(idValido(iglesia.datos.adminUid, 128) && perfilTitular.id === iglesia.datos.adminUid &&
      titular.iglesiaId === iglesiaId && titular.rolGlobal === 'admin_iglesia', 'TITULAR_INCOHERENTE');
    if (actor.iglesiaId !== iglesiaId) return decision('SIN_PERTENENCIA_ACTUAL');
    exigir(['admin_iglesia', 'lider_area', 'servidor'].includes(actor.rolGlobal), 'ROL_INCOHERENTE');
    const esTitular = auth.uid === iglesia.datos.adminUid;
    exigir((actor.rolGlobal === 'admin_iglesia') === esTitular, 'ROL_INCOHERENTE');
    if (!pertenenciaIdValido(actor.pertenenciaId) || !pertenenciaIdValido(pertenenciaIdEsperada)) {
      return decision('PERTENENCIA_NO_VERIFICABLE');
    }
    if (actor.pertenenciaId !== pertenenciaIdEsperada) return decision('PERTENENCIA_ANTERIOR');
    if (esTitular) {
      exigir(titular.pertenenciaId === actor.pertenenciaId, 'TITULAR_INCOHERENTE');
    }
    exigir(typeof acceso.datos.moduloHabilitado === 'boolean' &&
      (acceso.datos.encargadoUid === null || idValido(acceso.datos.encargadoUid, 128)), 'ACCESO_INCOMPLETO');
    if (acceso.datos.moduloHabilitado !== true) return decision('MODULO_DESHABILITADO');
    exigir(versionValida(acceso.version) && versionValida(versionAccesoEsperada), 'VERSION_ACCESO_INVALIDA');
    if (acceso.version !== versionAccesoEsperada) return decision('ACCESO_MODIFICADO');
    const esEncargado = acceso.datos.encargadoUid === auth.uid;
    return esTitular || esEncargado ? decision('AUTORIZADO', esTitular, esEncargado)
      : decision('SIN_DESIGNACION');
  } catch (e) {
    // Sin documentos, UID o mensajes de excepciones ajenas en el resultado.
    return decision(e instanceof ErrorContable ? e.codigo : 'CONTEXTO_INVALIDO');
  }
}
function exigirPermisoContable(contexto, operacion) {
  exigir(OPERACIONES_CONTABLES.includes(operacion), 'OPERACION_CONTABLE_INVALIDA');
  const resultado = evaluarAutorizacionContable(contexto);
  exigir(resultado.permisos[operacion] === true, 'CONTABILIDAD_NO_AUTORIZADA');
  return resultado;
}

module.exports = Object.freeze({ OPERACIONES_CONTABLES, evaluarAutorizacionContable, exigirPermisoContable });
