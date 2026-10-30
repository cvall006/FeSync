import 'dart:async';
import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

enum AccionDesvinculacion { salir, expulsar }

enum EstadoDesvinculacion {
  confirmado,
  rechazado,
  transitorio,
  incierto,
  migracionRequerida,
}

enum EstadoReciboDesvinculacion {
  noVerificable,
  confirmadaPertenenciaTerminada,
  confirmadaNuevaPertenencia,
  confirmadaEstadoActualNoVerificable,
}

enum EstadoRecuperacionDesvinculacion {
  confirmada,
  reciboAusente,
  noVerificable,
}

/// Contexto histórico proyectado por el recibo privado. actorUid procede de Auth,
/// nunca del payload remoto. No concede permisos ni sustituye la verificación local.
class ContextoRecuperadoDesvinculacion {
  const ContextoRecuperadoDesvinculacion({
    required this.actorUid,
    required this.solicitudId,
    required this.iglesiaId,
    required this.uidObjetivo,
    required this.accion,
    required this.pertenenciaId,
  });
  final String actorUid;
  final String solicitudId;
  final String iglesiaId;
  final String uidObjetivo;
  final AccionDesvinculacion accion;
  final String pertenenciaId;
}

class RecuperacionContextoDesvinculacion {
  const RecuperacionContextoDesvinculacion.verificada(
    this.estado, {
    this.contexto,
  }) : error = null;
  const RecuperacionContextoDesvinculacion.fallida(this.error)
    : estado = null,
      contexto = null;
  final EstadoRecuperacionDesvinculacion? estado;
  final ContextoRecuperadoDesvinculacion? contexto;
  final ResultadoDesvinculacion? error;
}

/// Un error de consulta NO equivale al estado remoto NO_VERIFICABLE.
class ConsultaDesvinculacion {
  const ConsultaDesvinculacion.verificada(this.estado) : error = null;
  const ConsultaDesvinculacion.fallida(this.error) : estado = null;
  final EstadoReciboDesvinculacion? estado;
  final ResultadoDesvinculacion? error;
  bool get confirmada =>
      estado != null && estado != EstadoReciboDesvinculacion.noVerificable;
}

/// Resultado de esta llamada, no una autorización ni prueba de que una intención
/// previa nunca se ejecutó. No contiene identidad, parámetros o errores privados.
class ResultadoDesvinculacion {
  const ResultadoDesvinculacion(this.estado, this.codigo);

  final EstadoDesvinculacion estado;
  final String codigo;
  bool get confirmado => estado == EstadoDesvinculacion.confirmado;
}

typedef LlamarDesvinculacion = Future<Object?> Function(
  String nombre,
  Map<String, Object?> datos,
);

/// Servicio aislado: requiere desplegar primero el callable con recibos.
/// El llamador debe obtener pertenenciaId del perfil vigente, sin inferirlo del
/// UID/rol. UsuarioModel aún no lo contiene; aquí se recibe explícitamente.
///
/// El llamador DEBE persistir solicitudId y asociarla a actor, objetivo, iglesia,
/// acción y período ANTES del envío; conservarlos tras timeout/reinicio y reutilizar
/// exactamente la misma intención. Este servicio NO implementa esa persistencia,
/// no genera claves, no reintenta automáticamente ni ofrece un fallback antiguo.
/// Rechazado/transitorio describen esta respuesta, no borran la incertidumbre de
/// intentos anteriores. failed-precondition nunca permite borrar un perfil.
///
/// No toca Firestore ni FCM. La futura coordinación podrá limpiar FCM solo tras
/// confirmado, revalidando sesión/período para no afectar otra sesión o reingreso.
/// Un timeout no cancela necesariamente la ejecución remota. Una respuesta tardía
/// no actualiza este resultado: el llamador deberá reconciliar con la misma clave.
/// No conectar pantallas hasta resolver migración, persistencia y navegación.
class DesvinculacionService {
  DesvinculacionService({
    String? Function()? uidActual,
    LlamarDesvinculacion? llamar,
    FirebaseFunctions Function(String region)? functionsPorRegion,
    this.tiempoEspera = const Duration(seconds: 30),
  }) : _uidActual = uidActual ?? _uidFirebase,
       _llamarOverride = llamar,
       _functionsPorRegion = functionsPorRegion ?? _crearFunctions {
    if (tiempoEspera <= Duration.zero) {
      throw ArgumentError('El tiempo de espera debe ser positivo.');
    }
  }

