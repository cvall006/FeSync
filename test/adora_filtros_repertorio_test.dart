import 'package:fesync/modules/adora_live/adora_filtros_repertorio.dart';
import 'package:fesync/modules/adora_live/adora_models.dart';
import 'package:flutter_test/flutter_test.dart';

AdoraCancionModel cancion(String titulo, String tono) => AdoraCancionModel(
  id: titulo,
  titulo: titulo,
  tono: tono,
  autor: '',
  letra: '[G]Letra',
  vozPrincipal: '',
  youtube: '',
  creadorUid: '',
  fechaCreacion: null,
);

void main() {
  final canciones = [
    cancion('Santo por siempre', 'G'),
    cancion('SANTO  eres', 'Do'),
    cancion('Te alabo', 'G'),
    cancion('Santo Dios', 'Db'),
  ];
  test('Búsqueda parcial, case insensitive y espacios normalizados', () {
    expect(filtrarRepertorioAdora(canciones, nombre: ' san ').length, 3);
    expect(
      filtrarRepertorioAdora(canciones, nombre: ' sAnTo   ErEs ').single.titulo,
      'SANTO  eres',
    );
  });
  test('Filtra tono y mantiene separados Do/C y Db/C#', () {
    expect(filtrarRepertorioAdora(canciones, tono: ' g ').length, 2);
    expect(
      filtrarRepertorioAdora(canciones, tono: 'Do').single.titulo,
      'SANTO  eres',
    );
    expect(filtrarRepertorioAdora(canciones, tono: 'C'), isEmpty);
    expect(filtrarRepertorioAdora(canciones, tono: 'C#'), isEmpty);
    expect(
      filtrarRepertorioAdora(canciones, tono: 'Db').single.titulo,
      'Santo Dios',
    );
  });
  test('Combina nombre y tono sin cambiar el snapshot ni sus modelos', () {
    final resultado = filtrarRepertorioAdora(
      canciones,
      nombre: 'Santo',
      tono: 'G',
    );
    expect(resultado.single, same(canciones.first));
    expect(canciones, hasLength(4));
  });
  test('Sin resultados y Todos los tonos', () {
    expect(filtrarRepertorioAdora(canciones, nombre: 'inexistente'), isEmpty);
    expect(
      filtrarRepertorioAdora(canciones, nombre: 'Santo', tono: ''),
      hasLength(3),
    );
    expect(filtrarRepertorioAdora(canciones), canciones);
  });
  test(
    'Dropdown incluye tonos comunes, latinos y personalizados del snapshot',
    () {
      final tonos = tonosDelRepertorio([...canciones, cancion('Otra', 'Fa#m')]);
      expect(tonos, containsAll([...tonosComunesAdora, 'Do', 'Fa#m']));
      expect(tonos.toSet().length, tonos.length);
      expect(
        tonosDelRepertorio([cancion('Otra', 'do')], seleccionado: 'Do'),
        contains('Do'),
      );
      expect(tonosDelRepertorio([], seleccionado: 'Fa#m'), contains('Fa#m'));
    },
  );
}
