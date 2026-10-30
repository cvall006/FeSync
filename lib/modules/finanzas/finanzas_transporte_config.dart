import 'package:flutter/foundation.dart';

import '../../core/services/firebase_emulator_bootstrap.dart';

/// Selección de transporte; nunca concede autorización financiera.
class FinanzasTransporteConfig {
  const FinanzasTransporteConfig({
    required this.entorno,
    required this.proyecto,
    this.habilitado = false,
  });

  static const actual = FinanzasTransporteConfig(
    entorno: String.fromEnvironment(
      'FESYNC_FINANZAS_TRANSPORTE',
      defaultValue: finanzasEmuladores ? 'emulador' : 'deshabilitado',
    ),
    proyecto: String.fromEnvironment('FESYNC_FINANZAS_PROYECTO'),
    habilitado: bool.fromEnvironment('FESYNC_FINANZAS_CLIENTE_HABILITADO'),
  );
  static const region = 'southamerica-west1';
  static const consultar = 'finanzasV1Consultar';
  static const ejecutar = 'finanzasV1Ejecutar';

  /// Los nombres internos antiguos siguen disponibles para clientes anteriores.
  /// El SDK del candidato invoca únicamente los dos callables públicos V1.
  static (String, Map<String, dynamic>) solicitudPublica(
    String nombre,
    Map<String, dynamic> datos,
  ) => switch (nombre) {
    consultar || ejecutar => (nombre, datos),
    'finanzasV1ResolverSolicitud' => (
      ejecutar,
      {'tipo': 'resolverSolicitud', 'datos': datos},
    ),
    'finanzasV1Mantener' => (
      ejecutar,
      {'tipo': 'mantenimiento', 'datos': datos},
    ),
    _ => throw StateError('Callable financiero no admitido.'),
  };
  static String get hostEmulador => validarHostEmulador(
    const String.fromEnvironment(
      'FESYNC_EMULATOR_HOST',
      defaultValue: '127.0.0.1',
    ),
  );
  final String entorno;
  final String proyecto;
  final bool habilitado;

  void validar({
    required String proyectoApp,
    bool demo = finanzasEmuladores,
    bool debug = kDebugMode,
  }) {
    if (entorno == 'emulador') {
      if (!demo ||
          !debug ||
          proyectoApp != 'demo-fesync' ||
          (proyecto.isNotEmpty && proyecto != 'demo-fesync')) {
        throw StateError('Transporte financiero demo incoherente.');
      }
      return;
    }
    if (entorno != 'publicable' ||
        !habilitado ||
        demo ||
        debug ||
        proyecto.isEmpty ||
        proyecto.startsWith('demo-') ||
        proyectoApp != proyecto) {
      throw StateError('Transporte financiero no habilitado.');
    }
  }
}
