import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:url_launcher/url_launcher.dart';

import 'adora_models.dart';

class BloqueAcorde {
  final String acordeOriginal;
  final String letra;

  const BloqueAcorde({required this.acordeOriginal, required this.letra});
}

bool _esEtiquetaSeccion(String texto) {
  final limpio = texto.trim();

  if (RegExp(
    r'^(intro|coro|puente|estrofa|verso|final|instrumental|pre[\s-]?coro)\s*:?\s*$',
    caseSensitive: false,
  ).hasMatch(limpio)) {
    return true;
  }

  return RegExp(r'^=+\s*.+?\s*=+$').hasMatch(limpio);
}

bool _esLineaDeAcordes(String texto) {
  final temp = texto.trim();

  if (temp.isEmpty) {
    return false;
  }

  if (_esEtiquetaSeccion(temp)) {
    return false;
  }

  final palabras = temp.split(RegExp(r'\s+'));

  final acordeRegex = RegExp(
    r'^[A-G][#b]?(m|maj|sus|dim|aug)?\d*(/[A-G][#b]?)?$',
    caseSensitive: false,
  );

  for (final palabra in palabras) {
    if (palabra == '|' || palabra == '-' || palabra == '[-]') {
      continue;
    }

    final limpia = palabra.replaceAll(RegExp(r'[\[\]\(\)\*]'), '');

    if (limpia.isEmpty) {
      continue;
    }

    if (!acordeRegex.hasMatch(limpia)) {
      return false;
    }
  }

  return true;
}

List<BloqueAcorde> procesarLinea(String linea) {
  if (!linea.contains('[')) {
    final lineaPreservada = linea.replaceAll(' ', '\u00A0');

    if (_esLineaDeAcordes(linea)) {
      return [BloqueAcorde(acordeOriginal: lineaPreservada, letra: '')];
    }

    return [BloqueAcorde(acordeOriginal: '', letra: lineaPreservada)];
  }

  final bloques = <BloqueAcorde>[];

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
    final acorde = match.group(1) ?? '';

    final letra = match.group(2) ?? '';

    bloques.add(
      BloqueAcorde(
        acordeOriginal: acorde == '-' ? '' : acorde,
        letra: letra.replaceAll(' ', '\u00A0'),
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
  bool _mostrarAcordes = true;
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

  void _alternarAcordes() {
    setState(() {
      _mostrarAcordes = !_mostrarAcordes;
    });
  }

  Future<void> _abrirTutorial(String url) async {
    final uri = Uri.tryParse(url);

    if (uri == null || !await launchUrl(uri)) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No fue posible abrir el tutorial.')),
      );
    }
  }

  Future<void> _mostrarTutoriales() async {
    final tutoriales = widget.cancion.tutoriales;

    if (tutoriales.isEmpty) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1F1F1F),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Material de Ensayo / Guías',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                ...tutoriales.map(
                  (tutorial) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(
                      Icons.smart_display,
                      color: Colors.redAccent,
                    ),
                    title: Text(
                      tutorial.nombre,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    trailing: const Icon(
                      Icons.open_in_new,
                      color: Color(0xFF94A3B8),
                    ),
                    onTap: () async {
                      Navigator.pop(ctx);

                      await _abrirTutorial(tutorial.url);
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildLinea(String linea) {
    if (linea.trim().isEmpty) {
      return const SizedBox(height: 16);
    }

    final bloques = procesarLinea(linea);

    if (!_mostrarAcordes) {
      final soloLetra = bloques
          .map((bloque) => bloque.letra)
          .join()
          .replaceAll('\u00A0', ' ');

      if (soloLetra.trim().isEmpty) {
        return const SizedBox.shrink();
      }

      return Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Text(
          soloLetra,
          style: const TextStyle(
            fontSize: 18,
            color: Colors.white,
            height: 1.35,
          ),
        ),
      );
    }

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
                    color: Color(0xFF3B82F6),
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
          if (widget.cancion.tutoriales.isNotEmpty)
            IconButton(
              tooltip: 'Material de ensayo',
              onPressed: _mostrarTutoriales,
              icon: const Icon(Icons.smart_display, color: Colors.redAccent),
            ),
          IconButton(
            tooltip: _mostrarAcordes ? 'Solo letra' : 'Mostrar acordes',
            onPressed: _alternarAcordes,
            icon: Icon(
              Icons.mic,
              color: _mostrarAcordes
                  ? const Color(0xFF94A3B8)
                  : const Color(0xFF34D399),
            ),
          ),
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
          if (_mostrarAcordes)
            Container(
              color: const Color(0xFF1A1D24),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  const Icon(
                    Icons.music_note,
                    color: Color(0xFF94A3B8),
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Tono: ${widget.cancion.tono.isEmpty ? "-" : widget.cancion.tono}',
                    style: const TextStyle(color: Color(0xFF94A3B8)),
                  ),
                  if (widget.cancion.vozPrincipal.isNotEmpty) ...[
                    const SizedBox(width: 16),
                    const Icon(
                      Icons.person,
                      color: Color(0xFF60A5FA),
                      size: 18,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      widget.cancion.vozPrincipal,
                      style: const TextStyle(
                        color: Color(0xFFCBD5E1),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                  const Spacer(),
                  IconButton(
                    tooltip: 'Bajar semitono',
                    onPressed: () {
                      setState(() {
                        _semitonos--;
                      });
                    },
                    icon: const Icon(
                      Icons.remove_circle_outline,
                      color: Color(0xFF3B82F6),
                    ),
                  ),
                  Text(
                    _semitonos == 0
                        ? 'Orig'
                        : _semitonos > 0
                        ? '+$_semitonos'
                        : '$_semitonos',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Subir semitono',
                    onPressed: () {
                      setState(() {
                        _semitonos++;
                      });
                    },
                    icon: const Icon(
                      Icons.add_circle_outline,
                      color: Color(0xFF3B82F6),
                    ),
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
                child: Center(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: lineas.map(_buildLinea).toList(),
                    ),
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
