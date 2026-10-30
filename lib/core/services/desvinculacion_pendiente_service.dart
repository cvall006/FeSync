import 'dart:async';
import 'dart:convert';
import 'dart:math';

// Ya usado por el coordinador de ingreso y resuelto en pubspec.lock.
import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'desvinculacion_service.dart';
import 'ingreso_pendiente_service.dart'
    show AlmacenIngresoPendiente, AlmacenSeguroIngresoPendiente;

enum EstadoDesvinculacionPendiente {
  pendiente,
  incierta,
  confirmada,
  bloqueada,
}

class ErrorDesvinculacionPendiente implements Exception {
  const ErrorDesvinculacionPendiente();
  @override
  String toString() =>
      'No se puede continuar con esta solicitud. Recupera la intención original; '
      'no generes otra clave ni borres el registro.';
}

/// Contexto original en memoria: Auth/perfil para una nueva intención, o recibo
/// autenticado verificado contra la huella local para recuperar historia.
/// No es autorización ni se serializa: el almacén conserva solo su huella.
class ContextoDesvinculacion {
  const ContextoDesvinculacion({
    required this.actorUid,
    required this.uidObjetivo,
    required this.iglesiaId,
    required this.accion,
    required this.pertenenciaId,
  });
  final String actorUid;
  final String uidObjetivo;
  final String iglesiaId;
  final AccionDesvinculacion accion;
  final String pertenenciaId;
}

class SolicitudDesvinculacionPendiente {
  const SolicitudDesvinculacionPendiente._(
    this.huella,
    this.solicitudId,
    this.estado,
    this.creadaEn,
    this.actualizadaEn,
  );
  final String huella;
  final String solicitudId;
  final EstadoDesvinculacionPendiente estado;
  final int creadaEn;
  final int actualizadaEn;

  Map<String, Object> _mapa() => {
    'version': 1,
    'huella': huella,
    'solicitudId': solicitudId,
    'estado': estado.name,
    'creadaEn': creadaEn,
    'actualizadaEn': actualizadaEn,
  };
}

class EnvioDesvinculacionPendiente {
  const EnvioDesvinculacionPendiente(this.solicitud, this.resultado);
  final SolicitudDesvinculacionPendiente solicitud;
  final ResultadoDesvinculacion resultado;
}

/// Usa el adaptador secure storage existente (resetOnError:false), sin modificar
/// ingreso ni compartir sus claves. Índice determinista SHA-256 por actor/objetivo;
/// la huella liga además iglesia, acción y período. No guarda el payload completo,
/// UID, nombres, correos, códigos ni tokens. Las huellas NO son autorización ni
/// cifrado: la confidencialidad del valor depende de secure storage.
///
/// recuperar() solo lee localmente y exige contexto. El coordinador puede obtener
/// el contexto histórico desde el recibo autenticado usando solicitudId y comprobar
/// aquí su huella COMPLETA, nonce y slot actor/objetivo antes de confirmarlo.
/// No enumera claves ni descubre una solicitudId perdida. No reconstruye desde
/// huellas ni perfiles actuales. Sin registro local acreditable no hay recuperación.
/// Un cambio del perfil no confirma una expulsión concreta.
///
/// Cola por actor/objetivo compartida entre instancias en UN isolate. Otros objetivos
/// avanzan independientemente. No hay CAS entre procesos, pestañas o dispositivos:
/// usar un solo escritor por almacén. No borrar, aplicar TTL ni reemplazar inciertas
/// o bloqueadas. Ausencia tras reinstalar/restaurar NO prueba ausencia remota; no
/// recuperar automáticamente creando otra clave. Una intención nueva siempre exige
/// decisión explícita. Contextos diferentes no reemplazan operaciones sin resolver.
///
/// Estado incierta se verifica en disco ANTES de cada envío, incluso antes del primer
/// intento: una caída posterior nunca deja una operación enviada como no enviada.
/// Solo una respuesta confirmada marca confirmada; errores posteriores de persistencia
/// bloquean el envío y requieren recuperación explícita de la misma clave.
/// Confirmada es historia local, no prueba de pertenencia actual ni permiso para FCM.
/// No conecta pantallas, RootGate, Firestore o FCM. Backend compatible debe ir primero.
class DesvinculacionPendienteService {
  DesvinculacionPendienteService({
    AlmacenIngresoPendiente? almacen,
    String? Function()? uidActual,
    DesvinculacionService? remoto,
  }) : _almacen = almacen ?? AlmacenSeguroIngresoPendiente(),
       _uidActual = uidActual ?? _uidFirebase,
       _remotoOverride = remoto;

