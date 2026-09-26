import 'package:cloud_firestore/cloud_firestore.dart';

class ComunidadPublicacionModel {
  final String id;
  final String autorNombre;
  final String autorUid;
  final String contenido;
  final DateTime? fechaCreacion;
  final String tipo;

  const ComunidadPublicacionModel({
    required this.id,
    required this.autorNombre,
    required this.autorUid,
    required this.contenido,
    required this.fechaCreacion,
    required this.tipo,
  });

  bool get esAviso => tipo == 'aviso';

  bool get esPeticion => tipo == 'peticion';

  factory ComunidadPublicacionModel.fromMap(
    Map<String, dynamic> map,
    String id,
  ) {
    DateTime? fecha;

    final rawFecha = map['fechaCreacion'];

    if (rawFecha is Timestamp) {
      fecha = rawFecha.toDate();
    } else if (rawFecha is String) {
      fecha = DateTime.tryParse(rawFecha);
    }

    return ComunidadPublicacionModel(
      id: id,
      autorNombre: map['autorNombre']?.toString() ?? 'Usuario',
      autorUid: map['autorUid']?.toString() ?? '',
      contenido: map['contenido']?.toString() ?? '',
      fechaCreacion: fecha,
      tipo: map['tipo']?.toString() ?? 'aviso',
    );
  }
}
