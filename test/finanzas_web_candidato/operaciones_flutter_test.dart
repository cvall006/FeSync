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

import '../finanzas_release8/plataformas_locales.dart';

class _Binding extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void main() {
  const activa = bool.fromEnvironment('FIN_WEB_CANDIDATO_TEST');
  if (activa) _Binding();
  testWidgets(
    'main.dart → Dashboard → Finanzas → SDK normal → emuladores; recuperación sin mapper',
    (tester) async {
      HttpOverrides.global = SoloLocal();
      addTearDown(() => HttpOverrides.global = null);
      final evidence = jsonDecode(
        File('docs/finanzas_web_candidato_2026-10-28/emulador.json').readAsStringSync(),
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
          await tester.pump();
          if (listo()) return;
        }
        fail('No terminó la navegación local.');
      }

      Future<void> pulsar(String texto) async {
        await esperar(
          () =>
              find.text(texto).evaluate().isNotEmpty &&
              find.byType(CircularProgressIndicator).evaluate().isEmpty &&
              find.byType(LinearProgressIndicator).evaluate().isEmpty,
        );
        final f = find.text(texto).last;
        await tester.ensureVisible(f);
        await tester.tap(f);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
      }

      Future<void> escribir(String etiqueta, String valor) async {
        final f = find.widgetWithText(TextFormField, etiqueta);
        await tester.ensureVisible(f);
        await tester.enterText(f, valor);
      }

      Future<void> elegir(int indice, String texto) async {
        await tester.tap(
          find.byType(DropdownButtonFormField<String>).at(indice),
        );
        await tester.pumpAndSettle();
        await pulsar(texto);
      }

      Future<void> confirmarOperacion() async {
        await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
        await tester.pump(const Duration(milliseconds: 400));
        await esperar(
          () =>
              find.byType(CircularProgressIndicator).evaluate().isEmpty &&
              find.byType(AlertDialog).evaluate().isEmpty,
        );
        expect(find.text('Solicitud pendiente de confirmación'), findsNothing);
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
      final flujo = FinanzasMvpService();
      final inicial = (await tester.runAsync(flujo.consultar))!;
      final corteInicial = (inicial['historial'] as Map)['corte'] as int;
      // Esperar las consultas disparadas por los snapshots iniciales de perfil
      // y acceso: el reloj de widgets avanza más rápido que esos HTTP reales.
      await esperar(
        () =>
            llamadas.where((n) => n == 'finanzasV1Consultar').length >= 5 &&
            find.byType(CircularProgressIndicator).evaluate().isEmpty &&
            find.text('Cuentas').evaluate().isNotEmpty,
      );
      await pulsar('Cuentas');
      await pulsar('Nueva cuenta');
      await escribir('Código', 'CAJA_FIN9');
      await escribir('Nombre', 'Cuenta FIN9');
      await confirmarOperacion();
      await esperar(
        () => find.text('Cuenta FIN9 (caja)').evaluate().isNotEmpty,
      );
      expect(find.text('Cuenta FIN9 (caja)'), findsOneWidget);
      await pulsar('Saldo inicial');
      await elegir(0, 'Cuenta FIN9');
      await escribir('Monto en CLP', '1000');
      await escribir('Fecha contable AAAA-MM-DD', '2026-10-26');
      await confirmarOperacion();
      await pulsar('Categorías');
      await pulsar('Nueva categoría');
      await escribir('Código', 'DIEZMOS_FIN9');
      await escribir('Nombre', 'Diezmos FIN9');
      await confirmarOperacion();
      await pulsar('Resumen');
      await pulsar('Nuevo ingreso');
      await elegir(0, 'Cuenta FIN9');
      await elegir(1, 'Diezmos FIN9');
      await escribir('Monto en CLP', '150');
      await escribir('Fecha contable AAAA-MM-DD', '2026-10-26');
      await confirmarOperacion();
      await pulsar('Nuevo gasto');
      await elegir(0, 'Cuenta FIN9');
      await escribir('Monto en CLP', '40');
      await escribir('Fecha contable AAAA-MM-DD', '2026-10-26');
      await confirmarOperacion();
      await pulsar('Transferencia');
      await elegir(0, 'Cuenta FIN9');
      await elegir(1, 'banco');
      await escribir('Monto en CLP', '25');
      await escribir('Fecha contable AAAA-MM-DD', '2026-10-26');
      await confirmarOperacion();
      await pulsar('Historial');
      await pulsar('#${corteInicial + 3} gasto');
      await pulsar('Revertir');
      await escribir('Fecha contable AAAA-MM-DD', '2026-10-26');
      await escribir('Motivo administrativo', 'Reversión de ensayo local FIN9');
      await escribir('Referencia de auditoría', 'FIN9_SOLO_DEMO');
      await confirmarOperacion();
      final operado = (await tester.runAsync(flujo.consultar))!;
      expect(
        operado['saldoTotalMinor'],
        (inicial['saldoTotalMinor'] as int) + 1150,
      );
      expect((operado['historial'] as Map)['corte'], corteInicial + 5);
      final cuentaNueva = (operado['cuentas'] as List).cast<Map>().singleWhere(
        (c) => c['codigo'] == 'CAJA_FIN9',
      );
      expect((operado['saldos'] as Map)[cuentaNueva['id']], 1125);
      expect(
        (operado['categorias'] as List).cast<Map>().singleWhere(
          (c) => c['codigo'] == 'DIEZMOS_FIN9',
        )['tipoIngreso'],
        'diezmos',
      );
      await tester.scrollUntilVisible(
        find.text('Cargar más movimientos'),
        600,
        maxScrolls: 30,
      );
      await pulsar('Cargar más movimientos');
      await esperar(() => find.text('Cargando historial…').evaluate().isEmpty);
      await tester.scrollUntilVisible(
        find.text('#${corteInicial - 46} ingreso'),
        350,
        maxScrolls: 20,
      );
      expect(find.text('#${corteInicial - 46} ingreso'), findsOneWidget);
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
      });

