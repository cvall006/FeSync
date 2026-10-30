'use strict';
require('../entorno').verificarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const r = spawnSync(process.execPath,['--test','--test-concurrency=1',path.join(__dirname,'integracion.test.js')],
 {env:process.env,stdio:'inherit',windowsHide:true});
if(r.error || r.status !== 0) process.exitCode=1;
else {
 const s = spawnSync(process.execPath,[path.join(__dirname,'../../../test/finanzas_transicion_demo/ejecutar.js')],
 {env:process.env,stdio:'inherit',windowsHide:true});
 process.exitCode=s.error || s.status !== 0 ? 1 : 0;
}
