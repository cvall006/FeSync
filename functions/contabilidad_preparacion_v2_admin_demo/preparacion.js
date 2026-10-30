'use strict';
const { exigir, registroExacto, ErrorContable, sumarMinor } = require('../finanzas_core/dinero');
const { parametros, canon } = require('../contabilidad_generaciones_v2_demo/util');
const { leerFuente } = require('../contabilidad_generaciones_v2_demo/fuente');
const { conciliar, normalizarPagina, cabeceraDestino } = require('../contabilidad_generaciones_v2_demo/modelo');
const { exigirRuntime } = require('./runtime');
const { verificarEntorno, verificarCliente } = require('../contabilidad_preparacion_acreditada_demo/entorno');
const { vinculo, sellar } = require('./evidencia');
const { referencias, subcolecciones, comprobar, destino, comprobarEvidencia, comprobarOtros } = require('./estado');
function contexto({ db, env = process.env, custodia, runtime }) {
  const identidad = exigirRuntime(runtime, true);
  registroExacto(custodia, ['verificar']);
  exigir(typeof custodia.verificar === 'function', 'E_CUSTODIA_REQUERIDA');
  const verificar = custodia.verificar;
  function guardas(revalidar = false) {
    // En callbacks solo consulta la capacidad privada: sin FS ni callbacks externos.
    exigirRuntime(runtime, false);
    if (revalidar) {
      exigirRuntime(runtime, true); verificarEntorno(env); verificarCliente(db);
      exigir(verificar() === true, 'E_EXCLUSION_NO_CONFIRMADA');
    }
  }
  guardas(true); return { identidad, guardas };
}
const respuesta = e => Object.freeze({ estado: e.estado, fence: e.fence, preparados: e.preparados,
  activa: false, procedencia: e.runtime.tipo, acreditacionAdministrativa: e.runtime.acreditacionAdministrativa, error: e.error ?? null });
