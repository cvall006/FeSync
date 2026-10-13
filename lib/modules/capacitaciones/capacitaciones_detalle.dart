import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'capacitaciones_descarga.dart';
import 'capacitaciones_archivos.dart';
import 'capacitaciones_logica.dart';
import 'capacitaciones_markdown.dart';
import 'capacitaciones_models.dart';
import 'capacitaciones_service.dart';

class CapacitacionDetalleScreen extends StatefulWidget {
  final CapacitacionModel capacitacion;
  final CapacitacionesService service;
  const CapacitacionDetalleScreen({
    super.key,
    required this.capacitacion,
    required this.service,
  });
  @override
  State<CapacitacionDetalleScreen> createState() =>
      _CapacitacionDetalleScreenState();
}

class _CapacitacionDetalleScreenState extends State<CapacitacionDetalleScreen> {
  Uint8List? _bytes;
  bool _cargando = false;
  String? _error;
  Future<void> _prepararArchivo() async {
    if (_cargando) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final bytes = await widget.service.leerArchivo(widget.capacitacion);
      if (mounted) setState(() => _bytes = bytes);
    } catch (error) {
      if (mounted) {
        setState(() => _error = 'No fue posible descargar el material: $error');
      }
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _entregar(BuildContext buttonContext, bool abrir) async {
    final c = widget.capacitacion;
    final box = buttonContext.findRenderObject() as RenderBox?;
    try {
      await entregarArchivoCapacitacion(
        _bytes!,
        nombreStorageSeguro(c.archivoNombre),
        c.archivoTipo.isEmpty
            ? tiposArchivoCapacitacion[extensionArchivoCapacitacion(
                c.archivoNombre,
              )]!
            : c.archivoTipo,
        abrir: abrir,
        origen: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No fue posible abrir o compartir: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.capacitacion;
    return Scaffold(
      appBar: AppBar(title: Text(c.titulo)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(c.etiquetaTipo, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 12),
            if (c.descripcion.isNotEmpty) ...[
              Text(c.descripcion),
              const SizedBox(height: 16),
            ],
            if (c.esTexto)
              ReflexionCapacitacion(
                contenido: c.contenido,
                heredada: c.esHeredada,
              ),
            if (c.esVideo) ...[
              SelectableText(c.linkVideo),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.open_in_new),
                label: const Text('Abrir enlace / video'),
                onPressed: () async {
                  final uri = enlaceCapacitacionSeguro(c.linkVideo);
                  if (uri == null ||
                      !await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      )) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('No fue posible abrir este enlace.'),
                        ),
                      );
                    }
                  }
                },
              ),
            ],
            if (c.esArchivo) ...[
              Text(
                c.archivoNombre,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                '${c.archivoTipo}\n${(c.archivoTamano / (1024 * 1024)).toStringAsFixed(2)} MB',
              ),
              const SizedBox(height: 16),
              if (c.archivoTipo == 'text/html')
                const Text(
                  'HTML se descarga como archivo y no se ejecuta dentro de FeSync.',
                ),
              if (_error != null)
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              if (_cargando) const LinearProgressIndicator(),
              if (_bytes == null)
                OutlinedButton.icon(
                  onPressed: _cargando ? null : _prepararArchivo,
                  icon: const Icon(Icons.download),
                  label: const Text('Cargar material'),
                ),
              if (_bytes != null) ...[
                if (c.archivoTipo.startsWith('image/'))
                  Image.memory(
                    _bytes!,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Text('No fue posible mostrar la imagen.'),
                  ),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    if (c.archivoTipo != 'text/html')
                      Builder(
                        builder: (ctx) => OutlinedButton.icon(
                          onPressed: () => _entregar(ctx, true),
                          icon: const Icon(Icons.open_in_new),
                          label: const Text('Abrir / Ver'),
                        ),
                      ),
                    Builder(
                      builder: (ctx) => OutlinedButton.icon(
                        onPressed: () => _entregar(ctx, false),
                        icon: const Icon(Icons.download),
                        label: const Text('Descargar / Compartir'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
