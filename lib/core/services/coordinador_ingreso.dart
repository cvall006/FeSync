import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../models/resultado_ingreso.dart';
import 'ingreso_pendiente_service.dart';

typedef LlamarIngreso = Future<Object?> Function(
  String nombre,
  Map<String, Object?> datos,
);
typedef LeerPerfilIngreso = Future<Map<String, dynamic>?> Function(String uid);

/// Los perfiles protegidos requieren recibos. El backend legacy se reconcilia
/// por pertenencia actual, sin inventar recibos ni generaciones de pertenencia.
/// Un único coordinador por sesión/isolate. Las pantallas y RootGate observan la
/// misma instancia. Nunca interpreta ausencia local/remota como permiso para reingresar.
class CoordinadorIngreso extends ChangeNotifier {
  CoordinadorIngreso({
    required this.uidActual,
    required this.llamar,
    required this.leerPerfilServidor,
    IngresoPendienteService? persistencia,
  }) : persistencia = persistencia ?? IngresoPendienteService();

  final String? Function() uidActual;
  final LlamarIngreso llamar;
  final LeerPerfilIngreso leerPerfilServidor;
  final IngresoPendienteService persistencia;
  String? _uid;
  int _revision = 0;
  bool _inicializado = false;
  bool _ocupado = false;
  Future<void>? _restauracion;
  SolicitudIngresoPendiente? _solicitud;
  ResultadoIngreso? _resultado;
  String? _iglesiaConfirmada;
  String? _periodoConfirmado;

  String? get uid => _uid;
  bool get inicializado => _inicializado;
  bool get ocupado => _ocupado;
  SolicitudIngresoPendiente? get solicitud => _solicitud;
  ResultadoIngreso? get resultado => _resultado;
  bool get bloqueaDashboard =>
      !_inicializado ||
      _ocupado ||
      (_resultado != null && !_resultado!.confirmado);

  bool permitePerfil(String uid, String iglesiaId, String? pertenenciaId) =>
      uidActual() == uid &&
      _uid == uid &&
      !bloqueaDashboard &&
      (_solicitud == null ||
          (_iglesiaConfirmada == iglesiaId &&
              _periodoConfirmado == pertenenciaId));

  void cambiarSesion(String? nuevoUid) {
    if (_uid == nuevoUid && (_inicializado || _restauracion != null)) {
      return;
    }
    _revision++;
    _uid = nuevoUid;
    _solicitud = null;
    _resultado = null;
    _iglesiaConfirmada = null;
    _periodoConfirmado = null;
    _ocupado = false;
    _restauracion = null;
    _inicializado = nuevoUid == null;
    notifyListeners();
  }

  bool _vigente(int revision, String uid) =>
      revision == _revision && uidActual() == uid && _uid == uid;

  void _publicar(ResultadoIngreso resultado) {
    _resultado = resultado;
    notifyListeners();
  }

  Future<void> prepararSesion() {
    final actual = uidActual();
    if (_uid != actual) cambiarSesion(actual);
    if (_inicializado || actual == null) {
      return Future.value();
    }
    return _restauracion ??= _restaurar(actual, _revision);
  }

