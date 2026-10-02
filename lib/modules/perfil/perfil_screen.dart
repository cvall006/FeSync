import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/models/app_models.dart';
import '../../core/providers/theme_provider.dart';
import '../../core/services/notification_service.dart';
import '../../core/widgets/safe_avatar.dart';

class PerfilScreen extends StatefulWidget {
  final UsuarioModel usuario;

  final Future<void> Function() onCerrarSesion;

  final Future<void> Function() onPerfilActualizado;

  final Future<void> Function() onSalirCongregacion;

  const PerfilScreen({
    super.key,
    required this.usuario,
    required this.onCerrarSesion,
    required this.onPerfilActualizado,
    required this.onSalirCongregacion,
  });

  @override
  State<PerfilScreen> createState() => _PerfilScreenState();
}

class _PerfilScreenState extends State<PerfilScreen> {
  late final TextEditingController _nombreCtrl;

  late final TextEditingController _descripcionCtrl;

  bool _guardando = false;
  bool _subiendoFoto = false;

  String _fotoUrl = '';

  DocumentReference<Map<String, dynamic>> get _usuarioRef => FirebaseFirestore
      .instance
      .collection('usuarios_globales')
      .doc(widget.usuario.uid);

  @override
  void initState() {
    super.initState();

    _nombreCtrl = TextEditingController(text: widget.usuario.nombre);

    _descripcionCtrl = TextEditingController(
      text: widget.usuario.descripcion ?? '',
    );

    _fotoUrl = widget.usuario.fotoUrl ?? '';
  }

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _descripcionCtrl.dispose();

