import 'package:cloud_firestore/cloud_firestore.dart';

class CapacitacionModel {
  final String id;
  final String titulo;
  final String descripcion;
  final String contenido;
  final String linkVideo;
  final String tipo;
  final DateTime? fechaCreacion;
  final String categoriaId;
  final String? tipoContenido;
  final String archivoUrl;
  final String archivoNombre;
  final String archivoTipo;
  final int archivoTamano;

  const CapacitacionModel({
    required this.id,
    required this.titulo,
    required this.descripcion,
    required this.contenido,
    required this.linkVideo,
    required this.tipo,
    required this.fechaCreacion,
    this.categoriaId = '',
    this.tipoContenido,
    this.archivoUrl = '',
    this.archivoNombre = '',
    this.archivoTipo = '',
    this.archivoTamano = 0,
  });

  bool get esHeredada => tipoContenido == null || tipoContenido!.isEmpty;
  String get tipoEfectivo =>
      esHeredada ? (tipo == 'video' ? 'enlace' : 'reflexion') : tipoContenido!;
  bool get esArchivo => tipoEfectivo == 'archivo';
  bool get esVideo => tipoEfectivo == 'enlace';

  bool get esTexto => tipoEfectivo == 'reflexion';

  String get etiquetaTipo {
    if (esTexto) return '📖 Reflexión';
    if (esVideo) {
      final host = Uri.tryParse(linkVideo)?.host.toLowerCase() ?? '';
      return host == 'youtu.be' ||
              host == 'youtube.com' ||
              host.endsWith('.youtube.com')
          ? '▶ Video'
          : '🌐 Enlace';
    }
    final ext = archivoNombre.split('.').last.toLowerCase();
    if (ext == 'pdf') return '📄 PDF';
    if (const ['ppt', 'pptx'].contains(ext)) return '🎞 Presentación';
    return '📎 Documento';
  }

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
      categoriaId: map['categoriaId']?.toString() ?? '',
      tipoContenido: map['tipoContenido']?.toString(),
      archivoUrl: map['archivoUrl']?.toString() ?? '',
      archivoNombre: map['archivoNombre']?.toString() ?? '',
      archivoTipo: map['archivoTipo']?.toString() ?? '',
      archivoTamano: (map['archivoTamano'] is num)
          ? (map['archivoTamano'] as num).toInt()
          : 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'titulo': titulo,
      'descripcion': descripcion,
      'contenido': contenido,
      'linkVideo': linkVideo,
      'tipo': tipo,
      'categoriaId': categoriaId,
      if (tipoContenido != null) 'tipoContenido': tipoContenido,
      'archivoUrl': archivoUrl,
      'archivoNombre': archivoNombre,
      'archivoTipo': archivoTipo,
      'archivoTamano': archivoTamano,
    };
  }
}

class CapacitacionCategoriaModel {
  final String id;
  final String nombre;
  final String descripcion;
  final int orden;
  final bool activa;
  final DateTime? fechaCreacion;
  final String creadorUid;

  const CapacitacionCategoriaModel({
    required this.id,
    required this.nombre,
    this.descripcion = '',
    this.orden = 0,
    this.activa = true,
    this.fechaCreacion,
    this.creadorUid = '',
  });

  static const general = CapacitacionCategoriaModel(
    id: '',
    nombre: 'General',
    descripcion: 'Contenidos sin categoría',
  );

  factory CapacitacionCategoriaModel.fromMap(
    Map<String, dynamic> map,
    String id,
  ) => CapacitacionCategoriaModel(
    id: id,
    nombre: map['nombre']?.toString() ?? 'Sin nombre',
    descripcion: map['descripcion']?.toString() ?? '',
    orden: (map['orden'] is num) ? (map['orden'] as num).toInt() : 0,
    activa: map['activa'] != false,
    creadorUid: map['creadorUid']?.toString() ?? '',
    fechaCreacion: map['fechaCreacion'] is Timestamp
        ? (map['fechaCreacion'] as Timestamp).toDate()
        : DateTime.tryParse(map['fechaCreacion']?.toString() ?? ''),
  );

  Map<String, dynamic> toMap() => {
    'nombre': nombre,
    'descripcion': descripcion,
    'orden': orden,
    'activa': activa,
    'creadorUid': creadorUid,
  };
}
