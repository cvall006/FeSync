import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'adora_models.dart';
import 'adora_visor_cancion_screen.dart';

class AdoraAgendaScreen extends StatelessWidget {
  final UsuarioModel usuario;

  const AdoraAgendaScreen({super.key, required this.usuario});

  CollectionReference get _eventosRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('adora_eventos');

  bool get _puedeGestionar =>
      usuario.rolGlobal == 'admin_iglesia' || usuario.rolGlobal == 'lider_area';

  Future<void> _mostrarFormularioEvento(BuildContext context) async {
    final tituloCtrl = TextEditingController();

    final tipoCtrl = TextEditingController();

    DateTime? fechaSeleccionada;
    TimeOfDay? horaSeleccionada;

    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final selectorColor = oscuro
        ? const Color(0xFF2A2F38)
        : const Color(0xFFF1F5F9);

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
                      'Nuevo Evento',
                      style: TextStyle(
                        color: modalTheme.colorScheme.onSurface,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: tituloCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Título (ej: Culto General)',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: tipoCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Tipo (ej: Culto, Ensayo)',
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: selectorColor,
                              foregroundColor: modalTheme.colorScheme.onSurface,
                            ),
                            icon: const Icon(Icons.calendar_today, size: 18),
                            label: Text(
                              fechaSeleccionada == null
                                  ? 'Elegir Fecha'
                                  : '${fechaSeleccionada!.day}/'
                                        '${fechaSeleccionada!.month}/'
                                        '${fechaSeleccionada!.year}',
                            ),
                            onPressed: () async {
                              final fecha = await showDatePicker(
                                context: ctx,
                                initialDate: DateTime.now(),
                                firstDate: DateTime.now(),
                                lastDate: DateTime(2035),
                              );

                              if (!ctx.mounted) {
                                return;
                              }

                              if (fecha != null) {
                                setModalState(() {
                                  fechaSeleccionada = fecha;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: selectorColor,
                              foregroundColor: modalTheme.colorScheme.onSurface,
                            ),
                            icon: const Icon(Icons.access_time, size: 18),
                            label: Text(
                              horaSeleccionada == null
                                  ? 'Elegir Hora'
                                  : horaSeleccionada!.format(ctx),
                            ),
                            onPressed: () async {
                              final hora = await showTimePicker(
                                context: ctx,
                                initialTime: TimeOfDay.now(),
                              );

                              if (!ctx.mounted) {
                                return;
                              }

                              if (hora != null) {
                                setModalState(() {
                                  horaSeleccionada = hora;
                                });
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B82F6),
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () async {
                          if (tituloCtrl.text.trim().isEmpty ||
                              fechaSeleccionada == null ||
                              horaSeleccionada == null) {
                            return;
                          }

                          final fechaHora = DateTime(
                            fechaSeleccionada!.year,
                            fechaSeleccionada!.month,
                            fechaSeleccionada!.day,
                            horaSeleccionada!.hour,
                            horaSeleccionada!.minute,
                          );

                          await _eventosRef.add({
                            'titulo': tituloCtrl.text.trim(),
                            'tipo': tipoCtrl.text.trim(),
                            'fechaHora': Timestamp.fromDate(fechaHora),
                            'cancionesIds': <String>[],
                            'asistentesUids': <String>[],
                            'creadorUid': usuario.uid,
                            'fechaCreacion': FieldValue.serverTimestamp(),
                          });

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        child: const Text(
                          'Guardar Evento',
                          style: TextStyle(
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
    tipoCtrl.dispose();
  }

  String _mesCorto(DateTime fecha) {
    const meses = [
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

    return meses[fecha.month - 1];
  }

  String _diaSemana(DateTime fecha) {
    const dias = [
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ];

    return dias[fecha.weekday - 1];
  }

  String _hora(DateTime fecha) {
    final h = fecha.hour.toString().padLeft(2, '0');

    final m = fecha.minute.toString().padLeft(2, '0');

    return '$h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final surface = theme.colorScheme.surface;

    final onSurface = theme.colorScheme.onSurface;

    final secondary = theme.colorScheme.onSurfaceVariant;

    final border = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'Próximos Eventos',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: onSurface,
                  ),
                ),
              ),
              if (_puedeGestionar)
                IconButton(
                  tooltip: 'Crear evento',
                  icon: const Icon(
                    Icons.add_circle,
                    color: Color(0xFF3B82F6),
                    size: 36,
                  ),
                  onPressed: () {
                    _mostrarFormularioEvento(context);
                  },
                ),
            ],
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: _eventosRef.snapshots(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return Center(
                  child: Text(
                    'No fue posible cargar los eventos.\n'
                    '${snapshot.error}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                );
              }

              final ahora = DateTime.now();

              final inicioHoy = DateTime(ahora.year, ahora.month, ahora.day);

              final eventos =
                  snapshot.data?.docs
                      .map(
                        (doc) => AdoraEventoModel.fromMap(
                          doc.data() as Map<String, dynamic>,
                          doc.id,
                        ),
                      )
                      .where((evento) => !evento.fechaHora.isBefore(inicioHoy))
                      .toList() ??
                  [];

              eventos.sort((a, b) {
                final aVencido = a.fechaHora.isBefore(ahora);

                final bVencido = b.fechaHora.isBefore(ahora);

                if (aVencido != bVencido) {
                  return aVencido ? 1 : -1;
                }

                if (!aVencido) {
                  return a.fechaHora.compareTo(b.fechaHora);
                }

                return b.fechaHora.compareTo(a.fechaHora);
              });

              if (eventos.isEmpty) {
                return Center(
                  child: Text(
                    'No hay eventos programados.',
                    style: TextStyle(color: secondary),
                  ),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: eventos.length,
                itemBuilder: (context, index) {
                  final evento = eventos[index];

                  final esEnsayo = evento.tipo.toLowerCase() == 'ensayo';

                  final vencido = evento.fechaHora.isBefore(ahora);

                  final colorAcento = vencido
                      ? const Color(0xFF64748B)
                      : const Color(0xFF3B82F6);

                  final colorTarjeta = vencido
                      ? oscuro
                            ? const Color(0xFF171A20)
                            : const Color(0xFFF1F5F9)
                      : surface;

                  final colorTitulo = vencido
                      ? const Color(0xFF64748B)
                      : onSurface;

                  return Card(
                    color: colorTarjeta,
                    margin: const EdgeInsets.only(bottom: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: border),
                    ),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      leading: Container(
                        width: 54,
                        decoration: BoxDecoration(
                          color: colorAcento.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _mesCorto(evento.fechaHora),
                              style: TextStyle(
                                color: colorAcento,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              evento.fechaHora.day.toString().padLeft(2, '0'),
                              style: TextStyle(
                                color: colorTitulo,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                      title: Row(
                        children: [
                          Expanded(
                            child: Text(
                              evento.titulo,
                              style: TextStyle(
                                color: colorTitulo,
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
                          ),
                          if (vencido)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: oscuro
                                    ? Colors.white.withValues(alpha: 0.08)
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
                        ],
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          children: [
                            Icon(
                              esEnsayo ? Icons.music_note : Icons.church,
                              size: 16,
                              color: colorAcento,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '${_diaSemana(evento.fechaHora)}'
                                ' - ${_hora(evento.fechaHora)}',
                                style: TextStyle(
                                  color: vencido
                                      ? const Color(0xFF64748B)
                                      : secondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.people, size: 17, color: colorAcento),
                          Text(
                            '${evento.asistentesUids.length}',
                            style: TextStyle(
                              color: colorAcento,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => AdoraSetlistScreen(
                              usuario: usuario,
                              eventoId: evento.id,
                              tituloEvento: evento.titulo,
                            ),
                          ),
                        );
                      },
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class AdoraSetlistScreen extends StatelessWidget {
  final UsuarioModel usuario;
  final String eventoId;
  final String tituloEvento;

  const AdoraSetlistScreen({
    super.key,
    required this.usuario,
    required this.eventoId,
    required this.tituloEvento,
  });

  bool get _puedeGestionar =>
      usuario.rolGlobal == 'admin_iglesia' || usuario.rolGlobal == 'lider_area';

  DocumentReference get _eventoRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('adora_eventos')
      .doc(eventoId);

  CollectionReference get _cancionesRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('adora_canciones');

  Future<void> _mostrarSelectorDeCanciones(
    BuildContext context,
    List<String> cancionesActuales,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Material(
          color: Theme.of(ctx).colorScheme.surface,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'Agregar al Setlist',
                  style: TextStyle(
                    color: Theme.of(ctx).colorScheme.onSurface,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Expanded(
                child: StreamBuilder<QuerySnapshot>(
                  stream: _cancionesRef.orderBy('titulo').snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    final canciones = snapshot.data?.docs ?? [];

                    if (canciones.isEmpty) {
                      return Center(
                        child: Text(
                          'No hay canciones guardadas.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                          ),
                        ),
                      );
                    }

                    return ListView.builder(
                      itemCount: canciones.length,
                      itemBuilder: (context, index) {
                        final doc = canciones[index];

                        final cancion = doc.data() as Map<String, dynamic>;

                        final yaAgregada = cancionesActuales.contains(doc.id);

                        return Material(
                          color: Colors.transparent,
                          child: ListTile(
                            leading: const Icon(
                              Icons.music_note,
                              color: Color(0xFF3B82F6),
                            ),
                            title: Text(cancion['titulo']?.toString() ?? ''),
                            subtitle: Text(cancion['tono']?.toString() ?? ''),
                            trailing: Icon(
                              yaAgregada
                                  ? Icons.check_circle
                                  : Icons.add_circle_outline,
                              color: yaAgregada
                                  ? Colors.green
                                  : Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                            ),
                            onTap: yaAgregada
                                ? null
                                : () async {
                                    await _eventoRef.update({
                                      'cancionesIds': FieldValue.arrayUnion([
                                        doc.id,
                                      ]),
                                    });

                                    if (!ctx.mounted) {
                                      return;
                                    }

                                    Navigator.pop(ctx);
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
      },
    );
  }

  Future<void> _actualizarAsistencia(
    List<String> asistentesActuales,
    bool asistir,
  ) async {
    final nuevaLista = List<String>.from(asistentesActuales);

    nuevaLista.remove(usuario.uid);

    nuevaLista.remove(usuario.nombre);

    if (asistir) {
      nuevaLista.add(usuario.uid);
    }

    await _eventoRef.update({'asistentesUids': nuevaLista});
  }

  Future<Map<String, String>> _obtenerNombresUsuarios() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('usuarios_globales')
        .where('iglesiaId', isEqualTo: usuario.iglesiaId)
        .get();

    return {
      for (final doc in snapshot.docs)
        doc.id: doc.data()['nombre']?.toString() ?? 'Usuario',
    };
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
      appBar: AppBar(title: Text(tituloEvento)),
      body: StreamBuilder<DocumentSnapshot>(
        stream: _eventoRef.snapshots(),
        builder: (context, snapshotEvento) {
          if (snapshotEvento.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshotEvento.hasData || !snapshotEvento.data!.exists) {
            return const Center(child: Text('El evento no existe.'));
          }

          final eventoData =
              snapshotEvento.data!.data() as Map<String, dynamic>;

          final evento = AdoraEventoModel.fromMap(
            eventoData,
            snapshotEvento.data!.id,
          );

          final cancionesIds = evento.cancionesIds;

          final asistentes = evento.asistentesUids;

          final voyAAsistir =
              asistentes.contains(usuario.uid) ||
              asistentes.contains(usuario.nombre);

          return FutureBuilder<Map<String, String>>(
            future: _obtenerNombresUsuarios(),
            builder: (context, nombresSnapshot) {
              final nombres = nombresSnapshot.data ?? {};

              String nombreAsistente(String valor) {
                return nombres[valor] ?? valor;
              }

              return Column(
                children: [
                  Container(
                    margin: const EdgeInsets.all(16),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFF3B82F6).withValues(alpha: 0.3),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                '¿Asistirás al evento?',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: onSurface,
                                ),
                              ),
                            ),
                            Switch(
                              value: voyAAsistir,
                              activeTrackColor: const Color(0xFF3B82F6),
                              onChanged: (valor) {
                                _actualizarAsistencia(asistentes, valor);
                              },
                            ),
                          ],
                        ),
                        Divider(color: border),
                        const SizedBox(height: 8),
                        Text(
                          'Confirmados (${asistentes.length}):',
                          style: TextStyle(color: secondary, fontSize: 14),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: asistentes
                              .map(
                                (valor) => Chip(
                                  label: Text(
                                    nombreAsistente(valor),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  backgroundColor: const Color(0xFF3B82F6)
                                      .withValues(alpha: 0.18),
                                  side: BorderSide.none,
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),

                  if (_puedeGestionar)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF3B82F6),
                            foregroundColor: Colors.white,
                          ),
                          onPressed: () {
                            _mostrarSelectorDeCanciones(context, cancionesIds);
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('Añadir Canción'),
                        ),
                      ),
                    ),

                  Expanded(
                    child: cancionesIds.isEmpty
                        ? Center(
                            child: Text(
                              'No hay canciones asignadas a este día.',
                              style: TextStyle(color: secondary, fontSize: 16),
                            ),
                          )
                        : StreamBuilder<QuerySnapshot>(
                            stream: _cancionesRef.snapshots(),
                            builder: (context, snapshot) {
                              if (snapshot.connectionState ==
                                  ConnectionState.waiting) {
                                return const Center(
                                  child: CircularProgressIndicator(),
                                );
                              }

                              final docs = snapshot.data?.docs ?? [];

                              final mapa = {
                                for (final doc in docs)
                                  doc.id: AdoraCancionModel.fromMap(
                                    doc.data() as Map<String, dynamic>,
                                    doc.id,
                                  ),
                              };

                              final canciones = cancionesIds
                                  .map((id) => mapa[id])
                                  .whereType<AdoraCancionModel>()
                                  .toList();

                              return ListView.builder(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                itemCount: canciones.length,
                                itemBuilder: (context, index) {
                                  final cancion = canciones[index];

                                  return Card(
                                    color: surface,
                                    margin: const EdgeInsets.only(bottom: 12),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      side: BorderSide(color: border),
                                    ),
                                    child: ListTile(
                                      leading: CircleAvatar(
                                        backgroundColor: const Color(0xFF3B82F6)
                                            .withValues(alpha: 0.18),
                                        child: Text(
                                          '${index + 1}',
                                          style: const TextStyle(
                                            color: Color(0xFF3B82F6),
                                            fontWeight: FontWeight.bold,
                                          ),
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
                                        'Tono: '
                                        '${cancion.tono.isEmpty ? "-" : cancion.tono}',
                                        style: TextStyle(color: secondary),
                                      ),
                                      trailing: _puedeGestionar
                                          ? IconButton(
                                              tooltip: 'Quitar del setlist',
                                              icon: const Icon(
                                                Icons.remove_circle_outline,
                                                color: Colors.redAccent,
                                              ),
                                              onPressed: () async {
                                                await _eventoRef.update({
                                                  'cancionesIds':
                                                      FieldValue.arrayRemove([
                                                        cancion.id,
                                                      ]),
                                                });
                                              },
                                            )
                                          : null,
                                      onTap: () {
                                        Navigator.push(
                                          context,
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                AdoraVisorCancionScreen(
                                                  cancion: cancion,
                                                  puedeEditar: _puedeGestionar,
                                                ),
                                          ),
                                        );
                                      },
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
          );
        },
      ),
    );
  }
}
