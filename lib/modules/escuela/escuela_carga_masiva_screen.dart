import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'escuela_asignaciones_models.dart';
import 'escuela_asignaciones_service.dart';
import 'escuela_carga_masiva_service.dart';
import 'escuela_models.dart';

class EscuelaCargaMasivaScreen extends StatefulWidget {
  const EscuelaCargaMasivaScreen({
    super.key,
    required this.usuario,
    this.repositorio,
    this.carga,
  });
  final UsuarioModel usuario;
  final EscuelaAsignacionesRepositorio? repositorio;
  final EscuelaCargaRepositorio? carga;
  @override
  State<EscuelaCargaMasivaScreen> createState() =>
      _EscuelaCargaMasivaScreenState();
}

class _EscuelaCargaMasivaScreenState extends State<EscuelaCargaMasivaScreen> {
  late EscuelaCargaRepositorio _carga;
  List<EscuelaCiclo> _ciclos = [];
  List<EscuelaHermano> _hermanos = [];
  List<EscuelaModuloModel> _modulos = [];
  final _seleccion = <String>{};
  final _estados = <String, EstadoEscuela>{};
  String? _ciclo, _error;
  String _busqueda = '';
  List<EscuelaCargaFila>? _filas;
  bool _cargando = true, _ocupado = false, _guardado = false;
  int _generacion = 0;
  bool get _autorizado =>
      ['admin_iglesia', 'lider_area'].contains(widget.usuario.rolGlobal);

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  @override
  void didUpdateWidget(covariant EscuelaCargaMasivaScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.usuario.uid != widget.usuario.uid ||
        oldWidget.usuario.iglesiaId != widget.usuario.iglesiaId ||
        oldWidget.usuario.rolGlobal != widget.usuario.rolGlobal ||
        oldWidget.repositorio != widget.repositorio ||
        oldWidget.carga != widget.carga) {
      _iniciar();
    }
  }

  Future<void> _iniciar() async {
    final generacion = ++_generacion;
    _seleccion.clear();
    _estados.clear();
    _ciclo = null;
    _filas = null;
    _ciclos = [];
    _hermanos = [];
    _modulos = [];
    _error = null;
    _ocupado = false;
    _cargando = true;
    _guardado = false;
    if (!_autorizado) return;
    _carga =
        widget.carga ??
        EscuelaCargaMasivaService(
          iglesiaId: widget.usuario.iglesiaId,
          actorUid: widget.usuario.uid,
        );
    final repo =
        widget.repositorio ??
        EscuelaAsignacionesService(
          iglesiaId: widget.usuario.iglesiaId,
          actorUid: widget.usuario.uid,
        );
    try {
      await Future.wait([
        repo.ciclos().first.timeout(const Duration(seconds: 20)).then((v) {
          if (generacion == _generacion) _ciclos = v;
        }),
        repo.hermanos().first.timeout(const Duration(seconds: 20)).then((v) {
          if (generacion == _generacion) _hermanos = v;
        }),
        repo.modulos().first.timeout(const Duration(seconds: 20)).then((v) {
          if (generacion == _generacion) _modulos = v;
        }),
      ]);
    } catch (_) {
      if (generacion == _generacion) _error = 'No se pudieron cargar los datos. Comprueba tu acceso y vuelve a entrar.';
    }
    if (mounted && generacion == _generacion) setState(() => _cargando = false);
  }

  void _cambiar(VoidCallback accion) => setState(() {
    accion();
    _filas = null;
    _guardado = false;
    _error = null;
  });

  Future<void> _revisar({bool confirmar = false}) async {
    final generacion = _generacion;
    if (confirmar) {
      final aceptar = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmar carga masiva'),
          content: const Text(
            'Se crearán únicamente módulos ausentes. Los idénticos se omiten y los conflictos se conservan. Cada hermano se guarda por separado; una interrupción puede dejar una carga parcial que se concilia al reintentar.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmar carga'),
            ),
          ],
        ),
      );
      if (aceptar != true || !mounted || generacion != _generacion) return;
    }
    setState(() {
      _ocupado = true;
      _error = null;
    });
    try {
      final filas = await _carga.revisar(
        cicloId: _ciclo!,
        hermanos: _seleccion.toList(),
        modulos: Map.of(_estados),
        confirmar: confirmar,
      );
      if (mounted && generacion == _generacion) {
        setState(() {
          _filas = filas;
          _guardado = confirmar;
        });
      }
    } catch (_) {
      if (mounted && generacion == _generacion) {
        setState(() {
          _filas = null;
          _error = 'No se confirmó el resultado. Revisa de nuevo: el servidor conciliará lo ya guardado sin duplicarlo.';
        });
      }
    } finally {
      if (mounted && generacion == _generacion) {
        setState(() => _ocupado = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_autorizado) {
      return Scaffold(
        appBar: AppBar(title: const Text('Carga masiva')),
        body: const Center(
          child: Text('No tienes permiso para administrar Escuela.'),
        ),
      );
    }
    final visibles = _hermanos
        .where((h) => h.nombre.toLowerCase().contains(_busqueda.toLowerCase()))
        .toList();
    final abiertos = _ciclos.where((c) => !c.cerrado).toList();
    final nombres = {for (final h in _hermanos) h.uid: h.nombre};
    final titulos = {for (final m in _modulos) m.id: m.titulo};
    final valido =
        _ciclo != null &&
        _seleccion.isNotEmpty &&
        _estados.isNotEmpty &&
        _estados.length <= 30;
    return Scaffold(
      appBar: AppBar(title: const Text('Carga masiva')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : AbsorbPointer(
              absorbing: _ocupado,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  if (_ocupado) const LinearProgressIndicator(),
                  const Text(
                    'Carga avances registrados sin modificar asignaciones existentes. La fecha guardada corresponde a esta carga.',
                  ),
                  if (abiertos.isEmpty)
                    const Text(
                      'No hay ciclos abiertos. Crea uno desde Asignaciones para cargar sus módulos.',
                    ),
                  DropdownButtonFormField<String>(
                    initialValue: _ciclo,
                    decoration: const InputDecoration(labelText: 'Ciclo'),
                    items: [
                      for (final c in abiertos)
                        DropdownMenuItem(
                          value: c.id,
                          child: Text('${c.nombre} · ${c.anio}'),
                        ),
                    ],
                    onChanged: (v) => _cambiar(() => _ciclo = v),
                  ),
                  const SizedBox(height: 16),
                  Text('Hermanos seleccionados: ${_seleccion.length}'),
                  TextField(
                    decoration: const InputDecoration(
                      labelText: 'Buscar hermano por nombre',
                    ),
                    onChanged: (v) => setState(() => _busqueda = v),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: () => _cambiar(
                          () => _seleccion.addAll(_hermanos.map((h) => h.uid)),
                        ),
                        child: const Text('Seleccionar todos'),
                      ),
                      TextButton(
                        onPressed: () => _cambiar(_seleccion.clear),
                        child: const Text('Deseleccionar todos'),
                      ),
                    ],
                  ),
                  if (_hermanos.isEmpty)
                    const Text('No hay hermanos activos disponibles.'),
                  if (_hermanos.isNotEmpty && visibles.isEmpty)
                    const Text('No hay coincidencias.'),
                  for (final h in visibles)
                    CheckboxListTile(
                      title: Text(h.nombre),
                      value: _seleccion.contains(h.uid),
                      onChanged: (v) => _cambiar(() {
                        if (v == true) {
                          _seleccion.add(h.uid);
                        } else {
                          _seleccion.remove(h.uid);
                        }
                      }),
                    ),
                  const Divider(),
                  const Text(
                    'Módulos del catálogo de la iglesia para el ciclo seleccionado (máximo 30 por carga).',
                  ),
                  if (_modulos.isEmpty)
                    const Text('No hay módulos disponibles.'),
                  for (final m in _modulos)
                    DropdownButtonFormField<String>(
                      key: ValueKey(m.id),
                      initialValue: _estados[m.id]?.valor ?? 'no',
                      decoration: InputDecoration(labelText: m.titulo),
                      items: [
                        const DropdownMenuItem(
                          value: 'no',
                          child: Text('No asignar'),
                        ),
                        for (final e in EstadoEscuela.values)
                          DropdownMenuItem(
                            value: e.valor,
                            child: Text(e.etiqueta),
                          ),
                      ],
                      onChanged: (v) => _cambiar(() {
                        if (v == null || v == 'no') {
                          _estados.remove(m.id);
                        } else {
                          _estados[m.id] = EstadoEscuela.leer(v);
                        }
                      }),
                    ),
                  if (_estados.length > 30)
                    const Text('Selecciona como máximo 30 módulos por carga.'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: !_ocupado && valido ? () => _revisar() : null,
                    child: Text(
                      _guardado
                          ? 'Conciliar y revisar de nuevo'
                          : 'Vista previa',
                    ),
                  ),
                  if (_filas != null) ...[
                    Text(
                      _guardado
                          ? 'Resultado de la carga'
                          : 'Vista previa · aún sin guardar',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    for (final tipo in [
                      'creado',
                      'omitido',
                      'conflicto',
                      'error',
                    ])
                      Text(
                        '${{'creado': _guardado ? 'Creados' : 'Por crear', 'omitido': 'Omitidos', 'conflicto': 'Conflictos', 'error': 'Errores'}[tipo]}: ${_filas!.where((f) => f.resultado == tipo).length}',
                      ),
                    const Text(
                      'Al guardar se vuelven a comprobar los permisos, el ciclo y las asignaciones. Un cambio concurrente puede modificar el resultado.',
                    ),
                    ExpansionTile(
                      title: const Text('Detalle por hermano y módulo'),
                      children: [
                        for (final f in _filas!)
                          ListTile(
                            title: Text(
                              '${nombres[f.hermanoUid] ?? f.hermanoUid} · ${titulos[f.moduloId] ?? f.moduloId}',
                            ),
                            subtitle: Text(
                              '${_estados[f.moduloId]?.etiqueta ?? ''} · ${f.resultado == 'creado' && !_guardado ? 'por crear' : f.resultado}${f.mensaje.isEmpty ? '' : ': ${f.mensaje}'}',
                            ),
                          ),
                      ],
                    ),
                    if (!_guardado)
                      FilledButton(
                        onPressed:
                            !_ocupado &&
                                _filas!.any((f) => f.resultado == 'creado')
                            ? () => _revisar(confirmar: true)
                            : null,
                        child: const Text('Guardar carga masiva'),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
