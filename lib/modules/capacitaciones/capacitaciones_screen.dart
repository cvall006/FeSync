import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'capacitaciones_detalle.dart';
import 'capacitaciones_editor.dart';
import 'capacitaciones_logica.dart';
import 'capacitaciones_models.dart';
import 'capacitaciones_service.dart';
import 'capacitaciones_widgets.dart';

class CapacitacionesScreen extends StatefulWidget {
  final UsuarioModel usuario;
  const CapacitacionesScreen({super.key, required this.usuario});
  @override
  State<CapacitacionesScreen> createState() => _CapacitacionesScreenState();
}

class _CapacitacionesScreenState extends State<CapacitacionesScreen> {
  late final CapacitacionesService _service;
  late final Stream<QuerySnapshot<Map<String, dynamic>>> _contenidos;
  late final Stream<QuerySnapshot<Map<String, dynamic>>> _categorias;
  final _buscar = TextEditingController();
  String? _categoriaId;
  String _nombreCategoria = 'General';
  bool _eliminando = false;
  bool get _administrador => puedeAdministrarCapacitaciones(widget.usuario);
  @override
  void initState() {
    super.initState();
    _service = CapacitacionesService(widget.usuario);
    _contenidos = _service.contenidos
        .orderBy('fechaCreacion', descending: true)
        .snapshots();
    _categorias = _service.categorias.snapshots();
  }

  @override
  void dispose() {
    _buscar.dispose();
    super.dispose();
  }

  Future<void> _editarContenido(
    List<CapacitacionCategoriaModel> categorias, {
    CapacitacionModel? contenido,
  }) async {
    if (!_administrador) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => CapacitacionEditor(
        service: _service,
        categorias: categorias,
        existente: contenido,
        categoriaInicial: _categoriaId ?? '',
      ),
    );
  }

  Future<void> _editarCategoria(
    List<CapacitacionCategoriaModel> categorias, {
    CapacitacionCategoriaModel? categoria,
  }) async {
    if (!_administrador) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => CategoriaCapacitacionEditor(
        service: _service,
        existente: categoria,
        ordenInicial: categorias.length,
      ),
    );
  }

  Future<void> _eliminar(CapacitacionModel contenido) async {
    if (!_administrador || _eliminando) return;
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar capacitación'),
        content: Text(
          '¿Deseas eliminar "${contenido.titulo}" y su archivo adjunto?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !mounted) return;
    setState(() => _eliminando = true);
    try {
      final aviso = await _service.eliminarContenido(contenido);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(aviso ?? 'Capacitación eliminada.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No fue posible eliminar: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _eliminando = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _categoriaId == null,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop && _categoriaId != null) {
        setState(() {
          _categoriaId = null;
          _buscar.clear();
        });
      }
    },
    child: Scaffold(
      appBar: AppBar(
        title: Text(_categoriaId == null ? 'Capacitaciones' : _nombreCategoria),
        leading: _categoriaId == null
            ? null
            : IconButton(
                tooltip: 'Volver a temas',
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() {
                  _categoriaId = null;
                  _buscar.clear();
                }),
              ),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _categorias,
        builder: (context, categoriasSnapshot) {
          if (categoriasSnapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final todasCategorias =
              categoriasSnapshot.data?.docs
                  .map(
                    (doc) =>
                        CapacitacionCategoriaModel.fromMap(doc.data(), doc.id),
                  )
                  .toList() ??
              [];
          final categorias = categoriasVisibles(
            todasCategorias,
            _administrador,
          );
          return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _contenidos,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'No fue posible cargar las capacitaciones.\n${snapshot.error}',
                    ),
                  ),
                );
              }
              final todos =
                  snapshot.data?.docs
                      .map(
                        (doc) => CapacitacionModel.fromMap(doc.data(), doc.id),
                      )
                      .toList() ??
                  [];
              final disponibles = todos.where((c) {
                if (_administrador) return true;
                if (categoriasSnapshot.hasError) return c.categoriaId.isEmpty;
                final categoria = todasCategorias
                    .where((cat) => cat.id == c.categoriaId)
                    .firstOrNull;
                return categoria == null || categoria.activa;
              }).toList();
              final coincidencias = filtrarCapacitaciones(
                disponibles,
                _buscar.text,
                categoriaId: _categoriaId,
                categorias: todasCategorias,
              );
              final verContenidos =
                  _categoriaId != null || _buscar.text.trim().isNotEmpty;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (categoriasSnapshot.hasError)
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Las categorías no están disponibles. Puedes consultar los contenidos de General.',
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: TextField(
                      controller: _buscar,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        labelText: 'Buscar por título o descripción',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _buscar.text.isEmpty
                            ? null
                            : IconButton(
                                onPressed: () =>
                                    setState(() => _buscar.clear()),
                                icon: const Icon(Icons.clear),
                                tooltip: 'Limpiar búsqueda',
                              ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: AccionesCapacitaciones(
                      usuario: widget.usuario,
                      nuevaCategoria: () => _editarCategoria(todasCategorias),
                      nuevoContenido: () => _editarContenido(todasCategorias),
                    ),
                  ),
                  if (_eliminando) const LinearProgressIndicator(),
                  const SizedBox(height: 12),
                  Expanded(
                    child: verContenidos
                        ? coincidencias.isEmpty
                              ? const Center(
                                  child: Text(
                                    'No hay contenidos que coincidan con la búsqueda.',
                                  ),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    0,
                                    16,
                                    24,
                                  ),
                                  itemCount: coincidencias.length,
                                  itemBuilder: (_, i) {
                                    final c = coincidencias[i];
                                    return TarjetaCapacitacion(
                                      capacitacion: c,
                                      abrir: () => Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              CapacitacionDetalleScreen(
                                                capacitacion: c,
                                                service: _service,
                                              ),
                                        ),
                                      ),
                                      editar: _administrador
                                          ? () => _editarContenido(
                                              todasCategorias,
                                              contenido: c,
                                            )
                                          : null,
                                      eliminar: _administrador && !_eliminando
                                          ? () => _eliminar(c)
                                          : null,
                                    );
                                  },
                                )
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                            children: [
                              Text(
                                'Temas',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              if (todasCategorias.isEmpty)
                                const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 12),
                                  child: Text(
                                    'Todavía no hay categorías. Los contenidos existentes están en General.',
                                  ),
                                ),
                              for (final categoria in categorias)
                                Card(
                                  child: ListTile(
                                    title: Text(
                                      '${categoria.nombre}${categoria.activa ? '' : ' (inactiva)'}',
                                    ),
                                    subtitle: Text(
                                      '${categoria.descripcion}\n${disponibles.where((c) => categoriaEfectiva(c, todasCategorias) == categoria.id).length} contenidos',
                                    ),
                                    isThreeLine:
                                        categoria.descripcion.isNotEmpty,
                                    trailing:
                                        _administrador &&
                                            categoria.id.isNotEmpty
                                        ? IconButton(
                                            tooltip: 'Editar categoría',
                                            icon: const Icon(Icons.edit),
                                            onPressed: () => _editarCategoria(
                                              todasCategorias,
                                              categoria: categoria,
                                            ),
                                          )
                                        : const Icon(Icons.chevron_right),
                                    onTap: () => setState(() {
                                      _categoriaId = categoria.id;
                                      _nombreCategoria = categoria.nombre;
                                      _buscar.clear();
                                    }),
                                  ),
                                ),
                            ],
                          ),
                  ),
                ],
              );
            },
          );
        },
      ),
    ),
  );
}
