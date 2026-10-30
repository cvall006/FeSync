import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_transporte_config.dart';

void main() {
  test('SDK financiero usa dos endpoints y conserva el cuerpo idempotente', () {
    final solicitud = <String, dynamic>{
      'solicitudId': 'original',
      'campos': {'montoMinor': 10},
    };
    for (final nombre in ['finanzasV1Consultar', 'finanzasV1Ejecutar']) {
      final (endpoint, cuerpo) = FinanzasTransporteConfig.solicitudPublica(
        nombre,
        solicitud,
      );
      expect(endpoint, nombre);
      expect(identical(cuerpo, solicitud), true);
    }
    for (final entrada in {
      'finanzasV1ResolverSolicitud': 'resolverSolicitud',
      'finanzasV1Mantener': 'mantenimiento',
    }.entries) {
      final (endpoint, cuerpo) = FinanzasTransporteConfig.solicitudPublica(
        entrada.key,
        solicitud,
      );
      expect(endpoint, 'finanzasV1Ejecutar');
      expect(cuerpo.keys.toSet(), {'tipo', 'datos'});
      expect(cuerpo['tipo'], entrada.value);
      expect(identical(cuerpo['datos'], solicitud), true);
    }
    expect(
      () => FinanzasTransporteConfig.solicitudPublica('demo', solicitud),
      throwsStateError,
    );
  });
}
