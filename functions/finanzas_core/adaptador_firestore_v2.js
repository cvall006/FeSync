'use strict';

// Experimental y privado. No acredita ni activa generaciones. auth debe ser la
// proyeccion de request.auth realizada por un adaptador servidor, nunca data.auth.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto, validarMontoPositivo, validarEnteroMinor,
  validarFechaYPeriodo, sumarMinor, ErrorContable } = require('./dinero');
const { prepararGasto } = require('./operaciones');
const { proyectarMovimiento } = require('./proyecciones');

const CONTRATO_V2 = 'gastos_v2_aislado_1';
const VERSIONES = ['iglesia', 'cuenta', 'categoria', 'configuracion', 'controlPeriodo'];
const LIMITES_V2 = Object.freeze({ bytesSolicitud: 16384, bytesLectura: 2 * 1024 * 1024 });
function id(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_V2_INVALIDO');
}
function positivo(v) { validarEnteroMinor(v); exigir(v > 0, 'REVISION_V2_INVALIDA'); }
function version(v) {
  exigir(typeof v === 'string' && /^-?\d{1,12}:\d{1,9}$/.test(v), 'VERSION_V2_INVALIDA');
  const [s, n] = v.split(':').map(Number);
  exigir(s >= -62135596800 && s <= 253402300799 && n >= 0 && n < 1000000000 && v === `${s}:${n}`, 'VERSION_V2_INVALIDA');
  return v;
}
function versionS(s) {
  exigir(s.exists && s.updateTime, 'DOCUMENTO_V2_REQUERIDO');
  return version(`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`);
}
function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
}
function hash(v) {
  // IDs deterministas separados del dominio V1, sin reloj ni generador externo.
  return createHash('sha256').update(Array.isArray(v) ? JSON.stringify(v) : canonico(v)).digest('hex');
}
function capturar(e) {
  registroExacto(e, ['auth', 'operacion', 'solicitud', 'contextoV2']);
  registroExacto(e.auth, ['uid']); id(e.auth.uid);
  exigir(e.operacion === 'gasto', 'OPERACION_V2_NO_IMPLEMENTADA');
  const s = e.solicitud, c = e.contextoV2;
  registroExacto(c, ['versionContrato', 'epoca', 'generacionId']);
  exigir(c.versionContrato === 1, 'CONTRATO_V2_INVALIDO'); positivo(c.epoca); id(c.generacionId);
  registroExacto(s, ['versionEsquema', 'solicitudId', 'iglesiaId', 'cuentaId', 'categoriaId',
    'montoMinor', 'fechaContable', 'periodoId', 'precondiciones'], ['descripcion']);
  exigir(s.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA');
  exigir(typeof s.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId), 'SOLICITUD_ID_INVALIDA');
  [s.iglesiaId, s.cuentaId, s.categoriaId].forEach(id);
  validarMontoPositivo(s.montoMinor); validarFechaYPeriodo(s.fechaContable, s.periodoId);
  registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', ...VERSIONES]);
  exigir(typeof s.precondiciones.pertenenciaId === 'string' && /^[a-f0-9]{64}$/.test(s.precondiciones.pertenenciaId), 'PERTENENCIA_INVALIDA');
  ['acceso', ...VERSIONES].forEach(k => version(s.precondiciones[k]));
  if (Object.hasOwn(s, 'descripcion')) exigir(typeof s.descripcion === 'string' && s.descripcion.length > 0 &&
    s.descripcion.length <= 480 && Array.from(s.descripcion).length <= 240 && s.descripcion === s.descripcion.trim() &&
    s.descripcion === s.descripcion.normalize('NFC') && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(s.descripcion), 'TEXTO_OPERACION_INVALIDO');
  const texto = canonico({ uid: e.auth.uid, operacion: 'gasto', solicitud: s, contextoV2: c });
  exigir(Buffer.byteLength(texto) <= LIMITES_V2.bytesSolicitud, 'SOLICITUD_DEMASIADO_GRANDE');
  const copia = JSON.parse(texto);
  return { ...copia, huella: hash(copia), movimientoId: hash(['finanzas-gasto-v2', copia.uid, s.iglesiaId, s.solicitudId]),
    huellaV1: hash({ uid: copia.uid, operacion: 'gasto', solicitud: copia.solicitud }),
    movimientoV1: hash(['finanzas-gasto-v1', copia.uid, s.iglesiaId, s.solicitudId]) };
}
function datos(s) { exigir(s.exists, 'DOCUMENTO_V2_REQUERIDO'); return s.data(); }

