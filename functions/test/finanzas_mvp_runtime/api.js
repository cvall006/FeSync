'use strict';

// API exclusiva del circuito demo. No se exporta desde functions/index.js.
const { crearAdaptadorFirestore, LIMITES } = require('../../finanzas_core/adaptador_firestore');
const { calcularLibro } = require('../../finanzas_core/asientos');
const { exigir, registroExacto } = require('../../finanzas_core/dinero');
const { exigirEscrituraV1 } = require('../../finanzas_core/protocolo');
const { crearSolicitudes, version, id, canon } = require('../../finanzas_v1/solicitudes');
const { entorno } = require('../../finanzas_v1/entorno');

function crearApi({ db, FieldValue, HttpsError, adaptador }) {
  const adapter = adaptador ?? crearAdaptadorFirestore({ db, FieldValue });
  const { contexto, callable, ejecutar } = crearSolicitudes({ db, HttpsError, adaptador: adapter });
  async function limitado(tx, base, nombre, limite) {
    const q = await tx.get(db.collection(`${base}/${nombre}`).limit(limite + 1));
    exigir(q.size <= limite, 'LIMITE_LIBRO_EXCEDIDO');
    exigir(Buffer.byteLength(JSON.stringify(q.docs.map(s => s.data()))) <= LIMITES.bytesLectura / 4, 'LIMITE_LECTURA_EXCEDIDO');
    return q.docs;
  }
  async function consultar(uid, data) {
    registroExacto(data, [], ['contexto', 'periodoId', 'historialPaginado']);
    exigir(data.historialPaginado === undefined || data.historialPaginado === true, 'CONSULTA_INVALIDA');
    return db.runTransaction(async tx => {
      const c = await contexto(tx, uid);
      if (data.contexto) exigir(canon(data.contexto) === canon(c.contexto), 'PERTENENCIA_ANTERIOR');
      const [configS, periodoS, protocoloS] = await Promise.all(['finanzas_config/contabilidad', 'finanzas_control/periodo', 'finanzas_control/protocolo'].map(r => tx.get(db.doc(`${c.base}/${r}`))));
      if (!configS.exists) return { contexto: c.contexto, permisos: c.permisos, configurada: false };
      const periodoId = data.periodoId ?? periodoS.data()?.periodosAbiertos?.[0];
      const [cuentas, categorias, movimientos] = await Promise.all([
        limitado(tx, c.base, 'finanzas_cuentas', LIMITES.cuentas), limitado(tx, c.base, 'finanzas_categorias', LIMITES.categorias),
        limitado(tx, c.base, 'finanzas_movimientos', LIMITES.movimientos)]);
      const catalogo = cuentas.map(s => s.data().cuenta);
      const libro = movimientos.map(s => s.data()).sort((a, b) => a.secuencia - b.secuencia);
      const resumen = calcularLibro({ movimientos: libro.map(m => m.movimiento), cuentas: catalogo.map(({ id, moneda, escala }) => ({ id, moneda, escala })), periodoId });
      const total = calcularLibro({ movimientos: libro.map(m => m.movimiento), cuentas: catalogo.map(({ id, moneda, escala }) => ({ id, moneda, escala })) });
      return { contexto: c.contexto, permisos: c.permisos, configurada: true, periodoId,
        protocolo: protocoloS.data()?.estado ?? 'ausente', cuentas: catalogo, categorias: categorias.map(s => s.data().categoria),
        resumen, saldos: total.saldoFinalPorCuenta, saldoTotalMinor: total.saldoFinalMinor,
        // No se devuelve privado/aportante, responsable ni precondiciones.
        movimientos: libro.map(m => ({ id: m.movimiento.id, secuencia: m.secuencia, ...m.movimiento,
          clasificacion: m.clasificacion, descripcion: m.descripcion })) };
    });
  }
  async function inicializar(uid, data) {
    registroExacto(data, ['contexto', 'periodoId']); exigir(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.periodoId), 'PERIODO_INVALIDO');
    return db.runTransaction(async tx => {
      const c = await contexto(tx, uid, 'administrarConfiguracion');
      exigir(canon(data.contexto) === canon(c.contexto), 'PERTENENCIA_ANTERIOR');
      const marker = await tx.get(db.doc(`finanzas_mvp_fixtures/${c.iglesiaId}`));
      exigir(marker.data()?.autorizado === true && marker.data()?.adminUid === uid, 'FIXTURE_NO_AUTORIZADA');
      const rutas = ['finanzas_config/contabilidad', 'finanzas_control/protocolo', 'finanzas_control/libro', 'finanzas_control/periodo', 'finanzas_control/generacion_v2'];
      const snaps = await Promise.all(rutas.map(r => tx.get(db.doc(`${c.base}/${r}`))));
      // Nunca sobrescribir protocolos existentes ni reparar libros parcialmente inicializados.
      if (snaps[0].exists) { exigirEscrituraV1(snaps[1].data(), c.iglesiaId); exigir(snaps[2].exists && snaps[3].exists && !snaps[4].exists, 'LIBRO_INCOHERENTE'); return { estado: 'YA_CONFIGURADA' }; }
      exigir(snaps.every(s => !s.exists), 'NO_REINICIALIZAR');
      for (const nombre of ['finanzas_cuentas', 'finanzas_categorias', 'finanzas_movimientos', 'finanzas_saldos', 'finanzas_generaciones_demo', 'finanzas_preparaciones_v2_demo', 'finanzas_resumenes']) {
        exigir((await tx.get(db.collection(`${c.base}/${nombre}`).limit(1))).empty, 'NO_REINICIALIZAR');
      }
      const encabezado = { versionEsquema: 1, iglesiaId: c.iglesiaId };
      tx.create(snaps[0].ref, { ...encabezado, moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
      tx.create(snaps[1].ref, { versionProtocolo: 1, iglesiaId: c.iglesiaId, epoca: 1, estado: 'operativo_v1' });
      tx.create(snaps[2].ref, { ...encabezado, ultimaSecuencia: 0, huboMovimientos: false });
      tx.create(snaps[3].ref, { ...encabezado, periodosAbiertos: [data.periodoId] });
      return { estado: 'CONFIGURADA' };
    });
  }
  return { consultar: callable(consultar), inicializar: callable(inicializar), ejecutar };
}
module.exports = { crearApi, entorno };
