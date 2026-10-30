import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:fesync/core/services/roles_service.dart';
import 'package:flutter_test/flutter_test.dart';

class AlmacenRoles implements AlmacenIngresoPendiente {
  final datos = <String, String>{};
  bool fallaLeer = false, fallaEscribir = false;
  @override
  Future<String?> leer(String clave) async {
    if (fallaLeer) throw StateError('Lectura simulada');
    return datos[clave];
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    if (fallaEscribir) throw StateError('Escritura simulada');
    datos[clave] = valor;
  }
}

class PruebaRoles {
  PruebaRoles() {
    uid = actor;
    servicio = crear();
  }
  static int numero = 0;
  final actor = 'actor-roles-${numero++}';
  String? uid;
  final almacen = AlmacenRoles();
  final sesiones = StreamController<String?>.broadcast(sync: true);
  final llamadas = <(String, Map<String, Object?>)>[];
  late RolesService servicio;
  Object? errorContexto, errorCambio;
  Object? respuesta = {'estado': 'CONFIRMADA', 'huboCambio': true};
  Completer<Object?>? espera;
  static final contexto = ContextoCambioRol(
    'servidor',
    'a' * 64,
    '1700000000:123456789',
    '1700000001:987654321',
  );
  RolesPendienteService get persistencia =>
      RolesPendienteService(almacen: almacen);
  RolesService crear({Duration tiempo = const Duration(seconds: 30)}) =>
      RolesService(
        uidActual: () => uid,
        cambiosSesion: sesiones.stream,
        persistencia: persistencia,
        tiempoEspera: tiempo,
        functionsPorRegion: (_) => throw StateError('Firebase real prohibido'),
        llamar: (nombre, datos) async {
          llamadas.add((nombre, Map.of(datos)));
          if (nombre == 'obtenerContextoCambioRolMiembro') {
            if (errorContexto != null) throw errorContexto!;
            return {
              'rolActual': contexto.rolActual,
              'pertenenciaId': contexto.pertenenciaId,
              'versionPerfilEsperada': contexto.versionPerfilEsperada,
              'versionIglesiaEsperada': contexto.versionIglesiaEsperada,
            };
          }
          // Verifica persistencia y estado incierto ANTES de cualquier llamada remota.
          final registro = jsonDecode(almacen.datos.values.single) as Map;
          expect(registro['estado'], 'incierta');
          expect(registro['parametros'], datos);
          if (errorCambio != null) throw errorCambio!;
          return espera != null ? espera!.future : respuesta;
        },
      );
  Future<void> cambiar({String rol = 'lider_area'}) =>
      servicio.cambiar('iglesia', 'objetivo', contexto, rol, confirmado: true);
  void sesion(String? nuevo) {
    uid = nuevo;
    sesiones.add(nuevo);
  }

  Future<void> cerrar() async {
    servicio.dispose();
    await sesiones.close();
  }
}

Matcher codigo(String c) =>
    isA<ErrorRoles>().having((e) => e.codigo, 'código', c);

