import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/core/models/resultado_ingreso.dart';
import 'package:fesync/core/services/auth_service.dart';
import 'package:fesync/core/services/coordinador_ingreso.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:fesync/core/services/desvinculacion_pendiente_service.dart';
import 'package:fesync/main.dart';
import 'package:fesync/modules/auth/auth_screen.dart';
import 'package:fesync/modules/auth/onboarding_iglesia_screen.dart';

class AlmacenPruebaIngreso implements AlmacenIngresoPendiente {
  final datos = <String, String>{};
  int escrituras = 0;
  int? fallarEn;
  bool fallaLeer = false;
  Completer<void>? esperaLectura;
  @override
  Future<String?> leer(String clave) async {
    if (esperaLectura != null) await esperaLectura!.future;
    if (fallaLeer) throw StateError('detalle privado');
    return datos[clave];
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    escrituras++;
    if (fallarEn == escrituras) throw StateError('detalle privado');
    datos[clave] = valor;
  }
}

class UsuarioIngresoPrueba implements User {
  UsuarioIngresoPrueba(this.uid);
  @override
  final String uid;
  @override
  String? get email => 'prueba@example.invalid';
  @override
  String? get displayName => 'Prueba';
  @override
  String? get photoURL => null;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class AuthIngresoPrueba implements FirebaseAuth {
  AuthIngresoPrueba(String uid) : usuario = UsuarioIngresoPrueba(uid);
  User? usuario;
  final cambios = StreamController<User?>.broadcast();
  @override
  User? get currentUser => usuario;
  @override
  Stream<User?> authStateChanges() => cambios.stream;
  void cambiar(String? uid) {
    usuario = uid == null ? null : UsuarioIngresoPrueba(uid);
    cambios.add(usuario);
  }

  @override
  Future<void> signOut() async => cambiar(null);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class AuthServiceIngresoPrueba extends AuthService {
  AuthServiceIngresoPrueba(this.escenario)
    : super(auth: escenario.auth, coordinador: escenario.coordinador);
  final EscenarioIngreso escenario;
  @override
  Future<Map<String, dynamic>?> leerPerfilServidor(String uid) =>
      escenario.leer(uid);
  @override
  Future<UsuarioModel?> obtenerPerfilUsuario(String uid) async {
    final datos = escenario.perfiles[uid];
    return datos == null ? null : UsuarioModel.fromMap(datos, uid);
  }
}

class EscenarioIngreso {
  EscenarioIngreso() {
    auth = AuthIngresoPrueba('ingreso-${_numero++}');
    coordinador = nuevoCoordinador();
    servicio = AuthServiceIngresoPrueba(this);
  }
  static int _numero = 0;
  late final AuthIngresoPrueba auth;
  late final CoordinadorIngreso coordinador;
  late final AuthServiceIngresoPrueba servicio;
  final almacen = AlmacenPruebaIngreso();
  final perfiles = <String, Map<String, dynamic>>{};
  final flujo = StreamController<Map<String, dynamic>?>.broadcast();
  final llamadas = <(String, Map<String, Object?>)>[];
  String consulta = 'CONFIRMADA_VIGENTE';
  Object? errorIngreso;
  Object? errorConsulta;
  bool errorPerfil = false;
  Completer<void>? esperaRemota;
  int lecturas = 0;
  void Function()? alLeer;
  String get uid => auth.currentUser!.uid;
  final parametros = <String, Object?>{
    'codigo': 'CODIGO',
    'nombre': 'Prueba',
    'email': 'prueba@example.invalid',
    'fotoUrl': '',
    'descripcion': '',
  };

  CoordinadorIngreso nuevoCoordinador() => CoordinadorIngreso(
    uidActual: () => auth.currentUser?.uid,
    leerPerfilServidor: leer,
    llamar: llamar,
    persistencia: IngresoPendienteService(almacen: almacen),
  );
  Future<Map<String, dynamic>?> leer(String usuario) async {
    lecturas++;
    alLeer?.call();
    if (errorPerfil) throw StateError('red');
    return perfiles[usuario] == null ? null : Map.of(perfiles[usuario]!);
  }

  Future<Object?> llamar(String nombre, Map<String, Object?> datos) async {
    llamadas.add((nombre, Map.of(datos)));
    if (nombre == 'consultarEstadoSolicitudIngreso') {
      if (errorConsulta != null) throw errorConsulta!;
      return {'estado': consulta};
    }
    expect(almacen.escrituras, greaterThanOrEqualTo(2));
    expect(datos['solicitudId'], matches(RegExp(r'^[a-f0-9]{64}$')));
    if (errorIngreso != null) throw errorIngreso!;
    perfiles[uid] = {
      'iglesiaId': 'iglesia',
      'rolGlobal': 'servidor',
      'pertenenciaId': 'a' * 64,
    };
    flujo.add(Map.of(perfiles[uid]!));
    if (esperaRemota != null) await esperaRemota!.future;
    return {'ok': true, 'iglesiaId': 'iglesia'};
  }

  Future<ResultadoIngreso> ingresar({bool nueva = true}) =>
      coordinador.ingresar(
        TipoIngresoPendiente.vinculacion,
        parametros,
        nuevaIntencionConfirmada: nueva,
      );
  Future<void> cerrar() async {
    await auth.cambios.close();
    await flujo.close();
  }
}

void main() {
  late EscenarioIngreso s;
  setUp(() {
    s = EscenarioIngreso();
  });
  tearDown(() async {
    await s.cerrar();
  });

  test('Primera intención requiere decisión; persiste antes de llamar y confirma mediante consulta', () async {
    expect(
      (await s.ingresar(nueva: false)).estado,
      EstadoResultadoIngreso.requiereDecision,
    );
    expect(s.llamadas, isEmpty);
    expect((await s.ingresar()).confirmado, true);
    expect(s.llamadas.map((x) => x.$1), [
      'vincularUsuarioConCodigo',
      'consultarEstadoSolicitudIngreso',
    ]);
    expect(s.coordinador.permitePerfil(s.uid, 'iglesia', 'a' * 64), true);
    expect(
      (await s.coordinador.persistencia.recuperar(s.uid))!.estado,
      EstadoIngresoPendiente.confirmada,
    );
  });

  test(
    'Timeout conserva clave incierta y reintento no duplica identidad',
    () async {
      s.errorIngreso = FirebaseFunctionsException(
        code: 'deadline-exceeded',
        message: 'privado',
      );
      expect((await s.ingresar()).estado, EstadoResultadoIngreso.incierto);
      final original = s.coordinador.solicitud!.solicitudId;
      expect(s.coordinador.solicitud!.estado, EstadoIngresoPendiente.incierto);
      s.errorIngreso = null;
      expect((await s.ingresar(nueva: false)).confirmado, true);
      expect(
        s.llamadas
            .where((x) => x.$1 == 'vincularUsuarioConCodigo')
            .map((x) => x.$2['solicitudId'])
            .toSet(),
        {original},
      );
    },
  );

  for (final codigo in [
    'not-found',
    'already-exists',
    'permission-denied',
    'unauthenticated',
  ]) {
    for (final reiniciar in [false, true]) {
      test('Reintento $codigo conserva incertidumbre; reinicio=$reiniciar', () async {
        // Simula commit remoto con respuesta perdida.
        s.esperaRemota = Completer<void>();
        final envio = s.ingresar();
        while (s.llamadas.isEmpty) {
          await Future<void>.delayed(Duration.zero);
        }
        s.esperaRemota!.completeError(StateError('respuesta perdida'));
        expect((await envio).estado, EstadoResultadoIngreso.incierto);
        final original = s.coordinador.solicitud!.solicitudId;
        final coordinador = reiniciar ? s.nuevoCoordinador() : s.coordinador;
        if (reiniciar) await coordinador.prepararSesion();
        s.errorIngreso = FirebaseFunctionsException(
          code: codigo,
          message: 'Rechazo simulado del reintento.',
        );
        final resultado = await coordinador.ingresar(
          TipoIngresoPendiente.vinculacion,
          s.parametros,
        );
        expect(resultado.estado, EstadoResultadoIngreso.requiereReconciliacion);
        expect(coordinador.solicitud!.estado, EstadoIngresoPendiente.incierto);
        expect((await coordinador.persistencia.recuperar(s.uid))!.solicitudId, original);
        expect((await coordinador.abandonarPendiente(confirmadoPorUsuario: true)).confirmado, false);
        final llamadas = s.llamadas.length;
        await coordinador.ingresar(
          TipoIngresoPendiente.vinculacion,
          {...s.parametros, 'codigo': 'OTRO'},
          nuevaIntencionConfirmada: true,
        );
        expect(s.llamadas.length, llamadas);
        expect((await coordinador.reconciliar()).confirmado, true);
        expect(coordinador.solicitud!.solicitudId, original);
      });
    }
  }

  test('Reinicio restaura intención antes de decidir acceso', () async {
    s.errorIngreso = StateError('timeout');
    await s.ingresar();
    final reiniciado = s.nuevoCoordinador();
    expect(reiniciado.bloqueaDashboard, true);
    await reiniciado.prepararSesion();
    expect(
      reiniciado.solicitud!.solicitudId,
      s.coordinador.solicitud!.solicitudId,
    );
    expect(reiniciado.bloqueaDashboard, true);
  });

  for (final estado in ['CONFIRMADA_NO_VIGENTE', 'NO_VERIFICABLE']) {
    test('$estado no navega ni crea otra intención', () async {
      s.consulta = estado;
      expect((await s.ingresar()).confirmado, false);
      expect(s.coordinador.permitePerfil(s.uid, 'iglesia', 'a' * 64), false);
      expect(
        s.llamadas.where((x) => x.$1 == 'vincularUsuarioConCodigo'),
        hasLength(1),
      );
      if (estado == 'NO_VERIFICABLE') {
        expect(
          (await s.coordinador.abandonarPendiente(confirmadoPorUsuario: true))
              .confirmado,
          false,
        );
        expect(
          s.coordinador.solicitud!.estado,
          EstadoIngresoPendiente.incierto,
        );
      }
    });
  }

  test('Red en consulta no equivale a ausencia y no confirma', () async {
    s.errorConsulta = FirebaseFunctionsException(
      code: 'unavailable',
      message: 'detalle',
    );
    final resultado = await s.ingresar();
    expect(resultado.estado, EstadoResultadoIngreso.requiereReconciliacion);
    expect(s.coordinador.bloqueaDashboard, true);
    expect(s.coordinador.solicitud!.estado, EstadoIngresoPendiente.incierto);
  });

  test('Fallo local posterior a confirmación remota se reconcilia con la clave original', () async {
    s.almacen.fallarEn = 3;
    expect(
      (await s.ingresar()).estado,
      EstadoResultadoIngreso.requiereReconciliacion,
    );
    final original = s.coordinador.solicitud!.solicitudId;
    expect(s.coordinador.bloqueaDashboard, true);
    s.almacen.fallarEn = null;
    expect((await s.coordinador.reconciliar()).confirmado, true);
    expect(s.coordinador.solicitud!.solicitudId, original);
    expect(
      s.llamadas.where((x) => x.$1 == 'vincularUsuarioConCodigo'),
      hasLength(1),
    );
  });

  test(
    'Cambio de parámetros requiere decisión y no reemplaza una clave incierta',
    () async {
      s.errorIngreso = StateError('red');
      await s.ingresar();
      final original = s.coordinador.solicitud!.solicitudId;
      final resultado = await s.coordinador.ingresar(
        TipoIngresoPendiente.vinculacion,
        {...s.parametros, 'codigo': 'DISTINTO'},
        nuevaIntencionConfirmada: true,
      );
      expect(resultado.estado, EstadoResultadoIngreso.requiereDecision);
      expect(s.coordinador.solicitud!.solicitudId, original);
      expect(s.llamadas, hasLength(1));
    },
  );

  test('Cambio de sesión durante operación invalida resultados y no contamina otra intención', () async {
    s.esperaRemota = Completer<void>();
    final pendiente = s.ingresar();
    for (var i = 0; i < 12; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    final antiguoUid = s.uid;
    s.auth.cambiar('nuevo-${s.uid}');
    s.coordinador.cambiarSesion(s.uid);
    await s.coordinador.prepararSesion();
    s.esperaRemota!.complete();
    expect((await pendiente).confirmado, false);
    expect(s.coordinador.uid, s.uid);
    expect(s.coordinador.solicitud, isNull);
    expect(s.coordinador.permitePerfil(antiguoUid, 'iglesia', 'a' * 64), false);
  });

  test(
    'Cambio de período entre lecturas servidor invalida la confirmación',
    () async {
      s.alLeer = () {
        if (s.lecturas == 2) s.perfiles[s.uid]!['pertenenciaId'] = 'b' * 64;
      };
      expect((await s.ingresar()).confirmado, false);
      expect(s.coordinador.bloqueaDashboard, true);
    },
  );

  for (final codigo in ['not-found', 'failed-precondition']) {
    test('Error $codigo no crea una solicitud nueva automáticamente', () async {
      s.errorIngreso = FirebaseFunctionsException(
        code: codigo,
        message: 'rechazo de prueba',
      );
      final resultado = await s.ingresar();
      expect(
        resultado.estado,
        codigo == 'not-found'
            ? EstadoResultadoIngreso.rechazado
            : EstadoResultadoIngreso.requiereReconciliacion,
      );
      final original = s.coordinador.solicitud!.solicitudId;
      await s.ingresar(nueva: false);
      expect(s.coordinador.solicitud!.solicitudId, original);
    });
  }

  test('AuthService envía contratos normalizados e identidad comprobada en ambas operaciones', () async {
    final rechazado = await s.servicio.vincularConCodigoPersistente(
      uid: 'ajeno',
      email: '',
      nombre: '',
      codigo: 'CODIGO',
      confirmarNuevaIntencion: true,
    );
    expect(rechazado.confirmado, false);
    expect(s.llamadas, isEmpty);
    expect(
      (await s.servicio.registrarNuevaIglesiaPersistente(
        uid: s.uid,
        email: ' x ',
        nombreAdmin: ' Nombre ',
        nombreIglesia: ' Iglesia ',
        codigoDeseado: ' codigo ',
        descripcionIglesia: ' desc ',
        confirmarNuevaIntencion: true,
      )).confirmado,
      true,
    );
    expect(s.llamadas.first.$1, 'registrarNuevaIglesiaSegura');
    expect(s.llamadas.first.$2.keys.toSet(), {
      'email',
      'nombreAdmin',
      'nombreIglesia',
      'codigo',
      'descripcionIglesia',
      'fotoUrl',
      'descripcionAdmin',
      'solicitudId',
    });
    expect(s.llamadas.first.$2['codigo'], 'CODIGO');
    expect(s.llamadas.last.$2.keys.toSet(), {'solicitudId', 'tipo'});
    expect(s.llamadas.last.$2['tipo'], 'crear');
  });

  test(
    'Wrappers conservan Future<String?> sin fallback sin solicitudId',
    () async {
      final resultado = await s.servicio.vincularConCodigo(
        uid: s.uid,
        email: '',
        nombre: '',
        codigo: 'CODIGO',
      );
      expect(resultado, isA<String>());
      expect(s.llamadas, isEmpty);
    },
  );

  test(
    'Creación reintentada conserva solicitudId y parámetros exactos',
    () async {
      s.errorIngreso = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'red',
      );
      Future<ResultadoIngreso> crear(bool nueva) =>
          s.servicio.registrarNuevaIglesiaPersistente(
            uid: s.uid,
            email: 'correo',
            nombreAdmin: 'Nombre',
            nombreIglesia: 'Iglesia',
            codigoDeseado: 'CODIGO',
            descripcionIglesia: '',
            confirmarNuevaIntencion: nueva,
          );
      await crear(true);
      s.errorIngreso = null;
      expect((await crear(false)).confirmado, true);
      final llamadas = s.llamadas
          .where((x) => x.$1 == 'registrarNuevaIglesiaSegura')
          .toList();
      expect(llamadas, hasLength(2));
      expect(llamadas.first.$2, llamadas.last.$2);
    },
  );

  test('Consulta no verificable no permite reemplazar una intención confirmada guardada', () async {
    await s.ingresar();
    s.consulta = 'NO_VERIFICABLE';
    await s.coordinador.reconciliar();
    final id = s.coordinador.solicitud!.solicitudId;
    expect(
      (await s.ingresar()).estado,
      EstadoResultadoIngreso.requiereReconciliacion,
    );
    expect(s.coordinador.solicitud!.solicitudId, id);
    expect(
      s.llamadas.where((x) => x.$1 == 'vincularUsuarioConCodigo'),
      hasLength(1),
    );
  });

  test(
    'Cambio de UID durante preparación no envía datos de la sesión anterior',
    () async {
      s.almacen.esperaLectura = Completer<void>();
      final pendiente = s.ingresar();
      await Future<void>.delayed(Duration.zero);
      s.auth.cambiar('cambio-durante-preparacion');
      s.coordinador.cambiarSesion(s.uid);
      s.almacen.esperaLectura!.complete();
      expect((await pendiente).confirmado, false);
      expect(s.llamadas, isEmpty);
      expect(s.almacen.escrituras, 0);
    },
  );

  test('Dos acciones simultáneas no envían operaciones duplicadas', () async {
    s.esperaRemota = Completer<void>();
    final primera = s.ingresar();
    for (var i = 0; i < 8; i++) {
      await Future<void>.delayed(Duration.zero);
    }
    expect((await s.ingresar()).confirmado, false);
    s.esperaRemota!.complete();
    expect((await primera).confirmado, true);
    expect(
      s.llamadas.where((x) => x.$1 == 'vincularUsuarioConCodigo'),
      hasLength(1),
    );
  });

  Future<void> avanzar(WidgetTester tester) async {
    // La cola estática también recibe acciones de tests unitarios fuera de FakeAsync.
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
  }

  Future<void> montarRoot(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: RootGate(
          authService: s.servicio,
          persistenciaSalida: DesvinculacionPendienteService(
            almacen: AlmacenPruebaIngreso(),
            uidActual: () => s.auth.currentUser?.uid,
          ),
          observarPerfil: (_) => s.flujo.stream,
          habilitarNotificaciones: false,
          dashboardBuilder: (_, _) =>
              const Scaffold(body: Text('Dashboard probado')),
        ),
      ),
    );
    await avanzar(tester);
  }

