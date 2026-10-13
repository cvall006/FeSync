import '../../core/models/app_models.dart';
import 'capacitaciones_models.dart';

bool puedeAdministrarCapacitaciones(UsuarioModel usuario) =>
    usuario.iglesiaId.isNotEmpty &&
    const ['admin_iglesia', 'lider_area'].contains(usuario.rolGlobal);

List<CapacitacionCategoriaModel> categoriasVisibles(
  Iterable<CapacitacionCategoriaModel> categorias,
  bool administrador,
) {
  final lista = categorias.where((c) => administrador || c.activa).toList()
    ..sort((a, b) {
      final orden = a.orden.compareTo(b.orden);
      return orden != 0
          ? orden
          : a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
    });
  return [CapacitacionCategoriaModel.general, ...lista];
}

String categoriaEfectiva(
  CapacitacionModel contenido,
  Iterable<CapacitacionCategoriaModel> categorias,
) =>
    contenido.categoriaId.isEmpty ||
        !categorias.any((c) => c.id == contenido.categoriaId)
    ? ''
    : contenido.categoriaId;

List<CapacitacionModel> filtrarCapacitaciones(
  Iterable<CapacitacionModel> contenidos,
  String busqueda, {
  String? categoriaId,
  Iterable<CapacitacionCategoriaModel> categorias = const [],
}) {
  final termino = busqueda.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
  return contenidos
      .where(
        (c) =>
            (categoriaId == null ||
                categoriaEfectiva(c, categorias) == categoriaId) &&
            (termino.isEmpty ||
                [c.titulo, c.descripcion, c.contenido].any(
                  (t) => t
                      .toLowerCase()
                      .replaceAll(RegExp(r'\s+'), ' ')
                      .contains(termino),
                )),
      )
      .toList();
}

Uri? enlaceCapacitacionSeguro(String texto) {
  final uri = Uri.tryParse(texto.trim());
  return uri != null &&
          const ['http', 'https'].contains(uri.scheme) &&
          uri.host.isNotEmpty
      ? uri
      : null;
}
