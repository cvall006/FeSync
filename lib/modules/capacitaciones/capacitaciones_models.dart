import 'package:cloud_firestore/cloud_firestore.dart';

class CapacitacionModel {
  final String id;
  final String titulo;
  final String descripcion;
  final String contenido;
  final String linkVideo;
  final String tipo;
  final DateTime? fechaCreacion;

  const CapacitacionModel({
    required this.id,
    required this.titulo,
    required this.descripcion,
    required this.contenido,
    required this.linkVideo,
    required this.tipo,
    required this.fechaCreacion,
  });

  bool get esVideo => tipo == 'video';

  bool get esTexto => tipo == 'texto';

  factory CapacitacionModel.fromMap(Map<String, dynamic> map, String id) {
    DateTime? fecha;

    final fechaRaw = map['fechaCreacion'];

    if (fechaRaw is Timestamp) {
      fecha = fechaRaw.toDate();
    } else if (fechaRaw is String) {
      fecha = DateTime.tryParse(fechaRaw);
    }

    return CapacitacionModel(
      id: id,
      titulo: map['titulo']?.toString() ?? '',
      descripcion: map['descripcion']?.toString() ?? '',
      contenido: map['contenido']?.toString() ?? '',
      linkVideo: map['linkVideo']?.toString() ?? '',
      tipo: map['tipo']?.toString() ?? 'texto',
      fechaCreacion: fecha,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'titulo': titulo,
      'descripcion': descripcion,
      'contenido': contenido,
      'linkVideo': linkVideo,
      'tipo': tipo,
    };
  }
}
