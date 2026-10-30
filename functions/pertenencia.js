const { randomBytes } = require('node:crypto');

// Identificador opaco de 256 bits, independiente de UID, iglesia y reloj.
// Solo para servidor; no es un secreto ni sustituye Auth o la autorización.
// Sin Firebase, escrituras ni migración; los callables de ingreso lo reutilizan.
function generarPertenenciaId() {
  return randomBytes(32).toString('hex');
}

// Comprueba formato, nunca procedencia ni vigencia de la pertenencia.
function pertenenciaIdValido(valor) {
  return typeof valor === 'string' && valor.length === 64 && /^[a-f0-9]{64}$/.test(valor);
}

// Pendiente antes de usarlo como precondición de desvinculación:
// - vinculación/creación ya renuevan el ID y validan el perfil dentro de la
//   misma transacción que escribe la pertenencia;
// - migrar perfiles sin ID mediante Admin y transacción, revalidando iglesia
//   y rol, sin sobrescribir valores existentes. Un valor previo a las reglas
//   protectoras no prueba origen servidor, aunque tenga formato válido;
// - coordinar salida/expulsión, revocación financiera y recibo idempotente
//   ligado al período; cerrar vías cliente que eludan esa operación;
// - la transferencia conserva el período, revalidando administración vigente.
// Las salidas cliente actuales conservan el campo, y aún no hay desvinculación
// centralizada que compare períodos: no protege contra solicitudes antiguas ni debe usarse
// para habilitar operaciones que dependan de dicha garantía.
module.exports = { generarPertenenciaId, pertenenciaIdValido };
