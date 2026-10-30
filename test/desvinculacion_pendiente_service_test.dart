import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/core/services/desvinculacion_pendiente_service.dart';
import 'package:fesync/core/services/desvinculacion_service.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:flutter_test/flutter_test.dart';

class AlmacenPrueba implements AlmacenIngresoPendiente {
  final datos = <String, String>{};
  final eventos = <String>[];
  bool fallaLeer = false;
  bool fallaEscribir = false;
  bool pierdeEscritura = false;
  bool escribeYFalla = false;
  int? fallaEscrituraNumero;
  int? escribeYFallaNumero;
  int escrituras = 0;
  Completer<void>? pausa;

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
    if (fallaEscribir || escrituras == fallaEscrituraNumero) {
      throw StateError('DATO_PRIVADO');
    }
    if (!pierdeEscritura) datos[clave] = valor;
    if (escribeYFalla || escrituras == escribeYFallaNumero) {
      throw StateError('DATO_PRIVADO');
    }
  }
}

void main() {
  var numero = 0;
  late String? uid;
  late AlmacenPrueba almacen;
  late DesvinculacionPendienteService servicio;
  late DesvinculacionService remoto;
  late List<Map<String, Object?>> llamadas;
  Object? error;
  Completer<Object?>? pausaRemota;
  final periodo = 'a' * 64;

  ContextoDesvinculacion contexto({
    String? actor,
    String objetivo = 'objetivo',
    String iglesia = 'iglesia',
    AccionDesvinculacion accion = AccionDesvinculacion.expulsar,
    String? pertenencia,
  }) => ContextoDesvinculacion(
    actorUid: actor ?? uid!,
    uidObjetivo: objetivo,
    iglesiaId: iglesia,
    accion: accion,
    pertenenciaId: pertenencia ?? periodo,
  );
  DesvinculacionPendienteService recrear() => DesvinculacionPendienteService(
    almacen: almacen,
    uidActual: () => uid,
    remoto: remoto,
  );
  Future<SolicitudDesvinculacionPendiente> preparar(
    ContextoDesvinculacion c, {
    bool decision = true,
  }) => servicio.preparar(contexto: c, decisionConfirmada: decision);

  ContextoRecuperadoDesvinculacion recuperado(
    ContextoDesvinculacion c,
    String id,
  ) => ContextoRecuperadoDesvinculacion(
    actorUid: c.actorUid,
    solicitudId: id,
    iglesiaId: c.iglesiaId,
    uidObjetivo: c.uidObjetivo,
    accion: c.accion,
    pertenenciaId: c.pertenenciaId,
  );

  setUp(() {
    uid = 'actor-prueba-${numero++}';
    almacen = AlmacenPrueba();
    llamadas = [];
    error = null;
    pausaRemota = null;
    remoto = DesvinculacionService(
      uidActual: () => uid,
      llamar: (nombre, datos) async {
        expect(nombre, 'desvincularMiembroIglesia');
        almacen.eventos.add('remoto');
        llamadas.add(Map.of(datos));
        if (error != null) throw error!;
        return pausaRemota?.future ?? {'ok': true};
      },
    );
    servicio = recrear();
  });

  test(
    'Solo una decisión explícita crea 256 bits y confirma persistencia',
    () async {
      final c = contexto();
      await expectLater(
        preparar(c, decision: false),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.escrituras, 0);
      final s = await preparar(c);
      expect(s.solicitudId, matches(RegExp(r'^[a-f0-9]{64}$')));
      expect(s.estado, EstadoDesvinculacionPendiente.pendiente);
      expect(almacen.eventos.sublist(1), ['leer', 'escribir', 'leer']);
      expect(llamadas, isEmpty);
    },
  );

  test('Contexto recuperado confirma huella y nonce tras recrear sin guardar payload', () async {
    final c = contexto();
    final s = await preparar(c);
    final claves = almacen.datos.keys.toList();
    final antes = jsonDecode(almacen.datos.values.single) as Map;
    await recrear().confirmarContextoRecuperado(
      recuperado: recuperado(c, s.solicitudId),
      sesionVigente: () => true,
    );
    final despues = jsonDecode(almacen.datos.values.single) as Map;
    expect(despues['huella'], antes['huella']);
    expect(despues['solicitudId'], s.solicitudId);
    expect(despues['estado'], 'confirmada');
    expect(despues.keys.toSet(), antes.keys.toSet());
    expect(almacen.datos.keys, claves);
    expect(llamadas, isEmpty);
  });

  test(
    'Discrepancias completas de contexto o nonce no sobrescriben intención',
    () async {
      final c = contexto();
      final s = await preparar(c);
      final antes = Map.of(almacen.datos);
      for (final otro in [
        contexto(actor: 'ajeno'),
        contexto(objetivo: 'otro'),
        contexto(iglesia: 'otra'),
        contexto(accion: AccionDesvinculacion.salir, objetivo: uid!),
        contexto(pertenencia: 'b' * 64),
      ]) {
        await expectLater(
          servicio.confirmarContextoRecuperado(
            recuperado: recuperado(otro, s.solicitudId),
            sesionVigente: () => true,
          ),
          throwsA(isA<ErrorDesvinculacionPendiente>()),
        );
      }
      await expectLater(
        servicio.confirmarContextoRecuperado(
          recuperado: recuperado(c, 'b' * 64),
          sesionVigente: () => true,
        ),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos, antes);
    },
  );

  test('Recuperación remota sin registro local o con corrupción no lo crea ni reemplaza', () async {
    final c = contexto();
    await expectLater(
      servicio.confirmarContextoRecuperado(
        recuperado: recuperado(c, 'b' * 64),
        sesionVigente: () => true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.escrituras, 0);
    final s = await preparar(c);
    final key = almacen.datos.keys.single;
    almacen.datos[key] = '{corrupto';
    final escrituras = almacen.escrituras;
    await expectLater(
      recrear().confirmarContextoRecuperado(
        recuperado: recuperado(c, s.solicitudId),
        sesionVigente: () => true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos[key], '{corrupto');
    expect(almacen.escrituras, escrituras);
  });

  test('Fallo al guardar contexto confirmado conserva misma solicitud para recuperación', () async {
    final c = contexto();
    final s = await preparar(c);
    almacen.fallaEscribir = true;
    await expectLater(
      servicio.confirmarContextoRecuperado(
        recuperado: recuperado(c, s.solicitudId),
        sesionVigente: () => true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    almacen.fallaEscribir = false;
    await recrear().confirmarContextoRecuperado(
      recuperado: recuperado(c, s.solicitudId),
      sesionVigente: () => true,
    );
    expect((await servicio.recuperar(c))!.solicitudId, s.solicitudId);
    expect(
      (await servicio.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.confirmada,
    );
    expect(llamadas, isEmpty);
  });

  test('Prepara, guarda incierta y verifica lectura ANTES de enviar', () async {
    final c = contexto();
    final s = await preparar(c);
    final r = await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    expect(almacen.eventos, [
      'leer',
      'escribir',
      'leer',
      'leer',
      'escribir',
      'leer',
      'remoto',
      'escribir',
      'leer',
    ]);
    expect(r.solicitud.estado, EstadoDesvinculacionPendiente.confirmada);
    expect(r.resultado.confirmado, true);
    expect(llamadas.single['solicitudId'], s.solicitudId);
    expect(llamadas.single.keys, hasLength(5));
  });

  test(
    'Límite del índice conserva pendientes y solo poda referencias confirmadas',
    () async {
      SolicitudDesvinculacionPendiente? primera;
      for (
        var i = 0;
        i < DesvinculacionPendienteService.maximoExpulsiones;
        i++
      ) {
        final s = await servicio.prepararExpulsionRecuperable(
          contexto: contexto(objetivo: 'limite-$i'),
          decisionConfirmada: true,
        );
        primera ??= s;
      }
      final antes = Map.of(almacen.datos);
      final nueva = contexto(objetivo: 'fuera-limite');
      await expectLater(
        servicio.prepararExpulsionRecuperable(
          contexto: nueva,
          decisionConfirmada: true,
        ),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos, antes);
      await servicio.enviar(
        contexto: contexto(objetivo: 'limite-0'),
        solicitudId: primera!.solicitudId,
      );
      await servicio.prepararExpulsionRecuperable(
        contexto: nueva,
        decisionConfirmada: true,
      );
      final recuperadas = await recrear().recuperarExpulsionesActor(uid!);
      expect(
        recuperadas,
        hasLength(DesvinculacionPendienteService.maximoExpulsiones),
      );
      expect(
        recuperadas.any((s) => s.solicitudId == primera!.solicitudId),
        false,
      );
      expect(
        recuperadas.every(
          (s) => s.estado == EstadoDesvinculacionPendiente.pendiente,
        ),
        true,
      );
      expect(llamadas, hasLength(1));
    },
  );

  test('Índice de expulsiones recupera solicitudes sin conocer objetivos tras reinicio', () async {
    final a = await servicio.prepararExpulsionRecuperable(
      contexto: contexto(),
      decisionConfirmada: true,
    );
    final b = await recrear().prepararExpulsionRecuperable(
      contexto: contexto(objetivo: 'segundo'),
      decisionConfirmada: true,
    );
    final lista = await recrear().recuperarExpulsionesActor(uid!);
    expect(lista.map((s) => s.solicitudId).toSet(), {
      a.solicitudId,
      b.solicitudId,
    });
    expect(almacen.datos.length, 3);
    expect(llamadas, isEmpty);
    final indice = almacen.datos.entries.singleWhere(
      (e) => e.key.startsWith('fesync.expulsiones.'),
    );
    for (final dato in [uid!, 'objetivo', 'segundo', 'iglesia', periodo]) {
      expect(indice.value.contains(dato), false);
    }
  });

  test(
    'Índice está separado por actor y no enumera una salida propia',
    () async {
      final actor = uid!;
      await servicio.prepararExpulsionRecuperable(
        contexto: contexto(),
        decisionConfirmada: true,
      );
      await preparar(
        contexto(objetivo: actor, accion: AccionDesvinculacion.salir),
      );
      expect(await servicio.recuperarExpulsionesActor(actor), hasLength(1));
      uid = 'otro-actor';
      expect(await servicio.recuperarExpulsionesActor(uid!), isEmpty);
      await expectLater(
        servicio.recuperarExpulsionesActor(actor),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
    },
  );

  test('Concurrencia indexada conserva claves y no pierde objetivos', () async {
    final c = contexto();
    final solicitudes = await Future.wait(
      List.generate(
        4,
        (_) => recrear().prepararExpulsionRecuperable(
          contexto: c,
          decisionConfirmada: true,
        ),
      ),
    );
    expect(solicitudes.map((s) => s.solicitudId).toSet().length, 1);
    await Future.wait(
      List.generate(
        3,
        (i) => recrear().prepararExpulsionRecuperable(
          contexto: contexto(objetivo: 'independiente-$i'),
          decisionConfirmada: true,
        ),
      ),
    );
    expect(await recrear().recuperarExpulsionesActor(uid!), hasLength(4));
  });

  for (final fallo in [1, 2]) {
    test(
      'Fallo indexado en escritura $fallo conserva reserva sin reemplazo ni envío',
      () async {
        almacen.fallaEscrituraNumero = fallo;
        await expectLater(
          servicio.prepararExpulsionRecuperable(
            contexto: contexto(),
            decisionConfirmada: true,
          ),
          throwsA(isA<ErrorDesvinculacionPendiente>()),
        );
        final antes = Map.of(almacen.datos);
        await expectLater(
          recrear().prepararExpulsionRecuperable(
            contexto: contexto(),
            decisionConfirmada: true,
          ),
          throwsA(isA<ErrorDesvinculacionPendiente>()),
        );
        expect(almacen.datos, antes);
        expect(llamadas, isEmpty);
      },
    );
  }

  test('Índice o registro corruptos y reserva sin registro se bloquean sin reparación', () async {
    await servicio.prepararExpulsionRecuperable(
      contexto: contexto(),
      decisionConfirmada: true,
    );
    final indice = almacen.datos.keys.singleWhere(
      (e) => e.startsWith('fesync.expulsiones.'),
    );
    final registro = almacen.datos.keys.singleWhere(
      (e) => e.startsWith('fesync.desvinculacion.'),
    );
    final texto = almacen.datos[indice]!;
    almacen.datos[indice] = '{corrupto';
    await expectLater(
      recrear().recuperarExpulsionesActor(uid!),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos[indice], '{corrupto');
    almacen.datos[indice] = texto;
    almacen.datos[registro] = '{corrupto';
    await expectLater(
      recrear().recuperarExpulsionesActor(uid!),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    almacen.datos.remove(registro);
    await expectLater(
      recrear().recuperarExpulsionesActor(uid!),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos[indice], texto);
  });

  test('Índice rechaza versiones, actor, duplicados y referencias malformadas', () async {
    await servicio.prepararExpulsionRecuperable(
      contexto: contexto(),
      decisionConfirmada: true,
    );
    final clave = almacen.datos.keys.singleWhere(
      (e) => e.startsWith('fesync.expulsiones.'),
    );
    final original = jsonDecode(almacen.datos[clave]!) as Map<String, dynamic>;
    for (final cambio in <Map<String, dynamic>>[
      {'version': 2},
      {'actorHash': 'a' * 64},
      {
        'registros': ['ruta-invalida'],
      },
      {'extra': true},
      {
        'registros': [original['registros'][0], original['registros'][0]],
      },
      {
        'registros': List.generate(
          65,
          (i) =>
              'fesync.desvinculacion.v1.${i.toRadixString(16).padLeft(64, '0')}',
        ),
      },
    ]) {
      almacen.datos[clave] = jsonEncode({...original, ...cambio});
      await expectLater(
        recrear().recuperarExpulsionesActor(uid!),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
    }
    expect(llamadas, isEmpty);
  });

  test('Nuevo período indexado no reemplaza incierta ni bloqueada', () async {
    final c = contexto();
    final s = await servicio.prepararExpulsionRecuperable(
      contexto: c,
      decisionConfirmada: true,
    );
    error = TimeoutException('privado');
    await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    await expectLater(
      servicio.prepararExpulsionRecuperable(
        contexto: contexto(pertenencia: 'b' * 64),
        decisionConfirmada: true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(
      (await servicio.recuperarExpulsionesActor(uid!)).single.solicitudId,
      s.solicitudId,
    );
  });

  test(
    'Índice exige decisión, acción de expulsión y objetivo distinto del actor',
    () async {
      for (final c in [
        contexto(accion: AccionDesvinculacion.salir, objetivo: uid!),
        contexto(objetivo: uid!),
      ]) {
        await expectLater(
          servicio.prepararExpulsionRecuperable(
            contexto: c,
            decisionConfirmada: true,
          ),
          throwsA(isA<ErrorDesvinculacionPendiente>()),
        );
      }
      await expectLater(
        servicio.prepararExpulsionRecuperable(
          contexto: contexto(),
          decisionConfirmada: false,
        ),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos, isEmpty);
    },
  );

  test(
    'Descubre salida propia tras reinicio sin reconstruir iglesia ni período',
    () async {
      final c = contexto(objetivo: uid!, accion: AccionDesvinculacion.salir);
      final s = await preparar(c);
      final escrituras = almacen.escrituras;
      final recuperada = await recrear().recuperarSalidaPropia(uid!);
      expect(recuperada!.solicitudId, s.solicitudId);
      expect(recuperada.huella, s.huella);
      expect(almacen.escrituras, escrituras);
      expect(llamadas, isEmpty);
    },
  );

  test(
    'Descubrimiento propio no enumera expulsiones ni registros de otro actor',
    () async {
      final actor = uid!;
      await preparar(contexto()); // Otro objetivo, no la salida propia.
      expect(await servicio.recuperarSalidaPropia(actor), isNull);
      final c = contexto(objetivo: actor, accion: AccionDesvinculacion.salir);
      await preparar(c);
      uid = 'otro-actor';
      await expectLater(
        servicio.recuperarSalidaPropia(actor),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(await servicio.recuperarSalidaPropia(uid!), isNull);
      expect(almacen.datos.length, 2);
      expect(llamadas, isEmpty);
    },
  );

  test(
    'Registro propio corrupto bloquea descubrimiento sin reemplazarlo',
    () async {
      final c = contexto(objetivo: uid!, accion: AccionDesvinculacion.salir);
      await preparar(c);
      final clave = almacen.datos.keys.single;
      almacen.datos[clave] = '{corrupto';
      final escrituras = almacen.escrituras;
      await expectLater(
        recrear().recuperarSalidaPropia(uid!),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos[clave], '{corrupto');
      expect(almacen.escrituras, escrituras);
    },
  );

  test('Escritura demorada no declara lista la intención', () async {
    almacen.pausa = Completer<void>();
    var lista = false;
    final pendiente = preparar(contexto()).then((s) {
      lista = true;
      return s;
    });
    await Future<void>.delayed(Duration.zero);
    expect(lista, false);
    expect(llamadas, isEmpty);
    almacen.pausa!.complete();
    await pendiente;
    expect(lista, true);
  });

  test(
    'Salida propia conserva su contrato; identidad ajena no se prepara',
    () async {
      final c = contexto(objetivo: uid!, accion: AccionDesvinculacion.salir);
      final s = await preparar(c);
      await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
      expect(llamadas.single['accion'], 'salir');
      await expectLater(
        preparar(contexto(accion: AccionDesvinculacion.salir)),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
    },
  );

  test(
    'Recrear servicio recupera exactamente la intención sin otra clave',
    () async {
      final c = contexto();
      final s = await preparar(c);
      final recuperada = await recrear().recuperar(c);
      expect(recuperada!.solicitudId, s.solicitudId);
      expect(recuperada.estado, EstadoDesvinculacionPendiente.pendiente);
      expect(
        (await recrear().preparar(
          contexto: c,
          decisionConfirmada: false,
        )).solicitudId,
        s.solicitudId,
      );
      expect(almacen.escrituras, 1);
    },
  );

  test(
    'Timeout conserva incierta y reintenta con los mismos cinco parámetros',
    () async {
      final c = contexto();
      final s = await preparar(c);
      error = TimeoutException('DATO_PRIVADO');
      final incierta = await servicio.enviar(
        contexto: c,
        solicitudId: s.solicitudId,
      );
      expect(incierta.solicitud.estado, EstadoDesvinculacionPendiente.incierta);
      expect((await recrear().recuperar(c))!.solicitudId, s.solicitudId);
      error = null;
      await recrear().enviar(contexto: c, solicitudId: s.solicitudId);
      expect(llamadas, hasLength(2));
      expect(llamadas[0], llamadas[1]);
    },
  );

  test(
    'Distintos objetivos avanzan mientras otra expulsión espera red',
    () async {
      final c = contexto();
      final a = await preparar(c);
      pausaRemota = Completer<Object?>();
      final tarea = servicio.enviar(contexto: c, solicitudId: a.solicitudId);
      while (llamadas.isEmpty) {
        await Future<void>.delayed(Duration.zero);
      }
      final b = await preparar(contexto(objetivo: 'otro'));
      expect(b.solicitudId, isNot(a.solicitudId));
      expect(almacen.datos.length, 2);
      pausaRemota!.complete({'ok': true});
      await tarea;
    },
  );

  test(
    'Cambiar UID actor no recupera ni envía una operación de otra cuenta',
    () async {
      final c = contexto();
      final s = await preparar(c);
      uid = 'otro-actor-${numero++}';
      await expectLater(
        servicio.recuperar(c),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      await expectLater(
        servicio.enviar(contexto: c, solicitudId: s.solicitudId),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      final otra = await preparar(contexto());
      expect(otra.solicitudId, isNot(s.solicitudId));
      expect(llamadas, isEmpty);
    },
  );

  test('Cambio de iglesia, acción o período no reemplaza pendientes, inciertas ni bloqueadas', () async {
    final c = contexto(objetivo: uid!);
    final s = await preparar(c);
    final otros = [
      contexto(objetivo: uid!, iglesia: 'otra'),
      contexto(objetivo: uid!, accion: AccionDesvinculacion.salir),
      contexto(objetivo: uid!, pertenencia: 'b' * 64),
    ];
    for (final otro in otros) {
      await expectLater(
        preparar(otro),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      await expectLater(
        servicio.recuperar(otro),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
    }
    expect((await servicio.recuperar(c))!.solicitudId, s.solicitudId);
    error = TimeoutException('timeout');
    await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    await expectLater(
      preparar(otros.first),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos.length, 1);
  });

  test('Rechazo inicial se conserva como bloqueada y no se sustituye por decisión nueva', () async {
    final c = contexto();
    final s = await preparar(c);
    error = FirebaseFunctionsException(
      code: 'permission-denied',
      message: 'PRIVADO',
    );
    final r = await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    expect(r.solicitud.estado, EstadoDesvinculacionPendiente.bloqueada);
    expect((await preparar(c)).solicitudId, s.solicitudId);
    await expectLater(
      preparar(contexto(iglesia: 'otra')),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
  });

  test('failed-precondition después de timeout no elimina la incertidumbre anterior', () async {
    final c = contexto();
    final s = await preparar(c);
    error = TimeoutException('timeout');
    await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    error = FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'PRIVADO',
    );
    final r = await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    expect(r.solicitud.estado, EstadoDesvinculacionPendiente.incierta);
    expect((await preparar(c)).solicitudId, s.solicitudId);
  });

  for (final falla in [
    'lectura',
    'escritura',
    'sin persistir',
    'escribe y falla',
  ]) {
    test('$falla bloquea sin enviar ni reemplazar el registro', () async {
      final c = contexto();
      if (falla == 'lectura') almacen.fallaLeer = true;
      if (falla == 'escritura') almacen.fallaEscribir = true;
      if (falla == 'sin persistir') almacen.pierdeEscritura = true;
      if (falla == 'escribe y falla') almacen.escribeYFalla = true;
      await expectLater(
        preparar(c),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      almacen.fallaLeer = almacen.fallaEscribir = almacen.pierdeEscritura =
          almacen.escribeYFalla = false;
      await expectLater(
        preparar(c),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(llamadas, isEmpty);
    });
  }

  test('Fallo al persistir incierta impide la llamada aunque exista pendiente válida', () async {
    final c = contexto();
    final s = await preparar(c);
    almacen.fallaEscrituraNumero = 2;
    await expectLater(
      servicio.enviar(contexto: c, solicitudId: s.solicitudId),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(llamadas, isEmpty);
  });

  test('Fallo posterior al éxito deja clave recuperable; reconciliación explícita usa la misma', () async {
    final c = contexto();
    final s = await preparar(c);
    almacen.fallaEscrituraNumero = 3;
    await expectLater(
      servicio.enviar(contexto: c, solicitudId: s.solicitudId),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    await expectLater(
      servicio.recuperar(c),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    final recuperada = await recrear().recuperar(c, recuperarTrasError: true);
    expect(recuperada!.solicitudId, s.solicitudId);
    expect(recuperada.estado, EstadoDesvinculacionPendiente.incierta);
    final r = await recrear().enviar(
      contexto: c,
      solicitudId: s.solicitudId,
      recuperarTrasError: true,
    );
    expect(r.solicitud.estado, EstadoDesvinculacionPendiente.confirmada);
    expect(llamadas.map((d) => d['solicitudId']), [
      s.solicitudId,
      s.solicitudId,
    ]);
    expect(
      (await servicio.recuperar(c))!.estado,
      EstadoDesvinculacionPendiente.confirmada,
    );
  });

  test('Registro corrupto no se reemplaza ni se pierde al recrear', () async {
    final c = contexto();
    await preparar(c);
    final key = almacen.datos.keys.single;
    almacen.datos[key] = '{corrupto';
    await expectLater(
      recrear().recuperar(c),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    await expectLater(
      preparar(c),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos[key], '{corrupto');
    expect(llamadas, isEmpty);
  });

  test(
    'Concurrencia de preparación entre instancias no crea dos claves',
    () async {
      final c = contexto();
      final solicitudes = await Future.wait(
        List.generate(
          8,
          (_) => recrear().preparar(contexto: c, decisionConfirmada: true),
        ),
      );
      expect(solicitudes.map((s) => s.solicitudId).toSet().length, 1);
      expect(almacen.escrituras, 1);
    },
  );

  test(
    'Confirmación escrita con error posterior se recupera sin repetir envío',
    () async {
      final c = contexto();
      final s = await preparar(c);
      almacen.escribeYFallaNumero = 3;
      await expectLater(
        servicio.enviar(contexto: c, solicitudId: s.solicitudId),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      final recuperada = await recrear().recuperar(c, recuperarTrasError: true);
      expect(recuperada!.estado, EstadoDesvinculacionPendiente.confirmada);
      final r = await recrear().enviar(
        contexto: c,
        solicitudId: s.solicitudId,
        recuperarTrasError: true,
      );
      expect(r.resultado.codigo, 'confirmacion-local-previa');
      expect(llamadas.length, 1);
      expect((await servicio.recuperar(c))!.solicitudId, s.solicitudId);
    },
  );

  test('Esquema, versión, estado, tipos y claves adicionales inválidos se bloquean', () async {
    final cambios = <void Function(Map<String, dynamic>)>[
      (d) => d['version'] = 2,
      (d) => d['estado'] = 'desconocido',
      (d) => d['extra'] = true,
      (d) => d['huella'] = 'inválida',
      (d) => d['creadaEn'] = 'fecha',
    ];
    for (var i = 0; i < cambios.length; i++) {
      final c = contexto(objetivo: 'objetivo-corrupto-$i');
      final s = await preparar(c);
      final key = almacen.datos.keys.last;
      final d = jsonDecode(almacen.datos[key]!) as Map<String, dynamic>;
      cambios[i](d);
      almacen.datos[key] = jsonEncode(d);
      final original = almacen.datos[key];
      await expectLater(
        recrear().recuperar(c),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      await expectLater(
        servicio.enviar(contexto: c, solicitudId: s.solicitudId),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos[key], original);
    }
    expect(llamadas, isEmpty);
  });

  test('Envíos concurrentes de una operación confirmada no duplican llamada remota', () async {
    final c = contexto();
    final s = await preparar(c);
    final resultados = await Future.wait(
      List.generate(
        5,
        (_) => recrear().enviar(contexto: c, solicitudId: s.solicitudId),
      ),
    );
    expect(resultados.every((r) => r.resultado.confirmado), true);
    expect(llamadas.length, 1);
  });

  test('Nuevo período tras confirmación requiere decisión explícita y recibe clave distinta', () async {
    final c = contexto();
    final s = await preparar(c);
    await servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    final nueva = contexto(pertenencia: 'b' * 64);
    await expectLater(
      preparar(nueva, decision: false),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    final otro = await preparar(nueva);
    expect(otro.solicitudId, isNot(s.solicitudId));
  });

  test('Cambiar sesión durante persistencia impide envío remoto', () async {
    final c = contexto();
    final s = await preparar(c);
    almacen.pausa = Completer<void>();
    final pendiente = servicio.enviar(contexto: c, solicitudId: s.solicitudId);
    final comprobacion = expectLater(
      pendiente,
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    await Future<void>.delayed(Duration.zero);
    uid = null;
    almacen.pausa!.complete();
    await comprobacion;
    expect(llamadas, isEmpty);
  });

  test(
    'Sin preparar, clave incorrecta o contexto inválido no llaman al backend',
    () async {
      final c = contexto();
      await expectLater(
        servicio.enviar(contexto: c, solicitudId: 'a' * 64),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      await preparar(c);
      await expectLater(
        servicio.enviar(contexto: c, solicitudId: 'b' * 64),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      await expectLater(
        preparar(contexto(pertenencia: '')),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(llamadas, isEmpty);
    },
  );

  test('Guardar consulta rechaza NO_VERIFICABLE y nonce ajeno sin modificar estado', () async {
    final c = contexto();
    final s = await preparar(c);
    final antes = Map.of(almacen.datos);
    await expectLater(
      servicio.guardarConfirmacionConsulta(
        contexto: c,
        solicitudId: s.solicitudId,
        estado: EstadoReciboDesvinculacion.noVerificable,
        sesionVigente: () => true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    await expectLater(
      servicio.guardarConfirmacionConsulta(
        contexto: c,
        solicitudId: 'b' * 64,
        estado: EstadoReciboDesvinculacion.confirmadaNuevaPertenencia,
        sesionVigente: () => true,
      ),
      throwsA(isA<ErrorDesvinculacionPendiente>()),
    );
    expect(almacen.datos, antes);
    expect(llamadas, isEmpty);
  });

  test(
    'Guardar confirmación de sesión obsoleta no modifica el registro',
    () async {
      final c = contexto();
      final s = await preparar(c);
      final antes = Map.of(almacen.datos);
      await expectLater(
        servicio.guardarConfirmacionConsulta(
          contexto: c,
          solicitudId: s.solicitudId,
          estado: EstadoReciboDesvinculacion.confirmadaPertenenciaTerminada,
          sesionVigente: () => false,
        ),
        throwsA(isA<ErrorDesvinculacionPendiente>()),
      );
      expect(almacen.datos, antes);
      expect(llamadas, isEmpty);
    },
  );

  test('Registros, claves locales y errores no contienen datos personales ni el payload', () async {
    final c = contexto();
    await preparar(c);
    final datos = jsonDecode(almacen.datos.values.single) as Map;
    expect(datos.keys.toSet(), {
      'version',
      'huella',
      'solicitudId',
      'estado',
      'creadaEn',
      'actualizadaEn',
    });
    final serializado = jsonEncode(almacen.datos);
    for (final privado in [
      uid!,
      c.uidObjetivo,
      c.iglesiaId,
      c.accion.name,
      periodo,
      'nombre',
      'correo',
      'token',
    ]) {
      expect(serializado.contains(privado), false);
      expect(
        const ErrorDesvinculacionPendiente().toString().contains(privado),
        false,
      );
    }
    expect(
      almacen.datos.keys.single.startsWith('fesync.desvinculacion.v1.'),
      true,
    );
  });
}
