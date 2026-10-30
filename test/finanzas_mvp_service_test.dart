import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

class MemoriaFinanzas implements AlmacenIngresoPendiente {
  final valores = <String, String>{};
  bool falla = false;
  @override
  Future<String?> leer(String clave) async => valores[clave];
  @override
  Future<void> escribir(String clave, String valor) async {
    if (falla) throw StateError('Almacén no disponible');
    valores[clave] = valor;
  }
}

void main() {
  const contexto = {'iglesiaId': 'demo', 'pertenenciaId': 'original'};
  test(
    'persiste antes del envío y conserva solicitud idéntica tras reiniciar',
    () async {
      final m = MemoriaFinanzas();
      Map<String, dynamic>? enviada;
      final s = FinanzasMvpService(
        almacen: m,
        uidActual: () => 'admin',
        llamar: (_, data) async {
          expect(
            m.valores.values.any(
              (v) => v.contains(data['solicitudId'] as String),
            ),
            isTrue,
          );
          enviada = jsonDecode(jsonEncode(data)) as Map<String, dynamic>;
          throw TimeoutException('Respuesta perdida');
        },
      );
      await expectLater(
        s.enviar(contexto, 'ingreso', {'montoMinor': 100}),
        throwsA(isA<TimeoutException>()),
      );
      expect(await s.pendiente(), enviada);
      final nuevo = FinanzasMvpService(
        almacen: m,
        uidActual: () => 'admin',
        llamar: (nombre, data) async {
          expect(nombre, 'finanzasV1ResolverSolicitud');
          expect(data['solicitud'], enviada);
          return {'estado': 'CONFIRMADA', 'historica': true};
        },
      );
      await nuevo.recuperar();
      expect(await nuevo.pendiente(), isNull);
      expect(
        m.valores.keys.any(
          (k) => k.startsWith('finanzas-mvp-demo-recibo-admin-'),
        ),
        isTrue,
      );
    },
  );
  test('doble pulsación y segunda instancia no duplican envío', () async {
    final m = MemoriaFinanzas(), espera = Completer<Map<String, dynamic>>();
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (_, data) => espera.future,
    );
    final otra = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (_, data) => espera.future,
    );
    final primera = s.enviar(contexto, 'gasto', {'montoMinor': 100});
    await expectLater(
      otra.enviar(contexto, 'gasto', {'montoMinor': 100}),
      throwsStateError,
    );
    espera.complete({'estado': 'CONFIRMADA'});
    await primera;
  });
  test('si falla persistencia no envía y otra sesión no recupera solicitudes ajenas', () async {
    final m = MemoriaFinanzas()..falla = true;
    var llamadas = 0;
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (_, data) async {
        llamadas++;
        return {};
      },
    );
    await expectLater(s.enviar(contexto, 'ingreso', {}), throwsStateError);
    expect(llamadas, 0);
    m.falla = false;
    await m.escribir(
      'finanzas-mvp-demo-pendiente-otro',
      jsonEncode({'solicitudId': 'ajena'}),
    );
    expect(await s.pendiente(), isNull);
    await expectLater(s.recuperar(), throwsStateError);
    expect(llamadas, 0);
  });
  test('errores y resultados sin confirmación no borran intención ni generan otra clave', () async {
    final m = MemoriaFinanzas();
    final s = FinanzasMvpService(
      almacen: m,
      uidActual: () => 'admin',
      llamar: (_, data) async => {'estado': 'INCIERTA'},
    );
    await expectLater(
      s.enviar(contexto, 'ingreso', {'montoMinor': 100}),
      throwsStateError,
    );
    final primera = await s.pendiente();
    await expectLater(
      s.enviar(contexto, 'gasto', {'montoMinor': 10}),
      throwsStateError,
    );
    expect(await s.pendiente(), primera);
  });
}
