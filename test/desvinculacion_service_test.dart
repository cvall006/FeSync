import 'dart:async';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/services/desvinculacion_service.dart';
import 'package:flutter_test/flutter_test.dart';

const periodo =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clave = 'solicitud-00000001';

class Escenario {
  Escenario({Duration tiempoEspera = const Duration(seconds: 30)}) {
    servicio = DesvinculacionService(
      uidActual: () {
        if (errorAuth != null) throw errorAuth!;
        return uid;
      },
      llamar: (nombre, datos) async {
        llamadas.add((nombre: nombre, datos: Map.of(datos)));
        if (error != null) throw error!;
        return pendiente?.future ?? respuesta;
      },
      functionsPorRegion: (_) => throw StateError('Firebase real prohibido.'),
      tiempoEspera: tiempoEspera,
    );
  }

  String? uid = 'miembro';
  Object? errorAuth;
  Object? error;
  Object? respuesta = {'ok': true};
  Completer<Object?>? pendiente;
  final llamadas = <({String nombre, Map<String, Object?> datos})>[];
  late final DesvinculacionService servicio;

  Future<ResultadoDesvinculacion> ejecutar({
    String iglesiaId = 'iglesia',
    String uidObjetivo = 'miembro',
    AccionDesvinculacion accion = AccionDesvinculacion.salir,
    String solicitudId = clave,
    String? pertenenciaId = periodo,
  }) => servicio.desvincular(
    iglesiaId: iglesiaId,
    uidObjetivo: uidObjetivo,
    accion: accion,
    solicitudId: solicitudId,
    pertenenciaId: pertenenciaId,
  );
}

class FunctionsPrueba implements FirebaseFunctions {
  final llamadas = <({String nombre, Object? datos})>[];
  Object? respuesta = {'ok': true};
  HttpsCallableOptions? opciones;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    opciones = options;
    return CallablePrueba(this, name);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación SDK inesperada.');
}

class CallablePrueba implements HttpsCallable {
  CallablePrueba(this.functions, this.nombre);
  final FunctionsPrueba functions;
  final String nombre;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    functions.llamadas.add((nombre: nombre, datos: parameters));
    return RespuestaPrueba<T>(functions.respuesta as T);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación callable inesperada.');
}

class RespuestaPrueba<T> implements HttpsCallableResult<T> {
  RespuestaPrueba(this.data);
  @override
  final T data;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación resultado inesperada.');
}

