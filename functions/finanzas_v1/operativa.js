'use strict';
const {exigir,registroExacto,ErrorContable}=require('../finanzas_core/dinero');
const c=require('./comun');
async function autorizar(db,tx,uid,contexto,permiso='leer') {
  c.id(uid);registroExacto(contexto,['iglesiaId','pertenenciaId']);
  const perfil=await tx.get(db.doc(`usuarios_globales/${uid}`));
  exigir(perfil.exists,'CONTABILIDAD_NO_AUTORIZADA');
  const iglesiaId=perfil.data().iglesiaId,b=c.base(iglesiaId);
  const auth=await c.autorizar(db,tx,uid,iglesiaId,permiso);
  exigir(c.canon(contexto)===c.canon({iglesiaId,pertenenciaId:auth.actor.data().pertenenciaId}),'PERTENENCIA_ANTERIOR');
  const [gate,v2]=await Promise.all(['publicacion_v1','generacion_v2'].map(r=>tx.get(db.doc(`${b}/finanzas_control/${r}`))));
  exigir(c.habilitacionValida(gate.data(),iglesiaId),'CIRCUITO_FINANCIERO_NO_HABILITADO');
  exigir(!v2.exists,'LIBRO_V2_NO_ADMITIDO');
  return {...auth,iglesiaId,b};
}
function callable(HttpsError,fn){return async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Inicia sesión.');
  try{c.entornoOperacion();}catch{throw new HttpsError('failed-precondition','ENTORNO_FINANCIERO_NO_HABILITADO');}
  try{c.id(request.auth.uid);return await fn(request.auth.uid,request.data);}
  catch(e){
    if(e instanceof ErrorContable)throw new HttpsError(e.codigo==='CONTABILIDAD_NO_AUTORIZADA'?'permission-denied':'failed-precondition',e.codigo,{codigo:e.codigo});
    throw new HttpsError('unavailable','Resultado incierto. Conserva la misma solicitud.');
  }
};}
module.exports={autorizar,callable};
