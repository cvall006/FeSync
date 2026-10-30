import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/services/ingreso_pendiente_service.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';

class _Disco implements AlmacenIngresoPendiente {
  _Disco(this.directorio);
  final Directory directorio;
  File archivo(String clave) => File('${directorio.path}/$clave.json');
  @override
  Future<String?> leer(String clave) async =>
      await archivo(clave).exists() ? archivo(clave).readAsString() : null;
  @override
  Future<void> escribir(String clave, String valor) async {
    await archivo(clave).writeAsString(valor, flush: true);
  }
}

Future<Map<String, dynamic>> _post(
  String url,
  Map<String, dynamic> datos, [
  String? token,
]) async {
  final uri = Uri.parse(url);
  if (uri.host != '127.0.0.1' || ![9098, 5018].contains(uri.port)) {
    throw StateError('Solo emuladores locales.');
  }
  final cliente = HttpClient();
  try {
    final req = await cliente.postUrl(uri);
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set('Authorization', 'Bearer $token');
    req.write(jsonEncode(datos));
    final res = await req.close();
    final body = jsonDecode(
      await res.transform(utf8.decoder).join(),
    ) as Map<String, dynamic>;
    if (res.statusCode != 200 || body['error'] != null) {
      throw StateError('Respuesta local no confirmada: ${res.statusCode}');
    }
    return body;
  } finally {
    cliente.close();
  }
}

void main() {
  test(
    'Pendiente en disco: nueva instancia recupera commit real sin duplicar',
    () async {
      final evidencia = jsonDecode(
        File('docs/fin_release_6_2026-10-26/emulador.json').readAsStringSync(),
      ) as Map<String, dynamic>;
      expect(evidencia['proyecto'], 'demo-fesync');
      final fixture = evidencia['flutter'] as Map<String, dynamic>;
      final login = await _post(
        'http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',
        {
          'email': fixture['email'],
          'password': 'SoloDemo123!',
          'returnSecureToken': true,
        },
      );
      final directorio = await Directory.systemTemp.createTemp(
        'fin-release6-pendiente-',
      );
      // Adaptación solo del test. La ruta productiva sigue pendiente de autorización.
      Future<Map<String, dynamic>> llamar(
        String nombre,
        Map<String, dynamic> data,
      ) async {
        final normal = {
          'finanzasMvpConsultar': 'finanzasV1Consultar',
          'finanzasMvpEjecutar': 'finanzasV1Ejecutar',
        }[nombre];
        if (normal == null) throw StateError('Sin fixtures callables.');
        final body = await _post(
          'http://127.0.0.1:5018/demo-fesync/southamerica-west1/$normal',
          {'data': data},
          login['idToken'] as String,
        );
        return Map<String, dynamic>.from(body['result'] as Map);
      }

      final primero = FinanzasMvpService(
        almacen: _Disco(directorio),
        uidActual: () => login['localId'] as String,
        llamar: (nombre, data) async {
          final resultado = await llamar(nombre, data);
          if (nombre == 'finanzasMvpEjecutar') {
            throw TimeoutException('Respuesta descartada tras commit local');
          }
          return resultado;
        },
      );
      final antes = await primero.consultar();
      await expectLater(
        primero.enviar(
          Map<String, dynamic>.from(antes['contexto'] as Map),
          'gasto',
          {
            'cuentaId': 'caja',
            'categoriaId': 'gasto',
            'montoMinor': 11,
            'fechaContable': '2026-10-26',
          },
        ),
        throwsA(isA<TimeoutException>()),
      );
      final pendiente = await primero.pendiente();
      expect(pendiente, isNotNull);
      final nuevo = FinanzasMvpService(
        almacen: _Disco(Directory(directorio.path)),
        uidActual: () => login['localId'] as String,
        llamar: llamar,
      );
      expect(await nuevo.pendiente(), pendiente);
      final replay = await nuevo.recuperar(), despues = await nuevo.consultar();
      expect(replay['historica'], true);
      expect(await nuevo.pendiente(), isNull);
      expect(
        despues['saldoTotalMinor'],
        (antes['saldoTotalMinor'] as int) - 11,
      );
      expect(
        (despues['historial'] as Map)['corte'],
        ((antes['historial'] as Map)['corte'] as int) + 1,
      );
      File('docs/fin_release_6_2026-10-26/flutter-recuperacion.json')
          .writeAsStringSync(
            jsonEncode({
              'persistencia': 'archivo con flush',
              'nuevaInstanciaServicioYAlmacen': true,
              'historica': true,
              'saldoAntes': antes['saldoTotalMinor'],
              'saldoDespues': despues['saldoTotalMinor'],
              'movimientosAgregados': 1,
              'pendienteResuelta': true,
              'transporte': 'HTTP Auth y Functions normales locales',
              'almacenSeguroNativoDispositivoProbado': false,
            }),
          );
    },
    skip: !const bool.fromEnvironment('FIN_RELEASE6_EMULATOR_TEST'),
  );
}
