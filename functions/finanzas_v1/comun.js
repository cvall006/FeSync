'use strict';
const { createHash } = require('node:crypto');
const { exigir, registroExacto } = require('../finanzas_core/dinero');
const { exigirPermisoContable } = require('../finanzas_core/autorizacion');
const { entorno, entornoOperacion } = require('./entorno');
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ?
  `[${v.map(canon).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
const hash = v => createHash('sha256').update(canon(v)).digest('hex');
const ver = s => { exigir(s.exists && s.updateTime, 'DOCUMENTO_REQUERIDO'); return `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`; };
const id = v => exigir(typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v), 'ID_INVALIDO');
const base = iglesiaId => { id(iglesiaId); return `iglesias/${iglesiaId}`; };
const configDinero = c => ({ moneda: c.moneda, escala: c.escala, zonaHoraria: c.zonaHoraria });
function protocolo(d, iglesiaId, pausado = false) {
  registroExacto(d, ['versionProtocolo', 'iglesiaId', 'epoca', 'estado']);
  exigir(d.versionProtocolo === 1 && d.iglesiaId === iglesiaId &&
    (pausado ? [1, 2].includes(d.epoca) : d.epoca === 2) &&
    d.estado === (pausado ? 'bloqueado' : 'operativo_v1'), 'PROTOCOLO_INCREMENTAL_BLOQUEADO');
}
async function autorizar(db, tx, uid, iglesiaId, permiso = 'leer', precondiciones = null) {
  id(uid); const b = base(iglesiaId);
  const [actor, iglesia, acceso] = await Promise.all([
    tx.get(db.doc(`usuarios_globales/${uid}`)), tx.get(db.doc(b)), tx.get(db.doc(`${b}/finanzas_config/acceso`))]);
  exigir(actor.exists && iglesia.exists && acceso.exists, 'CONTABILIDAD_NO_AUTORIZADA');
  id(iglesia.data().adminUid);
  const titular = iglesia.data().adminUid === uid ? actor : await tx.get(db.doc(`usuarios_globales/${iglesia.data().adminUid}`));
  const contexto = { auth: { uid }, iglesiaId, perfilActor: { id: uid, datos: actor.data() },
    iglesia: { id: iglesiaId, datos: iglesia.data() }, perfilTitular: { id: iglesia.data().adminUid, datos: titular.data() },
    acceso: { id: 'acceso', iglesiaId, version: ver(acceso), datos: acceso.data() },
    pertenenciaIdEsperada: precondiciones?.pertenenciaId ?? actor.data().pertenenciaId,
    versionAccesoEsperada: precondiciones?.acceso ?? ver(acceso) };
  const decision = exigirPermisoContable(contexto, permiso);
  return { actor, iglesia, acceso, contexto, permisos: decision.permisos };
}
function sellar(v) { return { ...v, sello: hash(v) }; }
function verificar(v, control, iglesiaId) {
  exigir(v && v.versionEsquema === 1 && v.iglesiaId === iglesiaId &&
    v.estadoVerificacion === 'VERIFICADA_INICIAL' && v.epoca === 2, 'PROYECCION_NO_VERIFICADA');
  const { sello, ...datos } = v;
  exigir(sello === hash(datos) && v.proyeccion.revision === control.ultimaSecuencia &&
    v.proyeccion.iglesiaId === iglesiaId && Number.isSafeInteger(control.ultimaSecuencia) && control.ultimaSecuencia >= 0 &&
    Number.isSafeInteger(v.verificacionInicial.corte) && v.verificacionInicial.corte >= 0 &&
    v.verificacionInicial.corte <= control.ultimaSecuencia &&
    /^[a-f0-9]{64}$/.test(v.verificacionInicial.reporteDigest) &&
    v.verificacionInicial.certificacionHistorica === false &&
    control.versionEsquema === 1 && control.iglesiaId === iglesiaId &&
    control.huboMovimientos === (control.ultimaSecuencia > 0) &&
    Object.keys(v.cuentas).length <= 50, 'PROYECCION_DIVERGENTE');
  for (const [id, saldo] of Object.entries(v.cuentas)) exigir(saldo.iglesiaId === iglesiaId && saldo.cuentaId === id &&
    saldo.periodoId === v.proyeccion.periodo.periodoId && saldo.revision <= control.ultimaSecuencia, 'PROYECCION_DIVERGENTE');
  return datos;
}
function resumen(v) {
  return { ...v.proyeccion.configuracion, ...v.proyeccion.periodo,
    saldoInicialPorCuenta: Object.fromEntries(Object.values(v.cuentas).map(c => [c.cuentaId, c.saldoInicialPeriodoMinor])),
    saldoFinalPorCuenta: Object.fromEntries(Object.values(v.cuentas).map(c => [c.cuentaId, c.saldoFinalPeriodoMinor])) };
}
function habilitacionValida(d, iglesiaId) {
  return d && Object.keys(d).sort().join(',') === 'circuito,habilitado,iglesiaId,versionEsquema' &&
    d.versionEsquema === 1 && d.iglesiaId === iglesiaId && d.circuito === 'v1_incremental' && d.habilitado === true;
}
module.exports = { entorno, entornoOperacion, canon, hash, ver, id, base, configDinero, protocolo, autorizar, sellar, verificar, resumen, habilitacionValida };
