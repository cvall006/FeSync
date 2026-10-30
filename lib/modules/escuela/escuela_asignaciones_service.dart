import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'escuela_asignaciones_models.dart';
import 'escuela_models.dart';

abstract interface class EscuelaAsignacionesRepositorio {
  Stream<List<EscuelaCiclo>> ciclos();
  Stream<List<EscuelaAsignacion>> asignaciones(String cicloId);
  Stream<List<EscuelaHermano>> hermanos();
  Stream<List<EscuelaModuloModel>> modulos();
  Future<String> crearCiclo(String nombre, int anio);
  Future<void> cerrarCiclo(String cicloId);
  Future<void> eliminarCiclo(String cicloId);
  Future<void> asignar(
    String cicloId,
    String hermanoUid,
    String moduloId, {
    required int? revisionEsperada,
  });
  Future<void> cambiarEstado(
    String cicloId,
    String hermanoUid,
    EstadoEscuela estado, {
    required int revisionEsperada,
  });
}

abstract interface class EscuelaHistorialFuente {
  Stream<List<EscuelaCiclo>> ciclos();
  Stream<List<EscuelaAsignacion>> asignaciones(String cicloId);
  Stream<EscuelaAsignacion?> asignacionDe(String cicloId, String hermanoUid);
}

/// Solo las rutas de Escuela. Las reglas acreditan pertenencia y rol vigentes.
/// Cada edición revalida ciclo y revisión para no pisar otra decisión.
class EscuelaAsignacionesService
    implements EscuelaAsignacionesRepositorio, EscuelaHistorialFuente {
  EscuelaAsignacionesService({
    required this.iglesiaId,
    required this.actorUid,
    FirebaseFirestore? firestore,
    String? Function()? uidActual,
  }) : _db = firestore ?? FirebaseFirestore.instance,
       _uidActual = uidActual ?? (() => FirebaseAuth.instance.currentUser?.uid);
  final String iglesiaId, actorUid;
  final FirebaseFirestore _db;
  final String? Function() _uidActual;
  DocumentReference<Map<String, dynamic>> get _iglesia =>
      _db.collection('iglesias').doc(iglesiaId);
  CollectionReference<Map<String, dynamic>> get _ciclos =>
      _iglesia.collection('escuela_ciclos');
  void _sesion() {
    if (_uidActual() != actorUid || !_id(iglesiaId)) {
      throw StateError('La sesión cambió. Vuelve a entrar a Escuela.');
    }
  }

  static bool _id(String id) =>
      id.isNotEmpty && !id.contains('/') && id.length <= 128;
  void _validarId(String id) {
    if (!_id(id)) throw ArgumentError('Identificador de Escuela inválido.');
  }

  Future<void> _autorizar(Transaction tx, {bool soloAdmin = false}) async {
    _sesion();
    final perfil = (await tx.get(
      _db.collection('usuarios_globales').doc(actorUid),
    )).data();
    _sesion();
    if (perfil?['iglesiaId'] != iglesiaId ||
        !(soloAdmin ? ['admin_iglesia'] : ['admin_iglesia', 'lider_area'])
            .contains(perfil?['rolGlobal'])) {
      throw StateError('No tienes permiso para administrar Escuela.');
    }
  }

  Future<void> _abierto(Transaction tx, String cicloId) async {
    final c = (await tx.get(_ciclos.doc(cicloId))).data();
    if (c == null ||
        c['version'] != 1 ||
        c['estado'] != 'abierto' ||
        c['eliminado'] == true) {
      throw StateError('El ciclo no existe o está cerrado.');
    }
  }

  @override
  Stream<List<EscuelaCiclo>> ciclos() {
    _sesion();
    return _ciclos
        .snapshots(includeMetadataChanges: true)
        .where((s) => !s.metadata.isFromCache)
        .map((s) {
          _sesion();
          final result = s.docs
              .where((d) => d.data()['eliminado'] != true)
              .map((d) => EscuelaCiclo.fromMap(d.id, d.data()))
              .toList();
          result.sort((a, b) {
            final anio = b.anio.compareTo(a.anio);
            return anio != 0 ? anio : a.nombre.compareTo(b.nombre);
          });
          return result;
        });
  }

  @override
  Stream<List<EscuelaAsignacion>> asignaciones(String cicloId) {
    _sesion();
    _validarId(cicloId);
    return _ciclos
        .doc(cicloId)
        .collection('asignaciones')
        .snapshots(includeMetadataChanges: true)
        .where((s) => !s.metadata.isFromCache)
        .map((s) {
          _sesion();
          return s.docs
              .map((d) => EscuelaAsignacion.fromMap(d.id, d.data()))
              .toList()
            ..sort((a, b) => a.nombreHermano.compareTo(b.nombreHermano));
        });
  }

  @override
  Stream<EscuelaAsignacion?> asignacionDe(String cicloId, String hermanoUid) {
    _sesion();
    _validarId(cicloId);
    _validarId(hermanoUid);
    return _ciclos
        .doc(cicloId)
        .collection('asignaciones')
        .doc(hermanoUid)
        .snapshots(includeMetadataChanges: true)
        .where((s) => !s.metadata.isFromCache)
        .map((s) {
          _sesion();
          return s.exists
              ? EscuelaAsignacion.fromMap(hermanoUid, s.data()!)
              : null;
        });
  }

  @override
  Stream<List<EscuelaHermano>> hermanos() {
    _sesion();
    return _db
        .collection('usuarios_globales')
        .where('iglesiaId', isEqualTo: iglesiaId)
        // Igual que Gestión de Miembros: la caché inicial puede contener solo
        // el perfil propio. El selector usa .first, así que esperar al servidor.
        .snapshots(includeMetadataChanges: true)
        .where((s) => !s.metadata.isFromCache)
        .map(
          (s) =>
              s.docs
                  .map(
                    (d) => EscuelaHermano(
                      d.id,
                      d.data()['nombre'] is String
                          ? d.data()['nombre'] as String
                          : 'Sin nombre',
                    ),
                  )
                  .toList()
                ..sort((a, b) => a.nombre.compareTo(b.nombre)),
        );
  }

  @override
  Stream<List<EscuelaModuloModel>> modulos() {
    _sesion();
    return _iglesia
        .collection('escuela_modulos')
        .snapshots()
        .map(
          (s) =>
              s.docs
                  .map((d) => EscuelaModuloModel.fromMap(d.data(), d.id))
                  .toList()
                ..sort((a, b) => a.titulo.compareTo(b.titulo)),
        );
  }

  @override
  Future<String> crearCiclo(String nombre, int anio) async {
    _sesion();
    if (nombre.trim().isEmpty ||
        nombre.trim().length > 120 ||
        anio < 2000 ||
        anio > 2200) {
      throw ArgumentError('Indica un nombre y un año válidos.');
    }
    // Reservar una sola referencia antes de los reintentos de la transacción.
    final ref = _ciclos.doc();
    await _db.runTransaction((tx) async {
      await _autorizar(tx);
      _sesion();
      tx.set(ref, {
        'version': 1,
        'nombre': nombre.trim(),
        'anio': anio,
        'estado': 'abierto',
        'creadoPor': actorUid,
        'creadoEn': FieldValue.serverTimestamp(),
        'cerradoPor': null,
        'cerradoEn': null,
      });
    });
    return ref.id;
  }

  @override
  Future<void> cerrarCiclo(String cicloId) async {
    _sesion();
    _validarId(cicloId);
    await _db.runTransaction((tx) async {
      await _autorizar(tx);
      await _abierto(tx, cicloId);
      _sesion();
      tx.update(_ciclos.doc(cicloId), {
        'estado': 'cerrado',
        'cerradoPor': actorUid,
        'cerradoEn': FieldValue.serverTimestamp(),
      });
    });
  }

  /// Borrado lógico: no deja subcolecciones huérfanas ni destruye historial.
  /// La marca es irreversible desde el cliente y las reglas bloquean cambios.
  @override
  Future<void> eliminarCiclo(String cicloId) async {
    _sesion();
    _validarId(cicloId);
    await _db.runTransaction((tx) async {
      await _autorizar(tx, soloAdmin: true);
      final ref = _ciclos.doc(cicloId);
      final ciclo = (await tx.get(ref)).data();
      if (ciclo == null || ciclo['version'] != 1) {
        throw StateError('El ciclo no existe o no es compatible.');
      }
      if (ciclo['eliminado'] == true) return;
      _sesion();
      tx.update(ref, {
        'eliminado': true,
        'eliminadoPor': actorUid,
        'eliminadoEn': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<Map<String, dynamic>> _hermano(Transaction tx, String uid) async {
    final data = (await tx.get(_db.collection('usuarios_globales').doc(uid)))
        .data();
    if (data == null || data['iglesiaId'] != iglesiaId) {
      throw StateError('El hermano ya no pertenece a esta iglesia.');
    }
    return data;
  }

  @override
  Future<void> asignar(
    String cicloId,
    String hermanoUid,
    String moduloId, {
    required int? revisionEsperada,
  }) async {
    _sesion();
    for (final id in [cicloId, hermanoUid, moduloId]) {
      _validarId(id);
    }
    final ref = _ciclos.doc(cicloId).collection('asignaciones').doc(hermanoUid);
    await _db.runTransaction((tx) async {
      await _autorizar(tx);
      await _abierto(tx, cicloId);
      final hermano = await _hermano(tx, hermanoUid);
      final modulo = (await tx.get(
        _iglesia.collection('escuela_modulos').doc(moduloId),
      )).data();
      final anterior = (await tx.get(ref)).data();
      if (anterior?['revision'] != revisionEsperada) {
        throw StateError(
          'La asignación cambió. Revisa la lista antes de guardar.',
        );
      }
      final titulo = modulo?['titulo'];
      if (titulo is! String || titulo.isEmpty || titulo.length > 500) {
        throw StateError('El módulo no existe o su título no es válido.');
      }
      if (anterior != null && anterior['moduloId'] == moduloId) {
        throw StateError('Ese módulo ya está asignado en este ciclo.');
      }
      final historial = List<Map<String, dynamic>>.from(
        (anterior?['historialModulos'] as List? ?? const []).map(
          (e) => Map<String, dynamic>.from(e as Map),
        ),
      );
      if (anterior != null) {
        if (historial.length >= 100) {
          throw StateError(
            'Este ciclo alcanzó el límite de registros. Crea otro ciclo para conservar el historial.',
          );
        }
        historial.add(
          Map<String, dynamic>.from(anterior)..remove('historialModulos'),
        );
      }
      _sesion();
      tx.set(ref, {
        'version': 1,
        'hermanoUid': hermanoUid,
        'nombreHermano': hermano['nombre'] is String
            ? hermano['nombre']
            : 'Sin nombre',
        'moduloId': moduloId,
        'tituloModulo': titulo,
        'estado': 'pendiente',
        'asignadoPor': actorUid,
        'asignadoEn': FieldValue.serverTimestamp(),
        'actualizadoPor': actorUid,
        'actualizadoEn': FieldValue.serverTimestamp(),
        'revision': (revisionEsperada ?? 0) + 1,
        if (historial.isNotEmpty) 'historialModulos': historial,
      });
    });
  }

  @override
  Future<void> cambiarEstado(
    String cicloId,
    String hermanoUid,
    EstadoEscuela estado, {
    required int revisionEsperada,
  }) async {
    _sesion();
    _validarId(cicloId);
    _validarId(hermanoUid);
    final ref = _ciclos.doc(cicloId).collection('asignaciones').doc(hermanoUid);
    await _db.runTransaction((tx) async {
      await _autorizar(tx);
      await _abierto(tx, cicloId);
      await _hermano(tx, hermanoUid);
      final data = (await tx.get(ref)).data();
      if (data == null || data['revision'] != revisionEsperada) {
        throw StateError(
          'La asignación cambió. Revisa la lista antes de guardar.',
        );
      }
      _sesion();
      tx.update(ref, {
        'estado': estado.valor,
        'actualizadoPor': actorUid,
        'actualizadoEn': FieldValue.serverTimestamp(),
        'revision': revisionEsperada + 1,
      });
    });
  }
}
