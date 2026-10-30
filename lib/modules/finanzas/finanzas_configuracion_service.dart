import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import 'finanzas_configuracion_model.dart';

/// El titular puede leer acceso aun deshabilitado. Un usuario sin permiso
/// recibirá permission-denied: ese error nunca representa un documento ausente.
class FinanzasConfiguracionService {
  static const region = 'southamerica-west1';

  final FirebaseFirestore? firestore;
  final FirebaseFunctions Function(String region) _functionsPorRegion;
  late final FirebaseFunctions _functions = _functionsPorRegion(region);

  FinanzasConfiguracionService({
    this.firestore,
    FirebaseFunctions Function(String region)? functionsPorRegion,
  }) : _functionsPorRegion = functionsPorRegion ?? _crearFunctions;

  static FirebaseFunctions _crearFunctions(String region) =>
      FirebaseFunctions.instanceFor(region: region);

  DocumentReference<Map<String, dynamic>> _acceso(String iglesiaId) {
    _validarIglesiaId(iglesiaId);
    return (firestore ?? FirebaseFirestore.instance)
        .collection('iglesias')
        .doc(iglesiaId)
        .collection('finanzas_config')
        .doc('acceso');
  }

  FinanzasConfiguracionModel _desdeSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    if (!snapshot.exists) return const FinanzasConfiguracionModel.ausente();
    final datos = snapshot.data();
    if (datos == null) {
      throw const FormatException('Configuración financiera sin datos.');
    }
    return FinanzasConfiguracionModel.fromMap(datos);
  }

  Future<FinanzasConfiguracionModel> obtenerConfiguracion(
    String iglesiaId,
  ) async => _desdeSnapshot(
    await _acceso(iglesiaId).get(const GetOptions(source: Source.server)),
  );

  /// Espera confirmación del servidor, incluso para un documento ausente.
  /// Los errores se propagan; una copia en caché no acredita permisos vigentes.
  Stream<FinanzasConfiguracionModel> observarConfiguracion(String iglesiaId) =>
      _acceso(iglesiaId)
          .snapshots(includeMetadataChanges: true)
          .where((snapshot) => !snapshot.metadata.isFromCache)
          .map(_desdeSnapshot);

  Future<void> designarEncargado(String iglesiaId, String encargadoUid) async {
    _validarIglesiaId(iglesiaId);
    if (!FinanzasConfiguracionModel.esEncargadoUidValido(encargadoUid)) {
      throw ArgumentError('UID de encargado no válido.');
    }
    await _functions.httpsCallable('actualizarEncargadoFinanciero').call<void>({
      'iglesiaId': iglesiaId,
      'accion': 'designar',
      'encargadoUid': encargadoUid,
    });
  }

  Future<void> revocarEncargado(String iglesiaId) async {
    _validarIglesiaId(iglesiaId);
    await _functions.httpsCallable('actualizarEncargadoFinanciero').call<void>({
      'iglesiaId': iglesiaId,
      'accion': 'revocar',
      'encargadoUid': null,
    });
  }

  Future<void> actualizarEstadoModulo(String iglesiaId, bool habilitado) async {
    _validarIglesiaId(iglesiaId);
    await _functions.httpsCallable('actualizarEstadoModuloFinanzas').call<void>(
      {'iglesiaId': iglesiaId, 'habilitado': habilitado},
    );
  }

  // Validación local de formato; la autorización corresponde al servidor.
  static void _validarIglesiaId(String iglesiaId) {
    if (iglesiaId.trim().isEmpty ||
        utf8.encode(iglesiaId).length > 1500 ||
        iglesiaId.contains('/') ||
        iglesiaId == '.' ||
        iglesiaId == '..' ||
        RegExp(r'^__.*__$', dotAll: true).hasMatch(iglesiaId)) {
      throw ArgumentError('Identificador de iglesia no válido.');
    }
  }
}
