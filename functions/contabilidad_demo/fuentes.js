'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { exigir, registroExacto } = require('../finanzas_core/dinero');

// Raiz reproducible mediante bytes originales, no lista arbitraria de hashes.
const HUELLA_LEGADO = '76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d';
// Nueve sustituciones de identidad revisadas y reproducibles. Un descriptor
// no puede acreditar otro parche limitandose a actualizar sus propios hashes.
const CONTRATO_IDENTIDAD_2 = 'bd3462bb12e9e6197235868f39a54e6d6b272e0e69f3cf4aefb18881d46b0d95';
const DIRECTORIO = path.join(__dirname, 'inventarios');
const sha = v => createHash('sha256').update(v).digest('hex');
const mismo = (a, b) => isDeepStrictEqual(Object.entries(a).sort(), Object.entries(b).sort());
const lf = v => v.toString('utf8').replace(/\r\n/g, '\n');
function leer(ruta) {
  exigir(!fs.lstatSync(ruta).isSymbolicLink(), 'DEMO_FUENTES_NO_ACREDITADAS');
  return fs.readFileSync(ruta);
}
function json(ruta) { return JSON.parse(leer(ruta).toString('utf8')); }
function mapaHuellas(m) {
  registroExacto(m, Object.keys(m));
  for (const [ruta, h] of Object.entries(m)) exigir(typeof h === 'string' && /^[a-f0-9]{64}$/.test(h) &&
    /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.js$/.test(ruta) && !ruta.startsWith('test/') &&
    !ruta.startsWith('node_modules/') && !ruta.startsWith('contabilidad_demo/'), 'DEMO_INVENTARIO_INVALIDO');
}
function actuales() {
  const raiz = path.resolve(__dirname, '..'), resultado = {};
  function visitar(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === raiz && ['test', 'node_modules', 'contabilidad_demo'].includes(entrada.name)) continue;
      exigir(!entrada.isSymbolicLink(), 'DEMO_FUENTES_NO_ACREDITADAS');
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory()) visitar(ruta);
      else if (entrada.isFile() && entrada.name.endsWith('.js')) resultado[path.relative(raiz, ruta).replaceAll('\\', '/')] = sha(leer(ruta));
    }
  }
  visitar(raiz); return resultado;
}
function obtenerContextoFuentes(inventarioId) {
  const registro = json(path.join(DIRECTORIO, 'registro.json'));
  registroExacto(registro, ['versionEsquema', 'actual', 'acreditados', 'pendientes']);
  exigir(registro.versionEsquema === 1, 'DEMO_INVENTARIO_INVALIDO');
  const seleccionado = inventarioId ?? registro.actual;
  exigir(typeof seleccionado === 'string' && Object.hasOwn(registro.acreditados, seleccionado), 'DEMO_INVENTARIO_DESCONOCIDO');
  const baseBytes = leer(path.join(__dirname, 'fuentes_v1.json')), base = JSON.parse(baseBytes.toString('utf8'));
  mapaHuellas(base);
  const historicoBytes = leer(path.join(DIRECTORIO, 'legado_1.json')), historico = JSON.parse(historicoBytes.toString('utf8'));
  registroExacto(historico, ['id', 'versionEsquema', 'huellaSoftware', 'sha256Inventario', 'archivos']);
  registroExacto(historico.archivos, ['fuentes.js', 'transicion.js', 'entorno.js']);
  const originales = Object.fromEntries(Object.entries(historico.archivos).map(([r, b]) => [r, Buffer.from(b, 'base64')]));
  const calculada = createHash('sha256').update(JSON.stringify(base)).update(originales['transicion.js'])
    .update(originales['entorno.js']).update(originales['fuentes.js']).digest('hex');
  exigir(historico.id === 'legado-1' && historico.versionEsquema === 1 && historico.sha256Inventario === sha(baseBytes) &&
    calculada === HUELLA_LEGADO && historico.huellaSoftware === calculada, 'DEMO_HISTORICO_NO_ACREDITADO');
  const administrativos = Object.fromEntries(['fuentes.js', 'transicion.js', 'entorno.js'].map(r => [r, leer(path.join(__dirname, r))]));
  const nombresAdmin = fs.readdirSync(__dirname).filter(r => r.endsWith('.js')).sort();
  exigir(isDeepStrictEqual(nombresAdmin, Object.keys(administrativos).sort()), 'DEMO_RUNTIME_NO_ACREDITADO');

  const cargar = id => {
    exigir(Object.hasOwn(registro.acreditados, id), 'DEMO_INVENTARIO_DESCONOCIDO');
    const entrada = registro.acreditados[id]; registroExacto(entrada, ['archivo', 'sha256']);
    exigir(/^[a-z0-9_]+\.json$/.test(entrada.archivo), 'DEMO_INVENTARIO_INVALIDO');
    const bytes = leer(path.join(DIRECTORIO, entrada.archivo));
    exigir(sha(bytes) === entrada.sha256, 'DEMO_INVENTARIO_ALTERADO');
    const d = JSON.parse(bytes.toString('utf8'));
    registroExacto(d, ['id', 'versionContratoInventario', 'contrato', 'sha256InventarioBase', 'sha256Historico',
      'administrativos', 'adicionales', 'compatibles', 'sha256CambiosIdentidad']);
    exigir(d.id === id && d.versionContratoInventario === 2 && d.contrato === 'identidad-2-economia-1' &&
      d.sha256InventarioBase === sha(baseBytes) && d.sha256Historico === sha(historicoBytes), 'DEMO_CONTRATO_INCOMPATIBLE');
    registroExacto(d.administrativos, Object.keys(administrativos));
    exigir(Object.keys(administrativos).every(r => sha(administrativos[r]) === d.administrativos[r]), 'DEMO_RUNTIME_NO_ACREDITADO');
    mapaHuellas(d.adicionales);
    exigir(Object.keys(d.adicionales).every(r => !Object.hasOwn(base, r)), 'DEMO_INVENTARIO_INVALIDO');
    const cambiosBytes = leer(path.join(DIRECTORIO, 'cambios_identidad_2.json'));
    exigir(d.sha256CambiosIdentidad === CONTRATO_IDENTIDAD_2 && sha(cambiosBytes) === CONTRATO_IDENTIDAD_2,
      'DEMO_CONTRATO_INCOMPATIBLE');
    let esperado = lf(originales['transicion.js']);
    const cambios = JSON.parse(cambiosBytes.toString('utf8'));
    exigir(Array.isArray(cambios) && cambios.length === 9, 'DEMO_CONTRATO_INCOMPATIBLE');
    for (const par of cambios) {
      exigir(Array.isArray(par) && par.length === 2 && par.every(v => typeof v === 'string') &&
        esperado.split(par[0]).length === 2, 'DEMO_CONTRATO_INCOMPATIBLE');
      esperado = esperado.replace(par[0], par[1]);
    }
    exigir(esperado === lf(administrativos['transicion.js']) &&
      administrativos['entorno.js'].equals(originales['entorno.js']), 'DEMO_CONTRATO_INCOMPATIBLE');
    exigir(Array.isArray(d.compatibles) && new Set(d.compatibles).size === d.compatibles.length &&
      !d.compatibles.includes(id), 'DEMO_CONTRATO_INCOMPATIBLE');
    const h = createHash('sha256').update('fesync-inventario-runtime-2\0').update(bytes);
    for (const r of Object.keys(administrativos).sort()) h.update(administrativos[r]);
    return { descriptor: d, esperadas: { ...base, ...d.adicionales }, huellaSoftware: h.digest('hex') };
  };
  const runtime = cargar(seleccionado);
  exigir(mismo(actuales(), runtime.esperadas), 'DEMO_FUENTES_NO_ACREDITADAS');
  const aceptadas = new Map([[seleccionado, runtime.huellaSoftware]]);
  let aceptaLegado = false;
  for (const id of runtime.descriptor.compatibles) {
    if (id === 'legado-1') { aceptaLegado = true; continue; }
    const anterior = cargar(id);
    // No basta el subconjunto: TODO el codigo actual ya se valido contra un
    // inventario exacto y las adiciones tambien estan acreditadas en el.
    exigir(Object.entries(anterior.esperadas).every(([r, h]) => runtime.esperadas[r] === h), 'DEMO_CONTRATO_INCOMPATIBLE');
    aceptadas.set(id, anterior.huellaSoftware);
  }
  function comprobarEjecucion(e, g, contexto) {
    exigir(e && g && e.versionEsquema === 1 && g.versionEsquema === 2 && e.versionProcedimiento === 1 &&
      g.versionProcedimiento === 1 && e.versionAlgoritmo === 1 && g.versionAlgoritmo === 1 &&
      e.iglesiaId === contexto.iglesiaId && e.ejecucionId === contexto.ejecucionId &&
      e.epoca === 1 && g.epoca === 1 && g.activa === false, 'DEMO_IDENTIDAD_NO_COMPATIBLE');
    const campos = ['inventarioId', 'versionContratoInventario'];
    const sinEtiquetas = campos.every(k => !Object.hasOwn(e, k) && !Object.hasOwn(g, k));
    if (sinEtiquetas) {
      exigir(aceptaLegado && e.huellaSoftware === HUELLA_LEGADO && g.huellaSoftware === HUELLA_LEGADO, 'DEMO_IDENTIDAD_NO_COMPATIBLE');
      return;
    }
    exigir(campos.every(k => Object.hasOwn(e, k) && Object.hasOwn(g, k)) &&
      e.inventarioId === g.inventarioId && e.versionContratoInventario === 2 && g.versionContratoInventario === 2 &&
      aceptadas.has(e.inventarioId) && e.huellaSoftware === aceptadas.get(e.inventarioId) &&
      g.huellaSoftware === e.huellaSoftware, 'DEMO_IDENTIDAD_NO_COMPATIBLE');
  }
  return Object.freeze({ huellaSoftware: runtime.huellaSoftware, identidadHistorica: HUELLA_LEGADO,
    metadatos: Object.freeze({ inventarioId: seleccionado, versionContratoInventario: 2 }), comprobarEjecucion });
}
function verificarFuentes(inventarioId) { return obtenerContextoFuentes(inventarioId).huellaSoftware; }
module.exports = Object.freeze({ verificarFuentes, obtenerContextoFuentes });
