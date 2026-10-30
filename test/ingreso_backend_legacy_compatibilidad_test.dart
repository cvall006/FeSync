import 'package:fesync/core/models/resultado_ingreso.dart';
import 'package:fesync/core/services/coordinador_ingreso.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ingreso_coordinado_test.dart' show AlmacenPruebaIngreso;

void main() {
  for (final tipo in TipoIngresoPendiente.values) {
    test(
      'Backend desplegado legacy: verifica pertenencia sin inventar recibo ($tipo)',
      () async {
        Map<String, dynamic>? perfil;
        final consultas = <String>[];
        final almacen = AlmacenPruebaIngreso();
        final c = CoordinadorIngreso(
          uidActual: () => 'usuario_local',
          persistencia: IngresoPendienteService(almacen: almacen),
          leerPerfilServidor: (_) async => perfil,
          llamar: (nombre, datos) async {
            consultas.add(nombre);
            if (nombre == 'consultarEstadoSolicitudIngreso') {
              return {'estado': 'NO_VERIFICABLE'};
            }
            perfil = {
              'iglesiaId': 'iglesia',
              'rolGlobal': tipo == TipoIngresoPendiente.creacionIglesia
                  ? 'admin_iglesia'
                  : 'servidor',
            };
            return {'ok': true, 'iglesiaId': 'iglesia'};
          },
        );
        await c.prepararSesion();
        final r = await c.ingresar(tipo, {
          'nombre': 'Prueba',
          'codigo': 'LOCAL',
        }, nuevaIntencionConfirmada: true);
        expect(perfil!['iglesiaId'], 'iglesia');
        expect(perfil!.containsKey('pertenenciaId'), false);
        expect(r.estado, EstadoResultadoIngreso.confirmado);
        expect(c.solicitud!.estado, EstadoIngresoPendiente.pertenenciaLegacy);
        expect(c.bloqueaDashboard, false);
        expect(c.permitePerfil('usuario_local', 'iglesia', null), true);
        expect(c.permitePerfil('usuario_local', 'otra', null), false);
        expect(c.permitePerfil('usuario_local', 'iglesia', 'a' * 64), false);
        expect(consultas.last, 'consultarEstadoSolicitudIngreso');
        final restaurado = CoordinadorIngreso(
          uidActual: () => 'usuario_local',
          persistencia: IngresoPendienteService(almacen: almacen),
          leerPerfilServidor: (_) async => perfil,
          llamar: (nombre, datos) async {
            expect(nombre, 'consultarEstadoSolicitudIngreso');
            return {'estado': 'NO_VERIFICABLE'};
          },
        );
        await restaurado.prepararSesion();
        expect(
          restaurado.permitePerfil('usuario_local', 'iglesia', null),
          true,
        );
        perfil = {};
        await restaurado.reconciliar();
        expect(restaurado.solicitud!.estado, EstadoIngresoPendiente.rechazada);
        restaurado.dispose();
        c.dispose();
      },
    );
  }
}
