const { ErrorDemo } = require('./entorno');
function parsear(argv) {
  const [modo, ...resto] = argv;
  if (!['preflight', 'simular', 'aplicar', 'reanudar', 'verificar'].includes(modo) || resto.length % 2) {
    throw new ErrorDemo('ARGUMENTOS_INVALIDOS');
  }
  const opciones = {}, vistos = new Set();
  let checkpoint;
  for (let i = 0; i < resto.length; i += 2) {
    const k = resto[i], v = resto[i + 1];
    if (vistos.has(k)) throw new ErrorDemo('ARGUMENTOS_INVALIDOS');
    vistos.add(k);
    if (k === '--checkpoint') {
      if (typeof v !== 'string' || v !== v.trim() || !/^[a-z][a-z0-9_-]{0,47}$/.test(v)) throw new ErrorDemo('ARGUMENTOS_INVALIDOS');
      checkpoint = v;
    } else {
      const campo = { '--lote': 'lote', '--limite': 'limite', '--reserva-ms': 'reservaMs' }[k];
      if (!campo || !/^[1-9]\d*$/.test(v)) throw new ErrorDemo('ARGUMENTOS_INVALIDOS');
      opciones[campo] = Number(v);
    }
  }
  if ((['aplicar', 'reanudar'].includes(modo) && !checkpoint) ||
      (['preflight', 'simular'].includes(modo) && checkpoint)) throw new ErrorDemo('ARGUMENTOS_INVALIDOS');
  return { modo, checkpoint, opciones };
}
module.exports = { parsear };
