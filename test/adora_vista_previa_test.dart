import 'package:fesync/modules/adora_live/adora_models.dart';
import 'package:fesync/modules/adora_live/adora_visor_cancion_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

AdoraCancionModel cancionTemporal(String letra) => AdoraCancionModel(
  id: 'vista-previa',
  titulo: 'Canción sin guardar',
  autor: 'Autor',
  tono: 'D',
  letra: letra,
  vozPrincipal: '',
  youtube: 'Guitarra: https://youtube.com/watch?v=prueba',
  creadorUid: 'usuario',
  fechaCreacion: null,
);

void main() {
  final casos = {
    'A: sección, acordes y letra': 'VERSO 1\n     G                    Am          G\nTe alabo en el valle, Te alabo en el monte',
    'B: intro combinada': 'Intro: ////Bm - G - D - A////',
    'C: progresión compacta':
        'D               Em-D\nQuien podrá separarme de ti Dios',
    'D: slash chord': 'C#/A – D',
    'E: canción heredada': 'Intro:\n[Bm] [-] [G] [-] [D] [-] [A]\n\nQu[Bm]iero levantar a ti[G] mis manos...',
  };

  for (final caso in casos.entries) {
    testWidgets('Preview conserva el render del visor: ${caso.key}', (
      tester,
    ) async {
      final cancion = cancionTemporal(caso.value);
      await tester.pumpWidget(
        MaterialApp(
          home: AdoraVisorCancionScreen(cancion: cancion, puedeEditar: true),
        ),
      );
      expect(find.byTooltip('Editar canción'), findsOneWidget);
      final bodyNormal = tester.widget<Scaffold>(find.byType(Scaffold)).body!;
      final renderNormal = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byWidget(bodyNormal),
              matching: find.byType(Text),
            ),
          )
          .map((text) => (text.data, text.style))
          .toList();

      await tester.pumpWidget(
        MaterialApp(
          home: AdoraVisorCancionScreen(
            cancion: cancion,
            puedeEditar: true,
            esVistaPrevia: true,
          ),
        ),
      );
      expect(find.text('Vista previa'), findsOneWidget);
      expect(find.text('Canción sin guardar'), findsOneWidget);
      expect(find.byTooltip('Editar canción'), findsNothing);
      final bodyPreview = tester.widget<Scaffold>(find.byType(Scaffold)).body!;
      final renderPreview = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byWidget(bodyPreview),
              matching: find.byType(Text),
            ),
          )
          .map((text) => (text.data, text.style))
          .toList();
      expect(renderPreview, renderNormal);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'Preview permite transposición, mic, tutoriales, autoscroll y Back',
    (tester) async {
      final navigator = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: const Scaffold(body: Text('Pantalla anterior')),
        ),
      );
      final cancion = cancionTemporal(
        'Em-D\nC#/A – D\n[G]Letra\n${List.filled(40, 'Otra línea').join('\n')}',
      );
      final cierre = navigator.currentState!.push<void>(
        MaterialPageRoute(
          builder: (_) => AdoraVisorCancionScreen(
            cancion: cancion,
            puedeEditar: false,
            esVistaPrevia: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(BackButton), findsOneWidget);
      expect(find.byTooltip('Editar canción'), findsNothing);
      expect(find.text('Em-D'), findsOneWidget);
      expect(find.text('C#/A\u00A0–\u00A0D'), findsOneWidget);

      await tester.tap(find.byTooltip('Subir semitono'));
      await tester.pump();
      expect(find.text('Fm-D#'), findsOneWidget);
      expect(find.text('D/A#\u00A0–\u00A0D#'), findsOneWidget);
      await tester.tap(find.byTooltip('Solo letra'));
      await tester.pump();
      expect(find.text('Letra'), findsOneWidget);
      expect(find.text('Fm-D#'), findsNothing);
      await tester.tap(find.byTooltip('Mostrar acordes'));
      await tester.pump();
      expect(find.text('Fm-D#'), findsOneWidget);

      await tester.tap(find.byTooltip('Material de ensayo'));
      await tester.pumpAndSettle();
      expect(find.text('Guitarra'), findsOneWidget);
      navigator.currentState!.pop();
      await tester.pumpAndSettle();

      final scroll = tester
          .widget<SingleChildScrollView>(
            find.byWidgetPredicate(
              (widget) =>
                  widget is SingleChildScrollView && widget.controller != null,
            ),
          )
          .controller!;
      expect(scroll.offset, 0);
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(scroll.offset, greaterThan(0));
      expect(find.byIcon(Icons.pause), findsOneWidget);

      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      await cierre;
      expect(find.text('Pantalla anterior'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
