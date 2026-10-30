import 'dart:convert';

import 'package:fesync/core/services/roles_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'roles_service_test.dart' show AlmacenRoles, PruebaRoles, codigo;

void main() {
  late AlmacenRoles almacen;
  late RolesPendienteService servicio;
  var numero = 0;
  late String actor;
  Future<SolicitudRol> preparar({
    bool confirmado = true,
    String rol = 'lider_area',
  }) => servicio.preparar(
    actor,
    'iglesia',
    'objetivo',
    PruebaRoles.contexto,
    rol,
    confirmado: confirmado,
  );
  setUp(() {
    almacen = AlmacenRoles();
    servicio = RolesPendienteService(almacen: almacen);
    actor = 'pendiente-roles-${numero++}';
  });
  test(
    'clave segura y recuperación en otra instancia; payload mínimo íntegro',
    () async {
      final s = await preparar();
      expect(s.solicitudId, matches(RegExp(r'^[a-f0-9]{64}$')));
      final otra = RolesPendienteService(almacen: almacen);
      expect(
        (await otra.recuperar(actor, 'objetivo'))!.parametros,
        s.parametros,
      );
      final d = jsonDecode(almacen.datos.values.single) as Map;
      expect(d.keys.toSet(), {'version', 'actorUid', 'parametros', 'estado'});
      expect(
        (d['parametros'] as Map).keys.toSet(),
        RolesPendienteService.campos.toSet(),
      );
      for (final prohibido in [
        'nombre',
        'correo',
        'token',
        'descripcion',
        'codigoAcceso',
      ]) {
        expect(d.containsKey(prohibido), isFalse);
        expect((d['parametros'] as Map).containsKey(prohibido), isFalse);
      }
    },
  );
  test('confirmación explícita obligatoria', () async {
    await expectLater(
      preparar(confirmado: false),
      throwsA(codigo('revision-requerida')),
    );
    expect(almacen.datos, isEmpty);
  });
  test('pendiente no se reemplaza con otra intención ni parámetros', () async {
    final s = await preparar();
    await expectLater(
      preparar(rol: 'servidor'),
      throwsA(codigo('solicitud-pendiente')),
    );
    expect(
      (await servicio.recuperar(actor, 'objetivo'))!.solicitudId,
      s.solicitudId,
    );
  });
  test('confirmada admite nueva intención explícita con otra clave', () async {
    final s = await preparar();
    await servicio.marcar(s, EstadoSolicitudRol.confirmada);
    final otra = await preparar();
    expect(otra.solicitudId, isNot(s.solicitudId));
  });
  test('rechazada necesita nueva revisión explícita', () async {
    final s = await preparar();
    await servicio.marcar(s, EstadoSolicitudRol.rechazada);
    await expectLater(
      preparar(confirmado: false),
      throwsA(codigo('revision-requerida')),
    );
    expect(
      (await servicio.recuperar(actor, 'objetivo'))!.solicitudId,
      s.solicitudId,
    );
  });
  test('objetivos y actores separados', () async {
    final s = await preparar();
    expect(await servicio.recuperar('otro-actor', 'objetivo'), isNull);
    await servicio.preparar(
      actor,
      'iglesia',
      'segundo',
      PruebaRoles.contexto,
      'servidor',
      confirmado: true,
    );
    expect(almacen.datos.length, 2);
    expect(
      (await servicio.recuperar(actor, 'objetivo'))!.solicitudId,
      s.solicitudId,
    );
  });
  test('lectura corrupta no sobrescribe registro', () async {
    final clave = RolesPendienteService.clave(actor, 'objetivo');
    almacen.datos[clave] = '{roto';
    await expectLater(
      preparar(),
      throwsA(codigo('almacen-inaccesible-o-corrupto')),
    );
    expect(almacen.datos[clave], '{roto');
  });
  test('registro de otro actor en slot incorrecto bloquea', () async {
    await preparar();
    final clave = RolesPendienteService.clave(actor, 'objetivo');
    final d = jsonDecode(almacen.datos[clave]!) as Map<String, dynamic>;
    d['actorUid'] = 'ajeno';
    almacen.datos[clave] = jsonEncode(d);
    await expectLater(
      servicio.recuperar(actor, 'objetivo'),
      throwsA(codigo('almacen-inaccesible-o-corrupto')),
    );
  });
  test('lectura inaccesible no crea intención', () async {
    almacen.fallaLeer = true;
    await expectLater(
      preparar(),
      throwsA(codigo('almacen-inaccesible-o-corrupto')),
    );
    expect(almacen.datos, isEmpty);
  });
  test(
    'escritura incierta y ausente no genera otra clave automáticamente',
    () async {
      almacen.fallaEscribir = true;
      await expectLater(
        preparar(),
        throwsA(codigo('persistencia-no-confirmada')),
      );
      almacen.fallaEscribir = false;
      await expectLater(preparar(), throwsA(codigo('revision-requerida')));
      expect(almacen.datos, isEmpty);
    },
  );
  test(
    'preparaciones concurrentes producen un registro y un rechazo',
    () async {
      final primera = preparar();
      final segunda = expectLater(
        preparar(),
        throwsA(codigo('solicitud-pendiente')),
      );
      await primera;
      await segunda;
      expect(almacen.datos.length, 1);
    },
  );
  test('administrador y versiones no canónicas rechazados', () async {
    await expectLater(
      preparar(rol: 'admin_iglesia'),
      throwsA(codigo('revision-requerida')),
    );
    for (final v in [
      '01700000000:1',
      '1:01',
      '1:1000000000',
      '1.5:0',
      '1:0extra',
    ]) {
      expect(versionRolValida(v), isFalse);
    }
    expect(versionRolValida('1700000000:123456789'), isTrue);
    expect(almacen.datos, isEmpty);
  });
}
