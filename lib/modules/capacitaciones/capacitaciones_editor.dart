import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';

import 'capacitaciones_archivos.dart';
import 'capacitaciones_logica.dart';
import 'capacitaciones_markdown.dart';
import 'capacitaciones_models.dart';
import 'capacitaciones_service.dart';

class CapacitacionEditor extends StatefulWidget {
  final CapacitacionesService service;
  final List<CapacitacionCategoriaModel> categorias;
  final CapacitacionModel? existente;
  final String categoriaInicial;
  const CapacitacionEditor({
    super.key,
    required this.service,
    required this.categorias,
    this.existente,
    this.categoriaInicial = '',
  });

  @override
  State<CapacitacionEditor> createState() => _CapacitacionEditorState();
}

class _CapacitacionEditorState extends State<CapacitacionEditor> {
  late final TextEditingController _titulo;
  late final TextEditingController _descripcion;
  late final TextEditingController _contenido;
  late final TextEditingController _enlace;
  late String _tipo;
  late String _categoria;
  late bool _markdown;
  bool _ocupado = false;
  double? _progreso;
  Uint8List? _bytes;
  String? _nombreArchivo;
  CancelacionSubidaCapacitacion? _cancelacion;

  @override
  void initState() {
    super.initState();
    final c = widget.existente;
    _titulo = TextEditingController(text: c?.titulo ?? '');
    _descripcion = TextEditingController(text: c?.descripcion ?? '');
    _contenido = TextEditingController(text: c?.contenido ?? '');
    _enlace = TextEditingController(text: c?.linkVideo ?? '');
    final tipo = c?.tipoEfectivo ?? 'reflexion';
    _tipo = const ['reflexion', 'archivo', 'enlace'].contains(tipo)
        ? tipo
        : 'reflexion';
    _categoria = c?.categoriaId ?? widget.categoriaInicial;
    if (!widget.categorias.any((c) => c.id == _categoria)) _categoria = '';
    _markdown = c == null || !c.esHeredada;
  }

  @override
  void dispose() {
    _cancelacion?.cancelar();
    _titulo.dispose();
    _descripcion.dispose();
    _contenido.dispose();
    _enlace.dispose();
    super.dispose();
  }

