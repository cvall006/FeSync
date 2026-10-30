'use strict';

const { exigir, registroExacto, validarEnteroMinor } = require('./dinero');
const TIPOS_INGRESO = Object.freeze(['diezmos', 'ofrendas', 'donaciones', 'otros']);
const CAMPOS = Object.freeze(['versionEsquema', 'id', 'iglesiaId', 'codigo', 'nombre',
  'naturaleza', 'tipoIngreso', 'estado']);

function idValido(v, limite = 128) {
  return typeof v === 'string' && v.length > 0 && v.length <= limite &&
    Buffer.byteLength(v, 'utf8') <= 1500 && v === v.trim() &&
    !/[\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}
function validarCategoria(categoria, iglesiaId) {
  registroExacto(categoria, CAMPOS);
  exigir(idValido(iglesiaId, 1500) && categoria.iglesiaId === iglesiaId, 'CATEGORIA_OTRA_IGLESIA');
  exigir(idValido(categoria.id), 'CATEGORIA_ID_INVALIDO');
  exigir(categoria.versionEsquema === 1, 'CATEGORIA_VERSION_INVALIDA');
  exigir(typeof categoria.codigo === 'string' && categoria.codigo === categoria.codigo.trim() &&
    /^[A-Z][A-Z0-9_]{0,31}$/.test(categoria.codigo) &&
    !['TRANSFERENCIA', 'TRANSFERENCIAS', 'APERTURA', 'APERTURAS', 'AJUSTE', 'AJUSTES'].includes(categoria.codigo),
  'CATEGORIA_CODIGO_INVALIDO');
  exigir(typeof categoria.nombre === 'string' && categoria.nombre === categoria.nombre.trim() &&
    categoria.nombre === categoria.nombre.normalize('NFC') && Array.from(categoria.nombre).length >= 1 &&
    Array.from(categoria.nombre).length <= 80 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(categoria.nombre), 'CATEGORIA_NOMBRE_INVALIDO');
  exigir(['ingreso', 'gasto'].includes(categoria.naturaleza), 'CATEGORIA_NATURALEZA_INVALIDA');
  exigir(categoria.naturaleza === 'ingreso' ? TIPOS_INGRESO.includes(categoria.tipoIngreso)
    : categoria.tipoIngreso === null, 'CATEGORIA_TIPO_INGRESO_INVALIDO');
  exigir(['activa', 'archivada'].includes(categoria.estado), 'CATEGORIA_ESTADO_INVALIDO');
  return Object.freeze({ ...categoria });
}
function validarCatalogoCategorias(categorias, iglesiaId) {
  exigir(idValido(iglesiaId, 1500) && Array.isArray(categorias), 'CATALOGO_CATEGORIAS_INVALIDO');
  const ids = new Set(), codigos = new Set(), resultado = [];
  for (const entrada of categorias) {
    const categoria = validarCategoria(entrada, iglesiaId);
    exigir(!ids.has(categoria.id), 'CATEGORIA_ID_DUPLICADO');
    exigir(!codigos.has(categoria.codigo), 'CATEGORIA_CODIGO_DUPLICADO');
    ids.add(categoria.id); codigos.add(categoria.codigo); resultado.push(categoria);
  }
  return Object.freeze(resultado);
}
function crearCategoria(entrada) {
  registroExacto(entrada, ['iglesiaId', 'categoria', 'catalogo']);
  const categoria = validarCategoria(entrada.categoria, entrada.iglesiaId);
  exigir(categoria.estado === 'activa', 'CATEGORIA_NUEVA_INACTIVA');
  validarCatalogoCategorias([...validarCatalogoCategorias(entrada.catalogo, entrada.iglesiaId), categoria], entrada.iglesiaId);
  return categoria;
}
function actualizarCategoria(entrada) {
  registroExacto(entrada, ['iglesiaId', 'actual', 'propuesta', 'catalogo', 'estadoUso']);
  const { iglesiaId } = entrada;
  const actual = validarCategoria(entrada.actual, iglesiaId);
  const propuesta = validarCategoria(entrada.propuesta, iglesiaId);
  const catalogo = validarCatalogoCategorias(entrada.catalogo, iglesiaId);
  const observada = catalogo.find((c) => c.id === actual.id);
  exigir(observada && CAMPOS.every((k) => observada[k] === actual[k]), 'CATEGORIA_ACTUAL_NO_COINCIDE');
  exigir(propuesta.id === actual.id && propuesta.codigo === actual.codigo, 'CATEGORIA_IDENTIDAD_INMUTABLE');
  const uso = entrada.estadoUso;
  registroExacto(uso, ['iglesiaId', 'categoriaId', 'huboMovimientos', 'solicitudesInciertas']);
  exigir(uso.iglesiaId === iglesiaId && uso.categoriaId === actual.id, 'ESTADO_CATEGORIA_AJENO');
  exigir(typeof uso.huboMovimientos === 'boolean', 'HISTORIAL_CATEGORIA_INVALIDO');
  validarEnteroMinor(uso.solicitudesInciertas);
  exigir(uso.solicitudesInciertas >= 0, 'SOLICITUDES_INVALIDAS');
  if (uso.huboMovimientos || uso.solicitudesInciertas > 0) {
    exigir(actual.naturaleza === propuesta.naturaleza && actual.tipoIngreso === propuesta.tipoIngreso,
      'CATEGORIA_USADA_INMUTABLE');
  }
  exigir(actual.estado !== 'archivada' || propuesta.estado === 'archivada', 'CATEGORIA_ARCHIVO_TERMINAL');
  if (propuesta.estado === 'archivada') exigir(uso.solicitudesInciertas === 0, 'CATEGORIA_CON_SOLICITUDES_INCIERTAS');
  validarCatalogoCategorias(catalogo.map((c) => c.id === actual.id ? propuesta : c), iglesiaId);
  return propuesta;
}
function categoriaParaNuevoMovimiento(entrada) {
  registroExacto(entrada, ['iglesiaId', 'categoria', 'clase']);
  const categoria = validarCategoria(entrada.categoria, entrada.iglesiaId);
  exigir(categoria.estado === 'activa', 'CATEGORIA_ARCHIVADA');
  exigir(['ingreso', 'gasto'].includes(entrada.clase) && entrada.clase === categoria.naturaleza,
    'CATEGORIA_MOVIMIENTO_INCOMPATIBLE');
  return categoria;
}
function categoriasIngresoIniciales(iglesiaId) {
  return validarCatalogoCategorias(TIPOS_INGRESO.map((tipoIngreso) => ({
    versionEsquema: 1, id: tipoIngreso, iglesiaId, codigo: tipoIngreso.toUpperCase(),
    nombre: tipoIngreso[0].toUpperCase() + tipoIngreso.slice(1),
    naturaleza: 'ingreso', tipoIngreso, estado: 'activa',
  })), iglesiaId);
}

module.exports = Object.freeze({ TIPOS_INGRESO, validarCategoria, validarCatalogoCategorias,
  crearCategoria, actualizarCategoria, categoriaParaNuevoMovimiento, categoriasIngresoIniciales });
