import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'adora_models.dart';

class BloqueAcorde {
  final String acordeOriginal;
  final String letra;

  const BloqueAcorde({required this.acordeOriginal, required this.letra});
}

bool _esLineaDeAcordes(String texto) {
  String temp = texto.trim();

  if (temp.isEmpty) {
    return false;
  }

  temp = temp
      .replaceAll(
        RegExp(r'(intro|coro|puente|estrofa|final):?', caseSensitive: false),
        '',
      )
      .trim();

  if (temp.isEmpty) {
    return true;
  }

  final palabras = temp.split(RegExp(r'\s+'));

  final acordeRegex = RegExp(
    r'^[A-G][#b]?(m|maj|sus|dim|aug)?\d*(/[A-G][#b]?)?$',
    caseSensitive: false,
  );

  for (final palabra in palabras) {
    if (palabra == '|' || palabra == '-') {
      continue;
    }

    final limpia = palabra.replaceAll(RegExp(r'[\(\)\*]'), '');

    if (!acordeRegex.hasMatch(limpia)) {
      return false;
    }
  }

  return true;
}

List<BloqueAcorde> procesarLinea(String linea) {
  final bloques = <BloqueAcorde>[];

  if (!linea.contains('[')) {
    final lineaPreservada = linea.replaceAll(' ', '\u00A0');

    if (_esLineaDeAcordes(linea)) {
      return [BloqueAcorde(acordeOriginal: lineaPreservada, letra: '')];
    }

    return [BloqueAcorde(acordeOriginal: '', letra: lineaPreservada)];
  }

  final lineaTrim = linea.trim();

  if (lineaTrim.startsWith('[') &&
      lineaTrim.endsWith(']') &&
      !linea.substring(1, linea.length - 1).contains('[')) {
    return [
      BloqueAcorde(acordeOriginal: linea.replaceAll(' ', '\u00A0'), letra: ''),
    ];
  }

  final primerCorchete = linea.indexOf('[');

  if (primerCorchete > 0) {
    bloques.add(
      BloqueAcorde(
        acordeOriginal: '',
        letra: linea.substring(0, primerCorchete).replaceAll(' ', '\u00A0'),
      ),
    );
  }

  final regex = RegExp(r'\[(.*?)\]([^\[]*)');

  for (final match in regex.allMatches(linea)) {
    bloques.add(
      BloqueAcorde(
        acordeOriginal: match.group(1) ?? '',
        letra: (match.group(2) ?? '').replaceAll(' ', '\u00A0'),
      ),
    );
  }

  return bloques;
}

const notasMusicales = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

String transponerTextoAcorde(String textoAcorde, int pasos) {
  if (pasos == 0 || textoAcorde.isEmpty) {
    return textoAcorde;
  }

  final limpio = textoAcorde
      .replaceAll('Db', 'C#')
      .replaceAll('Eb', 'D#')
      .replaceAll('Gb', 'F#')
      .replaceAll('Ab', 'G#')
      .replaceAll('Bb', 'A#');

  return limpio.replaceAllMapped(RegExp(r'[CDEFGAB]#?'), (match) {
    final nota = match.group(0)!;
    final index = notasMusicales.indexOf(nota);

    if (index == -1) {
      return nota;
    }

    var nuevoIndex = (index + pasos) % 12;

    if (nuevoIndex < 0) {
      nuevoIndex += 12;
    }

    return notasMusicales[nuevoIndex];
  });
}

class AdoraVisorCancionScreen extends StatefulWidget {
  final AdoraCancionModel cancion;
  final bool puedeEditar;

  const AdoraVisorCancionScreen({
    super.key,
    required this.cancion,
    required this.puedeEditar,
  });

  @override
  State<AdoraVisorCancionScreen> createState() =>
      _AdoraVisorCancionScreenState();
}

class _AdoraVisorCancionScreenState extends State<AdoraVisorCancionScreen> {
  final ScrollController _scrollController = ScrollController();

  int _semitonos = 0;
  bool _autoScrollActivo = false;
  double _velocidadScroll = 1;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _iniciarAutoScroll() async {
    if (!_scrollController.hasClients || !_autoScrollActivo) {
      return;
    }

    final maxScroll = _scrollController.position.maxScrollExtent;

    final scrollActual = _scrollController.position.pixels;

    if (scrollActual >= maxScroll) {
      if (mounted) {
        setState(() {
          _autoScrollActivo = false;
        });
      }

      return;
    }

    final pixelesPorSegundo = 20.0 * _velocidadScroll;

    final distancia = maxScroll - scrollActual;

    var milisegundos = ((distancia / pixelesPorSegundo) * 1000).round();

    if (milisegundos < 100) {
      milisegundos = 100;
    }

    try {
      await _scrollController.animateTo(
        maxScroll,
        duration: Duration(milliseconds: milisegundos),
        curve: Curves.linear,
      );
    } catch (_) {
      return;
    }

    if (mounted && _autoScrollActivo) {
      setState(() {
        _autoScrollActivo = false;
      });
    }
  }

