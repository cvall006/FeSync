import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

Future<void> entregarArchivoCapacitacion(
  Uint8List bytes,
  String nombre,
  String mime, {
  bool abrir = false,
  Rect? origen,
}) async {
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile.fromData(bytes, mimeType: mime)],
      fileNameOverrides: [nombre],
      sharePositionOrigin: origen,
      downloadFallbackEnabled: false,
    ),
  );
}
