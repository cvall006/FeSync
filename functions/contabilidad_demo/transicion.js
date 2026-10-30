'use strict';

const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { verificarEntorno } = require('./entorno');
const { obtenerContextoFuentes } = require('./fuentes');
const { exigir, registroExacto, ErrorContable, periodoValido, restarMinor } = require('../finanzas_core/dinero');
const { exigirEscrituraV1 } = require('../finanzas_core/protocolo');
const { validarConfiguracionContable } = require('../finanzas_core/configuracion');
const { validarCatalogoCuentas } = require('../finanzas_core/cuentas');
const { validarCatalogoCategorias } = require('../finanzas_core/categorias');
const { conciliarPaginas, VERSION_ALGORITMO } = require('../finanzas_core/conciliacion');
const { calcularLibro } = require('../finanzas_core/asientos');

const ESCRITORES = Object.freeze(['adaptador_firestore:FIN-7C.4D.1']);
const COLECCIONES = Object.freeze({ finanzas_cuentas: 50, finanzas_categorias: 50,
  finanzas_saldos: 50, finanzas_movimientos: 200, finanzas_resumenes: 24,
  finanzas_reversiones: 200, finanzas_aperturas: 50, finanzas_reservas_cuentas: 50,
  finanzas_reservas_categorias: 50 });
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ?
  '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
const huella = v => createHash('sha256').update(canon(v)).digest('hex');
const version = s => s.exists ? `${s.updateTime.seconds}:${s.updateTime.nanoseconds}` : null;
const id = v => exigir(typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v), 'DEMO_ID_INVALIDO');
function parametros(v) {
  registroExacto(v, ['iglesiaId', 'ejecucionId', 'operador', 'periodos', 'pagina', 'lote']);
  id(v.iglesiaId); id(v.ejecucionId);
  exigir(typeof v.operador === 'string' && /^[a-f0-9]{64}$/.test(v.operador), 'DEMO_OPERADOR_INVALIDO');
  exigir(Array.isArray(v.periodos) && v.periodos.length > 0 && v.periodos.length <= 24 &&
    v.periodos.every(periodoValido) && new Set(v.periodos).size === v.periodos.length, 'DEMO_PERIODOS_INVALIDOS');
  exigir(Number.isInteger(v.pagina) && v.pagina >= 1 && v.pagina <= 50 &&
    Number.isInteger(v.lote) && v.lote >= 1 && v.lote <= 25, 'DEMO_LIMITES_INVALIDOS');
  return { ...v, periodos: [...v.periodos].sort(), operador: huella(v.operador) };
}

/** Herramienta privada de ensayo. No inicializa SDK, no acepta destinos remotos.
 * La custodia es una precondicion externa DECLARADA, no prueba de ausencia de
 * otros clientes Admin en un emulador abierto. Si no se acredita, no utilizar.
 */
