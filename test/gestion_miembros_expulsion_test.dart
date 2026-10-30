import 'dart:async';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/core/services/desvinculacion_pendiente_service.dart';
import 'package:fesync/core/services/desvinculacion_service.dart';
import 'package:fesync/modules/miembros/gestion_miembros_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'coordinador_desvinculacion_test.dart' show AlmacenCoordinador;

class GestionPrueba {
  GestionPrueba() {
    uid = actor;
    perfiles[actor] = {
      'iglesiaId': 'iglesia',
      'rolGlobal': 'admin_iglesia',
      'pertenenciaId': 'c' * 64,
    };
    perfiles['objetivo'] = miembro('Miembro uno');
    perfiles['segundo'] = miembro('Miembro dos');
    iglesia['adminUid'] = actor;
    remoto = DesvinculacionService(
      uidActual: () => uid,
      functionsPorRegion: (_) => throw StateError('Firebase real prohibido'),
      llamar: (nombre, datos) async {
        llamadas.add((nombre, Map.of(datos)));
        if (nombre == 'desvincularMiembroIglesia') {
          expect(datos.keys.toSet(), {
            'iglesiaId',
            'uidObjetivo',
            'accion',
            'pertenenciaId',
            'solicitudId',
          });
          expect(datos['accion'], 'expulsar');
          recibos[datos['solicitudId'] as String] = Map.of(datos);
          if (errorEnvio != null) throw errorEnvio!;
          perfiles[datos['uidObjetivo']]!.remove('iglesiaId');
          emitirMiembros();
          if (espera != null) return await espera!.future;
          return {'ok': true};
        }
        expect(nombre, 'recuperarContextoSolicitudDesvinculacion');
        expect(datos.keys, ['solicitudId']);
        if (errorConsulta != null) throw errorConsulta!;
        if (esperaConsulta != null) return await esperaConsulta!.future;
        if (estadoRecibo != 'CONFIRMADA') return {'estado': estadoRecibo};
        return {
          'estado': 'CONFIRMADA',
          'contexto': recibos[datos['solicitudId']],
        };
      },
    );
  }
  static int numero = 0;
  final actor = 'gestion-prueba-${numero++}';
  String? uid;
  String rolWidget = 'admin_iglesia';
  final perfiles = <String, Map<String, dynamic>>{};
  final iglesia = <String, dynamic>{
    'nombre': 'Iglesia',
    'codigoAcceso': 'FICTICIO',
  };
  final almacen = AlmacenCoordinador();
  final sesiones = StreamController<String?>.broadcast(sync: true);
  final iglesias = StreamController<Map<String, dynamic>?>.broadcast(
    sync: true,
  );
  final miembros = StreamController<List<MiembroGestion>>.broadcast(sync: true);
  final llamadas = <(String, Map<String, Object?>)>[];
  final recibos = <String, Map<String, Object?>>{};
  late final DesvinculacionService remoto;
  Object? errorEnvio;
  Object? errorConsulta;
  Completer<Object?>? espera;
  Completer<Object?>? esperaConsulta;
  String estadoRecibo = 'CONFIRMADA';
  static Map<String, dynamic> miembro(String nombre) => {
    'nombre': nombre,
    'iglesiaId': 'iglesia',
    'rolGlobal': 'servidor',
    'pertenenciaId': 'a' * 64,
  };
  DesvinculacionPendienteService get persistencia =>
      DesvinculacionPendienteService(
        almacen: almacen,
        uidActual: () => uid,
        remoto: remoto,
      );
  void emitirMiembros() => miembros.add(
    perfiles.entries
        .where((e) => e.key != actor && e.value['iglesiaId'] == 'iglesia')
        .map((e) => MiembroGestion(e.key, Map.of(e.value)))
        .toList(),
  );
  Future<void> montar(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: GestionMiembrosScreen(
          key: UniqueKey(),
          usuario: UsuarioModel(
            uid: actor,
            email: 'ficticio@example.invalid',
            nombre: 'Administrador',
            iglesiaId: 'iglesia',
            rolGlobal: rolWidget,
          ),
          uidActual: () => uid,
          cambiosSesion: sesiones.stream,
          persistencia: persistencia,
          remoto: remoto,
          observarIglesia: () => iglesias.stream,
          observarMiembros: () => miembros.stream,
          leerPerfilServidor: (id) async =>
              perfiles[id] == null ? null : Map.of(perfiles[id]!),
          leerIglesiaServidor: () async => Map.of(iglesia),
        ),
      ),
    );
    iglesias.add(Map.of(iglesia));
    await avanzar(tester);
    emitirMiembros();
    await avanzar(tester);
  }

  static Future<void> avanzar(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> quitar(
    WidgetTester tester,
    String nombre, {
    bool confirmar = true,
  }) async {
    final tarjeta = find
        .ancestor(of: find.text(nombre), matching: find.byType(Container))
        .evaluate()
        .map((e) => e.widget)
        .toList();
    expect(tarjeta, isNotEmpty);
    final boton = find.byTooltip('Quitar de la congregación');
    // La lista conserva orden por nombre: Miembro dos, Miembro uno.
    final candidato = nombre == 'Miembro dos' ? boton.first : boton.last;
    await tester.ensureVisible(candidato);
    await tester.tap(candidato);
    await tester.pumpAndSettle();
    if (find.text('Quitar').evaluate().isNotEmpty) {
      await tester.tap(find.text(confirmar ? 'Quitar' : 'Cancelar').last);
    }
    await avanzar(tester);
  }

  Future<void> cerrar() async {
    await sesiones.close();
    await iglesias.close();
    await miembros.close();
  }
}

