import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'escuela_asignaciones_models.dart';
import 'escuela_asignaciones_service.dart';

class EscuelaAsignacionesScreen extends StatefulWidget {
  const EscuelaAsignacionesScreen({
    super.key,
    required this.usuario,
    this.repositorio,
  });
  final UsuarioModel usuario;
  final EscuelaAsignacionesRepositorio? repositorio;
  @override
  State<EscuelaAsignacionesScreen> createState() =>
      _EscuelaAsignacionesScreenState();
}

class _EscuelaAsignacionesScreenState extends State<EscuelaAsignacionesScreen> {
  late EscuelaAsignacionesRepositorio _repo;
  late Stream<List<EscuelaCiclo>> _ciclos;
  String? _seleccion;
  bool _ocupado = false;
  bool get _admin =>
      ['admin_iglesia', 'lider_area'].contains(widget.usuario.rolGlobal);
  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  void _iniciar() {
    _repo =
        widget.repositorio ??
        EscuelaAsignacionesService(
          iglesiaId: widget.usuario.iglesiaId,
          actorUid: widget.usuario.uid,
        );
    _ciclos = _repo.ciclos();
  }

  @override
  void didUpdateWidget(covariant EscuelaAsignacionesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.usuario.uid != widget.usuario.uid ||
        oldWidget.usuario.iglesiaId != widget.usuario.iglesiaId ||
        oldWidget.repositorio != widget.repositorio) {
      _seleccion = null;
      _iniciar();
    }
  }

  void _mensaje(String texto) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(texto)));
    }
  }

  Future<void> _crear() async {
    final repositorio = _repo;
    final nombre = TextEditingController();
    final anio = TextEditingController(text: DateTime.now().year.toString());
    (String, int)? datos;
    try {
      datos = await showDialog<(String, int)>(
        context: context,
        builder: (ctx) {
          return StatefulBuilder(
            builder: (ctx, estado) => AlertDialog(
              title: const Text('Crear ciclo de Escuela'),
              scrollable: true,
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nombre,
                    maxLength: 120,
                    decoration: const InputDecoration(
                      labelText: 'Nombre del ciclo',
                    ),
                    onChanged: (_) => estado(() {}),
                  ),
                  TextField(
                    controller: anio,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Año'),
                    onChanged: (_) => estado(() {}),
                  ),
                  const Text(
                    'Cada ciclo conserva sus propias asignaciones, incluso si se repite un módulo en el mismo año.',
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  onPressed:
                      nombre.text.trim().isEmpty ||
                          (int.tryParse(anio.text) ?? 0) < 2000 ||
                          (int.tryParse(anio.text) ?? 0) > 2200
                      ? null
                      : () => Navigator.pop(ctx, (
                          nombre.text.trim(),
                          int.parse(anio.text),
                        )),
                  child: const Text('Crear'),
                ),
              ],
            ),
          );
        },
      );
    } finally {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        nombre.dispose();
        anio.dispose();
      });
    }
    if (datos == null || !mounted || repositorio != _repo) return;
    setState(() => _ocupado = true);
    try {
      final id = await repositorio.crearCiclo(datos.$1, datos.$2);
      if (mounted) setState(() => _seleccion = id);
      _mensaje('Ciclo creado.');
    } catch (_) {
      _mensaje(
        'No se confirmó la creación. Revisa la lista de ciclos antes de intentarlo otra vez.',
      );
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Asignaciones de Escuela'),
      actions: [
        if (_admin)
          IconButton(
            tooltip: 'Crear ciclo',
            onPressed: _ocupado ? null : _crear,
            icon: const Icon(Icons.add),
          ),
      ],
    ),
    body: StreamBuilder<List<EscuelaCiclo>>(
      key: ObjectKey(_repo),
      stream: _ciclos,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(
            child: Text(
              'No se pudieron cargar los ciclos. Comprueba tu acceso y vuelve a entrar.',
            ),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final ciclos = snapshot.data!;
        if (ciclos.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Todavía no hay ciclos de Escuela.'),
                if (_admin)
                  FilledButton(
                    onPressed: _ocupado ? null : _crear,
                    child: const Text('Crear primer ciclo'),
                  ),
              ],
            ),
          );
        }
        final ciclo = ciclos.firstWhere(
          (c) => c.id == _seleccion,
          orElse: () => ciclos.first,
        );
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: DropdownButton<String>(
                isExpanded: true,
                value: ciclo.id,
                items: ciclos
                    .map(
                      (c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(
                          '${c.anio} · ${c.nombre}${c.cerrado ? ' · Cerrado' : ''}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: _ocupado
                    ? null
                    : (id) => setState(() => _seleccion = id),
              ),
            ),
            Expanded(
              child: _AsignacionesCiclo(
                key: ValueKey(
                  '${widget.usuario.uid}:${widget.usuario.iglesiaId}:${ciclo.id}',
                ),
                ciclo: ciclo,
                repo: _repo,
                admin: _admin,
                puedeEliminar: widget.usuario.rolGlobal == 'admin_iglesia',
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _AsignacionesCiclo extends StatefulWidget {
  const _AsignacionesCiclo({
    super.key,
    required this.ciclo,
    required this.repo,
    required this.admin,
    required this.puedeEliminar,
  });
  final EscuelaCiclo ciclo;
  final EscuelaAsignacionesRepositorio repo;
  final bool admin;
  final bool puedeEliminar;
  @override
  State<_AsignacionesCiclo> createState() => _AsignacionesCicloState();
}

class _AsignacionesCicloState extends State<_AsignacionesCiclo> {
  late final Stream<List<EscuelaAsignacion>> _asignaciones = widget.repo
      .asignaciones(widget.ciclo.id);
  bool _ocupado = false;
  bool _consultando = false;
  bool get _editable =>
      mounted && widget.admin && !widget.ciclo.cerrado && !_ocupado;
  String _error(Object error) => error is StateError
      ? error.message.toString()
      : 'No se confirmó el cambio. Revisa el estado actual antes de volver a guardar.';
  void _mensaje(String texto) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(texto)));
    }
  }

  Future<void> _ejecutar(Future<void> Function() accion) async {
    if (!_editable) return;
    setState(() {
      _ocupado = true;
      _consultando = true;
    });
    try {
      await accion();
    } catch (e) {
      _mensaje(_error(e));
    } finally {
      if (mounted) {
        setState(() {
          _ocupado = false;
          _consultando = false;
        });
      }
    }
  }

  Future<bool> _confirmar(String titulo, String texto) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(titulo),
          content: Text(texto),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmar'),
            ),
          ],
        ),
      ) ??
      false;
  Future<void> _cerrar() async {
    if (!_editable) return;
    if (await _confirmar(
      'Cerrar ciclo',
      'Las asignaciones quedarán como historial y no podrán modificarse. Para repetir módulos, crea otro ciclo.',
    )) {
      await _ejecutar(() => widget.repo.cerrarCiclo(widget.ciclo.id));
    }
  }

  Future<void> _eliminar() async {
    if (!mounted || !widget.puedeEliminar || _ocupado) return;
    final confirmado = await _confirmar(
      'Eliminar ciclo',
      '¿Eliminar «${widget.ciclo.nombre}» (${widget.ciclo.anio})? '
          'Desaparecerá de la lista, tanto si está abierto como cerrado. '
          'Sus asignaciones quedarán conservadas internamente y bloqueadas; '
          'no podrás recuperarlo desde esta pantalla.',
    );
    if (!confirmado || !mounted || !widget.puedeEliminar || _ocupado) return;
    setState(() {
      _ocupado = true;
      _consultando = true;
    });
    try {
      await widget.repo.eliminarCiclo(widget.ciclo.id);
    } catch (e) {
      _mensaje(_error(e));
    } finally {
      if (mounted) {
        setState(() {
          _ocupado = false;
          _consultando = false;
        });
      }
    }
  }

  Future<void> _asignar(
    List<EscuelaAsignacion> actuales, {
    EscuelaAsignacion? anterior,
  }) async {
    if (!_editable) return;
    setState(() {
      _ocupado = true;
      _consultando = true;
    });
    try {
      final hermanos = await widget.repo.hermanos().first.timeout(
        const Duration(seconds: 20),
      );
      final modulos = await widget.repo.modulos().first.timeout(
        const Duration(seconds: 20),
      );
      if (!mounted || widget.ciclo.cerrado || !widget.admin) return;
      setState(() => _consultando = false);
      final disponibles = anterior == null
          ? hermanos
                .where((h) => !actuales.any((a) => a.hermanoUid == h.uid))
                .toList()
          : hermanos.where((h) => h.uid == anterior.hermanoUid).toList();
      if (disponibles.isEmpty || modulos.isEmpty) {
        _mensaje(
          'No hay hermanos sin asignar o módulos disponibles. Para cambiar una asignación usa su botón de edición.',
        );
        return;
      }
      String? hermano = disponibles.first.uid;
      String? modulo = anterior == null ? modulos.first.id : null;
      final decision = await showDialog<(String, String)>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, estado) => AlertDialog(
            title: Text(anterior == null ? 'Asignar módulo' : 'Cambiar módulo'),
            scrollable: true,
            content: SizedBox(
              width: 480,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButton<String>(
                    isExpanded: true,
                    value: hermano,
                    items: disponibles
                        .map(
                          (h) => DropdownMenuItem(
                            value: h.uid,
                            child: Text(
                              '${h.nombre} · ${h.uid.substring(h.uid.length > 6 ? h.uid.length - 6 : 0)}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: anterior == null
                        ? (id) => estado(() => hermano = id)
                        : null,
                  ),
                  DropdownButton<String>(
                    isExpanded: true,
                    value: modulo,
                    hint: const Text('Selecciona el módulo'),
                    items: modulos
                        .where((m) => m.id != anterior?.moduloId)
                        .map(
                          (m) => DropdownMenuItem(
                            value: m.id,
                            child: Text(
                              m.titulo,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (id) => estado(() => modulo = id),
                  ),
                  if (anterior != null)
                    const Text(
                      'El cambio sustituye la asignación de este ciclo y vuelve a Pendiente. Los ciclos anteriores se conservan.',
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: hermano == null || modulo == null
                    ? null
                    : () => Navigator.pop(ctx, (hermano!, modulo!)),
                child: const Text('Confirmar asignación'),
              ),
            ],
          ),
        ),
      );
      if (decision == null ||
          !mounted ||
          widget.ciclo.cerrado ||
          !widget.admin) {
        return;
      }
      setState(() => _consultando = true);
      await widget.repo.asignar(
        widget.ciclo.id,
        decision.$1,
        decision.$2,
        revisionEsperada: anterior?.revision,
      );
    } catch (e) {
      _mensaje(_error(e));
    } finally {
      if (mounted) {
        setState(() {
          _ocupado = false;
          _consultando = false;
        });
      }
    }
  }

  Future<void> _estado(EscuelaAsignacion a, EstadoEscuela estado) async {
    if (!_editable || a.estado == estado) return;
    if (await _confirmar(
      'Cambiar estado',
      '${a.nombreHermano}: marcar ${a.tituloModulo} como ${estado.etiqueta.toLowerCase()}.',
    )) {
      await _ejecutar(
        () => widget.repo.cambiarEstado(
          widget.ciclo.id,
          a.hermanoUid,
          estado,
          revisionEsperada: a.revision,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<EscuelaAsignacion>>(
    stream: _asignaciones,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return const Center(
          child: Text(
            'No se pudieron cargar las asignaciones. Vuelve a entrar a Escuela.',
          ),
        );
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final asignaciones = snapshot.data!;
      return Column(
        children: [
          if (_consultando) const LinearProgressIndicator(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                if (widget.ciclo.cerrado)
                  const Text('Historial: este ciclo está cerrado.'),
                if (widget.puedeEliminar)
                  TextButton.icon(
                    onPressed: _ocupado ? null : _eliminar,
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Eliminar ciclo'),
                  ),
                if (widget.admin && !widget.ciclo.cerrado) ...[
                  FilledButton.icon(
                    onPressed: _editable ? () => _asignar(asignaciones) : null,
                    icon: const Icon(Icons.person_add),
                    label: const Text('Asignar módulo'),
                  ),
                  OutlinedButton(
                    onPressed: _editable ? _cerrar : null,
                    child: const Text('Cerrar ciclo'),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: asignaciones.isEmpty
                ? const Center(
                    child: Text('No hay asignaciones en este ciclo.'),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: asignaciones.length,
                    itemBuilder: (context, i) {
                      final a = asignaciones[i];
                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                a.nombreHermano,
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              Text(a.tituloModulo),
                              Text('Estado: ${a.estado.etiqueta}'),
                              if (a.asignadoEn != null)
                                Text(
                                  'Asignado: ${MaterialLocalizations.of(context).formatCompactDate(a.asignadoEn!)}',
                                ),
                              if (widget.admin && !widget.ciclo.cerrado)
                                Wrap(
                                  spacing: 12,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    DropdownButton<EstadoEscuela>(
                                      value: a.estado,
                                      items: EstadoEscuela.values
                                          .map(
                                            (e) => DropdownMenuItem(
                                              value: e,
                                              child: Text(e.etiqueta),
                                            ),
                                          )
                                          .toList(),
                                      onChanged: !_editable
                                          ? null
                                          : (e) {
                                              if (e != null) _estado(a, e);
                                            },
                                    ),
                                    TextButton(
                                      onPressed: _editable
                                          ? () => _asignar(
                                              asignaciones,
                                              anterior: a,
                                            )
                                          : null,
                                      child: const Text('Cambiar módulo'),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      );
    },
  );
}
