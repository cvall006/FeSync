'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
(async()=>{
 if(process.argv.length!==2)throw Error('Sin opciones de proyecto ni despliegue.');
 for(const port of [8099,4429,4529])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 const cli=require.resolve('firebase-tools/lib/bin/firebase',{paths:[path.join(process.env.APPDATA,'npm/node_modules')]}),
 info=JSON.parse(fs.readFileSync(path.join(path.dirname(cli),'../emulator/downloadableEmulatorInfo.json'))).firestore;
 if(!fs.existsSync(path.join(os.homedir(),'.cache/firebase/emulators',info.downloadPathRelativeToCacheDir)))throw Error('Falta el emulador existente; no se instalará.');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fesync-escuela-rules-'));
 fs.copyFileSync(path.resolve(__dirname,'../../firestore.rules'),path.join(tmp,'firestore.rules'));
 fs.writeFileSync(path.join(tmp,'firebase.json'),JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{firestore:{host:'127.0.0.1',port:8099},hub:{host:'127.0.0.1',port:4429},logging:{host:'127.0.0.1',port:4529},ui:{enabled:false},singleProjectMode:true}}));
 const env={};for(const k of ['PATH','SystemRoot','WINDIR','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ComSpec','PATHEXT','JAVA_HOME','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'])if(process.env[k])env[k]=process.env[k];
 if(!env.JAVA_HOME&&fs.existsSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe'))env.JAVA_HOME='C:/Program Files/Android/Android Studio/jbr';
 if(env.JAVA_HOME)env.PATH=path.join(env.JAVA_HOME,'bin')+path.delimiter+env.PATH;
 Object.assign(env,{GCLOUD_PROJECT:'demo-fesync-escuela',GOOGLE_CLOUD_PROJECT:'demo-fesync-escuela',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8099',TEMP:tmp,TMP:tmp,XDG_CONFIG_HOME:tmp,CI:'true',FIREBASE_CLI_DISABLE_MOTD:'true',METADATA_SERVER_DETECTION:'none'});
 console.log('Pruebas locales de Escuela: demo-fesync-escuela en 127.0.0.1:8099. Logs: '+tmp);
 const command='"'+process.execPath+'" --test "'+path.join(__dirname,'asignaciones.test.cjs')+'"';
 const child=spawn(process.execPath,[cli,'emulators:exec','--only','firestore','--project','demo-fesync-escuela','--config',path.join(tmp,'firebase.json'),'--non-interactive',command],{cwd:tmp,env,stdio:'inherit',windowsHide:true});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code===0?0:1;resolve();});});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
