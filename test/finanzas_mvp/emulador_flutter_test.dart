import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import '../finanzas_mvp_service_test.dart' show MemoriaFinanzas;

class _EmulatorTestBinding extends AutomatedTestWidgetsFlutterBinding {
  // Esta integración necesita HTTP real hacia los hosts locales validados abajo.
  @override
  bool get overrideHttpClient => false;
}

Future<Map<String, dynamic>> postLocal(
  String url,
  Map<String, dynamic> body, {
  String? token,
}) async {
  final uri = Uri.parse(url);
  if (uri.host != '127.0.0.1' || ![9098, 5008].contains(uri.port)) {
    throw StateError('Solo emuladores locales');
  }
  final client = HttpClient();
  try {
    final req = await client.postUrl(uri);
    req.headers.contentType = ContentType.json;
    if (token != null) {
      req.headers.set('Authorization', 'Bearer $token');
    }
    req.write(jsonEncode(body));
    final res = await req.close();
    final data = jsonDecode(
      await res.transform(utf8.decoder).join(),
    ) as Map<String, dynamic>;
    if (res.statusCode != 200 || data['error'] != null) {
      throw StateError(jsonEncode(data));
    }
    return data;
  } finally {
    client.close();
  }
}

void main() {
  if (const bool.fromEnvironment('FIN_MVP_EMULATOR_TEST')) {
    _EmulatorTestBinding();
  }
  testWidgets(
    'UI real → Auth Emulator → callables V1 → Firestore: cuenta, diezmo, gasto y saldos',
    (tester) async {
      // Este test requiere el arranque aislado y nunca prepara credenciales reales.
      final login = await tester.runAsync(
        () => postLocal(
          'http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',
          {
            'email': 'admin@finanzas.demo',
            'password': 'SoloDemo123!',
            'returnSecureToken': true,
          },
        ),
      );
      final token = login!['idToken'] as String;
      final servicio = FinanzasMvpService(
        almacen: MemoriaFinanzas(),
        uidActual: () => login['localId'] as String,
        llamar: (nombre, data) async => Map<String, dynamic>.from(
          (await postLocal(
                'http://127.0.0.1:5008/demo-fesync/southamerica-west1/$nombre',
                {'data': data},
                token: token,
              ))['result']
              as Map,
        ),
      );
      tester.view.physicalSize = const Size(1200, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      Future<void> esperar() async {
        for (var i = 0; i < 400; i++) {
          await tester.pump(const Duration(milliseconds: 100));
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 25)),
          );
          if (find.byType(CircularProgressIndicator).evaluate().isEmpty &&
              !tester.binding.hasScheduledFrame) {
            return;
          }
        }
        fail('La pantalla no terminó de cargar.');
      }

      Finder campo(String label) => find.widgetWithText(TextFormField, label);
      Future<void> crear(String boton, Map<String, String> valores) async {
        await tester.tap(find.widgetWithText(FilledButton, boton));
        await tester.pumpAndSettle();
        for (final e in valores.entries) {
          await tester.enterText(campo(e.key), e.value);
        }
        await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
        await esperar();
        expect(find.byType(AlertDialog), findsNothing);
        expect(
          find.byType(SelectableText),
          findsNothing,
          reason: 'No debe quedar error del backend.',
        );
      }

      final antes = await tester.runAsync(servicio.consultar);
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await esperar();
      expect(
        find.text('Saldo total: CLP ${antes!['saldoTotalMinor']}'),
        findsOneWidget,
      );
      await tester.tap(find.text('Cuentas'));
      await tester.pumpAndSettle();
      await crear('Nueva cuenta', {'Código': 'UI_CAJA', 'Nombre': 'Caja UI'});
      expect(find.text('Caja UI (caja)'), findsOneWidget);
      await tester.tap(find.text('Resumen'));
      await tester.pumpAndSettle();

      Future<void> registrar(
        String boton,
        String monto,
        String categoria,
      ) async {
        await tester.tap(find.widgetWithText(FilledButton, boton));
        await tester.pumpAndSettle();
        final dropdown = find.widgetWithText(
          DropdownButtonFormField<String>,
          'Cuenta',
        );
        await tester.tap(dropdown);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Caja UI').last);
        await tester.pumpAndSettle();
        final cat = find.widgetWithText(
          DropdownButtonFormField<String>,
          'Categoría',
        );
        await tester.tap(cat);
        await tester.pumpAndSettle();
        await tester.tap(find.text(categoria).last);
        await tester.pumpAndSettle();
        await tester.enterText(campo('Monto en CLP'), monto);
        await tester.enterText(
          campo('Fecha contable AAAA-MM-DD'),
          '2026-10-23',
        );
        await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
        await esperar();
        expect(find.byType(SelectableText), findsNothing);
      }

      await registrar('Nuevo ingreso', '5000', 'diezmos');
      await registrar('Nuevo gasto', '1200', 'Gastos');
      expect(
        find.text(
          'Saldo total: CLP ${(antes['saldoTotalMinor'] as int) + 3800}',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Cuentas'));
      await tester.pumpAndSettle();
      expect(find.text('CLP 3800'), findsOneWidget);
      await tester.tap(find.text('Historial'));
      await tester.pumpAndSettle();
      final despues = await tester.runAsync(servicio.consultar);
      expect(
        (despues!['movimientos'] as List).length,
        (antes['movimientos'] as List).length + 2,
      );
      expect(find.textContaining('gasto'), findsWidgets);
      expect(await tester.runAsync(servicio.pendiente), isNull);
    },
    skip: !const bool.fromEnvironment('FIN_MVP_EMULATOR_TEST'),
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