  final AlmacenIngresoPendiente _almacen;
  final String? Function() _uidActual;
  final DesvinculacionService? _remotoOverride;
  late final _remoto =
      _remotoOverride ?? DesvinculacionService(uidActual: _uidActual);
  static String? _uidFirebase() => FirebaseAuth.instance.currentUser?.uid;
  static final _colas = <String, List<Future<void> Function()>>{};
  static final _ocupadas = <String>{};
  static final _bloqueadas = <String>{};

  static void _siguiente(String clave) {
    final cola = _colas[clave];
    if (_ocupadas.contains(clave) || cola == null) return;
    if (cola.isEmpty) {
      _colas.remove(clave);
      return;
    }
    _ocupadas.add(clave);
    unawaited(cola.removeAt(0)());
  }

  static Future<T> _serializar<T>(String clave, Future<T> Function() tarea) {
    final resultado = Completer<T>();
    (_colas[clave] ??= []).add(() async {
      T? valor;
      Object? error;
      StackTrace? traza;
      try {
        valor = await tarea();
      } catch (e, s) {
        error = e;
        traza = s;
      }
      _ocupadas.remove(clave);
      _siguiente(clave);
      if (error != null) {
        resultado.completeError(error, traza);
      } else {
        resultado.complete(valor as T);
      }
    });
    _siguiente(clave);
    return resultado.future;
  }

  static String _hash(List<String> valores) =>
      sha256.convert(utf8.encode(jsonEncode(valores))).toString();
  static String _clave(ContextoDesvinculacion c) =>
      'fesync.desvinculacion.v1.${_hash([c.actorUid, c.uidObjetivo])}';
  static String _huella(ContextoDesvinculacion c) => _hash([
    c.actorUid,
    c.uidObjetivo,
    c.iglesiaId,
    c.accion.name,
    c.pertenenciaId,
  ]);
  static bool _hex(Object? v) =>
      v is String && v.length == 64 && !RegExp(r'[^a-f0-9]').hasMatch(v);
  static bool _id(String v, int limite) =>
      v.trim().isNotEmpty &&
      v.length <= limite &&
      utf8.encode(v).length <= 1500 &&
      !RegExp(r'[/\x00-\x1f\x7f]').hasMatch(v) &&
      v != '.' &&
      v != '..' &&
      !RegExp(r'^__.*__$').hasMatch(v);

  void _validar(ContextoDesvinculacion c) {
    if (!_id(c.actorUid, 128) ||
        !_id(c.uidObjetivo, 128) ||
        !_id(c.iglesiaId, 1500) ||
        !_hex(c.pertenenciaId) ||
        (c.accion == AccionDesvinculacion.salir &&
            c.actorUid != c.uidObjetivo)) {
      throw const ErrorDesvinculacionPendiente();
    }
    try {
      if (_uidActual() != c.actorUid) {
        throw const ErrorDesvinculacionPendiente();
      }
    } catch (_) {
      throw const ErrorDesvinculacionPendiente();
    }
  }

  Future<SolicitudDesvinculacionPendiente?> _leer(
    ContextoDesvinculacion c, {
    bool recuperarTrasError = false,
    bool aceptarOtraHuella = false,
  }) => _leerRegistro(
    _clave(c),
    recuperarTrasError: recuperarTrasError,
    huellaEsperada: aceptarOtraHuella ? null : _huella(c),
  );

  Future<SolicitudDesvinculacionPendiente?> _leerRegistro(
    String clave, {
    bool recuperarTrasError = false,
    String? huellaEsperada,
  }) async {
    if (_bloqueadas.contains(clave) && !recuperarTrasError) {
      throw const ErrorDesvinculacionPendiente();
    }
    SolicitudDesvinculacionPendiente? solicitud;
    try {
      final texto = await _almacen.leer(clave);
      if (texto == null) {
        if (_bloqueadas.contains(clave)) throw const FormatException();
        return null;
      }
      final d = jsonDecode(texto);
      if (d is! Map<String, dynamic> ||
          d.length != 6 ||
          d['version'] != 1 ||
          !_hex(d['huella']) ||
          !_hex(d['solicitudId']) ||
          d['creadaEn'] is! int ||
          d['actualizadaEn'] is! int ||
          d['creadaEn'] < 0 ||
          d['actualizadaEn'] < d['creadaEn']) {
        throw const FormatException();
      }
      solicitud = SolicitudDesvinculacionPendiente._(
        d['huella'],
        d['solicitudId'],
        EstadoDesvinculacionPendiente.values.byName(d['estado'] as String),
        d['creadaEn'],
        d['actualizadaEn'],
      );
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorDesvinculacionPendiente();
    }
    if (huellaEsperada != null && solicitud.huella != huellaEsperada) {
      throw const ErrorDesvinculacionPendiente();
    }
    return solicitud;
  }