  testWidgets('RootGate: usuario antiguo sin intención entra normalmente', (
    tester,
  ) async {
    s.perfiles[s.uid] = {'iglesiaId': 'iglesia', 'rolGlobal': 'servidor'};
    await montarRoot(tester);
    expect(find.text('Dashboard probado'), findsOneWidget);
    expect(s.llamadas, isEmpty);
  });

  testWidgets(
    'RootGate: perfil llega antes que Functions y no salta recuperación',
    (tester) async {
      await montarRoot(tester);
      s.esperaRemota = Completer<void>();
      final pendiente = s.ingresar();
      await avanzar(tester);
      expect(s.perfiles[s.uid]!['iglesiaId'], 'iglesia');
      expect(find.text('Dashboard probado'), findsNothing);
      s.esperaRemota!.complete();
      await avanzar(tester);
      expect(s.coordinador.ocupado, false);
      expect((await pendiente).confirmado, true);
      expect(find.text('Dashboard probado'), findsOneWidget);
    },
  );

  for (final estado in ['CONFIRMADA_NO_VIGENTE', 'NO_VERIFICABLE']) {
    testWidgets(
      'RootGate no navega con $estado aunque el perfil tenga iglesia',
      (tester) async {
        await montarRoot(tester);
        s.consulta = estado;
        final ingreso = s.ingresar();
        await avanzar(tester);
        expect((await ingreso).confirmado, false);
        expect(find.text('Dashboard probado'), findsNothing);
      },
    );
  }

