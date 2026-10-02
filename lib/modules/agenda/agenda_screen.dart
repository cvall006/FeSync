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

  static const List<String> _meses = [
    'ENE',
    'FEB',
    'MAR',
    'ABR',
    'MAY',
    'JUN',
    'JUL',
    'AGO',
    'SEP',
    'OCT',
    'NOV',
    'DIC',
  ];

  TimeOfDay _horaDesdeTexto(String texto) {
    final limpio = texto.trim().toUpperCase();

    final match = RegExp(r'^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$')
        .firstMatch(limpio);

    if (match == null) {
      return TimeOfDay.now();
    }

    var hora = int.tryParse(match.group(1) ?? '') ?? 0;

    final minuto = int.tryParse(match.group(2) ?? '') ?? 0;

    final periodo = match.group(3);

    if (periodo == 'PM' && hora < 12) {
      hora += 12;
    }

    if (periodo == 'AM' && hora == 12) {
      hora = 0;
    }

    hora = hora.clamp(0, 23);

    return TimeOfDay(hour: hora, minute: minuto.clamp(0, 59));
  }

  String _horaTexto(TimeOfDay hora) {
    return '${hora.hour.toString().padLeft(2, '0')}:'
        '${hora.minute.toString().padLeft(2, '0')}';
  }

  DateTime _fechaHoraEvento(EventoAgendaModel evento) {
    final hora = _horaDesdeTexto(evento.hora);

    return DateTime(
      evento.fecha.year,
      evento.fecha.month,
      evento.fecha.day,
      hora.hour,
      hora.minute,
    );
  }

  bool _esDelDia(DateTime fecha, DateTime referencia) {
    return fecha.year == referencia.year &&
        fecha.month == referencia.month &&
        fecha.day == referencia.day;
  }

  bool _debeMostrarse(EventoAgendaModel evento, DateTime ahora) {
    final fechaEvento = _fechaHoraEvento(evento);

    final inicioHoy = DateTime(ahora.year, ahora.month, ahora.day);

    return !fechaEvento.isBefore(inicioHoy);
  }

  int _compararEventos(
    EventoAgendaModel a,
    EventoAgendaModel b,
    DateTime ahora,
  ) {
    final fechaA = _fechaHoraEvento(a);

    final fechaB = _fechaHoraEvento(b);

    final aVencido = fechaA.isBefore(ahora);

    final bVencido = fechaB.isBefore(ahora);

    if (aVencido != bVencido) {
      return aVencido ? 1 : -1;
    }

    if (!aVencido) {
      return fechaA.compareTo(fechaB);
    }

    return fechaB.compareTo(fechaA);
  }

  Future<void> _abrirDialogoEvento({EventoAgendaModel? eventoExistente}) async {
    final tituloCtrl = TextEditingController(
      text: eventoExistente?.titulo ?? '',
    );

    final descCtrl = TextEditingController(
      text: eventoExistente?.descripcion ?? '',
    );

    final lugarCtrl = TextEditingController(
      text: eventoExistente?.lugar ?? 'Templo Principal',
    );

    DateTime fechaSeleccionada = eventoExistente?.fecha ?? DateTime.now();

    TimeOfDay horaSeleccionada = eventoExistente != null
        ? _horaDesdeTexto(eventoExistente.hora)
        : TimeOfDay.now();

    final theme = Theme.of(context);

    final selectorColor = theme.brightness == Brightness.dark
        ? const Color(0xFF2A2F38)
        : const Color(0xFFF1F5F9);

    final selectorTexto = theme.colorScheme.onSurface;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final modalTheme = Theme.of(context);

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
                      eventoExistente == null
                          ? 'Programar Actividad'
                          : 'Editar Actividad',
                      style: TextStyle(
                        color: modalTheme.colorScheme.onSurface,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 8),

                    Text(
                      'Completa los datos del evento '
                      'y selecciona fecha y hora.',
                      style: TextStyle(
                        color: modalTheme.colorScheme.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),

                    const SizedBox(height: 20),

                    TextField(
                      controller: tituloCtrl,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Título del evento',
                        prefixIcon: Icon(Icons.event),
                      ),
                    ),

                    const SizedBox(height: 12),

                    TextField(
                      controller: descCtrl,
                      maxLines: 3,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Descripción',
                        prefixIcon: Icon(Icons.notes),
                        alignLabelWithHint: true,
                      ),
                    ),

                    const SizedBox(height: 12),

                    TextField(
                      controller: lugarCtrl,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Lugar',
                        prefixIcon: Icon(Icons.location_on),
                      ),
                    ),

                    const SizedBox(height: 18),

                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: selectorColor,
                              foregroundColor: selectorTexto,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            icon: const Icon(Icons.calendar_today, size: 18),
                            label: Text(
                              '${fechaSeleccionada.day.toString().padLeft(2, '0')}/'
                              '${fechaSeleccionada.month.toString().padLeft(2, '0')}/'
                              '${fechaSeleccionada.year}',
                            ),
                            onPressed: () async {
                              final fecha = await showDatePicker(
                                context: ctx,
                                initialDate: fechaSeleccionada,
                                firstDate: DateTime.now().subtract(
                                  const Duration(days: 365),
                                ),
                                lastDate: DateTime(2035),
                              );

                              if (!ctx.mounted || fecha == null) {
                                return;
                              }

                              setModalState(() {
                                fechaSeleccionada = fecha;
                              });
                            },
                          ),
                        ),

                        const SizedBox(width: 10),

                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: selectorColor,
                              foregroundColor: selectorTexto,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            icon: const Icon(Icons.access_time, size: 18),
                            label: Text(horaSeleccionada.format(ctx)),
                            onPressed: () async {
                              final hora = await showTimePicker(
                                context: ctx,
                                initialTime: horaSeleccionada,
                              );

                              if (!ctx.mounted || hora == null) {
                                return;
                              }

                              setModalState(() {
                                horaSeleccionada = hora;
                              });
                            },
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed: () async {
                          final titulo = tituloCtrl.text.trim();

                          if (titulo.isEmpty) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Ingresa un título '
                                  'para el evento.',
                                ),
                              ),
                            );

                            return;
                          }

                          final evento = EventoAgendaModel(
                            id: eventoExistente?.id ?? '',
                            titulo: titulo,
                            descripcion: descCtrl.text.trim(),
                            fecha: DateTime(
                              fechaSeleccionada.year,
                              fechaSeleccionada.month,
                              fechaSeleccionada.day,
                            ),
                            hora: _horaTexto(horaSeleccionada),
                            lugar: lugarCtrl.text.trim(),
                            creadorUid:
                                eventoExistente?.creadorUid ??
                                widget.usuario.uid,
                          );

                          if (eventoExistente == null) {
                            await _agendaRef.add(evento.toMap());
                          } else {
                            await _agendaRef
                                .doc(eventoExistente.id)
                                .update(evento.toMap());
                          }

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        icon: Icon(
                          eventoExistente == null ? Icons.add_task : Icons.save,
                        ),
                        label: Text(
                          eventoExistente == null
                              ? 'Programar Evento'
                              : 'Guardar Cambios',
                          style: const TextStyle(
                            fontSize: 16,
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
      },
    );

    tituloCtrl.dispose();
    descCtrl.dispose();
    lugarCtrl.dispose();
  }

  Future<void> _confirmarEliminacion(String eventoId) async {
    final confirmado =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('¿Eliminar evento?'),
            content: const Text(
              'Esta acción eliminará '
              'el evento de la agenda '
              'de toda la congregación.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancelar'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Eliminar'),
              ),
            ],
          ),
        ) ??
        false;

    if (!confirmado) {
      return;
    }

    await _agendaRef.doc(eventoId).delete();
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
      appBar: AppBar(title: const Text('Agenda General')),
      floatingActionButton: _esAdmin
          ? FloatingActionButton.extended(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Programar'),
              onPressed: _abrirDialogoEvento,
            )
          : null,
      body: StreamBuilder<QuerySnapshot>(
        stream: _agendaRef.snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: Color(0xFF10B981)),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No fue posible cargar '
                  'la agenda.\n'
                  '${snapshot.error}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.redAccent),
                ),
              ),
            );
          }

          final ahora = DateTime.now();

          final eventos =
              snapshot.data?.docs
                  .map(
                    (doc) => EventoAgendaModel.fromMap(
                      doc.data() as Map<String, dynamic>,
                      doc.id,
                    ),
                  )
                  .where((evento) => _debeMostrarse(evento, ahora))
                  .toList() ??
              [];

          eventos.sort((a, b) => _compararEventos(a, b, ahora));

          if (eventos.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.event_busy, size: 64, color: secondary),
                  const SizedBox(height: 12),
                  Text(
                    'No hay próximos '
                    'eventos programados.',
                    style: TextStyle(color: secondary),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            itemCount: eventos.length,
            itemBuilder: (context, index) {
              final evento = eventos[index];

              final fechaHora = _fechaHoraEvento(evento);

              final vencido = fechaHora.isBefore(ahora);

              final esHoy = _esDelDia(fechaHora, ahora);

              final colorAcento = vencido
                  ? const Color(0xFF64748B)
                  : const Color(0xFF10B981);

              final colorTarjeta = vencido
                  ? oscuro
                        ? const Color(0xFF171A20)
                        : const Color(0xFFF1F5F9)
                  : surface;

              final colorTitulo = vencido ? const Color(0xFF64748B) : onSurface;

              final colorDescripcion = vencido
                  ? const Color(0xFF94A3B8)
                  : secondary;

              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 60,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: colorAcento.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: colorAcento.withValues(alpha: 0.35),
                        ),
                      ),
                      child: Column(
                        children: [
                          Text(
                            _meses[evento.fecha.month - 1],
                            style: TextStyle(
                              color: colorAcento,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            evento.fecha.day.toString(),
                            style: TextStyle(
                              color: colorTitulo,
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
                        color: colorTarjeta,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(color: border),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      evento.titulo,
                                      style: TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.bold,
                                        color: colorTitulo,
                                      ),
                                    ),
                                  ),

                                  if (vencido && esHoy)
                                    Container(
                                      margin: const EdgeInsets.only(right: 8),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: oscuro
                                            ? Colors.white.withValues(
                                                alpha: 0.08,
                                              )
                                            : const Color(0xFFE2E8F0),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: const Text(
                                        'FINALIZADO',
                                        style: TextStyle(
                                          color: Color(0xFF64748B),
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),

                                  if (_esAdmin)
                                    PopupMenuButton<String>(
                                      icon: Icon(
                                        Icons.more_vert,
                                        color: secondary,
                                        size: 20,
                                      ),
                                      color: surface,
                                      onSelected: (valor) {
                                        if (valor == 'edit') {
                                          _abrirDialogoEvento(
                                            eventoExistente: evento,
                                          );
                                        } else if (valor == 'delete') {
                                          _confirmarEliminacion(evento.id);
                                        }
                                      },
                                      itemBuilder: (context) => [
                                        PopupMenuItem(
                                          value: 'edit',
                                          child: Text(
                                            'Editar',
                                            style: TextStyle(color: onSurface),
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
                                const SizedBox(height: 6),
                                Text(
                                  evento.descripcion,
                                  style: TextStyle(
                                    color: colorDescripcion,
                                    fontSize: 13,
                                  ),
                                ),
                              ],

                              const SizedBox(height: 12),

                              Wrap(
                                spacing: 16,
                                runSpacing: 8,
                                children: [
                                  _DatoEvento(
                                    icono: Icons.access_time,
                                    texto: evento.hora,
                                    color: colorAcento,
                                    apagado: vencido,
                                  ),
                                  if (evento.lugar.isNotEmpty)
                                    _DatoEvento(
                                      icono: Icons.location_on,
                                      texto: evento.lugar,
                                      color: colorAcento,
                                      apagado: vencido,
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

class _DatoEvento extends StatelessWidget {
  final IconData icono;
  final String texto;
  final Color color;
  final bool apagado;

  const _DatoEvento({
    required this.icono,
    required this.texto,
    required this.color,
    required this.apagado,
  });

  @override
  Widget build(BuildContext context) {
    final secondary = Theme.of(context).colorScheme.onSurfaceVariant;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icono, size: 15, color: color),
        const SizedBox(width: 5),
        Text(
          texto,
          style: TextStyle(
            color: apagado ? const Color(0xFF64748B) : secondary,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}
