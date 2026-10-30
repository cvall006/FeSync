'use strict';
require('./entorno').verificarEntorno(); // Antes de importar SDK o suites con datos.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(__dirname, 'entorno.test.js'), path.join(__dirname, 'integracion.test.js')],
{ cwd: __dirname, env: process.env, stdio: 'inherit', windowsHide: true });
process.exitCode = r.error || r.status !== 0 ? 1 : 0;
