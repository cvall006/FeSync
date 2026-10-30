const { verificarEntorno } = require('../desvinculacion_integracion/entorno');
verificarEntorno();
const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Salida sanitizada: nunca imprimir dumps de assertions, perfiles, UIDs o tokens.
// Un fallo aborta la corrida. No se reintenta ni se suprime un test fallido.
const suites = [
  ['guardia_ensayo', 'guardia_ensayo.test.js'],
  ['membresia', '../desvinculacion_integracion/integracion.test.js'],
  ['ensayo_operativo', 'ensayo.test.js'],
  ['fcm_limpieza', 'fcm_limpieza.test.js'],
  ['roles', '../desvinculacion_integracion/roles.test.js'],
  ['simulador', 'integracion.test.js'],
  ['motor', 'ejecucion.test.js'],
  ['reglas_6b', '../finanzas_rules/pertenencia.test.js'],
  ['reglas_finanzas', '../finanzas_rules/finanzas.test.js'],
  ['capacitaciones_storage', '../capacitaciones_rules/capacitaciones.test.js'],
];
let pruebas = 0, aprobadas = 0, fallidas = 0;
for (const [suite, archivo] of suites) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.resolve(__dirname, archivo)], {
    cwd: path.resolve(__dirname, '../..'), env: process.env, encoding: 'utf8',
    timeout: 360000, maxBuffer: 16 * 1024 * 1024,
  });
  const salida = (r.stdout ?? '') + '\n' + (r.stderr ?? '');
  // Solo proyección del diagnóstico cerrado; nunca propagar JSON arbitrario.
  const { resumirFallo } = require('../desvinculacion_integracion/diagnostico');
  const diagnosticos = new Set();
  for (const m of salida.matchAll(/^(?:# )?DIAGNOSTICO_MEMBRESIA (.+)$/gm)) {
    try {
      const d = JSON.parse(m[1]);
      const seguro = resumirFallo(d.fase, { code: d.codigo });
      diagnosticos.add(JSON.stringify({ suite, diagnostico: seguro }));
    } catch { /* Fase/código no acreditados: no imprimir entrada. */ }
  }
  for (const d of diagnosticos) console.log(d);

  const total = (etiqueta) => Number([...salida.matchAll(new RegExp(`^# ${etiqueta} (\\d+)\\s*$`, 'gm'))].at(-1)?.[1] ?? 0);
  const resumen = { suite, pruebas: total('tests'), aprobadas: total('pass'), fallidas: total('fail'),
    omitidas: total('skipped'), salidaCorrecta: r.status === 0 && !r.error };
  console.log(JSON.stringify(resumen));
  for (const m of salida.matchAll(/^# METRICAS_ENSAYO (.+)$/gm)) {
    try {
      const d = JSON.parse(m[1]);
      if (['simulacion', 'posterior'].includes(d.fase) && Object.entries(d).every(([k, v]) =>
        ['fase', 'perfiles', 'candidatos', 'omitidos', 'revision', 'conflictos', 'comprobantes'].includes(k) &&
        (k === 'fase' || (Number.isSafeInteger(v) && v >= 0)))) console.log(JSON.stringify(d));
    } catch { /* No propagar una línea que no sea métrica acreditable. */ }
  }
  pruebas += resumen.pruebas; aprobadas += resumen.aprobadas; fallidas += resumen.fallidas;
  if (!resumen.salidaCorrecta || resumen.fallidas || !resumen.pruebas || resumen.omitidas) {
    // Identificación por suite y ordinal, sin imprimir nombres/datos dinámicos.
    const escenarios = [...salida.matchAll(/^not ok (\d+) - /gm)].map((m) => Number(m[1]));
    const tipos = [...new Set([...salida.matchAll(/^\s+failureType: '([A-Za-z]+)'/gm)].map((m) => m[1]))];
    const codigos = [...new Set([...salida.matchAll(/^\s+code: '(ERR_[A-Z_]+|[A-Z_]+)'/gm)].map((m) => m[1]))];
    const ubicaciones = [...new Set([...salida.matchAll(/(?:\/|\\)(ensayo(?:_emulador)?\.js|ensayo\.test\.js|integracion\.test\.js):(\d+):(\d+)/g)]
      .map((m) => `${m[1]}:${m[2]}:${m[3]}`))];
    const causasSeguras = ['Cliente de ensayo no autorizado.', 'Checkpoint de ensayo inválido.',
      'Configuración de ejecución inválida.', 'Auth emulado no disponible'].filter((m) => salida.includes(m));
    console.log(JSON.stringify({ bloqueo: 'ejecucion_fallida_no_reintentada', suite, escenarios, tipos, codigos,
      ubicaciones, causasSeguras,
      timeout: r.error?.code === 'ETIMEDOUT' }));
    process.exit(1);
  }
}
console.log(JSON.stringify({ resumen: 'corrida_completa', pruebas, aprobadas, fallidas }));
