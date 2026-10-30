'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAdaptadorFirestore, LIMITES } = require('../finanzas_core/adaptador_firestore');
const { crearApertura, crearIngreso, crearAjuste, revertirMovimiento, calcularLibro } = require('../finanzas_core/asientos');

const BASE = 'iglesias/iglesia', V = '1700000000:123456789', P = 'a'.repeat(64);
const copiar = v => structuredClone(v);
const FV = Object.freeze({ serverTimestamp: () => ({ servidor: true }) });
const RUTA_PROTOCOLO = `${BASE}/finanzas_control/protocolo`;

// Doble MVCC: instantánea por intento, detección de conflictos documentales y
// fantasmas en consultas, commit atómico y prohibición de lecturas tras escribir.
// No sustituye la validación del SDK/servicio con Firestore Emulator.
class FirestoreDoble {
  constructor(inicial) {
    this.documentos = new Map(Object.entries(copiar(inicial)));
    this.versiones = new Map([...this.documentos.keys()].map(k => [k, 0]));
    this.reloj = 0; this.commits = 0; this.escrituras = 0; this.intentos = 0; this.lecturas = [];
    this.antesCommit = null; this.fallarCommit = false; this.perderRespuesta = false;
  }
  doc(path) { return { path, id: path.split('/').at(-1) }; }
  collection(path) { return { limit: limite => ({ path, limite, consulta: true }) }; }
  cambiar(path, datos) {
    if (datos === null) this.documentos.delete(path); else this.documentos.set(path, copiar(datos));
    this.versiones.set(path, ++this.reloj);
  }
  async runTransaction(callback) {
    for (let intento = 0; intento < 8; intento++) {
      this.intentos++;
      const contenido = new Map([...this.documentos].map(([k, v]) => [k, copiar(v)]));
      const versiones = new Map(this.versiones), leidos = new Map(), consultas = [];
      const cambios = []; let escribiendo = false;
      const snapshot = path => ({ id: path.split('/').at(-1), exists: contenido.has(path),
        updateTime: { seconds: 1700000000, nanoseconds: 123456789 + (versiones.get(path) ?? 0) },
        data: () => copiar(contenido.get(path)) });
      const enumerar = (mapa, path) => [...mapa.keys()].filter(k => k.startsWith(`${path}/`) &&
        k.slice(path.length + 1).indexOf('/') < 0).sort();
      const tx = {
        get: async r => {
          assert.equal(escribiendo, false, 'Todas las lecturas deben preceder las escrituras');
          this.lecturas.push(r.path);
          if (this.fallarLectura) throw new Error('detalle interno que nunca debe filtrarse');
          if (r.consulta) {
            consultas.push({ path: r.path, claves: enumerar(contenido, r.path) });
            return { docs: enumerar(contenido, r.path).slice(0, r.limite).map(k => {
              leidos.set(k, versiones.get(k)); return snapshot(k);
            }) };
          }
          leidos.set(r.path, versiones.get(r.path)); return snapshot(r.path);
        },
        create: (r, d) => { escribiendo = true; cambios.push(['create', r.path, copiar(d)]); },
        update: (r, d) => { escribiendo = true; cambios.push(['update', r.path, copiar(d)]); },
      };
      const resultado = await callback(tx);
      if (this.antesCommit) { const hook = this.antesCommit; this.antesCommit = null; await hook(this); }
      const conflicto = [...leidos].some(([k, v]) => this.versiones.get(k) !== v) ||
        consultas.some(q => JSON.stringify(enumerar(this.documentos, q.path)) !== JSON.stringify(q.claves));
      if (conflicto) continue;
      for (const [tipo, path] of cambios) {
        if (tipo === 'create') assert.equal(this.documentos.has(path), false);
        else assert.equal(this.documentos.has(path), true);
      }
      if (this.fallarCommit) throw new Error('fallo simulado antes del commit');
      for (const [tipo, path, datos] of cambios) this.cambiar(path,
        tipo === 'create' ? datos : { ...this.documentos.get(path), ...datos });
      if (cambios.length) this.commits++;
      this.escrituras += cambios.length;
      if (this.perderRespuesta) { this.perderRespuesta = false; throw new Error('timeout posterior al commit'); }
      return resultado;
    }
    throw new Error('contención agotada');
  }
}

