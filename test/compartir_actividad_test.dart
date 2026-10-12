import 'package:fesync/modules/agenda/agenda_models.dart';
import 'package:fesync/modules/agenda/compartir_actividad.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

EventoAgendaModel evento({bool vacio = false}) => EventoAgendaModel(
  id: 'id-interno',
  creadorUid: 'uid-privado',
  fecha: DateTime(2026, 10, 18),
  titulo: vacio ? ' ' : 'Reunión de Jóvenes',
  hora: vacio ? '' : '19:00',
  lugar: vacio ? '' : 'Templo principal',
  descripcion: vacio ? '' : 'Encuentro de jóvenes de nuestra iglesia.',
);

void main() {
  test('Texto público contiene título, fecha, hora, lugar y descripción', () {
    expect(
      generarTextoActividad(evento()),
      '📅 Reunión de Jóvenes\n🗓 Domingo 18 de octubre de 2026\n🕒 19:00\n📍 Templo principal\n\n📝 Encuentro de jóvenes de nuestra iglesia.\n\nCompartido desde FeSync',
    );
    expect(generarTextoActividad(evento()), isNot(contains('id-interno')));
    expect(generarTextoActividad(evento()), isNot(contains('uid-privado')));
  });
  test('Campos vacíos se omiten sin líneas vacías adicionales', () {
    expect(
      generarTextoActividad(evento(vacio: true)),
      '🗓 Domingo 18 de octubre de 2026\n\nCompartido desde FeSync',
    );
  });
  for (final falla in [false, true]) {
    testWidgets(
      'Compartir actividad ${falla ? 'maneja plataforma no disponible' : 'funciona sin permiso admin'}',
      (tester) async {
        Map<dynamic, dynamic>? parametros;
        const canal = MethodChannel('dev.fluttercommunity.plus/share');
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(canal, (
          call,
        ) async {
          parametros = call.arguments as Map;
          if (falla) throw PlatformException(code: 'unavailable');
          return 'app';
        });
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            canal,
            null,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: CompartirActividadButton(evento: evento())),
          ),
        );
        await tester.tap(find.text('Compartir'));
        await tester.pumpAndSettle();
        expect(parametros?['text'], generarTextoActividad(evento()));
        expect(parametros?.containsKey('paths'), isFalse);
        if (falla) {
          expect(
            find.text('No fue posible compartir la actividad.'),
            findsOneWidget,
          );
          expect(find.text('Copiar texto'), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