  static const region = 'southamerica-west1';
  static const callable = 'desvincularMiembroIglesia';

  final String? Function() _uidActual;
  final LlamarDesvinculacion? _llamarOverride;
  final FirebaseFunctions Function(String region) _functionsPorRegion;
  final Duration tiempoEspera;
  late final FirebaseFunctions _functions = _functionsPorRegion(region);

  static String? _uidFirebase() => FirebaseAuth.instance.currentUser?.uid;
  static FirebaseFunctions _crearFunctions(String region) =>
      FirebaseFunctions.instanceFor(region: region);

  Future<Object?> _llamar(
    Map<String, Object?> datos, {
    String nombre = callable,
  }) async {
    if (_llamarOverride != null) return _llamarOverride(nombre, datos);
    return (await _functions
            .httpsCallable(
              nombre,
              options: HttpsCallableOptions(timeout: tiempoEspera),
            )
            .call<Object?>(datos))
        .data;
  }

  /// SOLO solicitudId; un recibo ausente no prueba que una operación no ocurrió.
  /// El coordinador debe comprobar además la época de sesión (incluido A-B-A) y
  /// las huellas persistidas antes de aceptar o guardar el contexto recuperado.
  Future<RecuperacionContextoDesvinculacion> recuperarContextoSolicitud({
    required String solicitudId,
  }) async {
    RecuperacionContextoDesvinculacion error(
      EstadoDesvinculacion e,
      String c,
    ) => RecuperacionContextoDesvinculacion.fallida(
      ResultadoDesvinculacion(e, c),
    );
    String? actor;
    try {
      actor = _uidActual();
    } catch (_) {
      return error(
        EstadoDesvinculacion.transitorio,
        'autenticacion-no-disponible',
      );
    }
    if (!_idValido(actor, limite: 128)) {
      return error(EstadoDesvinculacion.rechazado, 'unauthenticated');
    }
    if (!_solicitudValida(solicitudId)) {
      return error(EstadoDesvinculacion.rechazado, 'invalid-argument');
    }
    try {
      final r = await _llamar(
        {'solicitudId': solicitudId},
        nombre: 'recuperarContextoSolicitudDesvinculacion',
      ).timeout(tiempoEspera);
      if (_uidActual() != actor) {
        return error(EstadoDesvinculacion.incierto, 'sesion-cambiada');
      }
      if (r is Map && r.length == 1) {
        final estado = switch (r['estado']) {
          'RECIBO_AUSENTE' => EstadoRecuperacionDesvinculacion.reciboAusente,
          'NO_VERIFICABLE' => EstadoRecuperacionDesvinculacion.noVerificable,
          _ => null,
        };
        if (estado != null) {
          return RecuperacionContextoDesvinculacion.verificada(estado);
        }
      }
      if (r is Map && r.length == 2 && r['estado'] == 'CONFIRMADA') {
        final c = r['contexto'];
        const claves = {
          'solicitudId',
          'iglesiaId',
          'uidObjetivo',
          'accion',
          'pertenenciaId',
        };
        if (c is Map &&
            c.length == claves.length &&
            claves.every(c.containsKey) &&
            c['solicitudId'] == solicitudId &&
            c['iglesiaId'] is String &&
            _idValido(c['iglesiaId'] as String) &&
            c['uidObjetivo'] is String &&
            _idValido(c['uidObjetivo'] as String, limite: 128) &&
            (c['accion'] == 'salir' || c['accion'] == 'expulsar') &&
            (c['accion'] != 'salir' || c['uidObjetivo'] == actor) &&
            c['pertenenciaId'] is String &&
            (c['pertenenciaId'] as String).length == 64 &&
            !RegExp(r'[^a-f0-9]').hasMatch(c['pertenenciaId'] as String)) {
          return RecuperacionContextoDesvinculacion.verificada(
            EstadoRecuperacionDesvinculacion.confirmada,
            contexto: ContextoRecuperadoDesvinculacion(
              actorUid: actor!,
              solicitudId: solicitudId,
              iglesiaId: c['iglesiaId'] as String,
              uidObjetivo: c['uidObjetivo'] as String,
              accion: c['accion'] == 'salir'
                  ? AccionDesvinculacion.salir
                  : AccionDesvinculacion.expulsar,
              pertenenciaId: c['pertenenciaId'] as String,
            ),
          );
        }
      }
      return error(EstadoDesvinculacion.incierto, 'respuesta-no-verificable');
    } on TimeoutException {
      return error(EstadoDesvinculacion.incierto, 'deadline-exceeded');
    } on FirebaseFunctionsException catch (e) {
      if ({
        'permission-denied',
        'unauthenticated',
        'invalid-argument',
        'failed-precondition',
        'not-found',
        'unimplemented',
      }.contains(e.code)) {
        return error(EstadoDesvinculacion.rechazado, e.code);
      }
      if ({'aborted', 'resource-exhausted'}.contains(e.code)) {
        return error(EstadoDesvinculacion.transitorio, e.code);
      }
      return error(
        EstadoDesvinculacion.incierto,
        {
              'unavailable',
              'deadline-exceeded',
              'internal',
              'unknown',
              'cancelled',
            }.contains(e.code)
            ? e.code
            : 'recuperacion-no-confirmada',
      );
    } catch (_) {
      return error(EstadoDesvinculacion.incierto, 'recuperacion-no-confirmada');
    }
  }

