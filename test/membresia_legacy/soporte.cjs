'use strict';
const {validarEntorno}=require('../../herramientas/migracion_demo/entorno');
validarEntorno();
const {cliente,usar}=require('../../herramientas/migracion_demo/test/soporte');
const assert=require('node:assert/strict');
const password='SoloDemo123!';
async function actor(nombre){
  validarEntorno();
  const email=`${nombre}.${Date.now()}.${Math.random().toString(36).slice(2)}@legacy.demo`;
  const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const d=await r.json();assert.equal(r.status,200);return {uid:d.localId,email,token:d.idToken};
}
async function call(nombre,a,data){
  validarEntorno();
  assert.ok(['desvincularMiembroIglesia','recuperarContextoSolicitudDesvinculacion','vincularUsuarioConCodigo'].includes(nombre));
  const r=await fetch(`http://127.0.0.1:5018/demo-fesync/southamerica-west1/${nombre}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${a.token}`},body:JSON.stringify({data})});
  return {status:r.status,body:await r.json()};
}
async function migrar(nombre){
  return usar({lote:20,limite:2000},async t=>{
    let r=await t.ejecutar('aplicar',nombre);let migrados=r.metricas.migrados;
    for(let i=0;!r.completa&&!r.detenida&&i<100;i++){
      r=await t.ejecutar('reanudar',nombre);migrados+=r.metricas.migrados;
    }
    assert.equal(r.completa,true,JSON.stringify(r));
    return {migrados,verificacion:await t.verificar(nombre)};
  });
}
module.exports={actor,call,cliente,usar,migrar,password};
