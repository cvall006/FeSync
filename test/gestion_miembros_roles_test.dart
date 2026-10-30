import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/services/roles_service.dart';
import 'package:fesync/modules/miembros/gestion_miembros_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'roles_service_test.dart' show PruebaRoles;

void main() {
  late PruebaRoles p;
  final descripciones = <String>[];
  Object? errorDescripcion;
  Future<void> montar(WidgetTester t, {bool permitir = true}) async {
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EditorRolMiembro(
            servicio: p.servicio,
            iglesiaId: 'iglesia',
            uidObjetivo: 'objetivo',
            descripcion: 'Área original',
            permitirRol: permitir,
            guardarDescripcion: (d) async {
              if (errorDescripcion != null) throw errorDescripcion!;
              descripciones.add(d);
            },
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  Future<void> tocar(WidgetTester t, String texto) async {
    await t.ensureVisible(find.text(texto).last);
    await t.tap(find.text(texto).last);
    // El editor mantiene un indicador animado mientras espera la confirmación.
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  Future<void> revisar(WidgetTester t) => tocar(t, 'Revisar contexto actual');
  Future<void> cambiar(WidgetTester t) async {
    await revisar(t);
    await t.tap(find.byType(DropdownButtonFormField<String>));
    await t.pumpAndSettle();
    await tocar(t, 'Líder de Área');
    await tocar(t, 'Confirmar cambio de rol');
  }

  setUp(() {
    p = PruebaRoles();
    descripciones.clear();
    errorDescripcion = null;
  });
  tearDown(() => p.cerrar());
  testWidgets(
    'contexto antes de confirmación, dos destinos y cancelación sin envío',
    (t) async {
      await montar(t);
      expect(p.llamadas, isEmpty);
      await cambiar(t);
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(p.llamadas.length, 1);
      await tocar(t, 'Cancelar');
      expect(p.llamadas.length, 1);
      expect(p.almacen.datos, isEmpty);
    },
  );
  testWidgets('rol confirmado no se presenta como rol vigente', (t) async {
    await montar(t);
    await cambiar(t);
    await tocar(t, 'Confirmar');
    expect(p.llamadas.last.$2['rolNuevo'], 'lider_area');
    expect(
      find.textContaining('Operación original confirmada.'),
      findsOneWidget,
    );
    expect(descripciones, isEmpty);
  });
  testWidgets('titular sin selector habilitado ni consulta administrativa', (
    t,
  ) async {
    await montar(t, permitir: false);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(
      find.textContaining('Rol gestionado por transferencia'),
      findsOneWidget,
    );
    expect(p.llamadas, isEmpty);
  });
  for (final code in ['permission-denied', 'failed-precondition']) {
    testWidgets('contexto $code bloquea confirmación', (t) async {
      p.errorContexto = FirebaseFunctionsException(
        code: code,
        message: 'simulado',
      );
      await montar(t);
      await revisar(t);
      final b = t.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirmar cambio de rol'),
      );
      expect(b.onPressed, isNull);
      expect(p.almacen.datos, isEmpty);
    });
  }
  testWidgets('descripción exitosa y rol con conflicto se informan separados', (
    t,
  ) async {
    await montar(t);
    await tocar(t, 'Guardar descripción');
    expect(descripciones, ['Área original']);
    p.errorCambio = FirebaseFunctionsException(
      code: 'aborted',
      message: 'simulado',
    );
    await cambiar(t);
    await tocar(t, 'Confirmar');
    expect(find.textContaining('Descripción guardada.'), findsOneWidget);
    expect(find.textContaining('El contexto cambió.'), findsOneWidget);
  });
  testWidgets('rol exitoso y descripción fallida permanecen independientes', (
    t,
  ) async {
    await montar(t);
    await cambiar(t);
    await tocar(t, 'Confirmar');
    errorDescripcion = StateError('simulado');
    await tocar(t, 'Guardar descripción');
    expect(
      find.textContaining('No se confirmó el guardado de descripción.'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Operación original confirmada.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'timeout y reinicio ofrecen solo replay original sin contexto nuevo',
    (t) async {
      p.errorCambio = TimeoutException('simulado');
      await montar(t);
      await cambiar(t);
      await tocar(t, 'Confirmar');
      final original = p.llamadas.last.$2;
      await t.pumpWidget(const SizedBox());
      p.servicio.dispose();
      p.servicio = p.crear();
      p.errorCambio = null;
      await montar(t);
      expect(find.text('Revisar contexto actual'), findsNothing);
      await tocar(t, 'Reintentar solicitud original');
      await tocar(t, 'Confirmar');
      expect(p.llamadas.last.$2, original);
      expect(
        p.llamadas
            .where((l) => l.$1 == 'obtenerContextoCambioRolMiembro')
            .length,
        1,
      );
    },
  );
  testWidgets(
    'registro corrupto bloquea cambios, conserva descripción independiente',
    (t) async {
      p.almacen.datos[RolesPendienteService.clave(p.actor, 'objetivo')] =
          '{roto';
      await montar(t);
      final revisar = t.widget<TextButton>(
        find.widgetWithText(TextButton, 'Revisar contexto actual'),
      );
      expect(revisar.onPressed, isNull);
      await tocar(t, 'Guardar descripción');
      expect(descripciones, hasLength(1));
      expect(p.llamadas, isEmpty);
    },
  );
  testWidgets(
    'A→B→A mantiene editor invalidado y no aplica confirmación tardía',
    (t) async {
      p.espera = Completer();
      await montar(t);
      await cambiar(t);
      await t.tap(find.text('Confirmar').last);
      await t.pump();
      await t.pump();
      p.sesion('otro');
      p.sesion(p.actor);
      await t.pump();
      expect(find.text('La sesión cambió. Cierra el editor.'), findsOneWidget);
      p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
      await t.pumpAndSettle();
      expect(
        find.textContaining('Operación original confirmada.'),
        findsNothing,
      );
    },
  );
  testWidgets(
    'llamada pendiente bloquea duplicados y cierre no actualiza editor descartado',
    (t) async {
      p.espera = Completer();
      await montar(t);
      await cambiar(t);
      await t.tap(find.text('Confirmar').last);
      await t.pump();
      await t.pump();
      final b = t.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirmar cambio de rol'),
      );
      expect(b.onPressed, isNull);
      await t.pumpWidget(const SizedBox());
      p.servicio.dispose();
      p.servicio = p.crear();
      p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(
        (await p.servicio.recuperar('objetivo'))!.estado,
        EstadoSolicitudRol.incierta,
      );
    },
  );
}
