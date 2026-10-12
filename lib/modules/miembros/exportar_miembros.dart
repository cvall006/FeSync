import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/models/app_models.dart';

bool puedeExportarMiembros(UsuarioModel usuario) =>
    usuario.iglesiaId.trim().isNotEmpty &&
    const ['admin_iglesia', 'lider_area'].contains(usuario.rolGlobal);

String _textoCampo(Object? valor, String fallback) {
  final texto = valor?.toString().replaceAll(RegExp(r'\s+'), ' ').trim() ?? '';
  return texto.isEmpty ? fallback : texto;
}

String _claveNombre(String nombre) {
  var clave = nombre.toLowerCase().replaceAll('ñ', 'n~');
  const acentos = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u'};
  acentos.forEach(
    (original, reemplazo) => clave = clave.replaceAll(original, reemplazo),
  );
  return clave;
}

String generarListaMiembros({
  required UsuarioModel usuario,
  required Iterable<Map<String, dynamic>> miembros,
  String? nombreIglesia,
}) {
  if (!puedeExportarMiembros(usuario)) return '';
  final lista = miembros
      .where((miembro) => miembro['iglesiaId'] == usuario.iglesiaId)
      .map(
        (miembro) => (
          nombre: _textoCampo(miembro['nombre'], 'Sin nombre'),
          email: _textoCampo(miembro['email'], 'Sin correo'),
        ),
      )
      .toList();
  lista.sort((a, b) {
    final orden = _claveNombre(a.nombre).compareTo(_claveNombre(b.nombre));
    return orden != 0 ? orden : a.email.compareTo(b.email);
  });
  if (lista.isEmpty) return '';
  final iglesia = _textoCampo(nombreIglesia, '');
  final encabezado = iglesia.isEmpty
      ? 'Miembros de la iglesia'
      : 'Miembros - $iglesia';
  return '$encabezado\n\n${List.generate(lista.length, (i) => '${i + 1}. ${lista[i].nombre}\n   ${lista[i].email}').join('\n\n')}';
}

class ExportarMiembrosButton extends StatelessWidget {
  final UsuarioModel usuario;
  final Iterable<Map<String, dynamic>> miembros;
  final String? nombreIglesia;

  const ExportarMiembrosButton({
    super.key,
    required this.usuario,
    required this.miembros,
    this.nombreIglesia,
  });

  @override
  Widget build(BuildContext context) {
    if (!puedeExportarMiembros(usuario)) return const SizedBox.shrink();
    return OutlinedButton.icon(
      icon: const Icon(Icons.ios_share),
      label: const Text('Exportar miembros'),
      onPressed: () {
        final texto = generarListaMiembros(
          usuario: usuario,
          miembros: miembros,
          nombreIglesia: nombreIglesia,
        );
        final messenger = ScaffoldMessenger.of(context);
        if (texto.isEmpty) {
          messenger.showSnackBar(
            const SnackBar(content: Text('No hay miembros para exportar.')),
          );
          return;
        }
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Exportar miembros'),
            content: const Text(
              'La lista incluye únicamente nombre y correo electrónico.',
            ),
            actions: [
              TextButton.icon(
                icon: const Icon(Icons.copy),
                label: const Text('Copiar lista'),
                onPressed: () async {
                  Navigator.of(ctx).pop();
                  try {
                    await Clipboard.setData(ClipboardData(text: texto));
                    if (messenger.mounted) {
                      messenger.showSnackBar(
                        const SnackBar(
                          content: Text('Lista de miembros copiada'),
                        ),
                      );
                    }
                  } catch (_) {
                    if (messenger.mounted) {
                      messenger.showSnackBar(
                        const SnackBar(
                          content: Text('No fue posible copiar la lista.'),
                        ),
                      );
                    }
                  }
                },
              ),
              Builder(
                builder: (shareContext) => TextButton.icon(
                  icon: const Icon(Icons.ios_share),
                  label: const Text('Compartir lista'),
                  onPressed: () async {
                    final box = shareContext.findRenderObject() as RenderBox?;
                    final origen = box == null
                        ? null
                        : box.localToGlobal(Offset.zero) & box.size;
                    try {
                      // Invoke directly from the tap to preserve Web Share activation.
                      final compartir = SharePlus.instance.share(
                        ShareParams(
                          text: texto,
                          title: 'Miembros de la iglesia',
                          sharePositionOrigin: origen,
                          downloadFallbackEnabled: false,
                          mailToFallbackEnabled: false,
                        ),
                      );
                      Navigator.of(ctx).pop();
                      await compartir;
                    } catch (_) {
                      if (messenger.mounted) {
                        messenger.showSnackBar(
                          const SnackBar(
                            content: Text(
                              'No fue posible compartir. Usa «Copiar lista».',
                            ),
                          ),
                        );
                      }
                    }
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
