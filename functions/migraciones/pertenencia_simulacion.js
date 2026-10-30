const { clasificarPerfilPertenencia } = require('./pertenencia_plan');

// El ejecutor de pruebas debe llamar a esta guarda ANTES de inicializar cualquier SDK.
function verificarEntornoEmulador({ proyecto, firestoreHost, storageHost } = {}) {
  if (proyecto !== 'demo-fesync' || firestoreHost !== '127.0.0.1:8088' ||
      (storageHost !== undefined && storageHost !== '127.0.0.1:9198')) {
    throw new Error('Entorno de emuladores no autorizado.');
  }
}

function entero(valor, maximo) {
  return Number.isSafeInteger(valor) && valor > 0 && valor <= maximo;
}

function idValido(valor) {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 1500 &&
    !valor.includes('/') && valor !== '.' && valor !== '..';
}

function posterior(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')) > 0;
}

/**
 * Lector inyectado de SOLO LECTURA:
 * listarPerfiles({ despuesDe, limite }) -> [{ id, perfil, version }], orden UTF-8
 * ascendente por ID, cursor exclusivo; una página corta significa fin observado.
 * leerPerfil(id) -> { perfil, version }, o null si el documento desapareció.
 * leerIglesia(id) -> { id, existe: boolean, adminUid? }.
 * Las versiones son updateTime normalizados sin perder nanosegundos.
 * No acepta SDKs ni inicializa Admin. Solo invoca estos tres métodos.
 * No devuelve cursor ni documentos. No mantiene caché de iglesias/perfiles.
 * Los límites son estrictos; una lectura fallida se contabiliza sin exponer el error.
 * La relectura detecta algunos cambios, pero NO produce una fotografía transaccional.
 */
async function simularPertenencias({ lector, tamanoPagina = 50, maxPaginas = 10,
  maxPerfiles = 500, cursorInicial = null } = {}) {
  if (!lector || !['listarPerfiles', 'leerPerfil', 'leerIglesia']
    .every((metodo) => typeof lector[metodo] === 'function') ||
      !entero(tamanoPagina, 100) || !entero(maxPaginas, 100) ||
      !entero(maxPerfiles, 10000) || (cursorInicial !== null && !idValido(cursorInicial))) {
    throw new Error('Configuración de simulación inválida.');
  }
  const totales = {
    perfiles: 0, paginas: 0, lecturas: 0, completa: false,
    porCategoria: { candidato: 0, omitido: 0, revision: 0, conflicto: 0 },
    porMotivo: {},
    incidencias: { error_paginacion: 0, pagina_invalida: 0, limite_alcanzado: 0 },
  };
  function contar(clasificacion) {
    totales.perfiles += 1;
    totales.porCategoria[clasificacion.categoria] += 1;
    totales.porMotivo[clasificacion.motivo] = (totales.porMotivo[clasificacion.motivo] ?? 0) + 1;
  }
  let cursor = cursorInicial;
  while (totales.paginas < maxPaginas && totales.perfiles < maxPerfiles) {
    const limite = Math.min(tamanoPagina, maxPerfiles - totales.perfiles);
    let pagina;
    try {
      totales.lecturas += 1;
      pagina = await lector.listarPerfiles({ despuesDe: cursor, limite });
    } catch {
      totales.incidencias.error_paginacion += 1;
      return totales;
    }
    totales.paginas += 1;
    let anterior = cursor;
    if (!Array.isArray(pagina) || pagina.length > limite || !Array.from(pagina).every((item) => {
      if (!item || !idValido(item.id) || (anterior !== null && !posterior(item.id, anterior))) {
        return false;
      }
      anterior = item.id;
      return true;
    })) {
      totales.incidencias.pagina_invalida += 1;
      return totales;
    }
    for (const item of pagina) {
      let actual;
      try {
        totales.lecturas += 1;
        actual = await lector.leerPerfil(item.id);
      } catch {
        contar({ categoria: 'revision', motivo: 'error_lectura_perfil' });
        continue;
      }
      const entrada = { uid: item.id, perfil: actual?.perfil ?? null };
      if (actual !== null && actual !== undefined) {
        entrada.versionEsperada = item.version;
        entrada.versionActual = actual.version;
      }
      let clasificacion = clasificarPerfilPertenencia(entrada);
      // El clasificador decide si corresponde consultar la iglesia; no se repiten
      // aquí sus condiciones de pertenencia, roles ni administración.
      if (clasificacion.motivo === 'iglesia_no_verificable') {
        try {
          totales.lecturas += 1;
          entrada.iglesia = await lector.leerIglesia(actual.perfil.iglesiaId);
          clasificacion = clasificarPerfilPertenencia(entrada);
        } catch {
          clasificacion = { categoria: 'revision', motivo: 'error_lectura_iglesia' };
        }
      }
      contar(clasificacion);
    }
    if (pagina.length < limite) {
      totales.completa = true;
      return totales;
    }
    cursor = anterior;
  }
  totales.incidencias.limite_alcanzado += 1;
  return totales;
}

module.exports = { simularPertenencias, verificarEntornoEmulador };
