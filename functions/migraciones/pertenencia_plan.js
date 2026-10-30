const { pertenenciaIdValido } = require('../pertenencia');

const tiene = (objeto, clave) => Object.prototype.hasOwnProperty.call(objeto, clave);

// Representaciones de datos, no snapshots, instancias Firebase ni objetos con getters.
function registro(valor) {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return (prototipo === Object.prototype || prototipo === null) &&
    Object.values(Object.getOwnPropertyDescriptors(valor)).every((campo) => 'value' in campo);
}

function identificador(valor, limite) {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= limite &&
    valor === valor.trim() && !/[\/\u0000-\u001f\u007f]/.test(valor) &&
    valor !== '.' && valor !== '..' && !/^__.*__$/.test(valor);
}

function resultado(categoria, motivo, estadoIdentificador = 'no_evaluado') {
  // Solo etiquetas estables para agregación; nunca se devuelven valores del perfil.
  return Object.freeze({ categoria, motivo, estadoIdentificador });
}

/**
 * Clasifica una observación, sin autorizar, generar IDs ni planificar escrituras.
 * Entrada: { uid, perfil, iglesia: { id, existe, adminUid },
 *            versionEsperada?, versionActual? }.
 * uid es el ID documental observado, nunca una identidad administrativa cliente.
 * perfil es un mapa de datos; null representa un perfil inexistente.
 * iglesia.existe debe ser booleano explícito; id identifica el documento consultado.
 * Las versiones son cadenas opacas normalizadas por el futuro adaptador (por ejemplo,
 * updateTime con segundos y nanosegundos completos); ambas se omiten o ambas se aportan.
 * Sin ellas no puede detectarse conflicto. No se usan fechas locales ni el reloj.
 *
 * Solo la ausencia de la CLAVE pertenenciaId admite candidatura. null, undefined,
 * vacío y tipos/formato incorrectos presentes son anomalías que nunca se reparan aquí.
 * Un formato válido NO acredita procedencia servidor. No se infieren períodos pasados,
 * iglesia inexistente por falta de datos, ni roles a partir de otros campos.
 *
 * Pendiente de la futura transacción: releer perfil/iglesia, comparar versión exacta,
 * pertenencia y administración vigentes, confirmar ausencia del campo y completar
 * todas las lecturas antes de generar/escribir ID y comprobante privado atómicamente.
 * Una candidatura no prueba vigencia futura ni protege contra salidas o reingresos.
 */
function clasificarPerfilPertenencia(entrada) {
  if (!registro(entrada) || !identificador(entrada.uid, 128)) {
    return resultado('revision', 'entrada_invalida');
  }
  const { perfil } = entrada;
  if (perfil === null) return resultado('revision', 'perfil_inexistente');
  if (!registro(perfil)) return resultado('revision', 'perfil_invalido');

  const estado = !tiene(perfil, 'pertenenciaId') ? 'ausente' :
    pertenenciaIdValido(perfil.pertenenciaId) ? 'existente_formato_valido' : 'existente_invalido';

  const esperada = tiene(entrada, 'versionEsperada');
  const actual = tiene(entrada, 'versionActual');
  if (esperada || actual) {
    if (!esperada || !actual || typeof entrada.versionEsperada !== 'string' ||
        typeof entrada.versionActual !== 'string' || !entrada.versionEsperada.trim() ||
        !entrada.versionActual.trim()) {
      return resultado('revision', 'versiones_invalidas', estado);
    }
    if (entrada.versionEsperada !== entrada.versionActual) {
      return resultado('conflicto', 'version_modificada', estado);
    }
  }

  // La salida actual elimina la clave iglesiaId. Valores presentes vacíos/null
  // no se equiparan a esa representación: se revisan sin corregir datos.
  if (!tiene(perfil, 'iglesiaId')) return resultado('omitido', 'sin_pertenencia', estado);
  if (!identificador(perfil.iglesiaId, 1500)) {
    return resultado('revision', 'iglesia_id_invalido', estado);
  }
  if (!['admin_iglesia', 'lider_area', 'servidor'].includes(perfil.rolGlobal)) {
    return resultado('revision', 'rol_no_reconocido', estado);
  }

  const { iglesia } = entrada;
  if (!registro(iglesia) || !identificador(iglesia.id, 1500) ||
      typeof iglesia.existe !== 'boolean') {
    return resultado('revision', 'iglesia_no_verificable', estado);
  }
  if (iglesia.id !== perfil.iglesiaId) {
    return resultado('revision', 'iglesia_no_coincidente', estado);
  }
  if (!iglesia.existe) return resultado('revision', 'iglesia_inexistente', estado);
  if (!identificador(iglesia.adminUid, 128)) {
    return resultado('revision', 'administracion_no_verificable', estado);
  }
  if ((perfil.rolGlobal === 'admin_iglesia') !== (entrada.uid === iglesia.adminUid)) {
    return resultado('revision', 'administracion_incoherente', estado);
  }
  if (estado === 'existente_invalido') {
    return resultado('revision', 'identificador_existente_invalido', estado);
  }
  if (estado === 'existente_formato_valido') {
    return resultado('omitido', 'identificador_existente_procedencia_no_acreditada', estado);
  }
  return resultado('candidato', 'identificador_ausente', estado);
}

module.exports = { clasificarPerfilPertenencia };
