import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class AlmacenIngresoPendiente {
  Future<String?> leer(String clave);
  Future<void> escribir(String clave, String valor);
}

class AlmacenSeguroIngresoPendiente implements AlmacenIngresoPendiente {
  AlmacenSeguroIngresoPendiente({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            // No borrar datos automáticamente ante errores de descifrado.
            aOptions: AndroidOptions(resetOnError: false),
          );

  final FlutterSecureStorage _storage;

  @override
  Future<String?> leer(String clave) => _storage.read(key: clave);

  @override
  Future<void> escribir(String clave, String valor) =>
      _storage.write(key: clave, value: valor);
}

enum TipoIngresoPendiente { vinculacion, creacionIglesia }

enum EstadoIngresoPendiente {
  pendiente,
  incierto,
  confirmada,
  pertenenciaLegacy,
  rechazada,
  abandonada;

  bool get sinResolver => this == pendiente || this == incierto;
}

class ErrorIngresoPendiente implements Exception {
  const ErrorIngresoPendiente(this.mensaje);
  final String mensaje;
  @override
  String toString() => mensaje;
}

class SolicitudIngresoPendiente {
  const SolicitudIngresoPendiente._({
    required this.uid,
    required this.tipo,
    required this.huella,
    required this.solicitudId,
    required this.estado,
    required this.creadaEn,
    required this.actualizadaEn,
  });

  final String uid;
  final TipoIngresoPendiente tipo;
  final String huella;
  final String solicitudId;
  final EstadoIngresoPendiente estado;
  final int creadaEn;
  final int actualizadaEn;

  Map<String, Object> _mapa() => {
    'version': 1,
    'uid': uid,
    'tipo': tipo.name,
    'huella': huella,
    'solicitudId': solicitudId,
    'estado': estado.name,
    'creadaEn': creadaEn,
    'actualizadaEn': actualizadaEn,
  };
}

/// Almacén aislado: no envía solicitudes ni autoriza operaciones Firebase.
/// El integrador debe suministrar el UID de Auth y una huella SHA-256 canónica,
/// nunca el formulario. El valor está cifrado; la clave local codifica el UID
/// para separar cuentas y no debe tratarse como un secreto.
///
/// Serializa llamadas e instancias en UN isolate. No proporciona exclusión entre
/// procesos, isolates o pestañas: la integración deberá mantener un solo escritor
/// por almacén; secure storage no ofrece compare-and-swap transaccional.
///
/// Persistencia perdida, desinstalación, restauración o cambio de dispositivo:
/// ausencia local NO demuestra ausencia de operación en servidor. No recuperar
/// mediante otra clave automáticamente. Reconciliar el estado con servidor y
/// pedir una intención nueva explícita. No exportar estos registros ni aplicar
/// TTL. No hay borrado automático al cerrar sesión ni sincronización de llavero.
/// En web se requiere HTTPS/localhost; almacenamiento borrado o bloqueado y
/// llaveros inaccesibles requieren intervención, nunca fallback sin persistencia.
class IngresoPendienteService {
  IngresoPendienteService({AlmacenIngresoPendiente? almacen})
    : _almacen = almacen ?? AlmacenSeguroIngresoPendiente();

  final AlmacenIngresoPendiente _almacen;
  static final List<Future<void> Function()> _turnos = [];
  static bool _procesando = false;
  // Si una escritura falló, incluso pudo haberse aplicado. Bloquear durante el
  // proceso evita reemplazar su clave ante un resultado local incierto.
  static final Set<String> _bloqueadas = {};

  static Future<T> _serializar<T>(Future<T> Function() accion) {
    final resultado = Completer<T>();
    _turnos.add(() async {
      T? valor;
      Object? fallo;
      StackTrace? traza;
      try {
        valor = await accion();
      } catch (error, stack) {
        fallo = error;
        traza = stack;
      }
      // Liberar antes de entregar el resultado: no conservar una Future ligada
      // a una zona anterior entre llamadas o recreaciones del servicio.
      _procesando = false;
      _siguiente();
      if (fallo != null) {
        resultado.completeError(fallo, traza);
      } else {
        resultado.complete(valor as T);
      }
    });
    _siguiente();
    return resultado.future;
  }

  static void _siguiente() {
    if (_procesando || _turnos.isEmpty) return;
    _procesando = true;
    unawaited(_turnos.removeAt(0)());
  }

  static String _clave(String uid) {
    if (uid.trim().isEmpty || uid.length > 128 || uid.contains('/')) {
      throw const ErrorIngresoPendiente('La identidad de sesión no es válida.');
    }
    return 'fesync.ingreso.v1.${base64Url.encode(utf8.encode(uid))}';
  }

  static bool _hex64(Object? valor) =>
      valor is String &&
      valor.length == 64 &&
      !RegExp('[^a-f0-9]').hasMatch(valor);

