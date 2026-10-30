'use strict';
// Control exclusivo de la fixture demo. No es una herramienta de administración real.
const fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../../docs/finanzas_android_nativo_2026-10-26');
if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_TOKEN||process.env.GOOGLE_OAUTH_ACCESS_TOKEN)throw Error('Sin credenciales reales');
Object.assign(process.env,{GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true',FINANZAS_V1_ENTORNO:'emulador'});
require('../finanzas_release7/red_local.cjs');
const {abrir}=require('../finanzas_mvp/soporte');
const f=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'));
if(f.proyecto!=='demo-fesync'||!f.iglesiaId.startsWith('fin_android_nativo_'))throw Error('Solo fixture Android demo');
async function actor(rol){
  const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.actores[rol].email,password:f.password,returnSecureToken:true})});
  const d=await r.json();if(!r.ok)throw Error('Auth demo rechazado');return d.idToken;
}
async function rpc(nombre,token,data){
  const r=await fetch(`http://127.0.0.1:5018/demo-fesync/southamerica-west1/${nombre}`,{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data})});
  return {http:r.status,body:await r.json()};
}
async function main(){
  const accion=process.argv[2]??'estado',tag=process.argv[3]??accion;
  if(!['estado','revocar'].includes(accion)||!/^[a-z0-9_-]{1,40}$/.test(tag))throw Error('Acción/tag no admitidos');
  const token=await actor('admin');
  if(accion!=='estado'){
    const r=await rpc('actualizarEncargadoFinanciero',token,{iglesiaId:f.iglesiaId,
      accion:'revocar',encargadoUid:null});
    if(r.http!==200)throw Error(JSON.stringify(r));
  }
  const consulta=await rpc('finanzasV1Consultar',token,{historialPaginado:true});
  if(consulta.http!==200)throw Error(JSON.stringify(consulta));
  const rechazoMiembro=await rpc('finanzasV1Consultar',await actor('miembro'),{historialPaginado:true});
  if(rechazoMiembro.http!==403)throw Error('Miembro obtuvo acceso inesperado');
  const db=abrir(),b=`iglesias/${f.iglesiaId}`;
  try{
    const movimientos=await db.collection(`${b}/finanzas_movimientos`).orderBy('secuencia').get();
    const recibos=await db.collection(`operaciones_financieras/${f.actores.encargado.uid}/solicitudes`).get();
    const r={accion,proyecto:'demo-fesync',iglesiaId:f.iglesiaId,saldo:consulta.body.result.saldoTotalMinor,
      corte:consulta.body.result.historial.corte,recibosEncargado:recibos.size,
      movimientos:movimientos.docs.map(d=>({id:d.id,secuencia:d.data().secuencia,clase:d.data().movimiento.clase,
        asientos:d.data().movimiento.asientos})),rechazoMiembro:rechazoMiembro.http};
    if(accion==='revocar'){
      const t=await actor('encargado');
      const lectura=await rpc('finanzasV1Consultar',t,{historialPaginado:true});
      const escritura=await rpc('finanzasV1Ejecutar',t,{solicitudId:`android_revocado_${Date.now()}`,contexto:{iglesiaId:f.iglesiaId,pertenenciaId:f.pertenenciaId},
        operacion:'gasto',campos:{cuentaId:'caja',categoriaId:'gasto',montoMinor:1,fechaContable:'2026-10-26'}});
      if(lectura.http!==403||escritura.http!==403)throw Error('Revocación no deniega');
      r.revocado={consulta:lectura.http,escritura:escritura.http};
    }
    fs.writeFileSync(path.join(out,`libro-${tag}.json`),JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
  }finally{await db.terminate();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
