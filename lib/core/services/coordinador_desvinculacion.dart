import 'dart:async';
import 'dart:convert';

import 'desvinculacion_pendiente_service.dart';
import 'desvinculacion_service.dart';

enum EstadoCoordinacionDesvinculacion {
  confirmada,
  incierta,
  rechazada,
  transitoria,
  bloqueadaRecuperable,
  noVerificable,
}

class ResultadoCoordinacionDesvinculacion {
  const ResultadoCoordinacionDesvinculacion(
    this.estado,
    this.codigo, {
    this.recibo,
    this.contextoRecuperado,
  });
  final EstadoCoordinacionDesvinculacion estado;
  final String codigo;
  final EstadoReciboDesvinculacion? recibo;

  /// Solo en RAM, para reconciliar el estado actual con el contrato original.
  /// No es permiso de navegación ni debe registrarse en logs.
  final ContextoDesvinculacion? contextoRecuperado;
}

/// Coordinación aislada: no navega, no limpia FCM ni lee/escribe perfiles.
/// iniciar/reintentar/reconciliar usan contexto original. recuperarContexto usa
/// SOLO la solicitudId conservada y el recibo propio; exige coincidencia completa
/// con el registro local antes de guardar confirmación. No enumera solicitudes ni
/// descubre claves perdidas; ausencia remota no permite otra intención automática.
///
/// uidActual y cambiosSesion deben proceder de LA MISMA fuente Auth usada por
/// los servicios inyectados (authStateChanges().map((u) => u?.uid)). El stream
/// permite invalidar también A -> B -> A mientras espera una operación.
/// Cancelar mediante dispose al terminar su ciclo de vida. Resultados de sesiones
/// previas no se publican; sus recibos/registros históricos no se eliminan.
///
/// Exclusión por actor/objetivo entre instancias en UN isolate, sin bloqueo global
/// del administrador. No garantiza exclusión entre procesos/pestañas/dispositivos.
/// Los CONFIRMADA_* son historia, NO permisos ni autorización para navegación.
/// Backend, migración, cierre de rutas cliente y compatibilidad siguen pendientes.
class CoordinadorDesvinculacion {
  CoordinadorDesvinculacion({
    required this.uidActual,
    required Stream<String?> cambiosSesion,
    required this.persistencia,
    required this.remoto,
  }) {
    _uidSesion = uidActual();
    _suscripcion = cambiosSesion.listen(
      (uid) {
        if (uid != _uidSesion) {
          _revision++;
          _uidSesion = uid;
        }
      },
      onError: (Object _) {
        _revision++;
        _uidSesion = null;
      },
      onDone: () {
        _revision++;
        _uidSesion = null;
      },
    );
  }
  final String? Function() uidActual;
  final DesvinculacionPendienteService persistencia;
  final DesvinculacionService remoto;
  late final StreamSubscription<String?> _suscripcion;
  String? _uidSesion;
  int _revision = 0;
  bool _cerrado = false;
  static final _enCurso = <String>{};
  static final _recuperaciones = <String>{};

  Future<void> dispose() async {
    _cerrado = true;
    _revision++;
    await _suscripcion.cancel();
  }

  bool _vigente(int revision, ContextoDesvinculacion c) {
    return _sesionVigente(revision, c.actorUid);
  }

  bool _sesionVigente(int revision, String actor) {
    try {
      return !_cerrado &&
          revision == _revision &&
          _uidSesion == actor &&
          uidActual() == actor;
    } catch (_) {
      return false;
    }
  }

  static ResultadoCoordinacionDesvinculacion _bloqueo(String codigo) =>
      ResultadoCoordinacionDesvinculacion(
        EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
        codigo,
      );
  static ResultadoCoordinacionDesvinculacion _desdeResultado(
    ResultadoDesvinculacion r,
  ) => ResultadoCoordinacionDesvinculacion(switch (r.estado) {
    EstadoDesvinculacion.confirmado =>
      EstadoCoordinacionDesvinculacion.confirmada,
    EstadoDesvinculacion.rechazado =>
      EstadoCoordinacionDesvinculacion.rechazada,
    EstadoDesvinculacion.transitorio =>
      EstadoCoordinacionDesvinculacion.transitoria,
    EstadoDesvinculacion.incierto => EstadoCoordinacionDesvinculacion.incierta,
    EstadoDesvinculacion.migracionRequerida =>
      EstadoCoordinacionDesvinculacion.bloqueadaRecuperable,
  }, r.codigo);