function crearTransicionDemo({ db, env = process.env, custodia, inventarioId }) {
  verificarEntorno(env);
  exigir(db?.projectId === 'demo-fesync' && db._settings?.servicePath === '127.0.0.1' &&
    db._settings?.port === 8088 && db._settings?.ssl === false, 'DEMO_CLIENTE_PROHIBIDO');
  registroExacto(custodia, ['emuladorExclusivo', 'escritores', 'administrador']);
  exigir(custodia.emuladorExclusivo === true && custodia.administrador === true &&
    isDeepStrictEqual(custodia.escritores, ESCRITORES), 'DEMO_EXCLUSION_NO_ACREDITADA');
  const fuentes = obtenerContextoFuentes(inventarioId);
  const huellaSoftware = fuentes.huellaSoftware;

  async function fuente(tx, iglesiaId) {
    const base = `iglesias/${iglesiaId}`, documentos = [], colecciones = {};
    const leer = async ruta => { const s = await tx.get(db.doc(ruta)); documentos.push(s); return s; };
    const iglesia = await leer(base); exigir(iglesia.exists, 'DEMO_IGLESIA_AUSENTE');
    const config = await leer(`${base}/finanzas_config/contabilidad`);
    const configuracion = validarConfiguracionContable(config.data(), iglesiaId);
    const libro = await leer(`${base}/finanzas_control/libro`), periodo = await leer(`${base}/finanzas_control/periodo`);
    exigir(libro.exists && periodo.exists && libro.data().versionEsquema === 1 &&
      libro.data().iglesiaId === iglesiaId && Number.isSafeInteger(libro.data().ultimaSecuencia) &&
      libro.data().ultimaSecuencia >= 0 && libro.data().ultimaSecuencia <= 200 &&
      libro.data().huboMovimientos === (libro.data().ultimaSecuencia > 0), 'DEMO_CONTROL_INVALIDO');
    for (const [nombre, limite] of Object.entries(COLECCIONES)) {
      const q = await tx.get(db.collection(`${base}/${nombre}`).orderBy('__name__').limit(limite + 1));
      exigir(q.size <= limite, 'DEMO_LIMITE_EXCEDIDO'); colecciones[nombre] = q.docs; documentos.push(...q.docs);
      exigir(documentos.reduce((n, s) => n + Buffer.byteLength(canon(s.data() ?? null)), 0) <= 2 * 1024 * 1024,
        'DEMO_LIMITE_EXCEDIDO');
    }
    validarCatalogoCuentas(colecciones.finanzas_cuentas.map(s => s.data().cuenta), iglesiaId);
    validarCatalogoCategorias(colecciones.finanzas_categorias.map(s => s.data().categoria), iglesiaId);
    for (const tipo of ['cuentas', 'categorias']) {
      const reservas = colecciones[`finanzas_reservas_${tipo}`];
      exigir(reservas.length === colecciones[`finanzas_${tipo}`].length, 'DEMO_RESERVA_INCOHERENTE');
      for (const entidad of colecciones[`finanzas_${tipo}`]) {
        const valor = entidad.data()[tipo === 'cuentas' ? 'cuenta' : 'categoria'];
        const reserva = reservas.find(s => s.id === valor.codigo)?.data();
        exigir(valor.id === entidad.id && reserva?.versionEsquema === 1 && reserva.iglesiaId === iglesiaId &&
          reserva.entidadId === entidad.id && reserva.codigo === valor.codigo, 'DEMO_RESERVA_INCOHERENTE');
      }
    }
    const aperturas = colecciones.finanzas_movimientos.filter(s => s.data().movimiento?.clase === 'apertura');
    exigir(aperturas.length === colecciones.finanzas_aperturas.length, 'DEMO_APERTURA_INCOHERENTE');
    for (const apertura of aperturas) {
      const m = apertura.data(), cuentaId = m.movimiento.asientos[0]?.cuentaId;
      const reserva = colecciones.finanzas_aperturas.find(s => s.id === cuentaId)?.data();
      exigir(reserva?.versionEsquema === 1 && reserva.iglesiaId === iglesiaId && reserva.cuentaId === cuentaId &&
        reserva.movimientoId === apertura.id && reserva.secuencia === m.secuencia, 'DEMO_APERTURA_INCOHERENTE');
    }
    // Recibos privados reales, nunca sintetizados. Una fuente legada sin ellos
    // requiere revision explicita; esta herramienta no acredita su procedencia.
    for (const s of [...colecciones.finanzas_movimientos, ...colecciones.finanzas_cuentas, ...colecciones.finanzas_categorias]) {
      const d = s.data();
      exigir(d.responsable && typeof d.responsable.uid === 'string' &&
        /^[^/\u0000-\u001f]{1,128}$/.test(d.responsable.uid) &&
        typeof d.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(d.solicitudId), 'DEMO_ORIGEN_NO_VERIFICABLE');
      const r = await leer(`operaciones_financieras/${d.responsable.uid}/solicitudes/${d.solicitudId}`), recibo = r.data();
      const op = s.ref.parent.id === 'finanzas_cuentas' ? 'crearCuenta' : s.ref.parent.id === 'finanzas_categorias' ? 'crearCategoria' :
        d.movimiento?.reversaDe !== null ? 'reversion' : d.movimiento?.clase;
      exigir(r.exists && recibo.versionEsquema === 1 && recibo.uid === d.responsable.uid &&
        recibo.iglesiaId === iglesiaId && recibo.pertenenciaId === d.responsable.pertenenciaId &&
        recibo.solicitudId === d.solicitudId && recibo.movimientoId === s.id && recibo.huella === d.huella &&
        /^[a-f0-9]{64}$/.test(recibo.huella) && recibo.estado === 'confirmado' && recibo.operacion === op &&
        recibo.secuencia === (d.secuencia ?? null), 'DEMO_RECIBO_INCOHERENTE');
    }
    const manifiesto = [...new Map(documentos.map(s => [s.ref.path, { referenciaObservada: huella(s.ref.path), version: version(s) }])).values()]
      .sort((a, b) => a.referenciaObservada.localeCompare(b.referenciaObservada));
    exigir(Buffer.byteLength(canon(manifiesto)) <= 256000, 'DEMO_LIMITE_EXCEDIDO');
    return { configuracion, libro, periodo, colecciones, manifiesto };
  }
  const resumen = e => Object.freeze({ estado: e.estado, fence: e.fence, cursor: e.cursor,
    documentosPreparados: e.preparados, activa: false, error: e.error ?? null });
  function referencias(p) {
    const base = `iglesias/${p.iglesiaId}`;
    return { protocolo: db.doc(`${base}/finanzas_control/protocolo`),
      cerrojo: db.doc(`${base}/finanzas_transicion_demo/cerrojo`),
      ejecucion: db.doc(`${base}/finanzas_ejecuciones_demo/${p.ejecucionId}`),
      generacion: db.doc(`${base}/finanzas_generaciones_demo/${p.ejecucionId}`) };
  }
  async function preflight(iglesiaId) {
    id(iglesiaId);
    return db.runTransaction(async tx => {
      const p = await tx.get(db.doc(`iglesias/${iglesiaId}/finanzas_control/protocolo`));
      exigirEscrituraV1(p.exists ? p.data() : null, iglesiaId);
      const f = await fuente(tx, iglesiaId);
      const c = await tx.get(db.doc(`iglesias/${iglesiaId}/finanzas_transicion_demo/cerrojo`));
      const ejecuciones = await tx.get(db.collection(`iglesias/${iglesiaId}/finanzas_ejecuciones_demo`).limit(1));
      const generaciones = await tx.get(db.collection(`iglesias/${iglesiaId}/finanzas_generaciones_demo`).limit(1));
      exigir(!c.exists && ejecuciones.empty && generaciones.empty, 'DEMO_EJECUCION_EXISTENTE');
      return Object.freeze({ estado: 'pendiente', movimientos: f.colecciones.finanzas_movimientos.length,
        cuentas: f.colecciones.finanzas_cuentas.length, epoca: 1, activa: false });
    });
  }
  async function inicializarProtocolo(iglesiaId) {
    id(iglesiaId);
    // Solo bootstrap de libro VACIO de un emulador nuevo bajo custodia. No se
    // infiere de ausencia que nunca existio una epoca anterior en datos importados.
    const r = referencias({ iglesiaId, ejecucionId: 'bootstrap' });
    return db.runTransaction(async tx => {
      const p = await tx.get(r.protocolo), c = await tx.get(r.cerrojo);
      const ejecuciones = await tx.get(db.collection(`iglesias/${iglesiaId}/finanzas_ejecuciones_demo`).limit(1));
      const generaciones = await tx.get(db.collection(`iglesias/${iglesiaId}/finanzas_generaciones_demo`).limit(1));
      const f = await fuente(tx, iglesiaId);
      exigir(!p.exists && !c.exists && ejecuciones.empty && generaciones.empty && f.libro.data().ultimaSecuencia === 0 &&
        Object.values(f.colecciones).every(d => d.length === 0), 'DEMO_BOOTSTRAP_PROHIBIDO');
      tx.create(r.protocolo, { iglesiaId, versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' });
      return { inicializado: true };
    });
  }
  async function iniciar(entrada) {
    const p = parametros(entrada), r = referencias(p), identidad = huella(p);
    return db.runTransaction(async tx => {
      const e = await tx.get(r.ejecucion), c = await tx.get(r.cerrojo), g = await tx.get(r.generacion), protocolo = await tx.get(r.protocolo);
      if (e.exists) {
        exigir(e.data().identidad === identidad && c.exists && c.data().ejecucionId === p.ejecucionId &&
          e.data().operador === p.operador && g.exists, 'DEMO_FENCING');
        fuentes.comprobarEjecucion(e.data(), g.data(), p);
        return resumen(e.data());
      }
      exigirEscrituraV1(protocolo.exists ? protocolo.data() : null, p.iglesiaId);
      exigir(!c.exists && !g.exists, 'DEMO_EJECUCION_EXISTENTE');
      const ejecuciones = await tx.get(db.collection(`iglesias/${p.iglesiaId}/finanzas_ejecuciones_demo`).limit(1));
      const generaciones = await tx.get(db.collection(`iglesias/${p.iglesiaId}/finanzas_generaciones_demo`).limit(1));
      exigir(ejecuciones.empty && generaciones.empty, 'DEMO_EJECUCION_EXISTENTE');
      const f = await fuente(tx, p.iglesiaId);
      const eNueva = { versionEsquema: 1, ...fuentes.metadatos, versionProcedimiento: 1, huellaSoftware, versionAlgoritmo: VERSION_ALGORITMO, iglesiaId: p.iglesiaId,
        ejecucionId: p.ejecucionId, operador: p.operador, identidad, epoca: 1, fence: 0, estado: 'bloqueada',
        periodos: p.periodos, pagina: p.pagina, lote: p.lote, cursor: null, checkpoint: null, preparados: 0,
        corte: { secuencia: f.libro.data().ultimaSecuencia, versionControl: version(f.libro) },
        manifiesto: f.manifiesto, huellaObservada: huella(f.manifiesto), ultimoPaso: null };
      tx.update(r.protocolo, { estado: 'bloqueado' }); tx.create(r.ejecucion, eNueva);
      tx.create(r.cerrojo, { ejecucionId: p.ejecucionId, operador: p.operador, fence: 0 });
      tx.create(r.generacion, { versionEsquema: 2, ...fuentes.metadatos, versionProcedimiento: 1, huellaSoftware, versionAlgoritmo: VERSION_ALGORITMO, epoca: 1,
        corte: eNueva.corte, huellaObservada: eNueva.huellaObservada, activa: false, estado: 'preparando' });
      return resumen(eNueva);
    });
  }
  async function avanzar(entrada, fenceEsperado) {
    const p = parametros(entrada), r = referencias(p);
    exigir(Number.isSafeInteger(fenceEsperado) && fenceEsperado >= 0, 'DEMO_FENCING');
    return db.runTransaction(async tx => {
      const protocolo = await tx.get(r.protocolo), cerrojo = await tx.get(r.cerrojo), ejecucion = await tx.get(r.ejecucion), generacion = await tx.get(r.generacion);
      exigir(protocolo.exists && isDeepStrictEqual(protocolo.data(), { iglesiaId: p.iglesiaId,
        versionProtocolo: 1, epoca: 1, estado: 'bloqueado' }), 'DEMO_BLOQUEO_PERDIDO');
      exigir(ejecucion.exists && cerrojo.exists, 'DEMO_FENCING');
      const e = ejecucion.data(), c = cerrojo.data();
      exigir(Number.isSafeInteger(e.fence) && e.fence >= 0 && e.fence < Number.MAX_SAFE_INTEGER &&
        e.epoca === 1 && e.versionAlgoritmo === VERSION_ALGORITMO && huella(e.manifiesto) === e.huellaObservada, 'DEMO_FENCING');
      exigir(e.identidad === huella(p) && e.operador === p.operador && c.operador === p.operador &&
        c.ejecucionId === p.ejecucionId && c.fence === e.fence &&
        e.versionProcedimiento === 1, 'DEMO_FENCING');
      exigir(generacion.exists && generacion.data().activa === false && generacion.data().versionEsquema === 2 &&
        generacion.data().epoca === e.epoca && generacion.data().versionAlgoritmo === VERSION_ALGORITMO &&
        generacion.data().versionProcedimiento === 1 &&
        isDeepStrictEqual(generacion.data().corte, e.corte) && generacion.data().huellaObservada === e.huellaObservada,
      'DEMO_GENERACION_INCOHERENTE');
      fuentes.comprobarEjecucion(e, generacion.data(), p);
      if (e.fence === fenceEsperado + 1 && e.ultimoPaso === fenceEsperado) return resumen(e);
      exigir(e.fence === fenceEsperado, 'DEMO_FENCING');
      if (['verificada', 'fallida'].includes(e.estado)) return resumen(e);
      let siguiente = { ...e, fence: e.fence + 1, ultimoPaso: e.fence }, escrituras = [];
      try {
        const f = await fuente(tx, p.iglesiaId);
        exigir(isDeepStrictEqual(f.manifiesto, e.manifiesto), 'DEMO_FUENTE_CAMBIO');
        const refs = f.colecciones.finanzas_cuentas.map(s => ({ id: s.id, moneda: s.data().cuenta.moneda, escala: s.data().cuenta.escala }));
        const movimientos = f.colecciones.finanzas_movimientos;
        exigir(movimientos.every(s => p.periodos.includes(s.data().movimiento.periodoId)), 'DEMO_PERIODOS_INCOMPLETOS');
        const contexto = { iglesiaId: p.iglesiaId, configuracion: { moneda: f.configuracion.moneda,
          escala: f.configuracion.escala, zonaHoraria: f.configuracion.zonaHoraria }, cuentas: refs, periodos: p.periodos,
          controlInicial: { version: version(f.libro), datos: f.libro.data() }, modoLectura: 'PAUSA_EXTERNA_DECLARADA' };
        const proyecciones = { corte: e.corte,
          saldos: f.colecciones.finanzas_saldos.map(s => ({ cuentaId: s.id, datos: s.data() })),
          resumenes: f.colecciones.finanzas_resumenes.map(s => ({ periodoId: s.id, datos: s.data() })),
          marcadores: f.colecciones.finanzas_reversiones.map(s => ({ originalId: s.id, datos: s.data() })) };
        if (['bloqueada', 'conciliando'].includes(e.estado)) {
          let q = db.collection(`iglesias/${p.iglesiaId}/finanzas_movimientos`).orderBy('secuencia').orderBy('__name__');
          if (e.cursor) q = q.startAfter(e.cursor.secuencia, e.cursor.id);
          const pagina = await tx.get(q.limit(p.pagina));
          const total = (e.checkpoint?.documentos.length ?? 0) + pagina.size;
          const fin = total === e.corte.secuencia;
          const resultado = conciliarPaginas({ contexto, checkpoint: e.checkpoint,
            paginas: [pagina.docs.map(s => ({ id: s.id, version: version(s), datos: s.data() }))],
            finDelListado: fin, controlFinal: { version: version(f.libro), datos: f.libro.data() }, proyecciones });
          // Libro vacio: la ausencia de resumen V1 cero es legitima, se explicita;
          // no se crea una observacion falsa ni se modifica el reporte de FIN-4C.
          const incidencias = resultado.reporte.incidencias.filter(i => !(e.corte.secuencia === 0 &&
            i.codigo === 'RESUMEN_AUSENTE') && !(i.codigo === 'PAGINAS_PENDIENTES_O_INVALIDAS' && !fin) &&
            !(i.codigo === 'COMPARACION_POSPUESTA_POR_CORTE' && !fin));
          exigir(incidencias.length === 0 && (!fin || resultado.reporte.completoHastaCorte), 'DEMO_CONCILIACION_RECHAZADA');
          exigir(fin || pagina.size > 0, 'DEMO_PAGINA_INCOMPLETA');
          siguiente = { ...siguiente, checkpoint: resultado.checkpoint, cursor: resultado.checkpoint.cursor,
            estado: fin ? 'preparando' : 'conciliando' };
        } else {
          exigir(e.estado === 'preparando' && e.checkpoint, 'DEMO_ESTADO_INVALIDO');
          const relectura = conciliarPaginas({ contexto, checkpoint: e.checkpoint, paginas: [], finDelListado: true,
            controlFinal: { version: version(f.libro), datos: f.libro.data() }, proyecciones });
          exigir(relectura.reporte.completoHastaCorte && relectura.reporte.incidencias.every(i =>
            e.corte.secuencia === 0 && i.codigo === 'RESUMEN_AUSENTE'), 'DEMO_CONCILIACION_RECHAZADA');
          const calculado = e.checkpoint.reconstruccion;
          const items = [
            ...calculado.saldos.map(s => ({ ruta: `${r.generacion.path}/saldos/${s.cuentaId}`, datos: s })),
            ...calculado.periodos.flatMap(periodo => [{ ruta: `${r.generacion.path}/periodos/${periodo.periodoId}`, datos: periodo },
              ...refs.map(cuenta => {
                // FIN-2 clasifica un sublibro de movimientos COMPLETOS que tocan
                // la cuenta (incluye ambas patas y originales de las reversas).
                // No se duplican formulas ni se mutilan transferencias.
                const rCuenta = calcularLibro({ movimientos: e.checkpoint.documentos.map(d => d.movimiento)
                  .filter(m => m.asientos.some(a => a.cuentaId === cuenta.id)), cuentas: refs,
                configuracion: contexto.configuracion, periodoId: periodo.periodoId });
                const transferencias = calcularLibro({ movimientos: e.checkpoint.documentos.map(d => d.movimiento)
                  .filter(m => m.clase === 'transferencia'), cuentas: refs,
                configuracion: contexto.configuracion, periodoId: periodo.periodoId });
                return { ruta: `${r.generacion.path}/cuentas_periodo/${huella([periodo.periodoId, cuenta.id])}`,
                  datos: { cuentaId: cuenta.id, periodoId: periodo.periodoId,
                    saldoInicialMinor: periodo.saldoInicialPorCuenta[cuenta.id], saldoFinalMinor: periodo.saldoFinalPorCuenta[cuenta.id],
                    ingresosNetosMinor: rCuenta.ingresosNetosMinor, gastosNetosMinor: rCuenta.gastosNetosMinor,
                    resultadoMinor: rCuenta.resultadoMinor, aperturasNetasMinor: rCuenta.aperturasNetasMinor,
                    ajustesNetosMinor: rCuenta.ajustesNetosMinor,
                    transferenciasNetasMinor: restarMinor(transferencias.saldoFinalPorCuenta[cuenta.id], transferencias.saldoInicialPorCuenta[cuenta.id]) } };
              })]),
          ];
          const lote = items.slice(e.preparados, e.preparados + p.lote);
          for (const item of lote) {
            const s = await tx.get(db.doc(item.ruta)); exigir(!s.exists, 'DEMO_GENERACION_INESPERADA');
            escrituras.push(item);
          }
          siguiente.preparados += lote.length;
          if (siguiente.preparados === items.length) {
            // Verificacion exhaustiva acotada de la generacion, en el mismo corte.
            const esperados = new Map(items.map(i => [i.ruta, i.datos]));
            for (const nombre of ['saldos', 'periodos', 'cuentas_periodo']) {
              const existentes = await tx.get(r.generacion.collection(nombre).limit(items.length + 1));
              for (const s of existentes.docs) { exigir(esperados.has(s.ref.path) && isDeepStrictEqual(s.data(), esperados.get(s.ref.path)), 'DEMO_GENERACION_DIVERGE'); esperados.delete(s.ref.path); }
            }
            for (const item of escrituras) { exigir(isDeepStrictEqual(esperados.get(item.ruta), item.datos), 'DEMO_GENERACION_DIVERGE'); esperados.delete(item.ruta); }
            exigir(esperados.size === 0, 'DEMO_GENERACION_INCOMPLETA'); siguiente.estado = 'verificada';
          }
        }
        exigir(Buffer.byteLength(canon(siguiente)) <= 800000, 'DEMO_CHECKPOINT_EXCESIVO');
      } catch (error) {
        if (!(error instanceof ErrorContable)) throw error;
        siguiente = { ...e, fence: e.fence + 1, ultimoPaso: e.fence, estado: 'fallida', error: error.codigo };
        escrituras = [];
      }
      // Barrera: no mas lecturas. El fence, lote y checkpoint comparten commit.
      for (const item of escrituras) tx.create(db.doc(item.ruta), item.datos);
      tx.update(r.ejecucion, siguiente); tx.update(r.cerrojo, { fence: siguiente.fence });
      tx.update(r.generacion, { estado: siguiente.estado, activa: false });
      return resumen(siguiente);
    });
  }
  return Object.freeze({ preflight, inicializarProtocolo, iniciar, avanzar });
}

module.exports = Object.freeze({ crearTransicionDemo, ESCRITORES });
