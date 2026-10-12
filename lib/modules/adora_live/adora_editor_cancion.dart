import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'adora_models.dart';
import 'adora_parser_acordes.dart';
import 'adora_visor_cancion_screen.dart';

Future<void> mostrarEditorAdoraCancion({
  required BuildContext context,
  required String creadorUid,
  AdoraCancionModel? cancion,
  required Future<void> Function(Map<String, dynamic>) guardar,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _AdoraEditorCancion(
      cancion: cancion,
      creadorUid: creadorUid,
      guardar: guardar,
    ),
  );
}

class _AdoraEditorCancion extends StatefulWidget {
  final AdoraCancionModel? cancion;
  final String creadorUid;
  final Future<void> Function(Map<String, dynamic>) guardar;

  const _AdoraEditorCancion({
    required this.cancion,
    required this.creadorUid,
    required this.guardar,
  });

  @override
  State<_AdoraEditorCancion> createState() => _AdoraEditorCancionState();
}

class _AdoraEditorCancionState extends State<_AdoraEditorCancion> {
  late final TextEditingController tituloCtrl;
  late final TextEditingController autorCtrl;
  late final TextEditingController tonoCtrl;
  late final TextEditingController vozCtrl;
  late final TextEditingController youtubeCtrl;
  late final TextEditingController letraCtrl;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    final cancion = widget.cancion;
    tituloCtrl = TextEditingController(text: cancion?.titulo ?? '');
    autorCtrl = TextEditingController(text: cancion?.autor ?? '');
    tonoCtrl = TextEditingController(text: cancion?.tono ?? '');
    vozCtrl = TextEditingController(text: cancion?.vozPrincipal ?? '');
    youtubeCtrl = TextEditingController(text: cancion?.youtube ?? '');
    letraCtrl = TextEditingController(text: cancion?.letra ?? '');
  }

  @override
  void dispose() {
    // The sheet's Future completes before its closing animation unmounts
    // the TextFields. Keep their controllers alive until this State unmounts.
    tituloCtrl.dispose();
    autorCtrl.dispose();
    tonoCtrl.dispose();
    vozCtrl.dispose();
    youtubeCtrl.dispose();
    letraCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctx = context;
    final cancion = widget.cancion;
    final creadorUid = widget.creadorUid;
    final theme = Theme.of(ctx);
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
              cancion == null ? 'Nueva Canción' : 'Editar Canción',
              style: TextStyle(
                color: theme.colorScheme.onSurface,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: tituloCtrl,
              decoration: const InputDecoration(labelText: 'Título'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: autorCtrl,
              decoration: const InputDecoration(labelText: 'Autor original'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: tonoCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Tono (ej: Do)',
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextField(
                    controller: vozCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Voz Principal (ej: Juan)',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: youtubeCtrl,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText:
                    'Links de Tutoriales '
                    '(uno por línea)',
                alignLabelWithHint: true,
                hintText:
                    'Guitarra: https://youtube.com/...\n'
                    'Piano: https://youtube.com/...',
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.content_paste),
                  label: const Text('Pegar canción'),
                  onPressed: _guardando
                      ? null
                      : () async {
                          final datos = await Clipboard.getData(
                            Clipboard.kTextPlain,
                          );
                          if (!ctx.mounted || _guardando) return;
                          final texto = datos?.text ?? '';
                          if (texto.trim().isEmpty) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              const SnackBar(
                                content: Text('El portapapeles está vacío.'),
                              ),
                            );
                            return;
                          }
                          letraCtrl.text = normalizarTextoImportado(texto);
                        },
                ),
                OutlinedButton.icon(
                  icon: const Icon(Icons.auto_fix_high),
                  label: const Text('Analizar'),
                  onPressed: _guardando
                      ? null
                      : () {
                          letraCtrl.text = normalizarTextoImportado(
                            letraCtrl.text,
                          );
                        },
                ),
                OutlinedButton.icon(
                  icon: const Icon(Icons.visibility),
                  label: const Text('Vista previa'),
                  onPressed: _guardando
                      ? null
                      : () async {
                          final textoNormalizado = normalizarTextoImportado(
                            letraCtrl.text,
                          );
                          final temporal = AdoraCancionModel(
                            id: 'vista-previa',
                            titulo: tituloCtrl.text,
                            autor: autorCtrl.text,
                            tono: tonoCtrl.text,
                            letra: textoNormalizado,
                            vozPrincipal: vozCtrl.text,
                            youtube: youtubeCtrl.text,
                            creadorUid: creadorUid,
                            fechaCreacion: null,
                          );
                          FocusScope.of(ctx).unfocus();
                          await Navigator.of(ctx).push<void>(
                            MaterialPageRoute(
                              builder: (_) => AdoraVisorCancionScreen(
                                cancion: temporal,
                                puedeEditar: false,
                                esVistaPrevia: true,
                              ),
                            ),
                          );
                        },
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: letraCtrl,
              minLines: 10,
              maxLines: 20,
              style: const TextStyle(fontFamily: 'Courier'),
              decoration: const InputDecoration(
                labelText: 'Letra y acordes',
                helperText: 'Puedes pegar la canción directamente desde una página web.',
                helperMaxLines: 2,
                alignLabelWithHint: true,
                hintText:
                    'VERSO 1\n'
                    '     G                    Am          G\n'
                    'Te alabo en el valle, Te alabo en el monte\n\n'
                    'Intro: ////Bm - G - D - A////',
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                onPressed: _guardando
                    ? null
                    : () async {
                        if (_guardando || tituloCtrl.text.trim().isEmpty) {
                          return;
                        }

                        final datos = {
                          'titulo': tituloCtrl.text.trim(),
                          'autor': autorCtrl.text.trim(),
                          'tono': tonoCtrl.text.trim(),
                          'voz_principal': vozCtrl.text.trim(),
                          'youtube': youtubeCtrl.text.trim(),
                          'letra': normalizarTextoImportado(letraCtrl.text)
                              .trim(),
                          'creadorUid': cancion?.creadorUid.isNotEmpty == true
                              ? cancion!.creadorUid
                              : creadorUid,
                        };

                        final navigator = Navigator.of(ctx);
                        final rutaEditor = ModalRoute.of(ctx)!;
                        setState(() => _guardando = true);
                        try {
                          await widget.guardar(datos);
                          if (!mounted || !rutaEditor.isCurrent) return;
                          navigator.pop();
                        } finally {
                          if (mounted && rutaEditor.isCurrent) {
                            setState(() => _guardando = false);
                          }
                        }
                      },
                child: const Text(
                  'Guardar Canción',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
