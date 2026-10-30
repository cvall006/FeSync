'use strict';

// Privado: el futuro callable debe proyectar request.auth, nunca request.data.auth.
const { createHash } = require('node:crypto');
const { ErrorContable, exigir, registroExacto, validarMontoPositivo, validarEnteroMinor,
  validarFechaYPeriodo, periodoValido } = require('./dinero');
const { prepararGasto, prepararIngreso } = require('./operaciones');
const { prepararTransferencia, prepararReversion, prepararAjuste } = require('./correcciones');
const { exigirPermisoContable } = require('./autorizacion');
const { calcularLibro, crearApertura } = require('./asientos');
const { validarCatalogoCuentas, validarEstadoCuenta, validarCuenta, crearCuenta,
  validarAperturaCuenta } = require('./cuentas');
const { validarCatalogoCategorias, validarCategoria, crearCategoria } = require('./categorias');
const { validarConfiguracionContable, exigirPeriodoContableAbierto } = require('./configuracion');
const { exigirEscrituraV1 } = require('./protocolo');

const LIMITES = Object.freeze({ cuentas: 50, categorias: 50, movimientos: 200,
  bytesSolicitud: 16384, bytesLectura: 2 * 1024 * 1024 });
const VERSIONES = Object.freeze(['iglesia', 'cuenta', 'categoria', 'configuracion', 'controlPeriodo']);
const CAMPOS_ESTADO = Object.freeze(['iglesiaId', 'cuentaId', 'huboMovimientos',
  'saldoMinor', 'solicitudesInciertas', 'aperturaRegistrada']);