  /// Descubre SOLO el registro actor=objetivo. No infiere acción, iglesia ni
  /// período desde el perfil; requiere recuperar el recibo y verificar su huella
  /// antes de aceptar contexto o éxito. No enumera ni genera intenciones.
  Future<SolicitudDesvinculacionPendiente?> recuperarSalidaPropia(String uid) {
    final clave = 'fesync.desvinculacion.v1.${_hash([uid, uid])}';
    return _serializar(clave, () async {
      void verificar() {
        try {
          if (!_id(uid, 128) || _uidActual() != uid) {
            throw const ErrorDesvinculacionPendiente();
          }
        } catch (_) {
          throw const ErrorDesvinculacionPendiente();
        }
      }

      verificar();
      final solicitud = await _leerRegistro(clave, recuperarTrasError: true);
      verificar();
      return solicitud;
    });
  }

  Future<SolicitudDesvinculacionPendiente> _guardar(
    ContextoDesvinculacion c,
    SolicitudDesvinculacionPendiente s,
  ) async {
    final clave = _clave(c);
    final texto = jsonEncode(s._mapa());
    try {
      await _almacen.escribir(clave, texto);
      if (await _almacen.leer(clave) != texto) throw const FormatException();
      return s;
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorDesvinculacionPendiente();
    }
  }

  Future<SolicitudDesvinculacionPendiente?> recuperar(
    ContextoDesvinculacion contexto, {
    bool recuperarTrasError = false,
  }) => _serializar(_clave(contexto), () async {
    _validar(contexto);
    return _leer(contexto, recuperarTrasError: recuperarTrasError);
  });

  Future<SolicitudDesvinculacionPendiente> preparar({
    required ContextoDesvinculacion contexto,
    required bool decisionConfirmada,
  }) => _serializar(_clave(contexto), () async {
    _validar(contexto);
    // Solo una confirmada puede dar paso a otro contexto tras decisión explícita.
    // Para detectar un cambio de contexto se inspecciona sin reemplazar el registro.
    final anterior = await _leer(contexto, aceptarOtraHuella: true);
    if (anterior != null) {
      if (anterior.huella == _huella(contexto)) return anterior;
      if (anterior.estado != EstadoDesvinculacionPendiente.confirmada ||
          !decisionConfirmada) {
        throw const ErrorDesvinculacionPendiente();
      }
    }
    if (!decisionConfirmada) throw const ErrorDesvinculacionPendiente();
    return _guardar(contexto, _nueva(contexto));
  });

  static SolicitudDesvinculacionPendiente _nueva(
    ContextoDesvinculacion contexto,
  ) {
    final random = Random.secure();
    final id = List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final ahora = DateTime.now().toUtc().millisecondsSinceEpoch;
    return SolicitudDesvinculacionPendiente._(
      _huella(contexto),
      id,
      EstadoDesvinculacionPendiente.pendiente,
      ahora,
      ahora,
    );
  }

  static String _indiceActor(String uid) =>
      'fesync.expulsiones.v1.${_hash([uid])}';
  static const maximoExpulsiones = 64;

  void _validarActor(String uid) {
    try {
      if (!_id(uid, 128) || _uidActual() != uid) {
        throw const ErrorDesvinculacionPendiente();
      }
    } catch (_) {
      throw const ErrorDesvinculacionPendiente();
    }
  }

  Future<List<String>> _leerIndice(String uid) async {
    final clave = _indiceActor(uid);
    try {
      final texto = await _almacen.leer(clave);
      if (texto == null) {
        if (_bloqueadas.contains(clave)) throw const FormatException();
        return [];
      }
      final d = jsonDecode(texto);
      if (d is! Map ||
          d.length != 3 ||
          d['version'] != 1 ||
          d['actorHash'] != _hash([uid]) ||
          d['registros'] is! List) {
        throw const FormatException();
      }
      final lista = d['registros'] as List;
      if (lista.length > maximoExpulsiones ||
          lista.toSet().length != lista.length ||
          lista.any(
            (e) =>
                e is! String ||
                !e.startsWith('fesync.desvinculacion.v1.') ||
                !_hex(e.substring('fesync.desvinculacion.v1.'.length)),
          )) {
        throw const FormatException();
      }
      return lista.cast<String>();
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorDesvinculacionPendiente();
    }
  }

