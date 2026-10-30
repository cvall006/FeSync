import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:fesync/core/providers/theme_provider.dart';
import 'package:fesync/core/services/desvinculacion_pendiente_service.dart';
import 'package:fesync/core/services/desvinculacion_service.dart';
import 'package:fesync/main.dart';
import 'package:fesync/modules/auth/onboarding_iglesia_screen.dart';
import 'package:fesync/modules/perfil/perfil_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'ingreso_coordinado_test.dart'
    show EscenarioIngreso, AlmacenPruebaIngreso, AuthServiceIngresoPrueba;

class AuthSalidaPrueba extends AuthServiceIngresoPrueba {
  AuthSalidaPrueba(super.escenario);
  int escriturasLegacy = 0;
  void Function()? antesLegacy;
  bool fallarLecturaPosterior = false;
  @override
  Future<void> salirCongregacionLegacy({
    required String uid,
    required String iglesiaId,
  }) async {
    antesLegacy?.call();
    final p = escenario.perfiles[uid]!;
    if (p.containsKey('pertenenciaId') || p['iglesiaId'] != iglesiaId) {
      throw StateError('Pertenencia cambió');
    }
    escriturasLegacy++;
    p.remove('iglesiaId');
    p.remove('rolGlobal');
    p.remove('descripcion');
    escenario.flujo.add(Map.of(p));
    if (fallarLecturaPosterior) escenario.errorPerfil = true;
  }
}

class EscenarioSalida {
  EscenarioSalida() {
    base.perfiles[base.uid] = {
      'iglesiaId': 'iglesia',
      'rolGlobal': 'servidor',
      'pertenenciaId': periodo,
      'nombre': 'Prueba',
      'email': 'prueba@example.invalid',
    };
    remoto = DesvinculacionService(
      uidActual: () => base.auth.currentUser?.uid,
      functionsPorRegion: (_) => throw StateError('Firebase real prohibido'),
      llamar: (nombre, datos) async {
        llamadas.add((nombre, Map.of(datos)));
        if (nombre == 'desvincularMiembroIglesia') {
          expect(datos['accion'], 'salir');
          expect(datos['uidObjetivo'], base.uid);
          recibo = Map.of(datos);
          final perfil = base.perfiles[base.uid]!;
          perfil.remove('iglesiaId');
          perfil.remove('rolGlobal');
          if (emitirPerfil) base.flujo.add(Map.of(perfil));
          if (errorEnvio != null) throw errorEnvio!;
          if (espera != null) return await espera!.future;
          return {'ok': true};
        }
        expect(nombre, 'recuperarContextoSolicitudDesvinculacion');
        expect(datos.keys, ['solicitudId']);
        if (estadoRecibo != 'CONFIRMADA') return {'estado': estadoRecibo};
        expect(datos['solicitudId'], recibo!['solicitudId']);
        return {'estado': 'CONFIRMADA', 'contexto': recibo};
      },
    );
  }
  static final periodo = 'a' * 64;
  final base = EscenarioIngreso();
  late final authSalida = AuthSalidaPrueba(base);
  final almacen = AlmacenPruebaIngreso();
  late final DesvinculacionService remoto;
  final llamadas = <(String, Map<String, Object?>)>[];
  Map<String, Object?>? recibo;
  Completer<Object?>? espera;
  Object? errorEnvio;
  bool emitirPerfil = true;
  String estadoRecibo = 'CONFIRMADA';
  DesvinculacionPendienteService get persistencia =>
      DesvinculacionPendienteService(
        almacen: almacen,
        uidActual: () => base.auth.currentUser?.uid,
        remoto: remoto,
      );

