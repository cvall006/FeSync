import 'dart:async';

import 'package:fesync/core/services/navegacion_sesion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final rutas in [
    ['Perfil'],
    ['Módulo', 'Ruta interna', 'Perfil'],
  ]) {
    testWidgets('SignOut retira rutas autenticadas: ${rutas.join(' → ')}', (
      tester,
    ) async {
      final key = GlobalKey<NavigatorState>();
      final auth = StreamController<bool>();
      addTearDown(auth.close);
      final sesion = ValueNotifier(true);
      addTearDown(sesion.dispose);
      var cierres = 0;
      var aperturas = 0;
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: key,
          home: ValueListenableBuilder<bool>(
            valueListenable: sesion,
            builder: (_, activa, _) =>
                Scaffold(body: Text(activa ? 'Dashboard' : 'Login')),
          ),
        ),
      );
      final subscription = observarNavegacionSesion(
        cambios: auth.stream,
        inicialmenteAutenticado: true,
        navigatorKey: key,
        onSesionCerrada: () {
          cierres++;
          sesion.value = false;
        },
        onSesionAbierta: () {
          aperturas++;
          sesion.value = true;
        },
      );
      addTearDown(subscription.cancel);
      for (final ruta in rutas) {
        key.currentState!.push<void>(
          MaterialPageRoute(
            builder: (_) => Scaffold(appBar: AppBar(title: Text(ruta))),
          ),
        );
        await tester.pumpAndSettle();
      }
      // Firebase Auth emits this transition after a successful signOut.
      auth.add(false);
      await tester.pumpAndSettle();
      expect(find.text('Login'), findsOneWidget);
      for (final ruta in rutas) {
        expect(find.text(ruta), findsNothing);
      }
      expect(key.currentState!.canPop(), isFalse);
      expect(cierres, 1);
      auth.add(false);
      await tester.pumpAndSettle();
      expect(cierres, 1);
      auth.add(true);
      await tester.pumpAndSettle();
      expect(find.text('Dashboard'), findsOneWidget);
      expect(aperturas, 1);
      expect(tester.takeException(), isNull);
    });
  }
}