  Future<SolicitudIngresoPendiente?> _leer(
    String uid, {
    bool paraReconciliar = false,
  }) async {
    final clave = _clave(uid);
    if (_bloqueadas.contains(clave) && !paraReconciliar) {
      throw const ErrorIngresoPendiente(
        'Almacenamiento bloqueado. Requiere reconciliación antes de continuar.',
      );
    }
    try {
      final texto = await _almacen.leer(clave);
      if (texto == null) return null;
      final datos = jsonDecode(texto);
      if (datos is! Map<String, dynamic> ||
          datos.length != 8 ||
          datos['version'] != 1 ||
          datos['uid'] != uid ||
          !_hex64(datos['huella']) ||
          !_hex64(datos['solicitudId']) ||
          datos['creadaEn'] is! int ||
          datos['actualizadaEn'] is! int ||
          (datos['creadaEn'] as int) < 0 ||
          (datos['actualizadaEn'] as int) < (datos['creadaEn'] as int)) {
        throw const FormatException();
      }
      return SolicitudIngresoPendiente._(
        uid: uid,
        tipo: TipoIngresoPendiente.values.byName(datos['tipo'] as String),
        huella: datos['huella'] as String,
        solicitudId: datos['solicitudId'] as String,
        estado: EstadoIngresoPendiente.values.byName(datos['estado'] as String),
        creadaEn: datos['creadaEn'] as int,
        actualizadaEn: datos['actualizadaEn'] as int,
      );
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorIngresoPendiente(
        'No se puede leer la intención guardada. No se enviará otra solicitud.',
      );
    }
  }

  Future<SolicitudIngresoPendiente> _guardar(
    SolicitudIngresoPendiente solicitud,
  ) async {
    final clave = _clave(solicitud.uid);
    final texto = jsonEncode(solicitud._mapa());
    try {
      await _almacen.escribir(clave, texto);
      // No declarar lista la intención hasta confirmar escritura y lectura.
      if (await _almacen.leer(clave) != texto) throw const FormatException();
      return solicitud;
    } catch (_) {
      _bloqueadas.add(clave);
      throw const ErrorIngresoPendiente(
        'No se pudo confirmar la persistencia. No se enviará la solicitud.',
      );
    }
  }

  Future<SolicitudIngresoPendiente?> recuperar(String uid) =>
      _serializar(() => _leer(uid));

  /// Lectura explícita para recuperar la clave original tras un error. No quita
  /// el bloqueo ni sustituye registros corruptos/ausentes por una intención nueva.
  Future<SolicitudIngresoPendiente?> recuperarParaReconciliar(String uid) =>
      _serializar(() => _leer(uid, paraReconciliar: true));

  /// Solo después de consultar el recibo original en servidor. El llamador
  /// comprueba sesión vigente; esta marca local no autoriza acceso a Firebase.
  Future<SolicitudIngresoPendiente> guardarReconciliacion(
    String uid,
    String solicitudId, {
    required bool vigente,
  }) => _serializar(() async {
    final anterior = await _leer(uid, paraReconciliar: true);
    if (anterior == null || anterior.solicitudId != solicitudId) {
      throw const ErrorIngresoPendiente(
        'No se recuperó la identidad original. No se creará otra solicitud.',
      );
    }
    final guardada = await _guardar(
      SolicitudIngresoPendiente._(
        uid: uid,
        tipo: anterior.tipo,
        huella: anterior.huella,
        solicitudId: solicitudId,
        estado: vigente
            ? EstadoIngresoPendiente.confirmada
            : EstadoIngresoPendiente.rechazada,
        creadaEn: anterior.creadaEn,
        actualizadaEn: max(
          anterior.actualizadaEn,
          DateTime.now().toUtc().millisecondsSinceEpoch,
        ),
      ),
    );
    _bloqueadas.remove(_clave(uid));
    return guardada;
  });

  /// Reutiliza una intención pendiente coincidente. Crear o reemplazar una
  /// intención finalizada exige confirmación; una pendiente distinta exige
  /// abandonarla explícitamente antes, aunque nuevaIntencionConfirmada sea true.
  Future<SolicitudIngresoPendiente> crearORecuperar({
    required String uid,
    required TipoIngresoPendiente tipo,
    required String huella,
    bool nuevaIntencionConfirmada = false,
  }) => _serializar(() async {
    if (!_hex64(huella)) {
      throw const ErrorIngresoPendiente(
        'La huella de la intención no es válida.',
      );
    }
    final anterior = await _leer(uid);
    if (anterior != null && anterior.estado.sinResolver) {
      if (anterior.tipo != tipo || anterior.huella != huella) {
        throw const ErrorIngresoPendiente(
          'Existe una intención pendiente diferente. Decide explícitamente cómo continuar.',
        );
      }
      return anterior;
    }
    if (!nuevaIntencionConfirmada) {
      throw const ErrorIngresoPendiente(
        'Confirma una nueva intención antes de generar una solicitud.',
      );
    }
    final random = Random.secure();
    final id = List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final ahora = DateTime.now().toUtc().millisecondsSinceEpoch;
    return _guardar(
      SolicitudIngresoPendiente._(
        uid: uid,
        tipo: tipo,
        huella: huella,
        solicitudId: id,
        estado: EstadoIngresoPendiente.pendiente,
        creadaEn: ahora,
        actualizadaEn: ahora,
      ),
    );
  });

