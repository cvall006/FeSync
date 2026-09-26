import 'package:cloud_firestore/cloud_firestore.dart';

class AdoraTutorialModel {
  final String nombre;
  final String url;

  const AdoraTutorialModel({required this.nombre, required this.url});
}

class AdoraCancionModel {
  final String id;
  final String titulo;
  final String autor;
  final String tono;
  final String letra;
  final String vozPrincipal;
  final String youtube;
  final String creadorUid;
  final DateTime? fechaCreacion;

  const AdoraCancionModel({
    required this.id,
    required this.titulo,
    required this.autor,
    required this.tono,
    required this.letra,
    required this.vozPrincipal,
    required this.youtube,
    required this.creadorUid,
    required this.fechaCreacion,
  });

  List<AdoraTutorialModel> get tutoriales {
    final resultado = <AdoraTutorialModel>[];

    final lineas = youtube.split(RegExp(r'\r?\n'));

    int indice = 1;

    for (final lineaOriginal in lineas) {
      final linea = lineaOriginal.trim();

      if (linea.isEmpty) {
        continue;
      }

      final match = RegExp(
        r'https?://\S+',
        caseSensitive: false,
      ).firstMatch(linea);

      if (match == null) {
        continue;
      }

      final url = match.group(0)!;

      var nombre = linea
          .substring(0, match.start)
          .trim()
          .replaceFirst(RegExp(r'[:\-\s]+$'), '');

      if (nombre.isEmpty) {
        nombre = 'Tutorial $indice';
      }

      resultado.add(AdoraTutorialModel(nombre: nombre, url: url));

      indice++;
    }

    return resultado;
  }

  factory AdoraCancionModel.fromMap(Map<String, dynamic> map, String id) {
    DateTime? fecha;

    final rawFecha = map['fechaCreacion'];

    if (rawFecha is Timestamp) {
      fecha = rawFecha.toDate();
    } else if (rawFecha is String) {
      fecha = DateTime.tryParse(rawFecha);
    }

    return AdoraCancionModel(
      id: id,
      titulo: map['titulo']?.toString() ?? '',
      autor: map['autor']?.toString() ?? '',
      tono: map['tono']?.toString() ?? '',
      letra: map['letra']?.toString() ?? '',
      vozPrincipal:
          map['voz_principal']?.toString() ??
          map['vozPrincipal']?.toString() ??
          '',
      youtube: map['youtube']?.toString() ?? '',
      creadorUid: map['creadorUid']?.toString() ?? '',
      fechaCreacion: fecha,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'titulo': titulo,
      'autor': autor,
      'tono': tono,
      'letra': letra,
      'voz_principal': vozPrincipal,
      'youtube': youtube,
      'creadorUid': creadorUid,
    };
  }
}

class AdoraEventoModel {
  final String id;
  final String titulo;
  final String tipo;
  final DateTime fechaHora;
  final List<String> cancionesIds;
  final List<String> asistentesUids;
  final String creadorUid;
  final DateTime? fechaCreacion;

  const AdoraEventoModel({
    required this.id,
    required this.titulo,
    required this.tipo,
    required this.fechaHora,
    required this.cancionesIds,
    required this.asistentesUids,
    required this.creadorUid,
    required this.fechaCreacion,
  });

  factory AdoraEventoModel.fromMap(Map<String, dynamic> map, String id) {
    DateTime fechaHora = DateTime.now();

    final rawFechaHora = map['fechaHora'] ?? map['fecha_hora'];

    if (rawFechaHora is Timestamp) {
      fechaHora = rawFechaHora.toDate();
    } else if (rawFechaHora is String) {
      fechaHora = DateTime.tryParse(rawFechaHora) ?? DateTime.now();
    }

    DateTime? fechaCreacion;

    final rawCreacion = map['fechaCreacion'];

    if (rawCreacion is Timestamp) {
      fechaCreacion = rawCreacion.toDate();
    } else if (rawCreacion is String) {
      fechaCreacion = DateTime.tryParse(rawCreacion);
    }

    final canciones = <String>[];

    final rawCanciones = map['cancionesIds'];

    if (rawCanciones is List) {
      canciones.addAll(rawCanciones.map((e) => e.toString()));
    }

    final asistentes = <String>[];

    final rawAsistentes = map['asistentesUids'] ?? map['asistentes'];

    if (rawAsistentes is List) {
      asistentes.addAll(rawAsistentes.map((e) => e.toString()));
    }

    return AdoraEventoModel(
      id: id,
      titulo: map['titulo']?.toString() ?? '',
      tipo: map['tipo']?.toString() ?? '',
      fechaHora: fechaHora,
      cancionesIds: canciones,
      asistentesUids: asistentes,
      creadorUid: map['creadorUid']?.toString() ?? '',
      fechaCreacion: fechaCreacion,
    );
  }
}
