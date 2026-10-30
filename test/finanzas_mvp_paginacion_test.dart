import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import 'finanzas_mvp_service_test.dart' show MemoriaFinanzas;

Map<String, dynamic> pagina(
  List<int> secuencias, {
  String? cursor = 'siguiente',
}) => {
  'contexto': {'iglesiaId': 'demo', 'pertenenciaId': 'p'},
  'permisos': {'leer': true},
  'configurada': true,
  'protocolo': 'operativo_v1',
  'periodoId': '2026-10',
  'saldoTotalMinor': 118600,
  'resumen': {'ingresosNetosMinor': 31000, 'gastosNetosMinor': 12400},
  'cuentas': [],
  'categorias': [],
  'movimientos': [
    for (final n in secuencias)
      {
        'id': 'm$n',
        'secuencia': n,
        'clase': 'gasto',
        'fechaContable': '2026-10-24',
        'reversaDe': null,
        'asientos': [],
      },
  ],
  'historial': {
    'corte': 3,
    'limite': 2,
    'hayMas': cursor != null,
    'cursorSiguiente': cursor,
  },
};

void main() {
  for (final caso in ['normal', 'duplicada', 'revocada', 'recarga']) {
    testWidgets('historial paginado: $caso', (tester) async {
      var llamadas = 0;
      final respuesta = Completer<Map<String, dynamic>>();
      final servicio = FinanzasMvpService(
        uidActual: () => 'admin',
        almacen: MemoriaFinanzas(),
        llamar: (_, datos) async {
          if (datos['cursor'] == null) {
            return pagina([2, 3]);
          }
          llamadas++;
          expect(datos, {
            'historialPaginado': true,
            'cursor': 'siguiente',
            'limite': 2,
          });
          if (caso == 'revocada') {
            throw FirebaseFunctionsException(
              code: 'permission-denied',
              message: 'Revocado',
            );
          }
          if (caso == 'recarga') {
            return respuesta.future;
          }
          return pagina(caso == 'duplicada' ? [2] : [1], cursor: null);
        },
      );
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Historial'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cargar más movimientos'));
      await tester.pump();
      if (caso == 'recarga') {
        tester
            .widgetList<IconButton>(find.byType(IconButton))
            .firstWhere((b) => b.tooltip == 'Actualizar')
            .onPressed!();
        await tester.pumpAndSettle();
        respuesta.complete(pagina([1], cursor: null));
        await tester.pumpAndSettle();
        expect(find.text('#1 gasto'), findsNothing);
        expect(
          tester
              .widget<TextButton>(
                find.widgetWithText(TextButton, 'Cargar más movimientos'),
              )
              .onPressed,
          isNotNull,
        );
      } else {
        await tester.pumpAndSettle();
        if (caso == 'normal') {
          for (final n in [1, 2, 3]) {
            expect(find.text('#$n gasto'), findsOneWidget);
          }
          expect(find.text('Cargar más movimientos'), findsNothing);
        } else if (caso == 'duplicada') {
          expect(find.textContaining('repitió movimientos'), findsOneWidget);
          expect(find.text('#2 gasto'), findsOneWidget);
        } else {
          expect(find.text('#2 gasto'), findsNothing);
          expect(find.textContaining('Acceso no verificable'), findsOneWidget);
        }
      }
      expect(llamadas, 1);
      expect(tester.takeException(), isNull);
    });
  }
}
