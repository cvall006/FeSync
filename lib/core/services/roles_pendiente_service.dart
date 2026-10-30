import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import 'ingreso_pendiente_service.dart'
    show AlmacenIngresoPendiente, AlmacenSeguroIngresoPendiente;

bool idRolValido(String v, [int limite = 1500]) =>
    v.isNotEmpty &&
    v == v.trim() &&
    v.length <= limite &&
    utf8.encode(v).length <= 1500 &&
    !RegExp(r'[/\x00-\x1f\x7f]').hasMatch(v) &&
    v != '.' &&
    v != '..' &&
    !RegExp(r'^__.*__$').hasMatch(v);
bool rolOrdinario(String v) => v == 'servidor' || v == 'lider_area';
bool periodoRolValido(String v) => RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
bool versionRolValida(String v) {
  if (!RegExp(r'^-?\d{1,12}:\d{1,9}$').hasMatch(v)) return false;
  final partes = v.split(':');
  final s = int.parse(partes[0]);
  final n = int.parse(partes[1]);
  return s >= -62135596800 &&
      s <= 253402300799 &&
      n >= 0 &&
      n < 1000000000 &&
      v == '$s:$n';
}

class ErrorRoles implements Exception {
  const ErrorRoles(this.codigo);
  final String codigo;
  @override
  String toString() => 'No se pudo completar el cambio de rol ($codigo).';
}

/// Versiones opacas: nunca convertir a DateTime o milisegundos.
class ContextoCambioRol {
  const ContextoCambioRol(
    this.rolActual,
    this.pertenenciaId,
    this.versionPerfilEsperada,
    this.versionIglesiaEsperada,
  );
  final String rolActual, pertenenciaId;
  final String versionPerfilEsperada, versionIglesiaEsperada;
  bool get valido =>
      rolOrdinario(rolActual) &&
      periodoRolValido(pertenenciaId) &&
      versionRolValida(versionPerfilEsperada) &&
      versionRolValida(versionIglesiaEsperada);
}

enum EstadoSolicitudRol { incierta, confirmada, rechazada }

class SolicitudRol {
  const SolicitudRol(this.actorUid, this.parametros, this.estado);
  final String actorUid;
  final Map<String, String> parametros;
  final EstadoSolicitudRol estado;
  String get solicitudId => parametros['solicitudId']!;
}

/// Namespace y contrato propios de roles; solo reutiliza el adaptador cifrado.
/// Guarda el payload mínimo ORIGINAL (sin descripción, nombres, correo o tokens)
/// para poder repetir tras reiniciar, incluso si el perfil cambió/desapareció.
/// La respuesta CONFIRMADA es histórica, nunca autorización ni rol vigente.
///
/// Cola compartida entre instancias de UN isolate. No ofrece CAS entre pestañas,
/// procesos o dispositivos: usar un escritor por almacén. Sin TTL/borrado automático.
/// Pérdida/restauración de almacenamiento no prueba ausencia remota. No reconstruir
/// ni reenviar automáticamente con otra clave. El usuario debe revisar otra intención.
class RolesPendienteService {
  RolesPendienteService({AlmacenIngresoPendiente? almacen})
    : _almacen = almacen ?? AlmacenSeguroIngresoPendiente();
  final AlmacenIngresoPendiente _almacen;
  static final _colas = <Future<void> Function()>[];
  static bool _ocupada = false;
  static final _bloqueadas = <String>{};

  static Future<T> _serializar<T>(Future<T> Function() accion) {
    final c = Completer<T>();
    _colas.add(() async {
      try {
        c.complete(await accion());
      } catch (e, s) {
        c.completeError(e, s);
      } finally {
        _ocupada = false;
        _siguiente();
      }
    });
    _siguiente();
    return c.future;
  }

  static void _siguiente() {
    if (_ocupada || _colas.isEmpty) return;
    _ocupada = true;
    unawaited(_colas.removeAt(0)());
  }

  static String clave(String actor, String objetivo) {
    if (!idRolValido(actor, 128) || !idRolValido(objetivo, 128)) {
      throw const ErrorRoles('invalid-argument');
    }
    return 'fesync.roles.v1.${sha256.convert(utf8.encode(jsonEncode([actor, objetivo])))}';
  }