  Future<void> _guardarIndice(String uid, List<String> registros) async {
    final clave = _indiceActor(uid);
    final texto = jsonEncode({
      'version': 1,
      'actorHash': _hash([uid]),
      'registros': registros,
    });
    try {
      await _almacen.escribir(clave, texto);
      if (await _almacen.leer(clave) != texto) throw const FormatException();
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorDesvinculacionPendiente();
    }
  }

  /// Índice de referencias opacas, NO fuente de autorización. Reserva verificada
  /// ANTES del registro/enviar. Una reserva sin registro se bloquea: nunca se
  /// supone que no hubo envío ni se genera otra clave tras un fallo incierto.
  /// Solo serializa persistencia local por actor; envíos de objetivos distintos
  /// siguen siendo independientes. Máximo 64; al llenarse poda solo confirmadas.
  /// Los registros antiguos sin índice no se pueden enumerar con este adaptador.
  Future<SolicitudDesvinculacionPendiente> prepararExpulsionRecuperable({
    required ContextoDesvinculacion contexto,
    required bool decisionConfirmada,
  }) => _serializar(
    _indiceActor(contexto.actorUid),
    () => _serializar(_clave(contexto), () async {
      _validar(contexto);
      if (contexto.accion != AccionDesvinculacion.expulsar ||
          !decisionConfirmada ||
          contexto.actorUid == contexto.uidObjetivo ||
          _bloqueadas.contains(_indiceActor(contexto.actorUid))) {
        throw const ErrorDesvinculacionPendiente();
      }
      final registros = await _leerIndice(contexto.actorUid);
      final anterior = await _leer(
        contexto,
        recuperarTrasError: true,
        aceptarOtraHuella: true,
      );
      _validar(contexto);
      final clave = _clave(contexto);
      if (registros.contains(clave) && anterior == null) {
        throw const ErrorDesvinculacionPendiente();
      }
      if (anterior != null &&
          anterior.huella != _huella(contexto) &&
          anterior.estado != EstadoDesvinculacionPendiente.confirmada) {
        throw const ErrorDesvinculacionPendiente();
      }
      if (!registros.contains(clave)) {
        if (registros.length == maximoExpulsiones) {
          final confirmadas = <String>[];
          for (final r in registros) {
            final s = await _leerRegistro(r, recuperarTrasError: true);
            if (s == null) throw const ErrorDesvinculacionPendiente();
            if (s.estado == EstadoDesvinculacionPendiente.confirmada) {
              confirmadas.add(r);
            }
          }
          registros.removeWhere(confirmadas.contains);
        }
        if (registros.length >= maximoExpulsiones) {
          throw const ErrorDesvinculacionPendiente();
        }
        registros.add(clave);
        await _guardarIndice(contexto.actorUid, registros);
      }
      _validar(contexto);
      if (anterior != null && anterior.huella == _huella(contexto)) {
        return anterior;
      }
      return _guardar(contexto, _nueva(contexto));
    }),
  );

  /// Local solamente. Recupera nonces sin conocer objetivos; cada contexto deberá
  /// proceder del recibo propio autenticado y coincidir con la huella del registro.
  /// No consulta perfiles, no borra inciertas ni repara corrupción automáticamente.
  Future<List<SolicitudDesvinculacionPendiente>> recuperarExpulsionesActor(
    String uid,
  ) => _serializar(_indiceActor(uid), () async {
    _validarActor(uid);
    final registros = await _leerIndice(uid);
    final solicitudes = <SolicitudDesvinculacionPendiente>[];
    for (final clave in registros) {
      final s = await _serializar(
        clave,
        () => _leerRegistro(clave, recuperarTrasError: true),
      );
      if (s == null) throw const ErrorDesvinculacionPendiente();
      solicitudes.add(s);
    }
    _validarActor(uid);
    if (solicitudes.map((s) => s.solicitudId).toSet().length !=
        solicitudes.length) {
      throw const ErrorDesvinculacionPendiente();
    }
    _bloqueadas.remove(_indiceActor(uid));
    return List.unmodifiable(solicitudes);
  });

