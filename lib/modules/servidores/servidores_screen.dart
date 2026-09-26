import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/app_models.dart';
import 'servidores_models.dart';

class ServidoresScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const ServidoresScreen({super.key, required this.usuario});

  @override
  State<ServidoresScreen> createState() => _ServidoresScreenState();
}

class _ServidoresScreenState extends State<ServidoresScreen> {
  CollectionReference get _turnosRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('turnos_servicio');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

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
      backgroundColor: const Color(0xFF1A1D24),
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
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
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
                      style: const TextStyle(
                        color: Colors.white,
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

    tituloCtrl.dispose();
    fechaCtrl.dispose();
  }

  Future<void> _confirmarEliminacionTurno(String turnoId) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1D24),
        title: const Text(
          '¿Eliminar evento?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Esta acción borrará el turno y todas sus asignaciones. '
          'No se puede deshacer.',
          style: TextStyle(color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () async {
              await _turnosRef.doc(turnoId).delete();

              if (!ctx.mounted) {
                return;
              }

              Navigator.pop(ctx);
            },
            child: const Text(
              'Eliminar',
              style: TextStyle(color: Colors.white),
            ),
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
      backgroundColor: const Color(0xFF1A1D24),
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
                const Text(
                  'Agregar Nuevo Puesto',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
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
                      style: TextStyle(
                        color: Colors.white,
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
      backgroundColor: const Color(0xFF1A1D24),
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
              return const SizedBox(
                height: 200,
                child: Center(
                  child: Text(
                    'No hay miembros',
                    style: TextStyle(color: Colors.white),
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
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
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

                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF334155),
                            backgroundImage: fotoUrl.isNotEmpty
                                ? NetworkImage(fotoUrl)
                                : null,
                            child: fotoUrl.isEmpty
                                ? const Icon(Icons.person, color: Colors.white)
                                : null,
                          ),
                          title: Text(
                            nombre,
                            style: const TextStyle(color: Colors.white),
                          ),
                          subtitle: Text(
                            rol,
                            style: const TextStyle(
                              color: Colors.grey,
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
    final listaActualizada = turno.asignaciones.map((a) {
      if (a.puesto == asig.puesto && a.usuarioUid == asig.usuarioUid) {
        return AsignacionPuesto(
          puesto: a.puesto,
          usuarioUid: a.usuarioUid,
          nombreUsuario: a.nombreUsuario,
          area: a.area,
          estado: nuevoEstado,
        ).toMap();
      }

      return a.toMap();
    }).toList();

    await _turnosRef.doc(turno.id).update({'asignaciones': listaActualizada});
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
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: const Text('Servidores & Protocolo'),
      ),
      floatingActionButton: _esAdmin
          ? FloatingActionButton.extended(
              backgroundColor: const Color(0xFF3B82F6),
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text(
                'Crear Turno',
                style: TextStyle(color: Colors.white),
              ),
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
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.handshake_outlined,
                    size: 64,
                    color: Color(0xFF334155),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'No hay turnos programados.',
                    style: TextStyle(color: Color(0xFF94A3B8)),
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
                color: const Color(0xFF1A1D24),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: Color(0xFF334155)),
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
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${turno.fecha.day}/'
                                  '${turno.fecha.month}/'
                                  '${turno.fecha.year}',
                                  style: const TextStyle(
                                    color: Color(0xFF94A3B8),
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          PopupMenuButton<String>(
                            icon: const Icon(
                              Icons.more_vert,
                              color: Colors.grey,
                            ),
                            color: const Color(0xFF0F1115),
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
                              const PopupMenuItem(
                                value: 'share',
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.share,
                                      color: Color(0xFF25D366),
                                      size: 18,
                                    ),
                                    SizedBox(width: 8),
                                    Text(
                                      'Compartir',
                                      style: TextStyle(color: Colors.white),
                                    ),
                                  ],
                                ),
                              ),
                              if (_esAdmin)
                                const PopupMenuItem(
                                  value: 'edit',
                                  child: Row(
                                    children: [
                                      Icon(
                                        Icons.edit,
                                        color: Colors.white70,
                                        size: 18,
                                      ),
                                      SizedBox(width: 8),
                                      Text(
                                        'Editar fecha/título',
                                        style: TextStyle(color: Colors.white),
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
                          color: Colors.white.withValues(alpha: 0.05),
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
                                  ? Colors.greenAccent
                                  : Colors.amberAccent,
                              size: 16,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Confirmados: '
                              '$confirmados / $total',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Divider(color: Color(0xFF334155), height: 24),
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
                                              style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                color: Colors.white,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          if (_esAdmin) ...[
                                            const SizedBox(width: 6),
                                            const Icon(
                                              Icons.edit,
                                              size: 12,
                                              color: Colors.grey,
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
                                        style: const TextStyle(
                                          color: Color(0xFF94A3B8),
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
                                          color: Colors.greenAccent,
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
