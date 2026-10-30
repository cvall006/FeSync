'use strict';
// Fixture de prueba: nunca autoriza el árbol de publicación como runtime antiguo.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto');
const sha = b => createHash('sha256').update(b).digest('hex');
const actual = path.resolve(__dirname, '../..');
let fixture;

function cargarHistorico() {
  if (fixture) return fixture;
  const admin = path.join(actual, 'contabilidad_demo');
  const base = JSON.parse(fs.readFileSync(path.join(admin, 'fuentes_v1.json')));
  const descriptor = JSON.parse(fs.readFileSync(path.join(admin, 'inventarios/runtime_6.json')));
  const fuentes = { ...base, ...descriptor.adicionales,
    ...Object.fromEntries(Object.entries(descriptor.administrativos).map(([p,h])=>['contabilidad_demo/'+p,h])) };
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'fesync-runtime-historico-'));
  const raiz = path.join(temporal, 'functions');
  function escribir(p, bytes) {
    const destino = path.resolve(raiz,p);
    if (!destino.startsWith(raiz + path.sep)) throw Error('RUTA_HISTORICA_INVALIDA');
    fs.mkdirSync(path.dirname(destino), { recursive:true }); fs.writeFileSync(destino,bytes);
  }
  for (const [p,h] of Object.entries(fuentes)) {
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.js$/.test(p)) throw Error('RUTA_HISTORICA_INVALIDA');
    const origen = p === 'index.js' ? path.join(__dirname, '../fixtures/index_admin6.js.txt') : path.join(actual,p);
    if(fs.lstatSync(origen).isSymbolicLink()) throw Error('FUENTE_HISTORICA_INVALIDA');
    const bytes = fs.readFileSync(origen);
    if(sha(bytes) !== h) throw Error(`FUENTE_HISTORICA_DIVERGENTE: ${p}`);
    escribir(p,bytes);
  }
  escribir('contabilidad_demo/fuentes_v1.json',fs.readFileSync(path.join(admin,'fuentes_v1.json')));
  for(const e of fs.readdirSync(path.join(admin,'inventarios'),{withFileTypes:true})) {
    if(e.isSymbolicLink()) throw Error('FUENTE_HISTORICA_INVALIDA');
    if(e.isFile() && e.name.endsWith('.json')) escribir('contabilidad_demo/inventarios/'+e.name,
      fs.readFileSync(path.join(admin,'inventarios',e.name)));
  }
  // Verificador y política originales, sin parches, sin sustituir fs y sin
  // un inventario nuevo: deben validar el conjunto exacto e identidad originales.
  const fuentesHistoricas = require(path.join(raiz,'contabilidad_demo/fuentes.js'));
  const identidad = fuentesHistoricas.obtenerContextoFuentes('admin-6');
  if(identidad.huellaSoftware !== '16d281e09313a4a6f80f37b4d686d70fa5135e1e43e120ed91923bf5393b92e1') {
    throw Error('IDENTIDAD_HISTORICA_DIVERGENTE');
  }
  fixture = Object.freeze({ raiz, DIR:path.join(raiz,'contabilidad_demo'), identidad,
    cargar:p=>require(path.join(raiz,p)) });
  return fixture;
}
module.exports = { cargarHistorico };
