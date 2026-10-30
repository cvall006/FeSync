const { verificarEntorno } = require('./entorno');
verificarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Secuenciales: todas las suites usan y vacían el mismo demo-fesync ficticio.
for (const archivo of [
  path.join(__dirname, 'integracion.test.js'),
  path.join(__dirname, 'roles.test.js'),
  path.join(__dirname, '../pertenencia_migracion/integracion.test.js'),
  path.join(__dirname, '../pertenencia_migracion/ejecucion.test.js'),
  path.join(__dirname, '../finanzas_rules/ejecutar_pruebas.js'),
]) {
  const argumentos = archivo.endsWith('ejecutar_pruebas.js') ? [archivo] : ['--test', archivo];
  const r = spawnSync(process.execPath, argumentos, { stdio: 'inherit', cwd: path.dirname(archivo) });
  if (r.error || r.status !== 0) {
    console.error('Integración no completada; no se declara éxito.');
    process.exit(1);
  }
}
