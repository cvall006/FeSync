'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {crearResolucion,validar}=require('../finanzas_v1/resolucion');
const {crearAdministracion,siguienteMes,validar:validarAdmin}=require('../finanzas_v1/administracion');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
test('FIN8: ambas entradas operativas exigen Auth antes de DB y siguen apagadas fuera de demo',async()=>{
  for(const factory of [crearResolucion,crearAdministracion]){
    const fn=factory({db:null,HttpsError});
    await assert.rejects(fn({data:{}}),e=>e.code==='unauthenticated');
    await assert.rejects(fn({auth:{uid:'actor'},data:{}}),e=>e.code==='failed-precondition'&&e.message==='ENTORNO_FINANCIERO_NO_HABILITADO');
  }
});
test('FIN8: contratos administrativos no aceptan movimientos, roles, fixtures o acreditaciones',()=>{
  const s={solicitudId:'administracion_12345678',contexto:{iglesiaId:'iglesia',pertenenciaId:'a'.repeat(64)},accion:'pausar'};
  assert.doesNotThrow(()=>validarAdmin(s));
  for(const patch of [{accion:'activar'},{accion:'migrarV2'},{movimientos:[]},{roles:['admin_iglesia']},
    {certificacionHistorica:true},{periodoId:'2026-11'},{solicitudId:123}])assert.throws(()=>validarAdmin({...s,...patch}));
  assert.doesNotThrow(()=>validarAdmin({...s,accion:'cambiarPeriodo',periodoId:'2026-11'}));
  assert.throws(()=>validarAdmin({...s,contexto:{iglesiaId:'x'.repeat(17000)}}));
  assert.equal(siguienteMes('2026-12'),'2027-01');assert.equal(siguienteMes('2026-01'),'2026-02');
});
test('FIN8: resolución no permite IDs nuevos encubiertos ni operaciones arbitrarias',()=>{
  const s={solicitudId:'pendiente_123456789',contexto:{iglesiaId:'iglesia',pertenenciaId:'a'.repeat(64)},operacion:'gasto',campos:{}};
  assert.doesNotThrow(()=>validar(s));
  for(const patch of [{solicitudId:123},{solicitudId:'corto'},{operacion:'editarMovimiento'},{habilitado:true},{campos:null}]){
    assert.throws(()=>validar({...s,...patch}));
  }
});
