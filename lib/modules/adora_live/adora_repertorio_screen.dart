import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'adora_models.dart';
import 'adora_visor_cancion_screen.dart';

class AdoraRepertorioScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const AdoraRepertorioScreen({super.key, required this.usuario});

  @override
  State<AdoraRepertorioScreen> createState() => _AdoraRepertorioScreenState();
}

class _AdoraRepertorioScreenState extends State<AdoraRepertorioScreen> {
  CollectionReference get _cancionesRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('adora_canciones');

  bool get _puedeGestionar =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  Future<void> _abrirEditor({AdoraCancionModel? cancion}) async {
    final tituloCtrl = TextEditingController(text: cancion?.titulo ?? '');

    final autorCtrl = TextEditingController(text: cancion?.autor ?? '');

    final tonoCtrl = TextEditingController(text: cancion?.tono ?? '');

    final vozCtrl = TextEditingController(text: cancion?.vozPrincipal ?? '');

    final youtubeCtrl = TextEditingController(text: cancion?.youtube ?? '');

    final letraCtrl = TextEditingController(text: cancion?.letra ?? '');

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
                  cancion == null ? 'Nueva Canción' : 'Editar Canción',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: tituloCtrl,
                  decoration: const InputDecoration(labelText: 'Título'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: autorCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Autor original',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: tonoCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Tono (ej: Do)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: TextField(
                        controller: vozCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Voz Principal (ej: Juan)',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: youtubeCtrl,
                  minLines: 2,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Links de Tutoriales (Uno por línea)',
                    alignLabelWithHint: true,
                    hintText:
                        'Guitarra: https://youtube.com/...\n'
                        'Piano: https://youtube.com/...',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: letraCtrl,
                  minLines: 10,
                  maxLines: 20,
                  style: const TextStyle(fontFamily: 'Courier'),
                  decoration: const InputDecoration(
                    labelText: 'Letra con acordes [Do]',
                    alignLabelWithHint: true,
                    hintText:
                        'Intro:\n'
                        '[Bm] [-] [G] [-] [D] [-] [A]\n\n'
                        'Qu[Bm]iero levantar a ti[G] mis manos...',
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                    ),
                    onPressed: () async {
                      if (tituloCtrl.text.trim().isEmpty) {
                        return;
                      }

                      final datos = {
                        'titulo': tituloCtrl.text.trim(),
                        'autor': autorCtrl.text.trim(),
                        'tono': tonoCtrl.text.trim(),
                        'voz_principal': vozCtrl.text.trim(),
                        'youtube': youtubeCtrl.text.trim(),
                        'letra': letraCtrl.text.trim(),
                        'creadorUid': cancion?.creadorUid.isNotEmpty == true
                            ? cancion!.creadorUid
                            : widget.usuario.uid,
                      };

                      if (cancion == null) {
                        await _cancionesRef.add({
                          ...datos,
                          'fechaCreacion': FieldValue.serverTimestamp(),
                        });
                      } else {
                        await _cancionesRef.doc(cancion.id).update(datos);
                      }

                      if (!ctx.mounted) {
                        return;
                      }

                      Navigator.pop(ctx);
                    },
                    child: Text(
                      cancion == null ? 'Guardar Canción' : 'Guardar Canción',
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
    autorCtrl.dispose();
    tonoCtrl.dispose();
    vozCtrl.dispose();
    youtubeCtrl.dispose();
    letraCtrl.dispose();
  }

  Future<void> _eliminarCancion(AdoraCancionModel cancion) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              backgroundColor: const Color(0xFF1A1D24),
              title: const Text(
                'Eliminar canción',
                style: TextStyle(color: Colors.white),
              ),
              content: Text(
                '¿Deseas eliminar "${cancion.titulo}" del repertorio?',
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

    await _cancionesRef.doc(cancion.id).delete();
  }

  Future<void> _abrirCancion(AdoraCancionModel cancion) async {
    final resultado = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => AdoraVisorCancionScreen(
          cancion: cancion,
          puedeEditar: _puedeGestionar,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    if (resultado == 'editar') {
      await _abrirEditor(cancion: cancion);
    }
  }

  String _descripcionCancion(AdoraCancionModel cancion) {
    final partes = <String>[];

    if (cancion.autor.isNotEmpty) {
      partes.add(cancion.autor);
    }

    if (cancion.tono.isNotEmpty) {
      partes.add('Tono: ${cancion.tono}');
    }

    if (cancion.vozPrincipal.isNotEmpty) {
      partes.add('🎤 ${cancion.vozPrincipal}');
    }

    return partes.join(' • ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Repertorio General',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                if (_puedeGestionar)
                  IconButton(
                    tooltip: 'Agregar canción',
                    icon: const Icon(
                      Icons.add_circle,
                      color: Color(0xFF3B82F6),
                      size: 36,
                    ),
                    onPressed: () {
                      _abrirEditor();
                    },
                  ),
              ],
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _cancionesRef.orderBy('titulo').snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No fue posible cargar el repertorio.\n'
                        '${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.redAccent),
                      ),
                    ),
                  );
                }

                final canciones =
                    snapshot.data?.docs.map((doc) {
                      return AdoraCancionModel.fromMap(
                        doc.data() as Map<String, dynamic>,
                        doc.id,
                      );
                    }).toList() ??
                    [];

                if (canciones.isEmpty) {
                  return const Center(
                    child: Text(
                      'No hay canciones en el repertorio.',
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                  itemCount: canciones.length,
                  itemBuilder: (context, index) {
                    final cancion = canciones[index];

                    final descripcion = _descripcionCancion(cancion);

                    return Card(
                      color: const Color(0xFF1A1D24),
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: Color(0xFF334155)),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF3B82F6)
                              .withValues(alpha: 0.18),
                          child: const Icon(
                            Icons.music_note,
                            color: Color(0xFF60A5FA),
                          ),
                        ),
                        title: Text(
                          cancion.titulo,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        subtitle: Text(
                          descripcion.isEmpty
                              ? 'Sin información adicional'
                              : descripcion,
                          style: const TextStyle(color: Color(0xFFCBD5E1)),
                        ),
                        trailing: _puedeGestionar
                            ? PopupMenuButton<String>(
                                color: const Color(0xFF1A1D24),
                                onSelected: (value) {
                                  if (value == 'editar') {
                                    _abrirEditor(cancion: cancion);
                                  }

                                  if (value == 'eliminar') {
                                    _eliminarCancion(cancion);
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
                                      style: TextStyle(color: Colors.redAccent),
                                    ),
                                  ),
                                ],
                              )
                            : const Icon(Icons.play_arrow, color: Colors.grey),
                        onTap: () {
                          _abrirCancion(cancion);
                        },
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