  testWidgets(
    'RootGate: espera lectura inicial y restaura intención antes de dashboard',
    (tester) async {
      await tester.runAsync(
        () => IngresoPendienteService(almacen: s.almacen).crearORecuperar(
          uid: s.uid,
          tipo: TipoIngresoPendiente.vinculacion,
          huella: CoordinadorIngreso.huella(s.parametros),
          nuevaIntencionConfirmada: true,
        ),
      );
      s.perfiles[s.uid] = {'iglesiaId': 'iglesia', 'pertenenciaId': 'a' * 64};
      s.almacen.esperaLectura = Completer<void>();
      await montarRoot(tester);
      expect(find.text('Dashboard probado'), findsNothing);
      s.almacen.esperaLectura!.complete();
      await avanzar(tester);
      expect(find.text('Dashboard probado'), findsNothing);
      expect(find.text('Recuperar estado de la solicitud'), findsOneWidget);
    },
  );

  for (final fallo in ['corrupto', 'inaccesible']) {
    testWidgets(
      'RootGate: almacenamiento $fallo bloquea dashboard con perfil existente',
      (tester) async {
        await tester.runAsync(
          () => IngresoPendienteService(almacen: s.almacen).crearORecuperar(
            uid: s.uid,
            tipo: TipoIngresoPendiente.vinculacion,
            huella: CoordinadorIngreso.huella(s.parametros),
            nuevaIntencionConfirmada: true,
          ),
        );
        if (fallo == 'corrupto') {
          s.almacen.datos[s.almacen.datos.keys.single] = '{';
        } else {
          s.almacen.fallaLeer = true;
        }
        s.perfiles[s.uid] = {'iglesiaId': 'iglesia', 'pertenenciaId': 'a' * 64};
        await montarRoot(tester);
        expect(find.text('Dashboard probado'), findsNothing);
        expect(s.coordinador.bloqueaDashboard, true);
      },
    );
  }