  void _detenerAutoScroll() {
    if (!_scrollController.hasClients) {
      return;
    }

    _scrollController.jumpTo(_scrollController.position.pixels);
  }

  void _alternarAutoScroll() {
    setState(() {
      _autoScrollActivo = !_autoScrollActivo;
    });

    if (_autoScrollActivo) {
      _iniciarAutoScroll();
    } else {
      _detenerAutoScroll();
    }
  }

  void _cambiarVelocidad(double valor) {
    setState(() {
      _velocidadScroll = valor;
    });

    if (_autoScrollActivo) {
      _detenerAutoScroll();
      _iniciarAutoScroll();
    }
  }

  @override
  Widget build(BuildContext context) {
    final lineas = widget.cancion.letra.split('\n');

    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: Text(widget.cancion.titulo),
        actions: [
          if (widget.puedeEditar)
            IconButton(
              tooltip: 'Editar canción',
              icon: const Icon(Icons.edit, color: Color(0xFF60A5FA)),
              onPressed: () {
                Navigator.pop(context, 'editar');
              },
            ),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: const Color(0xFF1A1D24),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.music_note,
                      color: Color(0xFF94A3B8),
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Tono: ${widget.cancion.tono.isEmpty ? "-" : widget.cancion.tono}',
                      style: const TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Bajar semitono',
                      icon: const Icon(
                        Icons.remove_circle_outline,
                        color: Color(0xFF60A5FA),
                      ),
                      onPressed: () {
                        setState(() {
                          _semitonos--;
                        });
                      },
                    ),
                    SizedBox(
                      width: 45,
                      child: Text(
                        _semitonos == 0
                            ? 'Orig'
                            : _semitonos > 0
                            ? '+$_semitonos'
                            : '$_semitonos',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Subir semitono',
                      icon: const Icon(
                        Icons.add_circle_outline,
                        color: Color(0xFF60A5FA),
                      ),
                      onPressed: () {
                        setState(() {
                          _semitonos++;
                        });
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: NotificationListener<UserScrollNotification>(
              onNotification: (notification) {
                if (notification.direction != ScrollDirection.idle &&
                    _autoScrollActivo) {
                  setState(() {
                    _autoScrollActivo = false;
                  });

                  _detenerAutoScroll();
                }

                return false;
              },
              child: SingleChildScrollView(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 100),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: lineas.map((linea) {
                      if (linea.trim().isEmpty) {
                        return const SizedBox(height: 16);
                      }

                      final bloques = procesarLinea(linea);

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: bloques.map((bloque) {
                            final acorde = transponerTextoAcorde(
                              bloque.acordeOriginal,
                              _semitonos,
                            );

                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (acorde.isNotEmpty)
                                  Text(
                                    acorde,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF60A5FA),
                                      fontSize: 18,
                                      fontFamily: 'Courier',
                                    ),
                                  ),
                                if (bloque.letra.isNotEmpty)
                                  Text(
                                    bloque.letra,
                                    style: const TextStyle(
                                      fontSize: 18,
                                      color: Colors.white,
                                      fontFamily: 'Courier',
                                      height: 1.2,
                                    ),
                                  ),
                              ],
                            );
                          }).toList(),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ),
          ),
          Container(
            color: const Color(0xFF1A1D24),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  FloatingActionButton.small(
                    heroTag: 'adora_autoscroll',
                    backgroundColor: _autoScrollActivo
                        ? Colors.redAccent
                        : const Color(0xFF3B82F6),
                    onPressed: _alternarAutoScroll,
                    child: Icon(
                      _autoScrollActivo ? Icons.pause : Icons.play_arrow,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 16),
                  const Icon(Icons.speed, color: Color(0xFF94A3B8), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Slider(
                      value: _velocidadScroll,
                      min: 0.5,
                      max: 3,
                      divisions: 10,
                      label: '${_velocidadScroll.toStringAsFixed(1)}x',
                      activeColor: const Color(0xFF3B82F6),
                      inactiveColor: const Color(0xFF334155),
                      onChanged: _cambiarVelocidad,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