function id(v) {
  exigir(typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v), 'ID_ADAPTADOR_INVALIDO');
}
function version(v) {
  exigir(typeof v === 'string' && /^-?\d{1,12}:\d{1,9}$/.test(v), 'VERSION_ADAPTADOR_INVALIDA');
  const [s, n] = v.split(':').map(Number);
  exigir(s >= -62135596800 && s <= 253402300799 && n >= 0 && n < 1000000000 &&
    v === `${s}:${n}`, 'VERSION_ADAPTADOR_INVALIDA');
  return v;
}
function versionSnapshot(s) {
  exigir(s.exists && s.updateTime, 'DOCUMENTO_REQUERIDO');
  return version(`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`);
}
function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
}
function hash(v) { return createHash('sha256').update(canonico(v)).digest('hex'); }
function proyectar(v, campos) { return Object.fromEntries(campos.map(k => [k, v[k]])); }
function datos(s) { exigir(s.exists, 'DOCUMENTO_REQUERIDO'); return s.data(); }
function prepararEntrada(entrada) {
  registroExacto(entrada, ['auth', 'operacion', 'solicitud']);
  registroExacto(entrada.auth, ['uid']); id(entrada.auth.uid);
  exigir(['gasto', 'ingreso', 'crearCuenta', 'crearCategoria', 'apertura', 'transferencia', 'reversion', 'ajuste'].includes(entrada.operacion), 'OPERACION_NO_IMPLEMENTADA');
  const op = entrada.operacion, catalogo = op === 'crearCuenta' || op === 'crearCategoria';
  const transferencia = op === 'transferencia';
  const reversion = op === 'reversion', ajuste = op === 'ajuste';
  const correccion = transferencia || reversion || ajuste;
  const conCategoria = op === 'gasto' || op === 'ingreso';
  const s = entrada.solicitud;
  registroExacto(s, ['versionEsquema', 'solicitudId', 'iglesiaId', 'periodoId', 'precondiciones',
    ...(catalogo ? [op === 'crearCuenta' ? 'cuenta' : 'categoria'] :
      [...(transferencia ? ['origenId', 'destinoId', 'montoMinor'] : reversion ? ['originalId'] :
        ['cuentaId', ajuste ? 'deltaMinor' : 'montoMinor']), 'fechaContable', ...(conCategoria ? ['categoriaId'] : []),
      ...(reversion || ajuste ? ['motivo', 'referenciaAuditoria'] : [])])],
  catalogo || correccion ? [] : ['descripcion', ...(op === 'ingreso' ? ['aportante'] : [])]);
  exigir(s.versionEsquema === 1, 'VERSION_ESQUEMA_NO_SOPORTADA');
  exigir(typeof s.solicitudId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s.solicitudId), 'SOLICITUD_ID_INVALIDA');
  id(s.iglesiaId);
  if (!catalogo) {
    if (transferencia) { id(s.origenId); id(s.destinoId); } else if (reversion) id(s.originalId); else id(s.cuentaId);
    if (conCategoria) id(s.categoriaId);
    if (ajuste) validarEnteroMinor(s.deltaMinor); else if (!reversion) validarMontoPositivo(s.montoMinor);
    validarFechaYPeriodo(s.fechaContable, s.periodoId);
    if (reversion || ajuste) {
      id(s.referenciaAuditoria);
      exigir(typeof s.motivo === 'string' && s.motivo.length > 0 && s.motivo.length <= 480 &&
        s.motivo === s.motivo.trim() && s.motivo === s.motivo.normalize('NFC') &&
        Array.from(s.motivo).length <= 240 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(s.motivo), 'MOTIVO_CORRECCION_INVALIDO');
    }
  } else {
    exigir(periodoValido(s.periodoId), 'PERIODO_INVALIDO');
    if (op === 'crearCuenta') {
      registroExacto(s.cuenta, ['codigo', 'nombre', 'tipo']);
      validarCuenta({ ...s.cuenta, versionEsquema: 1, id: 'prevalidacion', iglesiaId: s.iglesiaId,
        moneda: 'CLP', escala: 0, estado: 'activa' }, s.iglesiaId);
    } else {
      registroExacto(s.categoria, ['codigo', 'nombre', 'naturaleza', 'tipoIngreso']);
      validarCategoria({ ...s.categoria, versionEsquema: 1, id: 'prevalidacion', iglesiaId: s.iglesiaId,
        estado: 'activa' }, s.iglesiaId);
    }
  }
  const versiones = VERSIONES.filter(k => k !== 'categoria' || conCategoria)
    .filter(k => k !== 'cuenta' || (!catalogo && !correccion));
  registroExacto(s.precondiciones, ['pertenenciaId', 'acceso', ...versiones, ...(correccion ? ['cuentas'] : []),
    ...(reversion ? ['original'] : [])]);
  exigir(typeof s.precondiciones.pertenenciaId === 'string' && /^[a-f0-9]{64}$/.test(s.precondiciones.pertenenciaId),
    'PERTENENCIA_INVALIDA');
  ['acceso', ...versiones].forEach(k => version(s.precondiciones[k]));
  if (correccion) {
    const cuentas = s.precondiciones.cuentas;
    exigir(Array.isArray(cuentas) && (transferencia ? cuentas.length === 2 : ajuste ? cuentas.length === 1 :
      cuentas.length >= 1 && cuentas.length <= 2) &&
      Reflect.ownKeys(cuentas).every(k => ['0', '1', 'length'].includes(k)), 'CUENTAS_PRECONDICION_INVALIDAS');
    for (let i = 0; i < cuentas.length; i++) {
      const d = Object.getOwnPropertyDescriptor(cuentas, String(i));
      exigir(d && 'value' in d && d.enumerable, 'CUENTAS_PRECONDICION_INVALIDAS');
      registroExacto(d.value, ['cuentaId', 'version']); id(d.value.cuentaId); version(d.value.version);
    }
    if (reversion) {
      registroExacto(s.precondiciones.original, ['version', 'versionReversion']);
      version(s.precondiciones.original.version);
      if (s.precondiciones.original.versionReversion !== null) version(s.precondiciones.original.versionReversion);
    }
  }
  if (Object.hasOwn(s, 'descripcion')) exigir(typeof s.descripcion === 'string' &&
    s.descripcion.length > 0 && s.descripcion.length <= 480 && s.descripcion === s.descripcion.trim() &&
    s.descripcion === s.descripcion.normalize('NFC') && Array.from(s.descripcion).length <= 240 &&
    !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(s.descripcion), 'TEXTO_OPERACION_INVALIDO');
  if (op === 'ingreso' && Object.hasOwn(s, 'aportante') && s.aportante !== null) {
    registroExacto(s.aportante, ['nombre']);
    const nombre = s.aportante.nombre;
    exigir(typeof nombre === 'string' && nombre.length > 0 && nombre.length <= 240 &&
      nombre === nombre.trim() && nombre === nombre.normalize('NFC') && Array.from(nombre).length <= 120 &&
      !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(nombre), 'TEXTO_OPERACION_INVALIDO');
  }
  // Captura sin referencias al formulario ni al objeto Auth mutable antes del primer await.
  const original = canonico({ uid: entrada.auth.uid, operacion: op, solicitud: s });
  exigir(Buffer.byteLength(original) <= LIMITES.bytesSolicitud, 'SOLICITUD_DEMASIADO_GRANDE');
  const copia = JSON.parse(original);
  return { ...copia, huella: hash(copia), movimientoId: hash([`finanzas-${op}-v1`, copia.uid,
    s.iglesiaId, s.solicitudId]) };
}
function encabezado(v, iglesiaId) {
  exigir(v && v.versionEsquema === 1 && v.iglesiaId === iglesiaId, 'DOCUMENTO_FINANCIERO_INCOHERENTE');
}
function secuencia(v) { exigir(Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0), 'SECUENCIA_INVALIDA'); }

