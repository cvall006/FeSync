const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resumirFallo } = require('../../test/desvinculacion_integracion/diagnostico');

test('Diagnóstico: códigos de transporte y Firestore sin datos del error', () => {
  for (const code of ['ECONNREFUSED', 'UNAUTHENTICATED', 14, 4, 10]) {
    assert.deepEqual(resumirFallo('fixtures', { code, message: 'TOKEN_PRIVADO',
      stack: 'RUTA_PRIVADA', datos: { uid: 'UID_PRIVADO' } }), { fase: 'fixtures', codigo: code });
  }
  assert.deepEqual(resumirFallo('auth', { cause: { code: 'ECONNRESET' } }),
    { fase: 'auth', codigo: 'ECONNRESET' });
});

test('Diagnóstico: ni código arbitrario ni fase dinámica se exportan', () => {
  assert.deepEqual(resumirFallo('callable', { code: 'TOKEN_PRIVADO\nsecreto' }),
    { fase: 'callable', codigo: 'NO_CLASIFICADO' });
  assert.throws(() => resumirFallo('UID_PRIVADO', {}), /inválida/);
});
