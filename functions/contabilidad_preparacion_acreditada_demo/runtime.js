'use strict';
// La politica pertenece al ejecutor de confianza. No hay registro ni aprobacion
// automatica: un digest independiente debe fijar el manifiesto ANTES de ejecutar.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const capacidades = new WeakMap();
const raiz = path.resolve(__dirname, '../..');
const sha = b => createHash('sha256').update(b).digest('hex');
function fallo() { throw new Error('E_RUNTIME_NO_AUTORIZADO'); }
function actuales() {
  const rutas = [];
  function visitar(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === path.join(raiz, 'functions') && ['node_modules', 'test', 'contabilidad_demo'].includes(e.name)) continue;
      if (e.isSymbolicLink()) fallo();
      const r = path.join(dir, e.name);
      if (e.isDirectory()) visitar(r);
      else if (e.isFile() && e.name.endsWith('.js')) rutas.push(path.relative(raiz, r).replaceAll('\\', '/'));
    }
  }
  visitar(path.join(raiz, 'functions'));
  for (const n of ['fuentes.js', 'transicion.js', 'entorno.js', 'fuentes_v1.json',
    'inventarios/registro.json', 'inventarios/runtime_2.json', 'inventarios/runtime_3.json',
    'inventarios/runtime_4.json', 'inventarios/legado_1.json', 'inventarios/cambios_identidad_2.json']) {
    rutas.push(`functions/contabilidad_demo/${n}`);
  }
  return rutas.sort();
}
function autorizarRuntime({ manifiesto, sha256Autorizado } = {}) {
  if (!Buffer.isBuffer(manifiesto) || !/^[a-f0-9]{64}$/.test(sha256Autorizado ?? '') ||
      sha(manifiesto) !== sha256Autorizado) fallo();
  let m; try { m = JSON.parse(manifiesto); } catch { fallo(); }
  if (m.version !== 1 || m.id !== 'ensayo-fin-1E-1' || !m.fuentes ||
      Object.keys(m).sort().join() !== 'fuentes,id,version') fallo();
  const copia = JSON.parse(JSON.stringify(m));
  function comprobar() {
    const rutas = actuales();
    if (JSON.stringify(rutas) !== JSON.stringify(Object.keys(copia.fuentes).sort())) fallo();
    for (const r of rutas) {
      const absoluto = path.join(raiz, r);
      if (fs.lstatSync(absoluto).isSymbolicLink() || !/^[a-f0-9]{64}$/.test(copia.fuentes[r]) ||
          sha(fs.readFileSync(absoluto)) !== copia.fuentes[r]) fallo();
    }
  }
  comprobar();
  const identidad = Object.freeze({ tipo: 'ENSAYO_LOCAL_FIJADO', inventarioId: m.id,
    versionContratoInventario: 1, huellaSoftware: sha256Autorizado,
    inventarioCandidato: 'admin-5', acreditacionAdministrativa: 'PENDIENTE' });
  const capacidad = Object.freeze({});
  capacidades.set(capacidad, { identidad, comprobar });
  return capacidad;
}
function exigirRuntime(capacidad, revalidar = false) {
  const c = capacidades.get(capacidad); if (!c) fallo();
  if (revalidar) c.comprobar();
  return c.identidad;
}
module.exports = Object.freeze({ autorizarRuntime, exigirRuntime });
