// ignore_for_file: depend_on_referenced_packages
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:cloud_firestore_platform_interface/cloud_firestore_platform_interface.dart';
import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart';
import 'package:firebase_storage_platform_interface/firebase_storage_platform_interface.dart';
import 'package:fesync/main.dart' as app;
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import 'plataformas_locales.dart';

class _Binding extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void main() {
  const activa = bool.fromEnvironment('FIN_RELEASE8_EMULATOR_TEST');
  if (activa) _Binding();
  testWidgets(
    'main.dart → Dashboard → Finanzas → SDK normal → emuladores; recuperación sin mapper',
    (tester) async {
      HttpOverrides.global = SoloLocal();
      addTearDown(() => HttpOverrides.global = null);
      final evidence = jsonDecode(
        File('docs/fin_release_8_2026-10-26/emulador.json').readAsStringSync(),
      ) as Map<String, dynamic>;
      final fixture = evidence['flutter'] as Map;
      sesion = (await tester.runAsync(
        () => http(
          'http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',
          body: {
            'email': fixture['email'],
            'password': 'SoloDemo123!',
            'returnSecureToken': true,
          },
        ),
      ))!;
      FirebasePlatform.instance = CoreLocal();
      FirebaseAuthPlatform.instance = AuthLocal();
      FirebaseFirestorePlatform.instance = StoreLocal();
      FirebaseFunctionsPlatform.instance = FunctionsLocal();
      FirebaseStoragePlatform.instance = StorageLocal();
      final almacen = <String, String>{};
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
        (call) async {
          final a = Map<String, dynamic>.from(call.arguments as Map);
          switch (call.method) {
            case 'read':
              return almacen[a['key']];
            case 'write':
              almacen[a['key']] = a['value'];
              return null;
            case 'readAll':
              return almacen;
            default:
              throw StateError('Almacen: ${call.method}');
          }
        },
      );
      tester.view.physicalSize = const Size(1200, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Future<void> esperar(bool Function() listo) async {
        for (var i = 0; i < 1000; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          if (listo()) return;
        }
        fail('No terminó la navegación local.');
      }

      await tester.runAsync(app.main);
      await esperar(
        () => find.text('Módulos Congregacionales').evaluate().isNotEmpty,
      );
      await esperar(() => find.text('Finanzas').evaluate().isNotEmpty);
      await tester.ensureVisible(find.text('Finanzas'));
      await tester.tap(find.text('Finanzas'));
      await esperar(
        () =>
            find.byType(FinanzasMvpScreen).evaluate().isNotEmpty &&
            find.textContaining('Saldo total:').evaluate().isNotEmpty,
      );
      // Cerrar la pantalla antes de simular el reinicio: sus observadores
      // recuperan recibos automáticamente al refrescar y compartirían el lock.
      await tester.pageBack();
      await esperar(
        () => find.byTooltip('Mantenimiento de Finanzas').evaluate().isNotEmpty,
      );
      final servicio = FinanzasMvpService(); // Transporte y almacenamiento de aplicación, sin inyección.
      final antes = (await tester.runAsync(servicio.consultar))!;
      perderRespuesta = true;
      await tester.runAsync(() async {
        await expectLater(
          servicio.enviar(
            Map<String, dynamic>.from(antes['contexto'] as Map),
            'gasto',
            {
              'cuentaId': 'caja',
              'categoriaId': 'gasto',
              'montoMinor': 11,
              'fechaContable': '2026-10-26',
            },
          ),
          throwsA(isA<TimeoutException>()),
        );
      });
      final pendiente = await tester.runAsync(servicio.pendiente);
      expect(pendiente, isNotNull);
      final nuevo = FinanzasMvpService();
      final replay = (await tester.runAsync(nuevo.recuperar))!;
      expect(replay['historica'], true);
      expect(await tester.runAsync(nuevo.pendiente), isNull);
      final despues = (await tester.runAsync(nuevo.consultar))!;
      expect(
        despues['saldoTotalMinor'],
        (antes['saldoTotalMinor'] as int) - 11,
      );
      expect(
        (despues['historial'] as Map)['corte'],
        ((antes['historial'] as Map)['corte'] as int) + 1,
      );
      // Historial paginado con el mismo SDK normal, sin nombres demo.
      final cursor = (despues['historial'] as Map)['cursorSiguiente'] as String;
      final pagina = (await tester.runAsync(
        () => nuevo.consultarPagina(cursor, 50),
      ))!;
      expect((pagina['movimientos'] as List).isNotEmpty, true);
      expect(llamadas.toSet(), {
        'finanzasV1Consultar',
        'finanzasV1Ejecutar',
        'finanzasV1ResolverSolicitud',
      });

      await esperar(
        () => find.byTooltip('Mantenimiento de Finanzas').evaluate().isNotEmpty,
      );
      await tester.tap(find.byTooltip('Mantenimiento de Finanzas'));
      await esperar(
        () => find.text('Revisar y ejecutar paso').evaluate().isNotEmpty,
      );
      perderRespuesta = true;
      await tester.tap(find.text('Revisar y ejecutar paso'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      await esperar(
        () => find.text('Recuperar paso pendiente').evaluate().isNotEmpty,
      );
      await tester.tap(find.text('Recuperar paso pendiente'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      await esperar(
        () =>
            find
                .text('Paso confirmado. Revisa el estado antes de continuar.')
                .evaluate()
                .isNotEmpty &&
            find.text('Recuperar paso pendiente').evaluate().isEmpty,
      );
      for (final etiqueta in [
        'Verificar consistencia',
        'Reanudar operaciones',
      ]) {
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        await tester.tap(find.text(etiqueta).last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Revisar y ejecutar paso'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
        await esperar(
          () =>
              find
                  .text('Paso confirmado. Revisa el estado antes de continuar.')
                  .evaluate()
                  .isNotEmpty &&
              find.byType(LinearProgressIndicator).evaluate().isEmpty,
        );
      }
      File('docs/fin_release_8_2026-10-26/flutter-navegacion.json')
          .writeAsStringSync(
            jsonEncode({
              'entrada': 'lib/main.dart',
              'dashboardReal': true,
              'pantallaFinancieraReal': true,
              'servicioSinInyeccion': true,
              'nombres': llamadas.toSet().toList(),
              'destinos': destinos.toSet().toList(),
              'conexionesExternas': 0,
              'respuestaPerdidaRecuperada': true,
              'mantenimientoDesdeDashboard': true,
              'pasoAdministrativoPerdidoRecuperado': true,
              'saldoAntes': antes['saldoTotalMinor'],
              'saldoDespues': despues['saldoTotalMinor'],
              'movimientosAgregados': 1,
              'plataforma': 'Adaptadores FlutterFire de prueba sobre HTTP real local; sin dispositivo nativo',
            }),
          );
      await tester.pumpWidget(const SizedBox.shrink());
    },
    skip: !activa,
  );
}
