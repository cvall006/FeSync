import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/app_models.dart';
import 'capacitaciones_models.dart';

class CapacitacionesScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const CapacitacionesScreen({super.key, required this.usuario});

  @override
  State<CapacitacionesScreen> createState() => _CapacitacionesScreenState();
}

class _CapacitacionesScreenState extends State<CapacitacionesScreen> {
  final TextEditingController _buscarCtrl = TextEditingController();

  String _busqueda = '';

  CollectionReference get _capacitacionesRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('capacitaciones');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  @override
  void dispose() {
    _buscarCtrl.dispose();
    super.dispose();
  }

  String? _obtenerYoutubeId(String url) {
    final uri = Uri.tryParse(url);

    if (uri == null) {
      return null;
    }

    if (uri.host.contains('youtu.be')) {
      if (uri.pathSegments.isNotEmpty) {
        return uri.pathSegments.first;
      }
    }

    if (uri.host.contains('youtube.com')) {
      final videoId = uri.queryParameters['v'];

      if (videoId != null && videoId.isNotEmpty) {
        return videoId;
      }

      final segmentos = uri.pathSegments;

      final liveIndex = segmentos.indexOf('live');
      if (liveIndex != -1 && liveIndex + 1 < segmentos.length) {
        return segmentos[liveIndex + 1];
      }

      final shortsIndex = segmentos.indexOf('shorts');
      if (shortsIndex != -1 && shortsIndex + 1 < segmentos.length) {
        return segmentos[shortsIndex + 1];
      }

      final embedIndex = segmentos.indexOf('embed');
      if (embedIndex != -1 && embedIndex + 1 < segmentos.length) {
        return segmentos[embedIndex + 1];
      }
    }

    return null;
  }

  String? _obtenerMiniaturaYoutube(String url) {
    final id = _obtenerYoutubeId(url);

    if (id == null || id.isEmpty) {
      return null;
    }

    return 'https://img.youtube.com/vi/$id/hqdefault.jpg';
  }

