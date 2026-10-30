import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'roles_pendiente_service.dart';
export 'roles_pendiente_service.dart';

typedef LlamarRoles = Future<Object?> Function(
  String nombre,
  Map<String, Object?> datos,
);

/// Requiere backend compatible publicado ANTES del cliente y migración de legados.
/// Reintentar es repetir el payload persistido, no consultar contexto nuevo.
/// No existe consulta de recibo separada: el replay autenticado verifica su recibo
/// antes de autorizar una ejecución nueva. CONFIRMADA siempre es histórica.
/// Sin Firestore, finanzas, navegación, FCM ni logs de parámetros.
class RolesService extends ChangeNotifier {
  RolesService({
    String? Function()? uidActual,
    Stream<String?>? cambiosSesion,
    LlamarRoles? llamar,
    RolesPendienteService? persistencia,
    FirebaseFunctions Function(String)? functionsPorRegion,
    this.tiempoEspera = const Duration(seconds: 30),
  }) : _uid = uidActual ?? (() => FirebaseAuth.instance.currentUser?.uid),
       // Mantiene el nombre público de la dependencia inyectable.
       // ignore: prefer_initializing_formals
       _llamar = llamar,
       _persistencia = persistencia ?? RolesPendienteService(),
       _functions =
           functionsPorRegion ??
           ((r) => FirebaseFunctions.instanceFor(region: r)) {
    if (tiempoEspera <= Duration.zero) throw ArgumentError('Tiempo inválido');
    _actor = _uid();
    _sesion =
        (cambiosSesion ??
                FirebaseAuth.instance.authStateChanges().map((u) => u?.uid))
            .listen(
              (u) {
                if (u != _actor) {
                  _actor = u;
                  _revision++;
                  notifyListeners();
                }
              },
              onError: (Object _) {
                _actor = null;
                _revision++;
                notifyListeners();
              },
              onDone: () {
                _actor = null;
                _revision++;
                notifyListeners();
              },
            );
  }
  static const region = 'southamerica-west1';
  final String? Function() _uid;
  final LlamarRoles? _llamar;
  final RolesPendienteService _persistencia;
  final FirebaseFunctions Function(String) _functions;
  final Duration tiempoEspera;
  StreamSubscription<String?>? _sesion;
  String? _actor;
  int _revision = 0;
  bool _cerrado = false;
  static final _ocupadas = <String>{};
  int get revision => _revision;
  bool vigente(int r) =>
      !_cerrado && r == _revision && _actor != null && _uid() == _actor;
  String _identidad() {
    if (!vigente(_revision) || !idRolValido(_actor!, 128)) {
      throw const ErrorRoles('unauthenticated');
    }
    return _actor!;
  }

  void _verificar(String actor, int revision) {
    if (!vigente(revision) || _uid() != actor) {
      throw const ErrorRoles('sesion-cambiada');
    }
  }

  Future<Object?> _remoto(String nombre, Map<String, Object?> p) async =>
      (_llamar != null
              ? _llamar(nombre, p)
              : _functions(region)
                    .httpsCallable(nombre)
                    .call<Object?>(p)
                    .then((r) => r.data))
          .timeout(tiempoEspera);

  Future<ContextoCambioRol> obtenerContexto(
    String iglesia,
    String objetivo,
  ) async {
    final actor = _identidad();
    final r = _revision;
    if (!idRolValido(iglesia) || !idRolValido(objetivo, 128)) {
      throw const ErrorRoles('invalid-argument');
    }
    final respuesta = await _remoto('obtenerContextoCambioRolMiembro', {
      'iglesiaId': iglesia,
      'uidObjetivo': objetivo,
    });
    _verificar(actor, r);
    try {
      final d = Map<String, Object?>.from(respuesta as Map);
      if (d.length != 4) throw const FormatException();
      final c = ContextoCambioRol(
        d['rolActual'] as String,
        d['pertenenciaId'] as String,
        d['versionPerfilEsperada'] as String,
        d['versionIglesiaEsperada'] as String,
      );
      if (!c.valido) throw const FormatException();
      return c;
    } catch (_) {
      throw const ErrorRoles('respuesta-invalida');
    }
  }

  Future<SolicitudRol?> recuperar(String objetivo) async {
    final actor = _identidad();
    final r = _revision;
    final s = await _persistencia.recuperar(actor, objetivo);
    _verificar(actor, r);
    return s;
  }

  Future<void> cambiar(
    String iglesia,
    String objetivo,
    ContextoCambioRol contexto,
    String rol, {
    required bool confirmado,
  }) async {
    final actor = _identidad();
    final r = _revision;
    final k = RolesPendienteService.clave(actor, objetivo);
    if (!_ocupadas.add(k)) throw const ErrorRoles('operacion-en-curso');
    try {
      final s = await _persistencia.preparar(
        actor,
        iglesia,
        objetivo,
        contexto,
        rol,
        confirmado: confirmado,
      );
      _verificar(actor, r);
      await _enviar(s, actor, r, primerIntento: true);
    } finally {
      _ocupadas.remove(k);
    }
  }

  Future<void> reintentar(String objetivo) async {
    final actor = _identidad();
    final r = _revision;
    final k = RolesPendienteService.clave(actor, objetivo);
    if (!_ocupadas.add(k)) throw const ErrorRoles('operacion-en-curso');
    try {
      final s = await _persistencia.recuperar(actor, objetivo);
      _verificar(actor, r);
      if (s == null || s.estado != EstadoSolicitudRol.incierta) {
        throw const ErrorRoles('sin-solicitud-incierta');
      }
      await _enviar(s, actor, r);
    } finally {
      _ocupadas.remove(k);
    }
  }

  Future<void> _enviar(
    SolicitudRol s,
    String actor,
    int r, {
    bool primerIntento = false,
  }) async {
    // Confirma persistencia también antes de cada reintento, sin otra clave.
    await _persistencia.marcar(s, EstadoSolicitudRol.incierta);
    _verificar(actor, r);
    try {
      final d = await _remoto('actualizarRolMiembro', s.parametros);
      _verificar(actor, r);
      if (d is! Map ||
          d.length != 2 ||
          d['estado'] != 'CONFIRMADA' ||
          d['huboCambio'] is! bool) {
        throw const ErrorRoles('resultado-incierto');
      }
    } on FirebaseFunctionsException catch (e) {
      _verificar(actor, r);
      if (const [
        'aborted',
        'invalid-argument',
        'permission-denied',
        'failed-precondition',
        'not-found',
        'unauthenticated',
      ].contains(e.code)) {
        // Un rechazo del reintento (p. ej. Auth antes del handler) no demuestra
        // que el envío anterior incierto nunca se confirmó. Solo CONFIRMADA
        // resuelve esa incertidumbre; conservar payload y clave en otro caso.
        if (primerIntento) {
          await _persistencia.marcar(s, EstadoSolicitudRol.rechazada);
        }
        _verificar(actor, r);
        throw ErrorRoles(e.code);
      }
      throw const ErrorRoles('resultado-incierto');
    } on TimeoutException {
      throw const ErrorRoles('resultado-incierto');
    }
    // Si falla esta escritura, la clave original sigue recuperable; nunca otra intención automática.
    await _persistencia.marcar(s, EstadoSolicitudRol.confirmada);
    _verificar(actor, r);
  }

  @override
  void dispose() {
    _cerrado = true;
    _revision++;
    unawaited(_sesion?.cancel());
    super.dispose();
  }
}