    super.dispose();
  }

  Future<void> _seleccionarFoto() async {
    try {
      final picker = ImagePicker();

      final imagen = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1200,
      );

      if (imagen == null) {
        return;
      }

      setState(() {
        _subiendoFoto = true;
      });

      final Uint8List bytes = await imagen.readAsBytes();

      final mimeType = imagen.mimeType ?? 'image/jpeg';

      String extension = 'jpg';

      if (mimeType.contains('png')) {
        extension = 'png';
      } else if (mimeType.contains('webp')) {
        extension = 'webp';
      }

      final nombreArchivo =
          'perfil_${DateTime.now().millisecondsSinceEpoch}.$extension';

      final referencia = FirebaseStorage.instance
          .ref()
          .child('usuarios')
          .child(widget.usuario.uid)
          .child(nombreArchivo);

      await referencia.putData(bytes, SettableMetadata(contentType: mimeType));

      final nuevaUrl = await referencia.getDownloadURL();

      await _usuarioRef.update({'fotoUrl': nuevaUrl});

      if (!mounted) {
        return;
      }

      setState(() {
        _fotoUrl = nuevaUrl;
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Foto actualizada.')));

      await widget.onPerfilActualizado();
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No fue posible actualizar la foto: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _subiendoFoto = false;
        });
      }
    }
  }

  Future<void> _guardarCambios() async {
    final nombre = _nombreCtrl.text.trim();

    final descripcion = _descripcionCtrl.text.trim();

    if (nombre.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El nombre no puede quedar vacío.')),
      );

      return;
    }

    setState(() {
      _guardando = true;
    });

    try {
      await _usuarioRef.update({'nombre': nombre, 'descripcion': descripcion});

      await widget.onPerfilActualizado();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Perfil actualizado correctamente.')),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No fue posible guardar los cambios: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _guardando = false;
        });
      }
    }
  }

  Future<void> _cambiarTema(bool modoOscuro) async {
    context.read<ThemeProvider>().establecerModoOscuro(modoOscuro);

    try {
      await _usuarioRef.set({
        'modoOscuro': modoOscuro,
      }, SetOptions(merge: true));
    } catch (error) {
      debugPrint('No se pudo guardar preferencia de tema: $error');
    }
  }

  Future<void> _confirmarSalirCongregacion() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Salir de esta congregación'),
          content: const Text(
            'Tu cuenta seguirá existiendo, '
            'pero dejarás de pertenecer a esta congregación. '
            'Para volver a entrar necesitarás nuevamente '
            'el código de invitación.',
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
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                Navigator.pop(ctx, true);
              },
              child: const Text('Salir'),
            ),
          ],
        );
      },
    );

    if (confirmar != true) {
      return;
    }

    if (widget.usuario.rolGlobal == 'admin_iglesia') {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'El administrador principal no puede salir '
            'de la congregación todavía. '
            'Primero deberá transferir la administración.',
          ),
        ),
      );

      return;
    }

    try {
      await NotificationService.instance.desvincularUsuario();

      await _usuarioRef.update({
        'iglesiaId': FieldValue.delete(),
        'rolGlobal': FieldValue.delete(),
      });

      await widget.onSalirCongregacion();
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('No fue posible salir de la congregación: $error'),
        ),
      );
    }
  }

  Future<void> _confirmarCerrarSesion() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Cerrar sesión'),
          content: const Text('¿Deseas cerrar tu sesión de FeSync?'),
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
              child: const Text('Cerrar sesión'),
            ),
          ],
        );
      },
    );

    if (confirmar != true) {
      return;
    }

    await widget.onCerrarSesion();
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();

    final modoOscuro = themeProvider.modoOscuro;

    final theme = Theme.of(context);

    final colorTarjeta = theme.colorScheme.surface;

    final colorBorde = modoOscuro
        ? const Color(0xFF334155)
        : const Color(0xFFD1D5DB);

    final colorTexto = theme.colorScheme.onSurface;

    final colorSecundario = theme.colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: const Text('Mi Perfil')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Column(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    SafeAvatar(
                      imageUrl: _fotoUrl,
                      nombre: _nombreCtrl.text.trim().isEmpty
                          ? widget.usuario.nombre
                          : _nombreCtrl.text,
                      radius: 55,
                      backgroundColor: const Color(0xFF334155),
                    ),

                    Positioned(
                      right: -2,
                      bottom: 2,
                      child: Material(
                        color: const Color(0xFF3B82F6),
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _subiendoFoto ? null : _seleccionarFoto,
                          child: SizedBox(
                            width: 38,
                            height: 38,
                            child: _subiendoFoto
                                ? const Padding(
                                    padding: EdgeInsets.all(9),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(
                                    Icons.camera_alt,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 28),

                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: colorTarjeta,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: colorBorde),
                  ),
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    secondary: const Icon(
                      Icons.dark_mode,
                      color: Color(0xFF6366F1),
                    ),
                    title: Text(
                      'Modo Oscuro',
                      style: TextStyle(
                        color: colorTexto,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    value: modoOscuro,
                    onChanged: _cambiarTema,
                  ),
                ),

                const SizedBox(height: 24),

                TextField(
                  controller: _nombreCtrl,
                  textCapitalization: TextCapitalization.words,
                  onChanged: (_) {
                    setState(() {});
                  },
                  decoration: const InputDecoration(
                    labelText: 'Nombre y Apellido',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),

                const SizedBox(height: 16),

                TextField(
                  controller: _descripcionCtrl,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Descripción / Puesto',
                    prefixIcon: Icon(Icons.info_outline),
                  ),
                ),

                const SizedBox(height: 26),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: _guardando ? null : _guardarCambios,
                    child: _guardando
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'Guardar Cambios',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 40),

                Divider(color: colorBorde),

                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.orange,
                      side: const BorderSide(color: Colors.orange),
                    ),
                    onPressed: _confirmarSalirCongregacion,
                    icon: const Icon(Icons.church_outlined),
                    label: const Text(
                      'Salir de esta Congregación',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.redAccent,
                      side: const BorderSide(color: Colors.redAccent),
                    ),
                    onPressed: _confirmarCerrarSesion,
                    icon: const Icon(Icons.logout),
                    label: const Text(
                      'Cerrar Sesión',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                Text(
                  widget.usuario.email,
                  style: TextStyle(color: colorSecundario, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
