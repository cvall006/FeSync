import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/services/coordinador_desvinculacion.dart';
import 'package:fesync/core/services/desvinculacion_pendiente_service.dart';
import 'package:fesync/core/services/desvinculacion_service.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:flutter_test/flutter_test.dart';

class AlmacenCoordinador implements AlmacenIngresoPendiente {
  final datos = <String, String>{};
  final eventos = <String>[];
  int escrituras = 0;
  int? fallaEn;
  Completer<void>? pausa;
  bool fallaLeer = false;
  @override
  Future<String?> leer(String clave) async {
    eventos.add('leer');
    if (fallaLeer) throw StateError('DATO_PRIVADO');
    return datos[clave];
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    eventos.add('escribir');
    escrituras++;
    if (pausa != null) await pausa!.future;
    if (escrituras == fallaEn) throw StateError('DATO_PRIVADO');
    datos[clave] = valor;
  }
}

void main() {
  var numero = 0;
  late String? uid;
  late AlmacenCoordinador almacen;
  late StreamController<String?> sesiones;
  late DesvinculacionService remoto;
  late DesvinculacionPendienteService persistencia;
  late CoordinadorDesvinculacion coordinador;
  late List<({String nombre, Map<String, Object?> datos})> llamadas;
  Object? errorEnvio;
  Object? errorConsulta;
  String estado = 'NO_VERIFICABLE';
  Completer<Object?>? pausaEnvio;
  Completer<Object?>? pausaConsulta;
  Completer<Object?>? pausaRecuperacion;
  Object? errorRecuperacion;
  String estadoRecuperacion = 'CONFIRMADA';
  Map<String, Object?>? contextoRemoto;
  final periodo = 'a' * 64;
  ContextoDesvinculacion contexto({
    String objetivo = 'objetivo',
    String? actor,
    String? pertenencia,
  }) => ContextoDesvinculacion(
    actorUid: actor ?? uid!,
    uidObjetivo: objetivo,
    iglesiaId: 'iglesia',
    accion: AccionDesvinculacion.expulsar,
    pertenenciaId: pertenencia ?? periodo,
  );
  CoordinadorDesvinculacion crear() {
    final c = CoordinadorDesvinculacion(
      uidActual: () => uid,
      cambiosSesion: sesiones.stream,
      persistencia: persistencia,
      remoto: remoto,
    );
    addTearDown(c.dispose);
    return c;
  }

  setUp(() {
    uid = 'actor-coordinador-${numero++}';
    sesiones = StreamController<String?>.broadcast(sync: true);
    addTearDown(sesiones.close);
    almacen = AlmacenCoordinador();
    llamadas = [];
    errorEnvio = errorConsulta = null;
    pausaEnvio = pausaConsulta = null;
    estado = 'NO_VERIFICABLE';
    estadoRecuperacion = 'CONFIRMADA';
    pausaRecuperacion = null;
    errorRecuperacion = null;
    contextoRemoto = null;
    remoto = DesvinculacionService(
      uidActual: () => uid,
      llamar: (nombre, datos) async {
        almacen.eventos.add('remoto');
        llamadas.add((nombre: nombre, datos: Map.of(datos)));
        if (nombre == 'desvincularMiembroIglesia') {
          if (errorEnvio != null) throw errorEnvio!;
          if (pausaEnvio != null) return await pausaEnvio!.future;
          return {'ok': true};
        }
        if (nombre == 'recuperarContextoSolicitudDesvinculacion') {
          if (errorRecuperacion != null) throw errorRecuperacion!;
          if (pausaRecuperacion != null) return await pausaRecuperacion!.future;
          return {
            'estado': estadoRecuperacion,
            if (estadoRecuperacion == 'CONFIRMADA')
              'contexto':
                  contextoRemoto ??
                  {
                    'solicitudId': datos['solicitudId'],
                    'iglesiaId': 'iglesia',
                    'uidObjetivo': 'objetivo',
                    'accion': 'expulsar',
                    'pertenenciaId': periodo,
                  },
          };
        }
        expect(nombre, 'consultarEstadoSolicitudDesvinculacion');
        if (errorConsulta != null) throw errorConsulta!;
        if (pausaConsulta != null) return await pausaConsulta!.future;
        return {'estado': estado};
      },
    );
    persistencia = DesvinculacionPendienteService(
      almacen: almacen,
      uidActual: () => uid,
      remoto: remoto,
    );
    coordinador = crear();
  });

  test('Reinicio recupera contexto sin reconstrucción manual y confirma mismo registro', () async {
    final c = contexto();
    final s = await persistencia.preparar(
      contexto: c,
      decisionConfirmada: true,
    );
    final claves = almacen.datos.keys.toList();
    await coordinador.dispose();
    persistencia = DesvinculacionPendienteService(
      almacen: almacen,
      uidActual: () => uid,
      remoto: remoto,
    );
    coordinador = crear();
    final r = await coordinador.recuperarContexto(solicitudId: s.solicitudId);
    expect(r.estado, EstadoCoordinacionDesvinculacion.confirmada);
    expect(
      r.recibo,
      EstadoReciboDesvinculacion.confirmadaEstadoActualNoVerificable,
    );
    expect(r.contextoRecuperado!.actorUid, c.actorUid);
    expect(r.contextoRecuperado!.pertenenciaId, c.pertenenciaId);
    expect(llamadas.single.nombre, 'recuperarContextoSolicitudDesvinculacion');
    expect(llamadas.single.datos, {'solicitudId': s.solicitudId});
    expect((await persistencia.recuperar(c))!.solicitudId, s.solicitudId);
    expect(
      (await persistencia.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.confirmada,
    );
    expect(almacen.datos.keys, claves);
    estado = 'CONFIRMADA_NUEVA_PERTENENCIA';
    final actual = await coordinador.reconciliar(
      contexto: r.contextoRecuperado,
    );
    expect(
      actual.recibo,
      EstadoReciboDesvinculacion.confirmadaNuevaPertenencia,
    );
    expect(llamadas.last.nombre, 'consultarEstadoSolicitudDesvinculacion');
    expect(llamadas.last.datos['pertenenciaId'], periodo);
    expect(llamadas.last.datos['solicitudId'], s.solicitudId);
  });

  test('Expulsión indexa y verifica persistencia antes de enviar; recuperación no depende de lista', () async {
    final c = contexto();
    errorEnvio = TimeoutException('privado');
    final r = await coordinador.iniciarExpulsion(
      contexto: c,
      decisionConfirmada: true,
    );
    expect(r.estado, EstadoCoordinacionDesvinculacion.incierta);
    final antes = almacen.eventos.sublist(0, almacen.eventos.indexOf('remoto'));
    expect(antes.where((e) => e == 'escribir').length, 3);
    final solicitudes = await persistencia.recuperarExpulsionesActor(uid!);
    expect(solicitudes, hasLength(1));
    await coordinador.dispose();
    coordinador = crear();
    final recuperacion = await coordinador.recuperarContexto(
      solicitudId: solicitudes.single.solicitudId,
    );
    expect(recuperacion.estado, EstadoCoordinacionDesvinculacion.confirmada);
    expect(recuperacion.contextoRecuperado!.uidObjetivo, c.uidObjetivo);
    expect(llamadas.last.datos.keys, ['solicitudId']);
  });

  test(
    'Fallo del índice impide expulsión remota y no genera otra intención',
    () async {
      almacen.fallaEn = 1;
      final r = await coordinador.iniciarExpulsion(
        contexto: contexto(),
        decisionConfirmada: true,
      );
      expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
      expect(llamadas, isEmpty);
      final otro = await coordinador.iniciarExpulsion(
        contexto: contexto(),
        decisionConfirmada: true,
      );
      expect(
        otro.estado,
        EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
      );
      expect(llamadas, isEmpty);
    },
  );

  for (final campo in [
    'uidObjetivo',
    'iglesiaId',
    'accion',
    'pertenenciaId',
    'solicitudId',
    'actorUid',
  ]) {
    test(
      'Contexto recuperado incompatible por $campo bloquea sin sobrescribir',
      () async {
        final c = contexto(objetivo: uid!);
        final s = await persistencia.preparar(
          contexto: c,
          decisionConfirmada: true,
        );
        contextoRemoto = {
          'solicitudId': s.solicitudId,
          'iglesiaId': c.iglesiaId,
          'uidObjetivo': c.uidObjetivo,
          'accion': c.accion.name,
          'pertenenciaId': periodo,
        };
        contextoRemoto![campo] = switch (campo) {
          'accion' => 'salir',
          'pertenenciaId' => 'b' * 64,
          'solicitudId' => 'c' * 64,
          _ => 'otro',
        };
        final antes = Map.of(almacen.datos);
        final r = await coordinador.recuperarContexto(
          solicitudId: s.solicitudId,
        );
        expect(r.estado, isNot(EstadoCoordinacionDesvinculacion.confirmada));
        expect(r.contextoRecuperado, isNull);
        expect(almacen.datos, antes);
      },
    );
  }

  for (final estadoRemoto in ['RECIBO_AUSENTE', 'NO_VERIFICABLE']) {
    test(
      '$estadoRemoto conserva la intención sin generar ni borrar claves',
      () async {
        final c = contexto();
        final s = await persistencia.preparar(
          contexto: c,
          decisionConfirmada: true,
        );
        final antes = Map.of(almacen.datos);
        estadoRecuperacion = estadoRemoto;
        final r = await coordinador.recuperarContexto(
          solicitudId: s.solicitudId,
        );
        expect(
          r.estado,
          estadoRemoto == 'RECIBO_AUSENTE'
              ? EstadoCoordinacionDesvinculacion.bloqueadaRecuperable
              : EstadoCoordinacionDesvinculacion.noVerificable,
        );
        expect(r.contextoRecuperado, isNull);
        expect(almacen.datos, antes);
        expect(llamadas.single.datos, {'solicitudId': s.solicitudId});
      },
    );
  }

  test('Red fallida de recuperación es incierta, nunca ausencia', () async {
    final c = contexto();
    final s = await persistencia.preparar(
      contexto: c,
      decisionConfirmada: true,
    );
    final antes = Map.of(almacen.datos);
    errorRecuperacion = FirebaseFunctionsException(
      code: 'unavailable',
      message: 'SECRETO',
    );
    final r = await coordinador.recuperarContexto(solicitudId: s.solicitudId);
    expect(r.estado, EstadoCoordinacionDesvinculacion.incierta);
    expect(r.codigo, 'unavailable');
    expect(almacen.datos, antes);
  });

  test(
    'Lectura local fallida o corrupta bloquea aun con recibo confirmado',
    () async {
      for (final corrupcion in [false, true]) {
        final c = contexto(objetivo: 'objetivo-$corrupcion');
        final s = await persistencia.preparar(
          contexto: c,
          decisionConfirmada: true,
        );
        contextoRemoto = {
          'solicitudId': s.solicitudId,
          'iglesiaId': c.iglesiaId,
          'uidObjetivo': c.uidObjetivo,
          'accion': c.accion.name,
          'pertenenciaId': periodo,
        };
        if (corrupcion) almacen.datos[almacen.datos.keys.last] = '{corrupto';
        almacen.fallaLeer = !corrupcion;
        final antes = Map.of(almacen.datos);
        final r = await coordinador.recuperarContexto(
          solicitudId: s.solicitudId,
        );
        expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
        expect(r.contextoRecuperado, isNull);
        expect(almacen.datos, antes);
        almacen.fallaLeer = false;
      }
    },
  );

  test('Confirmación remota y fallo local se recuperan con misma solicitud tras reinicio', () async {
    final c = contexto();
    final s = await persistencia.preparar(
      contexto: c,
      decisionConfirmada: true,
    );
    almacen.fallaEn = almacen.escrituras + 1;
    final r = await coordinador.recuperarContexto(solicitudId: s.solicitudId);
    expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
    expect(r.contextoRecuperado, isNull);
    await coordinador.dispose();
    persistencia = DesvinculacionPendienteService(
      almacen: almacen,
      uidActual: () => uid,
      remoto: remoto,
    );
    coordinador = crear();
    expect(
      (await coordinador.recuperarContexto(solicitudId: s.solicitudId)).estado,
      EstadoCoordinacionDesvinculacion.confirmada,
    );
    expect(llamadas.map((l) => l.datos['solicitudId']).toSet(), {
      s.solicitudId,
    });
    expect((await persistencia.recuperar(c))!.solicitudId, s.solicitudId);
  });

  for (final regresar in [false, true]) {
    test(
      'Sesión cambia durante recuperación, A-B-A=$regresar, no aplica respuesta tardía',
      () async {
        final c = contexto();
        final s = await persistencia.preparar(
          contexto: c,
          decisionConfirmada: true,
        );
        final antes = Map.of(almacen.datos);
        pausaRecuperacion = Completer<Object?>();
        final tarea = coordinador.recuperarContexto(solicitudId: s.solicitudId);
        while (llamadas.isEmpty) {
          await Future<void>.delayed(Duration.zero);
        }
        uid = 'otro';
        sesiones.add(uid);
        if (regresar) {
          uid = c.actorUid;
          sesiones.add(uid);
        }
        pausaRecuperacion!.complete({
          'estado': 'CONFIRMADA',
          'contexto': {
            'solicitudId': s.solicitudId,
            'iglesiaId': c.iglesiaId,
            'uidObjetivo': c.uidObjetivo,
            'accion': c.accion.name,
            'pertenenciaId': periodo,
          },
        });
        final r = await tarea;
        expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
        expect(r.contextoRecuperado, isNull);
        expect(almacen.datos, antes);
      },
    );
  }

  test(
    'Otro actor no recupera ni reemplaza la intención persistida del original',
    () async {
      final c = contexto();
      final s = await persistencia.preparar(
        contexto: c,
        decisionConfirmada: true,
      );
      final antes = Map.of(almacen.datos);
      uid = 'otro';
      sesiones.add(uid);
      final r = await coordinador.recuperarContexto(solicitudId: s.solicitudId);
      expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
      expect(almacen.datos, antes);
    },
  );

  test(
    'Recuperación concurrente de misma clave se bloquea entre instancias',
    () async {
      final c = contexto();
      final s = await persistencia.preparar(
        contexto: c,
        decisionConfirmada: true,
      );
      pausaRecuperacion = Completer<Object?>();
      final tarea = coordinador.recuperarContexto(solicitudId: s.solicitudId);
      while (llamadas.isEmpty) {
        await Future<void>.delayed(Duration.zero);
      }
      expect(
        (await crear().recuperarContexto(solicitudId: s.solicitudId)).codigo,
        'operacion-en-curso',
      );
      expect(llamadas.length, 1);
      pausaRecuperacion!.complete({
        'estado': 'CONFIRMADA',
        'contexto': {
          'solicitudId': s.solicitudId,
          'iglesiaId': c.iglesiaId,
          'uidObjetivo': c.uidObjetivo,
          'accion': c.accion.name,
          'pertenenciaId': periodo,
        },
      });
      expect((await tarea).estado, EstadoCoordinacionDesvinculacion.confirmada);
    },
  );

  test('Primera operación exige decisión y persistencia verificada antes del envío', () async {
    final c = contexto();
    expect(
      (await coordinador.iniciar(
        contexto: c,
        decisionConfirmada: false,
      )).estado,
      EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
    );
    expect(almacen.datos, isEmpty);
    final r = await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    expect(r.estado, EstadoCoordinacionDesvinculacion.confirmada);
    final indice = almacen.eventos.indexOf('remoto');
    expect(almacen.eventos.sublist(0, indice), [
      'leer',
      'escribir',
      'leer',
      'leer',
      'escribir',
      'leer',
    ]);
    expect(
      (jsonDecode(almacen.datos.values.single) as Map)['estado'],
      'confirmada',
    );
  });

  test(
    'Timeout y reintento explícito conservan la solicitud original',
    () async {
      final c = contexto();
      errorEnvio = TimeoutException('timeout');
      expect(
        (await coordinador.iniciar(
          contexto: c,
          decisionConfirmada: true,
        )).estado,
        EstadoCoordinacionDesvinculacion.incierta,
      );
      final nonce = llamadas.single.datos['solicitudId'];
      expect(
        (await coordinador.iniciar(
          contexto: c,
          decisionConfirmada: true,
        )).estado,
        EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
      );
      expect(llamadas.length, 1);
      errorEnvio = null;
      expect(
        (await coordinador.reintentar(contexto: c)).estado,
        EstadoCoordinacionDesvinculacion.confirmada,
      );
      expect(llamadas.last.datos['solicitudId'], nonce);
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
      'Timeout seguido de consulta ${entrada.key} conserva su significado',
      () async {
        final c = contexto();
        errorEnvio = TimeoutException('timeout');
        await coordinador.iniciar(contexto: c, decisionConfirmada: true);
        final antes = Map.of(almacen.datos);
        estado = entrada.key;
        final r = await coordinador.reconciliar(contexto: c);
        expect(r.recibo, entrada.value);
        expect(llamadas.last.datos, llamadas.first.datos);
        expect(llamadas.last.datos.keys, hasLength(5));
        if (entrada.value == EstadoReciboDesvinculacion.noVerificable) {
          expect(r.estado, EstadoCoordinacionDesvinculacion.noVerificable);
          expect(almacen.datos, antes);
        } else {
          expect(r.estado, EstadoCoordinacionDesvinculacion.confirmada);
          expect(
            (await persistencia.recuperar(c))!.estado,
            EstadoDesvinculacionPendiente.confirmada,
          );
        }
      },
    );
  }

  test('Error de lectura remoto no se transforma en NO_VERIFICABLE', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    errorConsulta = FirebaseFunctionsException(
      code: 'unavailable',
      message: 'SECRETO',
    );
    final r = await coordinador.reconciliar(contexto: c);
    expect(r.estado, EstadoCoordinacionDesvinculacion.incierta);
    expect(r.recibo, isNull);
    expect(
      (await persistencia.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.incierta,
    );
  });

  test('Rechazo y error transitorio de envío se distinguen', () async {
    for (final entrada in {
      'permission-denied': EstadoCoordinacionDesvinculacion.rechazada,
      'aborted': EstadoCoordinacionDesvinculacion.transitoria,
    }.entries) {
      errorEnvio = FirebaseFunctionsException(
        code: entrada.key,
        message: 'SECRETO',
      );
      final r = await coordinador.iniciar(
        contexto: contexto(objetivo: entrada.key),
        decisionConfirmada: true,
      );
      expect(r.estado, entrada.value);
    }
  });

  test('Confirmación remota y fallo de almacenamiento se recuperan consultando misma clave', () async {
    final c = contexto();
    almacen.fallaEn = 3;
    final r = await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
    estado = 'CONFIRMADA_PERTENENCIA_TERMINADA';
    expect(
      (await coordinador.reconciliar(contexto: c)).estado,
      EstadoCoordinacionDesvinculacion.confirmada,
    );
    expect(
      llamadas.first.datos['solicitudId'],
      llamadas.last.datos['solicitudId'],
    );
    expect(
      (await persistencia.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.confirmada,
    );
  });

  test('Fallo al guardar la confirmación consultada no publica un cierre local exitoso', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    almacen.fallaEn = almacen.escrituras + 1;
    estado = 'CONFIRMADA_NUEVA_PERTENENCIA';
    expect(
      (await coordinador.reconciliar(contexto: c)).estado,
      EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
    );
    expect(
      (await persistencia.recuperar(c, recuperarTrasError: true))!.estado,
      EstadoDesvinculacionPendiente.incierta,
    );
  });

  test('Reinicio con contexto original recupera y consulta sin reenviar desvinculación', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    await coordinador.dispose();
    coordinador = crear();
    estado = 'CONFIRMADA_NUEVA_PERTENENCIA';
    final r = await coordinador.reconciliar(contexto: c);
    expect(r.recibo, EstadoReciboDesvinculacion.confirmadaNuevaPertenencia);
    expect(llamadas.map((c) => c.nombre), [
      'desvincularMiembroIglesia',
      'consultarEstadoSolicitudDesvinculacion',
    ]);
  });

  test(
    'Sin contexto o sin registro no consulta, no envía y no crea claves',
    () async {
      expect(
        (await coordinador.reconciliar(contexto: null)).estado,
        EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
      );
      await coordinador.iniciar(contexto: null, decisionConfirmada: true);
      await coordinador.reintentar(contexto: contexto());
      await coordinador.reconciliar(contexto: contexto());
      expect(llamadas, isEmpty);
      expect(almacen.escrituras, 0);
    },
  );

  test('Cambio de objetivo no usa su solicitud y cambio de período bloquea la reutilización', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    final n = llamadas.length;
    await coordinador.reconciliar(contexto: contexto(objetivo: 'otro'));
    await coordinador.reintentar(contexto: contexto(pertenencia: 'b' * 64));
    expect(llamadas.length, n);
  });

  test(
    'Sesión anterior no recibe aplicación de la respuesta de consulta',
    () async {
      final c = contexto();
      errorEnvio = TimeoutException('timeout');
      await coordinador.iniciar(contexto: c, decisionConfirmada: true);
      pausaConsulta = Completer<Object?>();
      final tarea = coordinador.reconciliar(contexto: c);
      while (llamadas.length < 2) {
        await Future<void>.delayed(Duration.zero);
      }
      uid = 'otro';
      sesiones.add(uid);
      pausaConsulta!.complete({'estado': 'CONFIRMADA_NUEVA_PERTENENCIA'});
      final r = await tarea;
      expect(r.estado, EstadoCoordinacionDesvinculacion.bloqueadaRecuperable);
      expect(r.recibo, isNull);
      uid = c.actorUid;
      sesiones.add(uid);
      expect(
        (await persistencia.recuperar(c))!.estado,
        EstadoDesvinculacionPendiente.incierta,
      );
    },
  );

  test('Reinicio sin contexto original conserva pendiente y no busca parámetros en perfiles', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    await coordinador.dispose();
    coordinador = crear();
    final antes = Map.of(almacen.datos);
    final r = await coordinador.reconciliar(contexto: null);
    expect(r.codigo, 'contexto-original-requerido');
    expect(almacen.datos, antes);
    expect(llamadas.length, 1);
  });

  test(
    'Identidad distinta del actor original se bloquea antes de persistir',
    () async {
      final r = await coordinador.iniciar(
        contexto: contexto(actor: 'otro-actor'),
        decisionConfirmada: true,
      );
      expect(r.codigo, 'sesion-no-vigente');
      expect(almacen.datos, isEmpty);
      expect(llamadas, isEmpty);
    },
  );

  test('A-B-A durante consulta no aplica confirmación aunque el UID final coincida', () async {
    final c = contexto();
    errorEnvio = TimeoutException('timeout');
    await coordinador.iniciar(contexto: c, decisionConfirmada: true);
    pausaConsulta = Completer<Object?>();
    final tarea = coordinador.reconciliar(contexto: c);
    while (llamadas.length < 2) {
      await Future<void>.delayed(Duration.zero);
    }
    uid = 'otro';
    sesiones.add(uid);
    uid = c.actorUid;
    sesiones.add(uid);
    pausaConsulta!.complete({'estado': 'CONFIRMADA_PERTENENCIA_TERMINADA'});
    final r = await tarea;
    expect(r.codigo, 'sesion-cambiada');
    expect(r.recibo, isNull);
    expect(
      (await persistencia.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.incierta,
    );
  });

  test('Cambio A-B-A durante persistencia impide envío y también resultado obsoleto', () async {
    final c = contexto();
    await persistencia.preparar(contexto: c, decisionConfirmada: true);
    almacen.pausa = Completer<void>();
    final tarea = coordinador.reintentar(contexto: c);
    while (almacen.escrituras < 2) {
      await Future<void>.delayed(Duration.zero);
    }
    uid = 'otro';
    sesiones.add(uid);
    uid = c.actorUid;
    sesiones.add(uid);
    almacen.pausa!.complete();
    expect(
      (await tarea).estado,
      EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
    );
    expect(llamadas, isEmpty);
  });

  test(
    'Doble operación concurrente se bloquea, pero permite otros objetivos',
    () async {
      final c = contexto();
      pausaEnvio = Completer<Object?>();
      final tarea = coordinador.iniciar(contexto: c, decisionConfirmada: true);
      while (llamadas.isEmpty) {
        await Future<void>.delayed(Duration.zero);
      }
      expect(
        (await crear().iniciar(contexto: c, decisionConfirmada: true)).codigo,
        'operacion-en-curso',
      );
      final otra = coordinador.iniciar(
        contexto: contexto(objetivo: 'otro'),
        decisionConfirmada: true,
      );
      while (llamadas.length < 2) {
        await Future<void>.delayed(Duration.zero);
      }
      expect(
        llamadas[0].datos['solicitudId'],
        isNot(llamadas[1].datos['solicitudId']),
      );
      pausaEnvio!.complete({'ok': true});
      expect((await tarea).estado, EstadoCoordinacionDesvinculacion.confirmada);
      expect((await otra).estado, EstadoCoordinacionDesvinculacion.confirmada);
    },
  );
}