  static const campos = [
    'iglesiaId',
    'uidObjetivo',
    'pertenenciaId',
    'rolNuevo',
    'versionPerfilEsperada',
    'versionIglesiaEsperada',
    'solicitudId',
  ];
  static bool parametrosValidos(Map<String, String> p) =>
      p.length == 7 &&
      campos.every(p.containsKey) &&
      idRolValido(p['iglesiaId']!) &&
      idRolValido(p['uidObjetivo']!, 128) &&
      periodoRolValido(p['pertenenciaId']!) &&
      rolOrdinario(p['rolNuevo']!) &&
      versionRolValida(p['versionPerfilEsperada']!) &&
      versionRolValida(p['versionIglesiaEsperada']!) &&
      RegExp(r'^[a-zA-Z0-9_-]{16,128}$').hasMatch(p['solicitudId']!) &&
      !RegExp(r'^__.*__$').hasMatch(p['solicitudId']!);

  Future<SolicitudRol?> _leer(String actor, String objetivo) async {
    try {
      final texto = await _almacen.leer(clave(actor, objetivo));
      if (texto == null) return null;
      final d = jsonDecode(texto);
      if (d is! Map ||
          d.length != 4 ||
          d['version'] != 1 ||
          d['actorUid'] != actor ||
          d['parametros'] is! Map) {
        throw const FormatException();
      }
      final p = Map<String, String>.from(d['parametros'] as Map);
      if (!parametrosValidos(p) || p['uidObjetivo'] != objetivo) {
        throw const FormatException();
      }
      final estado = EstadoSolicitudRol.values.byName(d['estado'] as String);
      // Una lectura posterior válida permite recuperar una escritura cuyo
      // read-back falló. Ausencia o corrupción nunca levanta el bloqueo.
      _bloqueadas.remove(clave(actor, objetivo));
      return SolicitudRol(actor, Map.unmodifiable(p), estado);
    } catch (_) {
      throw const ErrorRoles('almacen-inaccesible-o-corrupto');
    }
  }

  Future<void> _guardar(SolicitudRol s) async {
    final k = clave(s.actorUid, s.parametros['uidObjetivo']!);
    final texto = jsonEncode({
      'version': 1,
      'actorUid': s.actorUid,
      'parametros': s.parametros,
      'estado': s.estado.name,
    });
    try {
      await _almacen.escribir(k, texto);
      if (await _almacen.leer(k) != texto) throw const FormatException();
      _bloqueadas.remove(k);
    } catch (_) {
      _bloqueadas.add(k);
      throw const ErrorRoles('persistencia-no-confirmada');
    }
  }

  Future<SolicitudRol?> recuperar(String actor, String objetivo) =>
      _serializar(() => _leer(actor, objetivo));

  /// Solo tras revisión y confirmación explícitas. Una incierta nunca se reemplaza.
  Future<SolicitudRol> preparar(
    String actor,
    String iglesia,
    String objetivo,
    ContextoCambioRol contexto,
    String rol, {
    required bool confirmado,
  }) => _serializar(() async {
    final k = clave(actor, objetivo);
    if (!confirmado ||
        !contexto.valido ||
        !rolOrdinario(rol) ||
        !idRolValido(iglesia) ||
        _bloqueadas.contains(k)) {
      throw const ErrorRoles('revision-requerida');
    }
    final anterior = await _leer(actor, objetivo);
    if (anterior?.estado == EstadoSolicitudRol.incierta) {
      throw const ErrorRoles('solicitud-pendiente');
    }
    final random = Random.secure();
    final id = List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final s = SolicitudRol(
      actor,
      Map.unmodifiable({
        'iglesiaId': iglesia,
        'uidObjetivo': objetivo,
        'rolNuevo': rol,
        'pertenenciaId': contexto.pertenenciaId,
        'versionPerfilEsperada': contexto.versionPerfilEsperada,
        'versionIglesiaEsperada': contexto.versionIglesiaEsperada,
        'solicitudId': id,
      }),
      EstadoSolicitudRol.incierta,
    );
    // Incierta ANTES del primer envío: una caída no aparenta que nunca se envió.
    await _guardar(s);
    return s;
  });

  Future<void> marcar(SolicitudRol s, EstadoSolicitudRol estado) =>
      _serializar(() async {
        final anterior = await _leer(s.actorUid, s.parametros['uidObjetivo']!);
        if (anterior == null ||
            anterior.solicitudId != s.solicitudId ||
            jsonEncode(anterior.parametros) != jsonEncode(s.parametros)) {
          throw const ErrorRoles('registro-incompatible');
        }
        await _guardar(SolicitudRol(s.actorUid, s.parametros, estado));
      });
}
