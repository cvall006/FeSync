import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'adora_models.dart';
import 'adora_editor_cancion.dart';
import 'adora_filtros_repertorio.dart';
import 'adora_visor_cancion_screen.dart';

class AdoraRepertorioScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const AdoraRepertorioScreen({super.key, required this.usuario});

  @override
  State<AdoraRepertorioScreen> createState() => _AdoraRepertorioScreenState();
}

class _AdoraRepertorioScreenState extends State<AdoraRepertorioScreen> {
  final _busquedaCtrl = TextEditingController();
  String _tonoFiltro = '';
  late Stream<QuerySnapshot> _cancionesStream;

  @override
  void initState() {
    super.initState();
    _cancionesStream = _cancionesRef.orderBy('titulo').snapshots();
  }

  @override
  void didUpdateWidget(covariant AdoraRepertorioScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.usuario.iglesiaId != widget.usuario.iglesiaId) {
      _busquedaCtrl.clear();
      _tonoFiltro = '';
      _cancionesStream = _cancionesRef.orderBy('titulo').snapshots();
    }
  }

  @override
  void dispose() {
    _busquedaCtrl.dispose();
    super.dispose();
  }

  CollectionReference get _cancionesRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('adora_canciones');

  bool get _puedeGestionar =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  Future<void> _abrirEditor({AdoraCancionModel? cancion}) async {
    await mostrarEditorAdoraCancion(
      context: context,
      creadorUid: widget.usuario.uid,
      cancion: cancion,
      guardar: (datos) async {
        if (cancion == null) {
          await _cancionesRef.add({
            ...datos,
            'fechaCreacion': FieldValue.serverTimestamp(),
          });
        } else {
          await _cancionesRef.doc(cancion.id).update(datos);
        }
      },
    );
  }

  Future<void> _eliminarCancion(AdoraCancionModel cancion) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              title: const Text('Eliminar canción'),
              content: Text(
                '¿Deseas eliminar '
                '"${cancion.titulo}" '
                'del repertorio?',
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
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final surface = theme.colorScheme.surface;

    final onSurface = theme.colorScheme.onSurface;

    final secondary = theme.colorScheme.onSurfaceVariant;

    final border = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Repertorio General',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: onSurface,
                    ),
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
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _busquedaCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Buscar canción',
                hintText: 'Nombre o parte del título',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _busquedaCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Limpiar búsqueda',
                        icon: const Icon(Icons.clear),
                        onPressed: () => setState(() => _busquedaCtrl.clear()),
                      ),
              ),
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _cancionesStream,
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
                    snapshot.data?.docs
                        .map(
                          (doc) => AdoraCancionModel.fromMap(
                            doc.data() as Map<String, dynamic>,
                            doc.id,
                          ),
                        )
                        .toList() ??
                    [];

                final filtradas = filtrarRepertorioAdora(
                  canciones,
                  nombre: _busquedaCtrl.text,
                  tono: _tonoFiltro,
                );
                final tonos = tonosDelRepertorio(
                  canciones,
                  seleccionado: _tonoFiltro,
                );

                final lista = ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                  itemCount: filtradas.length,
                  itemBuilder: (context, index) {
                    final cancion = filtradas[index];

                    final descripcion = _descripcionCancion(cancion);

                    return Card(
                      color: surface,
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: border),
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
                            color: Color(0xFF3B82F6),
                          ),
                        ),
                        title: Text(
                          cancion.titulo,
                          style: TextStyle(
                            color: onSurface,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        subtitle: Text(
                          descripcion.isEmpty
                              ? 'Sin información adicional'
                              : descripcion,
                          style: TextStyle(color: secondary),
                        ),
                        trailing: _puedeGestionar
                            ? PopupMenuButton<String>(
                                color: surface,
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
                            : Icon(Icons.play_arrow, color: secondary),
                        onTap: () {
                          _abrirCancion(cancion);
                        },
                      ),
                    );
                  },
                );
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: DropdownButtonFormField<String>(
                        key: ValueKey(_tonoFiltro),
                        initialValue: _tonoFiltro,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Tono musical',
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('Todos los tonos'),
                          ),
                          ...tonos.map(
                            (tono) => DropdownMenuItem(
                              value: tono,
                              child: Text(tono),
                            ),
                          ),
                        ],
                        onChanged: (tono) =>
                            setState(() => _tonoFiltro = tono ?? ''),
                      ),
                    ),
                    Expanded(
                      child: filtradas.isEmpty
                          ? Center(
                              child: Text(
                                'No se encontraron canciones\nPrueba con otro nombre o tono.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: secondary),
                              ),
                            )
                          : lista,
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
