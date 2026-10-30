import 'dart:async';
import 'dart:convert';

import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_service.dart';
import 'package:fesync/modules/finanzas/finanzas_mantenimiento_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _Almacen implements AlmacenIngresoPendiente {
  String? valor;
  int escrituras = 0;
  @override
  Future<String?> leer(String clave) async => valor;
  @override
  Future<void> escribir(String clave, String valor) async {
    escrituras++;
    this.valor = valor;
  }
}

class _Configuracion extends FinanzasConfiguracionService {
  final llamadas = <(String, bool)>[];
  final espera = Completer<void>();
  @override
  Future<void> actualizarEstadoModulo(String iglesiaId, bool habilitado) async {
    llamadas.add((iglesiaId, habilitado));
    await espera.future;
  }
}

void main() {
  testWidgets(
    'Activa con mantenimiento pendiente sin descartarlo ni reenviarlo',
    (tester) async {
      const contexto = {'iglesiaId': 'piloto', 'pertenenciaId': 'generacion'};
      final almacen = _Almacen()
        ..valor = jsonEncode({
          'solicitudId': 'solicitud_original',
          'contexto': contexto,
          'accion': 'verificar',
        });
      final original = almacen.valor;
      var operaciones = 0;
      final mantenimiento = FinanzasMvpService(
        uidActual: () => 'titular',
        almacen: almacen,
        llamar: (_, _) async {
          operaciones++;
          throw StateError('No debe ejecutar mantenimiento al activar');
        },
      );
      final configuracion = _Configuracion();
      await tester.pumpWidget(
        MaterialApp(
          home: FinanzasMantenimientoScreen(
            iglesiaId: 'piloto',
            contexto: contexto,
            servicio: mantenimiento,
            servicioConfiguracion: configuracion,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final activar = find.widgetWithText(
        OutlinedButton,
        'Activar módulo de Finanzas',
      );
      expect(tester.widget<OutlinedButton>(activar).onPressed, isNotNull);
      expect(find.text('Recuperar paso pendiente'), findsOneWidget);
      expect(find.text('Paso de mantenimiento'), findsNothing);

      await tester.tap(activar);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Cancelar'));
      await tester.pumpAndSettle();
      expect(configuracion.llamadas, isEmpty);
      expect(almacen.valor, original);

      await tester.tap(activar);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Activar'));
      await tester.pump();
      expect(configuracion.llamadas, [('piloto', true)]);
      expect(tester.widget<OutlinedButton>(activar).onPressed, isNull);
      configuracion.espera.complete();
      await tester.pumpAndSettle();

      expect(find.text('Módulo activado'), findsOneWidget);
      expect(find.text('Recuperar paso pendiente'), findsOneWidget);
      expect(find.text('Paso de mantenimiento'), findsNothing);
      expect(almacen.valor, original);
      expect(almacen.escrituras, 0);
      expect(operaciones, 0);
    },
  );
}
