// Infraestructura DE PRUEBAS. Sin CLI, credenciales ni destino configurable.
const { verificarEntorno } = require('../desvinculacion_integracion/entorno');
verificarEntorno(); // Antes de cualquier SDK/import con capacidad de escritura.
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.join(__dirname, '../../functions/package.json'));
const { FieldPath, FieldValue } = req('firebase-admin/firestore');
const { clasificarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_plan');
const { simularPertenencias } = require('../../functions/migraciones/pertenencia_simulacion');
const { migrarPerfilPertenencia } = require('../../functions/migraciones/pertenencia_ejecucion');

function proteger(db) {
  verificarEntorno();
  // El SDK instalado normaliza host como servicePath/port; no conserva .host.
  if (db.projectId !== 'demo-fesync' || db._settings?.servicePath !== '127.0.0.1' ||
      db._settings?.port !== 8088 ||
      db._settings?.ssl !== false) throw new Error('Cliente de ensayo no autorizado.');
}
const version = (s) => `${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
function lector(db) {
  proteger(db);
  return Object.freeze({
    async listarPerfiles({ despuesDe, limite }) {
      let q = db.collection('usuarios_globales').orderBy(FieldPath.documentId()).limit(limite);
      if (despuesDe !== null) q = q.startAfter(despuesDe);
      return (await q.get()).docs.map((s) => ({ id: s.id, perfil: s.data(), version: version(s) }));
    },
    async leerPerfil(id) {
      const s = await db.collection('usuarios_globales').doc(id).get();
      return s.exists ? { perfil: s.data(), version: version(s) } : null;
    },
    async leerIglesia(id) {
      const s = await db.collection('iglesias').doc(id).get();
      return { id, existe: s.exists, adminUid: s.data()?.adminUid };
    },
  });
}
async function simular(db) {
  return simularPertenencias({ lector: lector(db), tamanoPagina: 2, maxPaginas: 30, maxPerfiles: 50 });
}
async function clasificar(db, s) {
  const entrada = { uid: s.id, perfil: s.data() };
  let c = clasificarPerfilPertenencia(entrada);
  if (c.motivo === 'iglesia_no_verificable') {
    entrada.iglesia = await lector(db).leerIglesia(entrada.perfil.iglesiaId);
    c = clasificarPerfilPertenencia(entrada);
  }
  return c;
}

const ocupados = new Set();
const metricasVacias = () => ({ procesados: 0, migrados: 0, omitidos: 0, revision: 0, conflictos: 0, errores: 0 });
/**
 * Solo demo-fesync. Una página de dos perfiles por invocación (memoria acotada).
 * Checkpoint privado en el propio emulador, nunca exportado en métricas.
 * Guarda la selección ANTES del motor. Si el proceso cae después del commit,
 * conserva esa selección exacta y la repite: no refresca versiones inciertas.
 * Cursor avanza SOLO después de un resultado sin error/conflicto confirmado.
 * Los contadores de un proceso no prueban commits: verificar los comprobantes.
 * Un coordinador por checkpoint; dos coordinadores usan checkpoints distintos.
 */
async function ejecutarLote(db, { corrida = 'principal', interrumpirTrasConfirmar = false } = {}) {
  proteger(db);
  if (!['principal', 'repaso', 'concurrente_a', 'concurrente_b'].includes(corrida) || ocupados.has(corrida)) {
    throw new Error('Coordinación de ensayo inválida.');
  }
  ocupados.add(corrida);
  try {
    const ref = db.collection('ensayos_pertenencia').doc(corrida);
    const previo = await ref.get();
    let punto = previo.exists ? previo.data() : { version: 1, cursor: null, pendiente: null, completa: false };
    if (punto.version !== 1 || typeof punto.completa !== 'boolean' ||
        (punto.cursor !== null && typeof punto.cursor !== 'string')) throw new Error('Checkpoint de ensayo inválido.');
    const metricas = metricasVacias();
    if (punto.completa) return { completa: true, interrumpida: false, metricas };
    let procesados = 0;
    while (procesados < 2) {
      if (!punto.pendiente) {
        let q = db.collection('usuarios_globales').orderBy(FieldPath.documentId()).limit(1);
        if (punto.cursor !== null) q = q.startAfter(punto.cursor);
        const pagina = await q.get();
        if (pagina.empty) {
          await ref.set({ ...punto, completa: true });
          return { completa: true, interrumpida: false, metricas };
        }
        const s = pagina.docs[0];
        const c = await clasificar(db, s);
        if (c.categoria !== 'candidato') {
          metricas.procesados++; metricas[c.categoria === 'revision' ? 'revision' : 'omitidos']++;
          punto = { ...punto, cursor: s.id };
          await ref.set(punto);
          procesados++;
          continue;
        }
        punto = { ...punto, pendiente: { uid: s.id, iglesiaId: s.data().iglesiaId, version: version(s) } };
        await ref.set(punto);
      }
      const r = await migrarPerfilPertenencia({ db, FieldValue, seleccion: punto.pendiente });
      for (const k of Object.keys(metricas)) metricas[k] += r.metricas[k];
      if (r.categoria === 'error' || r.categoria === 'conflicto') {
        // No adelantar el cursor ni cambiar la selección. Revisión explícita.
        return { completa: false, interrumpida: false, detenida: true, metricas };
      }
      if (interrumpirTrasConfirmar) return { completa: false, interrumpida: true, metricas };
      punto = { ...punto, cursor: punto.pendiente.uid, pendiente: null };
      await ref.set(punto);
      procesados++;
    }
    return { completa: false, interrumpida: false, metricas };
  } finally { ocupados.delete(corrida); }
}
async function completar(db, opciones = {}) {
  proteger(db);
  const metricas = metricasVacias();
  for (let lote = 0; lote < 30; lote++) {
    const r = await ejecutarLote(db, opciones);
    for (const k of Object.keys(metricas)) metricas[k] += r.metricas[k];
    if (r.completa || r.detenida || r.interrumpida) return { ...r, metricas, lotes: lote + 1 };
  }
  return { completa: false, limiteAlcanzado: true, metricas, lotes: 30 };
}
module.exports = { simular, ejecutarLote, completar, version };