  Future<void> montar(WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => ThemeProvider(),
        child: MaterialApp(
          navigatorKey: navigatorKey,
          home: RootGate(
            key: UniqueKey(),
            authService: authSalida,
            persistenciaSalida: persistencia,
            remotoSalida: remoto,
            observarPerfil: (_) => base.flujo.stream,
            habilitarNotificaciones: false,
            dashboardConSalidaBuilder: (context, perfil, salir) => Scaffold(
              body: Column(
                children: [
                  Text('Inicio ${perfil.iglesiaId}'),
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PerfilScreen(
                          usuario: perfil,
                          onCerrarSesion: () async {},
                          onPerfilActualizado: () async {},
                          onSalirCongregacion: salir,
                        ),
                      ),
                    ),
                    child: const Text('Abrir perfil'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await avanzar(tester);
  }

  static Future<void> avanzar(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> solicitar(WidgetTester tester, {bool confirmar = true}) async {
    await tester.tap(find.text('Abrir perfil'));
    await tester.pumpAndSettle();
    final boton = find.text('Salir de esta Congregación');
    await tester.ensureVisible(boton);
    await tester.tap(boton);
    await tester.pumpAndSettle();
    expect(llamadas, isEmpty);
    await tester.tap(find.text(confirmar ? 'Salir' : 'Cancelar').last);
    await avanzar(tester);
  }

  Future<String> prepararLocal() async {
    final c = ContextoDesvinculacion(
      actorUid: base.uid,
      uidObjetivo: base.uid,
      iglesiaId: 'iglesia',
      accion: AccionDesvinculacion.salir,
      pertenenciaId: periodo,
    );
    final s = await persistencia.preparar(
      contexto: c,
      decisionConfirmada: true,
    );
    recibo = {
      'iglesiaId': 'iglesia',
      'uidObjetivo': base.uid,
      'accion': 'salir',
      'pertenenciaId': periodo,
      'solicitudId': s.solicitudId,
    };
    return s.solicitudId;
  }
}

void main() {
  late EscenarioSalida s;
  setUp(() => s = EscenarioSalida());
  tearDown(() => s.base.cerrar());

  testWidgets(
    'Usuario antiguo sin solicitud conserva navegación y no consulta backend',
    (tester) async {
      s.base.perfiles[s.base.uid]!.remove('pertenenciaId');
      await s.montar(tester);
      expect(find.text('Inicio iglesia'), findsOneWidget);
      expect(s.llamadas, isEmpty);
    },
  );

  testWidgets('Perfil exige confirmación y cancelar no crea intención', (
    tester,
  ) async {
    await s.montar(tester);
    await s.solicitar(tester, confirmar: false);
    expect(s.llamadas, isEmpty);
    expect(s.almacen.datos, isEmpty);
    expect(find.byType(PerfilScreen), findsOneWidget);
  });

  testWidgets(
    'Salida confirmada usa callable, verifica perfil y muestra flujo sin iglesia',
    (tester) async {
      await s.montar(tester);
      await s.solicitar(tester);
      expect(s.llamadas.single.$1, 'desvincularMiembroIglesia');
      expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
      expect(
        (jsonDecode(s.almacen.datos.values.single) as Map)['estado'],
        'confirmada',
      );
    },
  );

  testWidgets(
    'Perfil anticipado no salta recuperación mientras falta respuesta',
    (tester) async {
      s.espera = Completer<Object?>();
      await s.montar(tester);
      await s.solicitar(tester);
      expect(find.text('Verificar salida'), findsOneWidget);
      expect(find.byType(OnboardingIglesiaScreen), findsNothing);
      final boton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Consultar salida'),
      );
      expect(boton.onPressed, isNull);
      s.espera!.complete({'ok': true});
      await EscenarioSalida.avanzar(tester);
      expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
    },
  );

  testWidgets(
    'Timeout y reinicio recuperan mismo nonce sin reconstruir parámetros actuales',
    (tester) async {
      s.errorEnvio = TimeoutException('privado');
      await s.montar(tester);
      await s.solicitar(tester);
      final id = s.llamadas.single.$2['solicitudId'];
      expect(find.byType(OnboardingIglesiaScreen), findsNothing);
      await s.montar(tester);
      expect(find.text('Verificar salida'), findsOneWidget);
      await tester.tap(find.text('Consultar salida'));
      await EscenarioSalida.avanzar(tester);
      expect(s.llamadas.last.$1, 'recuperarContextoSolicitudDesvinculacion');
      expect(s.llamadas.last.$2, {'solicitudId': id});
      expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
      expect(
        (jsonDecode(s.almacen.datos.values.single) as Map)['solicitudId'],
        id,
      );
    },
  );

  for (final estado in ['RECIBO_AUSENTE', 'NO_VERIFICABLE']) {
    testWidgets('$estado mantiene bloqueo y registro sin otra intención', (
      tester,
    ) async {
      await s.prepararLocal();
      s.estadoRecibo = estado;
      final antes = Map.of(s.almacen.datos);
      await s.montar(tester);
      await tester.tap(find.text('Consultar salida'));
      await EscenarioSalida.avanzar(tester);
      expect(find.text('Verificar salida'), findsOneWidget);
      expect(find.byType(OnboardingIglesiaScreen), findsNothing);
      expect(find.text('Inicio iglesia'), findsNothing);
      expect(s.almacen.datos, antes);
      expect(s.llamadas.single.$1, 'recuperarContextoSolicitudDesvinculacion');
    });
  }

  testWidgets(
    'Confirmación histórica no borra ni confunde pertenencia posterior',
    (tester) async {
      await s.prepararLocal();
      s.base.perfiles[s.base.uid] = {
        'iglesiaId': 'nueva',
        'rolGlobal': 'servidor',
        'pertenenciaId': 'b' * 64,
      };
      await s.montar(tester);
      expect(find.text('Inicio nueva'), findsNothing);
      await tester.tap(find.text('Consultar salida'));
      await EscenarioSalida.avanzar(tester);
      expect(find.text('Inicio nueva'), findsOneWidget);
      expect(s.base.perfiles[s.base.uid]!['pertenenciaId'], 'b' * 64);
      expect(s.llamadas.single.$1, 'recuperarContextoSolicitudDesvinculacion');
    },
  );

  testWidgets(
    'Recibo histórico con mismo período aún vinculado no concede ruta',
    (tester) async {
      await s.prepararLocal();
      await s.montar(tester);
      await tester.tap(find.text('Consultar salida'));
      await EscenarioSalida.avanzar(tester);
      expect(find.text('Verificar salida'), findsOneWidget);
      expect(find.text('Inicio iglesia'), findsNothing);
    },
  );

  testWidgets(
    'Registro local corrupto bloquea sin llamar Firebase ni reemplazarlo',
    (tester) async {
      await s.prepararLocal();
      final clave = s.almacen.datos.keys.single;
      s.almacen.datos[clave] = '{corrupto';
      await s.montar(tester);
      expect(find.text('Verificar salida'), findsOneWidget);
      await tester.tap(find.text('Consultar salida'));
      await EscenarioSalida.avanzar(tester);
      expect(s.llamadas, isEmpty);
      expect(s.almacen.datos[clave], '{corrupto');
    },
  );

  testWidgets(
    'Legacy sin pertenenciaId sale sin migrar ni crear solicitud protegida',
    (tester) async {
      s.base.perfiles[s.base.uid]!.remove('pertenenciaId');
      await s.montar(tester);
      await s.solicitar(tester);
      expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
      expect(s.authSalida.escriturasLegacy, 1);
      expect(s.llamadas, isEmpty);
      expect(s.almacen.datos, isEmpty);
    },
  );

  testWidgets(
    'Clave pertenenciaId nula conserva bloqueo y no usa salida legacy',
    (tester) async {
      s.base.perfiles[s.base.uid]!['pertenenciaId'] = null;
      await s.montar(tester);
      await s.solicitar(tester);
      expect(find.textContaining('requiere migración'), findsOneWidget);
      expect(s.authSalida.escriturasLegacy, 0);
      expect(s.llamadas, isEmpty);
    },
  );

  testWidgets('Una generación nueva entre lectura y escritura no se elimina', (
    tester,
  ) async {
    s.base.perfiles[s.base.uid]!.remove('pertenenciaId');
    s.authSalida.antesLegacy = () {
      s.base.perfiles[s.base.uid]!['pertenenciaId'] = 'b' * 64;
    };
    await s.montar(tester);
    await s.solicitar(tester);
    expect(s.authSalida.escriturasLegacy, 0);
    expect(s.base.perfiles[s.base.uid]!['iglesiaId'], 'iglesia');
    expect(s.base.perfiles[s.base.uid]!['pertenenciaId'], 'b' * 64);
    expect(find.byType(OnboardingIglesiaScreen), findsNothing);
  });

  testWidgets('Legacy confirmado se recupera leyendo sin repetir escritura', (
    tester,
  ) async {
    s.base.perfiles[s.base.uid]!.remove('pertenenciaId');
    s.authSalida.fallarLecturaPosterior = true;
    await s.montar(tester);
    await s.solicitar(tester);
    expect(find.text('Verificar salida'), findsOneWidget);
    s.base.errorPerfil = false;
    await tester.tap(find.text('Consultar salida'));
    await EscenarioSalida.avanzar(tester);
    expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
    expect(s.authSalida.escriturasLegacy, 1);
    expect(s.llamadas, isEmpty);
  });

  testWidgets('A-B-A no aplica respuesta de salida de la sesión anterior', (
    tester,
  ) async {
    final actor = s.base.uid;
    s.espera = Completer<Object?>();
    await s.montar(tester);
    await s.solicitar(tester);
    s.base.auth.cambiar('otra-cuenta');
    await EscenarioSalida.avanzar(tester);
    s.base.auth.cambiar(actor);
    await EscenarioSalida.avanzar(tester);
    s.espera!.complete({'ok': true});
    await EscenarioSalida.avanzar(tester);
    expect(find.text('Verificar salida'), findsOneWidget);
    expect(find.byType(OnboardingIglesiaScreen), findsNothing);
    expect(s.llamadas.length, 1);
  });

  testWidgets('Reintento explícito conserva nonce original', (tester) async {
    s.errorEnvio = TimeoutException('privado');
    await s.montar(tester);
    await s.solicitar(tester);
    final nonce = s.llamadas.single.$2['solicitudId'];
    s.errorEnvio = null;
    await tester.tap(find.text('Reintentar la misma solicitud'));
    await EscenarioSalida.avanzar(tester);
    expect(s.llamadas.map((l) => l.$2['solicitudId']).toSet(), {nonce});
    expect(find.byType(OnboardingIglesiaScreen), findsOneWidget);
  });

  testWidgets(
    'Cerrar sesión conserva la salida pendiente para recuperación posterior',
    (tester) async {
      s.errorEnvio = TimeoutException('privado');
      await s.montar(tester);
      await s.solicitar(tester);
      final antes = Map.of(s.almacen.datos);
      await tester.tap(find.text('Cerrar sesión'));
      await EscenarioSalida.avanzar(tester);
      expect(s.base.auth.currentUser, isNull);
      expect(s.almacen.datos, antes);
      expect(s.llamadas.length, 1);
    },
    variant: TargetPlatformVariant({TargetPlatform.linux}),
  );

  test(
    'Salida de Perfil no contiene escritura directa ni limpieza FCM cliente',
    () {
      final codigo = File('lib/modules/perfil/perfil_screen.dart')
          .readAsStringSync();
      final salida = codigo
          .split('Future<void> _confirmarSalirCongregacion()')
          .last
          .split('Future<void> _confirmarCerrarSesion()')
          .first;
      expect(salida, isNot(contains('_usuarioRef')));
      expect(salida, isNot(contains('NotificationService')));
      expect(salida, isNot(contains('FieldValue.delete')));
      expect(salida, contains('widget.onSalirCongregacion()'));
    },
  );
}
