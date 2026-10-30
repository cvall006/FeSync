'use strict';
const { isDeepStrictEqual } = require('node:util');
const { FieldPath } = require('firebase-admin/firestore');
const { exigir, periodoValido } = require('../finanzas_core/dinero');
const { validarCatalogoCuentas } = require('../finanzas_core/cuentas');
const { validarCatalogoCategorias } = require('../finanzas_core/categorias');
const { validarConfiguracionContable } = require('../finanzas_core/configuracion');
const { conciliarPaginas } = require('../finanzas_core/conciliacion');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('../finanzas_core/proyecciones');
const c = require('./comun');
function reconstruir(checkpoint, iglesiaId, configuracion, cuentas, periodoId) {
  let proyeccion = crearProyeccionInicial({ iglesiaId, configuracion, periodoId });
  const saldos = Object.fromEntries(cuentas.map(a => [a.id, crearSaldoInicial({ iglesiaId, cuentaId: a.id, periodoId })]));
  const anteriores = new Map(), aperturas = {};
  for (const d of checkpoint.documentos) {
    const original = d.movimiento.reversaDe === null ? null : anteriores.get(d.movimiento.reversaDe);
    const r = proyectarMovimiento({ estadoAnterior: proyeccion,
      cuentasAnteriores: d.movimiento.asientos.map(a => saldos[a.cuentaId]), movimiento: d.movimiento,
      original: original ? { movimiento: original.movimiento, revision: original.secuencia, reversionId: null } : null,
      aplicacion: { revisionAnterior: d.secuencia - 1, revisionNueva: d.secuencia, movimientoId: d.id } });
    proyeccion = r.estado; r.cuentas.forEach(a => { saldos[a.cuentaId] = a; }); anteriores.set(d.id, d);
    if (d.movimiento.clase === 'apertura') aperturas[d.movimiento.asientos[0].cuentaId] = {
      id: d.id, fechaContable: d.movimiento.fechaContable, secuencia: d.secuencia };
  }
  return { proyeccion, cuentas: saldos, aperturas };
}
function crearMantenimiento({ db, FieldValue, validarEntorno = c.entorno }) {
  const ref = (iglesiaId, ruta) => db.doc(`${c.base(iglesiaId)}/${ruta}`);
  async function pausar(uid, iglesiaId) {
    validarEntorno(); return db.runTransaction(async tx => {
      await c.autorizar(db, tx, uid, iglesiaId, 'administrarConfiguracion');
      const p = await tx.get(ref(iglesiaId, 'finanzas_control/protocolo')), d = p.data();
      exigir(d && d.versionProtocolo === 1 && d.iglesiaId === iglesiaId && [1, 2].includes(d.epoca) &&
        ['operativo_v1', 'bloqueado'].includes(d.estado), 'PROTOCOLO_INCREMENTAL_BLOQUEADO');
      tx.update(p.ref, { estado: 'bloqueado' }); return { estado: 'bloqueado', epoca: d.epoca };
    });
  }
  async function observar(tx, uid, iglesiaId) {
    const b = c.base(iglesiaId);
    await c.autorizar(db, tx, uid, iglesiaId, 'administrarConfiguracion');
    const [p, config, control, periodo, incremental, v2] = await Promise.all([
      'finanzas_control/protocolo', 'finanzas_config/contabilidad', 'finanzas_control/libro',
      'finanzas_control/periodo', 'finanzas_control/incremental_v1', 'finanzas_control/generacion_v2'
    ].map(r => tx.get(ref(iglesiaId, r))));
    c.protocolo(p.data(), iglesiaId, true); exigir(!v2.exists, 'LIBRO_V2_NO_ADMITIDO');
    const configuracion = c.configDinero(validarConfiguracionContable(config.data(), iglesiaId));
    const actual = periodo.data()?.periodosAbiertos;
    exigir(Array.isArray(actual) && actual.length === 1 && periodoValido(actual[0]), 'PERIODO_NO_ABIERTO');
    const qs = {};
    for (const [nombre, limite] of Object.entries({ finanzas_cuentas: 50, finanzas_categorias: 50,
      finanzas_saldos: 50, finanzas_resumenes: 24, finanzas_reversiones: 20000, finanzas_aperturas: 50 })) {
      qs[nombre] = await tx.get(db.collection(`${b}/${nombre}`).limit(limite + 1));
      exigir(qs[nombre].size <= limite, 'LIMITE_MANTENIMIENTO_EXCEDIDO');
    }
    const cuentas = validarCatalogoCuentas(qs.finanzas_cuentas.docs.map(s => {
      exigir(s.data().cuenta.id === s.id, 'CUENTA_DOCUMENTO_DISTINTO'); return s.data().cuenta;
    }), iglesiaId);
    validarCatalogoCategorias(qs.finanzas_categorias.docs.map(s => {
      exigir(s.data().categoria.id === s.id, 'CATEGORIA_DOCUMENTO_DISTINTO'); return s.data().categoria;
    }), iglesiaId);
    const paginas = []; let cursor = null, cantidad = 0, bytes = 0;
    while (true) {
      // Enumerar por ID también observa documentos sin secuencia. Ordenar solo
      // por secuencia ocultaría esos documentos y podría saltar empates de página.
      let q = db.collection(`${b}/finanzas_movimientos`).orderBy(FieldPath.documentId()).limit(250);
      if (cursor !== null) q = q.startAfter(cursor);
      const page = await tx.get(q); const docs = page.docs.map(s => ({ id: s.id, version: c.ver(s), datos: s.data() }));
      cantidad += docs.length; bytes += Buffer.byteLength(JSON.stringify(docs));
      exigir(cantidad <= 20000 && bytes <= 8 * 1024 * 1024, 'LIMITE_MANTENIMIENTO_EXCEDIDO');
      if (docs.length) paginas.push(docs);
      if (docs.length < 250) break;
      cursor = page.docs.at(-1);
    }
    const ordenados = paginas.flat().sort((a, b) => {
      const x = Number.isSafeInteger(a.datos.secuencia) ? a.datos.secuencia : Number.MAX_SAFE_INTEGER;
      const y = Number.isSafeInteger(b.datos.secuencia) ? b.datos.secuencia : Number.MAX_SAFE_INTEGER;
      return x - y || a.id.localeCompare(b.id);
    });
    const paginasOrdenadas = [];
    for (let i = 0; i < ordenados.length; i += 250) paginasOrdenadas.push(ordenados.slice(i, i + 250));
    const periodos = [...new Set([actual[0], ...paginas.flat().map(d => d.datos.movimiento.periodoId),
      ...qs.finanzas_resumenes.docs.map(s => s.id)])].sort();
    const observacion = { version: c.ver(control), datos: control.data() };
    const r = conciliarPaginas({ contexto: { iglesiaId, configuracion,
      cuentas: cuentas.map(a => ({ id: a.id, moneda: a.moneda, escala: a.escala })), periodos,
      controlInicial: observacion, modoLectura: 'PAUSA_EXTERNA_DECLARADA' },
      checkpoint: null, paginas: paginasOrdenadas, finDelListado: true, controlFinal: observacion,
      proyecciones: { corte: { secuencia: control.data().ultimaSecuencia, versionControl: c.ver(control) },
        saldos: qs.finanzas_saldos.docs.map(s => ({ cuentaId: s.id, datos: s.data() })),
        resumenes: qs.finanzas_resumenes.docs.map(s => ({ periodoId: s.id, datos: s.data() })),
        marcadores: qs.finanzas_reversiones.docs.map(s => ({ originalId: s.id, datos: s.data() })) } });
    const reconstruido = reconstruir(r.checkpoint, iglesiaId, configuracion, cuentas, actual[0]);
    const marcas = new Map(qs.finanzas_aperturas.docs.map(s => [s.id, s.data()]));
    const aperturasCorrectas = Object.entries(reconstruido.aperturas).every(([id, a]) => {
      const marca = marcas.get(id); return marca && marca.iglesiaId === iglesiaId && marca.cuentaId === id &&
        marca.movimientoId === a.id && marca.secuencia === a.secuencia;
    }) && marcas.size === Object.keys(reconstruido.aperturas).length;
    let incrementalCorrecto = !incremental.exists;
    if (incremental.exists) {
      try { const v = c.verificar(incremental.data(), control.data(), iglesiaId);
        incrementalCorrecto = ['proyeccion', 'cuentas', 'aperturas'].every(k => isDeepStrictEqual(v[k], reconstruido[k]));
      } catch { incrementalCorrecto = false; }
    }
    const reporte = { ...r.reporte,
      estado: !aperturasCorrectas || !incrementalCorrecto ? 'DIVERGENCIAS' : r.reporte.estado,
      aperturasCorrectas, incrementalCorrecto, pausaVerificadaPorAdaptador: true };
    return { p, config, control, periodo, incremental, reconstruido, reporte };
  }
  async function inicializar(uid, iglesiaId) {
    validarEntorno(); return db.runTransaction(async tx => {
      const o = await observar(tx, uid, iglesiaId);
      exigir(!o.incremental.exists, 'NO_REINICIALIZAR_PROYECCIONES');
      exigir(o.p.data().epoca === 1 && o.reporte.estado === 'SIN_DIFERENCIAS_OBSERVADAS', 'CONCILIACION_REQUERIDA');
      const valor = c.sellar({ versionEsquema: 1, iglesiaId, epoca: 2, estadoVerificacion: 'VERIFICADA_INICIAL',
        ...o.reconstruido, verificacionInicial: { corte: o.control.data().ultimaSecuencia,
          versionControl: c.ver(o.control), reporteDigest: c.hash(o.reporte), certificacionHistorica: false } });
      tx.create(ref(iglesiaId, 'finanzas_control/incremental_v1'), valor);
      tx.update(o.p.ref, { epoca: 2, estado: 'operativo_v1' });
      tx.create(ref(iglesiaId, `finanzas_auditoria/inicio_incremental_v1_${o.control.data().ultimaSecuencia}`), {
        evento: 'inicializacion_incremental_v1', actorUid: uid, corte: o.control.data().ultimaSecuencia,
        reporteDigest: valor.verificacionInicial.reporteDigest, certificacionHistorica: false,
        fechaCreacion: FieldValue.serverTimestamp() });
      return { estado: 'INCREMENTAL_V1', epoca: 2, corte: o.control.data().ultimaSecuencia, reporte: o.reporte };
    });
  }
  async function conciliar(uid, iglesiaId) {
    validarEntorno(); return db.runTransaction(async tx => (await observar(tx, uid, iglesiaId)).reporte);
  }
  async function reanudar(uid, iglesiaId) {
    validarEntorno(); return db.runTransaction(async tx => {
      const o = await observar(tx, uid, iglesiaId);
      exigir(o.p.data().epoca === 2 && o.incremental.exists && o.reporte.estado === 'SIN_DIFERENCIAS_OBSERVADAS', 'CONCILIACION_REQUERIDA');
      tx.update(o.p.ref, { estado: 'operativo_v1' }); return o.reporte;
    });
  }
  async function cambiarPeriodo(uid, iglesiaId, nuevo, { pausado = false } = {}) {
    validarEntorno(); exigir(periodoValido(nuevo), 'PERIODO_INVALIDO');
    return db.runTransaction(async tx => {
      await c.autorizar(db, tx, uid, iglesiaId, 'administrarConfiguracion');
      const [p, control, incremental, periodo, destino] = await Promise.all([
        'finanzas_control/protocolo', 'finanzas_control/libro', 'finanzas_control/incremental_v1',
        'finanzas_control/periodo', `finanzas_resumenes/${nuevo}`].map(r => tx.get(ref(iglesiaId, r))));
      c.protocolo(p.data(), iglesiaId, pausado); const v = c.verificar(incremental.data(), control.data(), iglesiaId);
      const anterior = v.proyeccion.periodo.periodoId;
      const resumenAnterior = await tx.get(ref(iglesiaId, `finanzas_resumenes/${anterior}`));
      exigir(resumenAnterior.exists && resumenAnterior.data().ultimaSecuencia === control.data().ultimaSecuencia &&
        isDeepStrictEqual(resumenAnterior.data().datos, c.resumen(v)), 'RESUMEN_PROYECCION_DIVERGENTE');
      exigir(nuevo > anterior && !destino.exists && periodo.data().periodosAbiertos.length === 1 &&
        periodo.data().periodosAbiertos[0] === anterior, 'PERIODO_NO_AVANZABLE');
      const ceros = crearProyeccionInicial({ iglesiaId, configuracion: v.proyeccion.configuracion, periodoId: nuevo });
      const datos = { ...v, proyeccion: { ...v.proyeccion, periodo: { ...ceros.periodo,
        saldoInicialMinor: v.proyeccion.acumulado.saldoFinalMinor, saldoFinalMinor: v.proyeccion.acumulado.saldoFinalMinor } },
      cuentas: Object.fromEntries(Object.entries(v.cuentas).map(([id, saldo]) => [id, { ...saldo, periodoId: nuevo,
        saldoInicialPeriodoMinor: saldo.saldoMinor, saldoFinalPeriodoMinor: saldo.saldoMinor }])) };
      tx.update(incremental.ref, c.sellar(datos)); tx.update(periodo.ref, { periodosAbiertos: [nuevo] });
      tx.create(destino.ref, { versionEsquema: 1, iglesiaId, periodoId: nuevo, datos: c.resumen(datos),
        ultimaSecuencia: control.data().ultimaSecuencia, fechaActualizacion: FieldValue.serverTimestamp() });
      tx.create(ref(iglesiaId, `finanzas_auditoria/periodo_incremental_${nuevo}`), {
        evento: 'cambio_periodo_v1', actorUid: uid, anterior, nuevo, fechaCreacion: FieldValue.serverTimestamp() });
    });
  }
  return { pausar, inicializar, conciliar, reanudar, cambiarPeriodo };
}
module.exports = { crearMantenimiento };
