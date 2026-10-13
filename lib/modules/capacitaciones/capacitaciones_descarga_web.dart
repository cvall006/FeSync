import 'dart:js_interop';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

String? _ultimoObjeto;

Future<void> entregarArchivoCapacitacion(
  Uint8List bytes,
  String nombre,
  String mime, {
  bool abrir = false,
  Rect? origen,
}) async {
  if (_ultimoObjeto != null) web.URL.revokeObjectURL(_ultimoObjeto!);
  final blob = web.Blob([bytes.toJS].toJS, web.BlobPropertyBag(type: mime));
  final url = web.URL.createObjectURL(blob);
  _ultimoObjeto = url;
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..rel = 'noopener noreferrer';
  if (abrir && mime == 'application/pdf') {
    anchor.target = '_blank';
  } else {
    anchor.download = nombre;
  }
  anchor.click();
}
