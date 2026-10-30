// Diagnóstico acotado: nunca incluye message, stack, URLs, documentos ni tokens.
const FASES = new Set(['preparacion', 'auth', 'callable', 'fixtures', 'reglas']);
const CODIGOS = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
  'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'ERR_ASSERTION', 'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND', 'ABORTED', 'UNAVAILABLE', 'DEADLINE_EXCEEDED',
  'PERMISSION_DENIED', 'UNAUTHENTICATED', 'FAILED_PRECONDITION', 'INTERNAL',
  'NOT_FOUND', 'INVALID_ARGUMENT', 'ALREADY_EXISTS',
  'HTTP_400', 'HTTP_401', 'HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_500', 'HTTP_503',
  'RESPUESTA_NO_JSON']);

function resumirFallo(fase, error) {
  if (!FASES.has(fase)) throw new Error('Fase de diagnóstico inválida.');
  const observado = error?.code ?? error?.cause?.code;
  const codigo = CODIGOS.has(observado) ? observado :
    [4, 10, 14].includes(observado) ? observado : 'NO_CLASIFICADO';
  return { fase, codigo };
}

async function conEtapa(fase, accion) {
  if (!FASES.has(fase)) throw new Error('Fase de diagnóstico inválida.');
  try { return await accion(); }
  catch (error) {
    console.error(`DIAGNOSTICO_MEMBRESIA ${JSON.stringify(resumirFallo(fase, error))}`);
    throw error;
  }
}

module.exports = { conEtapa, resumirFallo };
