'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process');
async function main(){
  if((process.argv.length!==2 && !(process.argv.length===3 && process.argv[2]==='--antes'))||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_TOKEN||
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN||[process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(p=>p&&p!=='demo-fesync')) {
    throw Error('Solo reglas locales demo-fesync sin credenciales.');
  }
  for(const port of [8098,4428,4528])await new Promise((resolve,reject)=>{
    const s=net.createServer();s.once('error',()=>reject(Error(`Puerto ${port} ocupado; no reiniciar.`)));
    s.listen(port,'127.0.0.1',()=>s.close(resolve));
  });
  const cli=require.resolve('firebase-tools/lib/bin/firebase',{paths:[path.join(process.env.APPDATA,'npm/node_modules')]});
  const info=JSON.parse(fs.readFileSync(path.join(path.dirname(cli),'../emulator/downloadableEmulatorInfo.json'))).firestore;
  if(!fs.existsSync(path.join(os.homedir(),'.cache/firebase/emulators',info.downloadPathRelativeToCacheDir)))throw Error('Falta emulador instalado.');
  const root=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fesync-web-candidato-rules-'));
  fs.copyFileSync(path.join(root,'firestore.rules'),path.join(tmp,'firestore.rules'));
  fs.writeFileSync(path.join(tmp,'firebase.json'),JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{
    firestore:{host:'127.0.0.1',port:8098},hub:{host:'127.0.0.1',port:4428},logging:{host:'127.0.0.1',port:4528},
    ui:{enabled:false},singleProjectMode:true}}));
  const env={};
  for(const k of ['PATH','SystemRoot','WINDIR','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ComSpec','PATHEXT','JAVA_HOME',
    'NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PROGRAMFILES(X86)'])if(process.env[k])env[k]=process.env[k];
  if(!env.JAVA_HOME&&fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe'))env.JAVA_HOME='C:/Program Files/Android/Android Studio/jbr';
  if(env.JAVA_HOME)env.PATH=path.join(env.JAVA_HOME,'bin')+path.delimiter+env.PATH;
  Object.assign(env,{GCLOUD_PROJECT:'demo-fesync',GOOGLE_CLOUD_PROJECT:'demo-fesync',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8098',
    FINANZAS_RULES_EMULATOR_PORT:'8098',TEMP:tmp,TMP:tmp,XDG_CONFIG_HOME:tmp,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true',METADATA_SERVER_DETECTION:'none',FIN_RELEASE6_BASELINE:process.argv[2]==='--antes'?'true':'false'});
  const command=`"${process.execPath}" "${path.join(__dirname,'ejecutar_reglas.cjs')}"`;
  console.log('Reglas financieras aisladas en demo-fesync:8098. No se borra Firestore 8088. Logs: '+tmp);
  fs.writeFileSync(path.join(root,'docs/finanzas_web_candidato_2026-10-28/reglas-infraestructura.json'),JSON.stringify({project:'demo-fesync',port:8098,tmp},null,2));
  const child=spawn(process.execPath,[cli,'emulators:exec','--only','firestore','--project','demo-fesync','--config',path.join(tmp,'firebase.json'),'--non-interactive',command],
    {cwd:tmp,env,stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code===0?0:1;resolve();});});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
