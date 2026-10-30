import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'escuela_asignaciones_models.dart';
import 'escuela_asignaciones_service.dart';
import 'escuela_historial_service.dart';

bool _gestiona(UsuarioModel u) =>
    ['admin_iglesia', 'lider_area'].contains(u.rolGlobal);
EscuelaHistorialRepositorio _repositorio(UsuarioModel u) =>
    EscuelaHistorialService(
      EscuelaAsignacionesService(iglesiaId: u.iglesiaId, actorUid: u.uid),
    );

class EscuelaMiFormacionScreen extends StatelessWidget {
  const EscuelaMiFormacionScreen({
    super.key,
    required this.usuario,
    this.repositorio,
  });
  final UsuarioModel usuario;
  final EscuelaHistorialRepositorio? repositorio;
  @override
  Widget build(BuildContext context) => _HistorialAlumno(
    key: ValueKey('${usuario.iglesiaId}:${usuario.uid}'),
    titulo: 'Mi formación bíblica',
    alumnoUid: usuario.uid,
    nombre: usuario.nombre,
    repo: repositorio ?? _repositorio(usuario),
  );
}

class _HistorialAlumno extends StatefulWidget {
  const _HistorialAlumno({
    super.key,
    required this.titulo,
    required this.alumnoUid,
    required this.nombre,
    required this.repo,
  });
  final String titulo, alumnoUid, nombre;
  final EscuelaHistorialRepositorio repo;
  @override
  State<_HistorialAlumno> createState() => _HistorialAlumnoState();
}

class _HistorialAlumnoState extends State<_HistorialAlumno> {
  late final Stream<List<EscuelaHistorialCiclo>> _flujo = widget.repo.historial(
    hermanoUid: widget.alumnoUid,
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.titulo)),
    body: StreamBuilder<List<EscuelaHistorialCiclo>>(
      stream: _flujo,
      builder: (context, snapshot) {
        if (snapshot.hasError) return const _ErrorHistorial();
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final ciclos = snapshot.data!.where((c) => c.total > 0).toList();
        if (ciclos.isEmpty) {
          return const Center(
            child: Text('Todavía no hay módulos asignados en este historial.'),
          );
        }
        final completados = ciclos.fold(0, (n, c) => n + c.completados);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.nombre, style: Theme.of(context).textTheme.titleLarge),
            Text('Módulos completados: $completados'),
            const SizedBox(height: 12),
            ...ciclos.map((c) => _CicloHistorial(c)),
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Se muestran únicamente los módulos registrados. Los cambios anteriores que fueron sobrescritos no pueden reconstruirse.',
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _CicloHistorial extends StatelessWidget {
  const _CicloHistorial(this.historial);
  final EscuelaHistorialCiclo historial;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${historial.ciclo.anio} · ${historial.ciclo.nombre}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text(
            historial.ciclo.cerrado
                ? 'Ciclo cerrado · Historial'
                : 'Ciclo abierto',
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: historial.progreso),
          Text(
            '${historial.completados}/${historial.total} módulos completados · ${(historial.progreso * 100).round()}%',
          ),
          Text(
            'En curso: ${historial.contar(EstadoEscuela.enCurso)} · Pendientes: ${historial.contar(EstadoEscuela.pendiente)}',
          ),
          const Divider(),
          ...historial.registros.map(
            (a) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                a.estado == EstadoEscuela.completado
                    ? Icons.check_circle_outline
                    : Icons.menu_book,
              ),
              title: Text(a.tituloModulo),
              subtitle: Text(a.estado.etiqueta),
            ),
          ),
        ],
      ),
    ),
  );
}

class EscuelaSeguimientoScreen extends StatefulWidget {
  const EscuelaSeguimientoScreen({
    super.key,
    required this.usuario,
    this.repositorio,
  });
  final UsuarioModel usuario;
  final EscuelaHistorialRepositorio? repositorio;
  @override
  State<EscuelaSeguimientoScreen> createState() =>
      _EscuelaSeguimientoScreenState();
}

class _EscuelaSeguimientoScreenState extends State<EscuelaSeguimientoScreen> {
  late EscuelaHistorialRepositorio _repo;
  Stream<List<EscuelaHistorialCiclo>>? _flujo;
  String _busqueda = '';
  String? _cicloId;
  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  void _iniciar() {
    _repo = widget.repositorio ?? _repositorio(widget.usuario);
    _flujo = _gestiona(widget.usuario) ? _repo.historial() : null;
    _cicloId = null;
    _busqueda = '';
  }

