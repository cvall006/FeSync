'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098')throw Error('Solo demo 8098');
const root=path.resolve(__dirname,'../..');
for(const file of ['test/finanzas_rules/finanzas.test.js','test/finanzas_release6/privacidad.test.cjs','test/finanzas_rules/pertenencia.test.js','test/finanzas_web_candidato/compatibilidad.test.cjs','docs/finanzas_reglas_controladas_2026-10-29/legacy-desplegado.test.cjs']){
 const r=spawnSync(process.execPath,['--require',path.join(root,'test/finanzas_release7/red_local.cjs'),'--test',path.join(root,file)],{env:process.env,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);
}