  Future<void> _restaurar(String uid, int revision) async {
    try {
      final guardada = await persistencia.recuperar(uid);
      if (!_vigente(revision, uid)) {
        return;
      }
      _solicitud = guardada;
      _inicializado = true;
      if (guardada != null) {
        _resultado = const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'Hay una operación guardada. Recupera su estado antes de continuar.',
        );
      }
      notifyListeners();
      if (guardada?.estado == EstadoIngresoPendiente.confirmada ||
          guardada?.estado == EstadoIngresoPendiente.pertenenciaLegacy) {
        await reconciliar();
      }
    } catch (_) {
      if (!_vigente(revision, uid)) {
        return;
      }
      _inicializado = true;
      _publicar(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'No se pudo recuperar el almacenamiento. No se enviará una solicitud nueva.',
        ),
      );
    }
  }

  static String huella(Map<String, Object?> parametros) {
    final claves = parametros.keys.toList()..sort();
    return sha256
        .convert(
          utf8.encode(
            jsonEncode([
              for (final clave in claves) [clave, parametros[clave]],
            ]),
          ),
        )
        .toString();
  }

  static const _sesionCambio = ResultadoIngreso(
    EstadoResultadoIngreso.requiereReconciliacion,
    'La sesión cambió. La operación anterior no se reutilizará.',
  );

  Future<ResultadoIngreso> ingresar(
    TipoIngresoPendiente tipo,
    Map<String, Object?> parametros, {
    bool nuevaIntencionConfirmada = false,
  }) async {
    final usuario = uidActual();
    final preparacion = prepararSesion();
    final revisionPreparada = _revision;
    await preparacion;
    if (usuario == null || !_vigente(revisionPreparada, usuario)) {
      return _sesionCambio;
    }
    if (_ocupado) {
      return const ResultadoIngreso(
        EstadoResultadoIngreso.requiereDecision,
        'Hay una operación en curso.',
      );
    }
    final existente = _solicitud;
    if (existente != null &&
        !existente.estado.sinResolver &&
        (existente.estado == EstadoIngresoPendiente.confirmada ||
            _resultado?.estado ==
                EstadoResultadoIngreso.requiereReconciliacion)) {
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'Recupera la operación original antes de iniciar otra intención.',
        ),
      );
    }
    if (existente != null &&
        existente.estado.sinResolver &&
        (existente.tipo != tipo || existente.huella != huella(parametros))) {
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereDecision,
          'Los datos no coinciden con la intención pendiente. Recupérala antes de cambiar de intención.',
        ),
      );
    }
    if ((existente == null || !existente.estado.sinResolver) &&
        !nuevaIntencionConfirmada) {
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereDecision,
          'Confirma explícitamente una nueva intención.',
        ),
      );
    }
    final revision = _revision;
    _ocupado = true;
    _iglesiaConfirmada = null;
    _periodoConfirmado = null;
    notifyListeners();
    try {
      final pendiente = await persistencia.crearORecuperar(
        uid: usuario,
        tipo: tipo,
        huella: huella(parametros),
        nuevaIntencionConfirmada: nuevaIntencionConfirmada,
      );
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      final primerEnvio = pendiente.estado == EstadoIngresoPendiente.pendiente;
      _solicitud = pendiente;
      // Persistir incertidumbre ANTES de enviar: un cierre durante la llamada
      // no debe convertir una operación enviada en una intención descartable.
      final enviada = await persistencia.marcarIncierta(
        usuario,
        pendiente.solicitudId,
      );
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      _solicitud = enviada;
      try {
        final respuesta = await llamar(
          tipo == TipoIngresoPendiente.vinculacion
              ? 'vincularUsuarioConCodigo'
              : 'registrarNuevaIglesiaSegura',
          {...parametros, 'solicitudId': pendiente.solicitudId},
        );
        if (!_vigente(revision, usuario)) {
          return _sesionCambio;
        }
        if (respuesta is! Map ||
            respuesta['ok'] != true ||
            respuesta['iglesiaId'] is! String) {
          throw const FormatException();
        }
        // Incluso el éxito remoto se reconcilia antes de permitir navegación.
        return await _consultar(
          usuario,
          revision,
          iglesiaRespuesta: respuesta['iglesiaId'] as String,
        );
      } on FirebaseFunctionsException catch (error) {
        if (!_vigente(revision, usuario)) {
          return _sesionCambio;
        }
        if ([
          'not-found',
          'already-exists',
          'permission-denied',
          'unauthenticated',
        ].contains(error.code)) {
          // Rechazar este reintento no demuestra que el envío anterior no
          // confirmó. Conservar la clave incierta, también tras un reinicio.
          if (!primerEnvio) {
            return _establecer(
              const ResultadoIngreso(
                EstadoResultadoIngreso.requiereReconciliacion,
                'Recupera la operación original antes de continuar.',
              ),
            );
          }
          final rechazada = await persistencia.marcarRechazada(
            usuario,
            pendiente.solicitudId,
          );
          if (!_vigente(revision, usuario)) {
            return _sesionCambio;
          }
          _solicitud = rechazada;
          return _establecer(
            const ResultadoIngreso(
              EstadoResultadoIngreso.rechazado,
              'La solicitud fue rechazada. Revisa los datos antes de iniciar otra intención.',
            ),
          );
        }
        if (['failed-precondition', 'invalid-argument'].contains(error.code)) {
          return _establecer(
            const ResultadoIngreso(
              EstadoResultadoIngreso.requiereReconciliacion,
              'Recupera la operación original antes de continuar.',
            ),
          );
        }
        return _establecer(
          const ResultadoIngreso(
            EstadoResultadoIngreso.incierto,
            'No se conoce el resultado. Puedes recuperar el estado o reintentar la misma solicitud.',
          ),
        );
      } catch (_) {
        if (!_vigente(revision, usuario)) {
          return _sesionCambio;
        }
        return _establecer(
          const ResultadoIngreso(
            EstadoResultadoIngreso.incierto,
            'No se pudo confirmar el resultado. Conservamos la solicitud original.',
          ),
        );
      }
    } on ErrorIngresoPendiente {
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'No se puede preparar esta intención. Recupera la anterior o resuelve los datos pendientes.',
        ),
      );
    } finally {
      if (_vigente(revision, usuario)) {
        _ocupado = false;
        notifyListeners();
      }
    }
  }

  ResultadoIngreso _establecer(ResultadoIngreso resultado) {
    _publicar(resultado);
    return resultado;
  }

  Future<ResultadoIngreso> reconciliar() async {
    final usuario = uidActual();
    if (usuario == null || usuario != _uid) {
      return _sesionCambio;
    }
    if (_ocupado) {
      return const ResultadoIngreso(
        EstadoResultadoIngreso.requiereDecision,
        'Hay una operación en curso.',
      );
    }
    final revision = _revision;
    _ocupado = true;
    _iglesiaConfirmada = null;
    _periodoConfirmado = null;
    notifyListeners();
    try {
      final guardada =
          _solicitud ?? await persistencia.recuperarParaReconciliar(usuario);
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      _solicitud = guardada;
      return await _consultar(usuario, revision);
    } catch (_) {
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'No se pudo recuperar la operación. No se creará una solicitud diferente.',
        ),
      );
    } finally {
      if (_vigente(revision, usuario)) {
        _ocupado = false;
        notifyListeners();
      }
    }
  }

  Future<ResultadoIngreso> _consultar(
    String usuario,
    int revision, {
    String? iglesiaRespuesta,
  }) async {
    final original = _solicitud;
    if (original == null || original.uid != usuario) {
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'No se pudo recuperar la identidad original. Se necesita revisión antes de continuar.',
        ),
      );
    }
    try {
      // Dos lecturas servidor enmarcan la consulta. Un ID renovado por período
      // detecta cambios entre consulta y perfil; iglesiaId por sí solo no basta.
      final antes = await leerPerfilServidor(usuario);
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      final respuesta = await llamar('consultarEstadoSolicitudIngreso', {
        'solicitudId': original.solicitudId,
        'tipo': original.tipo == TipoIngresoPendiente.vinculacion
            ? 'vincular'
            : 'crear',
      });
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      if (respuesta is! Map) {
        throw const FormatException();
      }
      if (respuesta['estado'] == 'NO_VERIFICABLE' &&
          original.estado != EstadoIngresoPendiente.confirmada &&
          antes != null &&
          !antes.containsKey('pertenenciaId')) {
        final despues = await leerPerfilServidor(usuario);
        if (!_vigente(revision, usuario)) return _sesionCambio;
        final iglesia = antes['iglesiaId'];
        final rol = antes['rolGlobal'];
        if (despues != null &&
            !despues.containsKey('pertenenciaId') &&
            iglesia is String &&
            iglesia.isNotEmpty &&
            (iglesiaRespuesta == null || iglesiaRespuesta == iglesia) &&
            ['servidor', 'lider_area', 'admin_iglesia'].contains(rol) &&
            despues['iglesiaId'] == iglesia &&
            despues['rolGlobal'] == rol) {
          final observada = await persistencia.guardarPertenenciaLegacy(
            usuario,
            original.solicitudId,
          );
          if (!_vigente(revision, usuario)) return _sesionCambio;
          _solicitud = observada;
          _iglesiaConfirmada = iglesia;
          _periodoConfirmado = null;
          return _establecer(
            const ResultadoIngreso(
              EstadoResultadoIngreso.confirmado,
              'Pertenencia actual verificada. El ingreso antiguo no emite recibo.',
            ),
          );
        }
        if (original.estado == EstadoIngresoPendiente.pertenenciaLegacy &&
            despues != null &&
            !despues.containsKey('pertenenciaId') &&
            antes['iglesiaId'] == null &&
            despues['iglesiaId'] == null &&
            antes['rolGlobal'] == null &&
            despues['rolGlobal'] == null) {
          final resuelta = await persistencia.guardarReconciliacion(
            usuario,
            original.solicitudId,
            vigente: false,
          );
          if (!_vigente(revision, usuario)) return _sesionCambio;
          _solicitud = resuelta;
          return _establecer(
            const ResultadoIngreso(
              EstadoResultadoIngreso.requiereDecision,
              'La pertenencia antigua terminó. Puedes confirmar otro ingreso.',
            ),
          );
        }
      }
      if (respuesta['estado'] == 'CONFIRMADA_NO_VIGENTE') {
        final resuelta = await persistencia.guardarReconciliacion(
          usuario,
          original.solicitudId,
          vigente: false,
        );
        if (!_vigente(revision, usuario)) {
          return _sesionCambio;
        }
        _solicitud = resuelta;
        return _establecer(
          const ResultadoIngreso(
            EstadoResultadoIngreso.requiereDecision,
            'La pertenencia de esa operación terminó. Puedes confirmar una nueva intención.',
          ),
        );
      }
      if (respuesta['estado'] != 'CONFIRMADA_VIGENTE') {
        return _establecer(
          const ResultadoIngreso(
            EstadoResultadoIngreso.requiereReconciliacion,
            'No es posible verificar la operación. No se iniciará otra automáticamente.',
          ),
        );
      }
      final despues = await leerPerfilServidor(usuario);
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      final iglesia = despues?['iglesiaId'];
      final periodo = despues?['pertenenciaId'];
      if (iglesia is! String ||
          iglesia.isEmpty ||
          periodo is! String ||
          !RegExp(r'^[a-f0-9]{64}$').hasMatch(periodo) ||
          antes?['iglesiaId'] != iglesia ||
          antes?['pertenenciaId'] != periodo) {
        return _establecer(
          const ResultadoIngreso(
            EstadoResultadoIngreso.requiereReconciliacion,
            'La pertenencia cambió durante la consulta. Recupera nuevamente su estado.',
          ),
        );
      }
      final confirmada = await persistencia.guardarReconciliacion(
        usuario,
        original.solicitudId,
        vigente: true,
      );
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      _solicitud = confirmada;
      _iglesiaConfirmada = iglesia;
      _periodoConfirmado = periodo;
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.confirmado,
          'Pertenencia confirmada.',
        ),
      );
    } catch (_) {
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereReconciliacion,
          'No se pudo confirmar o guardar la recuperación. Conservamos la identidad original.',
        ),
      );
    }
  }

  Future<ResultadoIngreso> abandonarPendiente({
    required bool confirmadoPorUsuario,
  }) async {
    final usuario = uidActual();
    final original = _solicitud;
    if (_ocupado ||
        usuario == null ||
        original == null ||
        original.uid != usuario) {
      return _sesionCambio;
    }
    final revision = _revision;
    _ocupado = true;
    notifyListeners();
    try {
      final abandonada = await persistencia.abandonar(
        usuario,
        original.solicitudId,
        confirmadoPorUsuario: confirmadoPorUsuario,
      );
      if (!_vigente(revision, usuario)) {
        return _sesionCambio;
      }
      _solicitud = abandonada;
      return _establecer(
        const ResultadoIngreso(
          EstadoResultadoIngreso.requiereDecision,
          'Intención abandonada. Confirma explícitamente la siguiente.',
        ),
      );
    } catch (_) {
      return _vigente(revision, usuario)
          ? _establecer(
              const ResultadoIngreso(
                EstadoResultadoIngreso.requiereReconciliacion,
                'No se puede abandonar: recupera primero su estado.',
              ),
            )
          : _sesionCambio;
    } finally {
      if (_vigente(revision, usuario)) {
        _ocupado = false;
        notifyListeners();
      }
    }
  }
}
