'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {entorno}=require('../../functions/finanzas_v1/entorno');
const {abrir}=require('../finanzas_mvp/soporte');
entorno();const db=abrir(),run=Date.now().toString(36);
test.after(()=>db.terminate());
async function usuario(n){
  const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${n}.${run}@web.demo`,password:'SoloDemo123!',returnSecureToken:true})});
  const d=await r.json();assert.equal(r.status,200);return {uid:d.localId,token:d.idToken};
}
async function call(n,a,data){
  entorno();const r=await fetch(`http://127.0.0.1:5018/demo-fesync/southamerica-west1/${n}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${a.token}`},body:JSON.stringify({data})});
  return {http:r.status,body:await r.json()};
}
for(const identificado of [false,true])test(`Entrada normal: crear/vincular conserva cliente ${identificado?'actual con solicitudId':'anterior sin solicitudId'}`,async()=>{
  const admin=await usuario('admin'+identificado),miembro=await usuario('miembro'+identificado),codigo=`WEB${run}${identificado?'N':'A'}`.toUpperCase();
  const crear={nombreIglesia:'Solo emulador',nombreAdmin:'Demo',codigo,...(identificado?{solicitudId:`web_crear_${run}_123456`}:{})};
  const c=await call('registrarNuevaIglesiaSegura',admin,crear);assert.equal(c.http,200,JSON.stringify(c.body));
  const vincular={nombre:'Demo',codigo,...(identificado?{solicitudId:`web_vincular_${run}_123456`}:{})};
  const v=await call('vincularUsuarioConCodigo',miembro,vincular);assert.equal(v.http,200,JSON.stringify(v.body));
  assert.equal(v.body.result.iglesiaId,c.body.result.iglesiaId);
  for(const a of [admin,miembro])assert.match((await db.doc(`usuarios_globales/${a.uid}`).get()).data().pertenenciaId,/^[a-f0-9]{64}$/);
  if(identificado){
    assert.deepEqual((await call('registrarNuevaIglesiaSegura',admin,crear)).body,c.body);
    assert.deepEqual((await call('vincularUsuarioConCodigo',miembro,vincular)).body,v.body);
    const estado=await call('consultarEstadoSolicitudIngreso',miembro,{solicitudId:vincular.solicitudId,tipo:'vincular'});
    assert.equal(estado.http,200);assert.equal(estado.body.result.estado,'CONFIRMADA_VIGENTE');
  }
});
