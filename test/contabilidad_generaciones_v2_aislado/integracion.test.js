'use strict';
require('../../functions/contabilidad_generaciones_v2_demo/entorno').verificarEntorno();
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const cliente = createRequire(path.join(__dirname, '../capacitaciones_rules/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { initializeTestEnvironment, assertFails } = cliente('@firebase/rules-unit-testing');
const { getDoc, setDoc, doc, setLogLevel } = cliente('firebase/firestore');
const { crearPreparadorDemo } = require('../../functions/contabilidad_generaciones_v2_demo/preparacion');
const { crearAdaptadorFirestoreV2 } = require('../../functions/finanzas_core/adaptador_firestore_v2');
const { crearAdaptadorFirestore } = require('../../functions/finanzas_core/adaptador_firestore');
const { proyectarMovimiento } = require('../../functions/finanzas_core/proyecciones');
const { crearGasto, calcularLibro } = require('../../functions/finanzas_core/asientos');
const { registroExacto } = require('../../functions/finanzas_core/dinero');
const { sembrar, parametros, foto, conservar, I, A, B } = require('./soporte');
const G = `${B}/finanzas_generaciones_demo/nueva_001`, R = `${B}/finanzas_preparaciones_v2_demo/preparacion_001`;
const error = c => e => e.codigo === c;
let db, reglas, operativo = false, semilla;
setLogLevel('silent');
before(async () => {
  // El padre inicio un emulador nuevo en puertos libres; este proceso conserva
  // custodia de su SDK y solo utiliza escritores auditados V1/V2/preparador.
  db = new Firestore({ projectId: 'demo-fesync', host: '127.0.0.1:8088', ssl: false,
    auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
  assert.equal(db._settings.servicePath, '127.0.0.1'); assert.equal(db._settings.ssl, false);
  reglas = await initializeTestEnvironment({ projectId: 'demo-fesync', firestore: { host: '127.0.0.1', port: 8088,
    rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
  operativo = true;
});
beforeEach(async () => { await reglas.clearFirestore(); semilla = await sembrar(db, FieldValue); });
after(async () => { operativo = false; if (reglas) await reglas.cleanup(); if (db) await db.terminate(); });
function api({ despues, despuesCommit, fallarEscritura, antesLectura } = {}) {
  const m = { intentos: 0, lecturas: 0, escrituras: 0, rutasEscritas: [] };
  const inyectado = { projectId: db.projectId, _settings: db._settings, doc: db.doc.bind(db), collection: db.collection.bind(db),
    runTransaction: async cb => {
      const r = await db.runTransaction(async tx => {
        m.intentos++; let escribiendo = false;
        const proxy = new Proxy(tx, { get(t, k) {
          if (k === 'get') return async referencia => {
            assert.equal(escribiendo, false, 'Lectura posterior a escritura'); m.lecturas++;
            if (antesLectura) await antesLectura(referencia, m);
            return t.get(referencia);
          };
          if (['create', 'update', 'set', 'delete'].includes(k)) return (...args) => {
            escribiendo = true; m.escrituras++; m.rutasEscritas.push(args[0].path);
            if (fallarEscritura) fallarEscritura(m); return t[k](...args);
          };
          const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
        } });
        const r = await cb(proxy); if (despues) await despues(m); return r;
      });
      if (despuesCommit) await despuesCommit(m); return r;
    } };
  return { ...crearPreparadorDemo({ db: inyectado, custodia: { verificar: () => operativo } }), m };
}
async function terminar(h = api(), p = parametros()) {
  let r = await h.iniciar(p);
  for (let n = 0; n < 100 && !['preparada', 'fallida'].includes(r.estado); n++) r = await h.avanzar(p, r.fence);
  assert.ok(['preparada', 'fallida'].includes(r.estado)); return r;
}
async function hastaPreparando(h, p) {
  let r = await h.iniciar(p);
  while (r.estado === 'conciliando') r = await h.avanzar(p, r.fence);
  assert.equal(r.estado, 'preparando'); return r;
}
test('libro mixto: salida exacta, secuencias/referencias y D2/V1 preservados con SDK real', async () => {
  const antes = await foto(db), h = api(), r = await terminar(h);
  assert.equal(r.estado, 'preparada'); assert.equal(r.acreditacion, 'PENDIENTE');
  await conservar(db, antes);
  const cabecera = (await db.doc(G).get()).data();
  registroExacto(cabecera, ['versionEsquema', 'iglesiaId', 'epoca', 'generacionId', 'contrato', 'activa']);
  assert.equal(cabecera.activa, false); assert.equal(cabecera.contrato, 'gastos_v2_aislado_1');
  const ctl = (await db.doc(`${G}/control/libro`).get()).data();
  const saldo = (await db.doc(`${G}/saldos/${semilla.caja}`).get()).data();
  const banco = (await db.doc(`${G}/saldos/${semilla.banco}`).get()).data();
  const global = (await db.doc(`${G}/consolidados/CLP`).get()).data();
  const periodo = (await db.doc(`${G}/periodos/2026-11`).get()).data();
  const docs = (await db.collection(`${B}/finanzas_movimientos`).orderBy('secuencia').get()).docs;
  const movimientos = docs.map(d => d.data().movimiento), cfg = { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' };
  const cuentas = [semilla.caja, semilla.banco].map(id => ({ id, moneda: 'CLP', escala: 0 }));
  const libro = calcularLibro({ movimientos, cuentas, configuracion: cfg, periodoId: '2026-11' });
  assert.equal(ctl.revision, docs.length); assert.equal(ctl.ultimoMovimientoId, docs.at(-1).id);
  assert.equal(saldo.proyeccion.saldoMinor, libro.saldoFinalPorCuenta[semilla.caja]);
  assert.equal(banco.proyeccion.saldoMinor, libro.saldoFinalPorCuenta[semilla.banco]);
  assert.equal(global.datos.saldoFinalMinor, libro.saldoFinalMinor);
  assert.equal(periodo.datos.gastosNetosMinor, -1000); assert.equal(periodo.datos.resultadoMinor, 1000);
  const ultimoBanco = docs.filter(d => d.data().movimiento.asientos.some(a => a.cuentaId === semilla.banco)).at(-1);
  assert.equal(banco.proyeccion.revision, ultimoBanco.data().secuencia);
  assert.equal(banco.proyeccion.ultimoMovimientoId, ultimoBanco.id);
  assert.equal((await db.doc(`${B}/finanzas_control/generacion_v2`).get()).exists, false);
  assert.equal((await db.doc(`${B}/finanzas_control/protocolo`).get()).data().estado, 'bloqueado');
  assert.ok(h.m.rutasEscritas.every(r => r.startsWith(G) || r.startsWith(`${B}/finanzas_preparaciones_v2_`)));
  const salida = JSON.stringify((await db.doc(R).get()).data());
  assert.equal(salida.includes('Persona ficticia privada'), false); assert.equal(salida.includes(A), false);
  assert.equal(salida.includes('admin-4'), false);
});
test('libro vacio: cero/null demostrados, sin resumen V1 fabricado y sin activar', async () => {
  await reglas.clearFirestore(); await sembrar(db, FieldValue, false); const antes = await foto(db);
  assert.equal((await terminar()).estado, 'preparada'); await conservar(db, antes);
  const c = (await db.doc(`${G}/control/libro`).get()).data();
  assert.equal(c.revision, 0); assert.equal(c.ultimoMovimientoId, null);
  assert.equal((await db.doc(`${G}/consolidados/CLP`).get()).data().datos.saldoFinalMinor, 0);
  assert.equal((await db.collection(`${B}/finanzas_resumenes`).get()).empty, true);
});
test('reversas de ingreso, gasto y transferencia entre periodos coinciden con FIN-2', async () => {
  await reglas.clearFirestore(); semilla = await sembrar(db, FieldValue, true, ['gasto', 'ingreso', 'transferencia']);
  assert.equal((await terminar()).estado, 'preparada');
  const s = (await db.doc(`${G}/periodos/2026-11`).get()).data().datos;
  assert.equal(s.ingresosNetosMinor, -2000); assert.equal(s.gastosNetosMinor, -1000); assert.equal(s.resultadoMinor, -1000);
});
test('el escritor sigue rechazando; lectura SDK y propuesta pura validan el esquema sin activacion', async () => {
  await terminar();
  const e = await semilla.solicitud('gasto', { cuentaId: semilla.caja, categoriaId: semilla.gasto, montoMinor: 1 }, '2026-11');
  e.contextoV2 = { versionContrato: 1, epoca: 1, generacionId: 'nueva_001' };
  const antes = await foto(db);
  await assert.rejects(crearAdaptadorFirestoreV2({ db, FieldValue }).ejecutar(e), error('PROTOCOLO_V2_INCOMPATIBLE'));
  const ctl = (await db.doc(`${G}/control/libro`).get()).data(), g = (await db.doc(`${G}/consolidados/CLP`).get()).data();
  const p = (await db.doc(`${G}/periodos/2026-11`).get()).data(), s = (await db.doc(`${G}/saldos/${semilla.caja}`).get()).data();
  const configuracion = { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' };
  const propuesta = proyectarMovimiento({ estadoAnterior: { versionEsquema: 1, iglesiaId: I, configuracion,
    revision: ctl.revision, ultimoMovimientoId: ctl.ultimoMovimientoId, acumulado: g.datos, periodo: p.datos },
  cuentasAnteriores: [s.proyeccion], original: null, movimiento: crearGasto({ id: 'propuesta_no_persistida',
    cuenta: { id: semilla.caja, moneda: 'CLP', escala: 0 }, montoMinor: 1, fechaContable: '2026-11-18', periodoId: '2026-11' }),
  aplicacion: { revisionAnterior: ctl.revision, revisionNueva: ctl.revision + 1, movimientoId: 'propuesta_no_persistida' } });
  assert.equal(propuesta.cuentas[0].saldoMinor, s.proyeccion.saldoMinor - 1);
  assert.deepEqual(await foto(db), antes);
});
for (const tipo of ['saldo', 'resumen', 'marcador']) test('corrupcion previa ' + tipo + ': conserva evidencia, nunca preparada', async () => {
  if (tipo === 'saldo') await db.doc(`${B}/finanzas_saldos/${semilla.caja}`).update({ saldoMinor: 777 });
  else if (tipo === 'resumen') await db.doc(`${B}/finanzas_resumenes/2026-11`).update({ 'datos.resultadoMinor': 777 });
  else await db.doc(`${B}/finanzas_reversiones/${semilla.originales.gasto}`).update({ reversionId: 'falsificado' });
  const antes = await foto(db), r = await terminar();
  assert.equal(r.estado, 'fallida'); assert.equal(r.error, 'PREP_CONCILIACION_RECHAZADA'); await conservar(db, antes);
});
test('movimiento ausente y su recibo no se reparan', async () => {
  await db.doc(`${B}/finanzas_movimientos/${semilla.originales.gasto}`).delete(); const antes = await foto(db);
  await assert.rejects(api().iniciar(parametros()), error('PREP_HISTORIAL_INCOMPLETO')); assert.deepEqual(await foto(db), antes);
});
test('solicitudes inciertas no se sustituyen por cero', async () => {
  await db.doc(`${B}/finanzas_saldos/${semilla.caja}`).update({ solicitudesInciertas: 1 });
  await assert.rejects(api().iniciar(parametros()), error('PREP_SOLICITUDES_INCIERTAS'));
});
for (const cambio of [{ iglesiaId: 'otra' }, { epoca: 2 }]) test('ejecucion modificada rechaza: ' + Object.keys(cambio)[0], async () => {
  const h = api(), p = parametros(); const r = await h.iniciar(p); await db.doc(R).update(cambio);
  const antes = await foto(db); await assert.rejects(h.avanzar(p, r.fence), error('PREP_EJECUCION_INCOHERENTE'));
  assert.deepEqual(await foto(db), antes);
});
test('checkpoint manipulado no se adopta ni se confirma', async () => {
  const h = api(), p = parametros(); let r = await h.iniciar(p); r = await h.avanzar(p, r.fence);
  const e = (await db.doc(R).get()).data(); const cp = structuredClone(e.checkpoint); cp.cursor.secuencia++;
  await db.doc(R).update({ checkpoint: cp }); r = await h.avanzar(p, r.fence);
  assert.equal(r.estado, 'fallida'); assert.equal(r.error, 'PREP_CHECKPOINT_INVALIDO');
  const final = (await db.doc(R).get()).data(); assert.deepEqual(final.checkpoint, cp);
});
test('dos operadores no toman propiedad del otro', async () => {
  const p = parametros(), q = parametros({ operador: 'c'.repeat(64) });
  const rs = await Promise.allSettled([api().iniciar(p), api().iniciar(q)]);
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(rs.filter(r => r.status === 'rejected').length, 1);
});
test('dos ejecutores del mismo fence avanzan una sola pagina', async () => {
  const p = parametros(), r = await api().iniciar(p);
  const rs = await Promise.all([api().avanzar(p, r.fence), api().avanzar(p, r.fence)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].fence, 1);
  assert.equal((await db.doc(R).get()).data().checkpoint.documentos.length, 2);
});
for (const fase of ['pagina', 'lote']) test('respuesta perdida despues de commit ' + fase + ': mismo fence sin duplicados', async () => {
  const p = parametros(), normal = api(); const r = fase === 'pagina' ? await normal.iniciar(p) : await hastaPreparando(normal, p);
  const perdido = api({ despuesCommit: () => { throw Error('Respuesta perdida simulada'); } });
  await assert.rejects(perdido.avanzar(p, r.fence), error('PREP_RESULTADO_INCIERTO'));
  const antes = await foto(db), recuperado = await api().avanzar(p, r.fence);
  assert.equal(recuperado.fence, r.fence + 1); assert.deepEqual(await foto(db), antes);
});
test('fallo antes de commit no deja documentos parciales y reiniciar conserva identidad', async () => {
  const p = parametros(), r = await hastaPreparando(api(), p), antes = await foto(db);
  const h = api({ fallarEscritura: m => { if (m.escrituras === 2) throw Error('Fallo de prueba'); } });
  await assert.rejects(h.avanzar(p, r.fence), error('PREP_RESULTADO_INCIERTO')); assert.deepEqual(await foto(db), antes);
  assert.equal((await terminar(api(), p)).estado, 'preparada');
});
test('ABORTED simulado reintenta callback SDK sin repetir lote', async () => {
  const p = parametros(), r = await hastaPreparando(api(), p);
  const h = api({ despues: m => { if (m.intentos === 1) { const e = Error('ABORTED'); e.code = 10; throw e; } } });
  const rr = await h.avanzar(p, r.fence); assert.equal(rr.fence, r.fence + 1); assert.equal(h.m.intentos, 2);
});
test('destino incompleto no puede quedar preparado ni activo', async () => {
  const h = api(), p = parametros(); let r = await hastaPreparando(h, p); r = await h.avanzar(p, r.fence);
  await db.doc(`${G}/control/libro`).delete(); r = await h.avanzar(p, r.fence);
  assert.equal(r.estado, 'fallida'); assert.equal(r.error, 'PREP_DESTINO_DIVERGENTE');
  assert.equal((await db.doc(G).get()).data().activa, false);
});
test('coleccion destino inesperada se rechaza', async () => {
  const h = api(), p = parametros(), r = await h.iniciar(p);
  await db.doc(`${G}/extra/ajena`).set({ dato: 'ficticio' });
  await assert.rejects(h.avanzar(p, r.fence), error('PREP_DESTINO_EXTRA'));
});
test('cambio de fuente durante pausa conserva bloqueo y registra divergencia', async () => {
  const h = api(), p = parametros(), r = await h.iniciar(p);
  await db.doc(`${B}/finanzas_cuentas/${semilla.caja}`).update({ auxiliar: 'Cambio ficticio' });
  const rr = await h.avanzar(p, r.fence); assert.equal(rr.estado, 'fallida'); assert.equal(rr.error, 'PREP_FUENTE_CAMBIO');
});
test('estado operativo_v2 rechazado sin crear preparacion ni cambiar historicos', async () => {
  await db.doc(`${B}/finanzas_control/protocolo`).update({ estado: 'operativo_v2' }); const antes = await foto(db);
  await assert.rejects(api().iniciar(parametros()), error('PREP_BLOQUEO_REQUERIDO')); assert.deepEqual(await foto(db), antes);
});
test('perdida de custodia bloquea nuevas acciones', async () => {
  const h = api(), p = parametros(); const r = await h.iniciar(p); operativo = false;
  try { await assert.rejects(h.avanzar(p, r.fence), error('PREP_EXCLUSION_NO_CONFIRMADA')); } finally { operativo = true; }
});
test('V1 y V2 no pueden escribir contabilidad nueva bajo el bloqueo', async () => {
  const e = await semilla.solicitud('gasto', { cuentaId: semilla.caja, categoriaId: semilla.gasto, montoMinor: 1 }, '2026-11');
  const antes = await foto(db);
  await assert.rejects(crearAdaptadorFirestore({ db, FieldValue }).ejecutar(e), error('PROTOCOLO_ESCRITURA_BLOQUEADA'));
  e.contextoV2 = { versionContrato: 1, epoca: 1, generacionId: 'nueva_001' };
  await assert.rejects(crearAdaptadorFirestoreV2({ db, FieldValue }).ejecutar(e), error('PROTOCOLO_V2_INCOMPATIBLE'));
  assert.deepEqual(await foto(db), antes);
});
test('aislamiento de iglesia y destinos D2 no se sobrescriben', async () => {
  const antes = await foto(db);
  await assert.rejects(api().iniciar(parametros({ iglesiaId: 'otra' })), error('PREP_BLOQUEO_REQUERIDO'));
  await assert.rejects(api().iniciar(parametros({ generacionId: 'd2_original' })), error('PREP_DESTINO_OCUPADO'));
  assert.deepEqual(await foto(db), antes);
});
test('rutas privadas SDK y ausencia de informacion personal en resultado', async () => {
  const r = await terminar(), cliente = reglas.authenticatedContext(A).firestore();
  for (const ruta of [G, R, `${G}/control/libro`, `${B}/finanzas_preparaciones_v2_control/cerrojo`]) {
    await assertFails(getDoc(doc(cliente, ruta))); await assertFails(setDoc(doc(cliente, ruta), { falsificado: true }));
  }
  assert.deepEqual(Object.keys(r).sort(), ['acreditacion', 'activa', 'error', 'estado', 'fence', 'preparados']);
});
test('iniciar tras commit con respuesta perdida recupera la misma ejecucion sin escribir', async () => {
  const p = parametros();
  await assert.rejects(api({ despuesCommit: () => { throw Error('Respuesta perdida'); } }).iniciar(p), error('PREP_RESULTADO_INCIERTO'));
  const antes = await foto(db), r = await api().iniciar(p);
  assert.equal(r.fence, 0); assert.deepEqual(await foto(db), antes);
});
test('repeticion de generacion preparada valida documentos y no escribe', async () => {
  const p = parametros(), h = api(), r = await terminar(h, p), antes = await foto(db);
  assert.deepEqual(await h.iniciar(p), r); assert.deepEqual(await h.avanzar(p, r.fence), r);
  assert.deepEqual(await h.avanzar(p, r.fence - 1), r); assert.deepEqual(await foto(db), antes);
});
test('una reconsulta nunca ratifica preparada si un documento desaparecio', async () => {
  const p = parametros(), h = api(), r = await terminar(h, p);
  await db.doc(`${G}/control/libro`).delete();
  await assert.rejects(h.iniciar(p), error('PREP_DESTINO_DIVERGENTE'));
  const rr = await h.avanzar(p, r.fence); assert.equal(rr.estado, 'fallida');
  assert.equal((await db.doc(G).get()).data().activa, false);
});
test('etiqueta preparada falsificada no sustituye verificacion completa', async () => {
  const p = parametros(), h = api(), r = await hastaPreparando(h, p);
  await db.doc(R).update({ estado: 'preparada' });
  await assert.rejects(h.iniciar(p), error('PREP_DESTINO_INCOHERENTE'));
  assert.equal((await h.avanzar(p, r.fence)).estado, 'fallida');
});
test('cambio de parametros no abandona ni reemplaza la intencion original', async () => {
  const p = parametros(); await api().iniciar(p); const antes = await foto(db);
  await assert.rejects(api().iniciar({ ...p, lote: 3 }), error('PREP_EJECUCION_INCOHERENTE'));
  assert.deepEqual(await foto(db), antes);
});
test('checkpoint con contexto de otra iglesia es evidencia fallida', async () => {
  const p = parametros(), h = api(); let r = await h.iniciar(p); r = await h.avanzar(p, r.fence);
  const cp = (await db.doc(R).get()).data().checkpoint; cp.contexto.iglesiaId = 'otra';
  await db.doc(R).update({ checkpoint: cp });
  const rr = await h.avanzar(p, r.fence); assert.equal(rr.estado, 'fallida'); assert.equal(rr.error, 'PREP_CHECKPOINT_INVALIDO');
});
test('alteracion D2 durante pausa no se sobreescribe y detiene preparacion', async () => {
  const p = parametros(), h = api(), r = await h.iniciar(p), d2 = db.doc(`${B}/finanzas_ejecuciones_demo/d2_original`);
  await d2.update({ evidencia: 'Cambio ficticio' }); const antes = await d2.get();
  assert.equal((await h.avanzar(p, r.fence)).estado, 'fallida');
  const despues = await d2.get(); assert.deepEqual(despues.data(), antes.data()); assert.ok(despues.updateTime.isEqual(antes.updateTime));
});
