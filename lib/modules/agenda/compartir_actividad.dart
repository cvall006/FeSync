import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import 'agenda_models.dart';

String generarTextoActividad(EventoAgendaModel evento) {
  const dias = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
  ];
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  final fecha = evento.fecha;
  final partes = <String>[
    if (evento.titulo.trim().isNotEmpty) '📅 ${evento.titulo.trim()}',
    '🗓 ${dias[fecha.weekday - 1]} ${fecha.day} de ${meses[fecha.month - 1]} de ${fecha.year}',
    if (evento.hora.trim().isNotEmpty) '🕒 ${evento.hora.trim()}',
    if (evento.lugar.trim().isNotEmpty) '📍 ${evento.lugar.trim()}',
  ];
  if (evento.descripcion.trim().isNotEmpty) {
    partes.add('\n📝 ${evento.descripcion.trim()}');
  }
  partes.add('\nCompartido desde FeSync');
  return partes.join('\n');
}

class CompartirActividadButton extends StatelessWidget {
  final EventoAgendaModel evento;

  const CompartirActividadButton({super.key, required this.evento});

  @override
  Widget build(BuildContext context) => TextButton.icon(
    icon: const Icon(Icons.ios_share, size: 18),
    label: const Text('Compartir'),
    onPressed: () async {
      final messenger = ScaffoldMessenger.of(context);
      final box = context.findRenderObject() as RenderBox?;
      final texto = generarTextoActividad(evento);
      try {
        await SharePlus.instance.share(
          ShareParams(
            text: texto,
            title: evento.titulo.trim().isEmpty
                ? 'Actividad de FeSync'
                : evento.titulo.trim(),
            sharePositionOrigin: box == null
                ? null
                : box.localToGlobal(Offset.zero) & box.size,
            downloadFallbackEnabled: false,
            mailToFallbackEnabled: false,
          ),
        );
      } catch (_) {
        if (!messenger.mounted) return;
        messenger.showSnackBar(
          SnackBar(
            content: const Text('No fue posible compartir la actividad.'),
            action: SnackBarAction(
              label: 'Copiar texto',
              onPressed: () {
                Clipboard.setData(ClipboardData(text: texto));
              },
            ),
          ),
        );
      }
    },
  );
}
