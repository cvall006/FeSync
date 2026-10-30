'use strict';
// Fixture y espera local para la app Android REAL; no usa adaptadores FlutterFire.
const fs=require('node:fs'),path=require('node:path');
const {abrir}=require('../finanzas_mvp/soporte');
const {entorno}=require('../../functions/finanzas_v1/entorno');
const {calcularLibro}=require('../../functions/finanzas_core/asientos');
const out=path.resolve(__dirname,'../../docs/finanzas_android_nativo_2026-10-26');
async function rpc(nombre,actor,data){
  entorno();const r=await fetch(`http://127.0.0.1:5018/demo-fesync/southamerica-west1/${nombre}`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.token}`},body:JSON.stringify({data})});
  const d=await r.json();if(d.error)throw Error(d.error.message);return d.result;
}
async function main(){
  entorno();if(process.argv.length!==2)throw Error('Sin parámetros ni destino alternativo');
  const corrida=Date.now().toString(36),iglesiaId=`fin_android_nativo_${corrida}`,b=`iglesias/${iglesiaId}`;
  const db=abrir(),actores={},password='SoloDemo123!',pertenenciaId='a'.repeat(64),periodoId='2026-10';
  for(const nombre of ['admin','encargado','miembro']){
    const email=`${nombre}.${corrida}@android.fesync.demo`;
    const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
    const d=await r.json();if(!r.ok)throw Error('Auth local rechazó fixture');
    actores[nombre]={uid:d.localId,email,token:d.idToken};
  }
  const configuracion={moneda:'CLP',escala:0,zonaHoraria:'America/Santiago'};
  const cuentas=['caja','banco'].map(id=>({versionEsquema:1,id,iglesiaId,codigo:id.toUpperCase(),nombre:id,
    tipo:id,moneda:'CLP',escala:0,estado:'activa'}));
  const batch=db.batch();
  const put=(ruta,d)=>batch.create(db.doc(ruta),d);
  put(b,{adminUid:actores.admin.uid,nombre:'FeSync Android solo demo',codigoAcceso:'ANDROIDDEMO',modulosActivos:{},estado:'activa'});
  for(const [rol,a] of Object.entries(actores))put(`usuarios_globales/${a.uid}`,{
    iglesiaId,pertenenciaId,rolGlobal:rol==='admin'?'admin_iglesia':'servidor',nombre:`Demo ${rol}`,email:a.email,temaOscuro:true,notificacionesPendientes:{}});
  put(`${b}/finanzas_config/acceso`,{moduloHabilitado:true,encargadoUid:actores.encargado.uid});
  put(`${b}/finanzas_control/publicacion_v1`,{versionEsquema:1,iglesiaId,circuito:'v1_incremental',habilitado:true});
  put(`${b}/finanzas_config/contabilidad`,{versionEsquema:1,iglesiaId,...configuracion});
  put(`${b}/finanzas_control/protocolo`,{versionProtocolo:1,iglesiaId,epoca:1,estado:'bloqueado'});
  put(`${b}/finanzas_control/libro`,{versionEsquema:1,iglesiaId,ultimaSecuencia:0,huboMovimientos:false});
  put(`${b}/finanzas_control/periodo`,{versionEsquema:1,iglesiaId,periodosAbiertos:[periodoId]});
  put(`${b}/finanzas_resumenes/${periodoId}`,{versionEsquema:1,iglesiaId,periodoId,ultimaSecuencia:0,
    datos:calcularLibro({movimientos:[],cuentas:cuentas.map(({id,moneda,escala})=>({id,moneda,escala})),configuracion,periodoId})});
  for(const cuenta of cuentas){
    put(`${b}/finanzas_cuentas/${cuenta.id}`,{cuenta});
    put(`${b}/finanzas_saldos/${cuenta.id}`,{versionEsquema:1,iglesiaId,cuentaId:cuenta.id,saldoMinor:0,huboMovimientos:false,
      aperturaRegistrada:false,solicitudesInciertas:0,ultimaSecuencia:0});
  }
  for(const naturaleza of ['ingreso','gasto'])put(`${b}/finanzas_categorias/${naturaleza}`,{categoria:{versionEsquema:1,id:naturaleza,iglesiaId,
    codigo:naturaleza.toUpperCase(),nombre:naturaleza,naturaleza,tipoIngreso:naturaleza==='ingreso'?'diezmos':null,estado:'activa'}});
  await batch.commit();const contexto={iglesiaId,pertenenciaId};
  await rpc('finanzasV1Mantener',actores.admin,{solicitudId:`android_inicializar_${corrida}`,contexto,accion:'inicializar'});
  await rpc('finanzasV1Ejecutar',actores.admin,{solicitudId:`android_apertura_${corrida}`,contexto,operacion:'apertura',
    campos:{cuentaId:'caja',montoMinor:10000,fechaContable:'2026-10-26'}});
  const fixture={proyecto:'demo-fesync',iglesiaId,pertenenciaId,password,periodoId,
    actores:Object.fromEntries(Object.entries(actores).map(([k,{uid,email}])=>[k,{uid,email}])),saldoInicial:10000};
  fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(fixture,null,2));
  console.log('ANDROID_FIXTURE_LISTA: '+iglesiaId+'; saldo 10000; esperar prueba nativa.');
  // Se termina al crear el archivo finalizar, o a los 45 minutos. Solo nuestra infraestructura.
  const hasta=Date.now()+45*60*1000;
  while(Date.now()<hasta&&!fs.existsSync(path.join(out,'finalizar')))await new Promise(r=>setTimeout(r,1000));
  await db.terminate();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
