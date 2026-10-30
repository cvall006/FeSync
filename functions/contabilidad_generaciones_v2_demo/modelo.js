'use strict';
const { exigir } = require('../finanzas_core/dinero');
const { conciliarPaginas } = require('../finanzas_core/conciliacion');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('../finanzas_core/proyecciones');
const { CONTRATO_V2 } = require('../finanzas_core/adaptador_firestore_v2');

function conciliar(f, checkpoint, pagina, fin) {
  const r = conciliarPaginas({ contexto: f.contexto, checkpoint, paginas: pagina.length ? [pagina] : [],
    finDelListado: fin, controlFinal: f.contexto.controlInicial, proyecciones: f.proyecciones });
  const vacio = f.proyecciones.corte.secuencia === 0;
  const errores = r.reporte.incidencias.filter(i => !(vacio && i.codigo === 'RESUMEN_AUSENTE') &&
    !(!fin && ['PAGINAS_PENDIENTES_O_INVALIDAS', 'COMPARACION_POSPUESTA_POR_CORTE'].includes(i.codigo)));
  exigir(errores.length === 0 && (!fin || r.reporte.completoHastaCorte), 'PREP_CONCILIACION_RECHAZADA');
  return r;
}
const normalizarPagina = snaps => snaps.map(s => ({ id: s.id,
  version: `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`, datos: s.data() }));
function cabeceraDestino(p) {
  return { versionEsquema: 2, iglesiaId: p.iglesiaId, epoca: p.epoca,
    generacionId: p.generacionId, contrato: CONTRATO_V2, activa: false };
}

// NO hay formulas monetarias propias: reproducir FIN-7C.4B para el periodo
// solicitado preserva tambien los efectos de asientos de periodos anteriores.
function documentosDestino(p, f, checkpoint) {
  exigir(checkpoint.documentos.length === f.proyecciones.corte.secuencia, 'PREP_CORTE_INCOMPLETO');
  let estado = crearProyeccionInicial({ iglesiaId: p.iglesiaId, configuracion: f.contexto.configuracion, periodoId: p.periodoId });
  const saldos = new Map(f.cuentas.map(c => [c.id, crearSaldoInicial({ iglesiaId: p.iglesiaId, cuentaId: c.id, periodoId: p.periodoId })]));
  const originales = new Map(), aperturas = new Set();
  for (const d of checkpoint.documentos) {
    const m = d.movimiento, original = m.reversaDe === null ? null : originales.get(m.reversaDe);
    exigir(m.reversaDe === null || original, 'PREP_ORIGINAL_AUSENTE');
    const r = proyectarMovimiento({ estadoAnterior: estado, cuentasAnteriores: m.asientos.map(a => saldos.get(a.cuentaId)),
      movimiento: m, original: original ? { movimiento: original.movimiento, revision: original.secuencia, reversionId: null } : null,
      aplicacion: { revisionAnterior: d.secuencia - 1, revisionNueva: d.secuencia, movimientoId: d.id } });
    estado = r.estado; r.cuentas.forEach(s => saldos.set(s.cuentaId, s)); originales.set(d.id, d);
    if (m.clase === 'apertura') aperturas.add(m.asientos[0].cuentaId);
  }
  exigir([...saldos.values()].every(s => s.saldoMinor >= 0 && s.saldoMinor === s.saldoFinalPeriodoMinor), 'PREP_SALDO_INVALIDO');
  const h = { versionEsquema: 2, iglesiaId: p.iglesiaId, epoca: p.epoca, generacionId: p.generacionId, contrato: CONTRATO_V2 };
  const rev = { revision: estado.revision, ultimoMovimientoId: estado.ultimoMovimientoId };
  const items = [
    { ruta: 'control/libro', datos: { ...h, ...rev } },
    { ruta: 'consolidados/CLP', datos: { ...h, ...rev, datos: estado.acumulado } },
    { ruta: `periodos/${p.periodoId}`, datos: { ...h, ...rev, periodoId: p.periodoId, datos: estado.periodo } },
    ...[...saldos.values()].sort((a, b) => a.cuentaId < b.cuentaId ? -1 : a.cuentaId > b.cuentaId ? 1 : 0).map(s => ({
      ruta: `saldos/${s.cuentaId}`, datos: { ...h, proyeccion: s, huboMovimientos: s.revision > 0,
        aperturaRegistrada: aperturas.has(s.cuentaId), solicitudesInciertas: 0 },
    })),
  ];
  return { cabecera: { ...h, activa: false }, items };
}
module.exports = Object.freeze({ conciliar, normalizarPagina, documentosDestino, cabeceraDestino });