function crearAdaptadorFirestoreV2({ db, FieldValue }) {
  exigir(db && typeof db.doc === 'function' && typeof db.runTransaction === 'function' &&
    FieldValue && typeof FieldValue.serverTimestamp === 'function', 'DEPENDENCIAS_V2_INVALIDAS');
  async function ejecutar(entrada) {
    const e = capturar(entrada), s = e.solicitud, c = e.contextoV2, base = `iglesias/${s.iglesiaId}`;
    const gen = `${base}/finanzas_generaciones_demo/${c.generacionId}`;
    const ref = r => db.doc(r), reciboRef = ref(`operaciones_financieras/${e.uid}/solicitudes/${s.solicitudId}`);
    const movimientoRef = ref(`${base}/finanzas_movimientos/${e.movimientoId}`);
    const auditoriaRef = ref(`${base}/finanzas_auditoria/${e.movimientoId}`);
    try {
      return await db.runTransaction(async tx => {
        const reciboS = await tx.get(reciboRef);
        if (reciboS.exists) {
          const r = reciboS.data(), legado = r.versionEsquema === 1;
          exigir((legado || r.versionEsquema === 2) && r.uid === e.uid && r.operacion === 'gasto' &&
            r.solicitudId === s.solicitudId && r.iglesiaId === s.iglesiaId && r.estado === 'confirmado' &&
            r.pertenenciaId === s.precondiciones.pertenenciaId &&
            r.huella === (legado ? e.huellaV1 : e.huella) &&
            r.movimientoId === (legado ? e.movimientoV1 : e.movimientoId), 'RECIBO_NO_COINCIDE');
          positivo(r.secuencia);
          if (!legado) exigir(r.epoca === c.epoca && r.generacionId === c.generacionId && r.contrato === CONTRATO_V2, 'RECIBO_NO_COINCIDE');
          const m = datos(await tx.get(ref(`${base}/finanzas_movimientos/${r.movimientoId}`)));
          exigir(m.versionEsquema === r.versionEsquema && m.iglesiaId === s.iglesiaId && m.estado === 'confirmado' &&
            m.movimiento?.id === r.movimientoId && m.movimiento.clase === 'gasto' && m.secuencia === r.secuencia &&
            m.huella === r.huella && m.solicitudId === s.solicitudId && m.responsable?.uid === e.uid &&
            m.responsable?.pertenenciaId === r.pertenenciaId, 'RECIBO_NO_COINCIDE');
          if (!legado) exigir(m.epoca === c.epoca && m.generacionId === c.generacionId && m.contrato === CONTRATO_V2, 'RECIBO_NO_COINCIDE');
          // Historia propia, nunca permiso vigente ni saldo actual. Cero escrituras.
          return Object.freeze({ estado: 'CONFIRMADA', historica: true, versionEsquema: r.versionEsquema,
            movimientoId: r.movimientoId, secuencia: r.secuencia });
        }
        const protocolo = datos(await tx.get(ref(`${base}/finanzas_control/protocolo`)));
        registroExacto(protocolo, ['versionProtocolo', 'iglesiaId', 'epoca', 'estado']);
        exigir(protocolo.versionProtocolo === 1 && protocolo.iglesiaId === s.iglesiaId &&
          protocolo.estado === 'operativo_v2' && protocolo.epoca === c.epoca, 'PROTOCOLO_V2_INCOMPATIBLE');
        const rutas = [`usuarios_globales/${e.uid}`, base, `${base}/finanzas_config/acceso`,
          `${base}/finanzas_config/contabilidad`, `${base}/finanzas_control/periodo`,
          `${base}/finanzas_cuentas/${s.cuentaId}`, `${base}/finanzas_categorias/${s.categoriaId}`,
          `${base}/finanzas_control/generacion_v2`, gen, `${gen}/control/libro`,
          `${gen}/consolidados/CLP`, `${gen}/periodos/${s.periodoId}`, `${gen}/saldos/${s.cuentaId}`];
        const snaps = await Promise.all(rutas.map(r => tx.get(ref(r))));
        const [actorS, iglesiaS, accesoS, configS, periodoS, cuentaS, categoriaS, punteroS,
          genS, controlS, consolidadoS, resumenS, saldoS] = snaps;
        const [actor, iglesia, acceso, configuracion, periodo, cuentaD, categoriaD, puntero,
          generacion, control, consolidado, resumen, saldo] = snaps.map(datos);
        id(iglesia.adminUid);
        const titularS = iglesia.adminUid === e.uid ? actorS : await tx.get(ref(`usuarios_globales/${iglesia.adminUid}`));
        const [movimientoS, auditoriaS] = await Promise.all([tx.get(movimientoRef), tx.get(auditoriaRef)]);
        // Barrera: todas las lecturas documentales terminaron. No queries ni getAll historico.
        exigir(snaps.reduce((n, d) => n + Buffer.byteLength(JSON.stringify(d.data())), 0) +
          Buffer.byteLength(JSON.stringify(datos(titularS))) <= LIMITES_V2.bytesLectura, 'LIMITE_LECTURA_EXCEDIDO');
        exigir(!movimientoS.exists && !auditoriaS.exists, 'MOVIMIENTO_SIN_RECIBO');
        const cabecera = { versionEsquema: 2, iglesiaId: s.iglesiaId, epoca: c.epoca,
          generacionId: c.generacionId, contrato: CONTRATO_V2 };
        function encabezado(d, campos) {
          registroExacto(d, [...Object.keys(cabecera), ...campos]);
          exigir(Object.keys(cabecera).every(k => d[k] === cabecera[k]), 'GENERACION_V2_INCOHERENTE');
        }
        encabezado(puntero, []); encabezado(generacion, ['activa']);
        exigir(generacion.activa === true, 'GENERACION_V2_INACTIVA');
        encabezado(control, ['revision', 'ultimoMovimientoId']);
        encabezado(consolidado, ['revision', 'ultimoMovimientoId', 'datos']);
        encabezado(resumen, ['revision', 'ultimoMovimientoId', 'periodoId', 'datos']);
        encabezado(saldo, ['proyeccion', 'huboMovimientos', 'aperturaRegistrada', 'solicitudesInciertas']);
        exigir(resumen.periodoId === s.periodoId && resumen.datos?.periodoId === s.periodoId &&
          [consolidado, resumen].every(d => d.revision === control.revision && d.ultimoMovimientoId === control.ultimoMovimientoId),
        'CONTROL_V2_INCOHERENTE');
        exigir(periodo.versionEsquema === 1 && periodo.iglesiaId === s.iglesiaId &&
          cuentaD.cuenta?.id === s.cuentaId && categoriaD.categoria?.id === s.categoriaId &&
          saldo.proyeccion?.cuentaId === s.cuentaId &&
          saldo.huboMovimientos === (saldo.proyeccion.revision > 0) &&
          saldo.proyeccion.saldoMinor === saldo.proyeccion.saldoFinalPeriodoMinor, 'DOCUMENTO_V2_INCOHERENTE');
        exigir(consolidado.datos.saldoFinalMinor >= saldo.proyeccion.saldoMinor &&
          saldo.proyeccion.saldoMinor >= 0, 'SALDO_V2_INCOHERENTE');
        const autorizacion = { auth: { uid: e.uid }, iglesiaId: s.iglesiaId,
          perfilActor: { id: e.uid, datos: actor }, iglesia: { id: s.iglesiaId, datos: iglesia },
          perfilTitular: { id: iglesia.adminUid, datos: datos(titularS) },
          acceso: { id: 'acceso', iglesiaId: s.iglesiaId, version: versionS(accesoS), datos: acceso },
          pertenenciaIdEsperada: s.precondiciones.pertenenciaId, versionAccesoEsperada: s.precondiciones.acceso };
        const versiones = Object.fromEntries(VERSIONES.map((k, i) => [k,
          versionS([iglesiaS, cuentaS, categoriaS, configS, periodoS][i])]));
        const propuesta = prepararGasto({ solicitud: { ...s, idMovimiento: e.movimientoId }, contexto: {
          autorizacion, configuracion, estadoLibro: { iglesiaId: s.iglesiaId,
            huboMovimientos: control.revision > 0, periodosAbiertos: periodo.periodosAbiertos },
          cuenta: cuentaD.cuenta, categoria: categoriaD.categoria, versiones,
          estadoCuenta: { iglesiaId: s.iglesiaId, cuentaId: s.cuentaId, saldoMinor: saldo.proyeccion.saldoMinor,
            huboMovimientos: saldo.huboMovimientos, aperturaRegistrada: saldo.aperturaRegistrada,
            solicitudesInciertas: saldo.solicitudesInciertas } } });
        const config = { moneda: configuracion.moneda, escala: configuracion.escala, zonaHoraria: configuracion.zonaHoraria };
        const siguiente = sumarMinor([control.revision, 1]);
        const proyectado = proyectarMovimiento({ estadoAnterior: { versionEsquema: 1, iglesiaId: s.iglesiaId,
          configuracion: config, revision: control.revision, ultimoMovimientoId: control.ultimoMovimientoId,
          acumulado: consolidado.datos, periodo: resumen.datos }, cuentasAnteriores: [saldo.proyeccion],
        movimiento: propuesta.movimiento, original: null, aplicacion: { revisionAnterior: control.revision,
          revisionNueva: siguiente, movimientoId: e.movimientoId } });
        exigir(proyectado.cuentas[0].saldoMinor === propuesta.saldoPropuesto.nuevoMinor, 'SALDO_V2_INCOHERENTE');
        // La equivalencia local no acredita integridad historica; exige conciliacion externa.
        exigir(isDeepStrictEqual(proyectado.estado.configuracion, config), 'CONFIGURACION_V2_INCOHERENTE');
        const timestamp = FieldValue.serverTimestamp(), revision = { revision: siguiente, ultimoMovimientoId: e.movimientoId };
        tx.create(movimientoRef, { ...cabecera, estado: 'confirmado', secuencia: siguiente,
          movimiento: propuesta.movimiento, clasificacion: propuesta.clasificacion, responsable: propuesta.responsable,
          solicitudId: s.solicitudId, huella: e.huella, descripcion: propuesta.descripcion,
          privado: propuesta.privado, precondiciones: propuesta.precondiciones, fechaCreacion: timestamp });
        tx.update(ref(rutas[12]), { proyeccion: proyectado.cuentas[0], huboMovimientos: true });
        tx.update(ref(rutas[11]), { ...revision, datos: proyectado.estado.periodo });
        tx.update(ref(rutas[10]), { ...revision, datos: proyectado.estado.acumulado });
        tx.update(ref(rutas[9]), revision);
        tx.create(auditoriaRef, { ...cabecera, evento: 'gasto_registrado', responsable: propuesta.responsable,
          movimientoId: e.movimientoId, solicitudId: s.solicitudId, secuencia: siguiente, fechaCreacion: timestamp });
        tx.create(reciboRef, { ...cabecera, uid: e.uid, operacion: 'gasto', solicitudId: s.solicitudId,
          huella: e.huella, pertenenciaId: propuesta.responsable.pertenenciaId,
          movimientoId: e.movimientoId, estado: 'confirmado', secuencia: siguiente, fechaCreacion: timestamp });
        return Object.freeze({ estado: 'CONFIRMADA', historica: false, versionEsquema: 2,
          movimientoId: e.movimientoId, secuencia: siguiente });
      });
    } catch (e) {
      if (e instanceof ErrorContable) throw e;
      // Incluye respuesta perdida DESPUES de commit. Reusar la MISMA solicitud.
      throw new ErrorContable('RESULTADO_INCIERTO');
    }
  }
  return Object.freeze({ ejecutar });
}

module.exports = Object.freeze({ crearAdaptadorFirestoreV2, CONTRATO_V2, LIMITES_V2 });
