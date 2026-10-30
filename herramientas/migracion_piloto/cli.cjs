'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const c=require('./contrato.cjs'),{crear}=require('./ejecutor.cjs');
function argumentos(argv){
 const [modo,...args]=argv;
 const modos={preparar:['proyecto','directorio','reporte','lote'],'dry-run':['proyecto','directorio'],aplicar:['proyecto','directorio','confirmar'],
  verificar:['proyecto','directorio'],'verificar-respaldo':['proyecto','directorio'],'recuperar-respaldo':['proyecto','directorio']};
 if(!modos[modo]||args.length%2)c.error('ARGUMENTOS_INVALIDOS');const o={modo};
 for(let i=0;i<args.length;i+=2){const k=args[i].slice(2),v=args[i+1];if(!args[i].startsWith('--')||!modos[modo].includes(k)||o[k]!==undefined||!v)c.error('ARGUMENTOS_INVALIDOS');o[k]=v;}
 if(modos[modo].some(k=>!o[k]))c.error('ARGUMENTOS_INCOMPLETOS');return o;
}
function carpetaPrivada(dir){
 if(!fs.statSync(dir).isDirectory())c.error('DIRECTORIO_REQUERIDO');
 if(process.platform==='win32'){
  const ps=`$a=Get-Acl -LiteralPath '${path.resolve(dir).replaceAll("'","''")}';$s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;if(-not $a.AreAccessRulesProtected -or @($a.Access).Count -ne 1 -or $a.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $s -or $a.Access[0].AccessControlType -ne 'Allow'){exit 1};'OK'`;
  if(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',windowsHide:true}).trim()!=='OK')c.error('ACL_PRIVADA_REQUERIDA');
 }else if((fs.statSync(dir).mode&0o077)!==0)c.error('PERMISOS_PRIVADOS_REQUERIDOS');
}
function preparar(o){
 const r=JSON.parse(fs.readFileSync(o.reporte,'utf8'));
 if(r.proyecto!==o.proyecto||r.primerLoteSugerido?.length!==1)c.error('REPORTE_NO_UNITARIO');
 const p=r.candidatos?.find(p=>p.uid===r.primerLoteSugerido[0]);
 if(!p||p.estado!=='migrable'||p.esTitular!==false||p.esEncargado!==false||!['servidor','lider_area'].includes(p.rolGlobal))c.error('CANDIDATO_EXCLUIDO');
 const m=c.manifiesto({version:1,proyecto:o.proyecto,loteId:o.lote,seleccion:{uid:p.uid,iglesiaId:p.iglesiaId,version:c.versionIso(p.versionPerfil)}},o.proyecto);
 c.guardar(path.join(o.directorio,'manifiesto.json'),m);return {estado:'SELECCION_LOCAL_PREPARADA',perfiles:1,manifiestoHash:c.sha(m),escrituraRemota:false};
}
async function conectar(p){
 const req=createRequire(path.resolve(__dirname,'../../functions/package.json'));
 const {Firestore,FieldValue}=req('firebase-admin/firestore'),{GoogleAuth,OAuth2Client}=req('google-auth-library');
 const demo=p==='demo-fesync',g=demo?new GoogleAuth({authClient:new OAuth2Client()}):new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
 const db=new Firestore({projectId:p,databaseId:'(default)',host:demo?'127.0.0.1:8088':'firestore.googleapis.com:443',ssl:!demo,auth:g});
 async function leer(url,{body}={}){
  const token=demo?'owner':await g.getAccessToken();if(!token)c.error('ADC_NO_DISPONIBLE');
  const r=await fetch(url,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)c.error(`LECTURA_RECHAZADA_HTTP_${r.status}`);return r.json();
 }
 const authActual=async uid=>{
  const base=demo?'http://127.0.0.1:9098/identitytoolkit.googleapis.com':'https://identitytoolkit.googleapis.com';
  const u=new URL(`${base}/v1/projects/${p}/accounts:lookup`);u.searchParams.set('fields','users(localId,disabled)');
  const d=await leer(u,{body:{localId:[uid]}});
  if(!demo&&(Object.keys(d).some(k=>k!=='users')||(d.users||[]).some(a=>Object.keys(a).some(k=>!['localId','disabled'].includes(k)))))c.error('AUTH_FUERA_DE_MASCARA');
  const a=d.users?.find(a=>a.localId===uid);return a?{uid:a.localId,disabled:a.disabled===true}:null;
 };
 const reglasActuales=async()=>{
  if(demo)return c.sha(fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8'));
  const url=`https://firebaserules.googleapis.com/v1/projects/${p}/releases/cloud.firestore`,r=await leer(url);
  if(!new RegExp(`^projects/(${p}|336914296469)/rulesets/[a-zA-Z0-9-]+$`).test(r.rulesetName||''))c.error('REGLAS_FUERA_DE_PROYECTO');
  const source=await leer('https://firebaserules.googleapis.com/v1/'+r.rulesetName),again=await leer(url);
  if(again.rulesetName!==r.rulesetName||source.source?.files?.length!==1)c.error('REGLAS_NO_VERIFICABLES');
  return c.sha(source.source.files[0].content);
 };
 return {ejecutor:crear({db,FieldValue,proyecto:p,authActual,reglasActuales}),cerrar:()=>db.terminate(),db,FieldValue,authActual,reglasActuales};
}
async function main(){
 let adapter;
 try{
  const o=argumentos(process.argv.slice(2));
  // Preparar solo materializa una seleccion local; no inicializa ADC ni cliente Firebase.
  if(o.modo==='preparar'){if(!['demo-fesync','fesync-app-2026'].includes(o.proyecto))c.error('PROYECTO_PROHIBIDO');}
  else c.proyecto(o.proyecto);
  carpetaPrivada(o.directorio);
  let r;
  if(o.modo==='preparar')r=preparar(o);
  else{
   const m=c.manifiesto(JSON.parse(fs.readFileSync(path.join(o.directorio,'manifiesto.json'),'utf8')),o.proyecto);
   if(o.modo==='verificar-respaldo'||o.modo==='recuperar-respaldo'){
    if(o.modo==='recuperar-respaldo'){
     const d=c.abrirSobre(JSON.parse(fs.readFileSync(path.join(o.directorio,'dry-run.json'),'utf8'))),copy=JSON.parse(fs.readFileSync(path.join(o.directorio,'respaldo.copia.json'),'utf8')),b=c.abrirSobre(copy);
     if(d.respaldoHash!==copy.sha256||b.manifiestoHash!==c.sha(m)||b.proyecto!==o.proyecto||b.codigoHash!==c.codigoHash())c.error('COPIA_NO_CORRESPONDE');
     c.guardar(path.join(o.directorio,'respaldo.json'),copy);
    }
    r=crear({db:{projectId:o.proyecto},proyecto:o.proyecto,authActual:()=>{},reglasActuales:()=>{}}).cargar(m,o.directorio);
   }else{
    adapter=await conectar(o.proyecto);
    r=o.modo==='dry-run'?await adapter.ejecutor.dryRun(m,o.directorio):o.modo==='aplicar'?await adapter.ejecutor.aplicar(m,o.directorio,o.confirmar):await adapter.ejecutor.verificar(m,o.directorio);
   }
  }
  console.log(JSON.stringify(r));if(r.estado==='DETENIDO_VERIFICAR'||r.estado==='REVISION_MANUAL')process.exitCode=3;
 }catch(e){console.error(JSON.stringify({error:/^[A-Z_]+(?:_\d{3})?$/.test(e.message)?e.message:'PILOTO_DETENIDO'}));process.exitCode=1;}
 finally{if(adapter)await adapter.cerrar();}
}
module.exports={argumentos,preparar,conectar,carpetaPrivada};
if(require.main===module)main();