  Future<void> _abrirVideo(String link) async {
    final uri = Uri.tryParse(link);

    if (uri == null) {
      return;
    }

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _abrirEditor({CapacitacionModel? existente}) async {
    final tituloCtrl = TextEditingController(text: existente?.titulo ?? '');

    final descripcionCtrl = TextEditingController(
      text: existente?.descripcion ?? '',
    );

    final contenidoCtrl = TextEditingController(
      text: existente?.contenido ?? '',
    );

    final linkCtrl = TextEditingController(text: existente?.linkVideo ?? '');

    String tipoSeleccionado = existente?.tipo == 'texto' ? 'texto' : 'video';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A1D24),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      existente == null
                          ? 'Nueva Capacitación'
                          : 'Editar Capacitación',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 20),
                    DropdownButtonFormField<String>(
                      initialValue: tipoSeleccionado,
                      dropdownColor: const Color(0xFF1A1D24),
                      decoration: const InputDecoration(
                        labelText: 'Tipo de capacitación',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'video',
                          child: Text('Video de YouTube'),
                        ),
                        DropdownMenuItem(
                          value: 'texto',
                          child: Text('Lectura / Reflexión'),
                        ),
                      ],
                      onChanged: (value) {
                        if (value == null) {
                          return;
                        }

                        setModalState(() {
                          tipoSeleccionado = value;
                        });
                      },
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: tituloCtrl,
                      decoration: const InputDecoration(labelText: 'Título'),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: descripcionCtrl,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Breve descripción (subtítulo)',
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (tipoSeleccionado == 'video')
                      TextField(
                        controller: linkCtrl,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(
                          labelText: 'Link del video (YouTube)',
                          prefixIcon: Icon(Icons.link),
                        ),
                      )
                    else
                      TextField(
                        controller: contenidoCtrl,
                        minLines: 5,
                        maxLines: 12,
                        decoration: const InputDecoration(
                          labelText: 'Contenido de la lectura / reflexión',
                          alignLabelWithHint: true,
                        ),
                      ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF06B6D4),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(28),
                          ),
                        ),
                        onPressed: () async {
                          if (tituloCtrl.text.trim().isEmpty) {
                            return;
                          }

                          if (tipoSeleccionado == 'video' &&
                              linkCtrl.text.trim().isEmpty) {
                            return;
                          }

                          if (tipoSeleccionado == 'texto' &&
                              contenidoCtrl.text.trim().isEmpty) {
                            return;
                          }

                          final datos = {
                            'titulo': tituloCtrl.text.trim(),
                            'descripcion': descripcionCtrl.text.trim(),
                            'tipo': tipoSeleccionado,
                            'linkVideo': tipoSeleccionado == 'video'
                                ? linkCtrl.text.trim()
                                : '',
                            'contenido': tipoSeleccionado == 'texto'
                                ? contenidoCtrl.text.trim()
                                : '',
                          };

                          if (existente == null) {
                            await _capacitacionesRef.add({
                              ...datos,
                              'fechaCreacion': FieldValue.serverTimestamp(),
                            });
                          } else {
                            await _capacitacionesRef
                                .doc(existente.id)
                                .update(datos);
                          }

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        child: Text(
                          existente == null ? 'Publicar' : 'Guardar Cambios',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    tituloCtrl.dispose();
    descripcionCtrl.dispose();
    contenidoCtrl.dispose();
    linkCtrl.dispose();
  }

  Future<void> _eliminar(CapacitacionModel capacitacion) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1A1D24),
              title: const Text(
                'Eliminar capacitación',
                style: TextStyle(color: Colors.white),
              ),
              content: Text(
                '¿Deseas eliminar "${capacitacion.titulo}"?',
                style: const TextStyle(color: Color(0xFF94A3B8)),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx, false);
                  },
                  child: const Text('Cancelar'),
                ),
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx, true);
                  },
                  child: const Text(
                    'Eliminar',
                    style: TextStyle(color: Colors.redAccent),
                  ),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!confirmado) {
      return;
    }

    await _capacitacionesRef.doc(capacitacion.id).delete();
  }

  void _abrirCapacitacion(CapacitacionModel capacitacion) {
    if (capacitacion.esVideo) {
      _abrirVideo(capacitacion.linkVideo);
      return;
    }

    showDialog<void>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1A1D24),
          title: Text(
            capacitacion.titulo,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
          content: SingleChildScrollView(
            child: Text(
              capacitacion.contenido,
              style: const TextStyle(color: Color(0xFFCBD5E1), height: 1.5),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
              },
              child: const Text('Cerrar'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1115),
        title: const Text(
          'Capacitaciones',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
      ),
      floatingActionButton: _esAdmin
          ? FloatingActionButton(
              backgroundColor: const Color(0xFF06B6D4),
              onPressed: () {
                _abrirEditor();
              },
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
            child: TextField(
              controller: _buscarCtrl,
              onChanged: (value) {
                setState(() {
                  _busqueda = value.trim().toLowerCase();
                });
              },
              decoration: InputDecoration(
                hintText: 'Buscar por título o tema...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: const Color(0xFF11151A),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFF26313D)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFF26313D)),
                ),
              ),
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _capacitacionesRef
                  .orderBy('fechaCreacion', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No fue posible cargar las capacitaciones.\n'
                        '${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.redAccent),
                      ),
                    ),
                  );
                }

                final capacitaciones =
                    snapshot.data?.docs
                        .map((doc) {
                          return CapacitacionModel.fromMap(
                            doc.data() as Map<String, dynamic>,
                            doc.id,
                          );
                        })
                        .where((capacitacion) {
                          if (_busqueda.isEmpty) {
                            return true;
                          }

                          return capacitacion.titulo.toLowerCase().contains(
                                _busqueda,
                              ) ||
                              capacitacion.descripcion.toLowerCase().contains(
                                _busqueda,
                              ) ||
                              capacitacion.contenido.toLowerCase().contains(
                                _busqueda,
                              );
                        })
                        .toList() ??
                    [];

                if (capacitaciones.isEmpty) {
                  return const Center(
                    child: Text(
                      'No hay capacitaciones disponibles.',
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 90),
                  itemCount: capacitaciones.length,
                  itemBuilder: (context, index) {
                    final capacitacion = capacitaciones[index];

                    final miniatura = capacitacion.esVideo
                        ? _obtenerMiniaturaYoutube(capacitacion.linkVideo)
                        : null;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 16),
                      color: const Color(0xFF11151A),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: Color(0xFF26313D)),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: () {
                          _abrirCapacitacion(capacitacion);
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 120,
                                height: 82,
                                clipBehavior: Clip.antiAlias,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1A1D24),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: miniatura != null
                                    ? Image.network(
                                        miniatura,
                                        fit: BoxFit.cover,
                                        errorBuilder:
                                            (context, error, stackTrace) {
                                              return const Icon(
                                                Icons.play_circle_outline,
                                                size: 36,
                                                color: Color(0xFF06B6D4),
                                              );
                                            },
                                      )
                                    : const Icon(
                                        Icons.menu_book,
                                        size: 36,
                                        color: Color(0xFF06B6D4),
                                      ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: capacitacion.esVideo
                                            ? Colors.red.withValues(alpha: 0.15)
                                            : const Color(0xFF06B6D4)
                                                  .withValues(alpha: 0.15),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        capacitacion.esVideo
                                            ? 'VIDEO'
                                            : 'LECTURA',
                                        style: TextStyle(
                                          color: capacitacion.esVideo
                                              ? Colors.redAccent
                                              : const Color(0xFF06B6D4),
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(
                                      capacitacion.titulo,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 17,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      capacitacion.descripcion,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (_esAdmin)
                                PopupMenuButton<String>(
                                  color: const Color(0xFF1A1D24),
                                  icon: const Icon(
                                    Icons.more_vert,
                                    color: Colors.grey,
                                  ),
                                  onSelected: (value) {
                                    if (value == 'editar') {
                                      _abrirEditor(existente: capacitacion);
                                    }

                                    if (value == 'eliminar') {
                                      _eliminar(capacitacion);
                                    }
                                  },
                                  itemBuilder: (context) => const [
                                    PopupMenuItem(
                                      value: 'editar',
                                      child: Text('Editar'),
                                    ),
                                    PopupMenuItem(
                                      value: 'eliminar',
                                      child: Text(
                                        'Eliminar',
                                        style: TextStyle(
                                          color: Colors.redAccent,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
