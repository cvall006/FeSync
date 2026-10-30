'use strict';
// Herramienta local de la fixture. Sin credenciales de nube ni endpoints públicos.
const path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../functions/package.json'));
if(process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_TOKEN||process.env.GOOGLE_OAUTH_ACCESS_TOKEN||
 [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(p=>p&&p!=='demo-fesync'))throw Error('SOLO_DEMO');
const args=process.argv.slice(2);if(args.length%2)throw Error('Usa --accion --iglesia --correo y, para período, --periodo');
const opciones={};for(let i=0;i<args.length;i+=2){if(!['--accion','--iglesia','--correo','--periodo'].includes(args[i])||Object.hasOwn(opciones,args[i]))throw Error('Argumento inválido');opciones[args[i]]=args[i+1];}
const accion=opciones['--accion'],iglesiaId=opciones['--iglesia'],correo=opciones['--correo'];
if(!['pausar','inicializar','conciliar','reanudar','periodo'].includes(accion)||!/^fin_[A-Za-z0-9_-]+$/.test(iglesiaId??'')||
 !correo?.endsWith('.demo'))throw Error('Solo iglesias fin_* y usuarios ficticios .demo');
Object.assign(process.env,{GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',
 FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true'});
const {abrir}=require('../finanzas_mvp/soporte'),{FieldValue}=req('firebase-admin/firestore');
const {crearMantenimiento}=require('../../functions/finanzas_v1/mantenimiento');
(async()=>{
 const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:correo,password:'SoloDemo123!',returnSecureToken:true})});
 const auth=await r.json();if(!r.ok)throw Error('No se autenticó el usuario ficticio');
 const db=abrir();try{const m=crearMantenimiento({db,FieldValue});
  const resultado=accion==='periodo'?await m.cambiarPeriodo(auth.localId,iglesiaId,opciones['--periodo']):await m[accion](auth.localId,iglesiaId);
  console.log(JSON.stringify({proyecto:'demo-fesync',accion,iglesiaId,resultado:resultado??'OK'},null,2));
 }finally{await db.terminate();}
})().catch(e=>{console.error(e.codigo??e.message);process.exitCode=1});