/** Adaptador privado. db y FieldValue inyectados; sin Admin init ni endpoints. */
function crearAdaptadorFirestore({ db, FieldValue }) {
  exigir(db && typeof db.runTransaction === 'function' && typeof db.doc === 'function' &&
    typeof db.collection === 'function' && FieldValue && typeof FieldValue.serverTimestamp === 'function',
  'DEPENDENCIAS_ADAPTADOR_INVALIDAS');
  async function ejecutar(entrada) {
    const e = prepararEntrada(entrada), s = e.solicitud, base = `iglesias/${s.iglesiaId}`;
    const esCuenta = e.operacion === 'crearCuenta', esCategoria = e.operacion === 'crearCategoria';
    const catalogo = esCuenta || esCategoria, apertura = e.operacion === 'apertura';
    const transferencia = e.operacion === 'transferencia';
    const reversion = e.operacion === 'reversion', ajuste = e.operacion === 'ajuste';
    const correccion = transferencia || reversion || ajuste;
    const ref = ruta => db.doc(ruta);
    const reciboRef = ref(`operaciones_financieras/${e.uid}/solicitudes/${s.solicitudId}`);
    const movimientoRef = ref(`${base}/finanzas_movimientos/${e.movimientoId}`);
    const auditoriaRef = ref(`${base}/finanzas_auditoria/${e.movimientoId}`);
    const reversionRef = reversion ? ref(`${base}/finanzas_reversiones/${s.originalId}`) : null;
    const entidadRef = catalogo ? ref(`${base}/finanzas_${esCuenta ? 'cuentas' : 'categorias'}/${e.movimientoId}`) : movimientoRef;
    const reservaRef = catalogo ? ref(`${base}/finanzas_reservas_${esCuenta ? 'cuentas' : 'categorias'}/${(esCuenta ? s.cuenta : s.categoria).codigo}`) :
      apertura ? ref(`${base}/finanzas_aperturas/${s.cuentaId}`) : null;
    try {
      return await db.runTransaction(async tx => {
        const reciboSnap = await tx.get(reciboRef);
        if (reciboSnap.exists) {
          const r = reciboSnap.data();
          exigir(r.versionEsquema === 1 && r.uid === e.uid && r.operacion === e.operacion &&
            r.solicitudId === s.solicitudId && r.huella === e.huella && r.iglesiaId === s.iglesiaId &&
            r.pertenenciaId === s.precondiciones.pertenenciaId && r.movimientoId === e.movimientoId &&
            r.estado === 'confirmado', 'RECIBO_NO_COINCIDE');
          if (catalogo) {
            const d = datos(await tx.get(entidadRef)), entidad = esCuenta ? d.cuenta : d.categoria;
            exigir(r.secuencia === null && entidad?.id === e.movimientoId && entidad?.iglesiaId === s.iglesiaId &&
              d.huella === e.huella && d.solicitudId === s.solicitudId && d.responsable?.uid === e.uid &&
              d.responsable?.pertenenciaId === r.pertenenciaId, 'RECIBO_NO_COINCIDE');
            return Object.freeze({ estado: 'CONFIRMADA', historica: true,
              [esCuenta ? 'cuentaId' : 'categoriaId']: e.movimientoId });
          }
          secuencia(r.secuencia); exigir(r.secuencia > 0, 'RECIBO_NO_COINCIDE');
          const m = datos(await tx.get(movimientoRef));
          exigir(m.iglesiaId === s.iglesiaId && m.estado === 'confirmado' &&
            m.movimiento?.id === e.movimientoId && m.secuencia === r.secuencia &&
            m.huella === e.huella && m.solicitudId === s.solicitudId &&
            m.responsable?.uid === e.uid && m.responsable?.pertenenciaId === r.pertenenciaId,
          'RECIBO_NO_COINCIDE');
          // Resultado histórico propio: no es autorización vigente ni saldo actual.
          return Object.freeze({ estado: 'CONFIRMADA', historica: true,
            movimientoId: e.movimientoId, secuencia: r.secuencia });
        }

        // Fence documental comun a los ocho escritores. Su lectura participa
        // en conflictos/locks del commit; no basta una comprobacion externa.
        // Los recibos confirmados anteriores solo consultan historia, sin escribir.
        const protocoloS = await tx.get(ref(`${base}/finanzas_control/protocolo`));
        exigirEscrituraV1(protocoloS.exists ? protocoloS.data() : null, s.iglesiaId);

        const rutas = [
          `usuarios_globales/${e.uid}`, base, `${base}/finanzas_config/acceso`,
          `${base}/finanzas_config/contabilidad`, `${base}/finanzas_control/libro`,
          `${base}/finanzas_control/periodo`, `${base}/finanzas_resumenes/${s.periodoId}`,
        ];
        const snaps = await Promise.all(rutas.map(r => tx.get(ref(r))));
        const [actorS, iglesiaS, accesoS, configS, libroS, periodoS, resumenS] = snaps;
        const actor = datos(actorS), iglesia = datos(iglesiaS), acceso = datos(accesoS);
        id(iglesia.adminUid);
        const titularS = iglesia.adminUid === e.uid ? actorS :
          await tx.get(ref(`usuarios_globales/${iglesia.adminUid}`));
        const titular = datos(titularS), configuracion = validarConfiguracionContable(datos(configS), s.iglesiaId);
        const autorizacion = { auth: { uid: e.uid }, iglesiaId: s.iglesiaId,
          perfilActor: { id: e.uid, datos: actor }, iglesia: { id: s.iglesiaId, datos: iglesia },
          perfilTitular: { id: iglesia.adminUid, datos: titular },
          acceso: { id: 'acceso', iglesiaId: s.iglesiaId, version: versionSnapshot(accesoS), datos: acceso },
          pertenenciaIdEsperada: s.precondiciones.pertenenciaId, versionAccesoEsperada: s.precondiciones.acceso };
        exigirPermisoContable(autorizacion, catalogo ? 'administrarCatalogos' : reversion ? 'anularMovimientos' :
          apertura || ajuste ? 'registrarAjustes' :
          transferencia ? 'transferir' : 'registrarIngresosGastos');
        const control = datos(libroS), periodo = datos(periodoS);
        encabezado(control, s.iglesiaId); encabezado(periodo, s.iglesiaId);
        secuencia(control.ultimaSecuencia);
        const estadoLibro = { iglesiaId: s.iglesiaId, huboMovimientos: control.huboMovimientos,
          periodosAbiertos: periodo.periodosAbiertos };
        const nombres = ['finanzas_cuentas', 'finanzas_categorias', 'finanzas_saldos', 'finanzas_movimientos'];
        const limites = [LIMITES.cuentas, LIMITES.categorias, LIMITES.cuentas, LIMITES.movimientos];
        const consultas = await Promise.all(nombres.map((n, i) =>
          tx.get(db.collection(`${base}/${n}`).limit(limites[i] + 1))));
        consultas.forEach((q, i) => exigir(q.docs.length <= limites[i], 'LIMITE_LIBRO_EXCEDIDO'));
        const [cuentasQ, categoriasQ, saldosQ, movimientosQ] = consultas;
        const auditoriaS = await tx.get(auditoriaRef);
        const reservaS = reservaRef ? await tx.get(reservaRef) : null;
        const reversionS = reversionRef ? await tx.get(reversionRef) : null;
        // Todas las lecturas han terminado. Nunca escribir antes de esta barrera.
        let bytes = 0;
        for (const snap of [...snaps, titularS, auditoriaS, ...(reservaS ? [reservaS] : []),
          ...(reversionS ? [reversionS] : []), ...consultas.flatMap(q => q.docs)]) {
          if (snap.exists) bytes += Buffer.byteLength(JSON.stringify(snap.data()));
        }
        exigir(bytes <= LIMITES.bytesLectura, 'LIMITE_LECTURA_EXCEDIDO');
        exigir(!auditoriaS.exists, 'AUDITORIA_SIN_RECIBO');
        const cuentas = validarCatalogoCuentas(cuentasQ.docs.map(d => {
          const c = datos(d).cuenta; exigir(c?.id === d.id, 'CUENTA_DOCUMENTO_DISTINTO'); return c;
        }), s.iglesiaId);
        const categorias = validarCatalogoCategorias(categoriasQ.docs.map(d => {
          const c = datos(d).categoria; exigir(c?.id === d.id, 'CATEGORIA_DOCUMENTO_DISTINTO'); return c;
        }), s.iglesiaId);
        const historicos = movimientosQ.docs.map(d => {
          const m = datos(d); encabezado(m, s.iglesiaId); secuencia(m.secuencia);
          exigir(m.movimiento?.id === d.id && m.estado === 'confirmado', 'MOVIMIENTO_INCOHERENTE');
          return m;
        }).sort((a, b) => a.secuencia - b.secuencia);
        exigir(control.ultimaSecuencia === historicos.length &&
          control.huboMovimientos === (historicos.length > 0) &&
          historicos.every((m, i) => m.secuencia === i + 1), 'CONTROL_LIBRO_INCOHERENTE');
        exigir(!historicos.some(m => m.movimiento.id === e.movimientoId), 'MOVIMIENTO_SIN_RECIBO');
        const movimientos = historicos.map(m => m.movimiento);
        exigir(movimientos.every(m => m.periodoId <= s.periodoId), 'HISTORIAL_POSTERIOR_AL_PERIODO');
        const referencias = cuentas.map(c => proyectar(c, ['id', 'moneda', 'escala']));
        const configDinero = proyectar(configuracion, ['moneda', 'escala', 'zonaHoraria']);
        const calcular = (lista, periodoId = null) => calcularLibro({ movimientos: lista,
          cuentas: referencias, periodoId, configuracion: configDinero });
        const libro = calcular(movimientos), resumenAnterior = calcular(movimientos, s.periodoId);
        exigir(saldosQ.docs.length === cuentas.length, 'SALDOS_INCOMPLETOS');
        const estados = new Map();
        for (const d of saldosQ.docs) {
          const saldo = datos(d), cuenta = cuentas.find(c => c.id === d.id);
          exigir(cuenta, 'SALDO_SIN_CUENTA'); encabezado(saldo, s.iglesiaId);
          const estado = validarEstadoCuenta(proyectar(saldo, CAMPOS_ESTADO), cuenta);
          const toques = historicos.filter(m => m.movimiento.asientos.some(a => a.cuentaId === d.id));
          exigir(estado.cuentaId === d.id && estado.saldoMinor === libro.saldoFinalPorCuenta[d.id] &&
            estado.huboMovimientos === (toques.length > 0) &&
            estado.aperturaRegistrada === toques.some(m => m.movimiento.clase === 'apertura' && m.movimiento.reversaDe === null) &&
            saldo.ultimaSecuencia === (toques.at(-1)?.secuencia ?? 0), 'SALDO_NO_CONCUERDA_CON_LIBRO');
          estados.set(d.id, estado);
        }
        if (resumenS.exists) {
          const anterior = resumenS.data(); encabezado(anterior, s.iglesiaId);
          exigir(anterior.periodoId === s.periodoId && anterior.ultimaSecuencia === control.ultimaSecuencia &&
            canonico(anterior.datos) === canonico(resumenAnterior), 'RESUMEN_NO_CONCUERDA_CON_LIBRO');
        }
        if (catalogo) {
          for (const [k, snap] of [['iglesia', iglesiaS], ['configuracion', configS], ['controlPeriodo', periodoS]]) {
            exigir(s.precondiciones[k] === versionSnapshot(snap), 'CONTEXTO_OPERACION_MODIFICADO');
          }
          exigirPeriodoContableAbierto(estadoLibro, s.iglesiaId, s.periodoId);
          exigir(!reservaS.exists, 'CODIGO_RESERVADO');
          exigir((esCuenta ? cuentas.length : categorias.length) < (esCuenta ? LIMITES.cuentas : LIMITES.categorias),
            'LIMITE_LIBRO_EXCEDIDO');
          const entidad = esCuenta ? crearCuenta({ iglesiaId: s.iglesiaId, catalogo: cuentas,
            cuenta: { ...s.cuenta, versionEsquema: 1, id: e.movimientoId, iglesiaId: s.iglesiaId,
              moneda: configuracion.moneda, escala: configuracion.escala, estado: 'activa' } }) :
            crearCategoria({ iglesiaId: s.iglesiaId, catalogo: categorias,
              categoria: { ...s.categoria, versionEsquema: 1, id: e.movimientoId, iglesiaId: s.iglesiaId, estado: 'activa' } });
          exigir(!(esCuenta ? cuentas : categorias).some(c => c.id === e.movimientoId), 'ENTIDAD_SIN_RECIBO');
          const timestamp = FieldValue.serverTimestamp(), responsable = { uid: e.uid, pertenenciaId: actor.pertenenciaId };
          tx.create(entidadRef, { [esCuenta ? 'cuenta' : 'categoria']: entidad,
            huella: e.huella, solicitudId: s.solicitudId, responsable, fechaCreacion: timestamp });
          tx.create(reservaRef, { versionEsquema: 1, iglesiaId: s.iglesiaId, codigo: entidad.codigo,
            entidadId: entidad.id, fechaCreacion: timestamp });
          if (esCuenta) {
            tx.create(ref(`${base}/finanzas_saldos/${entidad.id}`), { versionEsquema: 1, iglesiaId: s.iglesiaId,
              cuentaId: entidad.id, saldoMinor: 0, huboMovimientos: false, aperturaRegistrada: false,
              solicitudesInciertas: 0, ultimaSecuencia: 0, fechaActualizacion: timestamp });
            const datosResumen = calcularLibro({ movimientos, cuentas: [...referencias, proyectar(entidad, ['id', 'moneda', 'escala'])],
              periodoId: s.periodoId, configuracion: configDinero });
            const proyeccion = { versionEsquema: 1, iglesiaId: s.iglesiaId, periodoId: s.periodoId,
              datos: datosResumen, ultimaSecuencia: control.ultimaSecuencia, fechaActualizacion: timestamp };
            if (resumenS.exists) tx.update(ref(rutas[6]), proyeccion); else tx.create(ref(rutas[6]), proyeccion);
          }
          // Serializa también límites de catálogo y proyecciones: no incrementa secuencia monetaria.
          tx.update(ref(rutas[4]), { fechaActualizacion: timestamp });
          tx.create(auditoriaRef, { versionEsquema: 1, iglesiaId: s.iglesiaId, evento: e.operacion,
            responsable, entidadId: entidad.id, solicitudId: s.solicitudId, fechaCreacion: timestamp });
          tx.create(reciboRef, { versionEsquema: 1, uid: e.uid, operacion: e.operacion, iglesiaId: s.iglesiaId,
            solicitudId: s.solicitudId, huella: e.huella, pertenenciaId: actor.pertenenciaId,
            movimientoId: e.movimientoId, estado: 'confirmado', secuencia: null, fechaCreacion: timestamp });
          return Object.freeze({ estado: 'CONFIRMADA', historica: false, [esCuenta ? 'cuentaId' : 'categoriaId']: entidad.id });
        }
        const cuentaDoc = cuentasQ.docs.find(d => d.id === s.cuentaId);
        const categoriaDoc = categoriasQ.docs.find(d => d.id === s.categoriaId);
        exigir(correccion || (cuentaDoc && (apertura || categoriaDoc)), 'DESTINO_NO_EXISTE');
        let propuesta;
        if (correccion) {
          let original;
          if (reversion) {
            const docOriginal = movimientosQ.docs.find(d => d.id === s.originalId);
            exigir(docOriginal, 'ORIGINAL_NO_ACREDITADO');
            exigir(!reversionS.exists && !historicos.some(m => m.movimiento.reversaDe === s.originalId),
              'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
            const d = docOriginal.data();
            original = { iglesiaId: d.iglesiaId, estado: d.estado, version: versionSnapshot(docOriginal),
              movimiento: d.movimiento, clasificacion: d.clasificacion,
              reversion: { version: null, movimientoId: null } };
          }
          const ids = transferencia ? [s.origenId, s.destinoId] : ajuste ? [s.cuentaId] :
            original.movimiento.asientos.map(a => a.cuentaId);
          const seleccionadas = ids.map(cuentaId => {
            const documento = cuentasQ.docs.find(d => d.id === cuentaId);
            exigir(documento, 'DESTINO_NO_EXISTE');
            return { cuenta: cuentas.find(c => c.id === cuentaId), estado: estados.get(cuentaId),
              version: versionSnapshot(documento) };
          });
          const preparar = transferencia ? prepararTransferencia : reversion ? prepararReversion : prepararAjuste;
          const plan = preparar({ solicitud: { ...s, idMovimiento: e.movimientoId }, contexto: {
            autorizacion, configuracion, estadoLibro, cuentas: seleccionadas,
            ...(reversion ? { original } : {}),
            versiones: { iglesia: versionSnapshot(iglesiaS), configuracion: versionSnapshot(configS),
              controlPeriodo: versionSnapshot(periodoS) },
          } });
          propuesta = { ...plan, descripcion: null, privado: { aportante: null,
            ...(reversion || ajuste ? { motivo: plan.motivo, referenciaAuditoria: plan.referenciaAuditoria } : {}) } };
        } else if (apertura) {
          for (const [k, snap] of [['iglesia', iglesiaS], ['cuenta', cuentaDoc], ['configuracion', configS], ['controlPeriodo', periodoS]]) {
            exigir(s.precondiciones[k] === versionSnapshot(snap), 'CONTEXTO_OPERACION_MODIFICADO');
          }
          exigirPeriodoContableAbierto(estadoLibro, s.iglesiaId, s.periodoId);
          exigir(!reservaS.exists, 'APERTURA_DUPLICADA');
          const cuenta = cuentas.find(c => c.id === s.cuentaId), estado = estados.get(s.cuentaId);
          const movimiento = crearApertura({ id: e.movimientoId, cuenta: proyectar(cuenta, ['id', 'moneda', 'escala']),
            fechaContable: s.fechaContable, periodoId: s.periodoId, montoMinor: s.montoMinor, configuracion: configDinero });
          validarAperturaCuenta({ iglesiaId: s.iglesiaId, cuenta, estadoCuenta: estado, movimiento });
          propuesta = { movimiento, clasificacion: { cuentaId: cuenta.id, categoriaId: null, naturaleza: 'patrimonial', tipoIngreso: null },
            responsable: { uid: e.uid, pertenenciaId: actor.pertenenciaId }, precondiciones: s.precondiciones,
            descripcion: s.descripcion ?? null, privado: { aportante: null }, saldoPropuesto: { nuevoMinor: s.montoMinor } };
        } else propuesta = (e.operacion === 'ingreso' ? prepararIngreso : prepararGasto)({ solicitud: { ...s, idMovimiento: e.movimientoId }, contexto: {
          autorizacion,
          configuracion, estadoLibro, cuenta: cuentas.find(c => c.id === s.cuentaId),
          categoria: categorias.find(c => c.id === s.categoriaId), estadoCuenta: estados.get(s.cuentaId),
          versiones: { iglesia: versionSnapshot(iglesiaS), cuenta: versionSnapshot(cuentaDoc),
            categoria: versionSnapshot(categoriaDoc), configuracion: versionSnapshot(configS),
            controlPeriodo: versionSnapshot(periodoS) },
        } });
        exigir(historicos.length < LIMITES.movimientos, 'LIMITE_LIBRO_EXCEDIDO');
        const siguiente = control.ultimaSecuencia + 1;
        secuencia(siguiente);
        const resumen = calcular([...movimientos, propuesta.movimiento], s.periodoId);
        const timestamp = FieldValue.serverTimestamp();
        if (reversion) tx.create(reversionRef, { versionEsquema: 1, iglesiaId: s.iglesiaId,
          ...propuesta.controlReversion, secuencia: siguiente, fechaCreacion: timestamp });
        if (apertura) tx.create(reservaRef, { versionEsquema: 1, iglesiaId: s.iglesiaId,
          cuentaId: s.cuentaId, movimientoId: e.movimientoId, secuencia: siguiente, fechaCreacion: timestamp });
        tx.create(movimientoRef, { versionEsquema: 1, iglesiaId: s.iglesiaId, secuencia: siguiente,
          estado: 'confirmado', movimiento: propuesta.movimiento, clasificacion: propuesta.clasificacion,
          responsable: propuesta.responsable, solicitudId: s.solicitudId, huella: e.huella,
          descripcion: propuesta.descripcion, privado: propuesta.privado,
          precondiciones: propuesta.precondiciones, fechaCreacion: timestamp });
        const saldos = correccion ? propuesta.saldosPropuestos :
          [{ cuentaId: s.cuentaId, nuevoMinor: propuesta.saldoPropuesto.nuevoMinor }];
        for (const saldo of saldos) tx.update(ref(`${base}/finanzas_saldos/${saldo.cuentaId}`), {
          saldoMinor: saldo.nuevoMinor, huboMovimientos: true, ...(apertura ? { aperturaRegistrada: true } : {}),
          ultimaSecuencia: siguiente, fechaActualizacion: timestamp });
        const resumenDatos = { versionEsquema: 1, iglesiaId: s.iglesiaId, periodoId: s.periodoId,
          datos: resumen, ultimaSecuencia: siguiente, fechaActualizacion: timestamp };
        if (resumenS.exists) tx.update(ref(rutas[6]), resumenDatos);
        else tx.create(ref(rutas[6]), resumenDatos);
        tx.update(ref(rutas[4]), { ultimaSecuencia: siguiente, huboMovimientos: true, fechaActualizacion: timestamp });
        tx.create(auditoriaRef, { versionEsquema: 1, iglesiaId: s.iglesiaId,
          evento: apertura ? 'apertura_registrada' : reversion ? 'reversion_registrada' : ajuste ? 'ajuste_registrado' :
            transferencia ? 'transferencia_registrada' :
            e.operacion === 'ingreso' ? 'ingreso_registrado' : 'gasto_registrado',
          responsable: propuesta.responsable, movimientoId: e.movimientoId,
          ...(reversion ? { originalId: s.originalId } : {}),
          solicitudId: s.solicitudId, secuencia: siguiente, fechaCreacion: timestamp });
        tx.create(reciboRef, { versionEsquema: 1, uid: e.uid, operacion: e.operacion, iglesiaId: s.iglesiaId,
          solicitudId: s.solicitudId, huella: e.huella, pertenenciaId: propuesta.responsable.pertenenciaId,
          movimientoId: e.movimientoId, estado: 'confirmado', secuencia: siguiente, fechaCreacion: timestamp });
        return Object.freeze({ estado: 'CONFIRMADA', historica: false, movimientoId: e.movimientoId, secuencia: siguiente });
      });
    } catch (error) {
      if (error instanceof ErrorContable) throw error;
      // Incluso un fallo de transporte posterior al commit puede llegar aquí.
      // Reintentar SOLO la misma solicitud; no asegura que el commit haya fallado.
      throw new ErrorContable('RESULTADO_INCIERTO');
    }
  }
  return Object.freeze({ ejecutar });
}

module.exports = Object.freeze({ crearAdaptadorFirestore, LIMITES });
