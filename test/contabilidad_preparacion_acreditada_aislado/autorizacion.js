'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { autorizarRuntime } = require('../../functions/contabilidad_preparacion_acreditada_demo/runtime');
// Fijado tras revision de las fuentes. No se calcula/actualiza al ejecutar.
const SHA256_AUTORIZADO = '53bd7e07dcfc36c746db5dfa0109945fe31121df272096fc23fa390ade4f36f9';
function autorizar() {
  const local = autorizarRuntime({ manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')),
    sha256Autorizado: SHA256_AUTORIZADO });
  // Acredita las fuentes actuales antes del SDK; NO convierte la capacidad local.
  require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-6');
  return local;
}
module.exports = Object.freeze({ autorizar, SHA256_AUTORIZADO });
