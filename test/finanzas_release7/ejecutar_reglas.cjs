'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.env.GCLOUD_PROJECT!=='demo-fesync'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8098') throw Error('Solo demo aislada 8098');
const suites=process.env.FIN_RELEASE6_BASELINE==='true'?['../finanzas_release6/privacidad.test.cjs']:
  ['../finanzas_rules/finanzas.test.js','../finanzas_release6/privacidad.test.cjs','../finanzas_rules/pertenencia.test.js'];
for(const file of suites){const r=spawnSync(process.execPath,['--test',path.resolve(__dirname,file)],
  {env:process.env,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
