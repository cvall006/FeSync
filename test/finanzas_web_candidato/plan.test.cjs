'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparar,validar}=require('../../herramientas/finanzas_web_plan.cjs');
test('Selectores: diez creaciones, dos actualizaciones explícitas, once remotas intactas',()=>{
  const plan=preparar(),remotas=[...plan.actualizar,...plan.conservar];
  const locales=[...remotas,...plan.crear,...plan.aliasCompatibilidadNoSeleccionados];
  assert.equal(validar(plan,remotas,locales),true);
  for(const patch of [{selectores:['functions']},{selectores:['functions:*']},
    {actualizar:[...plan.actualizar,plan.conservar[0]]},{eliminar:[plan.conservar[0]]},
    {crear:[...plan.crear,'finanzasV1Mantener']},{proyecto:'otro-proyecto'}]){
    assert.throws(()=>validar({...plan,...patch},remotas,locales));
  }
});
