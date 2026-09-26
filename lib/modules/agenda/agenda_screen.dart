import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'agenda_models.dart';

class AgendaScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const AgendaScreen({super.key, required this.usuario});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen> {
  CollectionReference get _agendaRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('agenda_eventos');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  final List<String> _meses = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];

  void _abrirDialogoEvento(
    BuildContext context, {
    EventoAgendaModel? eventoExistente,
  }) {
    final tituloCtrl = TextEditingController(
      text: eventoExistente?.titulo ?? '',
    );
    final descCtrl = TextEditingController(
      text: eventoExistente?.descripcion ?? '',
    );
    final lugarCtrl = TextEditingController(
      text: eventoExistente?.lugar ?? 'Templo Principal',
    );
    final horaCtrl = TextEditingController(
      text: eventoExistente?.hora ?? '10:00 AM',
    );

    DateTime fechaSeleccionada = eventoExistente?.fecha ?? DateTime.now();

    final fechaCtrl = TextEditingController(
      text:
          '${fechaSeleccionada.year}-'
          '${fechaSeleccionada.month.toString().padLeft(2, '0')}-'
          '${fechaSeleccionada.day.toString().padLeft(2, '0')}',
    );

    showModalBottomSheet(
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
                  eventoExistente == null
                      ? 'Programar Nuevo Evento'
                      : 'Editar Evento',
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
                    labelText: 'Título del Evento (ej: Reunión de Jóvenes)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Descripción corta',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: fechaCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Fecha (YYYY-MM-DD)',
                          prefixIcon: Icon(Icons.calendar_today, size: 18),
                        ),
                        readOnly: true,
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: fechaSeleccionada,
                            firstDate: DateTime(2024),
                            lastDate: DateTime(2030),
                          );

                          if (date != null) {
                            fechaSeleccionada = date;

                            fechaCtrl.text =
                                '${date.year}-'
                                '${date.month.toString().padLeft(2, '0')}-'
                                '${date.day.toString().padLeft(2, '0')}';
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: horaCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Hora',
                          prefixIcon: Icon(Icons.access_time, size: 18),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: lugarCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Lugar',
                    prefixIcon: Icon(Icons.location_on, size: 18),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF10B981),
                    ),
                    onPressed: () async {
                      if (tituloCtrl.text.isEmpty) {
                        return;
                      }

                      final nuevoEvento = EventoAgendaModel(
                        id: '',
                        titulo: tituloCtrl.text.trim(),
                        descripcion: descCtrl.text.trim(),
                        fecha: fechaSeleccionada,
                        hora: horaCtrl.text.trim(),
                        lugar: lugarCtrl.text.trim(),
                        creadorUid: widget.usuario.uid,
                      );

                      if (eventoExistente == null) {
                        await _agendaRef.add(nuevoEvento.toMap());
                      } else {
                        await _agendaRef
                            .doc(eventoExistente.id)
                            .update(nuevoEvento.toMap());
                      }

                      if (!ctx.mounted) {
                        return;
                      }

                      Navigator.pop(ctx);
                    },
                    child: Text(
                      eventoExistente == null
                          ? 'Guardar Evento'
                          : 'Actualizar Evento',
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
  }

  void _confirmarEliminacion(String eventoId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1D24),
        title: const Text(
          '¿Eliminar evento?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Esta acción borrará el evento del calendario '
          'de toda la congregación.',
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
              await _agendaRef.doc(eventoId).delete();

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: const Text('Agenda General'),
      ),
      floatingActionButton: _esAdmin
          ? FloatingActionButton.extended(
              backgroundColor: const Color(0xFF10B981),
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text(
                'Programar',
                style: TextStyle(color: Colors.white),
              ),
              onPressed: () => _abrirDialogoEvento(context),
            )
          : null,
      body: StreamBuilder<QuerySnapshot>(
        stream: _agendaRef.orderBy('fecha', descending: false).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: Color(0xFF10B981)),
            );
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.event_busy, size: 64, color: Color(0xFF334155)),
                  SizedBox(height: 12),
                  Text(
                    'No hay próximos eventos programados.',
                    style: TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ],
              ),
            );
          }

          final eventos = snapshot.data!.docs.map((d) {
            return EventoAgendaModel.fromMap(
              d.data() as Map<String, dynamic>,
              d.id,
            );
          }).toList();

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: eventos.length,
            itemBuilder: (context, index) {
              final evento = eventos[index];
              final mesNombre = _meses[evento.fecha.month - 1];

              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 60,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: const Color(0xFF10B981).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        children: [
                          Text(
                            mesNombre.toUpperCase(),
                            style: const TextStyle(
                              color: Color(0xFF10B981),
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            evento.fecha.day.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Card(
                        margin: EdgeInsets.zero,
                        color: const Color(0xFF1A1D24),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFF334155)),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      evento.titulo,
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                  if (_esAdmin)
                                    PopupMenuButton<String>(
                                      icon: const Icon(
                                        Icons.more_vert,
                                        color: Colors.grey,
                                        size: 20,
                                      ),
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(
                                        minWidth: 100,
                                      ),
                                      color: const Color(0xFF0F1115),
                                      onSelected: (val) {
                                        if (val == 'edit') {
                                          _abrirDialogoEvento(
                                            context,
                                            eventoExistente: evento,
                                          );
                                        }

                                        if (val == 'delete') {
                                          _confirmarEliminacion(evento.id);
                                        }
                                      },
                                      itemBuilder: (context) => [
                                        const PopupMenuItem(
                                          value: 'edit',
                                          child: Text(
                                            'Editar',
                                            style: TextStyle(
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                        const PopupMenuItem(
                                          value: 'delete',
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
                              if (evento.descripcion.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  evento.descripcion,
                                  style: const TextStyle(
                                    color: Color(0xFF94A3B8),
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.access_time,
                                    size: 14,
                                    color: Color(0xFF10B981),
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    evento.hora,
                                    style: const TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(width: 16),
                                  const Icon(
                                    Icons.location_on,
                                    size: 14,
                                    color: Color(0xFF10B981),
                                  ),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      evento.lugar,
                                      style: const TextStyle(
                                        color: Colors.white70,
                                        fontSize: 12,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
