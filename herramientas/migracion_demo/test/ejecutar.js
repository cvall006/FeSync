const { validarEntorno } = require('../entorno'); validarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Secuencial: integracion.test.js borra únicamente demo-fesync local entre casos.
for (const suite of ['seguridad', 'integracion', 'regresion']) {
  const argumentos = suite === 'regresion'
    ? [path.resolve(__dirname, '../../../test/pertenencia_migracion/ejecutar_pruebas.js')]
    : ['--test', '--test-reporter=tap', path.join(__dirname, `${suite}.test.js`)];
  const r = spawnSync(process.execPath, argumentos,
    { env: process.env, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  const salida = (r.stdout ?? '') + '\n' + (r.stderr ?? '');
  const n = (k) => [...salida.matchAll(new RegExp(`^(?:#|ℹ) ${k} (\\d+)`, 'gm'))]
    .reduce((total, m) => total + Number(m[1]), 0);
  console.log(JSON.stringify({ suite, pruebas: n('tests'), aprobadas: n('pass'), fallidas: n('fail'),
    omitidas: n('skipped'), canceladas: n('cancelled'), salida: r.status, timeout: r.error?.code === 'ETIMEDOUT' }));
  if (r.status !== 0 || r.error || !n('tests') || n('fail') || n('skipped') || n('cancelled')) {
    console.error(JSON.stringify({ bloqueo: 'PRUEBAS_FALLIDAS', suite,
      ordinales: [...salida.matchAll(/^not ok (\d+)/gm)].map((m) => Number(m[1])),
      guardaHeredada: salida.includes('Pruebas permitidas solo en demo-fesync'),
      categorias: [...new Set([...salida.matchAll(/^\s+failureType: '([A-Za-z]+)'/gm)].map((m) => m[1]))] }));
    process.exit(1);
  }
}
