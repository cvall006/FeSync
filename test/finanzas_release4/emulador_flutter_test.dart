import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import '../finanzas_mvp_service_test.dart' show MemoriaFinanzas;

class _BindingLocal extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

Future<Map<String, dynamic>> _post(
  String ruta,
  Map<String, dynamic> datos, {
  String? token,
}) async {
  final uri = Uri.parse(ruta);
  if (uri.host != '127.0.0.1' || ![9098, 5018].contains(uri.port)) {
    throw StateError('Solo Auth y Functions locales.');
  }
  final cliente = HttpClient();
  try {
    final req = await cliente.postUrl(uri);
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set('Authorization', 'Bearer $token');
    req.write(jsonEncode(datos));
    final res = await req.close();
    final data = jsonDecode(
      await res.transform(utf8.decoder).join(),
    ) as Map<String, dynamic>;
    if (res.statusCode != 200 || data['error'] != null) {
      throw StateError(jsonEncode(data));
    }
    return data;
  } finally {
    cliente.close();
  }
}

void main() {
  const activa = bool.fromEnvironment('FIN_RELEASE4_EMULATOR_TEST');
  if (activa) _BindingLocal();
  testWidgets(
    'Flutter real → Auth demo → entrada normal: gasto, saldo y paginación',
    (tester) async {
      final evidencia = jsonDecode(
        File('docs/fin_release_4_2026-10-24/emulador.json').readAsStringSync(),
      ) as Map<String, dynamic>;
      expect(evidencia['proyecto'], 'demo-fesync');
      expect(evidencia['entrada'], 'functions/index.js');
      final fixture = evidencia['flutter'] as Map<String, dynamic>;
      expect(fixture['functionsPort'], 5018);
      expect((fixture['email'] as String).endsWith('@release3.demo'), isTrue);
      final login = await tester.runAsync(
        () => _post(
          'http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',
          {
            'email': fixture['email'],
            'password': 'SoloDemo123!',
            'returnSecureToken': true,
          },
        ),
      );
      final llamadas = <String>[];
      var paginasCargadas = 0;
      final servicio = FinanzasMvpService(
        almacen: MemoriaFinanzas(),
        uidActual: () => login!['localId'] as String,
        llamar: (nombre, datos) async {
          final destino = switch (nombre) {
            'finanzasMvpConsultar' => 'finanzasV1Consultar',
            'finanzasMvpEjecutar' => 'finanzasV1Ejecutar',
            _ => throw StateError('No inicializar fixtures desde el cliente.'),
          };
          llamadas.add(destino);
          if (datos['cursor'] != null) paginasCargadas++;
          return Map<String, dynamic>.from(
            (await _post(
                  'http://127.0.0.1:5018/demo-fesync/southamerica-west1/$destino',
                  {'data': datos},
                  token: login!['idToken'] as String,
                ))['result']
                as Map,
          );
        },
      );
      tester.view.physicalSize = const Size(1200, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Future<void> esperar() async {
        for (var i = 0; i < 600; i++) {
          await tester.pump(const Duration(milliseconds: 100));
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 25)),
          );
          if (find.byType(CircularProgressIndicator).evaluate().isEmpty &&
              find.text('Cargando historial…').evaluate().isEmpty &&
              !tester.binding.hasScheduledFrame) {
            return;
          }
        }
        fail('La pantalla no terminó de cargar.');
      }

      final antes = await tester.runAsync(servicio.consultar);
      final corteAntes = antes!['historial']['corte'] as int;
      expect(corteAntes, greaterThanOrEqualTo(199));
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await esperar();
      expect(
        find.text('Saldo total: CLP ${antes['saldoTotalMinor']}'),
        findsOneWidget,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Nuevo gasto'));
      await tester.pumpAndSettle();
      for (final e in {'Cuenta': 'caja', 'Categoría': 'gasto'}.entries) {
        await tester.tap(
          find.widgetWithText(DropdownButtonFormField<String>, e.key),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(e.value).last);
        await tester.pumpAndSettle();
      }
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Monto en CLP'),
        '17',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Fecha contable AAAA-MM-DD'),
        '2026-10-24',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      await esperar();
      final despues = await tester.runAsync(servicio.consultar);
      expect(
        despues!['saldoTotalMinor'],
        (antes['saldoTotalMinor'] as int) - 17,
      );
      expect(despues['historial']['corte'], corteAntes + 1);
      expect(await tester.runAsync(servicio.pendiente), isNull);
      await tester.tap(find.text('Historial'));
      await tester.pumpAndSettle();
      final boton = find.widgetWithText(TextButton, 'Cargar más movimientos');
      // ListView construye el botón cuando se aproxima al final de la página.
      await tester.scrollUntilVisible(
        boton,
        800,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 40,
      );
      await tester.tap(boton);
      await esperar();
      expect(llamadas.where((n) => n == 'finanzasV1Ejecutar').length, 1);
      expect(paginasCargadas, 1);
      expect(find.byType(SelectableText), findsNothing);
      File('docs/fin_release_4_2026-10-24/flutter-emulador.json')
          .writeAsStringSync(
            jsonEncode({
              'proyecto': 'demo-fesync',
              'entrada': 'functions/index.js',
              'saldoAntes': antes['saldoTotalMinor'],
              'saldoDespues': despues['saldoTotalMinor'],
              'secuencia': corteAntes + 1,
              'paginacionDesdePantalla': true,
              'paginasAdicionales': paginasCargadas,
              'llamadas': llamadas,
            }),
          );
    },
    skip: !activa,
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
