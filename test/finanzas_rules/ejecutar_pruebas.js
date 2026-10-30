const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Secuenciales: las suites usan demo-fesync y limpian el mismo emulador.
for (const archivo of [
  path.join(__dirname, 'pertenencia.test.js'),
  path.join(__dirname, 'finanzas.test.js'),
  path.join(__dirname, '..', 'capacitaciones_rules', 'capacitaciones.test.js'),
]) {
  const resultado = spawnSync(process.execPath, ['--test', archivo], {
    cwd: path.dirname(archivo),
    env: process.env,
    stdio: 'inherit',
  });
  if (resultado.error) {
    console.error('No fue posible iniciar la suite de reglas.');
    process.exit(1);
  }
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}