  Future<ResultadoCoordinacionDesvinculacion> _operar(
    ContextoDesvinculacion? c,
    Future<ResultadoCoordinacionDesvinculacion> Function(int revision) accion,
  ) async {
    if (c == null) return _bloqueo('contexto-original-requerido');
    final revision = _revision;
    if (!_vigente(revision, c)) return _bloqueo('sesion-no-vigente');
    final clave = jsonEncode([
      c.actorUid,
      c.uidObjetivo,
    ]); // Solo en RAM; nunca logs.
    if (!_enCurso.add(clave)) return _bloqueo('operacion-en-curso');
    try {
      final resultado = await accion(revision);
      return _vigente(revision, c) ? resultado : _bloqueo('sesion-cambiada');
    } catch (_) {
      return _bloqueo(
        _vigente(revision, c)
            ? 'contexto-o-almacenamiento-no-verificable'
            : 'sesion-cambiada',
      );
    } finally {
      _enCurso.remove(clave);
    }
  }

  /// Recupera historia confirmada tras reinicio, sin reenviar desvinculación.
  /// solicitudId debe ser la original conservada; sin ella no hay búsqueda global.
  /// El recibo prueba historia, no estado actual: si este último es necesario,
  /// usar reconciliar(contexto: resultado.contextoRecuperado), que conserva sus
  /// cuatro estados. No se infieren permisos de navegación en ninguno de ellos.
  Future<ResultadoCoordinacionDesvinculacion> recuperarContexto({
    required String solicitudId,
  }) async {
    final revision = _revision;
    final actor = _uidSesion;
    if (actor == null || !_sesionVigente(revision, actor)) {
      return _bloqueo('sesion-no-vigente');
    }
    final claveSolicitud = jsonEncode([actor, solicitudId]);
    if (!_recuperaciones.add(claveSolicitud)) {
      return _bloqueo('operacion-en-curso');
    }
    String? claveObjetivo;
    try {
      final recuperacion = await remoto.recuperarContextoSolicitud(
        solicitudId: solicitudId,
      );
      if (!_sesionVigente(revision, actor)) return _bloqueo('sesion-cambiada');
      if (recuperacion.error != null) {
        return _desdeResultado(recuperacion.error!);
      }
      if (recuperacion.estado ==
          EstadoRecuperacionDesvinculacion.reciboAusente) {
        return _bloqueo('recibo-ausente-no-concluyente');
      }
      if (recuperacion.estado != EstadoRecuperacionDesvinculacion.confirmada) {
        return const ResultadoCoordinacionDesvinculacion(
          EstadoCoordinacionDesvinculacion.noVerificable,
          'recibo-no-verificable',
        );
      }
      final recuperado = recuperacion.contexto!;
      if (recuperado.actorUid != actor ||
          recuperado.solicitudId != solicitudId) {
        return _bloqueo('contexto-no-coincidente');
      }
      final clave = jsonEncode([actor, recuperado.uidObjetivo]);
      if (!_enCurso.add(clave)) return _bloqueo('operacion-en-curso');
      claveObjetivo = clave;
      final contexto = await persistencia.confirmarContextoRecuperado(
        recuperado: recuperado,
        sesionVigente: () => _sesionVigente(revision, actor),
      );
      if (!_sesionVigente(revision, actor)) return _bloqueo('sesion-cambiada');
      return ResultadoCoordinacionDesvinculacion(
        EstadoCoordinacionDesvinculacion.confirmada,
        'contexto-original-confirmado',
        recibo: EstadoReciboDesvinculacion.confirmadaEstadoActualNoVerificable,
        contextoRecuperado: contexto,
      );
    } catch (_) {
      return _bloqueo(
        _sesionVigente(revision, actor)
            ? 'contexto-o-almacenamiento-no-verificable'
            : 'sesion-cambiada',
      );
    } finally {
      if (claveObjetivo != null) _enCurso.remove(claveObjetivo);
      _recuperaciones.remove(claveSolicitud);
    }
  }

