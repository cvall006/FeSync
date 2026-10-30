import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_screen.dart';

import '../finanzas_mvp_service_test.dart' show MemoriaFinanzas;

const contexto = {'iglesiaId': 'demo', 'pertenenciaId': 'original'};
Map<String, dynamic> pendiente() => {
  'solicitudId': 'original_123456789012345',
  'contexto': contexto,
  'operacion': 'gasto',
  'campos': {
    'cuentaId': 'caja',
    'categoriaId': 'gasto',
    'montoMinor': 10,
    'fechaContable': '2026-10-26',
  },
};
MemoriaFinanzas almacen() =>
    MemoriaFinanzas()
      ..valores['finanzas-mvp-demo-pendiente-admin'] = jsonEncode(pendiente());
void main() {
  test('condiciones vencidas: no ejecuta, descarte confirmado habilita nuevo ID y período', () async {
    final m = almacen(), original = pendiente();
    final ejecutadas = <Map<String, dynamic>>[];
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (n, d) async {
        if (n == 'finanzasV1ResolverSolicitud') {
          return d['accion'] == 'descartar'
              ? {'estado': 'RECHAZADA', 'puedeCrearNueva': true}
              : {'estado': 'REQUIERE_NUEVA', 'puedeCrearNueva': false};
        }
        expect(n, 'finanzasV1Ejecutar');
        ejecutadas.add(jsonDecode(jsonEncode(d)) as Map<String, dynamic>);
        return {'estado': 'CONFIRMADA', 'historica': false};
      },
    );
    expect((await s.recuperar())['estado'], 'REQUIERE_NUEVA');
    expect(ejecutadas, isEmpty);
    expect(await s.pendiente(), original);
    await expectLater(s.enviar(contexto, 'gasto', {}), throwsStateError);
    await s.inspeccionarPendiente(descartar: true);
    expect(await s.pendiente(), isNull);
    await s.enviar(contexto, 'gasto', {
      'cuentaId': 'caja',
      'categoriaId': 'gasto',
      'montoMinor': 10,
      'fechaContable': '2026-11-01',
    });
    expect(ejecutadas.single['solicitudId'], isNot(original['solicitudId']));
    expect((ejecutadas.single['campos'] as Map)['fechaContable'], '2026-11-01');
    final archivo = m.valores.entries.singleWhere(
      (e) => e.key.contains('-resolucion-'),
    );
    expect((jsonDecode(archivo.value) as Map)['solicitud'], original);
  });
  test('sin recibo vigente: reintento explícito usa mismo ID, sin mutar formulario', () async {
    final m = almacen(), original = pendiente();
    var ejecutadas = 0;
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (n, d) async {
        if (n == 'finanzasV1ResolverSolicitud') {
          return {'estado': 'NO_CONFIRMADA'};
        }
        ejecutadas++;
        expect(d, original);
        return {'estado': 'CONFIRMADA', 'historica': false};
      },
    );
    expect((await s.recuperar())['estado'], 'CONFIRMADA');
    expect(ejecutadas, 1);
    expect(await s.pendiente(), isNull);
  });
  test('revocación, respuesta perdida y persistencia fallida nunca borran intención', () async {
    for (final error in [
      FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'Revocado',
      ),
      TimeoutException('Sin respuesta'),
    ]) {
      final m = almacen();
      final s = FinanzasMvpService(
        almacen: m,
        uidActual: () => 'admin',
        llamar: (_, _) async => throw error,
      );
      await expectLater(
        s.inspeccionarPendiente(descartar: true),
        throwsA(same(error)),
      );
      expect(await s.pendiente(), pendiente());
    }
    final m = almacen()..falla = true;
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (_, _) async => {'estado': 'RECHAZADA', 'puedeCrearNueva': true},
    );
    await expectLater(
      s.inspeccionarPendiente(descartar: true),
      throwsStateError,
    );
    expect(await s.pendiente(), pendiente());
    m.falla = false;
    await s.inspeccionarPendiente(descartar: true);
    expect(await s.pendiente(), isNull);
  });
  test('paso administrativo perdido: persiste antes de HTTP, reinicio recupera exactamente el mismo cuerpo', () async {
    final m = MemoriaFinanzas();
    Map<String, dynamic>? enviada;
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (n, d) async {
        expect(n, 'finanzasV1Mantener');
        enviada = Map.of(d);
        expect(
          m.valores.values.any((v) => v.contains(d['solicitudId'] as String)),
          true,
        );
        throw TimeoutException('Después de commit');
      },
    );
    await expectLater(
      s.mantener(contexto, 'pausar'),
      throwsA(isA<TimeoutException>()),
    );
    final nuevo = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (n, d) async {
        expect(d, enviada);
        return {
          'estado': 'CONFIRMADA',
          'historica': true,
          'resultado': {'estado': 'bloqueado'},
        };
      },
    );
    expect(
      (await nuevo.mantener(
        contexto,
        'reanudar',
        recuperar: true,
      ))['historica'],
      true,
    );
    expect(await nuevo.mantenimientoPendiente(), isNull);
  });
  testWidgets(
    'Flutter explica vencimiento, exige descarte seguro y propone fecha del período actual',
    (tester) async {
      final m = almacen();
      var descartes = 0, ejecuciones = 0;
      final s = FinanzasMvpService(
        almacen: m,
        uidActual: () => 'admin',
        llamar: (n, d) async {
          if (n == 'finanzasV1ResolverSolicitud') {
            if (d['accion'] == 'descartar') {
              descartes++;
              return {'estado': 'RECHAZADA', 'puedeCrearNueva': true};
            }
            return {'estado': 'REQUIERE_NUEVA'};
          }
          if (n == 'finanzasV1Ejecutar') {
            ejecuciones++;
            return {'estado': 'CONFIRMADA'};
          }
          return {
            'contexto': contexto,
            'configurada': true,
            'protocolo': 'operativo_v1',
            'periodoId': '2026-11',
            'permisos': {'leer': true, 'registrarIngresosGastos': true},
            'saldoTotalMinor': 100,
            'saldos': {'caja': 100},
            'resumen': {'ingresosNetosMinor': 0, 'gastosNetosMinor': 0},
            'cuentas': [
              {
                'id': 'caja',
                'nombre': 'Caja',
                'codigo': 'CAJA',
                'tipo': 'caja',
                'estado': 'activa',
              },
            ],
            'categorias': [
              {
                'id': 'gasto',
                'nombre': 'Gasto',
                'codigo': 'GASTO',
                'naturaleza': 'gasto',
                'estado': 'activa',
              },
            ],
            'movimientos': [],
            'historial': {'corte': 0, 'hayMas': false},
          };
        },
      );
      tester.view.physicalSize = const Size(1200, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(home: FinanzasMvpScreen(servicio: s)),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Las condiciones o el período cambiaron'),
        findsOneWidget,
      );
      expect(ejecuciones, 0);
      await tester.tap(find.text('Descartar pendiente para crear otra'));
      await tester.pumpAndSettle();
      expect(descartes, 0);
      await tester.tap(find.text('Confirmar descarte seguro'));
      await tester.pumpAndSettle();
      expect(descartes, 1);
      expect(await s.pendiente(), isNull);
      expect(ejecuciones, 0);
      await tester.ensureVisible(find.text('Nuevo gasto'));
      await tester.tap(find.text('Nuevo gasto'));
      await tester.pumpAndSettle();
      final fecha = tester.widget<TextFormField>(
        find.widgetWithText(TextFormField, 'Fecha contable AAAA-MM-DD'),
      );
      expect(fecha.controller!.text, startsWith('2026-11'));
      expect(ejecuciones, 0);
    },
  );
}