function fixtures() {
  const cuenta = { versionEsquema: 1, id: 'caja', iglesiaId: 'iglesia', codigo: 'CAJA', nombre: 'Caja',
    tipo: 'caja', moneda: 'CLP', escala: 0, estado: 'activa' };
  const categoria = { versionEsquema: 1, id: 'gastos', iglesiaId: 'iglesia', codigo: 'GASTOS', nombre: 'Gastos',
    naturaleza: 'gasto', tipoIngreso: null, estado: 'activa' };
  const apertura = crearApertura({ id: 'apertura', fechaContable: '2026-10-01', periodoId: '2026-10',
    cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 10000 });
  const perfil = { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: P, descripcion: 'Conservar' };
  return {
    'usuarios_globales/admin': perfil,
    'usuarios_globales/encargado': { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: P },
    [`${BASE}`]: { adminUid: 'admin', descripcion: 'Conservar' },
    [`${BASE}/finanzas_config/acceso`]: { moduloHabilitado: true, encargadoUid: 'encargado' },
    [`${BASE}/finanzas_control/protocolo`]: { iglesiaId: 'iglesia', versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' },
    [`${BASE}/finanzas_config/contabilidad`]: { versionEsquema: 1, iglesiaId: 'iglesia', moneda: 'CLP',
      escala: 0, zonaHoraria: 'America/Santiago' },
    [`${BASE}/finanzas_control/libro`]: { versionEsquema: 1, iglesiaId: 'iglesia', ultimaSecuencia: 1,
      huboMovimientos: true, auxiliar: 'Conservar' },
    [`${BASE}/finanzas_control/periodo`]: { versionEsquema: 1, iglesiaId: 'iglesia', periodosAbiertos: ['2026-10'] },
    [`${BASE}/finanzas_cuentas/caja`]: { cuenta, auxiliar: 'Conservar' },
    [`${BASE}/finanzas_categorias/gastos`]: { categoria, auxiliar: 'Conservar' },
    [`${BASE}/finanzas_saldos/caja`]: { versionEsquema: 1, iglesiaId: 'iglesia', cuentaId: 'caja',
      saldoMinor: 10000, huboMovimientos: true, aperturaRegistrada: true, solicitudesInciertas: 0,
      ultimaSecuencia: 1, auxiliar: 'Conservar' },
    [`${BASE}/finanzas_movimientos/apertura`]: { versionEsquema: 1, iglesiaId: 'iglesia',
      estado: 'confirmado', secuencia: 1, movimiento: apertura },
  };
}
function entrada(uid = 'admin', clave = 'solicitud_gasto_001') {
  return { auth: { uid }, operacion: 'gasto', solicitud: { versionEsquema: 1, solicitudId: clave,
    iglesiaId: 'iglesia', cuentaId: 'caja', categoriaId: 'gastos', montoMinor: 4000,
    fechaContable: '2026-10-17', periodoId: '2026-10',
    precondiciones: { pertenenciaId: P, acceso: V, iglesia: V, cuenta: V, categoria: V,
      configuracion: V, controlPeriodo: V } } };
}
function entorno(datos = fixtures()) {
  const db = new FirestoreDoble(datos);
  return { db, adaptador: crearAdaptadorFirestore({ db, FieldValue: FV }) };
}
function codigo(c) { return e => e.codigo === c; }
function estado(db) { return copiar([...db.documentos].sort(([a], [b]) => a.localeCompare(b))); }
function documentos(db, coleccion) {
  return [...db.documentos].filter(([p]) => p.startsWith(`${coleccion}/`)).map(([, d]) => d);
}

for (const uid of ['admin', 'encargado']) test(`${uid}: gasto confirmado con seis escrituras atómicas`, async () => {
  const { db, adaptador } = entorno(); const inicial = estado(db);
  const r = await adaptador.ejecutar(entrada(uid));
  assert.equal(r.estado, 'CONFIRMADA'); assert.equal(r.historica, false); assert.equal(r.secuencia, 2);
  assert.match(r.movimientoId, /^[a-f0-9]{64}$/); assert.ok(Object.isFrozen(r));
  assert.equal(db.commits, 1); assert.equal(db.escrituras, 6);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 6000);
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`);
  assert.equal(resumen.datos.gastosNetosMinor, 4000); assert.equal(resumen.datos.aperturasNetasMinor, 10000);
  assert.equal(resumen.datos.ingresosNetosMinor, 0); assert.equal(resumen.datos.saldoFinalMinor, 6000);
  assert.equal(documentos(db, `${BASE}/finanzas_auditoria`).length, 1);
  assert.equal(documentos(db, `operaciones_financieras/${uid}/solicitudes`).length, 1);
  for (const [p, d] of inicial) {
    if (!p.includes('finanzas_saldos/') && !p.endsWith('finanzas_control/libro')) assert.deepEqual(db.documentos.get(p), d);
    if (d.auxiliar) assert.equal(db.documentos.get(p).auxiliar, d.auxiliar);
  }
  const m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
  assert.deepEqual(m.movimiento.asientos, [{ cuentaId: 'caja', deltaMinor: -4000 }]);
  assert.deepEqual(m.privado, { aportante: null }); assert.deepEqual(m.fechaCreacion, { servidor: true });
});

test('Repetición histórica propia, sin escrituras ni nueva autorización', async () => {
  const { db, adaptador } = entorno(); const e = entrada();
  const primero = await adaptador.ejecutar(e);
  db.cambiar('usuarios_globales/admin', { iglesiaId: null, rolGlobal: 'servidor' });
  db.cambiar(`${BASE}/finanzas_config/acceso`, { moduloHabilitado: false, encargadoUid: null });
  const antes = estado(db), escrituras = db.escrituras;
  const r = await adaptador.ejecutar(e);
  assert.deepEqual(r, { ...primero, historica: true }); assert.deepEqual(estado(db), antes);
  assert.equal(db.escrituras, escrituras);
  assert.equal(Object.hasOwn(r, 'saldoMinor'), false);
});
test('Orden de claves no altera la huella canónica', async () => {
  const { db, adaptador } = entorno(); const e = entrada(); await adaptador.ejecutar(e);
  e.solicitud = Object.fromEntries(Object.entries(e.solicitud).reverse());
  e.solicitud.precondiciones = Object.fromEntries(Object.entries(e.solicitud.precondiciones).reverse());
  assert.equal((await adaptador.ejecutar(e)).historica, true); assert.equal(db.commits, 1);
});
for (const [nombre, mutar] of [
  ['monto', e => { e.solicitud.montoMinor++; }],
  ['descripción', e => { e.solicitud.descripcion = 'Otro gasto'; }],
  ['iglesia', e => { e.solicitud.iglesiaId = 'otra'; }],
  ['período original', e => { e.solicitud.precondiciones.pertenenciaId = 'b'.repeat(64); }],
]) test(`La misma clave con ${nombre} diferente no se reutiliza`, async () => {
  const { db, adaptador } = entorno(); const e = entrada(); await adaptador.ejecutar(e);
  const antes = estado(db); mutar(e);
  await assert.rejects(adaptador.ejecutar(e), codigo('RECIBO_NO_COINCIDE')); assert.deepEqual(estado(db), antes);
});

for (const [nombre, mutar] of [
  ['encargado revocado', d => { d[`${BASE}/finanzas_config/acceso`].encargadoUid = null; }],
  ['módulo deshabilitado', d => { d[`${BASE}/finanzas_config/acceso`].moduloHabilitado = false; }],
  ['otra iglesia', d => { d['usuarios_globales/encargado'].iglesiaId = 'otra'; }],
  ['desvinculado', d => { d['usuarios_globales/encargado'].iglesiaId = null; }],
  ['otro período', d => { d['usuarios_globales/encargado'].pertenenciaId = 'b'.repeat(64); }],
  ['sin período', d => { delete d['usuarios_globales/encargado'].pertenenciaId; }],
  ['titular incoherente', d => { d['usuarios_globales/admin'].rolGlobal = 'servidor'; }],
]) test(`${nombre}: denegación sin cambios`, async () => {
  const d = fixtures(); mutar(d); const { db, adaptador } = entorno(d); const antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada('encargado')), codigo('CONTABILIDAD_NO_AUTORIZADA'));
  assert.deepEqual(estado(db), antes); assert.equal(db.escrituras, 0);
});

for (const [nombre, mutar] of [
  ['sin sesión', e => { e.auth = null; }],
  ['actor cliente', e => { e.solicitud.actorUid = 'admin'; }],
  ['rol cliente', e => { e.solicitud.rolGlobal = 'admin_iglesia'; }],
  ['aportante en gasto', e => { e.solicitud.aportante = { nombre: 'dato privado' }; }],
  ['saldo cliente', e => { e.solicitud.saldoMinor = 99999; }],
  ['ID de movimiento cliente', e => { e.solicitud.idMovimiento = 'arbitrario'; }],
  ['UID con separador', e => { e.auth.uid = 'a/b'; }],
  ['solicitud corta', e => { e.solicitud.solicitudId = 'corta'; }],
  ['solicitud sin límite', e => { e.solicitud.solicitudId = 'a'.repeat(129); }],
  ['versión de esquema', e => { e.solicitud.versionEsquema = 2; }],
  ['fracción', e => { e.solicitud.montoMinor = 0.5; }],
  ['monto inseguro', e => { e.solicitud.montoMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ['cero', e => { e.solicitud.montoMinor = 0; }],
  ['fecha imposible', e => { e.solicitud.fechaContable = '2026-02-30'; }],
  ['versión no canónica', e => { e.solicitud.precondiciones.acceso = '01:0'; }],
  ['texto excesivo', e => { e.solicitud.descripcion = 'a'.repeat(481); }],
  ['accesor', e => { Object.defineProperty(e.solicitud, 'descripcion', { enumerable: true, get() { throw Error('no leer'); } }); }],
]) test(`Entrada inválida ${nombre}: cero lecturas remotas`, async () => {
  const { db, adaptador } = entorno(); const e = entrada(); mutar(e);
  await assert.rejects(adaptador.ejecutar(e)); assert.equal(db.intentos, 0); assert.equal(db.escrituras, 0);
});
for (const operacion of ['actualizarCuenta', 'archivarCuenta', 'actualizarCategoria', 'archivarCategoria']) {
  test(`Operación no implementada ${operacion}: rechazo explícito`, async () => {
    const { db, adaptador } = entorno(); const e = entrada(); e.operacion = operacion;
    await assert.rejects(adaptador.ejecutar(e), codigo('OPERACION_NO_IMPLEMENTADA')); assert.equal(db.intentos, 0);
  });
}

test('Fallo de commit no deja movimiento, saldo, auditoría ni recibo parciales', async () => {
  const { db, adaptador } = entorno(); db.fallarCommit = true; const antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('RESULTADO_INCIERTO'));
  assert.deepEqual(estado(db), antes); assert.equal(db.escrituras, 0);
});
test('Respuesta perdida después del commit: la misma solicitud recupera la confirmación', async () => {
  const { db, adaptador } = entorno(); db.perderRespuesta = true;
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('RESULTADO_INCIERTO'));
  assert.equal(db.commits, 1); assert.equal(db.escrituras, 6);
  assert.equal((await adaptador.ejecutar(entrada())).historica, true);
  assert.equal(db.escrituras, 6); assert.equal(documentos(db, `${BASE}/finanzas_auditoria`).length, 1);
});
test('Error de lectura se sanitiza como resultado incierto, nunca como ausencia', async () => {
  const { db, adaptador } = entorno(); db.fallarLectura = true;
  await assert.rejects(adaptador.ejecutar(entrada()), e => e.codigo === 'RESULTADO_INCIERTO' &&
    !e.message.includes('detalle interno')); assert.equal(db.escrituras, 0);
});
test('Dos gastos simultáneos no sobregiran el saldo reconstruido', async () => {
  const { db, adaptador } = entorno(); const a = entrada(), b = entrada('admin', 'solicitud_gasto_002');
  a.solicitud.montoMinor = 7000; b.solicitud.montoMinor = 7000;
  const resultados = await Promise.allSettled([adaptador.ejecutar(a), adaptador.ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 3000);
  assert.equal(db.commits, 1); assert.ok(db.intentos >= 3);
});
test('Dos peticiones concurrentes iguales producen un solo commit y recibo', async () => {
  const { db, adaptador } = entorno();
  const r = await Promise.all([adaptador.ejecutar(entrada()), adaptador.ejecutar(entrada())]);
  assert.equal(new Set(r.map(v => v.movimientoId)).size, 1);
  assert.equal(r.filter(v => v.historica).length, 1); assert.equal(db.commits, 1); assert.equal(db.escrituras, 6);
});
test('Retry por modificación auxiliar relee sin efectos externos y confirma una vez', async () => {
  const { db, adaptador } = entorno();
  db.antesCommit = d => d.cambiar('usuarios_globales/admin', {
    ...d.documentos.get('usuarios_globales/admin'), descripcion: 'Cambio concurrente' });
  await adaptador.ejecutar(entrada()); assert.equal(db.intentos, 2); assert.equal(db.commits, 1);
  assert.equal(db.documentos.get('usuarios_globales/admin').descripcion, 'Cambio concurrente');
});
for (const [nombre, cambiar] of [
  ['transferencia de titularidad', db => {
    db.cambiar(BASE, { adminUid: 'encargado' });
    db.cambiar('usuarios_globales/encargado', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: P });
    db.cambiar('usuarios_globales/admin', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: P });
  }],
  ['revocación del encargado', db => db.cambiar(`${BASE}/finanzas_config/acceso`, { moduloHabilitado: true, encargadoUid: null })],
  ['salida y reingreso', db => db.cambiar('usuarios_globales/encargado', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'b'.repeat(64) })],
  ['cierre de período', db => db.cambiar(`${BASE}/finanzas_control/periodo`, { versionEsquema: 1, iglesiaId: 'iglesia', periodosAbiertos: [] })],
]) test(`Concurrencia con ${nombre}: invalida la intención`, async () => {
  const { db, adaptador } = entorno(); db.antesCommit = cambiar;
  const uid = nombre === 'transferencia de titularidad' ? 'admin' : 'encargado';
  await assert.rejects(adaptador.ejecutar(entrada(uid))); assert.equal(db.commits, 0); assert.equal(db.escrituras, 0);
});

for (const [nombre, mutar, esperado] of [
  ['saldo materializado adulterado', d => { d[`${BASE}/finanzas_saldos/caja`].saldoMinor++; }, 'SALDO_NO_CONCUERDA_CON_LIBRO'],
  ['cuenta sin saldo', d => { delete d[`${BASE}/finanzas_saldos/caja`]; }, 'SALDOS_INCOMPLETOS'],
  ['secuencia incoherente', d => { d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 2; }, 'CONTROL_LIBRO_INCOHERENTE'],
  ['hueco en secuencias', d => { d[`${BASE}/finanzas_movimientos/apertura`].secuencia = 2; }, 'CONTROL_LIBRO_INCOHERENTE'],
  ['cuenta duplicada', d => { d[`${BASE}/finanzas_cuentas/otra`] = { cuenta: { ...d[`${BASE}/finanzas_cuentas/caja`].cuenta, id: 'otra' } }; }, 'CUENTA_CODIGO_DUPLICADO'],
  ['categoría duplicada', d => { d[`${BASE}/finanzas_categorias/otra`] = { categoria: { ...d[`${BASE}/finanzas_categorias/gastos`].categoria, id: 'otra' } }; }, 'CATEGORIA_CODIGO_DUPLICADO'],
  ['período cerrado', d => { d[`${BASE}/finanzas_control/periodo`].periodosAbiertos = []; }, 'SIN_PERIODO_ABIERTO'],
  ['cuenta archivada', d => { d[`${BASE}/finanzas_cuentas/caja`].cuenta.estado = 'archivada'; }, 'CUENTA_ARCHIVADA'],
  ['categoría archivada', d => { d[`${BASE}/finanzas_categorias/gastos`].categoria.estado = 'archivada'; }, 'CATEGORIA_ARCHIVADA'],
  ['solicitud incierta previa', d => { d[`${BASE}/finanzas_saldos/caja`].solicitudesInciertas = 1; }, 'CUENTA_CON_SOLICITUDES_INCIERTAS'],
]) test(`Historia o contexto inválido: ${nombre}`, async () => {
  const d = fixtures(); mutar(d); const { db, adaptador } = entorno(d); const antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada()), codigo(esperado)); assert.deepEqual(estado(db), antes);
});
test('Resumen previo inconsistente no se repara silenciosamente', async () => {
  const { db, adaptador } = entorno(); await adaptador.ejecutar(entrada());
  const ruta = `${BASE}/finanzas_resumenes/2026-10`, resumen = db.documentos.get(ruta);
  resumen.datos.saldoFinalMinor++; db.cambiar(ruta, resumen); const antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada('admin', 'solicitud_gasto_002')),
    codigo('RESUMEN_NO_CONCUERDA_CON_LIBRO')); assert.deepEqual(estado(db), antes);
});
test('Segundo gasto conserva auxiliares del resumen y concuerda con reconstrucción completa', async () => {
  const { db, adaptador } = entorno(); await adaptador.ejecutar(entrada());
  const ruta = `${BASE}/finanzas_resumenes/2026-10`;
  db.cambiar(ruta, { ...db.documentos.get(ruta), auxiliar: 'Conservar' });
  await adaptador.ejecutar(entrada('admin', 'solicitud_gasto_002'));
  const movs = documentos(db, `${BASE}/finanzas_movimientos`).map(d => d.movimiento);
  assert.deepEqual(db.documentos.get(ruta).datos, calcularLibro({ movimientos: movs,
    cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }], periodoId: '2026-10' }));
  assert.equal(db.documentos.get(ruta).auxiliar, 'Conservar');
});
test('Entrada capturada antes del primer await no cambia por mutación del llamador', async () => {
  const { db, adaptador } = entorno(); const e = entrada(), anterior = copiar(e);
  const pendiente = adaptador.ejecutar(e); e.auth.uid = 'otro'; e.solicitud.montoMinor = 9000;
  await pendiente; assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 6000);
  assert.equal((await adaptador.ejecutar(anterior)).historica, true);
});
test('Entrada congelada permanece intacta', async () => {
  const { adaptador } = entorno(); const e = entrada(), antes = copiar(e);
  function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } }
  freeze(e); await adaptador.ejecutar(e); assert.deepEqual(e, antes);
});
test('Límite de catálogo bloquea sin leer un libro incompleto como válido', async () => {
  const d = fixtures();
  for (let i = 0; i < LIMITES.cuentas; i++) d[`${BASE}/finanzas_cuentas/c${i}`] = { cuenta: {
    ...d[`${BASE}/finanzas_cuentas/caja`].cuenta, id: `c${i}`, codigo: `C${i}` } };
  const { db, adaptador } = entorno(d); await assert.rejects(adaptador.ejecutar(entrada()), codigo('LIMITE_LIBRO_EXCEDIDO'));
  assert.equal(db.escrituras, 0);
});
test('Límite agregado de bytes evita reconstrucciones descontroladas', async () => {
  const d = fixtures(); d[`${BASE}/finanzas_cuentas/caja`].auxiliar = 'x'.repeat(LIMITES.bytesLectura);
  const { db, adaptador } = entorno(d); await assert.rejects(adaptador.ejecutar(entrada()), codigo('LIMITE_LECTURA_EXCEDIDO'));
  assert.equal(db.escrituras, 0);
});
test('Apertura duplicada histórica bloquea gastos, no modifica ni repara el libro', async () => {
  const d = fixtures(), segunda = copiar(d[`${BASE}/finanzas_movimientos/apertura`]);
  segunda.movimiento.id = 'segunda'; segunda.secuencia = 2;
  d[`${BASE}/finanzas_movimientos/segunda`] = segunda; d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 2;
  const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('APERTURA_DUPLICADA')); assert.deepEqual(estado(db), antes);
});
test('Doble reversión histórica bloquea gastos sin descontar dos veces', async () => {
  const d = fixtures(), original = d[`${BASE}/finanzas_movimientos/apertura`].movimiento;
  for (const [id, sec] of [['reversa1', 2], ['reversa2', 3]]) {
    const movimiento = revertirMovimiento({ id, original, fechaContable: '2026-10-02', periodoId: '2026-10',
      cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }] });
    d[`${BASE}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia', estado: 'confirmado', secuencia: sec, movimiento };
  }
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 3;
  const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('REVERSA_DUPLICADA')); assert.deepEqual(estado(db), antes);
});
test('Libro con ingreso histórico preserva clasificación de resultados', async () => {
  const d = fixtures(), m = crearIngreso({ id: 'ingreso', fechaContable: '2026-10-03', periodoId: '2026-10',
    cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1000 });
  d[`${BASE}/finanzas_movimientos/ingreso`] = { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: 2, estado: 'confirmado', movimiento: m };
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 2;
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], { saldoMinor: 11000, ultimaSecuencia: 2 });
  const { db, adaptador } = entorno(d); await adaptador.ejecutar(entrada());
  const r = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(r.ingresosNetosMinor, 1000); assert.equal(r.gastosNetosMinor, 4000); assert.equal(r.resultadoMinor, -3000);
});

