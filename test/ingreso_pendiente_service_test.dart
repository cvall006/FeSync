import 'dart:async';
import 'dart:convert';

import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:flutter_test/flutter_test.dart';

class AlmacenMemoria implements AlmacenIngresoPendiente {
  final datos = <String, String>{};
  bool fallaLectura = false;
  bool fallaEscritura = false;
  bool pierdeEscritura = false;
  bool escribeYFalla = false;
  Completer<void>? demora;
  int escrituras = 0;

  @override
  Future<String?> leer(String clave) async {
    if (fallaLectura) throw StateError('lectura');
    return datos[clave];
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    escrituras++;
    if (demora != null) await demora!.future;
    if (fallaEscritura) throw StateError('escritura');
    if (!pierdeEscritura) datos[clave] = valor;
    if (escribeYFalla) throw StateError('resultado incierto');
  }
}

void main() {
  var numero = 0;
  late String uid;
  late AlmacenMemoria almacen;
  late IngresoPendienteService servicio;
  final huella = 'a' * 64;
  final otraHuella = 'b' * 64;

  setUp(() {
    uid = 'usuario-prueba-${numero++}';
    almacen = AlmacenMemoria();
    servicio = IngresoPendienteService(almacen: almacen);
  });

  Future<SolicitudIngresoPendiente> crear({
    String? usuario,
    TipoIngresoPendiente tipo = TipoIngresoPendiente.vinculacion,
    String? parametros,
    bool confirmar = true,
  }) => servicio.crearORecuperar(
    uid: usuario ?? uid,
    tipo: tipo,
    huella: parametros ?? huella,
    nuevaIntencionConfirmada: confirmar,
  );

  test(
    'Genera 256 bits con formato válido y persiste antes de devolver',
    () async {
      final solicitud = await crear();
      expect(solicitud.solicitudId, matches(RegExp(r'^[a-f0-9]{64}$')));
      expect(solicitud.estado, EstadoIngresoPendiente.pendiente);
      expect(almacen.escrituras, 1);
      expect(
        jsonDecode(almacen.datos.values.single)['solicitudId'],
        solicitud.solicitudId,
      );
    },
  );

  test(
    'No declara lista la solicitud mientras la escritura está pendiente',
    () async {
      almacen.demora = Completer<void>();
      var lista = false;
      final pendiente = crear().then((valor) {
        lista = true;
        return valor;
      });
      await Future<void>.delayed(Duration.zero);
      expect(almacen.escrituras, 1);
      expect(lista, false);
      expect(almacen.datos, isEmpty);
      almacen.demora!.complete();
      await pendiente;
      expect(lista, true);
    },
  );

  test('Recrear servicio recupera la misma clave y estado incierto', () async {
    final original = await crear();
    await servicio.marcarIncierta(uid, original.solicitudId);
    final reiniciado = IngresoPendienteService(almacen: almacen);
    final recuperada = await reiniciado.recuperar(uid);
    expect(recuperada!.solicitudId, original.solicitudId);
    expect(recuperada.estado, EstadoIngresoPendiente.incierto);
    final reintento = await reiniciado.crearORecuperar(
      uid: uid,
      tipo: original.tipo,
      huella: huella,
    );
    expect(reintento.solicitudId, original.solicitudId);
    expect(almacen.escrituras, 2);
  });

  test('Reintentos pendientes no generan ni escriben otra clave', () async {
    final original = await crear();
    final repetida = await crear(confirmar: false);
    expect(repetida.solicitudId, original.solicitudId);
    expect(almacen.escrituras, 1);
  });

  test('Separa usuarios y no reutiliza la operación de otra sesión', () async {
    final primera = await crear();
    expect(await servicio.recuperar('otro-$uid'), isNull);
    final segunda = await crear(usuario: 'otro-$uid');
    expect(segunda.uid, 'otro-$uid');
    expect(segunda.solicitudId, isNot(primera.solicitudId));
    expect((await servicio.recuperar(uid))!.solicitudId, primera.solicitudId);
  });

  test(
    'Cambio de tipo o parámetros exige resolver la intención anterior',
    () async {
      final original = await crear();
      await expectLater(
        crear(tipo: TipoIngresoPendiente.creacionIglesia),
        throwsA(isA<ErrorIngresoPendiente>()),
      );
      await expectLater(
        crear(parametros: otraHuella),
        throwsA(isA<ErrorIngresoPendiente>()),
      );
      expect(almacen.escrituras, 1);
      expect(
        (await servicio.recuperar(uid))!.solicitudId,
        original.solicitudId,
      );
    },
  );

  test('Confirmación finaliza sin reutilización accidental; nueva intención es explícita', () async {
    final original = await crear();
    final confirmada = await servicio.marcarConfirmada(
      uid,
      original.solicitudId,
    );
    expect(confirmada.estado, EstadoIngresoPendiente.confirmada);
    await expectLater(
      crear(confirmar: false),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
    final nueva = await crear();
    expect(nueva.solicitudId, isNot(original.solicitudId));
    await expectLater(
      servicio.marcarIncierta(uid, original.solicitudId),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
  });

  test('Rechazo definitivo es distinto de incierto y no inicia otra intención solo', () async {
    final original = await crear();
    final rechazada = await servicio.marcarRechazada(uid, original.solicitudId);
    expect(rechazada.estado, EstadoIngresoPendiente.rechazada);
    await expectLater(
      crear(confirmar: false),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
  });

  test('Abandonar una intención incierta exige decisión explícita', () async {
    final original = await crear();
    await servicio.marcarIncierta(uid, original.solicitudId);
    await expectLater(
      servicio.abandonar(
        uid,
        original.solicitudId,
        confirmadoPorUsuario: false,
      ),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
    expect(
      (await servicio.recuperar(uid))!.estado,
      EstadoIngresoPendiente.incierto,
    );
    await expectLater(
      servicio.abandonar(uid, original.solicitudId, confirmadoPorUsuario: true),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
    await servicio.guardarReconciliacion(
      uid,
      original.solicitudId,
      vigente: false,
    );
    await servicio.abandonar(
      uid,
      original.solicitudId,
      confirmadoPorUsuario: true,
    );
    final nueva = await crear(parametros: otraHuella);
    expect(nueva.solicitudId, isNot(original.solicitudId));
  });

  test(
    'Ausencia de almacenamiento no genera automáticamente una intención',
    () async {
      expect(await servicio.recuperar(uid), isNull);
      await expectLater(
        crear(confirmar: false),
        throwsA(isA<ErrorIngresoPendiente>()),
      );
      expect(almacen.escrituras, 0);
    },
  );

  test(
    'Error de lectura bloquea sin generar ni escribir otra solicitud',
    () async {
      almacen.fallaLectura = true;
      await expectLater(crear(), throwsA(isA<ErrorIngresoPendiente>()));
      almacen.fallaLectura = false;
      await expectLater(crear(), throwsA(isA<ErrorIngresoPendiente>()));
      expect(almacen.escrituras, 0);
    },
  );

  for (final fallo in ['escritura', 'perdida', 'incierta']) {
    test('Fallo $fallo bloquea reintentos y no reemplaza la clave', () async {
      almacen.fallaEscritura = fallo == 'escritura';
      almacen.pierdeEscritura = fallo == 'perdida';
      almacen.escribeYFalla = fallo == 'incierta';
      await expectLater(crear(), throwsA(isA<ErrorIngresoPendiente>()));
      final previo = Map.of(almacen.datos);
      await expectLater(crear(), throwsA(isA<ErrorIngresoPendiente>()));
      expect(almacen.escrituras, 1);
      expect(almacen.datos, previo);
    });
  }

  for (final corrupcion in ['json', 'version', 'uid', 'estado', 'extra']) {
    test(
      'Registro corrupto $corrupcion bloquea y conserva los datos',
      () async {
        await crear();
        final clave = almacen.datos.keys.single;
        final datos = jsonDecode(almacen.datos[clave]!) as Map<String, dynamic>;
        if (corrupcion == 'json') {
          almacen.datos[clave] = '{';
        } else {
          datos[corrupcion] = 'invalido';
          almacen.datos[clave] = jsonEncode(datos);
        }
        final corrupto = almacen.datos[clave];
        await expectLater(
          servicio.recuperar(uid),
          throwsA(isA<ErrorIngresoPendiente>()),
        );
        await expectLater(crear(), throwsA(isA<ErrorIngresoPendiente>()));
        expect(almacen.datos[clave], corrupto);
        expect(almacen.escrituras, 1);
      },
    );
  }

  test(
    'Llamadas concurrentes e instancias distintas crean una única intención',
    () async {
      final otroServicio = IngresoPendienteService(almacen: almacen);
      final solicitudes = await Future.wait([
        crear(),
        crear(),
        otroServicio.crearORecuperar(
          uid: uid,
          tipo: TipoIngresoPendiente.vinculacion,
          huella: huella,
          nuevaIntencionConfirmada: true,
        ),
      ]);
      expect(solicitudes.map((s) => s.solicitudId).toSet(), hasLength(1));
      expect(almacen.escrituras, 1);
    },
  );

  test('Dos parámetros concurrentes no sobrescriben intenciones', () async {
    final original = crear();
    final conflictiva = crear(parametros: otraHuella);
    await expectLater(conflictiva, throwsA(isA<ErrorIngresoPendiente>()));
    expect(
      (await servicio.recuperar(uid))!.solicitudId,
      (await original).solicitudId,
    );
    expect(almacen.escrituras, 1);
  });

  test(
    'Almacena solo metadatos mínimos y huella, sin formulario ni secretos',
    () async {
      await crear();
      final datos =
          jsonDecode(almacen.datos.values.single) as Map<String, dynamic>;
      expect(datos.keys.toSet(), {
        'version',
        'uid',
        'tipo',
        'huella',
        'solicitudId',
        'estado',
        'creadaEn',
        'actualizadaEn',
      });
      for (final campo in [
        'codigo',
        'email',
        'nombre',
        'token',
        'password',
        'parametros',
      ]) {
        expect(datos.containsKey(campo), false);
      }
    },
  );

  test('Valida UID y huella antes de escribir', () async {
    await expectLater(
      crear(usuario: ''),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
    await expectLater(
      crear(parametros: 'codigo sin huella'),
      throwsA(isA<ErrorIngresoPendiente>()),
    );
    expect(almacen.escrituras, 0);
  });
}
