'use strict';
const { isDeepStrictEqual } = require('node:util');
const { exigir } = require('../finanzas_core/dinero');
const { conciliar, normalizarPagina, documentosDestino, cabeceraDestino } = require('../contabilidad_generaciones_v2_demo/modelo');
const { documento, vinculo, validarVinculo, sellar, validarSello } = require('./evidencia');
function referencias(db, p) {
  const b = `iglesias/${p.iglesiaId}`;
  return { ejecucion: db.doc(`${b}/finanzas_preparaciones_admin_v2_demo/${p.ejecucionId}`),
    cerrojo: db.doc(`${b}/finanzas_preparaciones_admin_v2_control/cerrojo`),
    evidencia: db.doc(`${b}/finanzas_evidencias_admin_v2_demo/${p.ejecucionId}`),
    generacion: db.doc(`${b}/finanzas_generaciones_demo/${p.generacionId}`) };
}
// Control cruzado conservador: no adopta ni libera cerrojos de otros procedimientos.
async function comprobarOtros(tx, db, p) {
  for (const nombre of ['finanzas_preparaciones_v2_control', 'finanzas_preparaciones_procedencia_control', 'finanzas_transicion_demo']) {
    const s = await tx.get(db.doc('iglesias/' + p.iglesiaId + '/' + nombre + '/cerrojo'));
    exigir(!s.exists, 'E_OTRO_PROCEDIMIENTO_OCUPADO');
  }
}
async function subcolecciones(r) {
  // El SDK no permite listar nombres en transaccion: requiere custodia externa.
  const hijos = await r.generacion.listCollections();
  exigir(hijos.length <= 4 && hijos.every(c => ['control', 'consolidados', 'periodos', 'saldos'].includes(c.id)), 'E_DESTINO_EXTRA');
  for (const c of hijos) {
    // listDocuments incluye padres inexistentes con descendientes huerfanos.
    const refs = await c.listDocuments(); exigir(refs.length <= 50, 'E_DESTINO_EXTRA');
    for (const ref of refs) exigir((await ref.listCollections()).length === 0, 'E_DESTINO_EXTRA');
  }
  for (const ref of [r.ejecucion, r.cerrojo, r.evidencia]) {
    exigir((await ref.listCollections()).length === 0, 'E_DESTINO_EXTRA');
  }
}
function comprobar(e, p, runtime, f, cs, gs) {
  validarVinculo(e, vinculo(p, runtime, f));
  const cerrojo = { ejecucionId: p.ejecucionId, generacionId: p.generacionId,
    identidad: e.identidad, operador: p.operador, runtime, fence: e.fence };
  exigir(cs.exists && isDeepStrictEqual(cs.data(), cerrojo), 'E_FENCING');
  exigir(gs.exists && isDeepStrictEqual(e.cabecera, cabeceraDestino(p)) &&
    isDeepStrictEqual(gs.data(), e.cabecera), 'E_GENERACION_INCOHERENTE');
  exigir(e.checkpoint && Array.isArray(e.checkpoint.documentos) && e.checkpoint.documentos.length <= e.corte.secuencia,
    'E_CHECKPOINT_INVALIDO');
  const prefijo = f.movimientos.slice(0, e.checkpoint.documentos.length);
  const cp = conciliar(f, null, normalizarPagina(prefijo), prefijo.length === e.corte.secuencia).checkpoint;
  exigir(isDeepStrictEqual(cp, e.checkpoint), 'E_CHECKPOINT_INVALIDO');
  exigir(e.estado !== 'conciliando' || e.preparados === 0, 'E_CHECKPOINT_INVALIDO');
}
async function destino(tx, db, r, e, p, f, gs) {
  const completo = e.checkpoint.documentos.length === e.corte.secuencia;
  if (!completo) exigir(e.preparados === 0 && e.estado === 'conciliando', 'E_CHECKPOINT_INVALIDO');
  const forma = completo ? documentosDestino(p, f, e.checkpoint) : { items: [] };
  exigir(e.preparados <= forma.items.length, 'E_CHECKPOINT_INVALIDO');
  const presentes = new Map(), documentos = [documento(gs)];
  for (const nombre of ['control', 'consolidados', 'periodos', 'saldos']) {
    const q = await tx.get(db.collection(`${r.generacion.path}/${nombre}`).orderBy('__name__').limit(55));
    exigir(q.size <= (nombre === 'saldos' ? 50 : 1), 'E_DESTINO_EXTRA');
    for (const s of q.docs) { presentes.set(`${nombre}/${s.id}`, s); documentos.push(documento(s)); }
  }
  for (let i = 0; i < forma.items.length; i++) {
    const item = forma.items[i], s = presentes.get(item.ruta);
    exigir(i < e.preparados ? s && isDeepStrictEqual(s.data(), item.datos) : !s, 'E_DESTINO_DIVERGENTE');
    presentes.delete(item.ruta);
  }
  exigir(presentes.size === 0, 'E_DESTINO_EXTRA');
  if (['verificando', 'verificada'].includes(e.estado)) exigir(completo && e.preparados === forma.items.length, 'E_GENERACION_PARCIAL');
  return { forma, documentos };
}
function comprobarEvidencia(e, p, runtime, f, documentos, es) {
  exigir(e.estado === 'verificada' && es.exists && e.evidencia === es.ref.path, 'E_NO_VERIFICADA');
  const esperada = sellar({ vinculo: vinculo(p, runtime, f), fence: e.fence, checkpoint: e.checkpoint, documentos });
  validarSello(es.data(), esperada); return esperada;
}
module.exports = Object.freeze({ referencias, subcolecciones, comprobar, destino, comprobarEvidencia, comprobarOtros });
