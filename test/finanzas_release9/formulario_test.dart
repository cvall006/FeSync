import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

import '../finanzas_mvp_service_test.dart' show MemoriaFinanzas;

void main() {
  testWidgets(
    'confirmar con cuadro lento no libera controles antes de desmontar el diálogo',
    (tester) async {
      final solicitudes = <Map<String, dynamic>>[];
      final servicio = FinanzasMvpService(
        uidActual: () => 'titular',
        almacen: MemoriaFinanzas(),
        llamar: (nombre, data) async {
          if (nombre == 'finanzasV1Ejecutar') {
            solicitudes.add(data);
            return {'estado': 'CONFIRMADA', 'cuentaId': 'cuenta_nueva'};
          }
          expect(nombre, 'finanzasV1Consultar');
          return {
            'contexto': {'iglesiaId': 'demo', 'pertenenciaId': 'original'},
            'configurada': true,
            'protocolo': 'operativo_v1',
            'periodoId': '2026-10',
            'permisos': {'leer': true, 'administrarCatalogos': true},
            'saldoTotalMinor': 0,
            'saldos': {},
            'resumen': {'ingresosNetosMinor': 0, 'gastosNetosMinor': 0},
            'cuentas': [
              if (solicitudes.isNotEmpty)
                {
                  'id': 'cuenta_nueva',
                  'nombre': 'Cuenta de ensayo',
                  'codigo': 'CAJA9',
                  'tipo': 'caja',
                  'estado': 'activa',
                },
            ],
            'categorias': [],
            'movimientos': [],
          };
        },
      );
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: servicio)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cuentas'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Nueva cuenta'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Código'),
        'CAJA9',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Nombre'),
        'Cuenta de ensayo',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
      // Avanza el reloj antes del siguiente cuadro de la animación de salida.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(solicitudes, hasLength(1));
      expect(solicitudes.single['operacion'], 'crearCuenta');
      expect(find.text('Cuenta de ensayo (caja)'), findsOneWidget);
      expect(await servicio.pendiente(), isNull);
    },
  );
}
