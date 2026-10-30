'use strict';
// Politica local revisada externamente. Nunca convierte un descriptor del llamador
// en acreditacion administrativa. No importa SDK ni modulos contables al cargar.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const raiz = path.resolve(__dirname, '../..');
const capacidades = new WeakMap();
const sha = b => createHash('sha256').update(b).digest('hex');
function fallo() { throw new Error('E_RUNTIME_NO_AUTORIZADO'); }
function comprobarUbicacion() {
  // El verificador administrativo excluye test/node_modules/contabilidad_demo.
  // Nunca acreditar este procedimiento si se traslado fuera del arbol cubierto.
  if (path.resolve(__dirname) !== path.join(raiz, 'functions', 'contabilidad_preparacion_v2_admin_demo')) fallo();
}
function exacto(o, claves) {
  if (!o || Object.getPrototypeOf(o) !== Object.prototype ||
      Object.keys(o).sort().join() !== [...claves].sort().join()) fallo();
}
function leer(ruta) {
  let actual = raiz;
  for (const segmento of ruta.split('/')) {
    actual = path.join(actual, segmento);
    if (fs.lstatSync(actual).isSymbolicLink()) fallo();
  }
  if (!fs.lstatSync(actual).isFile()) fallo();
  return fs.readFileSync(actual);
}
function actuales() {
  const rutas = [];
  function visitar(dir) {
    if (fs.lstatSync(dir).isSymbolicLink()) fallo();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === path.join(raiz, 'functions') && ['test', 'node_modules', 'contabilidad_demo'].includes(e.name)) continue;
      if (e.isSymbolicLink()) fallo();
      const r = path.join(dir, e.name);
      if (e.isDirectory()) visitar(r);
      else if (e.isFile() && e.name.endsWith('.js')) rutas.push(path.relative(raiz, r).replaceAll('\\', '/'));
    }
  }
  visitar(path.join(raiz, 'functions'));
  // Incluye todos los descriptores/registro actuales, sin buscar futuros ids.
  for (const n of ['entorno.js', 'fuentes.js', 'transicion.js', 'fuentes_v1.json',
    'inventarios/registro.json', 'inventarios/legado_1.json', 'inventarios/cambios_identidad_2.json',
    'inventarios/runtime_2.json', 'inventarios/runtime_3.json', 'inventarios/runtime_4.json', 'inventarios/runtime_5.json']) {
    rutas.push('functions/contabilidad_demo/' + n);
  }
  return rutas.sort();
}
function emitir(identidad, comprobar) {
  const capacidad = Object.freeze({});
  capacidades.set(capacidad, { identidad: Object.freeze(identidad), comprobar });
  return capacidad;
}
function autorizarEnsayo(opciones) {
  comprobarUbicacion();
  exacto(opciones, ['manifiesto', 'sha256Autorizado']);
  const { manifiesto, sha256Autorizado } = opciones;
  if (!Buffer.isBuffer(manifiesto) || !/^[a-f0-9]{64}$/.test(sha256Autorizado ?? '') || sha(manifiesto) !== sha256Autorizado) fallo();
  let m; try { m = JSON.parse(manifiesto); } catch { fallo(); }
  exacto(m, ['version', 'id', 'fuentes']);
  if (m.version !== 1 || m.id !== 'ensayo-fin-1H-1') fallo();
  if (!m.fuentes || Object.getPrototypeOf(m.fuentes) !== Object.prototype) fallo();
  const fuentes = { ...m.fuentes };
  function comprobar() {
    const rutas = actuales();
    if (JSON.stringify(rutas) !== JSON.stringify(Object.keys(fuentes).sort())) fallo();
    for (const r of rutas) {
      if (!/^[a-f0-9]{64}$/.test(fuentes[r]) || sha(leer(r)) !== fuentes[r]) fallo();
    }
  }
  comprobar();
  return emitir({ tipo: 'CANDIDATO_LOCAL_NO_ACREDITADO', inventarioId: m.id,
    versionContratoInventario: 1, huellaSoftware: sha256Autorizado,
    acreditacionAdministrativa: 'PENDIENTE' }, comprobar);
}
function autorizarAdministrativo(opciones) {
  comprobarUbicacion();
  exacto(opciones, ['inventarioId']);
  const { inventarioId } = opciones;
  if (typeof inventarioId !== 'string' || !/^admin-[1-9][0-9]*$/.test(inventarioId)) fallo();
  // Esta llamada verifica internamente registro, descriptor, TODO el arbol y
  // fuentes administrativas. Hoy admin-5 rechaza las adiciones de este modulo.
  const { obtenerContextoFuentes } = require('../contabilidad_demo/fuentes');
  for (const r of actuales()) leer(r);
  const c = obtenerContextoFuentes(inventarioId);
  function comprobar() {
    for (const r of actuales()) leer(r);
    const nuevo = obtenerContextoFuentes(inventarioId);
    if (nuevo.huellaSoftware !== c.huellaSoftware || nuevo.metadatos.inventarioId !== inventarioId ||
        nuevo.metadatos.versionContratoInventario !== 2) fallo();
  }
  comprobar();
  return emitir({ tipo: 'RUNTIME_ADMINISTRATIVO_VERIFICADO', inventarioId,
    versionContratoInventario: c.metadatos.versionContratoInventario,
    huellaSoftware: c.huellaSoftware, acreditacionAdministrativa: 'ACREDITADA' }, comprobar);
}
function exigirRuntime(capacidad, revalidar = false) {
  const c = capacidades.get(capacidad); if (!c) fallo();
  if (revalidar) c.comprobar();
  return c.identidad;
}
module.exports = Object.freeze({ autorizarEnsayo, autorizarAdministrativo, exigirRuntime });