  Future<ResultadoCoordinacionDesvinculacion> iniciar({
    required ContextoDesvinculacion? contexto,
    required bool decisionConfirmada,
  }) => _operar(contexto, (revision) async {
    final c = contexto!;
    if (!decisionConfirmada) return _bloqueo('decision-explicita-requerida');
    final solicitud = await persistencia.preparar(
      contexto: c,
      decisionConfirmada: true,
    );
    if (!_vigente(revision, c)) return _bloqueo('sesion-cambiada');
    if (solicitud.estado == EstadoDesvinculacionPendiente.incierta ||
        solicitud.estado == EstadoDesvinculacionPendiente.bloqueada) {
      return _bloqueo('solicitud-previa-requiere-recuperacion');
    }
    return _enviar(c, solicitud, revision);
  });

  /// Entrada para Gestión de Miembros: exige índice recuperable confirmado en
  /// disco antes del envío. El callback solo informa persistencia, nunca éxito.
  Future<ResultadoCoordinacionDesvinculacion> iniciarExpulsion({
    required ContextoDesvinculacion contexto,
    required bool decisionConfirmada,
    void Function(SolicitudDesvinculacionPendiente)? alPreparar,
  }) => _operar(contexto, (revision) async {
    if (contexto.accion != AccionDesvinculacion.expulsar ||
        !decisionConfirmada) {
      return _bloqueo('decision-explicita-requerida');
    }
    final solicitud = await persistencia.prepararExpulsionRecuperable(
      contexto: contexto,
      decisionConfirmada: true,
    );
    if (!_vigente(revision, contexto)) return _bloqueo('sesion-cambiada');
    alPreparar?.call(solicitud);
    if (solicitud.estado == EstadoDesvinculacionPendiente.incierta ||
        solicitud.estado == EstadoDesvinculacionPendiente.bloqueada) {
      return _bloqueo('solicitud-previa-requiere-recuperacion');
    }
    return _enviar(contexto, solicitud, revision);
  });

  Future<ResultadoCoordinacionDesvinculacion> reintentar({
    required ContextoDesvinculacion? contexto,
  }) => _operar(contexto, (revision) async {
    final c = contexto!;
    final solicitud = await persistencia.recuperar(c, recuperarTrasError: true);
    if (!_vigente(revision, c)) return _bloqueo('sesion-cambiada');
    if (solicitud == null) return _bloqueo('solicitud-original-no-recuperada');
    return _enviar(c, solicitud, revision);
  });

  Future<ResultadoCoordinacionDesvinculacion> _enviar(
    ContextoDesvinculacion c,
    SolicitudDesvinculacionPendiente solicitud,
    int revision,
  ) async {
    final envio = await persistencia.enviar(
      contexto: c,
      solicitudId: solicitud.solicitudId,
      recuperarTrasError: true,
      sesionVigente: () => _vigente(revision, c),
    );
    return _desdeResultado(envio.resultado);
  }

  Future<ResultadoCoordinacionDesvinculacion> reconciliar({
    required ContextoDesvinculacion? contexto,
  }) => _operar(contexto, (revision) async {
    final c = contexto!;
    final solicitud = await persistencia.recuperar(c, recuperarTrasError: true);
    if (!_vigente(revision, c)) return _bloqueo('sesion-cambiada');
    if (solicitud == null) return _bloqueo('solicitud-original-no-recuperada');
    final consulta = await remoto.consultarEstadoSolicitud(
      iglesiaId: c.iglesiaId,
      uidObjetivo: c.uidObjetivo,
      accion: c.accion,
      pertenenciaId: c.pertenenciaId,
      solicitudId: solicitud.solicitudId,
    );
    if (!_vigente(revision, c)) return _bloqueo('sesion-cambiada');
    if (consulta.error != null) return _desdeResultado(consulta.error!);
    if (consulta.estado == EstadoReciboDesvinculacion.noVerificable) {
      return const ResultadoCoordinacionDesvinculacion(
        EstadoCoordinacionDesvinculacion.noVerificable,
        'recibo-no-verificable',
        recibo: EstadoReciboDesvinculacion.noVerificable,
      );
    }
    await persistencia.guardarConfirmacionConsulta(
      contexto: c,
      solicitudId: solicitud.solicitudId,
      estado: consulta.estado!,
      sesionVigente: () => _vigente(revision, c),
    );
    if (!_vigente(revision, c)) return _bloqueo('sesion-cambiada');
    return ResultadoCoordinacionDesvinculacion(
      EstadoCoordinacionDesvinculacion.confirmada,
      'recibo-confirmado',
      recibo: consulta.estado,
    );
  });
}
