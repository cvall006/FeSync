import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'capacitaciones_logica.dart';

void insertarFormatoMarkdown(
  TextEditingController controller,
  String antes,
  String despues,
  String ejemplo,
) {
  final seleccion = controller.selection;
  final inicio = seleccion.isValid ? seleccion.start : controller.text.length;
  final fin = seleccion.isValid ? seleccion.end : inicio;
  final seleccionado = controller.text.substring(inicio, fin);
  final texto = seleccionado.isEmpty ? ejemplo : seleccionado;
  controller.value = TextEditingValue(
    text: controller.text.replaceRange(inicio, fin, '$antes$texto$despues'),
    selection: TextSelection(
      baseOffset: inicio + antes.length,
      extentOffset: inicio + antes.length + texto.length,
    ),
  );
}

class EditorMarkdownCapacitacion extends StatelessWidget {
  final TextEditingController controller;
  final bool habilitado;
  final VoidCallback? onFormato;
  const EditorMarkdownCapacitacion({
    super.key,
    required this.controller,
    this.habilitado = true,
    this.onFormato,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        spacing: 4,
        children: [
          for (final formato in [
            ('B', '**', '**', 'Negrita'),
            ('I', '*', '*', 'Cursiva'),
            ('Título', '\n# ', '\n', 'Título'),
            ('Subtítulo', '\n## ', '\n', 'Subtítulo'),
            ('Lista', '\n- ', '\n', 'Elemento'),
            ('Cita', '\n> ', '\n', 'Cita'),
            ('Enlace', '[', '](https://)', 'Texto del enlace'),
          ])
            TextButton(
              onPressed: !habilitado
                  ? null
                  : () {
                      insertarFormatoMarkdown(
                        controller,
                        formato.$2,
                        formato.$3,
                        formato.$4,
                      );
                      onFormato?.call();
                    },
              child: Text(formato.$1),
            ),
        ],
      ),
      TextField(
        controller: controller,
        enabled: habilitado,
        minLines: 6,
        maxLines: 16,
        decoration: const InputDecoration(
          labelText: 'Reflexión',
          alignLabelWithHint: true,
          helperText: 'Selecciona texto y usa los botones para darle formato.',
        ),
      ),
    ],
  );
}

class ReflexionCapacitacion extends StatelessWidget {
  final String contenido;
  final bool heredada;
  const ReflexionCapacitacion({
    super.key,
    required this.contenido,
    this.heredada = false,
  });

  @override
  Widget build(BuildContext context) {
    if (heredada) {
      return SelectableText(contenido, style: const TextStyle(height: 1.5));
    }
    return MarkdownBody(
      data: contenido,
      selectable: true,
      imageBuilder: (_, _, _) =>
          const Text('[Imagen no incluida en la reflexión]'),
      onTapLink: (_, href, _) async {
        final uri = enlaceCapacitacionSeguro(href ?? '');
        if (uri != null) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
    );
  }
}