  @override
  void didUpdateWidget(covariant EscuelaSeguimientoScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.usuario.uid != widget.usuario.uid ||
        oldWidget.usuario.iglesiaId != widget.usuario.iglesiaId ||
        oldWidget.usuario.rolGlobal != widget.usuario.rolGlobal ||
        oldWidget.repositorio != widget.repositorio) {
      _iniciar();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_gestiona(widget.usuario)) {
      return const Scaffold(
        body: Center(
          child: Text(
            'No tienes autorización para consultar el seguimiento de alumnos.',
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Seguimiento de alumnos')),
      body: StreamBuilder<List<EscuelaHistorialCiclo>>(
        key: ValueKey(
          '${widget.usuario.uid}:${widget.usuario.iglesiaId}:${widget.usuario.rolGlobal}',
        ),
        stream: _flujo,
        builder: (context, snapshot) {
          if (snapshot.hasError) return const _ErrorHistorial();
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final todos = snapshot.data!;
          final filtro = todos.any((c) => c.ciclo.id == _cicloId)
              ? _cicloId
              : null;
          final ciclos = todos
              .where((c) => filtro == null || c.ciclo.id == filtro)
              .toList();
          final alumnos = <String, String>{};
          for (final ciclo in ciclos) {
            for (final a in ciclo.asignaciones) {
              alumnos.putIfAbsent(a.hermanoUid, () => a.nombreHermano);
            }
          }
          final visibles =
              alumnos.entries
                  .where((a) => a.value.toLowerCase().contains(_busqueda))
                  .toList()
                ..sort((a, b) => a.value.compareTo(b.value));
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Buscar hermano por nombre',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (v) =>
                          setState(() => _busqueda = v.trim().toLowerCase()),
                    ),
                    DropdownButton<String>(
                      isExpanded: true,
                      value: filtro,
                      hint: const Text('Todos los ciclos'),
                      items: [
                        const DropdownMenuItem<String>(
                          value: null,
                          child: Text('Todos los ciclos'),
                        ),
                        ...todos.map(
                          (c) => DropdownMenuItem(
                            value: c.ciclo.id,
                            child: Text(
                              '${c.ciclo.anio} · ${c.ciclo.nombre}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                      onChanged: (v) => setState(() => _cicloId = v),
                    ),
                    Text(
                      'Participantes: ${alumnos.length} · Mostrados: ${visibles.length}',
                    ),
                  ],
                ),
              ),
              Expanded(
                child: visibles.isEmpty
                    ? const Center(
                        child: Text(
                          'No hay alumnos que coincidan con esta búsqueda o ciclo.',
                        ),
                      )
                    : ListView.builder(
                        itemCount: visibles.length,
                        itemBuilder: (context, i) {
                          final alumno = visibles[i];
                          final historial = ciclos
                              .map((c) => c.delHermano(alumno.key))
                              .where((c) => c.total > 0)
                              .toList();
                          final completados = historial.fold(
                            0,
                            (n, c) => n + c.completados,
                          );
                          final enCurso = historial.fold(
                            0,
                            (n, c) => n + c.contar(EstadoEscuela.enCurso),
                          );
                          final pendientes = historial.fold(
                            0,
                            (n, c) => n + c.contar(EstadoEscuela.pendiente),
                          );
                          return Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 4,
                            ),
                            child: ListTile(
                              title: Text(alumno.value),
                              subtitle: Text(
                                'Completados: $completados · En curso: $enCurso · Pendientes: $pendientes',
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute<void>(
                                  builder: (_) => _HistorialAlumno(
                                    titulo: 'Historial del alumno',
                                    nombre: alumno.value,
                                    alumnoUid: alumno.key,
                                    repo: _repo,
                                  ),
                                ),
                              ),
                            ),
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

class _ErrorHistorial extends StatelessWidget {
  const _ErrorHistorial();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text(
        'No se pudo cargar el historial. Comprueba tu conexión y autorización, y vuelve a entrar a Escuela.',
        textAlign: TextAlign.center,
      ),
    ),
  );
}
