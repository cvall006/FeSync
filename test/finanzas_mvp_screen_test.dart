import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import 'finanzas_mvp_service_test.dart' show MemoriaFinanzas;

void main() {
  testWidgets(
    'resumen, saldo, catálogo e historial y restricciones del encargado',
    (tester) async {
      final servicio = FinanzasMvpService(
        almacen: MemoriaFinanzas(),
        uidActual: () => 'encargado',
        llamar: (_, data) async => {
          'contexto': {'iglesiaId': 'demo', 'pertenenciaId': 'p'},
          'configurada': true,
          'protocolo': 'operativo_v1',
          'periodoId': '2026-10',
          'permisos': {
            'leer': true,
            'registrarIngresosGastos': true,
            'transferir': true,
            'registrarAjustes': false,
            'administrarCatalogos': false,
            'anularMovimientos': false,
          },
          'saldoTotalMinor': 3000,
          'saldos': {'caja': 3000},
          'resumen': {'ingresosNetosMinor': 5000, 'gastosNetosMinor': 2000},
          'cuentas': [
            {
              'id': 'caja',
              'nombre': 'Caja',
              'tipo': 'caja',
              'codigo': 'CAJA',
              'estado': 'activa',
            },
          ],
          'categorias': [],
          'movimientos': [
            {
              'id': 'mov1',
              'secuencia': 1,
              'clase': 'ingreso',
              'fechaContable': '2026-10-23',
              'reversaDe': null,
              'asientos': [
                {'cuentaId': 'caja', 'deltaMinor': 5000},
              ],
            },
          ],
        },
      );
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Saldo total: CLP 3000'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Ajuste'))
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Cuentas'));
      await tester.pumpAndSettle();
      expect(find.text('Caja (caja)'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Nueva cuenta'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Historial'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('#1 ingreso'));
      await tester.pumpAndSettle();
      expect(find.text('Movimiento #1'), findsOneWidget);
      expect(find.text('Revertir'), findsNothing);
      await tester.tap(find.text('Cerrar'));
      await tester.pumpAndSettle();
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      for (final ancho in [320.0, 390.0]) {
        tester.view.physicalSize = Size(ancho, 780);
        await tester.pumpAndSettle();
        for (final pagina in [
          'Resumen',
          'Cuentas',
          'Categorías',
          'Historial',
        ]) {
          final etiqueta = find.text(pagina);
          final rect = tester.getRect(etiqueta);
          expect(rect.height, lessThanOrEqualTo(24));
          expect(rect.left, greaterThanOrEqualTo(0));
          expect(rect.right, lessThanOrEqualTo(ancho));
        }
        expect(tester.takeException(), isNull);
      }
    },
  );
  testWidgets(
    'fallo de autorización muestra error sin conservar datos anteriores',
    (tester) async {
      final s = FinanzasMvpService(
        almacen: MemoriaFinanzas(),
        uidActual: () => 'x',
        llamar: (_, data) async => throw StateError('Acceso revocado'),
      );
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: s)),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Acceso revocado'), findsOneWidget);
      expect(find.textContaining('Saldo total:'), findsNothing);
    },
  );
  testWidgets(
    'revocación con formulario abierto impide confirmar sin excepciones',
    (tester) async {
      var revocado = false;
      var envios = 0;
      tester.view.physicalSize = const Size(320, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final servicio = FinanzasMvpService(
        almacen: MemoriaFinanzas(),
        uidActual: () => 'encargado',
        llamar: (nombre, _) async {
          if (nombre != 'finanzasV1Consultar') {
            envios++;
            return {'estado': 'CONFIRMADA'};
          }
          if (revocado) {
            throw FirebaseFunctionsException(
              code: 'permission-denied',
              message: 'CONTABILIDAD_NO_AUTORIZADA',
            );
          }
          return {
            'contexto': {'iglesiaId': 'demo', 'pertenenciaId': 'p'},
            'configurada': true,
            'protocolo': 'operativo_v1',
            'periodoId': '2026-10',
            'permisos': {'registrarIngresosGastos': true},
            'saldoTotalMinor': 0,
            'saldos': {'caja': 0},
            'resumen': {'ingresosNetosMinor': 0, 'gastosNetosMinor': 0},
            'cuentas': [
              {'id': 'caja', 'nombre': 'Caja', 'estado': 'activa'},
            ],
            'categorias': [
              {
                'id': 'diezmos',
                'nombre': 'Diezmos',
                'estado': 'activa',
                'naturaleza': 'ingreso',
              },
            ],
            'movimientos': [],
          };
        },
      );
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Nuevo ingreso'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Monto en CLP'),
        '1.5',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Fecha contable AAAA-MM-DD'),
        '2026-10-23',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      await tester.pumpAndSettle();
      final mensaje = tester.renderObject<RenderParagraph>(
        find.text('Ingresa pesos enteros válidos'),
      );
      expect(mensaje.didExceedMaxLines, isFalse);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Monto en CLP'),
        '1000',
      );
      revocado = true;
      tester
          .widgetList<IconButton>(find.byType(IconButton))
          .firstWhere((boton) => boton.tooltip == 'Actualizar')
          .onPressed!();
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.textContaining('Acceso no verificable'), findsOneWidget);
      expect(envios, 0);
      expect(await servicio.pendiente(), isNull);
    },
  );
  testWidgets('timeout muestra instrucciones sin publicar el código técnico', (
    tester,
  ) async {
    final servicio = FinanzasMvpService(
      almacen: MemoriaFinanzas(),
      uidActual: () => 'admin',
      llamar: (_, data) async => throw FirebaseFunctionsException(
        code: 'deadline-exceeded',
        message: 'deadline-exceeded',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining('No se pudo confirmar la respuesta'),
      findsOneWidget,
    );
    expect(find.textContaining('recupera la misma solicitud'), findsOneWidget);
    expect(find.textContaining('deadline-exceeded'), findsNothing);
    expect(find.textContaining('Saldo total:'), findsNothing);
  });
}
