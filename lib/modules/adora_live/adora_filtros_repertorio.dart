import 'adora_models.dart';

const tonosComunesAdora = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
];

String _normalizarFiltro(String texto) =>
    texto.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

List<AdoraCancionModel> filtrarRepertorioAdora(
  Iterable<AdoraCancionModel> canciones, {
  String nombre = '',
  String tono = '',
}) {
  final busqueda = _normalizarFiltro(nombre);
  final tonoElegido = _normalizarFiltro(tono);
  return canciones
      .where(
        (cancion) =>
            _normalizarFiltro(cancion.titulo).contains(busqueda) &&
            (tonoElegido.isEmpty ||
                _normalizarFiltro(cancion.tono) == tonoElegido),
      )
      .toList();
}

List<String> tonosDelRepertorio(
  Iterable<AdoraCancionModel> canciones, {
  String seleccionado = '',
}) {
  final tonos = <String, String>{};
  for (final tono in [
    ...tonosComunesAdora,
    ...canciones.map((c) => c.tono),
    seleccionado,
  ]) {
    final limpio = tono.trim();
    if (limpio.isNotEmpty) {
      tonos.putIfAbsent(_normalizarFiltro(limpio), () => limpio);
    }
  }
  if (seleccionado.trim().isNotEmpty) {
    tonos[_normalizarFiltro(seleccionado)] = seleccionado.trim();
  }
  return tonos.values.toList();
}
