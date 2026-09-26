import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'adora_models.dart';

class AdoraInicioScreen extends StatelessWidget {
  final UsuarioModel usuario;

  const AdoraInicioScreen({super.key, required this.usuario});

  CollectionReference get _eventosRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('adora_eventos');

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
    final horas = fecha.hour.toString().padLeft(2, '0');

    final minutos = fecha.minute.toString().padLeft(2, '0');

    return '$horas:$minutos';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Hola, ${usuario.nombre}',
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Bienvenido a tu panel de Adora Live',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16),
              ),
            ],
          ),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            'Próximo Evento',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Color(0xFF60A5FA),
            ),
          ),
        ),
        const SizedBox(height: 12),
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

              final eventos =
                  snapshot.data?.docs
                      .map(
                        (doc) => AdoraEventoModel.fromMap(
                          doc.data() as Map<String, dynamic>,
                          doc.id,
                        ),
                      )
                      .where((evento) => !evento.fechaHora.isBefore(ahora))
                      .toList() ??
                  [];

              eventos.sort((a, b) => a.fechaHora.compareTo(b.fechaHora));

              if (eventos.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: Card(
                      color: const Color(0xFF1A1D24),
                      child: const Padding(
                        padding: EdgeInsets.all(24),
                        child: SizedBox(
                          width: double.infinity,
                          child: Text(
                            'No hay eventos próximos agendados.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Color(0xFF94A3B8)),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }

              final evento = eventos.first;

              return SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Card(
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.14),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.35),
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF3B82F6),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            children: [
                              Text(
                                _mesCorto(evento.fechaHora),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                              Text(
                                evento.fechaHora.day.toString().padLeft(2, '0'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 20),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                evento.titulo,
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                              if (evento.tipo.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  evento.tipo,
                                  style: const TextStyle(
                                    color: Color(0xFF60A5FA),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.access_time,
                                    size: 15,
                                    color: Color(0xFF94A3B8),
                                  ),
                                  const SizedBox(width: 5),
                                  Expanded(
                                    child: Text(
                                      '${_diaSemana(evento.fechaHora)}'
                                      ' - ${_hora(evento.fechaHora)}',
                                      style: const TextStyle(
                                        color: Color(0xFF94A3B8),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${evento.cancionesIds.length} canciones · '
                                '${evento.asistentesUids.length} confirmados',
                                style: const TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