      // Captura válida sin commit: saldo insuficiente deja pendiente inmutable.
      await tester.runAsync(() async {
        await expectLater(
          nuevo.enviar(
            Map<String, dynamic>.from(despues['contexto'] as Map),
            'gasto',
            {
              'cuentaId': 'caja',
              'categoriaId': 'gasto',
              'montoMinor': 2000000,
              'fechaContable': '2026-10-26',
            },
          ),
          // Este adaptador de pruebas expresa los errores HTTP como StateError.
          // La suite Node valida los códigos contables y las precondiciones.
          throwsA(
            isA<StateError>().having(
              (e) => e.message,
              'message',
              'Respuesta local rechazada 400',
            ),
          ),
        );
      });
      final pendienteOctubre = (await tester.runAsync(nuevo.pendiente))!;

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
      for (final etiqueta in [
        'Pausar operaciones',
        'Verificar consistencia',
        'Cambiar al mes siguiente',
        'Verificar consistencia',
        'Reanudar operaciones',
      ]) {
        await elegir(0, etiqueta);
        if (etiqueta == 'Cambiar al mes siguiente') {
          await tester.enterText(find.byType(TextField), '2026-11');
        }
        await pulsar('Revisar y ejecutar paso');
        await pulsar('Confirmar');
        await esperar(
          () =>
              find
                  .text('Paso confirmado. Revisa el estado antes de continuar.')
                  .evaluate()
                  .isNotEmpty &&
              find.byType(LinearProgressIndicator).evaluate().isEmpty,
        );
      }
      final noviembre = (await tester.runAsync(nuevo.consultar))!;
      expect(noviembre['periodoId'], '2026-11');
      expect(noviembre['saldoTotalMinor'], despues['saldoTotalMinor']);
      expect((noviembre['resumen'] as Map)['ingresosNetosMinor'], 0);
      expect((noviembre['resumen'] as Map)['gastosNetosMinor'], 0);
      await tester.pageBack();
      await esperar(() => find.text('Finanzas').evaluate().isNotEmpty);
      await pulsar('Finanzas');
      await esperar(
        () =>
            find
                .textContaining('Las condiciones o el período cambiaron.')
                .evaluate()
                .isNotEmpty &&
            find.byType(CircularProgressIndicator).evaluate().isEmpty,
      );
      expect(await tester.runAsync(nuevo.pendiente), pendienteOctubre);
      await pulsar('Descartar pendiente para crear otra');
      await pulsar('Confirmar descarte seguro');
      await esperar(
        () =>
            find
                .text('Solicitud pendiente de confirmación')
                .evaluate()
                .isEmpty &&
            find.byType(CircularProgressIndicator).evaluate().isEmpty,
      );
      await pulsar('Nuevo gasto');
      await elegir(0, 'Cuenta FIN9');
      await escribir('Monto en CLP', '7');
      expect(
        tester
            .widget<TextFormField>(
              find.widgetWithText(TextFormField, 'Fecha contable AAAA-MM-DD'),
            )
            .controller!
            .text,
        '2026-11-01',
      );
      await confirmarOperacion();
      final finalizado = (await tester.runAsync(nuevo.consultar))!;
      expect(
        finalizado['saldoTotalMinor'],
        (despues['saldoTotalMinor'] as int) - 7,
      );
      expect((finalizado['historial'] as Map)['corte'], corteInicial + 7);
      expect(await tester.runAsync(nuevo.pendiente), isNull);
      final nuevaPeticion = almacen.values
          .where((v) => v.isNotEmpty)
          .map((v) => jsonDecode(v) as Map)
          .where(
            (v) =>
                v['solicitud'] is Map &&
                (v['solicitud'] as Map)['operacion'] == 'gasto',
          )
          .map((v) => v['solicitud'] as Map)
          .singleWhere((s) => (s['campos'] as Map)['montoMinor'] == 7);
      expect(
        nuevaPeticion['solicitudId'],
        isNot(pendienteOctubre['solicitudId']),
      );
      expect((nuevaPeticion['campos'] as Map)['fechaContable'], '2026-11-01');
      File('docs/finanzas_web_candidato_2026-10-28/flutter-navegacion.json')
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
              'circuitoCompletoUi': [
                'cuenta',
                'apertura',
                'categoriaDiezmos',
                'diezmo',
                'gasto',
                'transferencia',
                'reversion',
                'historialPaginado',
                'pausa',
                'cambioMes',
                'descartePendienteVencido',
                'nuevoGastoExplicito',
              ],
              'corteInicial': corteInicial,
              'corteFinal': (finalizado['historial'] as Map)['corte'],
              'saldoInicialFlujo': inicial['saldoTotalMinor'],
              'saldoFinalFlujo': finalizado['saldoTotalMinor'],
              'periodoFinal': finalizado['periodoId'],
              'pendienteVencidoNoEjecutado': true,
              'solicitudNuevaIdDistinta': true,
              'plataforma': 'Adaptadores FlutterFire de prueba sobre HTTP real local; sin dispositivo nativo',
            }),
          );
      await tester.pumpWidget(const SizedBox.shrink());
    },
    skip: !activa,
  );
}
