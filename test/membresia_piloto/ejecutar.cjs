'use strict';
process.env.FIREBASE_CONFIG='{"projectId":"demo-fesync"}';
require('../../herramientas/migracion_piloto/contrato.cjs').proyecto('demo-fesync');
const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const f of ['guardas.test.cjs','integracion.test.cjs']){
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(__dirname,f)],{env:process.env,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);
}
