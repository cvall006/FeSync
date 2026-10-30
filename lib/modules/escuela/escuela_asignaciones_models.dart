import 'package:cloud_firestore/cloud_firestore.dart';

enum EstadoEscuela {
  pendiente('Pendiente'),
  enCurso('En curso'),
  completado('Completado');

  const EstadoEscuela(this.etiqueta);
  final String etiqueta;
  String get valor => this == enCurso ? 'en_curso' : name;
  static EstadoEscuela leer(String valor) => values.firstWhere(
    (e) => e.valor == valor,
    orElse: () => throw const FormatException('Estado de Escuela inválido.'),
  );
}

class EscuelaCiclo {
  const EscuelaCiclo({
    required this.id,
    required this.nombre,
    required this.anio,
    required this.cerrado,
  });
  final String id, nombre;
  final int anio;
  final bool cerrado;
  factory EscuelaCiclo.fromMap(String id, Map<String, dynamic> data) {
    if (data['version'] != 1 ||
        data['nombre'] is! String ||
        data['anio'] is! int ||
        !['abierto', 'cerrado'].contains(data['estado'])) {
      throw const FormatException('Ciclo de Escuela no compatible.');
    }
    return EscuelaCiclo(
      id: id,
      nombre: data['nombre'] as String,
      anio: data['anio'] as int,
      cerrado: data['estado'] == 'cerrado',
    );
  }
}

class EscuelaAsignacion {
  const EscuelaAsignacion({
    required this.hermanoUid,
    required this.nombreHermano,
    required this.moduloId,
    required this.tituloModulo,
    required this.estado,
    required this.revision,
    this.asignadoEn,
    this.actualizadoEn,
  });
  final String hermanoUid, nombreHermano, moduloId, tituloModulo;
  final EstadoEscuela estado;
  final int revision;
  final DateTime? asignadoEn, actualizadoEn;
  factory EscuelaAsignacion.fromMap(String uid, Map<String, dynamic> data) {
    if (data['version'] != 1 ||
        data['hermanoUid'] != uid ||
        data['nombreHermano'] is! String ||
        data['moduloId'] is! String ||
        data['tituloModulo'] is! String ||
        data['estado'] is! String ||
        data['revision'] is! int ||
        (data['revision'] as int) < 1) {
      throw const FormatException('Asignación de Escuela no compatible.');
    }
    return EscuelaAsignacion(
      hermanoUid: uid,
      nombreHermano: data['nombreHermano'] as String,
      moduloId: data['moduloId'] as String,
      tituloModulo: data['tituloModulo'] as String,
      estado: EstadoEscuela.leer(data['estado'] as String),
      revision: data['revision'] as int,
      asignadoEn: (data['asignadoEn'] as Timestamp?)?.toDate(),
      actualizadoEn: (data['actualizadoEn'] as Timestamp?)?.toDate(),
    );
  }
}

class EscuelaHermano {
  const EscuelaHermano(this.uid, this.nombre);
  final String uid, nombre;
}