  testWidgets(
    'RootGate: cambio de UID no conserva dashboard de la sesión anterior',
    (tester) async {
      s.perfiles[s.uid] = {'iglesiaId': 'iglesia'};
      await montarRoot(tester);
      expect(find.text('Dashboard probado'), findsOneWidget);
      s.auth.cambiar('usuario-sin-iglesia');
      await avanzar(tester);
      expect(find.text('Dashboard probado'), findsNothing);
      expect(s.coordinador.uid, 'usuario-sin-iglesia');
    },
  );

  testWidgets('Onboarding pide confirmación explícita y cancelar no envía', (
    tester,
  ) async {
    await tester.runAsync(() => s.coordinador.prepararSesion());
    await tester.pumpWidget(
      MaterialApp(
        home: OnboardingIglesiaScreen(
          user: s.auth.currentUser!,
          authService: s.servicio,
          onCompletado: () {},
        ),
      ),
    );
    await tester.tap(find.text('Vincular y Continuar'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmar intención'), findsOneWidget);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, isEmpty);
  });

  testWidgets(
    'AuthScreen conserva pantalla de acceso e inyecta servicio sin Firebase real',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: AuthScreen(authService: s.servicio, onVinculado: () {}),
        ),
      );
      expect(find.text('Ingresar'), findsOneWidget);
      expect(find.text('Continuar con Google'), findsOneWidget);
      expect(s.llamadas, isEmpty);
    },
  );

  test(
    'Registro persistente no contiene parámetros ni datos de formulario',
    () async {
      await s.ingresar();
      final serializado = s.almacen.datos.values.single;
      expect(
        jsonDecode(serializado)['huella'],
        CoordinadorIngreso.huella(s.parametros),
      );
      expect(serializado.contains('CODIGO'), false);
      expect(serializado.contains('prueba@example.invalid'), false);
    },
  );
}
