'use strict';
const fs=require('node:fs'),path=require('node:path');
const c=require('./contrato.cjs');
const {migrarPerfilPertenencia}=require('../../functions/migraciones/pertenencia_ejecucion');
const {clasificarPerfilPertenencia}=require('../../functions/migraciones/pertenencia_plan');
const {pertenenciaIdValido}=require('../../functions/pertenencia');
const CAMPOS_RECIBO=['version','origen','iglesiaId','pertenenciaId','versionPerfilAnterior','fechaCreacion'];
function crear({db,FieldValue,proyecto,authActual,reglasActuales,ahora=Date.now}){
 if(!['demo-fesync','fesync-app-2026'].includes(proyecto))c.error('PROYECTO_PROHIBIDO');
 if(db.projectId!==proyecto||!authActual||!reglasActuales)c.error('ADAPTADOR_INVALIDO');
 const hashReglasPermitidas=()=>['firestore.rules','docs/membresia_piloto_2026-10-28/firestore.piloto.rules']
  .map(p=>c.sha(fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8')));
 async function contexto(tx,m){
  const s=m.seleccion,ref=db.doc(`usuarios_globales/${s.uid}`),recibo=db.doc(`migraciones_pertenencia/${s.uid}`);
  const [perfil]=await tx.getAll(ref,{fieldMask:['iglesiaId','rolGlobal','pertenenciaId']});
  const [comprobante]=await tx.getAll(recibo,{fieldMask:CAMPOS_RECIBO});
  const iglesias=await tx.get(db.collection('iglesias').select('adminUid').limit(21));
  if(iglesias.size>20)c.error('LIMITE_IGLESIAS');
  const accesos=[];
  for(const i of iglesias.docs){const [a]=await tx.getAll(db.doc(`iglesias/${i.id}/finanzas_config/acceso`),{fieldMask:['encargadoUid']});accesos.push({id:i.id,snapshot:a});}
  const iglesia=iglesias.docs.find(i=>i.id===s.iglesiaId);
  const cache=new Map([[ref.path,perfil],[recibo.path,comprobante],...iglesias.docs.map(i=>[i.ref.path,i])]);
  const estado={perfil:c.foto(perfil),comprobante:c.foto(comprobante),iglesias:iglesias.docs.map(i=>({id:i.id,...c.foto(i)})),
   accesos:accesos.map(a=>({id:a.id,...c.foto(a.snapshot)}))};
  // Firestore Timestamp del comprobante se normaliza por JSON al persistir/verificar.
  return {perfil,comprobante,iglesia,accesos,cache,estado:JSON.parse(JSON.stringify(estado))};
 }
 function candidato(x,m){
  const s=m.seleccion,p=x.perfil.data();
  const r=clasificarPerfilPertenencia({uid:s.uid,perfil:p||null,iglesia:{id:s.iglesiaId,existe:!!x.iglesia,adminUid:x.iglesia?.data().adminUid},versionEsperada:s.version,versionActual:c.version(x.perfil)});
  if(r.categoria!=='candidato')c.error('PRECONDICION_MEMBRESIA');
  if(p.rolGlobal==='admin_iglesia'||x.estado.iglesias.some(i=>i.datos.adminUid===s.uid))c.error('TITULAR_EXCLUIDO');
  for(const a of x.estado.accesos){
   const u=a.datos?.encargadoUid;if(u!==undefined&&u!==null&&!c.id(u))c.error('ENCARGO_NO_VERIFICABLE');
   if(u===s.uid)c.error('ENCARGADO_EXCLUIDO');
  }
  if(x.comprobante.exists)c.error('COMPROBANTE_PREVIO');
 }
 function confirmado(x,m,b){
  if(!x.perfil.exists||!x.comprobante.exists)return false;
  const p=x.perfil.data(),r=x.comprobante.data(),original=b.estado.perfil.datos;
  if(!pertenenciaIdValido(p.pertenenciaId)||Object.keys(r).sort().join()!==[...CAMPOS_RECIBO].sort().join()||
   r.version!==1||r.origen!=='migracion_pertenencia_v1'||r.iglesiaId!==m.seleccion.iglesiaId||
   r.versionPerfilAnterior!==m.seleccion.version||r.pertenenciaId!==p.pertenenciaId||!r.fechaCreacion?.seconds)return false;
  const {pertenenciaId,...resto}=p;return c.canon(resto)===c.canon(original);
 }
 async function guardasExternas(m){
  const a=await authActual(m.seleccion.uid);if(!a||a.uid!==m.seleccion.uid||a.disabled)c.error('IDENTIDAD_NO_VIGENTE');
  const hash=await reglasActuales();if(!hashReglasPermitidas().includes(hash))c.error('REGLAS_NO_PROTEGIDAS');return hash;
 }
 async function inspeccionar(m){return db.runTransaction(tx=>contexto(tx,m),{readOnly:true});}
 async function dryRun(entrada,dir){
  const m=c.manifiesto(entrada,proyecto),reglas=await guardasExternas(m),x=await inspeccionar(m);candidato(x,m);
  const respaldo=c.sellar({version:1,proyecto,manifiestoHash:c.sha(m),codigoHash:c.codigoHash(),estado:x.estado});
  c.guardar(path.join(dir,'respaldo.json'),respaldo);c.guardar(path.join(dir,'respaldo.copia.json'),respaldo);
  const preparacion=c.sellar({version:1,proyecto,manifiestoHash:c.sha(m),codigoHash:c.codigoHash(),respaldoHash:respaldo.sha256,
   reglasHash:reglas,creadoMs:ahora(),venceMs:ahora()+10*60*1000});
  c.guardar(path.join(dir,'dry-run.json'),preparacion);
  return {estado:'DRY_RUN_APROBADO',perfiles:1,confirmacion:preparacion.sha256,respaldoHash:respaldo.sha256};
 }
 function cargar(m,dir){
  const sobre=JSON.parse(fs.readFileSync(path.join(dir,'dry-run.json'),'utf8')),d=c.abrirSobre(sobre);
  const backup=JSON.parse(fs.readFileSync(path.join(dir,'respaldo.json'),'utf8')),b=c.abrirSobre(backup);
  const copia=JSON.parse(fs.readFileSync(path.join(dir,'respaldo.copia.json'),'utf8'));c.abrirSobre(copia);
  if(d.proyecto!==proyecto||d.manifiestoHash!==c.sha(m)||b.manifiestoHash!==c.sha(m)||b.proyecto!==proyecto||
   d.codigoHash!==c.codigoHash()||b.codigoHash!==d.codigoHash||d.respaldoHash!==backup.sha256||c.canon(copia)!==c.canon(backup))c.error('ARTEFACTOS_NO_COINCIDEN');
  return {sobre,d,b};
 }
 async function verificar(entrada,dir){
  const m=c.manifiesto(entrada,proyecto),{b}=cargar(m,dir);await guardasExternas(m);
  const x=await inspeccionar(m);return {estado:confirmado(x,m,b)?'CONFIRMADO':c.canon(x.estado)===c.canon(b.estado)?'SIN_COMMIT':'REVISION_MANUAL',perfiles:1};
 }
 async function aplicar(entrada,dir,confirmacion){
  const m=c.manifiesto(entrada,proyecto),{sobre,d,b}=cargar(m,dir);
  if(confirmacion!==sobre.sha256)c.error('CONFIRMACION_REQUERIDA');
  const reglas=await guardasExternas(m);if(reglas!==d.reglasHash)c.error('REGLAS_CAMBIADAS');
  let escrituraIntentada=false;
  const protegida={collection:db.collection.bind(db),runTransaction:(_callback,opciones)=>db.runTransaction(async tx=>{
   const x=await contexto(tx,m);
   if(confirmado(x,m,b))return {categoria:'omitido',motivo:'piloto_confirmado'};
   if(ahora()>d.venceMs||ahora()<d.creadoMs)c.error('DRY_RUN_VENCIDO');
   candidato(x,m);if(c.canon(x.estado)!==c.canon(b.estado))c.error('PRECONDICIONES_CAMBIADAS');
   // Repetir tambien en cada reintento SDK, junto a las precondiciones Firestore.
   if(await guardasExternas(m)!==d.reglasHash)c.error('REGLAS_CAMBIADAS');
   if(ahora()>d.venceMs)c.error('DRY_RUN_VENCIDO');
   const perfil=`usuarios_globales/${m.seleccion.uid}`,comprobante=`migraciones_pertenencia/${m.seleccion.uid}`;
   return _callback({get:async ref=>{if(ref.firestore!==db||!x.cache.has(ref.path))c.error('LECTURA_FUERA_DE_LOTE');return x.cache.get(ref.path);},
    update(ref,data){if(ref.firestore!==db||ref.path!==perfil||Object.keys(data).join()!=='pertenenciaId'||!pertenenciaIdValido(data.pertenenciaId))c.error('ESCRITURA_FUERA_DE_LOTE');escrituraIntentada=true;tx.update(ref,data);},
    create(ref,data){if(ref.firestore!==db||ref.path!==comprobante||Object.keys(data).sort().join()!==[...CAMPOS_RECIBO].sort().join()||
     data.version!==1||data.origen!=='migracion_pertenencia_v1'||data.iglesiaId!==m.seleccion.iglesiaId||data.versionPerfilAnterior!==m.seleccion.version||
     !pertenenciaIdValido(data.pertenenciaId)||!data.fechaCreacion?.isEqual?.(FieldValue.serverTimestamp()))c.error('ESCRITURA_FUERA_DE_LOTE');tx.create(ref,data);}});
  },opciones)};
  const r=await migrarPerfilPertenencia({db:protegida,FieldValue,seleccion:m.seleccion});
  // Un error puede ocultar un commit: nunca compensar borrando. Verificar permite resolverlo.
  if(!['migrado','omitido'].includes(r.categoria))return {estado:'DETENIDO_VERIFICAR',categoria:r.categoria,escrituraIntentada};
  const v=await verificar(m,dir);return {...v,segundaAsignacion:false,resultadoMotor:r.categoria};
 }
 return {dryRun,aplicar,verificar,cargar:(m,d)=>{cargar(c.manifiesto(m,proyecto),d);return {estado:'RESPALDO_INTEGRO'};}};
}
module.exports={crear};
