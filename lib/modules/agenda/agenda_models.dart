class EventoAgendaModel {
  final String id;
  final String titulo;
  final String descripcion;
  final DateTime fecha;
  final String hora;
  final String lugar;
  final String creadorUid;

  EventoAgendaModel({
    required this.id,
    required this.titulo,
    required this.descripcion,
    required this.fecha,
    required this.hora,
    required this.lugar,
    required this.creadorUid,
  });

  factory EventoAgendaModel.fromMap(Map<String, dynamic> map, String docId) {
    return EventoAgendaModel(
      id: docId,
      titulo: map['titulo'] ?? '',
      descripcion: map['descripcion'] ?? '',
      fecha: map['fecha'] != null ? DateTime.parse(map['fecha']) : DateTime.now(),
      hora: map['hora'] ?? '',
      lugar: map['lugar'] ?? '',
      creadorUid: map['creadorUid'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'titulo': titulo,
      'descripcion': descripcion,
      'fecha': fecha.toIso8601String(),
      'hora': hora,
      'lugar': lugar,
      'creadorUid': creadorUid,
    };
  }
}