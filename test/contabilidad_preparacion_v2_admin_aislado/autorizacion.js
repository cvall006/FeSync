'use strict';
const fs = require('node:fs'), path = require('node:path');
const { autorizarEnsayo } = require('../../functions/contabilidad_preparacion_v2_admin_demo/runtime');
// Politica local fijada tras revision; no se genera ni aprueba al ejecutar.
const SHA256_AUTORIZADO = 'de8a20aa719e3f06f0f4a37e89cf4f302370c074df63a4c94da63027e8eac184';
function autorizar() {
  require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-6');
  return autorizarEnsayo({ manifiesto: fs.readFileSync(path.join(__dirname, 'runtime_ensayo.json')),
    sha256Autorizado: SHA256_AUTORIZADO });
}
module.exports = Object.freeze({ autorizar, SHA256_AUTORIZADO });
