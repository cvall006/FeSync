const { ErrorDemo, validarEntorno } = require('./entorno');
validarEntorno(); // Antes de importar SDKs; también en cada operación.
const { createRequire } = require('node:module');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const { Firestore, FieldValue, FieldPath } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { migrarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_ejecucion');
const { clasificarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_plan');
const { simularPertenencias } = require('../../functions/migraciones/pertenencia_simulacion');
const { pertenenciaIdValido } = require('../../functions/pertenencia');

const COLECCION = 'herramienta_migracion_demo';
// Vincula contrato del motor y protocolo de coordinación; LF canónico entre SO.
const huella = createHash('sha256');
for (const relativo of ['functions/migraciones/pertenencia_ejecucion.js',
  'functions/migraciones/pertenencia_plan.js', 'functions/migraciones/pertenencia_simulacion.js',
  'functions/pertenencia.js', 'herramientas/migracion_demo/herramienta.js',
  'herramientas/migracion_demo/entorno.js', 'herramientas/migracion_demo/argumentos.js',
  'herramientas/migracion_demo/cli.js']) {
  huella.update(relativo + '\0').update(fs.readFileSync(path.resolve(__dirname, '../..', relativo),
    'utf8').replace(/\r\n/g, '\n'));
}
const motorHash = huella.digest('hex');
const id = (s, max = 1500) => typeof s === 'string' && s.length > 0 && s.length <= max &&
  Buffer.byteLength(s) <= 1500 && s === s.trim() && !/[\/\x00-\x1f\x7f]/.test(s) &&
  s !== '.' && s !== '..' && !/^__.*__$/.test(s);
const version = (s) => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
const seleccionValida = (s) => s && Object.keys(s).length === 3 && id(s.uid, 128) &&
  id(s.iglesiaId) && typeof s.version === 'string' && s.version === s.version.trim() && /^-?\d+:\d{1,9}$/.test(s.version);
const igual = (a, b) => a === null ? b === null : b !== null &&
  a.uid === b.uid && a.iglesiaId === b.iglesiaId && a.version === b.version;
const metricasVacias = () => ({ procesados: 0, migrados: 0, omitidos: 0,
  revision: 0, conflictos: 0, errores: 0 });
const CAMPOS = ['version', 'motorHash', 'cursor', 'pendiente', 'completa', 'estado',
  'razon', 'epoca', 'propietario', 'venceMs'];

function validarPunto(p) {
  if (!p || Object.keys(p).length !== CAMPOS.length || !CAMPOS.every((k) => Object.hasOwn(p, k)) ||
      p.version !== 1 || p.motorHash !== motorHash || (p.cursor !== null && !id(p.cursor)) ||
      (p.pendiente !== null && !seleccionValida(p.pendiente)) || typeof p.completa !== 'boolean' ||
      !['activa', 'detenida', 'completa'].includes(p.estado) ||
      ![null, 'CONFLICTO', 'REVISION', 'ERROR_MOTOR'].includes(p.razon) ||
      !Number.isSafeInteger(p.epoca) || p.epoca < 0 ||
      (p.propietario !== null && (typeof p.propietario !== 'string' || p.propietario.length !== 64 || !/^[a-f0-9]+$/.test(p.propietario))) ||
      !Number.isSafeInteger(p.venceMs) || p.venceMs < 0 ||
      (p.propietario === null && p.venceMs !== 0) ||
      (p.propietario !== null && p.venceMs === 0) ||
      (p.estado === 'detenida' && (p.razon === null || p.pendiente === null)) ||
      (p.estado !== 'detenida' && p.razon !== null) ||
      (p.completa && (p.pendiente !== null || p.estado !== 'completa')) ||
      (!p.completa && p.estado === 'completa') ||
      (p.pendiente && p.cursor !== null &&
        Buffer.compare(Buffer.from(p.pendiente.uid), Buffer.from(p.cursor)) <= 0)) {
    throw new ErrorDemo('CHECKPOINT_INVALIDO');
  }
  return p;
}

function abrir(opciones = {}) {
  validarEntorno();
  if (!opciones || typeof opciones !== 'object' || Array.isArray(opciones) ||
      Object.keys(opciones).some((k) => !['lote', 'limite', 'reservaMs', 'ganchos'].includes(k))) {
    throw new ErrorDemo('OPCIONES_INVALIDAS');
  }
  const { lote = 5, limite = 100, reservaMs = 15000, ganchos = {} } = opciones;
  if (!Number.isSafeInteger(lote) || lote < 1 || lote > 20 ||
      !Number.isSafeInteger(limite) || limite < 1 || limite > 2000 ||
      !Number.isSafeInteger(reservaMs) || reservaMs < 1000 || reservaMs > 60000 ||
      !ganchos || Object.keys(ganchos).some((k) => !['antesDeMotor', 'despuesDeMotor'].includes(k)) ||
      Object.values(ganchos).some((v) => typeof v !== 'function')) throw new ErrorDemo('OPCIONES_INVALIDAS');
  // Auth vacío explícito: no ADC, initializeApp, cuenta de servicio ni metadata server.
  const db = new Firestore({ projectId: 'demo-fesync', databaseId: '(default)',
    host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  let cerrado = false;
  function proteger() {
    validarEntorno();
    if (cerrado || db.projectId !== 'demo-fesync' || db._settings.servicePath !== '127.0.0.1' ||
        db._settings.port !== 8088 || db._settings.ssl !== false) throw new ErrorDemo('CLIENTE_PROHIBIDO');
  }
  function referencia(nombre) {
    proteger();
    if (typeof nombre !== 'string' || nombre !== nombre.trim() || !/^[a-z][a-z0-9_-]{0,47}$/.test(nombre)) {
      throw new ErrorDemo('CHECKPOINT_NOMBRE_INVALIDO');
    }
    return db.collection(COLECCION).doc(nombre);
  }
  const ahora = (s) => {
    if (!s.readTime) throw new ErrorDemo('RELOJ_SERVIDOR_AUSENTE');
    return Math.floor(s.readTime.seconds * 1000 + s.readTime.nanoseconds / 1e6);
  };
  function comprobarReserva(s, propietario, epoca, pendiente) {
    const p = validarPunto(s.data());
    if (p.propietario !== propietario || p.epoca !== epoca || p.venceMs <= ahora(s)) {
      throw new ErrorDemo('RESERVA_PERDIDA');
    }
    if (pendiente !== undefined && !igual(p.pendiente, pendiente)) throw new ErrorDemo('SELECCION_CAMBIADA');
    return p;
  }
  async function tomar(ref, modo, propietario) {
    proteger();
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && modo === 'aplicar') throw new ErrorDemo('CHECKPOINT_EXISTE');
      if (!s.exists && modo === 'reanudar') throw new ErrorDemo('CHECKPOINT_AUSENTE');
      const p = s.exists ? validarPunto(s.data()) : { version: 1, motorHash, cursor: null,
        pendiente: null, completa: false, estado: 'activa', razon: null,
        epoca: 0, propietario: null, venceMs: 0 };
      if (p.propietario !== null && p.venceMs > ahora(s)) throw new ErrorDemo('CHECKPOINT_OCUPADO');
      if (p.epoca >= Number.MAX_SAFE_INTEGER) throw new ErrorDemo('EPOCA_AGOTADA');
      const siguiente = { ...p, propietario, epoca: p.epoca + 1, venceMs: ahora(s) + reservaMs };
      tx.set(ref, siguiente);
      return siguiente;
    });
  }
  async function cambiar(ref, propietario, epoca, cambios, pendiente) {
    proteger();
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const p = comprobarReserva(s, propietario, epoca, pendiente);
      const siguiente = { ...p, ...cambios, venceMs: ahora(s) + reservaMs };
      validarPunto(siguiente); tx.set(ref, siguiente); return siguiente;
    });
  }
  async function soltar(ref, propietario, epoca) {
    proteger();
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const p = validarPunto(s.data());
      // No liberar una reserva adquirida por otro operador, aunque esta haya vencido.
      if (p.propietario === propietario && p.epoca === epoca) tx.set(ref,
        { ...p, propietario: null, venceMs: 0 });
    });
  }
  async function clasificar(s) {
    proteger();
    const entrada = { uid: s.id, perfil: s.data() };
    let c = clasificarPerfilPertenencia(entrada);
    if (c.motivo === 'iglesia_no_verificable') {
      const iglesia = await db.collection('iglesias').doc(s.data().iglesiaId).get();
      entrada.iglesia = { id: iglesia.id, existe: iglesia.exists, adminUid: iglesia.data()?.adminUid };
      c = clasificarPerfilPertenencia(entrada);
    }
    return c;
  }
  function lector() {
    return Object.freeze({
      async listarPerfiles({ despuesDe, limite: tamano }) {
        proteger();
        let q = db.collection('usuarios_globales').orderBy(FieldPath.documentId()).limit(tamano);
        if (despuesDe !== null) q = q.startAfter(despuesDe);
        return (await q.get()).docs.map((s) => ({ id: s.id, perfil: s.data(), version: version(s) }));
      },
      async leerPerfil(uid) {
        proteger(); const s = await db.collection('usuarios_globales').doc(uid).get();
        return s.exists ? { perfil: s.data(), version: version(s) } : null;
      },
      async leerIglesia(uid) {
        proteger(); const s = await db.collection('iglesias').doc(uid).get();
        return { id: uid, existe: s.exists, adminUid: s.data()?.adminUid };
      },
    });
  }
  async function simular() {
    proteger();
    return simularPertenencias({ lector: lector(), tamanoPagina: 20, maxPaginas: 100, maxPerfiles: limite });
  }
  function motorProtegido(ref, propietario, epoca, seleccion) {
    // La lectura del checkpoint se integra en LA MISMA transacción del motor.
    // Un takeover cambia ese documento y fuerza reintento/rechazo del dueño viejo.
    return Object.freeze({ collection: db.collection.bind(db),
      runTransaction(callback, opciones) {
        proteger();
        return db.runTransaction(async (tx) => {
          comprobarReserva(await tx.get(ref), propietario, epoca, seleccion);
          const perfil = `usuarios_globales/${seleccion.uid}`;
          const comprobante = `migraciones_pertenencia/${seleccion.uid}`;
          function ruta(r) {
            if (r.firestore !== db) throw new ErrorDemo('RUTA_PROHIBIDA');
            return r.path;
          }
          const segura = Object.freeze({
            get(r) {
              proteger(); const p = ruta(r);
              if (p !== perfil && p !== comprobante && !/^iglesias\/[^/]+$/.test(p)) {
                throw new ErrorDemo('RUTA_PROHIBIDA');
              }
              return tx.get(r);
            },
            update(r, datos) {
              proteger();
              if (ruta(r) !== perfil || Object.keys(datos).length !== 1 || !Object.hasOwn(datos, 'pertenenciaId') ||
                  !pertenenciaIdValido(datos.pertenenciaId)) throw new ErrorDemo('ESCRITURA_PROHIBIDA');
              tx.update(r, datos);
            },
            create(r, datos) {
              proteger();
              if (ruta(r) !== comprobante || datos.version !== 1 || datos.origen !== 'migracion_pertenencia_v1' ||
                  datos.iglesiaId !== seleccion.iglesiaId || datos.versionPerfilAnterior !== seleccion.version ||
                  !pertenenciaIdValido(datos.pertenenciaId) || Object.keys(datos).length !== 6 ||
                  !['version', 'origen', 'iglesiaId', 'pertenenciaId', 'versionPerfilAnterior', 'fechaCreacion']
                    .every((k) => Object.hasOwn(datos, k)) ||
                  !datos.fechaCreacion?.isEqual?.(FieldValue.serverTimestamp())) {
                throw new ErrorDemo('ESCRITURA_PROHIBIDA');
              }
              tx.create(r, datos);
            },
          });
          return callback(segura);
        }, opciones);
      },
    });
  }
  async function ejecutar(modo, nombre) {
    proteger();
    if (!['aplicar', 'reanudar'].includes(modo)) throw new ErrorDemo('MODO_INVALIDO');
    const ref = referencia(nombre), propietario = randomBytes(32).toString('hex');
    let p = await tomar(ref, modo, propietario);
    const epoca = p.epoca, metricas = metricasVacias();
    try {
      if (p.completa) return { completa: true, detenida: false, limiteAlcanzado: false, metricas };
      for (let i = 0; i < lote; i++) {
        proteger();
        if (!p.pendiente) {
          let q = db.collection('usuarios_globales').orderBy(FieldPath.documentId()).limit(1);
          if (p.cursor !== null) q = q.startAfter(p.cursor);
          const pagina = await q.get();
          if (pagina.empty) {
            p = await cambiar(ref, propietario, epoca,
              { completa: true, estado: 'completa', razon: null }, null);
            return { completa: true, detenida: false, limiteAlcanzado: false, metricas };
          }
          const s = pagina.docs[0], c = await clasificar(s);
          if (c.categoria !== 'candidato') {
            p = await cambiar(ref, propietario, epoca, { cursor: s.id }, null);
            metricas.procesados++; metricas[c.categoria === 'revision' ? 'revision' : 'omitidos']++;
            continue;
          }
          p = await cambiar(ref, propietario, epoca, { pendiente:
            { uid: s.id, iglesiaId: s.data().iglesiaId, version: version(s) }, estado: 'activa', razon: null }, null);
        }
        const seleccion = Object.freeze({ ...p.pendiente });
        if (ganchos.antesDeMotor) await ganchos.antesDeMotor();
        proteger();
        const r = await migrarPerfilPertenencia({ db: motorProtegido(ref, propietario, epoca, seleccion),
          FieldValue, seleccion });
        if (ganchos.despuesDeMotor) await ganchos.despuesDeMotor();
        proteger();
        for (const k of Object.keys(metricas)) metricas[k] += r.metricas[k];
        if (['error', 'conflicto', 'revision'].includes(r.categoria)) {
          p = await cambiar(ref, propietario, epoca, { estado: 'detenida', razon:
            r.categoria === 'conflicto' ? 'CONFLICTO' : r.categoria === 'revision' ? 'REVISION' : 'ERROR_MOTOR' }, seleccion);
          return { completa: false, detenida: true, limiteAlcanzado: false, metricas };
        }
        p = await cambiar(ref, propietario, epoca,
          { cursor: seleccion.uid, pendiente: null, estado: 'activa', razon: null }, seleccion);
      }
      return { completa: false, detenida: false, limiteAlcanzado: true, metricas };
    } finally { await soltar(ref, propietario, epoca); }
  }
  async function verificar(nombre) {
    proteger();
    const simulacion = await simular();
    const comprobantes = { leidos: 0, vigentes: 0, historicos: 0, revision: 0, completa: false };
    let cursor = null;
    while (comprobantes.leidos < limite) {
      const tamano = Math.min(20, limite - comprobantes.leidos);
      let q = db.collection('migraciones_pertenencia').orderBy(FieldPath.documentId()).limit(tamano);
      if (cursor !== null) q = q.startAfter(cursor);
      const docs = (await q.get()).docs;
      for (const s of docs) {
        proteger(); comprobantes.leidos++;
        const c = s.data();
        if (c.version !== 1 || c.origen !== 'migracion_pertenencia_v1' || !id(c.iglesiaId) ||
            !pertenenciaIdValido(c.pertenenciaId) || Object.keys(c).length !== 6 ||
            !Number.isSafeInteger(c.fechaCreacion?.seconds) ||
            !Number.isSafeInteger(c.fechaCreacion?.nanoseconds) ||
            c.fechaCreacion.nanoseconds < 0 || c.fechaCreacion.nanoseconds >= 1000000000 ||
            !seleccionValida({ uid: s.id, iglesiaId: c.iglesiaId, version: c.versionPerfilAnterior })) {
          comprobantes.revision++; continue;
        }
        const actual = await db.collection('usuarios_globales').doc(s.id).get();
        if (!actual.exists || actual.data().iglesiaId !== c.iglesiaId ||
            (pertenenciaIdValido(actual.data().pertenenciaId) && actual.data().pertenenciaId !== c.pertenenciaId)) {
          comprobantes.historicos++; // No acredita legitimidad del estado actual.
        } else if (actual.data().pertenenciaId === c.pertenenciaId) comprobantes.vigentes++;
        else comprobantes.revision++;
      }
      if (docs.length < tamano) { comprobantes.completa = true; break; }
      cursor = docs.at(-1).id;
    }
    let checkpoint = null;
    if (nombre !== undefined) {
      const s = await referencia(nombre).get();
      if (!s.exists) throw new ErrorDemo('CHECKPOINT_AUSENTE');
      const p = validarPunto(s.data());
      checkpoint = { completa: p.completa, pendiente: p.pendiente !== null, estado: p.estado,
        razon: p.razon, reservaActiva: p.propietario !== null && p.venceMs > ahora(s) };
    }
    return { completa: simulacion.completa && comprobantes.completa && (!checkpoint || checkpoint.completa),
      requiereRevision: simulacion.porCategoria.revision > 0 || simulacion.porCategoria.conflicto > 0 ||
        comprobantes.revision > 0 || checkpoint?.estado === 'detenida',
      simulacion, comprobantes, checkpoint };
  }
  return Object.freeze({
    async preflight() {
      proteger();
      // Consulta pequeña; sin crear checkpoint ni perfiles.
      await db.collection('usuarios_globales').limit(1).get();
      return { proyecto: 'demo-fesync', conexion: '127.0.0.1:8088', versionHerramienta: 1, motorHash };
    },
    simular, verificar, ejecutar,
    async cerrar() { cerrado = true; await db.terminate(); },
  });
}
module.exports = { abrir };
