class AsignacionPuesto {
  final String puesto;
  final String usuarioUid;
  final String nombreUsuario;
  final String area;
  String estado; // 'pendiente', 'confirmado', 'rechazado'

  AsignacionPuesto({
    required this.puesto,
    required this.usuarioUid,
    required this.nombreUsuario,
    required this.area,
    this.estado = 'pendiente',
  });

  factory AsignacionPuesto.fromMap(Map<String, dynamic> map) {
    return AsignacionPuesto(
      puesto: map['puesto'] ?? '',
      usuarioUid: map['usuarioUid'] ?? '',
      nombreUsuario: map['nombreUsuario'] ?? '',
      area: map['area'] ?? 'Protocolo',
      estado: map['estado'] ?? 'pendiente',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'puesto': puesto,
      'usuarioUid': usuarioUid,
      'nombreUsuario': nombreUsuario,
      'area': area,
      'estado': estado,
    };
  }
}

class TurnoServicioModel {
  final String id;
  final String titulo;
  final DateTime fecha;
  final List<AsignacionPuesto> asignaciones;
  final List<String> checklist;

  TurnoServicioModel({
    required this.id,
    required this.titulo,
    required this.fecha,
    required this.asignaciones,
    required this.checklist,
  });

  factory TurnoServicioModel.fromMap(Map<String, dynamic> map, String docId) {
    return TurnoServicioModel(
      id: docId,
      titulo: map['titulo'] ?? '',
      fecha: map['fecha'] != null ? DateTime.parse(map['fecha']) : DateTime.now(),
      asignaciones: (map['asignaciones'] as List<dynamic>? ?? [])
          .map((item) => AsignacionPuesto.fromMap(Map<String, dynamic>.from(item)))
          .toList(),
      checklist: List<String>.from(map['checklist'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'titulo': titulo,
      'fecha': fecha.toIso8601String(),
      'asignaciones': asignaciones.map((a) => a.toMap()).toList(),
      'checklist': checklist,
    };
  }
}