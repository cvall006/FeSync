import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/app_models.dart';
import '../../core/widgets/safe_avatar.dart';
import 'servidores_models.dart';

class ServidoresScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const ServidoresScreen({super.key, required this.usuario});

  @override
  State<ServidoresScreen> createState() => _ServidoresScreenState();
}

class _ServidoresScreenState extends State<ServidoresScreen> {
  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'southamerica-west1',
  );

  CollectionReference get _turnosRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('turnos_servicio');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  Color _surface(BuildContext context) => Theme.of(context).colorScheme.surface;

  Color _onSurface(BuildContext context) =>
      Theme.of(context).colorScheme.onSurface;

  Color _onSurfaceVariant(BuildContext context) =>
      Theme.of(context).colorScheme.onSurfaceVariant;

  Color _border(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;

    return oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);
  }

  Future<void> _abrirDialogoTurno(
    BuildContext context, {
    TurnoServicioModel? turnoExistente,
  }) async {
    final tituloCtrl = TextEditingController(
      text: turnoExistente?.titulo ?? 'Culto Dominical',
    );

    final fechaCtrl = TextEditingController(
      text: turnoExistente != null
          ? turnoExistente.fecha.toIso8601String().substring(0, 10)
          : DateTime.now().toIso8601String().substring(0, 10),
    );

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _surface(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            left: 20,
            right: 20,
            top: 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  turnoExistente == null
                      ? 'Nuevo Turno de Servicio'
                      : 'Editar Turno',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: _onSurface(ctx),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: tituloCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre del Evento (ej: Culto Dominical)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: fechaCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Fecha (YYYY-MM-DD)',
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () async {
                      if (tituloCtrl.text.trim().isEmpty) {
                        return;
                      }

                      final fechaParsed =
                          DateTime.tryParse(fechaCtrl.text.trim()) ??
                          DateTime.now();

                      if (turnoExistente == null) {
                        await _turnosRef.add({
                          'titulo': tituloCtrl.text.trim(),
                          'fecha': fechaParsed.toIso8601String(),
                          'asignaciones': [
                            {
                              'puesto': 'Puerta Principal',
                              'usuarioUid': widget.usuario.uid,
                              'nombreUsuario': widget.usuario.nombre,
                              'area': 'Protocolo',
                              'estado': 'pendiente',
                            },
                            {
                              'puesto': 'Pasillo Central & Ofrendas',
                              'usuarioUid': '',
                              'nombreUsuario': 'Por Asignar',
                              'area': 'Protocolo',
                              'estado': 'pendiente',
                            },
                            {
                              'puesto': 'Aseo & Cierre',
                              'usuarioUid': '',
                              'nombreUsuario': 'Por Asignar',
                              'area': 'Mantenimiento',
                              'estado': 'pendiente',
                            },
                          ],
                        });
                      } else {
                        await _turnosRef.doc(turnoExistente.id).update({
                          'titulo': tituloCtrl.text.trim(),
                          'fecha': fechaParsed.toIso8601String(),
                        });
                      }

                      if (!ctx.mounted) {
                        return;
                      }

                      Navigator.pop(ctx);
                    },
                    child: Text(
                      turnoExistente == null
                          ? 'Crear Turno'
                          : 'Guardar Cambios',
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
    fechaCtrl.dispose();
  }

  Future<void> _confirmarEliminacionTurno(String turnoId) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar evento?'),
        content: const Text(
          'Esta acción borrará el turno y todas sus asignaciones. '
          'No se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              await _turnosRef.doc(turnoId).delete();

              if (!ctx.mounted) {
                return;
              }

              Navigator.pop(ctx);
            },
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
  }

  Future<void> _abrirDialogoNuevoPuesto(
    BuildContext context,
    TurnoServicioModel turno,
  ) async {
    final puestoCtrl = TextEditingController();
    final areaCtrl = TextEditingController(text: 'General');

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _surface(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            left: 20,
            right: 20,
            top: 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Agregar Nuevo Puesto',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: _onSurface(ctx),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: puestoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre del Puesto (ej: Multimedia)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: areaCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Área (ej: Producción, Protocolo)',
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () async {
                      if (puestoCtrl.text.trim().isEmpty) {
                        return;
                      }

                      final nuevasAsignaciones = turno.asignaciones
                          .map((e) => e.toMap())
                          .toList();

                      nuevasAsignaciones.add({
                        'puesto': puestoCtrl.text.trim(),
                        'usuarioUid': '',
                        'nombreUsuario': 'Por Asignar',
                        'area': areaCtrl.text.trim(),
                        'estado': 'pendiente',
                      });

                      await _turnosRef.doc(turno.id).update({
                        'asignaciones': nuevasAsignaciones,
                      });

                      if (!ctx.mounted) {
                        return;
                      }

                      Navigator.pop(ctx);
                    },
                    child: const Text(
                      'Agregar Puesto',
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

    puestoCtrl.dispose();
    areaCtrl.dispose();
  }

  Future<void> _eliminarPuesto(
    TurnoServicioModel turno,
    AsignacionPuesto asigAEliminar,
  ) async {
    final nuevasAsignaciones = turno.asignaciones
        .where((a) => a.puesto != asigAEliminar.puesto)
        .map((a) => a.toMap())
        .toList();

    await _turnosRef.doc(turno.id).update({'asignaciones': nuevasAsignaciones});
  }

  Future<void> _mostrarDialogoSeleccionVoluntario(
    TurnoServicioModel turno,
    AsignacionPuesto asig,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _surface(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return FutureBuilder<QuerySnapshot>(
          future: FirebaseFirestore.instance
              .collection('usuarios_globales')
              .where('iglesiaId', isEqualTo: widget.usuario.iglesiaId)
              .get(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 200,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
              return SizedBox(
                height: 200,
                child: Center(
                  child: Text(
                    'No hay miembros',
                    style: TextStyle(color: _onSurfaceVariant(ctx)),
                  ),
                ),
              );
            }

            final miembros = snapshot.data!.docs;

            return Container(
              padding: const EdgeInsets.all(20),
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.6,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Asignar a: ${asig.puesto}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: _onSurface(ctx),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: miembros.length,
                      itemBuilder: (context, index) {
                        final miembro =
                            miembros[index].data() as Map<String, dynamic>;

                        final fotoUrl = miembro['fotoUrl']?.toString() ?? '';

                        final nombre = miembro['nombre']?.toString() ?? '';

                        final rol = miembro['rolGlobal']?.toString() ?? '';

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Material(
                            color: Colors.transparent,
                            child: ListTile(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              leading: SafeAvatar(
                                imageUrl: fotoUrl,
                                nombre: nombre,
                                radius: 20,
                              ),
                              title: Text(
                                nombre,
                                style: TextStyle(color: _onSurface(context)),
                              ),
                              subtitle: Text(
                                rol,
                                style: TextStyle(
                                  color: _onSurfaceVariant(context),
                                  fontSize: 12,
                                ),
                              ),
                              onTap: () async {
                                await _asignarVoluntario(
                                  turno,
                                  asig,
                                  miembros[index].id,
                                  nombre,
                                );

                                if (!ctx.mounted) {
                                  return;
                                }

                                Navigator.pop(ctx);
                              },
                            ),
                          ),
                        );
                      },
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

  Future<void> _asignarVoluntario(
    TurnoServicioModel turno,
    AsignacionPuesto asig,
    String nuevoUid,
    String nuevoNombre,
  ) async {
    final listaActualizada = turno.asignaciones.map((a) {
      if (a.puesto == asig.puesto && a.usuarioUid == asig.usuarioUid) {
        return AsignacionPuesto(
          puesto: a.puesto,
          usuarioUid: nuevoUid,
          nombreUsuario: nuevoNombre,
          area: a.area,
          estado: 'pendiente',
        ).toMap();
      }

      return a.toMap();
    }).toList();

    await _turnosRef.doc(turno.id).update({'asignaciones': listaActualizada});
  }

  Future<void> _cambiarMiEstado(
    TurnoServicioModel turno,
    AsignacionPuesto asig,
    String nuevoEstado,
  ) async {
    try {
      await _functions.httpsCallable('actualizarEstadoTurnoSeguro').call({
        'iglesiaId': widget.usuario.iglesiaId,
        'turnoId': turno.id,
        'puesto': asig.puesto,
        'usuarioUid': asig.usuarioUid,
        'estado': nuevoEstado,
      });
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.message ?? 'No fue posible actualizar la asignación.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No fue posible actualizar la asignación.'),
        ),
      );
    }
  }

  Future<void> _compartirPorWhatsApp(TurnoServicioModel turno) async {
    final buffer = StringBuffer();

    buffer.writeln(
      '📋 *EQUIPO DE SERVICIO - '
      '${turno.titulo.toUpperCase()}*',
    );

    buffer.writeln(
      '🗓️ Fecha: '
      '${turno.fecha.day}/'
      '${turno.fecha.month}/'
      '${turno.fecha.year}\n',
    );

    for (final asig in turno.asignaciones) {
      final iconoEstado = asig.estado == 'confirmado'
          ? '✅'
          : asig.estado == 'rechazado'
          ? '❌'
          : '⏳';

      buffer.writeln(
        '$iconoEstado *${asig.puesto}*: '
        '${asig.nombreUsuario}',
      );
    }

    buffer.writeln('\n_Generado por FeSync_');

    final url = Uri.https('wa.me', '/', {'text': buffer.toString()});

    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  Color _colorEstado(String estado) {
    switch (estado) {
      case 'confirmado':
        return Colors.green;
      case 'rechazado':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final surface = theme.colorScheme.surface;

    final onSurface = theme.colorScheme.onSurface;

    final secondary = theme.colorScheme.onSurfaceVariant;

    final border = _border(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Servidores & Protocolo')),
      floatingActionButton: _esAdmin
          ? FloatingActionButton.extended(
              backgroundColor: const Color(0xFF3B82F6),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Crear Turno'),
              onPressed: () {
                _abrirDialogoTurno(context);
              },
            )
          : null,
      body: StreamBuilder<QuerySnapshot>(
        stream: _turnosRef.orderBy('fecha', descending: false).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.handshake_outlined, size: 64, color: secondary),
                  const SizedBox(height: 12),
                  Text(
                    'No hay turnos programados.',
                    style: TextStyle(color: secondary),
                  ),
                ],
              ),
            );
          }

          final turnos = snapshot.data!.docs.map((d) {
            return TurnoServicioModel.fromMap(
              d.data() as Map<String, dynamic>,
              d.id,
            );
          }).toList();

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: turnos.length,
            itemBuilder: (context, index) {
              final turno = turnos[index];

              final total = turno.asignaciones.length;

              final confirmados = turno.asignaciones
                  .where((a) => a.estado == 'confirmado')
                  .length;

              return Card(
                color: surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: border),
                ),
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  turno.titulo,
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: onSurface,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${turno.fecha.day}/'
                                  '${turno.fecha.month}/'
                                  '${turno.fecha.year}',
                                  style: TextStyle(
                                    color: secondary,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          PopupMenuButton<String>(
                            icon: Icon(Icons.more_vert, color: secondary),
                            color: surface,
                            onSelected: (value) {
                              if (value == 'share') {
                                _compartirPorWhatsApp(turno);
                              }

                              if (value == 'edit' && _esAdmin) {
                                _abrirDialogoTurno(
                                  context,
                                  turnoExistente: turno,
                                );
                              }

                              if (value == 'delete' && _esAdmin) {
                                _confirmarEliminacionTurno(turno.id);
                              }
                            },
                            itemBuilder: (context) => [
                              PopupMenuItem(
                                value: 'share',
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.share,
                                      color: Color(0xFF25D366),
                                      size: 18,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Compartir',
                                      style: TextStyle(color: onSurface),
                                    ),
                                  ],
                                ),
                              ),
                              if (_esAdmin)
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Row(
                                    children: [
                                      Icon(
                                        Icons.edit,
                                        color: secondary,
                                        size: 18,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        'Editar fecha/título',
                                        style: TextStyle(color: onSurface),
                                      ),
                                    ],
                                  ),
                                ),
                              if (_esAdmin)
                                const PopupMenuItem(
                                  value: 'delete',
                                  child: Row(
                                    children: [
                                      Icon(
                                        Icons.delete,
                                        color: Colors.redAccent,
                                        size: 18,
                                      ),
                                      SizedBox(width: 8),
                                      Text(
                                        'Eliminar Turno',
                                        style: TextStyle(
                                          color: Colors.redAccent,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: oscuro
                              ? Colors.white.withValues(alpha: 0.05)
                              : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              confirmados == total
                                  ? Icons.check_circle
                                  : Icons.schedule,
                              color: confirmados == total
                                  ? Colors.green
                                  : Colors.orange,
                              size: 16,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Confirmados: '
                              '$confirmados / $total',
                              style: TextStyle(fontSize: 12, color: secondary),
                            ),
                          ],
                        ),
                      ),

                      Divider(color: border, height: 24),

                      ...turno.asignaciones.map((asig) {
                        final esMiTurno = asig.usuarioUid == widget.usuario.uid;

                        final puedoEditar = esMiTurno || _esAdmin;

                        final colorEstado = _colorEstado(asig.estado);

                        return InkWell(
                          onTap: _esAdmin
                              ? () {
                                  _mostrarDialogoSeleccionVoluntario(
                                    turno,
                                    asig,
                                  );
                                }
                              : null,
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: esMiTurno
                                  ? const Color(0xFF3B82F6)
                                        .withValues(alpha: 0.1)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              border: esMiTurno
                                  ? Border.all(
                                      color: const Color(0xFF3B82F6)
                                          .withValues(alpha: 0.4),
                                    )
                                  : null,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Flexible(
                                            child: Text(
                                              asig.puesto,
                                              style: TextStyle(
                                                fontWeight: FontWeight.bold,
                                                color: onSurface,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          if (_esAdmin) ...[
                                            const SizedBox(width: 6),
                                            Icon(
                                              Icons.edit,
                                              size: 12,
                                              color: secondary,
                                            ),
                                            const SizedBox(width: 8),
                                            GestureDetector(
                                              onTap: () {
                                                _eliminarPuesto(turno, asig);
                                              },
                                              child: const Icon(
                                                Icons.delete_outline,
                                                size: 14,
                                                color: Colors.redAccent,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                      Text(
                                        '${asig.nombreUsuario} '
                                        '(${asig.area})',
                                        style: TextStyle(
                                          color: secondary,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),

                                if (puedoEditar &&
                                    asig.estado == 'pendiente' &&
                                    asig.usuarioUid.isNotEmpty)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      IconButton(
                                        icon: const Icon(
                                          Icons.check_circle,
                                          color: Colors.green,
                                        ),
                                        tooltip: 'Confirmar',
                                        onPressed: () {
                                          _cambiarMiEstado(
                                            turno,
                                            asig,
                                            'confirmado',
                                          );
                                        },
                                      ),
                                      IconButton(
                                        icon: const Icon(
                                          Icons.cancel,
                                          color: Colors.redAccent,
                                        ),
                                        tooltip: 'Rechazar',
                                        onPressed: () {
                                          _cambiarMiEstado(
                                            turno,
                                            asig,
                                            'rechazado',
                                          );
                                        },
                                      ),
                                    ],
                                  )
                                else if (asig.usuarioUid.isNotEmpty)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: colorEstado.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: colorEstado),
                                    ),
                                    child: Text(
                                      asig.estado.toUpperCase(),
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: colorEstado,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.grey.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: Colors.grey),
                                    ),
                                    child: const Text(
                                      'TOCAR PARA ASIGNAR',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      }),

                      if (_esAdmin)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: TextButton.icon(
                            onPressed: () {
                              _abrirDialogoNuevoPuesto(context, turno);
                            },
                            icon: const Icon(
                              Icons.add_circle_outline,
                              color: Color(0xFF10B981),
                              size: 18,
                            ),
                            label: const Text(
                              'Agregar nuevo puesto',
                              style: TextStyle(color: Color(0xFF10B981)),
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
      ),
    );
  }
}
