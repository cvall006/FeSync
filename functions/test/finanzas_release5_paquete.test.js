'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {inventario} = require('../../test/finanzas_release5/paquete.cjs');
test('Release 5: paquete conserva todos los exports y V1 sin fuentes de demo ni dependencias locales',()=>{
  const i=inventario(), files=new Set(i.files.map(f=>f.path));
  for(const name of fs.readdirSync(path.join(__dirname,'../finanzas_v1'))) assert.ok(files.has('finanzas_v1/'+name));
  for(const name of ['finanzasV1Consultar','finanzasV1Ejecutar','actualizarEncargadoFinanciero',
    'actualizarEstadoModuloFinanzas','registrarNuevaIglesiaSegura','actualizarAsistenciaAdoraSegura']) assert.ok(i.exports.includes(name));
  assert.ok(files.has('finanzas_core/autorizacion.js'));assert.ok(files.has('finanzas_core/conciliacion.js'));
  assert.equal(i.exports.some(n=>/inicializar|cambiarPeriodo|pausar|conciliar/i.test(n)),false);
  assert.equal(i.node,'24');
});
