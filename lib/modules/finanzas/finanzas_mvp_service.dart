import 'dart:convert';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';

import '../../core/services/ingreso_pendiente_service.dart';
import 'finanzas_transporte_config.dart';

typedef LlamadaFinanzas = Future<Map<String, dynamic>> Function(
  String nombre,
  Map<String, dynamic> datos,
);

/// Un único envío pendiente por usuario. La intención se guarda ANTES del HTTP.
/// Se recupera con su contexto original, nunca contra otra pertenencia.
class FinanzasMvpService {
  FinanzasMvpService({
    LlamadaFinanzas? llamar,
    String? Function()? uidActual,
    AlmacenIngresoPendiente? almacen,
  }) : _llamar = llamar ?? _firebase,
       _uidActual = uidActual ?? (() => FirebaseAuth.instance.currentUser?.uid),
       _almacen = almacen ?? AlmacenSeguroIngresoPendiente();

  final LlamadaFinanzas _llamar;
  final String? Function() _uidActual;
  final AlmacenIngresoPendiente _almacen;
  static final Set<String> _enCurso = {};

  static Future<Map<String, dynamic>> _firebase(
    String nombre,
    Map<String, dynamic> datos,
  ) async {
    FinanzasTransporteConfig.actual.validar(
      proyectoApp: Firebase.app().options.projectId,
    );
    final functions = FirebaseFunctions.instanceFor(
      region: FinanzasTransporteConfig.region,
    );
    if (FinanzasTransporteConfig.actual.entorno == 'emulador') {
      // El servicio tampoco puede caer al endpoint remoto si se usa sin main.
      functions.useFunctionsEmulator(
        FinanzasTransporteConfig.hostEmulador,
        5018,
        automaticHostMapping: false,
      );
    }
    final (callable, cuerpo) = FinanzasTransporteConfig.solicitudPublica(
      nombre,
      datos,
    );
    return Map<String, dynamic>.from(
      (await functions.httpsCallable(callable).call<dynamic>(cuerpo)).data
          as Map,
    );
  }

  String get _uid => _uidActual() ?? (throw StateError('Inicia sesión.'));
  String get _prefijo => FinanzasTransporteConfig.actual.entorno == 'publicable'
      ? 'finanzas-v1-${FinanzasTransporteConfig.actual.proyecto}'
      : 'finanzas-mvp-demo';
  String _clave(String uid) => '$_prefijo-pendiente-$uid';

  Future<Map<String, dynamic>> consultar() =>
      _llamar(FinanzasTransporteConfig.consultar, {'historialPaginado': true});

  Future<Map<String, dynamic>> consultarPagina(String cursor, int limite) =>
      _llamar(FinanzasTransporteConfig.consultar, {
        'historialPaginado': true,
        'cursor': cursor,
        'limite': limite,
      });

  Future<void> inicializar(
    Map<String, dynamic> contexto,
    String periodo,
  ) async {
    throw StateError(
      'La preparación financiera requiere un operador autorizado.',
    );
  }

  Future<Map<String, dynamic>?> pendiente() async {
    final texto = await _almacen.leer(_clave(_uid));
    return texto == null || texto.isEmpty
        ? null
        : Map<String, dynamic>.from(jsonDecode(texto) as Map);
  }

  Future<Map<String, dynamic>> enviar(
    Map<String, dynamic> contexto,
    String operacion,
    Map<String, dynamic> campos,
  ) async {
    final uid = _uid;
    if (!_enCurso.add(uid)) throw StateError('Ya hay un envío en curso.');
    try {
      if (await pendiente() != null) {
        throw StateError('Recupera primero la solicitud pendiente.');
      }
      final rng = Random.secure();
      final solicitud = jsonDecode(
        jsonEncode({
          'solicitudId': List.generate(
            24,
            (_) => rng.nextInt(256).toRadixString(16).padLeft(2, '0'),
          ).join(),
          'contexto': contexto,
          'operacion': operacion,
          'campos': campos,
        }),
      ) as Map<String, dynamic>;
      await _almacen.escribir(_clave(uid), jsonEncode(solicitud));
      return await _resolver(uid, solicitud);
    } finally {
      _enCurso.remove(uid);
    }
  }

  Future<Map<String, dynamic>> recuperar() async {
    final uid = _uid;
    if (!_enCurso.add(uid)) throw StateError('Ya hay un envío en curso.');
    try {
      final solicitud = await pendiente();
      if (solicitud == null) throw StateError('No hay solicitud pendiente.');
      final estado = await _inspeccionar(uid, solicitud, descartar: false);
      if (estado['estado'] == 'CONFIRMADA') return estado;
      if (estado['estado'] != 'NO_CONFIRMADA') return estado;
      return await _resolver(uid, solicitud);
    } finally {
      _enCurso.remove(uid);
    }
  }

