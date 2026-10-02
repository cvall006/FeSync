import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'comunidad_models.dart';

class ComunidadScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const ComunidadScreen({super.key, required this.usuario});

  @override
  State<ComunidadScreen> createState() => _ComunidadScreenState();
}

class _ComunidadScreenState extends State<ComunidadScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  CollectionReference get _muroRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('muro_comunidad');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  @override
  void initState() {
    super.initState();

    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();

    super.dispose();
  }

  Future<void> _crearPublicacion() async {
    final contenidoCtrl = TextEditingController();

    String tipoSeleccionado = 'aviso';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final theme = Theme.of(context);

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
                      'Nueva Publicación',
                      style: TextStyle(
                        color: theme.colorScheme.onSurface,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 20),

                    DropdownButtonFormField<String>(
                      initialValue: tipoSeleccionado,
                      decoration: const InputDecoration(
                        labelText: 'Tipo de publicación',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'aviso', child: Text('Aviso')),
                        DropdownMenuItem(
                          value: 'peticion',
                          child: Text('Petición'),
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

                    const SizedBox(height: 16),

                    TextField(
                      controller: contenidoCtrl,
                      minLines: 4,
                      maxLines: 8,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: tipoSeleccionado == 'aviso'
                            ? 'Escribe el aviso'
                            : 'Escribe la petición',
                        alignLabelWithHint: true,
                      ),
                    ),

                    const SizedBox(height: 24),

                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B82F6),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24),
                          ),
                        ),
                        onPressed: () async {
                          if (contenidoCtrl.text.trim().isEmpty) {
                            return;
                          }

                          await _muroRef.add({
                            'autorNombre': widget.usuario.nombre,
                            'autorUid': widget.usuario.uid,
                            'contenido': contenidoCtrl.text.trim(),
                            'fechaCreacion': FieldValue.serverTimestamp(),
                            'tipo': tipoSeleccionado,
                          });

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        icon: const Icon(Icons.edit),
                        label: const Text(
                          'Publicar',
                          style: TextStyle(fontWeight: FontWeight.bold),
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

    contenidoCtrl.dispose();
  }

  Future<void> _eliminarPublicacion(
    ComunidadPublicacionModel publicacion,
  ) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return AlertDialog(
              title: const Text('Eliminar publicación'),
              content: const Text('¿Deseas eliminar esta publicación?'),
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

    await _muroRef.doc(publicacion.id).delete();
  }

  String _formatearFecha(DateTime? fecha) {
    if (fecha == null) {
      return '';
    }

    final dia = fecha.day.toString().padLeft(2, '0');

    final mes = fecha.month.toString().padLeft(2, '0');

    final anio = fecha.year.toString();

    final hora = fecha.hour.toString().padLeft(2, '0');

    final minuto = fecha.minute.toString().padLeft(2, '0');

    return '$dia/$mes/$anio $hora:$minuto';
  }

  Widget _buildLista(String tipo) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final surface = theme.colorScheme.surface;

    final onSurface = theme.colorScheme.onSurface;

    final secondary = theme.colorScheme.onSurfaceVariant;

    return StreamBuilder<QuerySnapshot>(
      stream: _muroRef
          .where('tipo', isEqualTo: tipo)
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
                'No fue posible cargar las publicaciones.\n'
                '${snapshot.error}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.redAccent),
              ),
            ),
          );
        }

        final publicaciones =
            snapshot.data?.docs
                .map(
                  (doc) => ComunidadPublicacionModel.fromMap(
                    doc.data() as Map<String, dynamic>,
                    doc.id,
                  ),
                )
                .toList() ??
            [];

        if (publicaciones.isEmpty) {
          return Center(
            child: Text(
              tipo == 'aviso'
                  ? 'No hay avisos publicados.'
                  : 'No hay peticiones publicadas.',
              style: TextStyle(color: secondary),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(20),
          itemCount: publicaciones.length,
          itemBuilder: (context, index) {
            final publicacion = publicaciones[index];

            final esAviso = publicacion.esAviso;

            final puedeEliminar =
                _esAdmin || publicacion.autorUid == widget.usuario.uid;

            final colorAcento = esAviso
                ? const Color(0xFF2563EB)
                : const Color(0xFFEC4899);

            return Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: colorAcento.withValues(alpha: oscuro ? 0.55 : 0.35),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        backgroundColor: colorAcento.withValues(
                          alpha: oscuro ? 0.22 : 0.12,
                        ),
                        child: Icon(
                          esAviso ? Icons.campaign : Icons.favorite,
                          color: colorAcento,
                        ),
                      ),

                      const SizedBox(width: 12),

                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              publicacion.autorNombre,
                              style: TextStyle(
                                color: onSurface,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _formatearFecha(publicacion.fechaCreacion),
                              style: TextStyle(color: secondary, fontSize: 12),
                            ),
                          ],
                        ),
                      ),

                      if (puedeEliminar)
                        IconButton(
                          tooltip: 'Eliminar',
                          onPressed: () {
                            _eliminarPublicacion(publicacion);
                          },
                          icon: Icon(
                            Icons.delete_outline,
                            color: secondary,
                            size: 20,
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  Text(
                    publicacion.contenido,
                    style: TextStyle(
                      color: onSurface,
                      fontSize: 15,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Comunidad'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF3B82F6),
          labelColor: const Color(0xFF3B82F6),
          unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
          tabs: const [
            Tab(icon: Icon(Icons.campaign), text: 'Avisos'),
            Tab(icon: Icon(Icons.favorite), text: 'Peticiones'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF3B82F6),
        foregroundColor: Colors.white,
        onPressed: _crearPublicacion,
        icon: const Icon(Icons.edit),
        label: const Text('Publicar'),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [_buildLista('aviso'), _buildLista('peticion')],
      ),
    );
  }
}