void main() {
  late GestionPrueba s;
  setUp(() => s = GestionPrueba());
  tearDown(() => s.cerrar());

  testWidgets('Cancelar expulsión no crea registro ni llama al backend', (
    tester,
  ) async {
    await s.montar(tester);
    await s.quitar(tester, 'Miembro uno', confirmar: false);
    expect(s.llamadas, isEmpty);
    expect(s.almacen.datos, isEmpty);
  });

  for (final encargado in [false, true]) {
    testWidgets(
      'Expulsión confirmada encargado=$encargado usa solo contrato backend',
      (tester) async {
        s.perfiles['objetivo']!['encargadoFinanciero'] = encargado;
        await s.montar(tester);
        await s.quitar(tester, 'Miembro uno');
        expect(s.llamadas.single.$1, 'desvincularMiembroIglesia');
        expect(s.llamadas.single.$2['uidObjetivo'], 'objetivo');
        expect(find.textContaining('Confirmada (histórica)'), findsOneWidget);
        expect(
          await s.persistencia.recuperarExpulsionesActor(s.actor),
          hasLength(1),
        );
      },
    );
  }

  testWidgets(
    'Miembro desaparece antes de respuesta; operación sigue visible',
    (tester) async {
      s.espera = Completer<Object?>();
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      expect(find.text('Miembro uno'), findsNothing);
      expect(find.text('Pendiente: consultar resultado'), findsOneWidget);
      final boton = tester.widget<TextButton>(
        find.widgetWithText(TextButton, 'Consultar expulsión'),
      );
      expect(boton.onPressed, isNull);
      s.espera!.complete({'ok': true});
      await GestionPrueba.avanzar(tester);
      expect(find.textContaining('Confirmada (histórica)'), findsOneWidget);
    },
  );

  testWidgets('Timeout y reintento conservan solicitud original', (
    tester,
  ) async {
    s.errorEnvio = TimeoutException('privado');
    await s.montar(tester);
    await s.quitar(tester, 'Miembro uno');
    final nonce = s.llamadas.single.$2['solicitudId'];
    expect(find.textContaining('Resultado pendiente'), findsOneWidget);
    s.errorEnvio = null;
    await tester.tap(find.text('Reintentar misma solicitud'));
    await GestionPrueba.avanzar(tester);
    expect(s.llamadas.map((l) => l.$2['solicitudId']).toSet(), {nonce});
    expect(find.textContaining('Confirmada (histórica)'), findsOneWidget);
  });

  testWidgets(
    'Reinicio sin perfil del objetivo recupera desde índice y recibo propio',
    (tester) async {
      s.errorEnvio = TimeoutException('privado');
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      final nonce = s.llamadas.single.$2['solicitudId'];
      s.perfiles.remove('objetivo');
      await s.montar(tester);
      expect(find.text('Miembro uno'), findsNothing);
      expect(find.text('Consultar expulsión'), findsOneWidget);
      await tester.tap(find.text('Consultar expulsión'));
      await GestionPrueba.avanzar(tester);
      expect(s.llamadas.last.$1, 'recuperarContextoSolicitudDesvinculacion');
      expect(s.llamadas.last.$2, {'solicitudId': nonce});
      expect(find.textContaining('Confirmada (histórica)'), findsOneWidget);
    },
  );

  for (final estado in ['RECIBO_AUSENTE', 'NO_VERIFICABLE']) {
    testWidgets('$estado no genera otra expulsión ni éxito', (tester) async {
      s.errorEnvio = TimeoutException('privado');
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      final antes = Map.of(s.almacen.datos);
      await s.montar(tester);
      s.estadoRecibo = estado;
      await tester.tap(find.text('Consultar expulsión'));
      await GestionPrueba.avanzar(tester);
      expect(find.textContaining('Bloqueada:'), findsOneWidget);
      expect(s.almacen.datos, antes);
      expect(
        s.llamadas.where((l) => l.$1 == 'desvincularMiembroIglesia'),
        hasLength(1),
      );
    });
  }

  testWidgets(
    'Reingreso posterior no se expulsa al consultar recibo histórico',
    (tester) async {
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      s.perfiles['objetivo'] = {
        ...GestionPrueba.miembro('Miembro uno'),
        'pertenenciaId': 'b' * 64,
      };
      s.emitirMiembros();
      await s.montar(tester);
      await tester.tap(find.text('Consultar expulsión'));
      await GestionPrueba.avanzar(tester);
      expect(s.perfiles['objetivo']!['pertenenciaId'], 'b' * 64);
      expect(
        s.llamadas.where((l) => l.$1 == 'desvincularMiembroIglesia'),
        hasLength(1),
      );
      expect(find.text('Miembro uno'), findsOneWidget);
    },
  );

  testWidgets(
    'Actor anterior no inicia aunque el widget conserve rol administrador',
    (tester) async {
      s.perfiles[s.actor]!['rolGlobal'] = 'lider_area';
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      expect(s.llamadas, isEmpty);
      expect(s.almacen.datos, isEmpty);
      expect(
        find.textContaining('administración o pertenencia cambió'),
        findsOneWidget,
      );
    },
  );

  testWidgets('Administrador titular no puede ser expulsado', (tester) async {
    s.iglesia['adminUid'] = 'objetivo';
    await s.montar(tester);
    final botones = tester.widgetList<IconButton>(
      find.ancestor(
        of: find.byTooltip('Quitar de la congregación'),
        matching: find.byType(IconButton),
      ),
    );
    expect(botones.every((b) => b.onPressed == null), true);
    expect(s.llamadas, isEmpty);
  });

  testWidgets(
    'Líder conserva listado y exportación, sin controles de expulsión',
    (tester) async {
      s.rolWidget = 'lider_area';
      await s.montar(tester);
      expect(find.text('Miembro uno'), findsOneWidget);
      expect(find.byTooltip('Quitar de la congregación'), findsNothing);
    },
  );

  testWidgets('Clave de período nula requiere revisión sin fallback legacy', (
    tester,
  ) async {
    s.perfiles['objetivo']!['pertenenciaId'] = null;
    await s.montar(tester);
    await s.quitar(tester, 'Miembro uno');
    expect(find.textContaining('requiere migración'), findsOneWidget);
    expect(s.llamadas, isEmpty);
  });

  testWidgets('Perfil legacy permite cancelar expulsión sin exigir migración', (
    tester,
  ) async {
    s.perfiles['objetivo']!.remove('pertenenciaId');
    await s.montar(tester);
    await s.quitar(tester, 'Miembro uno', confirmar: false);
    expect(find.textContaining('requiere migración'), findsNothing);
    expect(s.llamadas, isEmpty);
    expect(s.almacen.datos, isEmpty);
  });

  testWidgets(
    'Error backend de autorización se muestra como rechazo sin exponer detalles',
    (tester) async {
      s.errorEnvio = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'SECRETO',
      );
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      expect(find.textContaining('Rechazada esta llamada'), findsOneWidget);
      expect(find.textContaining('SECRETO'), findsNothing);
    },
  );

  testWidgets('Almacenamiento inaccesible bloquea nuevas expulsiones', (
    tester,
  ) async {
    s.almacen.fallaLeer = true;
    await s.montar(tester);
    expect(find.textContaining('No se pueden recuperar'), findsOneWidget);
    final botones = tester.widgetList<IconButton>(
      find.ancestor(
        of: find.byTooltip('Quitar de la congregación'),
        matching: find.byType(IconButton),
      ),
    );
    expect(botones.every((b) => b.onPressed == null), true);
    expect(s.llamadas, isEmpty);
  });

  testWidgets(
    'Fallo de registro tras reserva no envía y queda bloqueado al reiniciar',
    (tester) async {
      s.almacen.fallaEn = 2;
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      expect(s.llamadas, isEmpty);
      await s.montar(tester);
      expect(find.textContaining('No se pueden recuperar'), findsOneWidget);
      expect(s.almacen.datos.length, 1);
    },
  );

  testWidgets(
    'A-B-A no publica respuesta antigua y recupera índice del actor',
    (tester) async {
      s.espera = Completer<Object?>();
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      s.uid = 'otro';
      s.sesiones.add(s.uid);
      await GestionPrueba.avanzar(tester);
      expect(find.textContaining('La sesión cambió'), findsOneWidget);
      s.uid = s.actor;
      s.sesiones.add(s.uid);
      s.espera!.complete({'ok': true});
      await GestionPrueba.avanzar(tester);
      expect(find.textContaining('Confirmada (histórica)'), findsNothing);
      expect(find.text('Consultar expulsión'), findsOneWidget);
    },
  );

  testWidgets(
    'Dos expulsiones independientes persisten y avanzan sin bloquearse',
    (tester) async {
      s.espera = Completer<Object?>();
      await s.montar(tester);
      await s.quitar(tester, 'Miembro uno');
      await s.quitar(tester, 'Miembro dos');
      expect(s.llamadas, hasLength(2));
      expect(s.llamadas.map((l) => l.$2['solicitudId']).toSet(), hasLength(2));
      s.espera!.complete({'ok': true});
      await GestionPrueba.avanzar(tester);
      expect(
        await s.persistencia.recuperarExpulsionesActor(s.actor),
        hasLength(2),
      );
      expect(find.textContaining('Confirmada (histórica)'), findsNWidgets(2));
    },
  );

  testWidgets('Cierre de la fuente Auth bloquea acciones y oculta datos', (
    tester,
  ) async {
    await s.montar(tester);
    await tester.runAsync(() => s.sesiones.close());
    await GestionPrueba.avanzar(tester);
    expect(find.textContaining('La sesión cambió'), findsOneWidget);
    expect(find.text('Miembro uno'), findsNothing);
    expect(s.llamadas, isEmpty);
  });

  test('Expulsión no escribe perfiles directamente ni toca FCM o finanzas', () {
    final codigo = File('lib/modules/miembros/gestion_miembros_screen.dart')
        .readAsStringSync();
    final expulsar = codigo
        .split('Future<void> _quitarMiembro(')
        .last
        .split('Color _colorRol')
        .first;
    expect(expulsar, isNot(contains('.update(')));
    expect(codigo, isNot(contains('FieldValue.delete')));
    expect(codigo, isNot(contains('NotificationService')));
    expect(codigo, isNot(contains('deleteToken')));
    expect(expulsar, contains('_coordinador.iniciarExpulsion'));
  });
}
