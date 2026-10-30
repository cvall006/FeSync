'use strict';
// Solo datos ficticios. No activa herramientas administrativas ni generaciones D2.
const { crearApertura, crearIngreso, calcularLibro } = require('../../functions/finanzas_core/asientos');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('../../functions/finanzas_core/proyecciones');
const { CONTRATO_V2 } = require('../../functions/finanzas_core/adaptador_firestore_v2');
const I = 'v2_aislado', A = 'administrador_sintetico', E = 'encargado_sintetico', P = 'a'.repeat(64);
const B = `iglesias/${I}`, G = `${B}/finanzas_generaciones_demo/sintetica`;
const configuracion = Object.freeze({ moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' });
const h = Object.freeze({ versionEsquema: 2, iglesiaId: I, epoca: 1, generacionId: 'sintetica', contrato: CONTRATO_V2 });
function semilla(cantidad = 1) {
  const cuenta = { versionEsquema: 1, id: 'caja', iglesiaId: I, codigo: 'CAJA', nombre: 'Caja',
    tipo: 'caja', moneda: 'CLP', escala: 0, estado: 'activa' };
  const categoria = { versionEsquema: 1, id: 'gastos', iglesiaId: I, codigo: 'GASTOS', nombre: 'Gastos',
    naturaleza: 'gasto', tipoIngreso: null, estado: 'activa' };
  let estado = crearProyeccionInicial({ iglesiaId: I, configuracion, periodoId: '2026-10' });
  let saldo = crearSaldoInicial({ iglesiaId: I, cuentaId: 'caja', periodoId: '2026-10' });
  const docs = {}, movimientos = [];
  for (let n = 0; n < cantidad; n++) {
    const m = (n === 0 ? crearApertura : crearIngreso)({ id: `sintetico_${n}`, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 },
      montoMinor: n === 0 ? 10000 : 1, fechaContable: '2026-10-01', periodoId: '2026-10', configuracion });
    const p = proyectarMovimiento({ estadoAnterior: estado, cuentasAnteriores: [saldo], movimiento: m,
      original: null, aplicacion: { revisionAnterior: n, revisionNueva: n + 1, movimientoId: m.id } });
    estado = p.estado; saldo = p.cuentas[0]; movimientos.push(m);
    docs[`${B}/finanzas_movimientos/${m.id}`] = { ...h, movimiento: m, estado: 'confirmado', secuencia: n + 1 };
  }
  Object.assign(docs, {
    [`usuarios_globales/${A}`]: { iglesiaId: I, rolGlobal: 'admin_iglesia', pertenenciaId: P },
    [`usuarios_globales/${E}`]: { iglesiaId: I, rolGlobal: 'servidor', pertenenciaId: P },
    [B]: { adminUid: A },
    [`${B}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: E },
    [`${B}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: I, ...configuracion },
    [`${B}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: I, periodosAbiertos: ['2026-10'] },
    [`${B}/finanzas_control/protocolo`]: { versionProtocolo: 1, iglesiaId: I, epoca: 1, estado: 'operativo_v2' },
    [`${B}/finanzas_control/generacion_v2`]: h,
    [`${B}/finanzas_cuentas/caja`]: { cuenta }, [`${B}/finanzas_categorias/gastos`]: { categoria },
    [G]: { ...h, activa: true },
    [`${G}/control/libro`]: { ...h, revision: estado.revision, ultimoMovimientoId: estado.ultimoMovimientoId },
    [`${G}/consolidados/CLP`]: { ...h, revision: estado.revision, ultimoMovimientoId: estado.ultimoMovimientoId, datos: estado.acumulado },
    [`${G}/periodos/2026-10`]: { ...h, revision: estado.revision, ultimoMovimientoId: estado.ultimoMovimientoId,
      periodoId: '2026-10', datos: estado.periodo },
    [`${G}/saldos/caja`]: { ...h, proyeccion: saldo, huboMovimientos: cantidad > 0,
      aperturaRegistrada: cantidad > 0, solicitudesInciertas: 0 },
  });
  return { docs: structuredClone(docs), movimientos };
}
async function entrada(db, uid = A, solicitudId = 'solicitud_sintetica_0001') {
  const rutas = { acceso: 'finanzas_config/acceso', iglesia: '', cuenta: 'finanzas_cuentas/caja',
    categoria: 'finanzas_categorias/gastos', configuracion: 'finanzas_config/contabilidad', controlPeriodo: 'finanzas_control/periodo' };
  const precondiciones = { pertenenciaId: P };
  for (const [k, ruta] of Object.entries(rutas)) {
    const s = await db.doc(ruta ? `${B}/${ruta}` : B).get();
    precondiciones[k] = `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
  }
  return { auth: { uid }, operacion: 'gasto', contextoV2: { versionContrato: 1, epoca: 1, generacionId: 'sintetica' },
    solicitud: { versionEsquema: 1, solicitudId, iglesiaId: I, cuentaId: 'caja', categoriaId: 'gastos',
      montoMinor: 4000, fechaContable: '2026-10-17', periodoId: '2026-10', precondiciones } };
}
function libro(movimientos) {
  return calcularLibro({ movimientos, cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }], configuracion, periodoId: '2026-10' });
}
module.exports = Object.freeze({ semilla, entrada, libro, I, A, E, P, B, G, h });