function crearPreparador(opciones) {
  const { db } = opciones, { identidad: runtime, guardas } = contexto(opciones);
  async function iniciar(entrada) {
    guardas(true); const p = parametros(entrada), r = referencias(db, p);
    await subcolecciones(r);
    return db.runTransaction(async tx => {
      guardas();
      const [es, cs, gs, evidencia] = await Promise.all([r.ejecucion, r.cerrojo, r.generacion, r.evidencia].map(ref => tx.get(ref)));
      await comprobarOtros(tx, db, p);
      const f = await leerFuente(tx, db, p);
      if (es.exists) {
        const e = es.data(); comprobar(e, p, runtime, f, cs, gs);
        const d = await destino(tx, db, r, e, p, f, gs);
        if (e.estado === 'verificada') comprobarEvidencia(e, p, runtime, f, d.documentos, evidencia);
        else exigir(!evidencia.exists && e.evidencia === null, 'E_EVIDENCIA_INESPERADA');
        guardas(); return respuesta(e);
      }
      exigir(!cs.exists && !gs.exists && !evidencia.exists, 'E_DESTINO_OCUPADO');
      for (const nombre of ['control', 'consolidados', 'periodos', 'saldos']) {
        exigir((await tx.get(db.collection(`${r.generacion.path}/${nombre}`).limit(1))).empty, 'E_DESTINO_OCUPADO');
      }
      const cp = conciliar(f, null, [], f.proyecciones.corte.secuencia === 0).checkpoint;
      const e = { ...vinculo(p, runtime, f), cabecera: cabeceraDestino(p), checkpoint: cp,
        preparados: 0, estado: f.proyecciones.corte.secuencia ? 'conciliando' : 'preparando',
        fence: 0, ultimoPaso: null, evidencia: null };
      exigir(Buffer.byteLength(canon(e)) <= 800000, 'E_CHECKPOINT_EXCESIVO');
      guardas();
      tx.create(r.ejecucion, e);
      tx.create(r.cerrojo, { ejecucionId: p.ejecucionId, generacionId: p.generacionId,
        identidad: e.identidad, operador: p.operador, runtime, fence: 0 });
      tx.create(r.generacion, e.cabecera); return respuesta(e);
    });
  }
  async function avanzar(entrada, fence) {
    guardas(true); const p = parametros(entrada), r = referencias(db, p);
    exigir(Number.isSafeInteger(fence) && fence >= 0, 'E_FENCING');
    await subcolecciones(r);
    return db.runTransaction(async tx => {
      guardas();
      const [es, cs, gs, evidencia] = await Promise.all([r.ejecucion, r.cerrojo, r.generacion, r.evidencia].map(ref => tx.get(ref)));
      exigir(es.exists && cs.exists && gs.exists, 'E_EJECUCION_AUSENTE');
      await comprobarOtros(tx, db, p);
      const e = es.data(), f = await leerFuente(tx, db, p);
      comprobar(e, p, runtime, f, cs, gs);
      exigir(e.fence === fence || (e.fence === fence + 1 && e.ultimoPaso === fence), 'E_FENCING');
      let siguiente, lote = [], sello = null;
      try {
        const d = await destino(tx, db, r, e, p, f, gs);
        if (e.estado === 'verificada') comprobarEvidencia(e, p, runtime, f, d.documentos, evidencia);
        else exigir(!evidencia.exists && e.evidencia === null, 'E_EVIDENCIA_INESPERADA');
        if (['verificada', 'fallida'].includes(e.estado) || e.fence === fence + 1) { guardas(); return respuesta(e); }
        siguiente = { ...e, fence: sumarMinor([e.fence, 1]), ultimoPaso: e.fence };
        if (e.estado === 'conciliando') {
          const pagina = f.movimientos.slice(e.checkpoint.documentos.length, e.checkpoint.documentos.length + p.pagina);
          const fin = e.checkpoint.documentos.length + pagina.length === e.corte.secuencia;
          exigir(pagina.length > 0 || fin, 'E_PAGINA_VACIA');
          siguiente.checkpoint = conciliar(f, e.checkpoint, normalizarPagina(pagina), fin).checkpoint;
          siguiente.estado = fin ? 'preparando' : 'conciliando';
        } else if (e.estado === 'preparando') {
          lote = d.forma.items.slice(e.preparados, e.preparados + p.lote);
          siguiente.preparados += lote.length;
          if (siguiente.preparados === d.forma.items.length) siguiente.estado = 'verificando';
        } else {
          exigir(e.estado === 'verificando', 'E_ESTADO_INVALIDO');
          sello = sellar({ vinculo: vinculo(p, runtime, f), fence: siguiente.fence,
            checkpoint: e.checkpoint, documentos: d.documentos });
          siguiente.estado = 'verificada'; siguiente.evidencia = r.evidencia.path;
        }
        exigir(Buffer.byteLength(canon(siguiente)) <= 800000 &&
          (!sello || Buffer.byteLength(canon(sello)) <= 800000), 'E_CHECKPOINT_EXCESIVO');
      } catch (error) {
        if (!(error instanceof ErrorContable)) throw error;
        siguiente = { ...e, estado: 'fallida', error: error.codigo,
          fence: sumarMinor([e.fence, 1]), ultimoPaso: e.fence };
        lote = []; sello = null;
      }
      guardas(); // Todas las lecturas preceden a cualquier escritura.
      for (const item of lote) tx.create(db.doc(`${r.generacion.path}/${item.ruta}`), item.datos);
      if (sello) tx.create(r.evidencia, sello);
      tx.update(r.ejecucion, siguiente); tx.update(r.cerrojo, { fence: siguiente.fence });
      return respuesta(siguiente);
    });
  }
  async function seguro(fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof ErrorContable || e.message === 'E_RUNTIME_NO_AUTORIZADO') throw e;
      throw new ErrorContable('E_RESULTADO_INCIERTO');
    }
  }
  return Object.freeze({ iniciar: p => seguro(() => iniciar(p)), avanzar: (p, f) => seguro(() => avanzar(p, f)) });
}
module.exports = Object.freeze({ crearPreparador, contexto });
