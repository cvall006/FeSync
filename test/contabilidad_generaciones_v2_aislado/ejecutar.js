'use strict';
require('../../functions/contabilidad_generaciones_v2_demo/entorno').verificarEntorno();
// Revalidar el arbol completo antes de importar suites/SDKs en el hijo.
require('../../functions/contabilidad_demo/fuentes').obtenerContextoFuentes('admin-6');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(__dirname, 'guardas.test.js'), path.join(__dirname, 'integracion.test.js')],
{ cwd: __dirname, env: process.env, stdio: 'inherit', windowsHide: true });
process.exitCode = r.error || r.status !== 0 ? 1 : 0;