test('Identidades distintas no acceden al recibo ajeno', async () => {
  const { db, adaptador } = entorno(); const a = await adaptador.ejecutar(entrada());
  const b = await adaptador.ejecutar(entrada('encargado'));
  assert.notEqual(a.movimientoId, b.movimientoId); assert.equal(b.historica, false);
  assert.equal(db.commits, 2);
  assert.equal(db.lecturas.some(p => p === 'operaciones_financieras/admin/solicitudes/solicitud_gasto_001'), true);
  assert.equal(documentos(db, 'operaciones_financieras/encargado/solicitudes').length, 1);
});
test('Recibo incoherente o movimiento ausente bloquea, sin generar otra clave', async () => {
  for (const caso of ['actor', 'movimiento', 'huella']) {
    const { db, adaptador } = entorno(); const r = await adaptador.ejecutar(entrada());
    const ruta = 'operaciones_financieras/admin/solicitudes/solicitud_gasto_001';
    if (caso === 'movimiento') db.cambiar(`${BASE}/finanzas_movimientos/${r.movimientoId}`, null);
    else db.cambiar(ruta, { ...db.documentos.get(ruta), [caso === 'actor' ? 'uid' : 'huella']: 'incorrecto' });
    const antes = estado(db); await assert.rejects(adaptador.ejecutar(entrada())); assert.deepEqual(estado(db), antes);
  }
});
test('Movimiento huérfano no se aplica nuevamente aunque falte su recibo', async () => {
  const { db, adaptador } = entorno(); await adaptador.ejecutar(entrada());
  db.cambiar('operaciones_financieras/admin/solicitudes/solicitud_gasto_001', null);
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(entrada()), codigo('AUDITORIA_SIN_RECIBO'));
  assert.deepEqual(estado(db), antes);
});
test('Encargado con rol líder obtiene permiso solo por designación', async () => {
  const d = fixtures(); d['usuarios_globales/encargado'].rolGlobal = 'lider_area';
  const { adaptador } = entorno(d); assert.equal((await adaptador.ejecutar(entrada('encargado'))).estado, 'CONFIRMADA');
  d[`${BASE}/finanzas_config/acceso`].encargadoUid = null;
  await assert.rejects(entorno(d).adaptador.ejecutar(entrada('encargado')), codigo('CONTABILIDAD_NO_AUTORIZADA'));
});
test('Versión de cuenta o configuración vencida rechaza el gasto', async () => {
  for (const ruta of [`${BASE}/finanzas_cuentas/caja`, `${BASE}/finanzas_config/contabilidad`, BASE]) {
    const { db, adaptador } = entorno(); db.cambiar(ruta, db.documentos.get(ruta));
    const antes = estado(db); await assert.rejects(adaptador.ejecutar(entrada()), codigo('CONTEXTO_OPERACION_MODIFICADO'));
    assert.deepEqual(estado(db), antes);
  }
});
test('Límite de movimientos permite el último cupo, bloquea el siguiente y conserva replay', async () => {
  const d = fixtures();
  for (let i = 2; i < LIMITES.movimientos; i++) {
    const id = `ingreso_${i}`, movimiento = crearIngreso({ id, fechaContable: '2026-10-02', periodoId: '2026-10',
      cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1 });
    d[`${BASE}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia',
      secuencia: i, estado: 'confirmado', movimiento };
  }
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = LIMITES.movimientos - 1;
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], {
    saldoMinor: 10000 + LIMITES.movimientos - 2, ultimaSecuencia: LIMITES.movimientos - 1 });
  const { db, adaptador } = entorno(d); await adaptador.ejecutar(entrada());
  assert.equal((await adaptador.ejecutar(entrada())).historica, true);
  await assert.rejects(adaptador.ejecutar(entrada('admin', 'solicitud_gasto_002')), codigo('LIMITE_LIBRO_EXCEDIDO'));
  assert.equal(db.commits, 1);
});
test('Un ingreso de un mes futuro no financia un gasto del mes abierto', async () => {
  const d = copiar(fixtures()), m = d[`${BASE}/finanzas_movimientos/apertura`].movimiento;
  m.fechaContable = '2026-11-01'; m.periodoId = '2026-11';
  const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('HISTORIAL_POSTERIOR_AL_PERIODO'));
  assert.deepEqual(estado(db), antes);
});
test('Apertura de un período anterior participa del saldo inicial, nunca del ingreso operativo', async () => {
  const d = copiar(fixtures()), m = d[`${BASE}/finanzas_movimientos/apertura`].movimiento;
  m.fechaContable = '2026-09-01'; m.periodoId = '2026-09';
  const { db, adaptador } = entorno(d); await adaptador.ejecutar(entrada());
  const r = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(r.saldoInicialMinor, 10000); assert.equal(r.saldoFinalMinor, 6000);
  assert.equal(r.ingresosNetosMinor, 0); assert.equal(r.aperturasNetasMinor, 0);
});
test('Saldo cero después de gastar todo no pierde el historial', async () => {
  const { db, adaptador } = entorno(); const e = entrada(); e.solicitud.montoMinor = 10000;
  await adaptador.ejecutar(e); const s = db.documentos.get(`${BASE}/finanzas_saldos/caja`);
  assert.equal(s.saldoMinor, 0); assert.equal(s.huboMovimientos, true); assert.equal(s.aperturaRegistrada, true);
  await assert.rejects(adaptador.ejecutar(entrada('admin', 'solicitud_gasto_002')), codigo('SALDO_INSUFICIENTE'));
});
test('Phantom concurrente de código duplicado invalida la transacción antes del commit', async () => {
  const { db, adaptador } = entorno();
  db.antesCommit = d => d.cambiar(`${BASE}/finanzas_cuentas/otra`, { cuenta: {
    ...d.documentos.get(`${BASE}/finanzas_cuentas/caja`).cuenta, id: 'otra' } });
  await assert.rejects(adaptador.ejecutar(entrada()), codigo('CUENTA_CODIGO_DUPLICADO'));
  assert.equal(db.escrituras, 0);
});

function nuevaOperacion(op, { uid = 'admin', clave = 'solicitud_nueva_001' } = {}) {
  const precondiciones = { pertenenciaId: P, acceso: V, iglesia: V, configuracion: V, controlPeriodo: V };
  const solicitud = { versionEsquema: 1, solicitudId: clave, iglesiaId: 'iglesia', periodoId: '2026-10', precondiciones };
  if (op === 'crearCuenta') solicitud.cuenta = { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' };
  if (op === 'crearCategoria') solicitud.categoria = { codigo: 'OTROS', nombre: 'Otros', naturaleza: 'ingreso', tipoIngreso: 'otros' };
  if (op === 'apertura') Object.assign(solicitud, { cuentaId: 'caja', montoMinor: 10000,
    fechaContable: '2026-10-01', precondiciones: { ...precondiciones, cuenta: V } });
  return { auth: { uid }, operacion: op, solicitud };
}
function libroVacio() {
  const d = fixtures(); delete d[`${BASE}/finanzas_movimientos/apertura`];
  Object.assign(d[`${BASE}/finanzas_control/libro`], { ultimaSecuencia: 0, huboMovimientos: false });
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], { saldoMinor: 0, huboMovimientos: false,
    aperturaRegistrada: false, ultimaSecuencia: 0 });
  return d;
}
for (const tipo of ['caja', 'banco']) test(`Alta de cuenta ${tipo}: reserva, saldo cero y resumen sin ingresos`, async () => {
  const { db, adaptador } = entorno(); const e = nuevaOperacion('crearCuenta'); e.solicitud.cuenta.tipo = tipo;
  const antes = estado(db); const r = await adaptador.ejecutar(e);
  assert.match(r.cuentaId, /^[a-f0-9]{64}$/); assert.equal(r.historica, false);
  assert.equal(db.documentos.get(`${BASE}/finanzas_reservas_cuentas/BANCO`).entidadId, r.cuentaId);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/${r.cuentaId}`).saldoMinor, 0);
  assert.equal(db.documentos.get(`${BASE}/finanzas_cuentas/${r.cuentaId}`).cuenta.tipo, tipo);
  assert.equal(db.documentos.get(`${BASE}/finanzas_control/libro`).ultimaSecuencia, 1);
  assert.equal(db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos.ingresosNetosMinor, 0);
  assert.deepEqual(db.documentos.get(`${BASE}/finanzas_movimientos/apertura`), new Map(antes).get(`${BASE}/finanzas_movimientos/apertura`));
  const foto = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), foto);
  // La proyección actualizada admite un gasto posterior sin reparar saldos.
  await adaptador.ejecutar(entrada());
});
for (const naturaleza of ['ingreso', 'gasto']) test(`Alta de categoría ${naturaleza}: contrato FIN-4 y reserva`, async () => {
  const { db, adaptador } = entorno(); const e = nuevaOperacion('crearCategoria');
  e.solicitud.categoria.naturaleza = naturaleza; e.solicitud.categoria.tipoIngreso = naturaleza === 'ingreso' ? 'diezmos' : null;
  const r = await adaptador.ejecutar(e);
  assert.equal(db.documentos.get(`${BASE}/finanzas_categorias/${r.categoriaId}`).categoria.naturaleza, naturaleza);
  assert.equal(db.documentos.get(`${BASE}/finanzas_reservas_categorias/OTROS`).entidadId, r.categoriaId);
  assert.equal(db.documentos.get(`${BASE}/finanzas_movimientos/apertura`).movimiento.clase, 'apertura');
  const foto = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), foto);
});
for (const op of ['crearCuenta', 'crearCategoria']) test(`${op}: código duplicado concurrente y código legado sin reserva`, async () => {
  const { db, adaptador } = entorno(); const a = nuevaOperacion(op), b = nuevaOperacion(op, { clave: 'solicitud_nueva_002' });
  const r = await Promise.allSettled([adaptador.ejecutar(a), adaptador.ejecutar(b)]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.codigo, 'CODIGO_RESERVADO'); assert.equal(db.commits, 1);
  const legado = nuevaOperacion(op, { clave: 'solicitud_legado_001' });
  (op === 'crearCuenta' ? legado.solicitud.cuenta : legado.solicitud.categoria).codigo = op === 'crearCuenta' ? 'CAJA' : 'GASTOS';
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(legado), codigo(op === 'crearCuenta' ? 'CUENTA_CODIGO_DUPLICADO' : 'CATEGORIA_CODIGO_DUPLICADO'));
  assert.deepEqual(estado(db), antes);
});
test('Apertura única patrimonial: siete escrituras atómicas; nunca ingreso', async () => {
  const { db, adaptador } = entorno(libroVacio()); const e = nuevaOperacion('apertura');
  const r = await adaptador.ejecutar(e); assert.equal(r.secuencia, 1); assert.equal(db.escrituras, 7);
  assert.equal(db.documentos.get(`${BASE}/finanzas_aperturas/caja`).movimientoId, r.movimientoId);
  const s = db.documentos.get(`${BASE}/finanzas_saldos/caja`);
  assert.equal(s.saldoMinor, 10000); assert.equal(s.aperturaRegistrada, true);
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(resumen.ingresosNetosMinor, 0); assert.equal(resumen.aperturasNetasMinor, 10000);
  assert.equal(resumen.resultadoMinor, 0);
  const foto = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), foto);
  await adaptador.ejecutar(entrada()); // apertura y gasto reconstruyen el libro correctamente.
});
test('Dos aperturas concurrentes de una cuenta: solo una se confirma', async () => {
  const { db, adaptador } = entorno(libroVacio());
  const r = await Promise.allSettled([adaptador.ejecutar(nuevaOperacion('apertura')),
    adaptador.ejecutar(nuevaOperacion('apertura', { clave: 'solicitud_apertura_002' }))]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.codigo, 'APERTURA_DUPLICADA'); assert.equal(db.commits, 1);
});
for (const op of ['crearCuenta', 'crearCategoria', 'apertura']) {
  test(`${op}: timeout posterior al commit recupera la misma operación`, async () => {
    const { db, adaptador } = entorno(op === 'apertura' ? libroVacio() : fixtures()); const e = nuevaOperacion(op);
    db.perderRespuesta = true; await assert.rejects(adaptador.ejecutar(e), codigo('RESULTADO_INCIERTO'));
    const foto = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), foto);
    const diferente = copiar(e);
    if (op === 'apertura') diferente.solicitud.montoMinor++; else diferente.solicitud[op === 'crearCuenta' ? 'cuenta' : 'categoria'].nombre = 'Otro';
    await assert.rejects(adaptador.ejecutar(diferente), codigo('RECIBO_NO_COINCIDE'));
    assert.deepEqual(estado(db), foto);
  });
  test(`${op}: fallo de commit no deja reserva, documento, saldo ni recibo parcial`, async () => {
    const { db, adaptador } = entorno(op === 'apertura' ? libroVacio() : fixtures()); db.fallarCommit = true;
    const foto = estado(db); await assert.rejects(adaptador.ejecutar(nuevaOperacion(op)), codigo('RESULTADO_INCIERTO'));
    assert.deepEqual(estado(db), foto);
  });
  for (const caso of ['encargado', 'revocado', 'legado', 'otraIglesia', 'modulo', 'periodo']) test(`${op}: denegación ${caso}`, async () => {
    const d = op === 'apertura' ? libroVacio() : fixtures(); const e = nuevaOperacion(op);
    if (caso === 'encargado' || caso === 'revocado') e.auth.uid = 'encargado';
    if (caso === 'revocado') d[`${BASE}/finanzas_config/acceso`].encargadoUid = null;
    if (caso === 'legado') delete d['usuarios_globales/admin'].pertenenciaId;
    if (caso === 'otraIglesia') d['usuarios_globales/admin'].iglesiaId = 'otra';
    if (caso === 'modulo') d[`${BASE}/finanzas_config/acceso`].moduloHabilitado = false;
    if (caso === 'periodo') d[`${BASE}/finanzas_control/periodo`].periodosAbiertos = [];
    const { db, adaptador } = entorno(d), foto = estado(db);
    await assert.rejects(adaptador.ejecutar(e), codigo(caso === 'periodo' ? 'SIN_PERIODO_ABIERTO' : 'CONTABILIDAD_NO_AUTORIZADA'));
    assert.deepEqual(estado(db), foto);
  });
}
test('Apertura de cuenta archivada o con historial legado sin marcador: denegada', async () => {
  const d = libroVacio(); d[`${BASE}/finanzas_cuentas/caja`].cuenta.estado = 'archivada';
  await assert.rejects(entorno(d).adaptador.ejecutar(nuevaOperacion('apertura')), codigo('CUENTA_ARCHIVADA'));
  await assert.rejects(entorno().adaptador.ejecutar(nuevaOperacion('apertura')), codigo('APERTURA_DUPLICADA'));
});
for (const [op, campo] of [['crearCuenta', 'saldoMinor'], ['crearCuenta', 'estado'], ['crearCategoria', 'estado']]) {
  test(`${op} no permite campo ${campo} ni alterar entidades existentes`, async () => {
    const { db, adaptador } = entorno(); const e = nuevaOperacion(op);
    e.solicitud[op === 'crearCuenta' ? 'cuenta' : 'categoria'][campo] = campo === 'saldoMinor' ? 999 : 'archivada';
    await assert.rejects(adaptador.ejecutar(e)); assert.equal(db.intentos, 0);
  });
}
for (const op of ['crearCuenta', 'crearCategoria']) test(`${op}: no supera el limite de 50 entidades`, async () => {
  const d = fixtures();
  for (let i = 1; i < 50; i++) {
    const id = `extra_${i}`;
    if (op === 'crearCuenta') {
      d[`${BASE}/finanzas_cuentas/${id}`] = { cuenta: { ...d[`${BASE}/finanzas_cuentas/caja`].cuenta, id, codigo: `C${i}` } };
      d[`${BASE}/finanzas_saldos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia', cuentaId: id,
        saldoMinor: 0, huboMovimientos: false, aperturaRegistrada: false, solicitudesInciertas: 0, ultimaSecuencia: 0 };
    } else d[`${BASE}/finanzas_categorias/${id}`] = { categoria: {
      ...d[`${BASE}/finanzas_categorias/gastos`].categoria, id, codigo: `C${i}` } };
  }
  const { db, adaptador } = entorno(d), foto = estado(db);
  await assert.rejects(adaptador.ejecutar(nuevaOperacion(op)), codigo('LIMITE_LIBRO_EXCEDIDO'));
  assert.deepEqual(estado(db), foto);
});
for (const op of ['crearCuenta', 'crearCategoria', 'apertura']) {
  test(`${op}: contexto original vencido y periodo de pertenencia anterior se rechazan`, async () => {
    const { db, adaptador } = entorno(op === 'apertura' ? libroVacio() : fixtures());
    const e = nuevaOperacion(op); e.solicitud.precondiciones.configuracion = '1700000000:1';
    const foto = estado(db);
    await assert.rejects(adaptador.ejecutar(e), codigo('CONTEXTO_OPERACION_MODIFICADO'));
    e.solicitud.precondiciones.configuracion = V; e.solicitud.precondiciones.pertenenciaId = 'b'.repeat(64);
    await assert.rejects(adaptador.ejecutar(e), codigo('CONTABILIDAD_NO_AUTORIZADA'));
    assert.deepEqual(estado(db), foto);
  });
}

function fixtureIngreso(tipo = 'diezmos') {
  const d = fixtures();
  d[`${BASE}/finanzas_categorias/ingresos`] = { categoria: {
    ...d[`${BASE}/finanzas_categorias/gastos`].categoria, id: 'ingresos', codigo: 'INGRESOS',
    nombre: 'Ingresos', naturaleza: 'ingreso', tipoIngreso: tipo } };
  return d;
}
function solicitudIngreso(uid = 'admin', clave = 'solicitud_ingreso_001') {
  const e = entrada(uid, clave); e.operacion = 'ingreso'; e.solicitud.categoriaId = 'ingresos'; return e;
}
for (const tipo of ['diezmos', 'ofrendas', 'donaciones', 'otros']) {
  test(`Ingreso ${tipo}: seis escrituras y clasificacion exacta; apertura no se suma como ingreso`, async () => {
    const { db, adaptador } = entorno(fixtureIngreso(tipo)); const e = solicitudIngreso();
    const r = await adaptador.ejecutar(e);
    assert.equal(db.escrituras, 6); assert.equal(r.secuencia, 2);
    const m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
    assert.equal(m.movimiento.clase, 'ingreso'); assert.equal(m.clasificacion.tipoIngreso, tipo);
    assert.deepEqual(m.movimiento.asientos, [{ cuentaId: 'caja', deltaMinor: 4000 }]);
    assert.deepEqual(m.privado, { aportante: null });
    const s = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
    assert.equal(s.ingresosNetosMinor, 4000); assert.equal(s.aperturasNetasMinor, 10000);
    assert.equal(s.resultadoMinor, 4000); assert.equal(s.saldoFinalMinor, 14000);
    assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 14000);
    assert.equal(db.documentos.get(`${BASE}/finanzas_auditoria/${r.movimientoId}`).evento, 'ingreso_registrado');
    const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true);
    assert.deepEqual(estado(db), antes);
  });
}
test('Donacion con aportante opcional: solo privado del movimiento y sin mutar entrada', async () => {
  const { db, adaptador } = entorno(fixtureIngreso('donaciones')); const e = solicitudIngreso();
  const nombre = 'Aportante ficticio FIN7C2'; e.solicitud.aportante = { nombre }; const antes = copiar(e);
  Object.freeze(e.solicitud.aportante); Object.freeze(e.solicitud); Object.freeze(e);
  const r = await adaptador.ejecutar(e); assert.deepEqual(e, antes);
  const m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
  assert.deepEqual(m.privado.aportante, { nombre });
  for (const [ruta, documento] of db.documentos) if (!ruta.startsWith(`${BASE}/finanzas_movimientos/`)) {
    assert.equal(JSON.stringify(documento).includes(nombre), false);
    assert.equal(Object.hasOwn(documento, 'aportante'), false);
  }
  assert.equal(JSON.stringify(r).includes(nombre), false);
});
test('Ingreso anonimo con aportante null es valido; ausencia y null tienen huellas distintas', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const e = solicitudIngreso(); e.solicitud.aportante = null;
  await adaptador.ejecutar(e); const antes = estado(db); delete e.solicitud.aportante;
  await assert.rejects(adaptador.ejecutar(e), codigo('RECIBO_NO_COINCIDE')); assert.deepEqual(estado(db), antes);
});
for (const [nombre, mutar] of [
  ['actor cliente', e => { e.solicitud.actorUid = 'admin'; }],
  ['saldo cliente', e => { e.solicitud.saldoMinor = 123; }],
  ['sin sesion', e => { e.auth = null; }],
  ['monto cero', e => { e.solicitud.montoMinor = 0; }],
  ['monto negativo', e => { e.solicitud.montoMinor = -1; }],
  ['monto fraccionario', e => { e.solicitud.montoMinor = 0.1; }],
  ['monto inseguro', e => { e.solicitud.montoMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ['fecha inexistente', e => { e.solicitud.fechaContable = '2026-02-30'; }],
  ['correo innecesario', e => { e.solicitud.aportante = { nombre: 'Ficticio', correo: 'no-usar@example.invalid' }; }],
  ['UID aportante', e => { e.solicitud.aportante = { nombre: 'Ficticio', uid: 'miembro' }; }],
  ['nombre vacio', e => { e.solicitud.aportante = { nombre: '' }; }],
  ['nombre excesivo', e => { e.solicitud.aportante = { nombre: 'x'.repeat(121) }; }],
  ['control en nombre', e => { e.solicitud.aportante = { nombre: 'Ficticio\n' }; }],
  ['aportante string', e => { e.solicitud.aportante = 'Ficticio'; }],
  ['aportante undefined', e => { e.solicitud.aportante = undefined; }],
  ['getter aportante', e => { e.solicitud.aportante = Object.defineProperty({}, 'nombre', { enumerable: true, get() { throw Error('No ejecutar'); } }); }],
]) test(`Ingreso invalido ${nombre}: cero lecturas remotas`, async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const e = solicitudIngreso(); mutar(e);
  await assert.rejects(adaptador.ejecutar(e)); assert.equal(db.intentos, 0); assert.equal(db.escrituras, 0);
});
for (const [nombre, mutar] of [
  ['cuenta archivada', d => { d[`${BASE}/finanzas_cuentas/caja`].cuenta.estado = 'archivada'; }],
  ['categoria archivada', d => { d[`${BASE}/finanzas_categorias/ingresos`].categoria.estado = 'archivada'; }],
  ['periodo cerrado', d => { d[`${BASE}/finanzas_control/periodo`].periodosAbiertos = []; }],
  ['modulo deshabilitado', d => { d[`${BASE}/finanzas_config/acceso`].moduloHabilitado = false; }],
  ['categoria ajena', d => { d[`${BASE}/finanzas_categorias/ingresos`].categoria.iglesiaId = 'otra'; }],
  ['cuenta ajena', d => { d[`${BASE}/finanzas_cuentas/caja`].cuenta.iglesiaId = 'otra'; }],
  ['saldo adulterado', d => { d[`${BASE}/finanzas_saldos/caja`].saldoMinor++; }],
  ['moneda incompatible', d => { d[`${BASE}/finanzas_config/contabilidad`].moneda = 'USD'; }],
]) test(`Ingreso rechazado por ${nombre} sin cambios parciales`, async () => {
  const d = fixtureIngreso(); mutar(d); const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(solicitudIngreso())); assert.deepEqual(estado(db), antes);
});
for (const caso of ['vigente', 'revocado', 'lider', 'externo', 'desvinculado', 'periodoAnterior']) {
  test(`Ingreso del encargado ${caso}: autorizacion vigente FIN-3`, async () => {
    const d = fixtureIngreso(), e = solicitudIngreso('encargado');
    if (caso === 'revocado' || caso === 'lider') d[`${BASE}/finanzas_config/acceso`].encargadoUid = null;
    if (caso === 'lider') d['usuarios_globales/encargado'].rolGlobal = 'lider_area';
    if (caso === 'externo') d['usuarios_globales/encargado'].iglesiaId = 'otra';
    if (caso === 'desvinculado') d['usuarios_globales/encargado'].iglesiaId = null;
    if (caso === 'periodoAnterior') e.solicitud.precondiciones.pertenenciaId = 'b'.repeat(64);
    const { db, adaptador } = entorno(d), antes = estado(db);
    if (caso === 'vigente') assert.equal((await adaptador.ejecutar(e)).estado, 'CONFIRMADA');
    else { await assert.rejects(adaptador.ejecutar(e), codigo('CONTABILIDAD_NO_AUTORIZADA')); assert.deepEqual(estado(db), antes); }
  });
}
test('Categoria de gasto no puede utilizarse en un ingreso', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const e = solicitudIngreso(); e.solicitud.categoriaId = 'gastos';
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(e)); assert.deepEqual(estado(db), antes);
});
test('Dos ingresos concurrentes distintos conservan ambos deltas y secuencias contiguas', async () => {
  const { db, adaptador } = entorno(fixtureIngreso());
  await Promise.all([adaptador.ejecutar(solicitudIngreso()), adaptador.ejecutar(solicitudIngreso('admin', 'solicitud_ingreso_002'))]);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 18000);
  assert.equal(db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos.ingresosNetosMinor, 8000);
  assert.equal(db.documentos.get(`${BASE}/finanzas_control/libro`).ultimaSecuencia, 3); assert.equal(db.commits, 2);
});
test('Ingreso concurrente con misma clave y retry de callback no se duplica', async () => {
  const { db, adaptador } = entorno(fixtureIngreso());
  db.antesCommit = d => d.cambiar('usuarios_globales/admin', { ...d.documentos.get('usuarios_globales/admin'), descripcion: 'Auxiliar' });
  const r = await Promise.all([adaptador.ejecutar(solicitudIngreso()), adaptador.ejecutar(solicitudIngreso())]);
  assert.equal(r.filter(x => x.historica).length, 1); assert.equal(db.commits, 1); assert.equal(db.escrituras, 6);
});
test('Ingreso ante transferencia administrativa concurrente se invalida al reintentar', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); db.antesCommit = d => {
    d.cambiar(BASE, { adminUid: 'encargado' });
    d.cambiar('usuarios_globales/encargado', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: P });
    d.cambiar('usuarios_globales/admin', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: P });
  };
  await assert.rejects(adaptador.ejecutar(solicitudIngreso()), codigo('CONTABILIDAD_NO_AUTORIZADA'));
  assert.equal(db.escrituras, 0);
});
test('Timeout despues de ingreso confirmado: misma clave, misma historia y aportante distinto rechazado', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const e = solicitudIngreso(); e.solicitud.aportante = { nombre: 'Nombre ficticio' };
  db.perderRespuesta = true; await assert.rejects(adaptador.ejecutar(e), codigo('RESULTADO_INCIERTO'));
  const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true);
  e.solicitud.aportante.nombre = 'Otro ficticio'; await assert.rejects(adaptador.ejecutar(e), codigo('RECIBO_NO_COINCIDE'));
  assert.deepEqual(estado(db), antes); assert.equal(db.escrituras, 6);
});
test('Fallo de commit de ingreso no deja saldo, movimiento, resumen, auditoria o recibo parcial', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const antes = estado(db); db.fallarCommit = true;
  await assert.rejects(adaptador.ejecutar(solicitudIngreso()), codigo('RESULTADO_INCIERTO')); assert.deepEqual(estado(db), antes);
});
test('Ingreso que desborda saldo seguro se rechaza antes de cualquier escritura', async () => {
  const { db, adaptador } = entorno(fixtureIngreso()); const e = solicitudIngreso(); e.solicitud.montoMinor = Number.MAX_SAFE_INTEGER;
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(e), codigo('DESBORDAMIENTO')); assert.deepEqual(estado(db), antes);
});
test('Limite de 200 movimientos se conserva para ingresos, con replay permitido', async () => {
  const d = fixtureIngreso();
  for (let i = 2; i < LIMITES.movimientos; i++) {
    const id = `i_${i}`;
    d[`${BASE}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: i,
      estado: 'confirmado', movimiento: crearIngreso({ id, fechaContable: '2026-10-02', periodoId: '2026-10',
        cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1 }) };
  }
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 199;
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], { saldoMinor: 10198, ultimaSecuencia: 199 });
  const { db, adaptador } = entorno(d), e = solicitudIngreso(); await adaptador.ejecutar(e);
  assert.equal((await adaptador.ejecutar(e)).historica, true);
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(solicitudIngreso('admin', 'solicitud_ingreso_002')),
    codigo('LIMITE_LIBRO_EXCEDIDO')); assert.deepEqual(estado(db), antes);
});