  void _aviso(String texto) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(texto)));

  Future<void> _elegirArchivo() async {
    setState(() => _ocupado = true);
    try {
      final archivo = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: tiposArchivoCapacitacion.keys.toList(),
      );
      if (archivo == null || !mounted) return;
      final tamano = await archivo.length();
      if (tamano == null) {
        throw StateError('No fue posible conocer el tamaño del archivo.');
      }
      final error = validarArchivoCapacitacion(
        archivo.name,
        tamano,
        mimeDeclarado: archivo.xFile.mimeType,
      );
      if (error != null) throw StateError(error);
      final bytes = await archivo.readAsBytes();
      final errorContenido = validarArchivoCapacitacion(
        archivo.name,
        bytes.length,
        bytes: bytes,
        mimeDeclarado: archivo.xFile.mimeType,
      );
      if (errorContenido != null) throw StateError(errorContenido);
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _nombreArchivo = archivo.name;
      });
    } catch (error) {
      if (mounted) _aviso('No fue posible seleccionar el archivo: $error');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _guardar() async {
    if (_ocupado || _titulo.text.trim().isEmpty) {
      _aviso('Ingresa un título.');
      return;
    }
    if (_tipo == 'reflexion' && _contenido.text.trim().isEmpty) {
      _aviso('Escribe el contenido de la reflexión.');
      return;
    }
    if (_tipo == 'enlace' && enlaceCapacitacionSeguro(_enlace.text) == null) {
      _aviso('Ingresa un enlace HTTP o HTTPS válido.');
      return;
    }
    if (_tipo == 'archivo' &&
        _bytes == null &&
        (widget.existente?.archivoUrl.isEmpty ?? true)) {
      _aviso('Selecciona un archivo.');
      return;
    }
    final anterior = widget.existente;
    final modelo = CapacitacionModel(
      id: anterior?.id ?? '',
      titulo: _titulo.text.trim(),
      descripcion: _descripcion.text.trim(),
      contenido: _tipo == 'reflexion' ? _contenido.text : '',
      linkVideo: _tipo == 'enlace' ? _enlace.text.trim() : '',
      tipo: _tipo == 'reflexion'
          ? 'texto'
          : (_tipo == 'enlace' ? 'video' : 'archivo'),
      tipoContenido: _tipo == 'reflexion' && !_markdown ? null : _tipo,
      categoriaId: _categoria,
      fechaCreacion: anterior?.fechaCreacion,
      archivoUrl: _tipo == 'archivo' ? anterior?.archivoUrl ?? '' : '',
      archivoNombre: _tipo == 'archivo' ? anterior?.archivoNombre ?? '' : '',
      archivoTipo: _tipo == 'archivo' ? anterior?.archivoTipo ?? '' : '',
      archivoTamano: _tipo == 'archivo' ? anterior?.archivoTamano ?? 0 : 0,
    );
    final ruta = ModalRoute.of(context)!;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _ocupado = true;
      _progreso = _tipo == 'archivo' && _bytes != null ? 0 : null;
      _cancelacion = _progreso == null ? null : CancelacionSubidaCapacitacion();
    });
    try {
      final aviso = await widget.service.guardarContenido(
        modelo,
        anterior: anterior,
        bytes: _tipo == 'archivo' ? _bytes : null,
        nombreArchivo: _nombreArchivo,
        cancelacion: _cancelacion,
        archivoSubido: () {
          if (!mounted) return;
          setState(() {
            _progreso = null;
            _cancelacion = null;
          });
        },
        progreso: (valor) {
          if (mounted) setState(() => _progreso = valor);
        },
      );
      if (!mounted || !ruta.isCurrent) return;
      navigator.pop();
      if (messenger.mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text(aviso ?? 'Capacitación guardada.')),
        );
      }
    } on FirebaseException catch (error) {
      if (mounted) {
        final mensaje = switch (error.code) {
          'unauthorized' || 'permission-denied' =>
            error.plugin.contains('storage')
                ? 'No fue posible subir el archivo: permisos insuficientes.'
                : 'No fue posible guardar la capacitación: permisos insuficientes.',
          'canceled' => 'Subida cancelada. Puedes volver a intentar.',
          'upload-timeout' || 'retry-limit-exceeded' => 'No fue posible subir el archivo: se agotó el tiempo de espera. Puedes volver a intentar.',
          _ =>
            'No fue posible guardar la capacitación (${error.code}). Puedes volver a intentar.',
        };
        _aviso(mensaje);
      }
    } catch (error) {
      if (mounted) _aviso('No fue posible guardar: $error');
    } finally {
      if (mounted) {
        setState(() {
          _ocupado = false;
          _progreso = null;
          _cancelacion = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_ocupado,
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        24,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.existente == null
                  ? 'Nueva capacitación'
                  : 'Editar capacitación',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _titulo,
              enabled: !_ocupado,
              decoration: const InputDecoration(labelText: 'Título'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descripcion,
              enabled: !_ocupado,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Descripción breve'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _categoria,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Categoría'),
              items: [
                const DropdownMenuItem(value: '', child: Text('General')),
                ...widget.categorias.map(
                  (c) => DropdownMenuItem(
                    value: c.id,
                    child: Text('${c.nombre}${c.activa ? '' : ' (inactiva)'}'),
                  ),
                ),
              ],
              onChanged: _ocupado
                  ? null
                  : (v) => setState(() => _categoria = v ?? ''),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _tipo,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Tipo de contenido'),
              items: const [
                DropdownMenuItem(value: 'reflexion', child: Text('Reflexión')),
                DropdownMenuItem(value: 'archivo', child: Text('Archivo')),
                DropdownMenuItem(
                  value: 'enlace',
                  child: Text('Enlace / Video'),
                ),
              ],
              onChanged: _ocupado
                  ? null
                  : (v) => setState(() => _tipo = v ?? 'reflexion'),
            ),
            const SizedBox(height: 12),
            if (_tipo == 'reflexion') ...[
              if (widget.existente?.esHeredada == true)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Usar formato enriquecido'),
                  value: _markdown,
                  onChanged: _ocupado
                      ? null
                      : (v) => setState(() => _markdown = v),
                ),
              EditorMarkdownCapacitacion(
                controller: _contenido,
                habilitado: !_ocupado,
                onFormato: () => setState(() => _markdown = true),
              ),
            ],
            if (_tipo == 'enlace')
              TextField(
                controller: _enlace,
                enabled: !_ocupado,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Enlace HTTP / HTTPS',
                ),
              ),
            if (_tipo == 'archivo') ...[
              Text(
                _nombreArchivo ??
                    widget.existente?.archivoNombre ??
                    'Sin archivo seleccionado',
                overflow: TextOverflow.ellipsis,
              ),
              if (_cancelacion != null)
                TextButton(
                  onPressed: () => _cancelacion?.cancelar(),
                  child: const Text('Cancelar subida'),
                ),
              const Text('Máximo 25 MB. PDF, Office, texto, HTML e imágenes.'),
              OutlinedButton.icon(
                onPressed: _ocupado ? null : _elegirArchivo,
                icon: const Icon(Icons.attach_file),
                label: const Text('Seleccionar / reemplazar archivo'),
              ),
            ],
            if (_ocupado) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: _progreso),
              Text(
                _progreso == null
                    ? 'Procesando…'
                    : 'Subiendo ${(_progreso! * 100).round()}%',
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _ocupado ? null : _guardar,
                child: const Text('Guardar capacitación'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class CategoriaCapacitacionEditor extends StatefulWidget {
  final CapacitacionesService service;
  final CapacitacionCategoriaModel? existente;
  final int ordenInicial;
  const CategoriaCapacitacionEditor({
    super.key,
    required this.service,
    this.existente,
    this.ordenInicial = 0,
  });
  @override
  State<CategoriaCapacitacionEditor> createState() =>
      _CategoriaCapacitacionEditorState();
}

class _CategoriaCapacitacionEditorState
    extends State<CategoriaCapacitacionEditor> {
  late final TextEditingController _nombre;
  late final TextEditingController _descripcion;
  late final TextEditingController _orden;
  late bool _activa;
  bool _guardando = false;
  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController(text: widget.existente?.nombre ?? '');
    _descripcion = TextEditingController(
      text: widget.existente?.descripcion ?? '',
    );
    _orden = TextEditingController(
      text: '${widget.existente?.orden ?? widget.ordenInicial}',
    );
    _activa = widget.existente?.activa ?? true;
  }

  @override
  void dispose() {
    _nombre.dispose();
    _descripcion.dispose();
    _orden.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (_guardando) return;
    if (_nombre.text.trim().isEmpty || int.tryParse(_orden.text) == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingresa un nombre y un orden numérico.')),
      );
      return;
    }
    final ruta = ModalRoute.of(context)!;
    final navigator = Navigator.of(context);
    setState(() => _guardando = true);
    try {
      await widget.service.guardarCategoria(
        CapacitacionCategoriaModel(
          id: widget.existente?.id ?? '',
          nombre: _nombre.text.trim(),
          descripcion: _descripcion.text.trim(),
          orden: int.parse(_orden.text),
          activa: _activa,
        ),
      );
      if (mounted && ruta.isCurrent) navigator.pop();
    } on FirebaseException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.code == 'permission-denied'
                  ? 'No fue posible guardar la categoría: permisos insuficientes. Verifica tu rol y las reglas de categorías.'
                  : 'No fue posible guardar la categoría (${error.code}).',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('No fue posible guardar la categoría: $error'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_guardando,
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        24,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.existente == null ? 'Nueva categoría' : 'Editar categoría',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nombre,
              enabled: !_guardando,
              decoration: const InputDecoration(labelText: 'Nombre'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descripcion,
              enabled: !_guardando,
              decoration: const InputDecoration(labelText: 'Descripción'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _orden,
              enabled: !_guardando,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Orden (número)'),
            ),
            SwitchListTile(
              title: const Text('Activa'),
              value: _activa,
              onChanged: _guardando ? null : (v) => setState(() => _activa = v),
            ),
            ElevatedButton(
              onPressed: _guardando ? null : _guardar,
              child: Text(_guardando ? 'Guardando…' : 'Guardar categoría'),
            ),
          ],
        ),
      ),
    ),
  );
}
