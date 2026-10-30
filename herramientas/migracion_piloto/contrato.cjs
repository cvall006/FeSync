'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const error=c=>{throw Error(c);};
const canon=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:canon(v)).digest('hex');
const id=s=>typeof s==='string'&&s.length>0&&s===s.trim()&&!/[\/\x00-\x1f\x7f]/.test(s)&&s!=='.'&&s!=='..'&&!/^__.*__$/.test(s);
function proyecto(p,env=process.env){
 if(!['demo-fesync','fesync-app-2026'].includes(p))error('PROYECTO_PROHIBIDO');
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT'])if(env[k]&&env[k]!==p)error('ENTORNO_CRUZADO');
 if(p==='demo-fesync'){
  if(env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9098')error('EMULADORES_OBLIGATORIOS');
  if(['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','GOOGLE_OAUTH_ACCESS_TOKEN'].some(k=>env[k]))error('CREDENCIALES_EN_DEMO');
 }else if(['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>env[k]))error('EMULADOR_EN_REAL');
 if(env.FIREBASE_CONFIG){let c;try{c=JSON.parse(env.FIREBASE_CONFIG);}catch{error('CONFIG_INVALIDA');}if(c.projectId!==p)error('CONFIG_CRUZADA');}
 return p;
}
function manifiesto(m,p){
 if(!m||Object.keys(m).sort().join()!=='loteId,proyecto,seleccion,version'||m.version!==1||m.proyecto!==p||!id(m.loteId)||m.loteId.length>80)error('MANIFIESTO_INVALIDO');
 const s=m.seleccion;
 if(!s||Object.keys(s).sort().join()!=='iglesiaId,uid,version'||!id(s.uid)||s.uid.length>128||!id(s.iglesiaId)||typeof s.version!=='string'||!/^\d+:\d{1,9}$/.test(s.version))error('SELECCION_NO_UNITARIA');
 return JSON.parse(JSON.stringify(m));
}
function versionIso(t){
 const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(t||'');if(!m)error('VERSION_INVALIDA');
 return `${Date.parse(m[1]+'Z')/1000}:${Number((m[2]||'').padEnd(9,'0'))}`;
}
const version=s=>s.exists?`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`:null;
const foto=s=>({existe:s.exists,version:version(s),datos:s.exists?s.data():null});
function codigoHash(){
 return sha(['functions/migraciones/pertenencia_ejecucion.js','functions/migraciones/pertenencia_plan.js','functions/pertenencia.js',
  'herramientas/migracion_piloto/contrato.cjs','herramientas/migracion_piloto/ejecutor.cjs','herramientas/migracion_piloto/cli.cjs']
  .map(p=>p+'\0'+fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8').replace(/\r\n/g,'\n')).join('\0'));
}
const sellar=payload=>({payload,sha256:sha(payload)});
function abrirSobre(s){if(!s||Object.keys(s).sort().join()!=='payload,sha256'||sha(s.payload)!==s.sha256)error('INTEGRIDAD_INVALIDA');return s.payload;}
function guardar(file,data){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(canon(JSON.parse(fs.readFileSync(file,'utf8')))!==canon(data))error('RESPALDO_NO_VERIFICADO');}
module.exports={error,canon,sha,id,proyecto,manifiesto,versionIso,version,foto,codigoHash,sellar,abrirSobre,guardar};
