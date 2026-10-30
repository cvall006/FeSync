'use strict';

const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto, validarEnteroMinor, periodoValido, ErrorContable } = require('./dinero');
const { validarMovimiento, calcularLibro } = require('./asientos');
const { TIPOS_INGRESO } = require('./categorias');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('./proyecciones');

const VERSION_ALGORITMO = 1;
const LIMITES = Object.freeze({ pagina: 500, paginas: 2000, documentos: 20000, cuentas: 1000, periodos: 24 });
const TOTALES = Object.freeze(['saldoInicialMinor', 'saldoFinalMinor', 'ingresosNetosMinor',
  'gastosNetosMinor', 'resultadoMinor', 'aperturasNetasMinor', 'ajustesNetosMinor']);
function id(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_CONCILIACION_INVALIDO');
}
function entero(v) { validarEnteroMinor(v); exigir(v >= 0, 'SECUENCIA_CONCILIACION_INVALIDA'); }
function version(v) {
  exigir(typeof v === 'string' && /^-?\d{1,12}:\d{1,9}$/.test(v), 'VERSION_OBSERVACION_INVALIDA');
  const [s, n] = v.split(':').map(Number);
  exigir(s >= -62135596800 && s <= 253402300799 && n >= 0 && n < 1000000000 && v === `${s}:${n}`, 'VERSION_OBSERVACION_INVALIDA');
}
function lista(v, max) {
  exigir(Array.isArray(v) && v.length <= max, 'LIMITE_CONCILIACION_EXCEDIDO');
  exigir(Reflect.ownKeys(v).length === v.length + 1, 'LISTA_CONCILIACION_INVALIDA');
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    exigir(d && 'value' in d && d.enumerable, 'LISTA_CONCILIACION_INVALIDA');
  }
}
function mapa(v) { exigir(v && typeof v === 'object' && !Array.isArray(v), 'REGISTRO_INVALIDO'); registroExacto(v, Object.keys(v)); }
function datosCheckpoint(v, profundidad = 0) {
  exigir(profundidad <= 20, 'CHECKPOINT_INCOHERENTE');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') { validarEnteroMinor(v); return; }
  if (Array.isArray(v)) lista(v, LIMITES.documentos); else mapa(v);
  Object.values(v).forEach(x => datosCheckpoint(x, profundidad + 1));
}
function congelar(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(congelar); Object.freeze(v); }
  return v;
}
function control(v, iglesiaId) {
  registroExacto(v, ['version', 'datos']); version(v.version); mapa(v.datos);
  const d = v.datos; entero(d.ultimaSecuencia);
  exigir(d.versionEsquema === 1 && d.iglesiaId === iglesiaId && d.huboMovimientos === (d.ultimaSecuencia > 0), 'CONTROL_CONCILIACION_INCOHERENTE');
  return { version: v.version, ultimaSecuencia: d.ultimaSecuencia, huboMovimientos: d.huboMovimientos };
}
function contexto(v) {
  registroExacto(v, ['iglesiaId', 'configuracion', 'cuentas', 'periodos', 'controlInicial', 'modoLectura']); id(v.iglesiaId);
  lista(v.cuentas, LIMITES.cuentas); lista(v.periodos, LIMITES.periodos); exigir(v.periodos.length > 0, 'PERIODOS_CONCILIACION_REQUERIDOS');
  exigir(['BEST_EFFORT', 'PAUSA_EXTERNA_DECLARADA'].includes(v.modoLectura), 'MODO_CONCILIACION_INVALIDO');
  const cuentas = v.cuentas.map(c => { registroExacto(c, ['id', 'moneda', 'escala']); id(c.id); return { ...c }; }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const periodos = [...v.periodos]; exigir(periodos.every(periodoValido) && new Set(periodos).size === periodos.length, 'PERIODOS_CONCILIACION_INVALIDOS'); periodos.sort();
  const inicial = crearProyeccionInicial({ iglesiaId: v.iglesiaId, configuracion: v.configuracion, periodoId: periodos[0] });
  calcularLibro({ movimientos: [], cuentas, configuracion: inicial.configuracion }); // Catalogo FIN-2, sin otro validador monetario.
  const c = control(v.controlInicial, v.iglesiaId); exigir(c.ultimaSecuencia <= LIMITES.documentos, 'LIMITE_CONCILIACION_EXCEDIDO');
  return { iglesiaId: v.iglesiaId, configuracion: { ...inicial.configuracion }, cuentas, periodos, controlInicial: c, modoLectura: v.modoLectura };
}
function normalizar(v, c) {
  registroExacto(v, ['id', 'datos'], ['version']); id(v.id);
  exigir(Object.hasOwn(v, 'version'), 'VERSION_OBSERVACION_AUSENTE'); version(v.version); mapa(v.datos);
  const d = v.datos; entero(d.secuencia);
  exigir(d.versionEsquema === 1 && d.iglesiaId === c.iglesiaId && d.estado === 'confirmado', 'DOCUMENTO_HISTORICO_INCOHERENTE');
  const m = d.movimiento;
  registroExacto(m, ['id', 'clase', 'moneda', 'escala', 'zonaHoraria', 'fechaContable', 'periodoId', 'asientos', 'reversaDe']);
  lista(m.asientos, 2);
  const asientos = m.asientos.map(a => { registroExacto(a, ['cuentaId', 'deltaMinor']); return { ...a }; });
  exigir(m.id === v.id, 'MOVIMIENTO_DOCUMENTO_DISTINTO');
  const presente = Object.hasOwn(d, 'clasificacion');
  let clasificacion = null;
  if (presente && d.clasificacion !== null) {
    registroExacto(d.clasificacion, ['cuentaId', 'categoriaId', 'naturaleza', 'tipoIngreso']);
    const x = d.clasificacion; id(x.cuentaId); if (x.categoriaId !== null) id(x.categoriaId);
    exigir(['ingreso', 'gasto', 'patrimonial'].includes(x.naturaleza) &&
      (x.tipoIngreso === null || TIPOS_INGRESO.includes(x.tipoIngreso)), 'CLASIFICACION_INCOHERENTE');
    clasificacion = { ...x };
  }
  return { id: v.id, version: v.version, secuencia: d.secuencia, movimiento: { ...m, asientos }, clasificacionPresente: presente, clasificacion };
}
function incidencia(nivel, codigo, referencia, esperado, observado) {
  return { nivel, codigo, referencia, ...(esperado !== undefined ? { esperado } : {}), ...(observado !== undefined ? { observado } : {}) };
}
function crearMotor(c) {
  return { documentos: [], ids: new Map(), reversiones: new Map(), aperturas: new Map(), fechasMinimas: new Map(), incidencias: [],
    periodos: c.periodos.map(periodoId => ({ estado: crearProyeccionInicial({ iglesiaId: c.iglesiaId, configuracion: c.configuracion, periodoId }),
      saldos: new Map(c.cuentas.map(cuenta => [cuenta.id, crearSaldoInicial({ iglesiaId: c.iglesiaId, cuentaId: cuenta.id, periodoId })])) })) };
}
function aplicar(motor, d, c) {
  exigir(d.secuencia === motor.documentos.length + 1, d.secuencia <= motor.documentos.length ? 'SECUENCIA_DUPLICADA_O_FUERA_DE_ORDEN' : 'DISCONTINUIDAD_SECUENCIA');
  exigir(d.secuencia <= c.controlInicial.ultimaSecuencia, 'MOVIMIENTO_POSTERIOR_AL_CORTE');
  exigir(!motor.ids.has(d.id), 'MOVIMIENTO_DUPLICADO');
  const o = d.movimiento.reversaDe === null ? null : motor.ids.get(d.movimiento.reversaDe);
  if (d.movimiento.reversaDe !== null) {
    exigir(o, 'REVERSA_HUERFANA'); exigir(!motor.reversiones.has(o.id), 'REVERSA_DUPLICADA');
  }
  const m = validarMovimiento(d.movimiento, { cuentas: c.cuentas, configuracion: c.configuracion, ...(o ? { original: o.movimiento } : {}) });
  if (d.clasificacionPresente) {
    const x = d.clasificacion;
    if (['ingreso', 'gasto'].includes(m.clase)) exigir(x && x.cuentaId === m.asientos[0].cuentaId && x.naturaleza === m.clase &&
      x.categoriaId !== null && (m.clase === 'ingreso' ? TIPOS_INGRESO.includes(x.tipoIngreso) : x.tipoIngreso === null), 'CLASIFICACION_INCOHERENTE');
    else if (m.clase === 'apertura') exigir(x && x.cuentaId === m.asientos[0].cuentaId && x.categoriaId === null &&
      x.naturaleza === 'patrimonial' && x.tipoIngreso === null, 'CLASIFICACION_INCOHERENTE');
    else exigir(x === null, 'CLASIFICACION_INCOHERENTE');
    if (o && o.clasificacionPresente) exigir(isDeepStrictEqual(x, o.clasificacion), 'CLASIFICACION_REVERSA_DISTINTA');
  }
  if (m.clase === 'apertura') {
    const cuentaId = m.asientos[0].cuentaId; exigir(!motor.aperturas.has(cuentaId), 'APERTURA_DUPLICADA');
    exigir(!motor.fechasMinimas.has(cuentaId) || motor.fechasMinimas.get(cuentaId) >= m.fechaContable, 'APERTURA_NO_INICIAL');
  }
  for (const a of m.asientos) exigir(!motor.aperturas.has(a.cuentaId) || m.fechaContable >= motor.aperturas.get(a.cuentaId), 'APERTURA_NO_INICIAL');
  const resultados = motor.periodos.map(p => proyectarMovimiento({ estadoAnterior: p.estado,
    cuentasAnteriores: m.asientos.map(a => p.saldos.get(a.cuentaId)), movimiento: m,
    original: o ? { movimiento: o.movimiento, revision: o.secuencia, reversionId: null } : null,
    aplicacion: { revisionAnterior: d.secuencia - 1, revisionNueva: d.secuencia, movimientoId: d.id } }));
  resultados.forEach((r, i) => { motor.periodos[i].estado = r.estado; r.cuentas.forEach(s => motor.periodos[i].saldos.set(s.cuentaId, s)); });
  motor.documentos.push(d); motor.ids.set(d.id, d);
  if (o) motor.reversiones.set(o.id, d);
  if (m.clase === 'apertura') motor.aperturas.set(m.asientos[0].cuentaId, m.fechaContable);
  for (const a of m.asientos) motor.fechasMinimas.set(a.cuentaId, motor.fechasMinimas.has(a.cuentaId) ?
    (motor.fechasMinimas.get(a.cuentaId) < m.fechaContable ? motor.fechasMinimas.get(a.cuentaId) : m.fechaContable) : m.fechaContable);
  if (!d.clasificacionPresente) motor.incidencias.push(incidencia('DATOS_INSUFICIENTES', 'CLASIFICACION_AUSENTE', d.id));
}
function reconstruccion(motor, c) {
  const primero = motor.periodos[0], resumen = (p, global) => ({ ...c.configuracion, periodoId: global ? null : p.estado.periodo.periodoId,
    saldoInicialPorCuenta: Object.fromEntries(c.cuentas.map(a => [a.id, global ? 0 : p.saldos.get(a.id).saldoInicialPeriodoMinor])),
    saldoFinalPorCuenta: Object.fromEntries(c.cuentas.map(a => [a.id, global ? p.saldos.get(a.id).saldoMinor : p.saldos.get(a.id).saldoFinalPeriodoMinor])),
    ...Object.fromEntries(TOTALES.map(k => [k, (global ? p.estado.acumulado : p.estado.periodo)[k]])) });
  return { global: resumen(primero, true), periodos: motor.periodos.map(p => resumen(p, false)),
    saldos: c.cuentas.map(a => ({ cuentaId: a.id, saldoMinor: primero.saldos.get(a.id).saldoMinor,
      huboMovimientos: primero.saldos.get(a.id).revision > 0, ultimaSecuencia: primero.saldos.get(a.id).revision,
      aperturaRegistrada: motor.aperturas.has(a.id) })) };
}
function crearCheckpoint(motor, c) {
  const ultimo = motor.documentos.at(-1);
  return { versionAlgoritmo: VERSION_ALGORITMO, contexto: c, documentos: [...motor.documentos],
    cursor: ultimo ? { secuencia: ultimo.secuencia, id: ultimo.id } : null,
    rango: { desde: ultimo ? 1 : null, hasta: ultimo?.secuencia ?? 0 }, reconstruccion: reconstruccion(motor, c) };
}
function reanudar(cp, c) {
  const motor = crearMotor(c); if (cp === null) return motor;
  datosCheckpoint(cp);
  registroExacto(cp, ['versionAlgoritmo', 'contexto', 'documentos', 'cursor', 'rango', 'reconstruccion']);
  exigir(cp.versionAlgoritmo === VERSION_ALGORITMO && isDeepStrictEqual(cp.contexto, c), 'CHECKPOINT_CONTEXTO_NO_COINCIDE');
  lista(cp.documentos, LIMITES.documentos);
  try {
    for (const d of cp.documentos) {
      registroExacto(d, ['id', 'version', 'secuencia', 'movimiento', 'clasificacionPresente', 'clasificacion']);
      exigir(typeof d.clasificacionPresente === 'boolean', 'CHECKPOINT_INCOHERENTE');
      const n = normalizar({ id: d.id, version: d.version, datos: { versionEsquema: 1, iglesiaId: c.iglesiaId,
        secuencia: d.secuencia, estado: 'confirmado', movimiento: d.movimiento,
        ...(d.clasificacionPresente ? { clasificacion: d.clasificacion } : {}) } }, c);
      exigir(isDeepStrictEqual(n, d), 'CHECKPOINT_INCOHERENTE'); aplicar(motor, n, c);
    }
    exigir(isDeepStrictEqual(crearCheckpoint(motor, c), cp), 'CHECKPOINT_INCOHERENTE');
  } catch { throw new ErrorContable('CHECKPOINT_INCOHERENTE'); }
  return motor;
}
function compararValor(incidencias, referencia, esperado, observado) {
  if (observado === undefined) incidencias.push(incidencia('DATOS_INSUFICIENTES', 'CAMPO_PROYECCION_AUSENTE', referencia));
  else if (!Object.is(esperado, observado)) incidencias.push(incidencia('INCONSISTENCIA', 'PROYECCION_DIFIERE', referencia, esperado,
    typeof observado === typeof esperado && ['number', 'boolean'].includes(typeof observado) &&
      (typeof observado !== 'number' || Number.isFinite(observado)) ? observado : 'TIPO_O_VALOR_INVALIDO'));
}
function comparar(proyecciones, motor, c, incidencias) {
  registroExacto(proyecciones, ['corte', 'saldos', 'resumenes', 'marcadores']);
  registroExacto(proyecciones.corte, ['secuencia', 'versionControl']);
  if (proyecciones.corte.secuencia !== c.controlInicial.ultimaSecuencia || proyecciones.corte.versionControl !== c.controlInicial.version) {
    incidencias.push(incidencia('DATOS_INSUFICIENTES', 'PROYECCIONES_OTRO_CORTE', 'corte')); return;
  }
  const r = reconstruccion(motor, c);
  const indexar = (items, campo, requeridas) => {
    lista(items, LIMITES.documentos); const mapa = new Map();
    for (const item of items) { registroExacto(item, requeridas); id(item[campo]); exigir(!mapa.has(item[campo]), 'OBSERVACION_DUPLICADA'); mapa.set(item[campo], item.datos); }
    return mapa;
  };
  const encabezado = (datos, referencia) => {
    mapa(datos); if (datos.versionEsquema !== 1 || datos.iglesiaId !== c.iglesiaId) {
      incidencias.push(incidencia('INCONSISTENCIA', 'PROYECCION_ENCABEZADO_INCOHERENTE', referencia)); return false;
    } return true;
  };
  const saldos = indexar(proyecciones.saldos, 'cuentaId', ['cuentaId', 'datos']);
  for (const s of r.saldos) {
    const d = saldos.get(s.cuentaId), ruta = `saldos/${s.cuentaId}`;
    if (!d) { incidencias.push(incidencia('DATOS_INSUFICIENTES', 'SALDO_AUSENTE', ruta)); continue; }
    if (encabezado(d, ruta)) for (const k of Object.keys(s)) compararValor(incidencias, `${ruta}/${k}`, s[k], d[k]);
  }
  for (const clave of saldos.keys()) if (!c.cuentas.some(a => a.id === clave)) incidencias.push(incidencia('INCONSISTENCIA', 'SALDO_SIN_CUENTA', clave));
  const resumenes = indexar(proyecciones.resumenes, 'periodoId', ['periodoId', 'datos']);
  for (const resumen of r.periodos) {
    const d = resumenes.get(resumen.periodoId), ruta = `resumenes/${resumen.periodoId}`;
    if (!d) { incidencias.push(incidencia('DATOS_INSUFICIENTES', 'RESUMEN_AUSENTE', ruta)); continue; }
    if (!encabezado(d, ruta)) continue;
    compararValor(incidencias, `${ruta}/periodoId`, resumen.periodoId, d.periodoId);
    const secuencia = motor.documentos.reduce((n, m) => m.movimiento.periodoId <= resumen.periodoId ? m.secuencia : n, 0);
    compararValor(incidencias, `${ruta}/ultimaSecuencia`, secuencia, d.ultimaSecuencia);
    if (!d.datos) { incidencias.push(incidencia('DATOS_INSUFICIENTES', 'RESUMEN_DATOS_AUSENTES', ruta)); continue; }
    mapa(d.datos);
    for (const k of [...TOTALES, 'moneda', 'escala', 'zonaHoraria', 'periodoId']) compararValor(incidencias, `${ruta}/${k}`, resumen[k], d.datos[k]);
    for (const k of ['saldoInicialPorCuenta', 'saldoFinalPorCuenta']) {
      if (d.datos[k] === undefined) { incidencias.push(incidencia('DATOS_INSUFICIENTES', 'MAPA_RESUMEN_AUSENTE', `${ruta}/${k}`)); continue; }
      mapa(d.datos[k]);
      for (const cuenta of c.cuentas) compararValor(incidencias, `${ruta}/${k}/${cuenta.id}`, resumen[k][cuenta.id], d.datos[k][cuenta.id]);
      for (const cuenta of Object.keys(d.datos[k])) if (!c.cuentas.some(a => a.id === cuenta)) incidencias.push(incidencia('INCONSISTENCIA', 'RESUMEN_CUENTA_AJENA', `${ruta}/${k}`));
    }
  }
  if (proyecciones.marcadores === null) { incidencias.push(incidencia('DATOS_INSUFICIENTES', 'MARCADORES_NO_OBSERVADOS', 'marcadores')); return; }
  const marcas = indexar(proyecciones.marcadores, 'originalId', ['originalId', 'datos']);
  for (const [originalId, reversa] of motor.reversiones) {
    const marca = marcas.get(originalId), original = motor.ids.get(originalId);
    if (!marca) { incidencias.push(incidencia('INCONSISTENCIA', 'MARCADOR_REVERSION_AUSENTE', originalId)); continue; }
    mapa(marca);
    if (!(marca.versionEsquema === 1 && marca.iglesiaId === c.iglesiaId && marca.originalId === originalId &&
      marca.reversionId === reversa.id && marca.versionOriginal === original.version && marca.versionControlAnterior === null &&
      marca.secuencia === reversa.secuencia)) incidencias.push(incidencia('INCONSISTENCIA', 'MARCADOR_REVERSION_INCOHERENTE', originalId));
  }
  for (const originalId of marcas.keys()) if (!motor.reversiones.has(originalId)) incidencias.push(incidencia('INCONSISTENCIA', 'MARCADOR_SIN_REVERSA', originalId));
}

/** Puro, sin lector SDK ni escrituras. La pausa externa se DECLARA, no se prueba. */
function conciliarPaginas(entrada) {
  registroExacto(entrada, ['contexto', 'checkpoint', 'paginas', 'finDelListado', 'controlFinal', 'proyecciones']);
  const c = contexto(entrada.contexto), motor = reanudar(entrada.checkpoint, c);
  exigir(typeof entrada.finDelListado === 'boolean', 'FIN_LISTADO_INVALIDO'); lista(entrada.paginas, LIMITES.paginas);
  const errores = []; let detenido = false;
  for (const pagina of entrada.paginas) {
    lista(pagina, LIMITES.pagina);
    for (const documento of pagina) {
      try { aplicar(motor, normalizar(documento, c), c); }
      catch (e) {
        if (!(e instanceof ErrorContable)) throw new ErrorContable('OBSERVACION_CONCILIACION_INVALIDA');
        const nivel = ['VERSION_OBSERVACION_AUSENTE', 'VERSION_OBSERVACION_INVALIDA'].includes(e.codigo) ? 'DATOS_INSUFICIENTES' : 'INCONSISTENCIA';
        errores.push(incidencia(nivel, e.codigo, `secuenciaEsperada/${motor.documentos.length + 1}`)); detenido = true; break;
      }
    }
    if (detenido) break;
  }
  const completo = !detenido && entrada.finDelListado && motor.documentos.length === c.controlInicial.ultimaSecuencia;
  const incidencias = [...motor.incidencias, ...errores];
  if (!completo) incidencias.push(incidencia('DATOS_INSUFICIENTES', 'PAGINAS_PENDIENTES_O_INVALIDAS', 'rango'));
  const final = entrada.controlFinal === null ? null : control(entrada.controlFinal, c.iglesiaId);
  const controlSinCambios = final === null ? null : isDeepStrictEqual(final, c.controlInicial);
  if (controlSinCambios !== true) incidencias.push(incidencia('DATOS_INSUFICIENTES', final ? 'CONTROL_CAMBIO_DURANTE_LECTURA' : 'CONTROL_FINAL_AUSENTE', 'corte'));
  if (c.modoLectura === 'BEST_EFFORT') incidencias.push(incidencia('DATOS_INSUFICIENTES', 'LECTURA_BEST_EFFORT_NO_CERTIFICABLE', 'corte'));
  if (entrada.proyecciones === null) incidencias.push(incidencia('DATOS_INSUFICIENTES', 'PROYECCIONES_NO_OBSERVADAS', 'proyecciones'));
  else if (completo && controlSinCambios === true) comparar(entrada.proyecciones, motor, c, incidencias);
  else incidencias.push(incidencia('DATOS_INSUFICIENTES', 'COMPARACION_POSPUESTA_POR_CORTE', 'proyecciones'));
  incidencias.sort((a, b) => {
    const x = `${a.referencia}|${a.codigo}`, y = `${b.referencia}|${b.codigo}`; return x < y ? -1 : x > y ? 1 : 0;
  });
  const checkpoint = crearCheckpoint(motor, c);
  return congelar({ checkpoint, reporte: { versionAlgoritmo: VERSION_ALGORITMO,
    estado: incidencias.some(i => i.nivel === 'INCONSISTENCIA') ? 'DIVERGENCIAS' :
      incidencias.length ? 'DATOS_INSUFICIENTES' : 'SIN_DIFERENCIAS_OBSERVADAS',
    completoHastaCorte: completo, certificacionHistorica: false,
    consistencia: { modo: c.modoLectura, controlSinCambios, pausaVerificadaPorBiblioteca: false },
    rango: checkpoint.rango, corte: c.controlInicial.ultimaSecuencia, reconstruccion: checkpoint.reconstruccion, incidencias } });
}

module.exports = Object.freeze({ conciliarPaginas, VERSION_ALGORITMO, LIMITES });
