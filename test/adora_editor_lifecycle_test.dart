import 'dart:async';

import 'package:fesync/modules/adora_live/adora_editor_cancion.dart';
import 'package:fesync/modules/adora_live/adora_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _existente = AdoraCancionModel(
  id: 'existente',
  titulo: 'Canción existente',
  autor: '',
  tono: 'D',
  letra: '[G]Letra',
  vozPrincipal: '',
  youtube: '',
  creadorUid: 'creador-original',
  fechaCreacion: null,
);

Finder _campo(String label) => find.byWidgetPredicate(
  (widget) => widget is TextField && widget.decoration?.labelText == label,
);

void main() {
  for (final caso in [
    (nombre: 'guardar sin preview', previews: 0, editar: false, guardar: true),
    (nombre: 'preview y guardar', previews: 1, editar: false, guardar: true),
    (
      nombre: 'editar, preview y guardar',
      previews: 1,
      editar: true,
      guardar: true,
    ),
    (nombre: 'preview y cancelar', previews: 1, editar: false, guardar: false),
    (
      nombre: 'tres previews y guardar',
      previews: 3,
      editar: false,
      guardar: true,
    ),
    (
      nombre: 'descartar durante guardado',
      previews: 1,
      editar: false,
      guardar: true,
    ),
  ]) {
    testWidgets('Editor: ${caso.nombre}', (tester) async {
      final navigator = GlobalKey<NavigatorState>();
      final persistencia = Completer<void>();
      final escrituras = <Map<String, dynamic>>[];
      Future<void>? cierre;
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: navigator,
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () {
                  cierre = mostrarEditorAdoraCancion(
                    context: context,
                    creadorUid: 'usuario',
                    cancion: caso.editar ? _existente : null,
                    guardar: (datos) async {
                      escrituras.add(datos);
                      await persistencia.future;
                    },
                  );
                },
                child: const Text('Abrir editor'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Abrir editor'));
      await tester.pumpAndSettle();
      await tester.enterText(_campo('Título'), 'Título actual');
      const letra = 'Intro: ////Bm - G - D - A////\nC#/A – D\nD   Em-D\nLetra';
      await tester.ensureVisible(_campo('Letra y acordes'));
      await tester.enterText(_campo('Letra y acordes'), letra);
      tester.testTextInput.hide();
      await tester.pumpAndSettle();

      for (var i = 0; i < caso.previews; i++) {
        await tester.ensureVisible(find.text('Vista previa'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Vista previa'));
        await tester.pumpAndSettle();
        expect(find.text('Título actual'), findsOneWidget);
        expect(find.byTooltip('Editar canción'), findsNothing);
        expect(escrituras, isEmpty);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextField>(_campo('Letra y acordes')).controller!.text,
          letra,
        );
      }

      if (caso.guardar) {
        await tester.ensureVisible(find.text('Guardar Canción'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Guardar Canción'));
        await tester.pump();
        expect(escrituras, hasLength(1));
        final botonGuardar = find.widgetWithText(
          ElevatedButton,
          'Guardar Canción',
        );
        expect(tester.widget<ElevatedButton>(botonGuardar).onPressed, isNull);
        expect(
          tester
              .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, 'Vista previa'),
              )
              .onPressed,
          isNull,
        );
        await tester.tap(botonGuardar);
        expect(escrituras, hasLength(1));
        expect(
          find.text(caso.editar ? 'Editar Canción' : 'Nueva Canción'),
          findsOneWidget,
        );
        expect(escrituras.single['titulo'], 'Título actual');
        expect(
          escrituras.single['letra'],
          'Intro:\nBm - G - D - A\nC#/A – D\nD   Em-D\nLetra',
        );
        expect(
          escrituras.single['creadorUid'],
          caso.editar ? 'creador-original' : 'usuario',
        );
        if (caso.nombre == 'descartar durante guardado') {
          navigator.currentState!.pop();
          await tester.pump();
          navigator.currentState!.push<void>(
            MaterialPageRoute(
              builder: (_) => const Scaffold(body: Text('Otra ruta')),
            ),
          );
          persistencia.complete();
          await tester.pumpAndSettle();
          expect(find.text('Otra ruta'), findsOneWidget);
          navigator.currentState!.pop();
        } else {
          persistencia.complete();
        }
      } else {
        navigator.currentState!.pop();
      }
      // Check the closing animation as well as the final unmount.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpAndSettle();
      await cierre;
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Abrir editor'), findsOneWidget);
      expect(navigator.currentState!.canPop(), isFalse);
      expect(escrituras.length, caso.guardar ? 1 : 0);
      expect(tester.takeException(), isNull);
    });
  }
}
