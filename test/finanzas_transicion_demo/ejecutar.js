'use strict';
require('../../functions/contabilidad_demo/entorno').verificarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Secuenciales: ambas suites limpian el mismo emulador. Un fallo detiene todo.
const propia = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(__dirname, 'integracion.test.js')], { env: process.env, stdio: 'inherit', windowsHide: true });
if (propia.error || propia.status !== 0) process.exitCode = 1;
else {
  const regresiones = spawnSync(process.execPath, [path.join(__dirname, '../finanzas_contabilidad_integracion/ejecutar.js')],
    { env: process.env, stdio: 'inherit', windowsHide: true });
  process.exitCode = regresiones.error || regresiones.status !== 0 ? 1 : 0;
}