  Future<SolicitudIngresoPendiente> _marcar(
    String uid,
    String solicitudId,
    EstadoIngresoPendiente estado,
  ) => _serializar(() async {
    final anterior = await _leer(uid);
    if (anterior == null || anterior.solicitudId != solicitudId) {
      throw const ErrorIngresoPendiente(
        'La intención ya no coincide con la operación actual.',
      );
    }
    if (anterior.estado == estado) return anterior;
    if (!anterior.estado.sinResolver) {
      throw const ErrorIngresoPendiente('La intención ya está finalizada.');
    }
    return _guardar(
      SolicitudIngresoPendiente._(
        uid: uid,
        tipo: anterior.tipo,
        huella: anterior.huella,
        solicitudId: anterior.solicitudId,
        estado: estado,
        creadaEn: anterior.creadaEn,
        actualizadaEn: max(
          anterior.actualizadaEn,
          DateTime.now().toUtc().millisecondsSinceEpoch,
        ),
      ),
    );
  });

  Future<SolicitudIngresoPendiente> marcarConfirmada(
    String uid,
    String solicitudId,
  ) => _marcar(uid, solicitudId, EstadoIngresoPendiente.confirmada);

  Future<SolicitudIngresoPendiente> marcarIncierta(
    String uid,
    String solicitudId,
  ) => _marcar(uid, solicitudId, EstadoIngresoPendiente.incierto);

  /// Observación de pertenencia actual sin recibo histórico. No acredita una
  /// generación ni autoriza operaciones protegidas del servidor.
  Future<SolicitudIngresoPendiente> guardarPertenenciaLegacy(
    String uid,
    String solicitudId,
  ) => _serializar(() async {
    final anterior = await _leer(uid, paraReconciliar: true);
    if (anterior == null ||
        anterior.solicitudId != solicitudId ||
        anterior.estado == EstadoIngresoPendiente.confirmada) {
      throw const ErrorIngresoPendiente('La solicitud original no coincide.');
    }
    final guardada = await _guardar(
      SolicitudIngresoPendiente._(
        uid: uid,
        tipo: anterior.tipo,
        huella: anterior.huella,
        solicitudId: solicitudId,
        estado: EstadoIngresoPendiente.pertenenciaLegacy,
        creadaEn: anterior.creadaEn,
        actualizadaEn: max(
          anterior.actualizadaEn,
          DateTime.now().toUtc().millisecondsSinceEpoch,
        ),
      ),
    );
    _bloqueadas.remove(_clave(uid));
    return guardada;
  });

  Future<SolicitudIngresoPendiente> marcarRechazada(
    String uid,
    String solicitudId,
  ) => _marcar(uid, solicitudId, EstadoIngresoPendiente.rechazada);

  Future<SolicitudIngresoPendiente> abandonar(
    String uid,
    String solicitudId, {
    required bool confirmadoPorUsuario,
  }) {
    if (!confirmadoPorUsuario) {
      return Future.error(
        const ErrorIngresoPendiente(
          'Abandonar requiere una decisión explícita.',
        ),
      );
    }
    return _serializar(() async {
      final anterior = await _leer(uid);
      if (anterior == null ||
          anterior.solicitudId != solicitudId ||
          anterior.estado == EstadoIngresoPendiente.incierto) {
        throw const ErrorIngresoPendiente(
          'Reconciliar antes de abandonar una operación incierta.',
        );
      }
      if (anterior.estado == EstadoIngresoPendiente.abandonada) return anterior;
      if (anterior.estado == EstadoIngresoPendiente.confirmada) {
        throw const ErrorIngresoPendiente('La operación ya fue confirmada.');
      }
      return _guardar(
        SolicitudIngresoPendiente._(
          uid: uid,
          tipo: anterior.tipo,
          huella: anterior.huella,
          solicitudId: solicitudId,
          estado: EstadoIngresoPendiente.abandonada,
          creadaEn: anterior.creadaEn,
          actualizadaEn: max(
            anterior.actualizadaEn,
            DateTime.now().toUtc().millisecondsSinceEpoch,
          ),
        ),
      );
    });
  }
}