  Future<Map<String, dynamic>> inspeccionarPendiente({
    bool descartar = false,
  }) async {
    final uid = _uid;
    if (!_enCurso.add(uid)) throw StateError('Ya hay un envío en curso.');
    try {
      final solicitud = await pendiente();
      if (solicitud == null) throw StateError('No hay solicitud pendiente.');
      return await _inspeccionar(uid, solicitud, descartar: descartar);
    } finally {
      _enCurso.remove(uid);
    }
  }

  Future<Map<String, dynamic>> _inspeccionar(
    String uid,
    Map<String, dynamic> solicitud, {
    required bool descartar,
  }) async {
    if (_uidActual() != uid) throw StateError('La sesión cambió.');
    final r = await _llamar('finanzasV1ResolverSolicitud', {
      'accion': descartar ? 'descartar' : 'consultar',
      'solicitud': solicitud,
    });
    if (r['estado'] == 'CONFIRMADA') {
      await _guardarConfirmacion(uid, solicitud, r);
    } else if (r['estado'] == 'RECHAZADA' && r['puedeCrearNueva'] == true) {
      await _almacen.escribir(
        '$_prefijo-resolucion-$uid-${solicitud['solicitudId']}',
        jsonEncode({'solicitud': solicitud, 'resultado': r}),
      );
      await _almacen.escribir(_clave(uid), '');
    } else if (!['NO_CONFIRMADA', 'REQUIERE_NUEVA'].contains(r['estado'])) {
      throw StateError('Resultado incierto. Conserva la solicitud pendiente.');
    }
    return r;
  }

  String _idNueva() {
    final rng = Random.secure();
    return List.generate(
      24,
      (_) => rng.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  Future<Map<String, dynamic>?> mantenimientoPendiente() async {
    final texto = await _almacen.leer('$_prefijo-mantenimiento-$_uid');
    return texto == null || texto.isEmpty
        ? null
        : Map<String, dynamic>.from(jsonDecode(texto) as Map);
  }

  Future<Map<String, dynamic>> mantener(
    Map<String, dynamic> contexto,
    String accion, {
    String? periodoId,
    bool recuperar = false,
    bool descartar = false,
  }) async {
    final uid = _uid;
    if (!_enCurso.add(uid)) throw StateError('Ya hay un envío en curso.');
    try {
      var solicitud = await mantenimientoPendiente();
      if (solicitud != null && !recuperar && !descartar) {
        throw StateError(
          'Resuelve primero el paso de mantenimiento pendiente.',
        );
      }
      if (solicitud == null) {
        if (recuperar || descartar) {
          throw StateError('No hay mantenimiento pendiente.');
        }
        solicitud = {
          'solicitudId': _idNueva(),
          'contexto': contexto,
          'accion': accion,
          'periodoId': ?periodoId,
        };
        await _almacen.escribir(
          '$_prefijo-mantenimiento-$uid',
          jsonEncode(solicitud),
        );
      }
      if (_uidActual() != uid) throw StateError('La sesión cambió.');
      final r = await _llamar(
        'finanzasV1Mantener',
        descartar
            ? {
                'accion': 'resolverSolicitud',
                'solicitud': solicitud,
                'descartar': true,
              }
            : solicitud,
      );
      if (r['estado'] == 'CONFIRMADA' ||
          (r['estado'] == 'RECHAZADA' && r['puedeCrearNueva'] == true)) {
        await _almacen.escribir(
          '$_prefijo-mantenimiento-recibo-$uid-${solicitud['solicitudId']}',
          jsonEncode({'solicitud': solicitud, 'resultado': r}),
        );
        await _almacen.escribir('$_prefijo-mantenimiento-$uid', '');
      } else {
        throw StateError(
          'Resultado incierto. Conserva el paso de mantenimiento.',
        );
      }
      return r;
    } finally {
      _enCurso.remove(uid);
    }
  }

  Future<Map<String, dynamic>> _resolver(
    String uid,
    Map<String, dynamic> solicitud,
  ) async {
    if (_uidActual() != uid) throw StateError('La sesión cambió.');
    // Cualquier excepción conserva la intención. Ni timeout ni falta de acceso
    // prueban que una petición anterior no haya sido confirmada.
    final resultado = await _llamar(
      FinanzasTransporteConfig.ejecutar,
      solicitud,
    );
    if (resultado['estado'] != 'CONFIRMADA') {
      throw StateError('Resultado incierto. Recupera la misma solicitud.');
    }
    await _guardarConfirmacion(uid, solicitud, resultado);
    return resultado;
  }

  Future<void> _guardarConfirmacion(
    String uid,
    Map<String, dynamic> solicitud,
    Map<String, dynamic> resultado,
  ) async {
    await _almacen.escribir(
      '$_prefijo-recibo-$uid-${solicitud['solicitudId']}',
      jsonEncode({'solicitud': solicitud, 'resultado': resultado}),
    );
    await _almacen.escribir(_clave(uid), '');
  }
}