void main() {
  Map<String, Object?> contextoRemoto() => {
    'solicitudId': clave,
    'iglesiaId': 'iglesia',
    'uidObjetivo': 'miembro',
    'accion': 'salir',
    'pertenenciaId': periodo,
  };

  test(
    'Recuperación tipada usa región correcta y envía únicamente solicitudId',
    () async {
      final functions = FunctionsPrueba()
        ..respuesta = {'estado': 'CONFIRMADA', 'contexto': contextoRemoto()};
      final regiones = <String>[];
      final servicio = DesvinculacionService(
        uidActual: () => 'miembro',
        functionsPorRegion: (r) {
          regiones.add(r);
          return functions;
        },
      );
      final r = await servicio.recuperarContextoSolicitud(solicitudId: clave);
      expect(r.estado, EstadoRecuperacionDesvinculacion.confirmada);
      expect(r.error, isNull);
      expect(r.contexto!.actorUid, 'miembro');
      expect(r.contexto!.pertenenciaId, periodo);
      expect(regiones, ['southamerica-west1']);
      expect(
        functions.llamadas.single.nombre,
        'recuperarContextoSolicitudDesvinculacion',
      );
      expect(functions.llamadas.single.datos, {'solicitudId': clave});
    },
  );

  for (final entrada in {
    'RECIBO_AUSENTE': EstadoRecuperacionDesvinculacion.reciboAusente,
    'NO_VERIFICABLE': EstadoRecuperacionDesvinculacion.noVerificable,
  }.entries) {
    test(
      'Recuperación ${entrada.key} no devuelve contexto ni error ficticio',
      () async {
        final s = Escenario()..respuesta = {'estado': entrada.key};
        final r = await s.servicio.recuperarContextoSolicitud(
          solicitudId: clave,
        );
        expect(r.estado, entrada.value);
        expect(r.contexto, isNull);
        expect(r.error, isNull);
      },
    );
  }

  test(
    'Recuperación rechaza Auth y solicitudes inválidas antes de llamar',
    () async {
      final s = Escenario()..uid = null;
      expect(
        (await s.servicio.recuperarContextoSolicitud(solicitudId: clave))
            .error!
            .codigo,
        'unauthenticated',
      );
      s.uid = 'miembro';
      for (final id in [
        '',
        'x' * 15,
        'x' * 129,
        '../ruta/ajena',
        '__reservado_largo__',
      ]) {
        expect(
          (await s.servicio.recuperarContextoSolicitud(solicitudId: id))
              .error!
              .codigo,
          'invalid-argument',
        );
      }
      expect(s.llamadas, isEmpty);
    },
  );

  test('Recuperación valida esquema exacto, nonce, tipos, identidad y formatos remotos', () async {
    for (final cambio in <Map<String, Object?>>[
      {'solicitudId': 'solicitud-00000002'},
      {'actorUid': 'otro'},
      {'uidObjetivo': 'otro'},
      {'iglesiaId': null},
      {'iglesiaId': 'a/b'},
      {'pertenenciaId': 'B' * 64},
      {'accion': 'nueva'},
      {'uidObjetivo': 1},
    ]) {
      final s = Escenario()
        ..respuesta = {
          'estado': 'CONFIRMADA',
          'contexto': {...contextoRemoto(), ...cambio},
        };
      final r = await s.servicio.recuperarContextoSolicitud(solicitudId: clave);
      expect(r.error!.codigo, 'respuesta-no-verificable');
      expect(r.contexto, isNull);
    }
    for (final respuesta in [
      null,
      {},
      {'estado': 'CONFIRMADA'},
      {'estado': 'RECIBO_AUSENTE', 'contexto': contextoRemoto()},
      {'estado': 'CONFIRMADA', 'contexto': contextoRemoto(), 'extra': true},
    ]) {
      final s = Escenario()..respuesta = respuesta;
      expect(
        (await s.servicio.recuperarContextoSolicitud(solicitudId: clave)).error,
        isNotNull,
      );
    }
  });

  test('Red, timeout y lectura fallida de recuperación nunca significan recibo ausente', () async {
    for (final e in [
      TimeoutException('SECRETO'),
      StateError('SECRETO'),
      FirebaseFunctionsException(code: 'unavailable', message: 'SECRETO'),
      FirebaseFunctionsException(code: 'internal', message: 'SECRETO'),
    ]) {
      final s = Escenario()..error = e;
      final r = await s.servicio.recuperarContextoSolicitud(solicitudId: clave);
      expect(r.estado, isNull);
      expect(r.error!.estado, EstadoDesvinculacion.incierto);
      expect(r.error!.codigo, isNot(contains('SECRETO')));
    }
  });

  test(
    'Respuesta tardía de recuperación no retorna contexto a otro UID',
    () async {
      final s = Escenario()..pendiente = Completer<Object?>();
      final tarea = s.servicio.recuperarContextoSolicitud(solicitudId: clave);
      await Future<void>.delayed(Duration.zero);
      s.uid = 'otro';
      s.pendiente!.complete({
        'estado': 'CONFIRMADA',
        'contexto': contextoRemoto(),
      });
      final r = await tarea;
      expect(r.contexto, isNull);
      expect(r.error!.codigo, 'sesion-cambiada');
    },
  );

  for (final entrada in {
    'NO_VERIFICABLE': EstadoReciboDesvinculacion.noVerificable,
    'CONFIRMADA_PERTENENCIA_TERMINADA':
        EstadoReciboDesvinculacion.confirmadaPertenenciaTerminada,
    'CONFIRMADA_NUEVA_PERTENENCIA':
        EstadoReciboDesvinculacion.confirmadaNuevaPertenencia,
    'CONFIRMADA_ESTADO_ACTUAL_NO_VERIFICABLE':
        EstadoReciboDesvinculacion.confirmadaEstadoActualNoVerificable,
  }.entries) {
    test(
      'Consulta tipada ${entrada.key} conserva región, contexto y significado',
      () async {
        final functions = FunctionsPrueba()
          ..respuesta = {'estado': entrada.key};
        final regiones = <String>[];
        final servicio = DesvinculacionService(
          uidActual: () => 'actor',
          functionsPorRegion: (r) {
            regiones.add(r);
            return functions;
          },
        );
        final r = await servicio.consultarEstadoSolicitud(
          iglesiaId: 'iglesia',
          uidObjetivo: 'objetivo',
          accion: AccionDesvinculacion.expulsar,
          solicitudId: clave,
          pertenenciaId: periodo,
        );
        expect(r.estado, entrada.value);
        expect(r.error, isNull);
        expect(
          r.confirmada,
          entrada.value != EstadoReciboDesvinculacion.noVerificable,
        );
        expect(regiones, ['southamerica-west1']);
        expect(
          functions.llamadas.single.nombre,
          'consultarEstadoSolicitudDesvinculacion',
        );
        expect(functions.llamadas.single.datos, {
          'iglesiaId': 'iglesia',
          'uidObjetivo': 'objetivo',
          'accion': 'expulsar',
          'solicitudId': clave,
          'pertenenciaId': periodo,
        });
      },
    );
  }
  test(
    'Consulta no inventa NO_VERIFICABLE para errores o protocolo desconocido',
    () async {
      final s = Escenario();
      for (final error in [
        TimeoutException('timeout'),
        FirebaseFunctionsException(code: 'unavailable', message: 'PRIVADO'),
      ]) {
        s.error = error;
        final r = await s.servicio.consultarEstadoSolicitud(
          iglesiaId: 'iglesia',
          uidObjetivo: 'miembro',
          accion: AccionDesvinculacion.salir,
          solicitudId: clave,
          pertenenciaId: periodo,
        );
        expect(r.estado, isNull);
        expect(r.error!.estado, EstadoDesvinculacion.incierto);
      }
      s.error = null;
      s.respuesta = {'estado': 'DESCONOCIDO'};
      final r = await s.servicio.consultarEstadoSolicitud(
        iglesiaId: 'iglesia',
        uidObjetivo: 'miembro',
        accion: AccionDesvinculacion.salir,
        solicitudId: clave,
        pertenenciaId: periodo,
      );
      expect(r.estado, isNull);
      expect(r.error!.codigo, 'respuesta-no-verificable');
    },
  );
  test('Consulta valida Auth y parámetros antes de llamar', () async {
    final s = Escenario()..uid = null;
    final r = await s.servicio.consultarEstadoSolicitud(
      iglesiaId: 'iglesia',
      uidObjetivo: 'miembro',
      accion: AccionDesvinculacion.salir,
      solicitudId: clave,
      pertenenciaId: periodo,
    );
    expect(r.error!.codigo, 'unauthenticated');
    s.uid = 'miembro';
    final invalida = await s.servicio.consultarEstadoSolicitud(
      iglesiaId: 'iglesia',
      uidObjetivo: 'miembro',
      accion: AccionDesvinculacion.salir,
      solicitudId: '',
      pertenenciaId: periodo,
    );
    expect(invalida.error!.codigo, 'invalid-argument');
    expect(s.llamadas, isEmpty);
  });
  for (final accion in AccionDesvinculacion.values) {
    test(
      '${accion.name} envía exactamente los cinco parámetros del backend',
      () async {
        final s = Escenario()
          ..uid = accion == AccionDesvinculacion.salir ? 'miembro' : 'admin';
        final r = await s.ejecutar(accion: accion);
        expect(r.estado, EstadoDesvinculacion.confirmado);
        expect(r.confirmado, isTrue);
        expect(s.llamadas, hasLength(1));
        expect(s.llamadas.single.nombre, 'desvincularMiembroIglesia');
        expect(s.llamadas.single.datos, {
          'iglesiaId': 'iglesia',
          'uidObjetivo': 'miembro',
          'accion': accion.name,
          'pertenenciaId': periodo,
          'solicitudId': clave,
        });
      },
    );
  }

  test('Adaptador Functions utiliza región y timeout correctos, sin inicializar Firebase', () async {
    final functions = FunctionsPrueba();
    final regiones = <String>[];
    final servicio = DesvinculacionService(
      uidActual: () => 'miembro',
      functionsPorRegion: (region) {
        regiones.add(region);
        return functions;
      },
      tiempoEspera: const Duration(seconds: 12),
    );
    expect(regiones, isEmpty);
    final r = await servicio.desvincular(
      iglesiaId: 'iglesia',
      uidObjetivo: 'miembro',
      accion: AccionDesvinculacion.salir,
      solicitudId: clave,
      pertenenciaId: periodo,
    );
    expect(r.confirmado, isTrue);
    expect(regiones, ['southamerica-west1']);
    expect(functions.opciones!.timeout, const Duration(seconds: 12));
    expect(functions.llamadas.single.nombre, 'desvincularMiembroIglesia');
    expect((functions.llamadas.single.datos as Map).keys, hasLength(5));
  });

  test(
    'Falta de sesión y UID malformado impiden toda llamada remota',
    () async {
      for (final uid in [null, '', ' ', 'a/b', 'a\n', 'x' * 129]) {
        final s = Escenario()..uid = uid;
        final r = await s.ejecutar();
        expect(r.codigo, 'unauthenticated');
        expect(r.estado, EstadoDesvinculacion.rechazado);
        expect(s.llamadas, isEmpty);
      }
    },
  );

  test(
    'Autenticación inaccesible es transitoria local; no se envía la solicitud',
    () async {
      final s = Escenario()..errorAuth = StateError('DATO_PRIVADO');
      expect((await s.ejecutar()).estado, EstadoDesvinculacion.transitorio);
      expect(s.llamadas, isEmpty);
    },
  );

  test('Salida de otra identidad se rechaza localmente', () async {
    final s = Escenario();
    final r = await s.ejecutar(uidObjetivo: 'otro');
    expect(r.codigo, 'permission-denied');
    expect(s.llamadas, isEmpty);
  });

  test('Iglesia y UID vacíos, reservados, con controles o límites excedidos se rechazan', () async {
    for (final id in [
      '',
      ' ',
      '.',
      '..',
      'a/b',
      '__reservado__',
      'id\n',
      'x' * 1501,
      'á' * 751,
    ]) {
      final s = Escenario();
      expect((await s.ejecutar(iglesiaId: id)).codigo, 'invalid-argument');
      expect(
        (await s.ejecutar(
          uidObjetivo: id,
          accion: AccionDesvinculacion.expulsar,
        )).codigo,
        'invalid-argument',
      );
      expect(s.llamadas, isEmpty);
    }
    final s = Escenario();
    expect(
      (await s.ejecutar(
        uidObjetivo: 'x' * 129,
        accion: AccionDesvinculacion.expulsar,
      )).codigo,
      'invalid-argument',
    );
  });

  test('Período ausente requiere migración sin Firebase ni fallback', () async {
    final s = Escenario();
    final r = await s.ejecutar(pertenenciaId: null);
    expect(r.estado, EstadoDesvinculacion.migracionRequerida);
    expect(r.confirmado, isFalse);
    expect(s.llamadas, isEmpty);
  });

  test('Períodos presentes inválidos no se convierten en migración ni se normalizan', () async {
    for (final id in [
      '',
      'a' * 63,
      'a' * 65,
      'A' * 64,
      'g' * 64,
      '$periodo\n',
      ' $periodo',
    ]) {
      final s = Escenario();
      expect((await s.ejecutar(pertenenciaId: id)).codigo, 'invalid-argument');
      expect(s.llamadas, isEmpty);
    }
  });

  test('Formato y longitud de solicitudId coinciden con el backend', () async {
    for (final id in [
      '',
      'x' * 15,
      'x' * 129,
      'x/' * 16,
      '${'x' * 16}\n',
      '__reservado_largo__',
      'á' * 16,
    ]) {
      final s = Escenario();
      expect((await s.ejecutar(solicitudId: id)).codigo, 'invalid-argument');
      expect(s.llamadas, isEmpty);
    }
    for (final id in ['x' * 16, 'x' * 128, 'Ab09_-Ab09_-Ab09_-']) {
      final s = Escenario();
      expect((await s.ejecutar(solicitudId: id)).confirmado, isTrue);
      expect(s.llamadas.single.datos['solicitudId'], id);
    }
  });

  for (final codigo in [
    'permission-denied',
    'failed-precondition',
    'unauthenticated',
    'invalid-argument',
    'not-found',
    'unimplemented',
  ]) {
    test(
      '$codigo es rechazo de esta llamada, sin fallback ni clave nueva',
      () async {
        final s = Escenario()
          ..error = FirebaseFunctionsException(
            code: codigo,
            message: 'UID_PRIVADO',
            details: {'token': 'TOKEN_PRIVADO'},
          );
        final r = await s.ejecutar();
        expect(r.estado, EstadoDesvinculacion.rechazado);
        expect(r.codigo, codigo);
        expect(r.confirmado, isFalse);
        expect(s.llamadas, hasLength(1));
        expect(s.llamadas.single.datos['solicitudId'], clave);
      },
    );
  }

  for (final codigo in [
    'unavailable',
    'deadline-exceeded',
    'internal',
    'unknown',
    'cancelled',
  ]) {
    test(
      '$codigo deja resultado incierto, no afirma fracaso de desvinculación',
      () async {
        final s = Escenario()
          ..error = FirebaseFunctionsException(
            code: codigo,
            message: 'Error ficticio',
          );
        final r = await s.ejecutar();
        expect(r.estado, EstadoDesvinculacion.incierto);
        expect(r.codigo, codigo);
        expect(r.confirmado, isFalse);
        expect(s.llamadas, hasLength(1));
      },
    );
  }

  for (final codigo in ['aborted', 'resource-exhausted']) {
    test(
      '$codigo se distingue como transitorio, sin reintento automático',
      () async {
        final s = Escenario()
          ..error = FirebaseFunctionsException(
            code: codigo,
            message: 'Error ficticio',
          );
        expect((await s.ejecutar()).estado, EstadoDesvinculacion.transitorio);
        expect(s.llamadas, hasLength(1));
      },
    );
  }

  test('Timeout local no cancela el backend ni publica éxito tardío', () async {
    final s = Escenario(tiempoEspera: const Duration(milliseconds: 5))
      ..pendiente = Completer<Object?>();
    final r = await s.ejecutar();
    expect(r.estado, EstadoDesvinculacion.incierto);
    expect(r.codigo, 'deadline-exceeded');
    s.pendiente!.complete({'ok': true});
    await Future<void>.delayed(Duration.zero);
    expect(r.estado, EstadoDesvinculacion.incierto);
    expect(s.llamadas, hasLength(1));
  });

  test(
    'Timeout y errores de transporte inyectados no son rechazos definitivos',
    () async {
      for (final error in [
        TimeoutException('DATO_PRIVADO'),
        const SocketException('DATO_PRIVADO'),
        StateError('DATO_PRIVADO'),
      ]) {
        final s = Escenario()..error = error;
        expect((await s.ejecutar()).estado, EstadoDesvinculacion.incierto);
      }
    },
  );

  test('Reintento tras resultado incierto conserva todos los parámetros y la clave', () async {
    final s = Escenario()..error = TimeoutException('Timeout ficticio');
    expect((await s.ejecutar()).estado, EstadoDesvinculacion.incierto);
    s.error = null;
    expect((await s.ejecutar()).confirmado, isTrue);
    expect(s.llamadas, hasLength(2));
    expect(s.llamadas[0].nombre, s.llamadas[1].nombre);
    expect(s.llamadas[0].datos, s.llamadas[1].datos);
  });

  test('Recrear servicio no genera claves: el llamador debe volver a aportar la conservada', () async {
    final anterior = Escenario()..error = TimeoutException('Timeout ficticio');
    await anterior.ejecutar();
    final nuevo = Escenario();
    await nuevo.ejecutar(solicitudId: clave);
    expect(nuevo.llamadas.single.datos, anterior.llamadas.single.datos);
  });

  test('Cambio de sesión o cierre durante la llamada impide usar éxito para otra sesión', () async {
    for (final siguiente in ['otro', null]) {
      final s = Escenario()..pendiente = Completer<Object?>();
      final tarea = s.ejecutar();
      s.uid = siguiente;
      s.pendiente!.complete({'ok': true});
      final r = await tarea;
      expect(r.estado, EstadoDesvinculacion.incierto);
      expect(r.codigo, 'sesion-cambiada');
    }
  });

  test('Solo la respuesta exacta ok=true confirma éxito', () async {
    for (final respuesta in [
      null,
      true,
      'ok',
      {},
      {'ok': false},
      {'ok': 'true'},
      {'ok': 1},
      {'ok': true, 'datos': 'PRIVADOS'},
    ]) {
      final s = Escenario()..respuesta = respuesta;
      final r = await s.ejecutar();
      expect(r.estado, EstadoDesvinculacion.incierto);
      expect(r.codigo, 'respuesta-no-verificable');
    }
  });

  test('Errores desconocidos no exponen mensajes, detalles, identificadores ni logs', () async {
    final logs = <String>[];
    final s = Escenario()
      ..error = FirebaseFunctionsException(
        code: 'UID_PRIVADO',
        message: 'TOKEN_PRIVADO',
        details: {'dato': periodo},
      );
    final r = await runZoned(
      () => s.ejecutar(),
      zoneSpecification: ZoneSpecification(
        print: (self, parent, zone, line) => logs.add(line),
      ),
    );
    expect(r.codigo, 'resultado-no-confirmado');
    expect(logs, isEmpty);
  });

  test('El servicio carece de dependencias de Firestore, FCM o persistencia y no imprime', () {
    final codigo = File('lib/core/services/desvinculacion_service.dart')
        .readAsStringSync();
    for (final dependencia in [
      'cloud_firestore/',
      'firebase_messaging/',
      'notification_service.dart',
      'ingreso_pendiente_service.dart',
      'dart:io',
      'Random',
      'debugPrint(',
      'print(',
    ]) {
      expect(codigo.contains(dependencia), isFalse);
    }
  });

  test(
    'Timeout no positivo se rechaza antes de cualquier dependencia Firebase',
    () {
      expect(
        () => DesvinculacionService(tiempoEspera: Duration.zero),
        throwsArgumentError,
      );
    },
  );
}
