import 'package:cloud_firestore/cloud_firestore.dart';

class EscuelaClaseModel {
  final String id;
  final String titulo;
  final String descripcion;
  final String linkPdf;
  final String linkVideo;

  const EscuelaClaseModel({
    required this.id,
    required this.titulo,
    required this.descripcion,
    required this.linkPdf,
    required this.linkVideo,
  });

  factory EscuelaClaseModel.fromMap(Map<String, dynamic> map) {
    return EscuelaClaseModel(
      id: map['id']?.toString() ?? '',
      titulo: map['titulo']?.toString() ?? '',
      descripcion: map['descripcion']?.toString() ?? '',
      linkPdf: map['linkPdf']?.toString() ?? '',
      linkVideo: map['linkVideo']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'titulo': titulo,
      'descripcion': descripcion,
      'linkPdf': linkPdf,
      'linkVideo': linkVideo,
    };
  }
}

class EscuelaModuloModel {
  final String id;
  final String titulo;
  final String descripcion;
  final String creadorUid;
  final DateTime? fechaCreacion;
  final List<EscuelaClaseModel> clases;

  const EscuelaModuloModel({
    required this.id,
    required this.titulo,
    required this.descripcion,
    required this.creadorUid,
    required this.fechaCreacion,
    required this.clases,
  });

  factory EscuelaModuloModel.fromMap(Map<String, dynamic> map, String id) {
    DateTime? fecha;

    final fechaRaw = map['fechaCreacion'];

    if (fechaRaw is Timestamp) {
      fecha = fechaRaw.toDate();
    } else if (fechaRaw is String) {
      fecha = DateTime.tryParse(fechaRaw);
    }

    final clasesRaw = map['clases'];

    final clases = <EscuelaClaseModel>[];

    if (clasesRaw is List) {
      for (final item in clasesRaw) {
        if (item is Map) {
          clases.add(
            EscuelaClaseModel.fromMap(Map<String, dynamic>.from(item)),
          );
        }
      }
    }

    return EscuelaModuloModel(
      id: id,
      titulo: map['titulo']?.toString() ?? '',
      descripcion: map['descripcion']?.toString() ?? '',
      creadorUid: map['creadorUid']?.toString() ?? '',
      fechaCreacion: fecha,
      clases: clases,
    );
  }
}
