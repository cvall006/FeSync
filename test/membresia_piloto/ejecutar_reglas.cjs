'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098')throw Error('SOLO_EMULADOR_DEMO');
for(const f of ['pertenencia.test.cjs','compatibilidad.test.cjs']){
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(__dirname,f)],{env:process.env,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);
}