void main() {
  late PruebaRoles p;
  setUp(() => p = PruebaRoles());
  tearDown(() => p.cerrar());
  test(
    'contexto exacto sin pérdida de nanosegundos; payload y éxito persistido',
    () async {
      final c = await p.servicio.obtenerContexto('iglesia', 'objetivo');
      expect(c.versionPerfilEsperada, '1700000000:123456789');
      expect(c.versionIglesiaEsperada, '1700000001:987654321');
      await p.cambiar();
      final d = p.llamadas.last.$2;
      expect(d.keys.toSet(), RolesPendienteService.campos.toSet());
      expect(d['rolNuevo'], 'lider_area');
      expect(d['versionPerfilEsperada'], c.versionPerfilEsperada);
      expect(d['versionIglesiaEsperada'], c.versionIglesiaEsperada);
      expect(d['solicitudId'], matches(RegExp(r'^[a-f0-9]{64}$')));
      expect(
        (await p.servicio.recuperar('objetivo'))!.estado,
        EstadoSolicitudRol.confirmada,
      );
    },
  );
  test('sentido líder a servidor', () async {
    await p.servicio.cambiar(
      'iglesia',
      'objetivo',
      ContextoCambioRol(
        'lider_area',
        'a' * 64,
        '1700000000:123456789',
        '1700000001:987654321',
      ),
      'servidor',
      confirmado: true,
    );
    expect(p.llamadas.single.$2['rolNuevo'], 'servidor');
  });
  test('región configurada sin Firebase real', () async {
    String? region;
    final s = RolesService(
      uidActual: () => p.uid,
      cambiosSesion: p.sesiones.stream,
      functionsPorRegion: (r) {
        region = r;
        throw StateError('Sin red');
      },
    );
    await expectLater(
      s.obtenerContexto('iglesia', 'objetivo'),
      throwsStateError,
    );
    expect(region, 'southamerica-west1');
    s.dispose();
  });
  test('sin Auth no lee ni escribe ni llama', () async {
    p.sesion(null);
    await expectLater(p.cambiar(), throwsA(codigo('unauthenticated')));
    expect(p.llamadas, isEmpty);
    expect(p.almacen.datos, isEmpty);
  });
  for (final code in ['permission-denied', 'failed-precondition']) {
    test('contexto rechaza $code sin preparar intención', () async {
      p.errorContexto = FirebaseFunctionsException(
        code: code,
        message: 'simulado',
      );
      await expectLater(
        p.servicio.obtenerContexto('iglesia', 'objetivo'),
        throwsA(isA<FirebaseFunctionsException>()),
      );
      expect(p.almacen.datos, isEmpty);
    });
  }
  for (final code in [
    'aborted',
    'permission-denied',
    'failed-precondition',
    'invalid-argument',
  ]) {
    test('$code exige revisión explícita sin refrescar ni reenviar', () async {
      p.errorCambio = FirebaseFunctionsException(
        code: code,
        message: 'simulado',
      );
      await expectLater(p.cambiar(), throwsA(codigo(code)));
      expect(p.llamadas.length, 1);
      expect(
        (await p.servicio.recuperar('objetivo'))!.estado,
        EstadoSolicitudRol.rechazada,
      );
    });
  }
  for (final e in [
    TimeoutException('simulado'),
    FirebaseFunctionsException(code: 'unavailable', message: 'simulado'),
    StateError('Red simulada'),
  ]) {
    test(
      'error incierto conserva exactamente clave/payload: ${e.runtimeType}',
      () async {
        p.errorCambio = e;
        await expectLater(p.cambiar(), throwsA(anything));
        final original = Map.of(p.llamadas.single.$2);
        final anterior = await p.servicio.recuperar('objetivo');
        expect(anterior!.estado, EstadoSolicitudRol.incierta);
        await expectLater(p.cambiar(), throwsA(codigo('solicitud-pendiente')));
        p.errorCambio = null;
        await p.servicio.reintentar('objetivo');
        expect(p.llamadas.last.$2, original);
        expect(p.llamadas.length, 2);
      },
    );
  }
  test(
    'reinicio recupera payload original y replay histórico sin contexto nuevo',
    () async {
      p.errorCambio = TimeoutException('simulado');
      await expectLater(p.cambiar(), throwsA(anything));
      final original = p.llamadas.single.$2;
      p.servicio.dispose();
      p.servicio = p.crear();
      p.errorCambio = null;
      await p.servicio.reintentar('objetivo');
      expect(p.llamadas.last.$2, original);
      expect(p.llamadas.every((l) => l.$1 == 'actualizarRolMiembro'), isTrue);
    },
  );
  test(
    'timeout real del cliente conserva registro aunque resultado llegue tarde',
    () async {
      p.servicio.dispose();
      p.servicio = p.crear(tiempo: const Duration(milliseconds: 5));
      p.espera = Completer();
      await expectLater(p.cambiar(), throwsA(codigo('resultado-incierto')));
      p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
      await Future<void>.delayed(Duration.zero);
      expect(
        (await p.servicio.recuperar('objetivo'))!.estado,
        EstadoSolicitudRol.incierta,
      );
    },
  );
  test('fallo de persistencia antes de envío bloquea backend', () async {
    p.almacen.fallaEscribir = true;
    await expectLater(
      p.cambiar(),
      throwsA(codigo('persistencia-no-confirmada')),
    );
    expect(p.llamadas, isEmpty);
  });
  test(
    'fallo local después de confirmar remoto permite replay misma clave',
    () async {
      p.espera = Completer();
      final envio = p.cambiar();
      await Future<void>.delayed(Duration.zero);
      expect(p.llamadas, hasLength(1));
      p.almacen.fallaEscribir = true;
      p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
      await expectLater(envio, throwsA(codigo('persistencia-no-confirmada')));
      p.almacen.fallaEscribir = false;
      p.espera = null;
      await p.servicio.reintentar('objetivo');
      expect(p.llamadas.first.$2, p.llamadas.last.$2);
    },
  );
  test('A→B→A no aplica respuesta tardía', () async {
    p.espera = Completer();
    final envio = p.cambiar();
    await Future<void>.delayed(Duration.zero);
    p.sesion('otro');
    p.sesion(p.actor);
    p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
    await expectLater(envio, throwsA(codigo('sesion-cambiada')));
    expect(
      (await p.servicio.recuperar('objetivo'))!.estado,
      EstadoSolicitudRol.incierta,
    );
  });
  test('otro UID no recupera ni reutiliza solicitud del actor', () async {
    p.errorCambio = TimeoutException('simulado');
    await expectLater(p.cambiar(), throwsA(anything));
    p.sesion('otro');
    expect(await p.servicio.recuperar('objetivo'), isNull);
    await expectLater(
      p.servicio.reintentar('objetivo'),
      throwsA(codigo('sin-solicitud-incierta')),
    );
    expect(p.llamadas, hasLength(1));
  });
  test('concurrencia incluso entre instancias no duplica solicitud', () async {
    p.espera = Completer();
    final envio = p.cambiar();
    final otro = p.crear();
    await expectLater(
      otro.cambiar(
        'iglesia',
        'objetivo',
        PruebaRoles.contexto,
        'lider_area',
        confirmado: true,
      ),
      throwsA(codigo('operacion-en-curso')),
    );
    await Future<void>.delayed(Duration.zero);
    p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
    await envio;
    otro.dispose();
    expect(p.llamadas.length, 1);
  });
  test(
    'cerrar editor/servicio invalida retorno pero conserva registro incierto',
    () async {
      p.espera = Completer();
      final envio = p.cambiar();
      await Future<void>.delayed(Duration.zero);
      p.servicio.dispose();
      p.servicio = p.crear();
      p.espera!.complete({'estado': 'CONFIRMADA', 'huboCambio': true});
      await expectLater(envio, throwsA(codigo('sesion-cambiada')));
      expect(
        (await p.servicio.recuperar('objetivo'))!.estado,
        EstadoSolicitudRol.incierta,
      );
    },
  );
  test('respuesta inválida nunca confirma', () async {
    p.respuesta = {'ok': true};
    await expectLater(p.cambiar(), throwsA(codigo('resultado-incierto')));
    expect(
      (await p.servicio.recuperar('objetivo'))!.estado,
      EstadoSolicitudRol.incierta,
    );
  });
  for (final code in [
    'unauthenticated',
    'permission-denied',
    'aborted',
    'failed-precondition',
  ]) {
    test(
      'rechazo $code de reintento no borra incertidumbre anterior',
      () async {
        p.errorCambio = TimeoutException('simulado');
        await expectLater(p.cambiar(), throwsA(anything));
        final original = p.llamadas.single.$2;
        p.errorCambio = FirebaseFunctionsException(
          code: code,
          message: 'simulado',
        );
        await expectLater(
          p.servicio.reintentar('objetivo'),
          throwsA(codigo(code)),
        );
        expect(
          (await p.servicio.recuperar('objetivo'))!.estado,
          EstadoSolicitudRol.incierta,
        );
        await expectLater(p.cambiar(), throwsA(codigo('solicitud-pendiente')));
        expect(p.llamadas.last.$2, original);
      },
    );
  }
  test('fuentes nuevas sin Firestore, FCM o fallback; editor actualiza solo descripción', () {
    final servicio = File('lib/core/services/roles_service.dart')
        .readAsStringSync();
    expect(servicio, isNot(contains('cloud_firestore')));
    expect(servicio, isNot(contains('NotificationService')));
    final pantalla = File('lib/modules/miembros/gestion_miembros_screen.dart')
        .readAsStringSync();
    final editor = pantalla.substring(
      pantalla.indexOf('  Future<void> _editarMiembro('),
      pantalla.indexOf('  Future<void> _quitarMiembro('),
    );
    expect(editor, contains("update({'descripcion': descripcion})"));
    expect(editor, isNot(contains("'rolGlobal':")));
  });
}
