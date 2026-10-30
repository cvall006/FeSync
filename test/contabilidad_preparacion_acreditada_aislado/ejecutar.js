'use strict';
require('./autorizacion').autorizar();
require('../../functions/contabilidad_preparacion_acreditada_demo/entorno').verificarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(__dirname, 'guardas.test.js'), path.join(__dirname, 'integracion.test.js')],
{ env: process.env, stdio: 'inherit', windowsHide: true });
process.exitCode = r.error || r.status !== 0 ? 1 : 0;
