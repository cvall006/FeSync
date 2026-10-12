bool esEtiquetaSeccion(String texto) {
  final limpio = texto.trim();

  return RegExp(r'^=+\s*.+?\s*=+$').hasMatch(limpio) ||
      RegExp(
        r'^(intro|coro|puente|estrofa|verso|final|instrumental|interludio|outro|bridge|pre[\s-]?coro)'
        r'(?:\s+\d+)?\s*:?\s*$',
        caseSensitive: false,
      ).hasMatch(limpio);
}

final RegExp _acordeSimpleRegex = RegExp(
  r'^[A-G][#b]?'
  r'(?:m|maj|min|dim|aug|sus|add)?'
  r'\d*'
  r'(?:sus\d+|add\d+)?'
  r'(?:\((?:[#b]?\d+)(?:,[#b]?\d+)*\))?'
  r'(?:/[A-G][#b]?)?$',
  caseSensitive: false,
);

bool _esTokenAcorde(String token) {
  var limpio = token.trim();

  if (limpio.isEmpty) {
    return false;
  }

  limpio = limpio.replaceAll(RegExp(r'^[\[\]\*]+|[\[\]\*]+$'), '');

  if (_acordeSimpleRegex.hasMatch(limpio)) {
    return true;
  }

  // Conserva progresiones compactas como:
  // Em-D
  // G-D
  // Bm-A-G
  final partes = limpio.split(RegExp(r'[-–—]'));

  if (partes.length > 1) {
    return partes.every(
      (parte) =>
          parte.trim().isNotEmpty && _acordeSimpleRegex.hasMatch(parte.trim()),
    );
  }

  return false;
}

bool esLineaDeAcordes(String texto) {
  var temp = texto.trim();

  if (temp.isEmpty || esEtiquetaSeccion(temp)) {
    return false;
  }

  // Para detectar líneas copiadas como:
  // //C#/A – D//
  // ////Bm - G - D - A////
  final sinDecoradores = temp
      .replaceFirst(RegExp(r'^/{2,}\s*'), '')
      .replaceFirst(RegExp(r'\s*/{2,}$'), '');

  if (sinDecoradores != temp) {
    temp = sinDecoradores.trim();
  }

  final palabras = temp.split(RegExp(r'\s+'));

  var encontroAcorde = false;

  for (final palabra in palabras) {
    if (palabra == '|' ||
        palabra == '-' ||
        palabra == '–' ||
        palabra == '—' ||
        palabra == '[-]') {
      continue;
    }

    if (!_esTokenAcorde(palabra)) {
      return false;
    }

    encontroAcorde = true;
  }

  return encontroAcorde;
}

String normalizarTextoImportado(String entrada) {
  final texto = entrada
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceAll('\u2028', '\n')
      .replaceAll('\u2029', '\n')
      .replaceAll('\u00A0', ' ')
      .replaceAll(RegExp(r'[\u200B-\u200D\u2060\uFEFF]'), '')
      .replaceAll('\t', '    ');

  final salida = <String>[];

  final seccionConContenido = RegExp(
    r'^\s*(intro|coro|puente|estrofa|verso|final|instrumental|interludio|outro|bridge|pre[\s-]?coro)'
    r'(\s+\d+)?\s*:\s*(.+)$',
    caseSensitive: false,
  );

  for (final lineaOriginal in texto.split('\n')) {
    // Eliminamos solo espacios de la derecha.
    // Los de la izquierda son importantes para la posición de acordes.
    final linea = lineaOriginal.replaceFirst(RegExp(r'\s+$'), '');

    final match = seccionConContenido.firstMatch(linea);

    if (match != null) {
      final nombreSeccion = '${match.group(1) ?? ''}${match.group(2) ?? ''}:';

      final contenido = (match.group(3) ?? '').trim();

      final sinDecoradores = contenido
          .replaceFirst(RegExp(r'^/{2,}\s*'), '')
          .replaceFirst(RegExp(r'\s*/{2,}$'), '')
          .trim();

      if (esLineaDeAcordes(sinDecoradores)) {
        salida.add(nombreSeccion);
        salida.add(sinDecoradores);
        continue;
      }
    }

    // No borrar // si pertenecen a una frase normal:
    //
    // //Que toda la Creación
    //
    // Solo se eliminan si el contenido es realmente musical.
    final candidatoMusical = linea
        .trim()
        .replaceFirst(RegExp(r'^/{2,}\s*'), '')
        .replaceFirst(RegExp(r'\s*/{2,}$'), '')
        .trim();

    if (candidatoMusical != linea.trim() &&
        esLineaDeAcordes(candidatoMusical)) {
      final sangria = RegExp(r'^ *').firstMatch(linea)!.group(0)!;
      salida.add('$sangria$candidatoMusical');
      continue;
    }

    salida.add(linea);
  }

  // Evita cantidades excesivas de líneas vacías.
  return salida.join('\n').replaceAll(RegExp(r'\n{4,}'), '\n\n\n');
}
