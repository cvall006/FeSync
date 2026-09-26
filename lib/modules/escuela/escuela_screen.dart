import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/app_models.dart';
import 'escuela_models.dart';
import 'escuela_evaluaciones_screen.dart';

class EscuelaScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const EscuelaScreen({super.key, required this.usuario});

  @override
  State<EscuelaScreen> createState() => _EscuelaScreenState();
}

class _EscuelaScreenState extends State<EscuelaScreen> {
  final TextEditingController _buscarCtrl = TextEditingController();

  String _busqueda = '';

  CollectionReference get _modulosRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('escuela_modulos');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  @override
  void dispose() {
    _buscarCtrl.dispose();
    super.dispose();
  }

  Future<void> _abrirLink(String link) async {
    final uri = Uri.tryParse(link.trim());

    if (uri == null) {
      return;
    }

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _editarModulo({EscuelaModuloModel? modulo}) async {
    final tituloCtrl = TextEditingController(text: modulo?.titulo ?? '');

    final descripcionCtrl = TextEditingController(
      text: modulo?.descripcion ?? '',
    );

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A1D24),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
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
                  modulo == null ? 'Crear Módulo' : 'Editar Módulo',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: tituloCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Título del módulo',
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: descripcionCtrl,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Descripción del módulo',
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF59E0B),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                    ),
                    onPressed: () async {
                      if (tituloCtrl.text.trim().isEmpty) {
                        return;
                      }

                      if (modulo == null) {
                        await _modulosRef.add({
                          'titulo': tituloCtrl.text.trim(),
                          'descripcion': descripcionCtrl.text.trim(),
                          'creadorUid': widget.usuario.uid,
                          'fechaCreacion': DateTime.now().toIso8601String(),
                          'clases': <Map<String, dynamic>>[],
                        });
                      } else {
                        await _modulosRef.doc(modulo.id).update({
                          'titulo': tituloCtrl.text.trim(),
                          'descripcion': descripcionCtrl.text.trim(),
                        });
                      }

                      if (!ctx.mounted) {
                        return;
                      }

                      Navigator.pop(ctx);
                    },
                    child: Text(
                      modulo == null ? 'Crear Módulo' : 'Actualizar Módulo',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    tituloCtrl.dispose();
    descripcionCtrl.dispose();
  }

  Future<void> _eliminarModulo(EscuelaModuloModel modulo) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1A1D24),
              title: const Text(
                'Eliminar módulo',
                style: TextStyle(color: Colors.white),
              ),
              content: Text(
                '¿Deseas eliminar "${modulo.titulo}" y todas sus clases?',
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

    await _modulosRef.doc(modulo.id).delete();
  }

  Future<void> _editarClase(
    EscuelaModuloModel modulo, {
    EscuelaClaseModel? clase,
  }) async {
    final tituloCtrl = TextEditingController(text: clase?.titulo ?? '');

    final descripcionCtrl = TextEditingController(
      text: clase?.descripcion ?? '',
    );

    final videoCtrl = TextEditingController(text: clase?.linkVideo ?? '');

    final pdfCtrl = TextEditingController(text: clase?.linkPdf ?? '');

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return Dialog(
          backgroundColor: const Color(0xFF1A1D24),
          insetPadding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      clase == null ? 'Agregar Clase' : 'Editar Clase',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: tituloCtrl,
                      decoration: const InputDecoration(
                        labelText:
                            'Título de la clase (ej: Clase 1 - El Fundamento)',
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: descripcionCtrl,
                      minLines: 2,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Resumen corto',
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: videoCtrl,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        labelText: 'Link de YouTube / Meet',
                        prefixIcon: Icon(Icons.video_camera_back),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: pdfCtrl,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        labelText: 'Link del PDF (Google Drive)',
                        prefixIcon: Icon(Icons.picture_as_pdf),
                      ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFF59E0B),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24),
                          ),
                        ),
                        onPressed: () async {
                          if (tituloCtrl.text.trim().isEmpty) {
                            return;
                          }

                          final clasesActualizadas = modulo.clases
                              .map((e) => e.toMap())
                              .toList();

                          if (clase == null) {
                            clasesActualizadas.add({
                              'id': DateTime.now().millisecondsSinceEpoch
                                  .toString(),
                              'titulo': tituloCtrl.text.trim(),
                              'descripcion': descripcionCtrl.text.trim(),
                              'linkVideo': videoCtrl.text.trim(),
                              'linkPdf': pdfCtrl.text.trim(),
                            });
                          } else {
                            final index = clasesActualizadas.indexWhere(
                              (item) => item['id']?.toString() == clase.id,
                            );

                            if (index != -1) {
                              clasesActualizadas[index] = {
                                'id': clase.id,
                                'titulo': tituloCtrl.text.trim(),
                                'descripcion': descripcionCtrl.text.trim(),
                                'linkVideo': videoCtrl.text.trim(),
                                'linkPdf': pdfCtrl.text.trim(),
                              };
                            }
                          }

                          await _modulosRef.doc(modulo.id).update({
                            'clases': clasesActualizadas,
                          });

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        child: Text(
                          clase == null ? 'Agregar Clase' : 'Actualizar Clase',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );

    tituloCtrl.dispose();
    descripcionCtrl.dispose();
    videoCtrl.dispose();
    pdfCtrl.dispose();
  }

  Future<void> _eliminarClase(
    EscuelaModuloModel modulo,
    EscuelaClaseModel clase,
  ) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1A1D24),
              title: const Text(
                'Eliminar clase',
                style: TextStyle(color: Colors.white),
              ),
              content: Text(
                '¿Deseas eliminar "${clase.titulo}"?',
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

    final clasesActualizadas = modulo.clases
        .where((item) => item.id != clase.id)
        .map((item) => item.toMap())
        .toList();

    await _modulosRef.doc(modulo.id).update({'clases': clasesActualizadas});
  }

  void _abrirEvaluaciones(EscuelaModuloModel modulo) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            EscuelaEvaluacionesScreen(usuario: widget.usuario, modulo: modulo),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text(
          'Escuela Bíblica',
          style: TextStyle(color: Colors.white),
        ),
      ),
      floatingActionButton: _esAdmin
          ? FloatingActionButton.extended(
              backgroundColor: const Color(0xFFF59E0B),
              foregroundColor: Colors.white,
              onPressed: () {
                _editarModulo();
              },
              icon: const Icon(Icons.add_box),
              label: const Text('Crear Módulo'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: TextField(
              controller: _buscarCtrl,
              onChanged: (value) {
                setState(() {
                  _busqueda = value.trim().toLowerCase();
                });
              },
              decoration: InputDecoration(
                hintText: 'Buscar módulo...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: const Color(0xFF11151A),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFF334155)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFF334155)),
                ),
              ),
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _modulosRef.snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Text(
                      'Error al cargar Escuela:\n${snapshot.error}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.redAccent),
                    ),
                  );
                }

                final modulos =
                    snapshot.data?.docs
                        .map((doc) {
                          return EscuelaModuloModel.fromMap(
                            doc.data() as Map<String, dynamic>,
                            doc.id,
                          );
                        })
                        .where((modulo) {
                          if (_busqueda.isEmpty) {
                            return true;
                          }

                          return modulo.titulo.toLowerCase().contains(
                                _busqueda,
                              ) ||
                              modulo.descripcion.toLowerCase().contains(
                                _busqueda,
                              );
                        })
                        .toList() ??
                    [];

                modulos.sort((a, b) {
                  final fechaA =
                      a.fechaCreacion ?? DateTime.fromMillisecondsSinceEpoch(0);
                  final fechaB =
                      b.fechaCreacion ?? DateTime.fromMillisecondsSinceEpoch(0);

                  return fechaB.compareTo(fechaA);
                });

                if (modulos.isEmpty) {
                  return const Center(
                    child: Text(
                      'No hay módulos disponibles.',
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                  itemCount: modulos.length,
                  itemBuilder: (context, index) {
                    final modulo = modulos[index];

                    return Card(
                      margin: const EdgeInsets.only(bottom: 18),
                      color: const Color(0xFF161B22),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: Color(0xFF334155)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'MÓDULO',
                                        style: TextStyle(
                                          color: Color(0xFFF59E0B),
                                          fontWeight: FontWeight.bold,
                                          fontSize: 12,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        modulo.titulo,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 22,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        modulo.descripcion,
                                        style: const TextStyle(
                                          color: Color(0xFF94A3B8),
                                          fontSize: 14,
                                          height: 1.4,
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
                                        _editarModulo(modulo: modulo);
                                      }

                                      if (value == 'eliminar') {
                                        _eliminarModulo(modulo);
                                      }
                                    },
                                    itemBuilder: (context) => const [
                                      PopupMenuItem(
                                        value: 'editar',
                                        child: Text('Editar módulo'),
                                      ),
                                      PopupMenuItem(
                                        value: 'eliminar',
                                        child: Text(
                                          'Eliminar módulo',
                                          style: TextStyle(
                                            color: Colors.redAccent,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF334155),
                                  foregroundColor: Colors.white,
                                ),
                                onPressed: () {
                                  _abrirEvaluaciones(modulo);
                                },
                                icon: const Icon(Icons.fact_check),
                                label: const Text(
                                  'Calificaciones y Asistencia',
                                ),
                              ),
                            ),
                            const Divider(color: Color(0xFF334155), height: 36),
                            ...modulo.clases.map((clase) {
                              return Container(
                                width: double.infinity,
                                margin: const EdgeInsets.only(bottom: 14),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0F1115),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: const Color(0xFF26313D),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            clase.titulo,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 17,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                        if (_esAdmin)
                                          IconButton(
                                            tooltip: 'Editar clase',
                                            onPressed: () {
                                              _editarClase(
                                                modulo,
                                                clase: clase,
                                              );
                                            },
                                            icon: const Icon(
                                              Icons.edit,
                                              color: Colors.white70,
                                            ),
                                          ),
                                        if (_esAdmin)
                                          IconButton(
                                            tooltip: 'Eliminar clase',
                                            onPressed: () {
                                              _eliminarClase(modulo, clase);
                                            },
                                            icon: const Icon(
                                              Icons.delete_outline,
                                              color: Colors.redAccent,
                                            ),
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      clase.descripcion,
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                        height: 1.45,
                                      ),
                                    ),
                                    if (clase.linkVideo.isNotEmpty ||
                                        clase.linkPdf.isNotEmpty) ...[
                                      const SizedBox(height: 12),
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 8,
                                        children: [
                                          if (clase.linkVideo.isNotEmpty)
                                            OutlinedButton.icon(
                                              onPressed: () {
                                                _abrirLink(clase.linkVideo);
                                              },
                                              icon: const Icon(
                                                Icons.play_circle_outline,
                                              ),
                                              label: const Text('Video / Meet'),
                                            ),
                                          if (clase.linkPdf.isNotEmpty)
                                            OutlinedButton.icon(
                                              onPressed: () {
                                                _abrirLink(clase.linkPdf);
                                              },
                                              icon: const Icon(
                                                Icons.picture_as_pdf,
                                              ),
                                              label: const Text('PDF'),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            }),
                            if (_esAdmin)
                              TextButton.icon(
                                onPressed: () {
                                  _editarClase(modulo);
                                },
                                icon: const Icon(
                                  Icons.add_circle_outline,
                                  color: Color(0xFFF59E0B),
                                ),
                                label: const Text(
                                  'Agregar Clase',
                                  style: TextStyle(color: Color(0xFFF59E0B)),
                                ),
                              ),
                          ],
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
