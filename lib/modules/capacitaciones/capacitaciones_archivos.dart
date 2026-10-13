import 'dart:convert';
import 'dart:typed_data';

import 'package:mime/mime.dart';
import 'package:archive/archive.dart';

const limiteArchivoCapacitacion = 25 * 1024 * 1024;
const tiposArchivoCapacitacion = {
  'pdf': 'application/pdf',
  'html': 'text/html',
  'htm': 'text/html',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'doc': 'application/msword',
  'docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'txt': 'text/plain',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
};

String extensionArchivoCapacitacion(String nombre) =>
    nombre.split('.').last.toLowerCase();

String? validarArchivoCapacitacion(
  String nombre,
  int tamano, {
  Uint8List? bytes,
  String? mimeDeclarado,
}) {
  final ext = extensionArchivoCapacitacion(nombre);
  final esperado = tiposArchivoCapacitacion[ext];
  if (esperado == null) return 'Formato de archivo no permitido.';
  if (tamano <= 0) return 'El archivo está vacío.';
  if (tamano > limiteArchivoCapacitacion) {
    return 'El archivo supera el límite de 25 MB.';
  }
  if (mimeDeclarado != null &&
      mimeDeclarado != esperado &&
      mimeDeclarado != 'application/octet-stream') {
    return 'El tipo MIME no coincide con el formato elegido.';
  }
  if (bytes == null) return null;
  if (bytes.length != tamano) {
    return 'El tamaño leído no coincide con el archivo.';
  }
  bool firma(List<int> firma) =>
      bytes.length >= firma.length &&
      List.generate(firma.length, (i) => bytes[i] == firma[i]).every((v) => v);
  if (firma([0x4d, 0x5a]) ||
      firma([0x7f, 0x45, 0x4c, 0x46]) ||
      firma([0x23, 0x21])) {
    return 'No se permiten archivos ejecutables.';
  }
  if (ext == 'pdf' && !firma([37, 80, 68, 70, 45])) {
    return 'El archivo no tiene una firma PDF válida.';
  }
  if (const ['doc', 'ppt', 'xls'].contains(ext) &&
      !firma([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return 'El archivo no tiene un formato Office válido.';
  }
  if (const ['docx', 'pptx', 'xlsx'].contains(ext) &&
      !firma([0x50, 0x4b, 0x03, 0x04])) {
    return 'El archivo no tiene un contenedor Office válido.';
  }
  if (const ['docx', 'pptx', 'xlsx'].contains(ext)) {
    try {
      final directorio = ZipDirectory()..read(InputMemoryStream(bytes));
      final nombres = directorio.fileHeaders
          .map((f) => f.filename.toLowerCase())
          .toSet();
      final principal = {
        'docx': 'word/document.xml',
        'pptx': 'ppt/presentation.xml',
        'xlsx': 'xl/workbook.xml',
      }[ext]!;
      if (!nombres.contains('[content_types].xml') ||
          !nombres.contains(principal) ||
          nombres.any(
            (n) =>
                n.endsWith('vbaproject.bin') ||
                RegExp(r'[.](exe|apk|bat|cmd|ps1|sh|js)$').hasMatch(n),
          )) {
        return 'El contenedor Office no corresponde al documento o incluye contenido ejecutable.';
      }
    } catch (_) {
      return 'El contenedor Office está dañado.';
    }
  }
  if (ext == 'png' &&
      !firma([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'El archivo no tiene una firma PNG válida.';
  }
  if (const ['jpg', 'jpeg'].contains(ext) && !firma([0xff, 0xd8, 0xff])) {
    return 'El archivo no tiene una firma JPEG válida.';
  }
  if (const ['html', 'htm', 'txt'].contains(ext)) {
    try {
      final texto = utf8.decode(bytes);
      if (texto.contains('\u0000')) {
        return 'El archivo de texto contiene datos binarios.';
      }
    } on FormatException {
      return 'El texto debe estar codificado en UTF-8.';
    }
  }
  final detectado = lookupMimeType(
    nombre,
    headerBytes: bytes.take(32).toList(),
  );
  if (const ['png', 'jpg', 'jpeg'].contains(ext) && detectado != esperado) {
    return 'El contenido no corresponde al tipo de imagen.';
  }
  if (detectado != null &&
      detectado != esperado &&
      detectado != 'application/zip' &&
      detectado != 'application/octet-stream') {
    return 'El contenido MIME no coincide con la extensión.';
  }
  return null;
}

String nombreStorageSeguro(String nombre) =>
    nombre.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');

String rutaArchivoCapacitacion({
  required String iglesiaId,
  required String categoriaId,
  required String capacitacionId,
  required String nombre,
}) {
  for (final segmento in [
    iglesiaId,
    categoriaId.isEmpty ? 'general' : categoriaId,
    capacitacionId,
  ]) {
    if (segmento.isEmpty ||
        segmento.contains('/') ||
        segmento == '..' ||
        segmento.contains('\\')) {
      throw const FormatException('Ruta de archivo no válida.');
    }
  }
  return 'capacitaciones/$iglesiaId/${categoriaId.isEmpty ? 'general' : categoriaId}/$capacitacionId/${nombreStorageSeguro(nombre)}';
}

String validarReferenciaArchivo(
  String url, {
  required String bucket,
  required String iglesiaId,
  required String capacitacionId,
}) {
  final uri = Uri.tryParse(url);
  final partes = uri?.pathSegments ?? [];
  if (uri?.scheme != 'gs' ||
      uri?.host != bucket ||
      partes.length != 5 ||
      partes[0] != 'capacitaciones' ||
      partes[1] != iglesiaId ||
      partes[3] != capacitacionId ||
      partes.any(
        (p) => p.isEmpty || p == '..' || p.contains('/') || p.contains('\\'),
      )) {
    throw const FormatException(
      'El archivo no pertenece a esta capacitación e iglesia.',
    );
  }
  return partes.join('/');
}
