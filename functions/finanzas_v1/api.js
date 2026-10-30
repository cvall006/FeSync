'use strict';
const { exigir, registroExacto, ErrorContable } = require('../finanzas_core/dinero');
const { crearSolicitudes } = require('./solicitudes');
const { crearAdaptadorIncremental } = require('./adaptador');
const c = require('./comun');
function cursorLeer(texto) {
  exigir(typeof texto === 'string' && texto.length <= 1200, 'CURSOR_INVALIDO');
  let v; try { v = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8')); } catch { exigir(false, 'CURSOR_INVALIDO'); }
  registroExacto(v, ['version', 'iglesiaId', 'uid', 'pertenenciaId', 'corte', 'ultimo', 'limite']);
  exigir(v.version === 1 && Number.isSafeInteger(v.corte) && Number.isSafeInteger(v.ultimo) && v.ultimo > 0 &&
    v.ultimo <= v.corte, 'CURSOR_INVALIDO'); return v;
}
function crearApiIncremental({ db, FieldValue, HttpsError }) {
  const adaptador = crearAdaptadorIncremental({ db, FieldValue });
  const api = crearSolicitudes({ db, HttpsError, adaptador });
  async function consultar(request) {
    c.entornoOperacion();
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión.');
    try {
      const uid = request.auth.uid, data = request.data; registroExacto(data, [], ['contexto', 'limite', 'cursor', 'historialPaginado']);
      exigir(data.historialPaginado === true, 'CLIENTE_HISTORIAL_PAGINADO_REQUERIDO');
      const limite = data.limite ?? 50; exigir(Number.isInteger(limite) && limite >= 1 && limite <= 50, 'LIMITE_PAGINA_INVALIDO');
      const cursor = data.cursor == null ? null : cursorLeer(data.cursor);
      return await db.runTransaction(async tx => {
        const perfil = await tx.get(db.doc(`usuarios_globales/${uid}`));
        exigir(perfil.exists, 'CONTABILIDAD_NO_AUTORIZADA'); const iglesiaId = perfil.data().iglesiaId, b = c.base(iglesiaId);
        const auth = await c.autorizar(db, tx, uid, iglesiaId);
        const contexto = { iglesiaId, pertenenciaId: auth.actor.data().pertenenciaId };
        if (data.contexto) exigir(c.canon(data.contexto) === c.canon(contexto), 'PERTENENCIA_ANTERIOR');
        const [p, control, estado] = await Promise.all(['finanzas_control/protocolo', 'finanzas_control/libro',
          'finanzas_control/incremental_v1'].map(r => tx.get(db.doc(`${b}/${r}`))));
        c.protocolo(p.data(), iglesiaId); const v = c.verificar(estado.data(), control.data(), iglesiaId);
        if (cursor) exigir(cursor.iglesiaId === iglesiaId && cursor.uid === uid &&
          cursor.pertenenciaId === contexto.pertenenciaId && cursor.limite === limite &&
          cursor.corte <= control.data().ultimaSecuencia, 'CURSOR_AJENO_O_INVALIDO');
        const corte = cursor?.corte ?? control.data().ultimaSecuencia;
        let q = db.collection(`${b}/finanzas_movimientos`).where('secuencia', '<=', corte).orderBy('secuencia', 'desc').limit(limite + 1);
        if (cursor) q = q.startAfter(cursor.ultimo);
        const [historia, cuentas, categorias] = await Promise.all([tx.get(q),
          tx.get(db.collection(`${b}/finanzas_cuentas`).limit(51)), tx.get(db.collection(`${b}/finanzas_categorias`).limit(51))]);
        exigir(cuentas.size <= 50 && categorias.size <= 50, 'LIMITE_LIBRO_EXCEDIDO');
        let esperado = cursor ? cursor.ultimo - 1 : corte;
        for (const s of historia.docs) {
          const d = s.data(); exigir(d.secuencia === esperado-- && d.iglesiaId === iglesiaId &&
            d.estado === 'confirmado' && d.movimiento.id === s.id, 'HISTORIAL_INCOMPLETO');
        }
        exigir(historia.size === limite + 1 || esperado === 0, 'HISTORIAL_INCOMPLETO');
        const pagina = historia.docs.slice(0, limite), hayMas = historia.size > limite;
        const siguiente = hayMas ? Buffer.from(JSON.stringify({ version: 1, iglesiaId, uid, pertenenciaId: contexto.pertenenciaId,
          corte, ultimo: pagina.at(-1).data().secuencia, limite })).toString('base64url') : null;
        return { contexto, permisos: auth.permisos, configurada: true,
          versionConsulta: 'v1_incremental_paginado', protocolo: 'operativo_v1', periodoId: v.proyeccion.periodo.periodoId,
          cuentas: cuentas.docs.map(s => s.data().cuenta), categorias: categorias.docs.map(s => s.data().categoria),
          saldoTotalMinor: v.proyeccion.acumulado.saldoFinalMinor,
          saldos: Object.fromEntries(Object.values(v.cuentas).map(s => [s.cuentaId, s.saldoMinor])), resumen: c.resumen(v),
          movimientos: pagina.map(s => { const d = s.data(); return { ...d.movimiento, secuencia: d.secuencia,
            clasificacion: d.clasificacion, descripcion: d.descripcion ?? null }; }).reverse(),
          historial: { corte, limite, cursorSiguiente: siguiente, hayMas, orden: 'secuencia_desc' } };
      });
    } catch (e) {
      if (e instanceof ErrorContable) throw new HttpsError(e.codigo === 'CONTABILIDAD_NO_AUTORIZADA' ? 'permission-denied' : 'failed-precondition', e.codigo);
      throw new HttpsError('unavailable', 'No se pudo consultar el historial.');
    }
  }
  return { ejecutar: api.ejecutar, consultar };
}
module.exports = { crearApiIncremental };