  Future<EnvioDesvinculacionPendiente> enviar({
    required ContextoDesvinculacion contexto,
    required String solicitudId,
    bool recuperarTrasError = false,
    bool Function()? sesionVigente,
  }) => _serializar(_clave(contexto), () async {
    void verificarSesion() {
      _validar(contexto);
      if (sesionVigente != null && !sesionVigente()) {
        throw const ErrorDesvinculacionPendiente();
      }
    }

    verificarSesion();
    final anterior = await _leer(
      contexto,
      recuperarTrasError: recuperarTrasError,
    );
    verificarSesion();
    if (anterior == null || anterior.solicitudId != solicitudId) {
      throw const ErrorDesvinculacionPendiente();
    }
    if (anterior.estado == EstadoDesvinculacionPendiente.confirmada) {
      if (recuperarTrasError) {
        await _guardar(contexto, anterior);
        _bloqueadas.remove(_clave(contexto));
      }
      return EnvioDesvinculacionPendiente(
        anterior,
        const ResultadoDesvinculacion(
          EstadoDesvinculacion.confirmado,
          'confirmacion-local-previa',
        ),
      );
    }
    SolicitudDesvinculacionPendiente conEstado(
      EstadoDesvinculacionPendiente estado,
    ) => SolicitudDesvinculacionPendiente._(
      anterior.huella,
      solicitudId,
      estado,
      anterior.creadaEn,
      max(
        anterior.actualizadaEn,
        DateTime.now().toUtc().millisecondsSinceEpoch,
      ),
    );
    await _guardar(contexto, conEstado(EstadoDesvinculacionPendiente.incierta));
    verificarSesion(); // Incluye cambios A -> B -> A informados al coordinador.
    ResultadoDesvinculacion resultado;
    try {
      resultado = await _remoto.desvincular(
        iglesiaId: contexto.iglesiaId,
        uidObjetivo: contexto.uidObjetivo,
        accion: contexto.accion,
        pertenenciaId: contexto.pertenenciaId,
        solicitudId: solicitudId,
      );
      verificarSesion();
    } catch (_) {
      resultado = const ResultadoDesvinculacion(
        EstadoDesvinculacion.incierto,
        'resultado-no-confirmado',
      );
    }
    final estado = resultado.confirmado
        ? EstadoDesvinculacionPendiente.confirmada
        : anterior.estado != EstadoDesvinculacionPendiente.incierta &&
              resultado.estado == EstadoDesvinculacion.rechazado
        ? EstadoDesvinculacionPendiente.bloqueada
        : EstadoDesvinculacionPendiente.incierta;
    final guardada = await _guardar(contexto, conEstado(estado));
    if (recuperarTrasError) _bloqueadas.remove(_clave(contexto));
    return EnvioDesvinculacionPendiente(guardada, resultado);
  });

  /// Confirma SOLO sobre un registro ya existente cuyo slot, huella completa y
  /// solicitud coinciden. Nunca crea ni reemplaza una intención desde el servidor.
  /// Conserva únicamente la confirmación asociada, sin persistir el contexto.
  Future<ContextoDesvinculacion> confirmarContextoRecuperado({
    required ContextoRecuperadoDesvinculacion recuperado,
    required bool Function() sesionVigente,
  }) async {
    final contexto = ContextoDesvinculacion(
      actorUid: recuperado.actorUid,
      uidObjetivo: recuperado.uidObjetivo,
      iglesiaId: recuperado.iglesiaId,
      accion: recuperado.accion,
      pertenenciaId: recuperado.pertenenciaId,
    );
    await guardarConfirmacionConsulta(
      contexto: contexto,
      solicitudId: recuperado.solicitudId,
      estado: EstadoReciboDesvinculacion.confirmadaEstadoActualNoVerificable,
      sesionVigente: sesionVigente,
    );
    return contexto;
  }

  /// Solo después de una consulta tipada que acredita el recibo original. No
  /// consulta al servidor ni infiere éxito desde perfiles. Conserva nonce/huella;
  /// confirma escritura+lectura antes de liberar un bloqueo local de almacenamiento.
  Future<SolicitudDesvinculacionPendiente> guardarConfirmacionConsulta({
    required ContextoDesvinculacion contexto,
    required String solicitudId,
    required EstadoReciboDesvinculacion estado,
    required bool Function() sesionVigente,
  }) => _serializar(_clave(contexto), () async {
    void verificar() {
      _validar(contexto);
      if (!sesionVigente() ||
          estado == EstadoReciboDesvinculacion.noVerificable) {
        throw const ErrorDesvinculacionPendiente();
      }
    }

    verificar();
    final anterior = await _leer(contexto, recuperarTrasError: true);
    verificar();
    if (anterior == null || anterior.solicitudId != solicitudId) {
      throw const ErrorDesvinculacionPendiente();
    }
    final guardada = await _guardar(
      contexto,
      SolicitudDesvinculacionPendiente._(
        anterior.huella,
        solicitudId,
        EstadoDesvinculacionPendiente.confirmada,
        anterior.creadaEn,
        max(
          anterior.actualizadaEn,
          DateTime.now().toUtc().millisecondsSinceEpoch,
        ),
      ),
    );
    verificar();
    _bloqueadas.remove(_clave(contexto));
    return guardada;
  });
}
