import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'escuela_models.dart';

class EscuelaEvaluacionesScreen extends StatefulWidget {
  final UsuarioModel usuario;
  final EscuelaModuloModel modulo;

  const EscuelaEvaluacionesScreen({
    super.key,
    required this.usuario,
    required this.modulo,
  });

  @override
  State<EscuelaEvaluacionesScreen> createState() =>
      _EscuelaEvaluacionesScreenState();
}

class _EscuelaEvaluacionesScreenState extends State<EscuelaEvaluacionesScreen> {
  CollectionReference get _usuariosRef =>
      FirebaseFirestore.instance.collection('usuarios_globales');

  CollectionReference get _evaluacionesRef => FirebaseFirestore.instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId)
      .collection('escuela_modulos')
      .doc(widget.modulo.id)
      .collection('evaluaciones');

  bool get _esAdmin =>
      widget.usuario.rolGlobal == 'admin_iglesia' ||
      widget.usuario.rolGlobal == 'lider_area';

  Map<String, dynamic>? _buscarEvaluacionExistente(
    List<QueryDocumentSnapshot> evaluaciones,
    String usuarioUid,
    String nombre,
  ) {
    for (final doc in evaluaciones) {
      if (doc.id == usuarioUid) {
        return {'id': doc.id, 'data': doc.data() as Map<String, dynamic>};
      }
    }

    for (final doc in evaluaciones) {
      final data = doc.data() as Map<String, dynamic>;

      if (data['nombreEstudiante']?.toString() == nombre) {
        return {'id': doc.id, 'data': data};
      }
    }

    return null;
  }

  Future<void> _evaluarEstudiante({
    required String uid,
    required String nombre,
    Map<String, dynamic>? evaluacionExistente,
    String? evaluacionIdExistente,
  }) async {
    final notaCtrl = TextEditingController(
      text: evaluacionExistente?['notaFinal']?.toString() ?? '',
    );

    final observacionesCtrl = TextEditingController(
      text: evaluacionExistente?['observaciones']?.toString() ?? '',
    );

    final asistencia = <String, bool>{};

    final asistenciaGuardada = evaluacionExistente?['asistencia'];

    for (final clase in widget.modulo.clases) {
      bool presente = false;

      if (asistenciaGuardada is Map) {
        presente = asistenciaGuardada[clase.id] == true;
      }

      asistencia[clase.id] = presente;
    }

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A1D24),
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
                      'Evaluando a: $nombre',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.modulo.titulo,
                      style: const TextStyle(
                        color: Color(0xFFF59E0B),
                        fontSize: 17,
                      ),
                    ),
                    const Divider(height: 36, color: Color(0xFF334155)),
                    const Text(
                      'Asistencia por Clase',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...widget.modulo.clases.map((clase) {
                      return CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: asistencia[clase.id] ?? false,
                        activeColor: const Color(0xFFF59E0B),
                        checkColor: Colors.white,
                        title: Text(
                          clase.titulo,
                          style: const TextStyle(color: Color(0xFFCBD5E1)),
                        ),
                        onChanged: (value) {
                          setModalState(() {
                            asistencia[clase.id] = value ?? false;
                          });
                        },
                      );
                    }),
                    const Divider(height: 36, color: Color(0xFF334155)),
                    const Text(
                      'Calificación Final',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: notaCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Nota',
                              prefixIcon: Icon(Icons.star),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: TextField(
                            controller: observacionesCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Observaciones',
                              prefixIcon: Icon(Icons.comment),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 26),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFF59E0B),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(28),
                          ),
                        ),
                        onPressed: () async {
                          final documentoId = evaluacionIdExistente ?? uid;

                          await _evaluacionesRef.doc(documentoId).set({
                            'asistencia': asistencia,
                            'nombreEstudiante': nombre,
                            'notaFinal': notaCtrl.text.trim(),
                            'observaciones': observacionesCtrl.text.trim(),
                            'ultimaActualizacion': DateTime.now()
                                .toIso8601String(),
                          });

                          if (!ctx.mounted) {
                            return;
                          }

                          Navigator.pop(ctx);
                        },
                        child: const Text(
                          'Guardar Evaluación',
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

    notaCtrl.dispose();
    observacionesCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1115),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Asistencia y Notas',
              style: TextStyle(color: Colors.white, fontSize: 18),
            ),
            Text(
              widget.modulo.titulo,
              style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 13),
            ),
          ],
        ),
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: _usuariosRef
            .where('iglesiaId', isEqualTo: widget.usuario.iglesiaId)
            .snapshots(),
        builder: (context, usuariosSnapshot) {
          if (usuariosSnapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (usuariosSnapshot.hasError) {
            return Center(
              child: Text(
                'No fue posible cargar los miembros.\n'
                '${usuariosSnapshot.error}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.redAccent),
              ),
            );
          }

          final usuarios = usuariosSnapshot.data?.docs ?? [];

          if (usuarios.isEmpty) {
            return const Center(
              child: Text(
                'No hay miembros registrados.',
                style: TextStyle(color: Color(0xFF94A3B8)),
              ),
            );
          }

          return StreamBuilder<QuerySnapshot>(
            stream: _evaluacionesRef.snapshots(),
            builder: (context, evaluacionesSnapshot) {
              if (evaluacionesSnapshot.connectionState ==
                  ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              final evaluaciones = evaluacionesSnapshot.data?.docs ?? [];

              return ListView.builder(
                padding: const EdgeInsets.all(20),
                itemCount: usuarios.length,
                itemBuilder: (context, index) {
                  final usuarioDoc = usuarios[index];

                  final data = usuarioDoc.data() as Map<String, dynamic>;

                  final nombre = data['nombre']?.toString() ?? 'Sin nombre';

                  final evaluacionInfo = _buscarEvaluacionExistente(
                    evaluaciones,
                    usuarioDoc.id,
                    nombre,
                  );

                  final evaluacion =
                      evaluacionInfo?['data'] as Map<String, dynamic>?;

                  final evaluacionId = evaluacionInfo?['id']?.toString();

                  final asistenciaMap = evaluacion?['asistencia'];

                  int asistencias = 0;

                  if (asistenciaMap is Map) {
                    for (final clase in widget.modulo.clases) {
                      if (asistenciaMap[clase.id] == true) {
                        asistencias++;
                      }
                    }
                  }

                  final totalClases = widget.modulo.clases.length;

                  final porcentaje = totalClases == 0
                      ? 0
                      : ((asistencias / totalClases) * 100).round();

                  final nota = evaluacion?['notaFinal']?.toString() ?? '';

                  return Card(
                    color: const Color(0xFF11151A),
                    margin: const EdgeInsets.only(bottom: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                      side: const BorderSide(color: Color(0xFF26313D)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  nombre,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 19,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Wrap(
                                  spacing: 18,
                                  runSpacing: 8,
                                  children: [
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.event_available,
                                          size: 18,
                                          color: Color(0xFF94A3B8),
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          'Asistencia: '
                                          '$asistencias/$totalClases '
                                          '($porcentaje%)',
                                          style: const TextStyle(
                                            color: Color(0xFF94A3B8),
                                          ),
                                        ),
                                      ],
                                    ),
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.star,
                                          size: 19,
                                          color: Color(0xFFF59E0B),
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          'Nota: ${nota.isEmpty ? "-" : nota}',
                                          style: const TextStyle(
                                            color: Color(0xFFF59E0B),
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          if (_esAdmin)
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1E293B),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 24,
                                  vertical: 16,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(30),
                                ),
                              ),
                              onPressed: () {
                                _evaluarEstudiante(
                                  uid: usuarioDoc.id,
                                  nombre: nombre,
                                  evaluacionExistente: evaluacion,
                                  evaluacionIdExistente: evaluacionId,
                                );
                              },
                              child: const Text('Evaluar'),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}