  /// Solo consulta recibos propios usando los cinco parámetros originales.
  /// Los CONFIRMADA_* acreditan historia, nunca permisos, navegación ni FCM.
  Future<ConsultaDesvinculacion> consultarEstadoSolicitud({
    required String iglesiaId,
    required String uidObjetivo,
    required AccionDesvinculacion accion,
    required String solicitudId,
    required String pertenenciaId,
  }) async {
    ConsultaDesvinculacion error(EstadoDesvinculacion estado, String codigo) =>
        ConsultaDesvinculacion.fallida(ResultadoDesvinculacion(estado, codigo));
    String? actor;
    try {
      actor = _uidActual();
    } catch (_) {
      return error(
        EstadoDesvinculacion.transitorio,
        'autenticacion-no-disponible',
      );
    }
    if (!_idValido(actor, limite: 128)) {
      return error(EstadoDesvinculacion.rechazado, 'unauthenticated');
    }
    if (!_idValido(iglesiaId) ||
        !_idValido(uidObjetivo, limite: 128) ||
        !_solicitudValida(solicitudId) ||
        pertenenciaId.length != 64 ||
        RegExp(r'[^a-f0-9]').hasMatch(pertenenciaId)) {
      return error(EstadoDesvinculacion.rechazado, 'invalid-argument');
    }
    if (accion == AccionDesvinculacion.salir && uidObjetivo != actor) {
      return error(EstadoDesvinculacion.rechazado, 'permission-denied');
    }
    try {
      final respuesta = await _llamar(
        {
          'iglesiaId': iglesiaId,
          'uidObjetivo': uidObjetivo,
          'accion': accion.name,
          'pertenenciaId': pertenenciaId,
          'solicitudId': solicitudId,
        },
        nombre: 'consultarEstadoSolicitudDesvinculacion',
      ).timeout(tiempoEspera);
      if (_uidActual() != actor) {
        return error(EstadoDesvinculacion.incierto, 'sesion-cambiada');
      }
      const estados = {
        'NO_VERIFICABLE': EstadoReciboDesvinculacion.noVerificable,
        'CONFIRMADA_PERTENENCIA_TERMINADA':
            EstadoReciboDesvinculacion.confirmadaPertenenciaTerminada,
        'CONFIRMADA_NUEVA_PERTENENCIA':
            EstadoReciboDesvinculacion.confirmadaNuevaPertenencia,
        'CONFIRMADA_ESTADO_ACTUAL_NO_VERIFICABLE':
            EstadoReciboDesvinculacion.confirmadaEstadoActualNoVerificable,
      };
      final estado = respuesta is Map && respuesta.length == 1
          ? estados[respuesta['estado']]
          : null;
      if (estado == null) {
        return error(EstadoDesvinculacion.incierto, 'respuesta-no-verificable');
      }
      return ConsultaDesvinculacion.verificada(estado);
    } on TimeoutException {
      return error(EstadoDesvinculacion.incierto, 'deadline-exceeded');
    } on FirebaseFunctionsException catch (e) {
      if ({
        'permission-denied',
        'unauthenticated',
        'invalid-argument',
        'failed-precondition',
        'not-found',
        'unimplemented',
      }.contains(e.code)) {
        return error(EstadoDesvinculacion.rechazado, e.code);
      }
      if ({'aborted', 'resource-exhausted'}.contains(e.code)) {
        return error(EstadoDesvinculacion.transitorio, e.code);
      }
      return error(
        EstadoDesvinculacion.incierto,
        {
              'unavailable',
              'deadline-exceeded',
              'internal',
              'unknown',
              'cancelled',
            }.contains(e.code)
            ? e.code
            : 'consulta-no-confirmada',
      );
    } catch (_) {
      return error(EstadoDesvinculacion.incierto, 'consulta-no-confirmada');
    }
  }