function fixtureTransferencia(origen = 'caja') {
  const d = copiar(fixtures());
  d[`${BASE}/finanzas_cuentas/banco`] = { cuenta: { ...d[`${BASE}/finanzas_cuentas/caja`].cuenta,
    id: 'banco', codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' }, auxiliar: 'Conservar' };
  d[`${BASE}/finanzas_saldos/banco`] = { versionEsquema: 1, iglesiaId: 'iglesia', cuentaId: 'banco',
    saldoMinor: 0, huboMovimientos: false, aperturaRegistrada: false, solicitudesInciertas: 0, ultimaSecuencia: 0, auxiliar: 'Conservar' };
  if (origen === 'banco') {
    d[`${BASE}/finanzas_movimientos/apertura`].movimiento.asientos[0].cuentaId = 'banco';
    Object.assign(d[`${BASE}/finanzas_saldos/banco`], { saldoMinor: 10000, huboMovimientos: true, aperturaRegistrada: true, ultimaSecuencia: 1 });
    Object.assign(d[`${BASE}/finanzas_saldos/caja`], { saldoMinor: 0, huboMovimientos: false, aperturaRegistrada: false, ultimaSecuencia: 0 });
  }
  return d;
}
function solicitudTransferencia(uid = 'admin', clave = 'solicitud_transferencia_001', origen = 'caja') {
  return { auth: { uid }, operacion: 'transferencia', solicitud: { versionEsquema: 1, solicitudId: clave,
    iglesiaId: 'iglesia', origenId: origen, destinoId: origen === 'caja' ? 'banco' : 'caja', montoMinor: 4000,
    fechaContable: '2026-10-17', periodoId: '2026-10', precondiciones: { pertenenciaId: P, acceso: V,
      iglesia: V, configuracion: V, controlPeriodo: V, cuentas: [{ cuentaId: 'caja', version: V }, { cuentaId: 'banco', version: V }] } } };
}
for (const origen of ['caja', 'banco']) for (const uid of ['admin', 'encargado']) {
  test(`Transferencia ${origen}, ${uid}: siete escrituras y consolidado constante`, async () => {
    const { db, adaptador } = entorno(fixtureTransferencia(origen)), e = solicitudTransferencia(uid, undefined, origen);
    const r = await adaptador.ejecutar(e); assert.equal(db.escrituras, 7); assert.equal(r.secuencia, 2);
    const m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
    assert.equal(m.movimiento.clase, 'transferencia'); assert.equal(m.clasificacion, null);
    assert.deepEqual(m.movimiento.asientos, [{ cuentaId: origen, deltaMinor: -4000 }, { cuentaId: e.solicitud.destinoId, deltaMinor: 4000 }]);
    assert.equal(m.movimiento.asientos.reduce((s, a) => s + a.deltaMinor, 0), 0);
    assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/${origen}`).saldoMinor, 6000);
    assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/${e.solicitud.destinoId}`).saldoMinor, 4000);
    const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
    assert.equal(resumen.saldoFinalMinor, 10000); assert.equal(resumen.ingresosNetosMinor, 0);
    assert.equal(resumen.gastosNetosMinor, 0); assert.equal(resumen.resultadoMinor, 0);
    assert.equal(resumen.aperturasNetasMinor, 10000);
    assert.equal(db.documentos.get(`${BASE}/finanzas_auditoria/${r.movimientoId}`).evento, 'transferencia_registrada');
    assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/banco`).auxiliar, 'Conservar');
    const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), antes);
  });
}
for (const [nombre, mutar] of [
  ['misma cuenta', e => { e.solicitud.destinoId = 'caja'; }],
  ['destino inexistente', e => { e.solicitud.destinoId = 'ausente'; }],
  ['saldo insuficiente', e => { e.solicitud.montoMinor = 10001; }],
  ['version origen vencida', e => { e.solicitud.precondiciones.cuentas[0].version = '1700000000:1'; }],
  ['version destino vencida', e => { e.solicitud.precondiciones.cuentas[1].version = '1700000000:1'; }],
  ['version iglesia vencida', e => { e.solicitud.precondiciones.iglesia = '1700000000:1'; }],
  ['observaciones duplicadas', e => { e.solicitud.precondiciones.cuentas[1] = { ...e.solicitud.precondiciones.cuentas[0] }; }],
  ['pertenencia anterior', e => { e.solicitud.precondiciones.pertenenciaId = 'b'.repeat(64); }],
]) test(`Transferencia rechaza ${nombre} sin cambios`, async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), e = solicitudTransferencia(); mutar(e); const antes = estado(db);
  await assert.rejects(adaptador.ejecutar(e)); assert.deepEqual(estado(db), antes);
});
for (const [nombre, mutar] of [
  ['cero', e => { e.solicitud.montoMinor = 0; }], ['negativo', e => { e.solicitud.montoMinor = -1; }],
  ['fraccion', e => { e.solicitud.montoMinor = 0.1; }], ['inseguro', e => { e.solicitud.montoMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ['actor cliente', e => { e.solicitud.actorUid = 'admin'; }], ['aportante', e => { e.solicitud.aportante = null; }],
  ['categoria', e => { e.solicitud.categoriaId = 'gastos'; }], ['saldo', e => { e.solicitud.saldoMinor = 9999; }],
  ['descripcion', e => { e.solicitud.descripcion = 'No admitida por FIN6'; }],
  ['tres cuentas', e => { e.solicitud.precondiciones.cuentas.push({ cuentaId: 'tercera', version: V }); }],
  ['array con extra', e => { e.solicitud.precondiciones.cuentas.extra = 'x'; }],
]) test(`Transferencia invalida ${nombre}: cero lecturas`, async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), e = solicitudTransferencia(); mutar(e);
  await assert.rejects(adaptador.ejecutar(e)); assert.equal(db.intentos, 0);
});
test('Getter de precondicion no se ejecuta al validar transferencia', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), e = solicitudTransferencia(); let ejecutado = false;
  Object.defineProperty(e.solicitud.precondiciones.cuentas, '0', { enumerable: true, get() { ejecutado = true; return {}; } });
  await assert.rejects(adaptador.ejecutar(e)); assert.equal(ejecutado, false); assert.equal(db.intentos, 0);
});
for (const [nombre, mutar] of [
  ['origen archivado', d => { d[`${BASE}/finanzas_cuentas/caja`].cuenta.estado = 'archivada'; }],
  ['destino archivado', d => { d[`${BASE}/finanzas_cuentas/banco`].cuenta.estado = 'archivada'; }],
  ['moneda incompatible', d => { d[`${BASE}/finanzas_cuentas/banco`].cuenta.moneda = 'USD'; }],
  ['cuenta ajena', d => { d[`${BASE}/finanzas_cuentas/banco`].cuenta.iglesiaId = 'otra'; }],
  ['periodo cerrado', d => { d[`${BASE}/finanzas_control/periodo`].periodosAbiertos = []; }],
  ['modulo deshabilitado', d => { d[`${BASE}/finanzas_config/acceso`].moduloHabilitado = false; }],
  ['saldo destino corrupto', d => { d[`${BASE}/finanzas_saldos/banco`].saldoMinor = 1; }],
  ['control corrupto', d => { d[`${BASE}/finanzas_control/libro`].ultimaSecuencia++; }],
  ['destino incierto', d => { d[`${BASE}/finanzas_saldos/banco`].solicitudesInciertas = 1; }],
]) test(`Transferencia bloqueada por ${nombre}`, async () => {
  const d = fixtureTransferencia(); mutar(d); const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(solicitudTransferencia())); assert.deepEqual(estado(db), antes);
});
test('Encargado revocado y miembro de otra iglesia no transfieren', async () => {
  for (const caso of ['revocado', 'externo']) {
    const d = fixtureTransferencia();
    if (caso === 'revocado') d[`${BASE}/finanzas_config/acceso`].encargadoUid = null;
    else d['usuarios_globales/encargado'].iglesiaId = 'otra';
    const { db, adaptador } = entorno(d), antes = estado(db);
    await assert.rejects(adaptador.ejecutar(solicitudTransferencia('encargado')), codigo('CONTABILIDAD_NO_AUTORIZADA'));
    assert.deepEqual(estado(db), antes);
  }
});
test('Dos transferencias concurrentes de fondos limitados: solo una confirma', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), a = solicitudTransferencia(), b = solicitudTransferencia('admin', 'solicitud_transferencia_002');
  a.solicitud.montoMinor = 7000; b.solicitud.montoMinor = 7000;
  const r = await Promise.allSettled([adaptador.ejecutar(a), adaptador.ejecutar(b)]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 3000);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/banco`).saldoMinor, 7000);
});
test('Transferencia concurrente con gasto no sobregira ni pierde saldos', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), t = solicitudTransferencia(), g = entrada();
  t.solicitud.montoMinor = 7000; g.solicitud.montoMinor = 7000;
  const r = await Promise.allSettled([adaptador.ejecutar(t), adaptador.ejecutar(g)]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 3000);
  const movimientos = documentos(db, `${BASE}/finanzas_movimientos`).map(x => x.movimiento);
  const libro = calcularLibro({ movimientos, cuentas: ['caja', 'banco'].map(id => ({ id, moneda: 'CLP', escala: 0 })), periodoId: '2026-10' });
  assert.deepEqual(libro, db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos);
});
test('Misma transferencia concurrente y respuesta perdida: un solo commit', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), e = solicitudTransferencia(); db.perderRespuesta = true;
  const r = await Promise.allSettled([adaptador.ejecutar(e), adaptador.ejecutar(e)]);
  assert.ok(r.some(x => x.status === 'rejected' && x.reason.codigo === 'RESULTADO_INCIERTO'));
  assert.equal(db.commits, 1); assert.equal(db.escrituras, 7);
  const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), antes);
  e.solicitud.montoMinor++; await assert.rejects(adaptador.ejecutar(e), codigo('RECIBO_NO_COINCIDE'));
  assert.deepEqual(estado(db), antes);
});
test('Fallo transaccional no deja origen o destino ni controles parciales', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), antes = estado(db); db.fallarCommit = true;
  await assert.rejects(adaptador.ejecutar(solicitudTransferencia()), codigo('RESULTADO_INCIERTO')); assert.deepEqual(estado(db), antes);
});
test('Transferencia con cambio concurrente de titularidad invalida intencion original', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()); db.antesCommit = d => {
    d.cambiar(BASE, { adminUid: 'encargado' });
    d.cambiar('usuarios_globales/encargado', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: P });
    d.cambiar('usuarios_globales/admin', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: P });
  };
  await assert.rejects(adaptador.ejecutar(solicitudTransferencia()), codigo('CONTABILIDAD_NO_AUTORIZADA')); assert.equal(db.escrituras, 0);
});
test('Saldo completo transferido preserva entrada congelada e historia de apertura', async () => {
  const { db, adaptador } = entorno(fixtureTransferencia()), e = solicitudTransferencia(); e.solicitud.montoMinor = 10000;
  const antes = copiar(e), original = copiar(db.documentos.get(`${BASE}/finanzas_movimientos/apertura`));
  function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } }
  freeze(e); await adaptador.ejecutar(e); assert.deepEqual(e, antes);
  assert.deepEqual(db.documentos.get(`${BASE}/finanzas_movimientos/apertura`), original);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 0);
});
for (const compensar of [false, true]) test(`Desbordamiento de ${compensar ? 'destino con consolidado seguro' : 'consolidado'}: transferencia rechazada`, async () => {
  const d = fixtureTransferencia();
  d[`${BASE}/finanzas_movimientos/limite`] = { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: 2, estado: 'confirmado',
    movimiento: crearIngreso({ id: 'limite', cuenta: { id: 'banco', moneda: 'CLP', escala: 0 }, montoMinor: Number.MAX_SAFE_INTEGER,
      fechaContable: '2026-10-02', periodoId: '2026-10' }) };
  Object.assign(d[`${BASE}/finanzas_saldos/banco`], { saldoMinor: Number.MAX_SAFE_INTEGER, huboMovimientos: true, ultimaSecuencia: 2 });
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 2;
  if (compensar) {
    d[`${BASE}/finanzas_cuentas/tercera`] = { cuenta: { ...d[`${BASE}/finanzas_cuentas/banco`].cuenta, id: 'tercera', codigo: 'TERCERA' } };
    d[`${BASE}/finanzas_movimientos/ajuste`] = { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: 3, estado: 'confirmado',
      movimiento: crearAjuste({ id: 'ajuste', cuenta: { id: 'tercera', moneda: 'CLP', escala: 0 }, montoMinor: -10000,
        fechaContable: '2026-10-03', periodoId: '2026-10' }) };
    d[`${BASE}/finanzas_saldos/tercera`] = { versionEsquema: 1, iglesiaId: 'iglesia', cuentaId: 'tercera', saldoMinor: -10000,
      huboMovimientos: true, aperturaRegistrada: false, solicitudesInciertas: 0, ultimaSecuencia: 3 };
    d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 3;
  }
  const { db, adaptador } = entorno(d), antes = estado(db);
  await assert.rejects(adaptador.ejecutar(solicitudTransferencia()), codigo('DESBORDAMIENTO')); assert.deepEqual(estado(db), antes);
});
test('Transferencia respeta cupo de 200 movimientos y permite replay sin otro cupo', async () => {
  const d = fixtureTransferencia();
  for (let i = 2; i < 200; i++) {
    const id = `i_${i}`; d[`${BASE}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: i,
      estado: 'confirmado', movimiento: crearIngreso({ id, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1,
        fechaContable: '2026-10-02', periodoId: '2026-10' }) };
  }
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = 199;
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], { saldoMinor: 10198, ultimaSecuencia: 199 });
  const { db, adaptador } = entorno(d), e = solicitudTransferencia(); await adaptador.ejecutar(e);
  assert.equal((await adaptador.ejecutar(e)).historica, true);
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(solicitudTransferencia('admin', 'solicitud_transferencia_002')),
    codigo('LIMITE_LIBRO_EXCEDIDO')); assert.deepEqual(estado(db), antes);
});

function versionActual(db, ruta) { return `1700000000:${123456789 + (db.versiones.get(ruta) ?? 0)}`; }
function solicitudCorreccion(db, tipo = 'ajuste', originalId = null, uid = 'admin', clave = 'solicitud_correccion_001') {
  const m = db.documentos.get(`${BASE}/finanzas_movimientos/${originalId}`)?.movimiento;
  const ids = tipo === 'reversion' && m ? m.asientos.map(a => a.cuentaId) : ['caja'];
  return { auth: { uid }, operacion: tipo, solicitud: { versionEsquema: 1, solicitudId: clave,
    iglesiaId: 'iglesia', fechaContable: '2026-10-17', periodoId: '2026-10',
    ...(tipo === 'ajuste' ? { cuentaId: 'caja', deltaMinor: 1000 } : { originalId }),
    motivo: 'Correccion ficticia privada', referenciaAuditoria: 'referencia-interna',
    precondiciones: { pertenenciaId: P, acceso: versionActual(db, `${BASE}/finanzas_config/acceso`),
      iglesia: versionActual(db, BASE), configuracion: versionActual(db, `${BASE}/finanzas_config/contabilidad`),
      controlPeriodo: versionActual(db, `${BASE}/finanzas_control/periodo`),
      cuentas: ids.map(cuentaId => ({ cuentaId, version: versionActual(db, `${BASE}/finanzas_cuentas/${cuentaId}`) })),
      ...(tipo === 'reversion' ? { original: { version: versionActual(db, `${BASE}/finanzas_movimientos/${originalId}`),
        versionReversion: null } } : {}) } } };
}
async function originalParaRevertir(clase) {
  const d = clase === 'ingreso' ? fixtureIngreso() : clase === 'transferencia' ? fixtureTransferencia() : fixtures();
  const entornoOriginal = entorno(d);
  const e = clase === 'ingreso' ? solicitudIngreso() : clase === 'transferencia' ? solicitudTransferencia() : entrada();
  const r = await entornoOriginal.adaptador.ejecutar(e);
  return { ...entornoOriginal, originalId: r.movimientoId };
}
for (const clase of ['ingreso', 'gasto', 'transferencia']) test(`Reversion ${clase}: contrapartida exacta y original inmutable`, async () => {
  const { db, adaptador, originalId } = await originalParaRevertir(clase);
  const ruta = `${BASE}/finanzas_movimientos/${originalId}`, original = copiar(db.documentos.get(ruta));
  const versionOriginal = versionActual(db, ruta), e = solicitudCorreccion(db, 'reversion', originalId);
  const entradaAntes = copiar(e), escriturasAntes = db.escrituras;
  const r = await adaptador.ejecutar(e), m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
  assert.deepEqual(e, entradaAntes); assert.deepEqual(db.documentos.get(ruta), original); assert.equal(versionActual(db, ruta), versionOriginal);
  assert.equal(db.escrituras - escriturasAntes, clase === 'transferencia' ? 8 : 7);
  assert.equal(m.movimiento.reversaDe, originalId); assert.equal(m.movimiento.clase, clase);
  assert.deepEqual(m.movimiento.asientos, original.movimiento.asientos.map(a => ({ ...a, deltaMinor: -a.deltaMinor })));
  assert.deepEqual(m.clasificacion, original.clasificacion);
  assert.equal(db.documentos.get(`${BASE}/finanzas_reversiones/${originalId}`).reversionId, r.movimientoId);
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(resumen.saldoFinalMinor, 10000); assert.equal(resumen.resultadoMinor, 0);
  assert.equal(resumen.ingresosNetosMinor, 0); assert.equal(resumen.gastosNetosMinor, 0);
  const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), antes);
  await assert.rejects(adaptador.ejecutar(solicitudCorreccion(db, 'reversion', originalId, 'admin', 'solicitud_correccion_002')),
    codigo('ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO')); assert.deepEqual(estado(db), antes);
  for (const [p, doc] of db.documentos) if (p !== `${BASE}/finanzas_movimientos/${r.movimientoId}`) {
    assert.equal(JSON.stringify(doc).includes(e.solicitud.motivo), false);
  }
});
test('Original de octubre cerrado: reversa en noviembre sin reescribir resumen u original', async () => {
  const { db, adaptador, originalId } = await originalParaRevertir('gasto');
  const resumenCerrado = copiar(db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`));
  const original = copiar(db.documentos.get(`${BASE}/finanzas_movimientos/${originalId}`));
  db.cambiar(`${BASE}/finanzas_control/periodo`, { versionEsquema: 1, iglesiaId: 'iglesia', periodosAbiertos: ['2026-11'] });
  const e = solicitudCorreccion(db, 'reversion', originalId); e.solicitud.periodoId = '2026-11'; e.solicitud.fechaContable = '2026-11-01';
  await adaptador.ejecutar(e);
  assert.deepEqual(db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`), resumenCerrado);
  assert.deepEqual(db.documentos.get(`${BASE}/finanzas_movimientos/${originalId}`), original);
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-11`).datos;
  assert.equal(resumen.gastosNetosMinor, -4000); assert.equal(resumen.saldoInicialMinor, 6000); assert.equal(resumen.saldoFinalMinor, 10000);
});
for (const delta of [1000, -1000, -10000]) test(`Ajuste ${delta}: patrimonial, seis escrituras y motivo privado`, async () => {
  const { db, adaptador } = entorno(), e = solicitudCorreccion(db); e.solicitud.deltaMinor = delta;
  const antes = copiar(e); Object.freeze(e.solicitud.precondiciones.cuentas[0]); Object.freeze(e.solicitud);
  const r = await adaptador.ejecutar(e); assert.deepEqual(e, antes); assert.equal(db.escrituras, 6);
  const m = db.documentos.get(`${BASE}/finanzas_movimientos/${r.movimientoId}`);
  assert.equal(m.movimiento.clase, 'ajuste'); assert.equal(m.clasificacion, null); assert.equal(m.movimiento.reversaDe, null);
  assert.equal(m.privado.motivo, e.solicitud.motivo);
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(resumen.saldoFinalMinor, 10000 + delta); assert.equal(resumen.ajustesNetosMinor, delta);
  assert.equal(resumen.resultadoMinor, 0); assert.equal(resumen.ingresosNetosMinor, 0); assert.equal(resumen.gastosNetosMinor, 0);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).auxiliar, 'Conservar');
});
for (const tipo of ['reversion', 'ajuste']) {
  for (const caso of ['encargado', 'modulo', 'titular', 'pertenencia', 'iglesia', 'periodo', 'archivada', 'incierta', 'versionCuenta']) {
    test(`${tipo} denegado por ${caso}`, async () => {
      const { db, adaptador, originalId } = await originalParaRevertir('gasto');
      const e = solicitudCorreccion(db, tipo, originalId, caso === 'encargado' ? 'encargado' : 'admin');
      if (caso === 'modulo') db.cambiar(`${BASE}/finanzas_config/acceso`, { moduloHabilitado: false, encargadoUid: 'encargado' });
      if (caso === 'titular') db.cambiar(BASE, { adminUid: 'encargado' });
      if (caso === 'pertenencia') e.solicitud.precondiciones.pertenenciaId = 'b'.repeat(64);
      if (caso === 'iglesia') db.cambiar('usuarios_globales/admin', { iglesiaId: 'otra', rolGlobal: 'admin_iglesia', pertenenciaId: P });
      if (caso === 'periodo') db.cambiar(`${BASE}/finanzas_control/periodo`, { versionEsquema: 1, iglesiaId: 'iglesia', periodosAbiertos: [] });
      if (caso === 'archivada') { const d = copiar(db.documentos.get(`${BASE}/finanzas_cuentas/caja`)); d.cuenta.estado = 'archivada'; db.cambiar(`${BASE}/finanzas_cuentas/caja`, d); }
      if (caso === 'incierta') { const d = copiar(db.documentos.get(`${BASE}/finanzas_saldos/caja`)); d.solicitudesInciertas = 1; db.cambiar(`${BASE}/finanzas_saldos/caja`, d); }
      if (caso === 'versionCuenta') e.solicitud.precondiciones.cuentas[0].version = '1700000000:1';
      const antes = estado(db); await assert.rejects(adaptador.ejecutar(e)); assert.deepEqual(estado(db), antes);
    });
  }
  for (const caso of ['sinMotivo', 'motivoVacio', 'motivoControl', 'motivoLargo', 'rol', 'idMovimiento', 'actorUid', 'confirmado']) {
    test(`${tipo} entrada invalida ${caso}: sin lecturas`, async () => {
      const { db, adaptador } = entorno(), e = solicitudCorreccion(db, tipo, 'inexistente');
      if (caso === 'sinMotivo') delete e.solicitud.motivo;
      if (caso === 'motivoVacio') e.solicitud.motivo = '';
      if (caso === 'motivoControl') e.solicitud.motivo = 'motivo\n';
      if (caso === 'motivoLargo') e.solicitud.motivo = 'x'.repeat(241);
      if (caso === 'rol') e.solicitud.rol = 'admin_iglesia';
      if (caso === 'idMovimiento') e.solicitud.idMovimiento = 'inventado';
      if (caso === 'actorUid') e.solicitud.actorUid = 'admin';
      if (caso === 'confirmado') e.solicitud.estado = 'confirmado';
      await assert.rejects(adaptador.ejecutar(e)); assert.equal(db.intentos, 0);
    });
  }
  test(`${tipo}: timeout, replay historico y payload diferente`, async () => {
    const { db, adaptador, originalId } = await originalParaRevertir('gasto'), e = solicitudCorreccion(db, tipo, originalId);
    db.perderRespuesta = true; await assert.rejects(adaptador.ejecutar(e), codigo('RESULTADO_INCIERTO'));
    const antes = estado(db); assert.equal((await adaptador.ejecutar(e)).historica, true); assert.deepEqual(estado(db), antes);
    e.solicitud.motivo = 'Otro motivo'; await assert.rejects(adaptador.ejecutar(e), codigo('RECIBO_NO_COINCIDE')); assert.deepEqual(estado(db), antes);
  });
  test(`${tipo}: fallo de commit sin escritura parcial`, async () => {
    const { db, adaptador, originalId } = await originalParaRevertir('gasto');
    db.fallarCommit = true; const antes = estado(db);
    await assert.rejects(adaptador.ejecutar(solicitudCorreccion(db, tipo, originalId)), codigo('RESULTADO_INCIERTO'));
    assert.deepEqual(estado(db), antes);
  });
  test(`${tipo}: transferencia de titularidad concurrente bloquea callback reintentado`, async () => {
    const { db, adaptador, originalId } = await originalParaRevertir('gasto'), e = solicitudCorreccion(db, tipo, originalId);
    const antes = db.escrituras; db.antesCommit = d => {
      d.cambiar(BASE, { adminUid: 'encargado' });
      d.cambiar('usuarios_globales/encargado', { iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia', pertenenciaId: P });
      d.cambiar('usuarios_globales/admin', { iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: P });
    };
    await assert.rejects(adaptador.ejecutar(e), codigo('CONTABILIDAD_NO_AUTORIZADA')); assert.equal(db.escrituras, antes);
  });
}
for (const delta of [0, -10001, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) {
  test(`Ajuste invalido o desborda: ${delta}`, async () => {
    const { db, adaptador } = entorno(), e = solicitudCorreccion(db); e.solicitud.deltaMinor = delta; const antes = estado(db);
    await assert.rejects(adaptador.ejecutar(e)); assert.deepEqual(estado(db), antes);
  });
}
for (const caso of ['inexistente', 'incierto', 'versionOriginal', 'versionMarcador', 'apertura', 'ajuste', 'reversa', 'sinClasificacion', 'marcadorHuerfano']) {
  test(`Reversion de original no acreditado: ${caso}`, async () => {
    const { db, adaptador, originalId } = await originalParaRevertir('gasto');
    let idOriginal = originalId;
    if (caso === 'inexistente') idOriginal = 'ausente';
    if (caso === 'apertura') idOriginal = 'apertura';
    if (caso === 'ajuste') idOriginal = (await adaptador.ejecutar(solicitudCorreccion(db))).movimientoId;
    if (caso === 'reversa') idOriginal = (await adaptador.ejecutar(solicitudCorreccion(db, 'reversion', originalId))).movimientoId;
    const e = solicitudCorreccion(db, 'reversion', idOriginal, 'admin', 'solicitud_anular_invalida_001');
    if (caso === 'incierto' || caso === 'sinClasificacion') {
      const d = copiar(db.documentos.get(`${BASE}/finanzas_movimientos/${originalId}`));
      if (caso === 'incierto') d.estado = 'incierto'; else delete d.clasificacion;
      db.cambiar(`${BASE}/finanzas_movimientos/${originalId}`, d);
    }
    if (caso === 'versionOriginal') e.solicitud.precondiciones.original.version = '1700000000:1';
    if (caso === 'versionMarcador') e.solicitud.precondiciones.original.versionReversion = V;
    if (caso === 'marcadorHuerfano') db.cambiar(`${BASE}/finanzas_reversiones/${originalId}`, { reversionId: 'otra' });
    const antes = estado(db); await assert.rejects(adaptador.ejecutar(e)); assert.deepEqual(estado(db), antes);
  });
}
for (const clase of ['ingreso', 'transferencia']) test(`Reversion ${clase} no sobregira la cuenta debitada`, async () => {
  const { db, adaptador, originalId } = await originalParaRevertir(clase);
  const a = solicitudCorreccion(db, 'ajuste', null, 'admin', 'solicitud_consumir_fondos_001');
  if (clase === 'transferencia') { a.solicitud.cuentaId = 'banco'; a.solicitud.precondiciones.cuentas = [{ cuentaId: 'banco', version: V }]; }
  a.solicitud.deltaMinor = clase === 'ingreso' ? -11000 : -4000; await adaptador.ejecutar(a);
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(solicitudCorreccion(db, 'reversion', originalId)), codigo('SALDO_INSUFICIENTE'));
  assert.deepEqual(estado(db), antes);
});
test('Diferentes solicitudes concurrentes del mismo original: una sola reversa', async () => {
  const { db, adaptador, originalId } = await originalParaRevertir('gasto');
  const a = solicitudCorreccion(db, 'reversion', originalId), b = solicitudCorreccion(db, 'reversion', originalId, 'admin', 'solicitud_correccion_002');
  const resultados = await Promise.allSettled([adaptador.ejecutar(a), adaptador.ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'ORIGINAL_YA_REVERTIDO_O_CONTROL_MODIFICADO');
  assert.equal(documentos(db, `${BASE}/finanzas_reversiones`).length, 1);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 10000);
});
test('Dos ajustes concurrentes negativos con fondos limitados no sobregiran', async () => {
  const { db, adaptador } = entorno(), a = solicitudCorreccion(db), b = solicitudCorreccion(db, 'ajuste', null, 'admin', 'solicitud_correccion_002');
  a.solicitud.deltaMinor = -7000; b.solicitud.deltaMinor = -7000;
  const resultados = await Promise.allSettled([adaptador.ejecutar(a), adaptador.ejecutar(b)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'SALDO_INSUFICIENTE');
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 3000);
});
for (const tipo of ['reversion', 'ajuste']) test(`${tipo}: misma solicitud simultanea produce un solo commit`, async () => {
  const { db, adaptador, originalId } = await originalParaRevertir('gasto'), e = solicitudCorreccion(db, tipo, originalId);
  const commits = db.commits, resultados = await Promise.all([adaptador.ejecutar(e), adaptador.ejecutar(e)]);
  assert.equal(db.commits, commits + 1); assert.equal(resultados.filter(r => r.historica).length, 1);
  assert.equal(resultados[0].movimientoId, resultados[1].movimientoId);
});
test('V1: un gasto en el cupo 200 impide anularlo, incluso al abrir otro mes', async () => {
  const d = fixtures();
  for (let i = 2; i < LIMITES.movimientos; i++) {
    const id = `ingreso_limite_${i}`;
    d[`${BASE}/finanzas_movimientos/${id}`] = { versionEsquema: 1, iglesiaId: 'iglesia',
      secuencia: i, estado: 'confirmado', movimiento: crearIngreso({ id,
        cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1,
        fechaContable: '2026-10-02', periodoId: '2026-10' }) };
  }
  d[`${BASE}/finanzas_control/libro`].ultimaSecuencia = LIMITES.movimientos - 1;
  Object.assign(d[`${BASE}/finanzas_saldos/caja`], {
    saldoMinor: 10000 + LIMITES.movimientos - 2, ultimaSecuencia: LIMITES.movimientos - 1 });
  const { db, adaptador } = entorno(d);
  const { movimientoId } = await adaptador.ejecutar(entrada());
  for (const periodoId of ['2026-10', '2026-11']) {
    if (periodoId === '2026-11') db.cambiar(`${BASE}/finanzas_control/periodo`, {
      versionEsquema: 1, iglesiaId: 'iglesia', periodosAbiertos: [periodoId] });
    const e = solicitudCorreccion(db, 'reversion', movimientoId);
    e.solicitud.periodoId = periodoId; e.solicitud.fechaContable = `${periodoId}-24`;
    const antes = estado(db), escrituras = db.escrituras;
    await assert.rejects(adaptador.ejecutar(e), codigo('LIMITE_LIBRO_EXCEDIDO'));
    assert.deepEqual(estado(db), antes); assert.equal(db.escrituras, escrituras);
  }
  assert.equal((await adaptador.ejecutar(entrada())).historica, true);
});

for (const tipo of ['reversion', 'ajuste']) test(`${tipo}: ultimo cupo, libro reconstruido y replay sin nuevo cupo`, async () => {
  const { db, adaptador, originalId } = await originalParaRevertir('gasto');
  for (let i = 3; i < 200; i++) {
    const id = `i_${i}`; db.cambiar(`${BASE}/finanzas_movimientos/${id}`, { versionEsquema: 1, iglesiaId: 'iglesia', secuencia: i,
      estado: 'confirmado', movimiento: crearIngreso({ id, cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 1,
        fechaContable: '2026-10-02', periodoId: '2026-10' }) });
  }
  db.cambiar(`${BASE}/finanzas_control/libro`, { ...db.documentos.get(`${BASE}/finanzas_control/libro`), ultimaSecuencia: 199 });
  db.cambiar(`${BASE}/finanzas_saldos/caja`, { ...db.documentos.get(`${BASE}/finanzas_saldos/caja`), saldoMinor: 6197, ultimaSecuencia: 199 });
  db.cambiar(`${BASE}/finanzas_resumenes/2026-10`, null);
  const e = solicitudCorreccion(db, tipo, originalId); await adaptador.ejecutar(e); const antes = estado(db);
  assert.equal((await adaptador.ejecutar(e)).historica, true);
  await assert.rejects(adaptador.ejecutar(solicitudCorreccion(db, 'ajuste', null, 'admin', 'solicitud_cupo_002')), codigo('LIMITE_LIBRO_EXCEDIDO'));
  assert.deepEqual(estado(db), antes);
});
test('Reversion de gasto rechaza desbordamiento al acreditar saldo', async () => {
  const d = copiar(fixtures()); d[`${BASE}/finanzas_movimientos/apertura`].movimiento.asientos[0].deltaMinor = Number.MAX_SAFE_INTEGER;
  d[`${BASE}/finanzas_saldos/caja`].saldoMinor = Number.MAX_SAFE_INTEGER;
  const { db, adaptador } = entorno(d), gasto = entrada(); gasto.solicitud.montoMinor = 1;
  const originalId = (await adaptador.ejecutar(gasto)).movimientoId;
  const ajuste = solicitudCorreccion(db); ajuste.solicitud.deltaMinor = 1; await adaptador.ejecutar(ajuste);
  const antes = estado(db); await assert.rejects(adaptador.ejecutar(solicitudCorreccion(db, 'reversion', originalId, 'admin', 'solicitud_desborde_001')),
    codigo('DESBORDAMIENTO')); assert.deepEqual(estado(db), antes);
});
test('Gasto posterior a reversa reconstruye libro sin descontar dos veces el original', async () => {
  const { db, adaptador, originalId } = await originalParaRevertir('gasto');
  await adaptador.ejecutar(solicitudCorreccion(db, 'reversion', originalId));
  await adaptador.ejecutar(entrada('admin', 'solicitud_gasto_posterior_001'));
  const resumen = db.documentos.get(`${BASE}/finanzas_resumenes/2026-10`).datos;
  assert.equal(resumen.saldoFinalMinor, 6000); assert.equal(resumen.gastosNetosMinor, 4000); assert.equal(resumen.resultadoMinor, -4000);
  assert.equal(db.documentos.get(`${BASE}/finanzas_saldos/caja`).saldoMinor, 6000);
});


// FIN-7C.4D.1: todos los escritores comparten la barrera documental.
async function casoProtocolo(op) {
  if (op === 'reversion') {
    const e = await originalParaRevertir('gasto');
    return { ...e, entrada: solicitudCorreccion(e.db, 'reversion', e.originalId) };
  }
  const e = entorno(op === 'ingreso' ? fixtureIngreso() : op === 'transferencia' ? fixtureTransferencia() :
    op === 'apertura' ? libroVacio() : fixtures());
  return { ...e, entrada: op === 'gasto' ? entrada() : op === 'ingreso' ? solicitudIngreso() :
    op === 'transferencia' ? solicitudTransferencia() : op === 'ajuste' ? solicitudCorreccion(e.db) : nuevaOperacion(op) };
}
const ESCRITORES_V1 = ['crearCuenta', 'crearCategoria', 'apertura', 'ingreso', 'gasto', 'transferencia', 'ajuste', 'reversion'];
for (const op of ESCRITORES_V1) {
  for (const estadoBloqueado of ['bloqueado', 'transicion', 'operativo_v2']) test('Protocolo ' + op + ': ' + estadoBloqueado + ' impide cualquier escritura', async () => {
    const e = await casoProtocolo(op);
    e.db.cambiar(RUTA_PROTOCOLO, { ...e.db.documentos.get(RUTA_PROTOCOLO), estado: estadoBloqueado });
    const antes = estado(e.db), n = e.db.escrituras;
    await assert.rejects(e.adaptador.ejecutar(e.entrada), codigo('PROTOCOLO_ESCRITURA_BLOQUEADA'));
    assert.deepEqual(estado(e.db), antes); assert.equal(e.db.escrituras, n);
  });
  test('Protocolo ' + op + ': confirmacion historica bajo bloqueo y posterior borrado', async () => {
    const e = await casoProtocolo(op), r = await e.adaptador.ejecutar(e.entrada);
    for (const p of [{ ...e.db.documentos.get(RUTA_PROTOCOLO), estado: 'bloqueado' }, null]) {
      e.db.cambiar(RUTA_PROTOCOLO, p); const antes = estado(e.db), n = e.db.escrituras;
      assert.deepEqual(await e.adaptador.ejecutar(e.entrada), { ...r, historica: true });
      assert.deepEqual(estado(e.db), antes); assert.equal(e.db.escrituras, n);
    }
  });
  test('Protocolo ' + op + ': borrar tras inicializacion no habilita bypass', async () => {
    const e = await casoProtocolo(op); e.db.cambiar(RUTA_PROTOCOLO, null); const antes = estado(e.db);
    await assert.rejects(e.adaptador.ejecutar(e.entrada), codigo('PROTOCOLO_AUSENTE'));
    assert.deepEqual(estado(e.db), antes);
  });
  test('Protocolo ' + op + ': bloqueo entre lectura y commit reintenta y rechaza', async () => {
    const e = await casoProtocolo(op), n = e.db.escrituras, intentos = e.db.intentos;
    e.db.antesCommit = d => d.cambiar(RUTA_PROTOCOLO, { ...d.documentos.get(RUTA_PROTOCOLO), estado: 'bloqueado' });
    await assert.rejects(e.adaptador.ejecutar(e.entrada), codigo('PROTOCOLO_ESCRITURA_BLOQUEADA'));
    assert.equal(e.db.escrituras, n); assert.equal(e.db.intentos - intentos, 2);
  });
}
for (const [campo, valor, error] of [
  ['estado', 'desconocido', 'PROTOCOLO_ESTADO_INVALIDO'],
  ['versionProtocolo', 2, 'PROTOCOLO_VERSION_INCOMPATIBLE'],
  ['epoca', 2, 'PROTOCOLO_EPOCA_INCOMPATIBLE'],
  ['epoca', null, 'PROTOCOLO_EPOCA_INCOMPATIBLE'],
  ['iglesiaId', 'otra', 'PROTOCOLO_IGLESIA_INCOHERENTE'],
]) test('Protocolo incompatible ' + campo + ': no escribe', async () => {
  const e = await casoProtocolo('gasto'); e.db.cambiar(RUTA_PROTOCOLO, { ...e.db.documentos.get(RUTA_PROTOCOLO), [campo]: valor });
  const antes = estado(e.db); await assert.rejects(e.adaptador.ejecutar(e.entrada), codigo(error)); assert.deepEqual(estado(e.db), antes);
});
test('Protocolo: documento de otra iglesia bloqueado no bloquea la propia', async () => {
  const e = await casoProtocolo('gasto');
  e.db.cambiar('iglesias/otra/finanzas_control/protocolo', { iglesiaId: 'otra', versionProtocolo: 1, epoca: 1, estado: 'bloqueado' });
  assert.equal((await e.adaptador.ejecutar(e.entrada)).historica, false);
});
