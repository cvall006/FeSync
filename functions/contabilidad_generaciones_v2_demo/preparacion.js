'use strict';
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto, ErrorContable, sumarMinor } = require('../finanzas_core/dinero');
const { verificarEntorno, verificarCliente } = require('./entorno');
const { leerFuente } = require('./fuente');
const { conciliar, normalizarPagina, documentosDestino, cabeceraDestino } = require('./modelo');
const { parametros, hash, canon } = require('./util');

const PROCEDIMIENTO = 'preparacion_v2_aislada_1';
const ESTADOS = ['conciliando', 'preparando', 'preparada', 'fallida'];
const resultado = e => Object.freeze({ estado: e.estado, fence: e.fence, preparados: e.preparados,
  activa: false, acreditacion: 'PENDIENTE', error: e.error ?? null });

/** Solo ensayo aislado. Ninguna importacion de fuentes/transicion/inventarios.
 * custodia.verificar es una dependencia de confianza del arnes LOCAL dedicado,
 * NO una bandera de usuario, autenticacion Firebase o prueba de IAM/ausencia
 * absoluta de otro Admin. Requiere protocolo bloqueado en CADA transaccion.
 */
function crearPreparadorDemo({ db, env = process.env, custodia }) {
  registroExacto(custodia, ['verificar']);
  exigir(typeof custodia.verificar === 'function', 'PREP_CUSTODIA_REQUERIDA');
  const verificarCustodia = custodia.verificar;
  function guardas() {
    verificarEntorno(env); verificarCliente(db);
    exigir(verificarCustodia() === true, 'PREP_EXCLUSION_NO_CONFIRMADA');
  }
  guardas();
  function refs(p) {
    const b = `iglesias/${p.iglesiaId}`;
    return { ejecucion: db.doc(`${b}/finanzas_preparaciones_v2_demo/${p.ejecucionId}`),
      cerrojo: db.doc(`${b}/finanzas_preparaciones_v2_control/cerrojo`),
      generacion: db.doc(`${b}/finanzas_generaciones_demo/${p.generacionId}`) };
  }
  function identidad(e, p) {
    registroExacto(e, ['versionEsquema', 'procedimiento', 'acreditacion', 'iglesiaId', 'ejecucionId', 'generacionId',
      'epoca', 'identidad', 'operador', 'manifiesto', 'corte', 'cabecera', 'checkpoint', 'preparados', 'estado', 'fence', 'ultimoPaso'], ['error']);
    exigir(e && e.versionEsquema === 1 && e.procedimiento === PROCEDIMIENTO && e.acreditacion === 'PENDIENTE' &&
      e.iglesiaId === p.iglesiaId && e.epoca === p.epoca && e.generacionId === p.generacionId &&
      e.ejecucionId === p.ejecucionId && e.identidad === hash(p) && e.operador === p.operador &&
      ESTADOS.includes(e.estado) && Number.isSafeInteger(e.fence) && e.fence >= 0 &&
      Number.isSafeInteger(e.preparados) && e.preparados >= 0, 'PREP_EJECUCION_INCOHERENTE');
    exigir(isDeepStrictEqual(e.cabecera, cabeceraDestino(p)), 'PREP_GENERACION_INCOHERENTE');
    exigir(e.estado !== 'conciliando' || e.preparados === 0, 'PREP_EJECUCION_INCOHERENTE');
  }
  function bloqueo(e, c, p) {
    exigir(c && c.ejecucionId === p.ejecucionId && c.operador === p.operador && c.fence === e.fence &&
      c.identidad === e.identidad, 'PREP_FENCING');
  }
  function comprobarCheckpoint(f, e) {
    exigir(e.checkpoint && Array.isArray(e.checkpoint.documentos) &&
      e.checkpoint.documentos.length <= e.corte.secuencia, 'PREP_CHECKPOINT_INVALIDO');
    const prefijo = f.movimientos.slice(0, e.checkpoint.documentos.length);
    const autentico = conciliar(f, null, normalizarPagina(prefijo), prefijo.length === e.corte.secuencia).checkpoint;
    exigir(isDeepStrictEqual(autentico, e.checkpoint), 'PREP_CHECKPOINT_INVALIDO');
  }
  async function subcolecciones(r) {
    // Listado SDK fuera de la transaccion: no hay API transaccional para nombres
    // de subcolecciones. La exclusion operativa es necesaria frente a Admin ajeno.
    const nombres = (await r.generacion.listCollections()).map(c => c.id);
    exigir(nombres.length <= 4 && nombres.every(n => ['control', 'consolidados', 'periodos', 'saldos'].includes(n)), 'PREP_DESTINO_EXTRA');
    return nombres;
  }
  async function validarDestino(tx, r, e, p, f) {
    const forma = documentosDestino(p, f, e.checkpoint);
    exigir(isDeepStrictEqual(e.cabecera, forma.cabecera) && e.preparados <= forma.items.length &&
      (e.estado !== 'preparada' || e.preparados === forma.items.length), 'PREP_DESTINO_INCOHERENTE');
    const presentes = new Map();
    for (const nombre of ['control', 'consolidados', 'periodos', 'saldos']) {
      const q = await tx.get(db.collection(`${r.generacion.path}/${nombre}`).orderBy('__name__').limit(55));
      exigir(q.size <= (nombre === 'saldos' ? 50 : 1), 'PREP_DESTINO_EXTRA');
      for (const s of q.docs) presentes.set(`${nombre}/${s.id}`, s.data());
    }
    for (let i = 0; i < forma.items.length; i++) {
      const item = forma.items[i];
      if (i < e.preparados) {
        exigir(presentes.has(item.ruta) && isDeepStrictEqual(presentes.get(item.ruta), item.datos), 'PREP_DESTINO_DIVERGENTE');
        presentes.delete(item.ruta);
      } else exigir(!presentes.has(item.ruta), 'PREP_DESTINO_INESPERADO');
    }
    exigir(presentes.size === 0, 'PREP_DESTINO_EXTRA'); return forma;
  }
  async function iniciar(entrada) {
    const p = parametros(entrada), r = refs(p); guardas();
    const existentes = await subcolecciones(r);
    return db.runTransaction(async tx => {
      guardas();
      const es = await tx.get(r.ejecucion), cs = await tx.get(r.cerrojo), gs = await tx.get(r.generacion);
      const f = await leerFuente(tx, db, p);
      if (es.exists) {
        const e = es.data(); identidad(e, p); bloqueo(e, cs.data(), p);
        exigir(isDeepStrictEqual(f.manifiesto, e.manifiesto), 'PREP_FUENTE_CAMBIO');
        exigir(gs.exists && isDeepStrictEqual(gs.data(), e.cabecera), 'PREP_GENERACION_INCOHERENTE');
        // Incluso una reconsulta valida su checkpoint; no lo adopta ciegamente.
        comprobarCheckpoint(f, e);
        if (e.preparados > 0 || e.estado === 'preparada') await validarDestino(tx, r, e, p, f);
        return resultado(e);
      }
      exigir(!cs.exists && !gs.exists && existentes.length === 0, 'PREP_DESTINO_OCUPADO');
      const vacio = conciliar(f, null, [], f.proyecciones.corte.secuencia === 0);
      const e = { versionEsquema: 1, procedimiento: PROCEDIMIENTO, acreditacion: 'PENDIENTE',
        iglesiaId: p.iglesiaId, ejecucionId: p.ejecucionId, generacionId: p.generacionId, epoca: p.epoca,
        identidad: hash(p), operador: p.operador, manifiesto: f.manifiesto, corte: f.proyecciones.corte,
        cabecera: cabeceraDestino(p), checkpoint: vacio.checkpoint, preparados: 0,
        estado: f.proyecciones.corte.secuencia === 0 ? 'preparando' : 'conciliando', fence: 0, ultimoPaso: null };
      guardas();
      tx.create(r.ejecucion, e); tx.create(r.cerrojo, { ejecucionId: p.ejecucionId, operador: p.operador, identidad: e.identidad, fence: 0 });
      tx.create(r.generacion, e.cabecera); return resultado(e);
    });
  }
  async function avanzar(entrada, fenceEsperado) {
    const p = parametros(entrada), r = refs(p); guardas();
    exigir(Number.isSafeInteger(fenceEsperado) && fenceEsperado >= 0, 'PREP_FENCE_INVALIDO');
    await subcolecciones(r);
    return db.runTransaction(async tx => {
      guardas();
      const es = await tx.get(r.ejecucion), cs = await tx.get(r.cerrojo), gs = await tx.get(r.generacion);
      exigir(es.exists && cs.exists && gs.exists, 'PREP_EJECUCION_AUSENTE');
      const e = es.data(); identidad(e, p); bloqueo(e, cs.data(), p);
      exigir(isDeepStrictEqual(gs.data(), e.cabecera) && e.cabecera.activa === false, 'PREP_GENERACION_INCOHERENTE');
      exigir(e.fence === fenceEsperado || (e.fence === fenceEsperado + 1 && e.ultimoPaso === fenceEsperado), 'PREP_FENCING');
      // El protocolo/puntero/corte se revalidan incluso al recuperar un commit.
      const f = await leerFuente(tx, db, p);
      let siguiente, escrituras = [];
      try {
        exigir(isDeepStrictEqual(f.manifiesto, e.manifiesto) && isDeepStrictEqual(f.proyecciones.corte, e.corte), 'PREP_FUENTE_CAMBIO');
        if (e.estado === 'fallida') return resultado(e);
        comprobarCheckpoint(f, e);
        const finPrevio = e.checkpoint.documentos.length === e.corte.secuencia;
        const proximo = sumarMinor([e.fence, 1]);
        siguiente = { ...e, fence: proximo, ultimoPaso: e.fence };
        if (e.estado === 'conciliando') {
          let q = db.collection(`iglesias/${p.iglesiaId}/finanzas_movimientos`).orderBy('secuencia').orderBy('__name__');
          if (e.checkpoint.cursor) q = q.startAfter(e.checkpoint.cursor.secuencia, e.checkpoint.cursor.id);
          const pagina = await tx.get(q.limit(p.pagina));
          const fin = e.checkpoint.documentos.length + pagina.size === e.corte.secuencia;
          exigir(pagina.size > 0 || fin, 'PREP_PAGINA_VACIA');
          const c = conciliar(f, e.checkpoint, normalizarPagina(pagina.docs), fin);
          siguiente.checkpoint = c.checkpoint; siguiente.estado = fin ? 'preparando' : 'conciliando';
        } else {
          exigir(finPrevio, 'PREP_CHECKPOINT_INCOMPLETO');
          const forma = await validarDestino(tx, r, e, p, f);
          if (e.estado === 'preparada' || e.fence === fenceEsperado + 1) return resultado(e);
          const lote = forma.items.slice(e.preparados, e.preparados + p.lote);
          escrituras = lote.map(item => ({ ref: db.doc(`${r.generacion.path}/${item.ruta}`), datos: item.datos }));
          siguiente.preparados += lote.length;
          if (siguiente.preparados === forma.items.length) siguiente.estado = 'preparada';
        }
        // Replay de pagina confirmada: no volver a aplicar el callback.
        if (e.fence === fenceEsperado + 1) return resultado(e);
        exigir(Buffer.byteLength(canon(siguiente)) <= 800000, 'PREP_CHECKPOINT_EXCESIVO');
      } catch (error) {
        if (!(error instanceof ErrorContable)) throw error;
        siguiente = { ...e, estado: 'fallida', error: error.codigo, fence: sumarMinor([e.fence, 1]), ultimoPaso: e.fence };
        escrituras = [];
      }
      guardas(); // Barrera: no mas lecturas ni efectos externos a partir de aqui.
      for (const item of escrituras) tx.create(item.ref, item.datos);
      tx.update(r.ejecucion, siguiente); tx.update(r.cerrojo, { fence: siguiente.fence });
      return resultado(siguiente);
    });
  }
  async function seguro(fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof ErrorContable) throw e;
      throw new ErrorContable('PREP_RESULTADO_INCIERTO');
    }
  }
  return Object.freeze({ iniciar: entrada => seguro(() => iniciar(entrada)),
    avanzar: (entrada, fence) => seguro(() => avanzar(entrada, fence)) });
}
module.exports = Object.freeze({ crearPreparadorDemo, PROCEDIMIENTO });