  Future<ResultadoDesvinculacion> desvincular({
    required String iglesiaId,
    required String uidObjetivo,
    required AccionDesvinculacion accion,
    required String solicitudId,
    String? pertenenciaId,
  }) async {
    String? actor;
    try {
      actor = _uidActual();
    } catch (_) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.transitorio,
        'autenticacion-no-disponible',
      );
    }
    if (!_idValido(actor, limite: 128)) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.rechazado,
        'unauthenticated',
      );
    }
    if (!_idValido(iglesiaId) ||
        !_idValido(uidObjetivo, limite: 128) ||
        !_solicitudValida(solicitudId)) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.rechazado,
        'invalid-argument',
      );
    }
    if (accion == AccionDesvinculacion.salir && uidObjetivo != actor) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.rechazado,
        'permission-denied',
      );
    }
    if (pertenenciaId == null) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.migracionRequerida,
        'pertenencia-ausente',
      );
    }
    if (pertenenciaId.length != 64 ||
        RegExp(r'[^a-f0-9]').hasMatch(pertenenciaId)) {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.rechazado,
        'invalid-argument',
      );
    }

    try {
      final respuesta = await _llamar({
        'iglesiaId': iglesiaId,
        'uidObjetivo': uidObjetivo,
        'accion': accion.name,
        'pertenenciaId': pertenenciaId,
        'solicitudId': solicitudId,
      }).timeout(tiempoEspera);
      if (_uidActual() != actor) {
        return const ResultadoDesvinculacion(
          EstadoDesvinculacion.incierto,
          'sesion-cambiada',
        );
      }
      if (respuesta is Map &&
          respuesta.length == 1 &&
          respuesta['ok'] == true) {
        return const ResultadoDesvinculacion(
          EstadoDesvinculacion.confirmado,
          'confirmado',
        );
      }
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.incierto,
        'respuesta-no-verificable',
      );
    } on TimeoutException {
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.incierto,
        'deadline-exceeded',
      );
    } on FirebaseFunctionsException catch (error) {
      // Se conservan solo códigos conocidos; jamás message, details o stackTrace.
      if ({'aborted', 'resource-exhausted'}.contains(error.code)) {
        return ResultadoDesvinculacion(
          EstadoDesvinculacion.transitorio,
          error.code,
        );
      }
      if ({
        'permission-denied',
        'unauthenticated',
        'invalid-argument',
        'failed-precondition',
        'not-found',
        'already-exists',
        'out-of-range',
        'unimplemented',
      }.contains(error.code)) {
        return ResultadoDesvinculacion(
          EstadoDesvinculacion.rechazado,
          error.code,
        );
      }
      return ResultadoDesvinculacion(
        EstadoDesvinculacion.incierto,
        {
              'unavailable',
              'internal',
              'unknown',
              'cancelled',
              'deadline-exceeded',
            }.contains(error.code)
            ? error.code
            : 'resultado-no-confirmado',
      );
    } catch (_) {
      // Incluye errores de transporte y de sesión tras el envío: pueden haber
      // ocurrido después del commit; nunca se interpretan como un rechazo seguro.
      return const ResultadoDesvinculacion(
        EstadoDesvinculacion.incierto,
        'resultado-no-confirmado',
      );
    }
  }

  static bool _idValido(String? valor, {int limite = 1500}) =>
      valor != null &&
      valor.trim().isNotEmpty &&
      valor.length <= limite &&
      utf8.encode(valor).length <= 1500 &&
      !RegExp(r'[/\x00-\x1f\x7f]').hasMatch(valor) &&
      valor != '.' &&
      valor != '..' &&
      !RegExp(r'^__.*__$').hasMatch(valor);

  static bool _solicitudValida(String valor) =>
      valor.length >= 16 &&
      valor.length <= 128 &&
      !RegExp(r'[^a-zA-Z0-9_-]').hasMatch(valor) &&
      !RegExp(r'^__.*__$').hasMatch(valor);
}
