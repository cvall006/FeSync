import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/app_models.dart';
import '../../core/widgets/safe_avatar.dart';

class GestionMiembrosScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const GestionMiembrosScreen({super.key, required this.usuario});

  @override
  State<GestionMiembrosScreen> createState() => _GestionMiembrosScreenState();
}

class _GestionMiembrosScreenState extends State<GestionMiembrosScreen> {
  DocumentReference<Map<String, dynamic>> get _iglesiaRef => FirebaseFirestore
      .instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId);

  CollectionReference<Map<String, dynamic>> get _usuariosRef =>
      FirebaseFirestore.instance.collection('usuarios_globales');

  bool get _esAdmin => widget.usuario.rolGlobal == 'admin_iglesia';

  Future<void> _copiarCodigo(String codigo) async {
    await Clipboard.setData(ClipboardData(text: codigo));

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código copiado al portapapeles.')),
    );
  }

  Future<void> _editarMiembro(String uid, Map<String, dynamic> miembro) async {
    final descripcionCtrl = TextEditingController(
      text: miembro['descripcion']?.toString() ?? '',
    );

    String rolSeleccionado = miembro['rolGlobal']?.toString() ?? 'servidor';

    final resultado = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
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
                      'Editar Miembro',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),

                    const SizedBox(height: 8),

                    Text(
                      miembro['nombre']?.toString() ?? 'Miembro',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),

                    const SizedBox(height: 20),

                    TextField(
                      controller: descripcionCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Descripción / Área',
                        prefixIcon: Icon(Icons.info_outline),
                      ),
                    ),

                    const SizedBox(height: 16),

                    DropdownButtonFormField<String>(
                      initialValue: rolSeleccionado,
                      decoration: const InputDecoration(
                        labelText: 'Rol en la iglesia',
                        prefixIcon: Icon(Icons.badge),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'servidor',
                          child: Text('Servidor'),
                        ),
                        DropdownMenuItem(
                          value: 'lider_area',
                          child: Text('Líder de Área'),
                        ),
                        DropdownMenuItem(
                          value: 'admin_iglesia',
                          child: Text('Administrador'),
                        ),
                      ],
                      onChanged: (valor) {
                        if (valor == null) {
                          return;
                        }

                        setModalState(() {
                          rolSeleccionado = valor;
                        });
                      },
                    ),

                    const SizedBox(height: 24),

                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B82F6),
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () {
                          Navigator.pop(ctx, {
                            'descripcion': descripcionCtrl.text.trim(),
                            'rolGlobal': rolSeleccionado,
                          });
                        },
                        icon: const Icon(Icons.save),
                        label: const Text(
                          'Guardar Cambios',
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

    descripcionCtrl.dispose();

    if (resultado == null) {
      return;
    }

    await _usuariosRef.doc(uid).update({
      'descripcion': resultado['descripcion'],
      'rolGlobal': resultado['rolGlobal'],
    });

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Miembro actualizado.')));
  }

  Future<void> _quitarMiembro(String uid, Map<String, dynamic> miembro) async {
    if (uid == widget.usuario.uid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No puedes quitarte a ti mismo '
            'desde esta pantalla.',
          ),
        ),
      );

      return;
    }

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Quitar de la congregación'),
          content: Text(
            '¿Deseas quitar a '
            '${miembro['nombre'] ?? 'este miembro'} '
            'de esta congregación?\n\n'
            'Su cuenta no será eliminada.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx, false);
              },
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Navigator.pop(ctx, true);
              },
              child: const Text('Quitar'),
            ),
          ],
        );
      },
    );

    if (confirmar != true) {
      return;
    }

    await _usuariosRef.doc(uid).update({
      'iglesiaId': FieldValue.delete(),
      'rolGlobal': FieldValue.delete(),
      'descripcion': FieldValue.delete(),
    });

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Miembro desvinculado '
          'de la congregación.',
        ),
      ),
    );
  }

  Color _colorRol(String rol) {
    switch (rol) {
      case 'admin_iglesia':
        return const Color(0xFF3B82F6);

      case 'lider_area':
        return const Color(0xFFEF4444);

      default:
        return const Color(0xFF64748B);
    }
  }

  String _textoRol(String rol) {
    switch (rol) {
      case 'admin_iglesia':
        return 'ADMINISTRADOR';

      case 'lider_area':
        return 'LÍDER DE ÁREA';

      default:
        return 'SERVIDOR REGULAR';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final tarjeta = theme.colorScheme.surface;

    final borde = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    final textoPrincipal = theme.colorScheme.onSurface;

    final textoSecundario = theme.colorScheme.onSurfaceVariant;

    if (!_esAdmin) {
      return Scaffold(
        body: Center(
          child: Text(
            'No tienes permisos '
            'para gestionar miembros.',
            style: TextStyle(color: textoSecundario),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Gestión de Miembros')),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: _iglesiaRef.snapshots(),
        builder: (context, iglesiaSnapshot) {
          if (iglesiaSnapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!iglesiaSnapshot.hasData || !iglesiaSnapshot.data!.exists) {
            return Center(
              child: Text(
                'No se encontró la iglesia.',
                style: TextStyle(color: textoSecundario),
              ),
            );
          }

          final iglesia = iglesiaSnapshot.data!.data() ?? {};

          final codigo = iglesia['codigoAcceso']?.toString() ?? '';

          return Column(
            children: [
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: oscuro
                      ? const Color(0xFF111C2E)
                      : const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF3B82F6)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Código de Invitación',
                            style: TextStyle(
                              color: Color(0xFF3B82F6),
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            codigo,
                            style: TextStyle(
                              color: textoPrincipal,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1,
                            ),
                          ),
                        ],
                      ),
                    ),

                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.white,
                      ),
                      onPressed: codigo.isEmpty
                          ? null
                          : () {
                              _copiarCodigo(codigo);
                            },
                      icon: const Icon(Icons.copy, size: 18),
                      label: const Text('Copiar'),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: _usuariosRef
                      .where('iglesiaId', isEqualTo: widget.usuario.iglesiaId)
                      .snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Text(
                          'No fue posible cargar '
                          'los miembros.\n'
                          '${snapshot.error}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.redAccent),
                        ),
                      );
                    }

                    final docs = snapshot.data?.docs ?? [];

                    if (docs.isEmpty) {
                      return Center(
                        child: Text(
                          'No hay miembros en '
                          'esta congregación.',
                          style: TextStyle(color: textoSecundario),
                        ),
                      );
                    }

                    final miembros = [...docs];

                    miembros.sort((a, b) {
                      final nombreA =
                          a.data()['nombre']?.toString().toLowerCase() ?? '';

                      final nombreB =
                          b.data()['nombre']?.toString().toLowerCase() ?? '';

                      return nombreA.compareTo(nombreB);
                    });

                    return ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: miembros.length,
                      itemBuilder: (context, index) {
                        final doc = miembros[index];

                        final miembro = doc.data();

                        final nombre =
                            miembro['nombre']?.toString() ?? 'Sin nombre';

                        final descripcion =
                            miembro['descripcion']?.toString() ??
                            'Sin descripción';

                        final fotoUrl = miembro['fotoUrl']?.toString() ?? '';

                        final rol =
                            miembro['rolGlobal']?.toString() ?? 'servidor';

                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: tarjeta,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: borde),
                          ),
                          child: Row(
                            children: [
                              SafeAvatar(
                                imageUrl: fotoUrl,
                                nombre: nombre,
                                radius: 22,
                              ),

                              const SizedBox(width: 14),

                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      nombre,
                                      style: TextStyle(
                                        color: textoPrincipal,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),

                                    const SizedBox(height: 3),

                                    Text(
                                      descripcion,
                                      style: TextStyle(
                                        color: textoSecundario,
                                        fontSize: 12,
                                      ),
                                    ),

                                    const SizedBox(height: 7),

                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 3,
                                      ),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(5),
                                        border: Border.all(
                                          color: _colorRol(rol),
                                        ),
                                      ),
                                      child: Text(
                                        _textoRol(rol),
                                        style: TextStyle(
                                          color: _colorRol(rol),
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              IconButton(
                                tooltip: 'Editar miembro',
                                onPressed: () {
                                  _editarMiembro(doc.id, miembro);
                                },
                                icon: Icon(
                                  Icons.manage_accounts,
                                  color: textoSecundario,
                                ),
                              ),

                              IconButton(
                                tooltip: 'Quitar de la congregación',
                                onPressed: doc.id == widget.usuario.uid
                                    ? null
                                    : () {
                                        _quitarMiembro(doc.id, miembro);
                                      },
                                icon: const Icon(
                                  Icons.delete_outline,
                                  color: Colors.redAccent,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
