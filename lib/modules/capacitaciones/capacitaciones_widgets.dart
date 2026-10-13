import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'capacitaciones_logica.dart';
import 'capacitaciones_models.dart';

class AccionesCapacitaciones extends StatelessWidget {
  final UsuarioModel usuario;
  final VoidCallback nuevaCategoria;
  final VoidCallback nuevoContenido;
  const AccionesCapacitaciones({
    super.key,
    required this.usuario,
    required this.nuevaCategoria,
    required this.nuevoContenido,
  });
  @override
  Widget build(BuildContext context) => !puedeAdministrarCapacitaciones(usuario)
      ? const SizedBox.shrink()
      : Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: nuevaCategoria,
              icon: const Icon(Icons.create_new_folder_outlined),
              label: const Text('Nueva categoría'),
            ),
            FilledButton.icon(
              onPressed: nuevoContenido,
              icon: const Icon(Icons.add),
              label: const Text('Nueva capacitación'),
            ),
          ],
        );
}

class TarjetaCapacitacion extends StatelessWidget {
  final CapacitacionModel capacitacion;
  final VoidCallback abrir;
  final VoidCallback? editar;
  final VoidCallback? eliminar;
  const TarjetaCapacitacion({
    super.key,
    required this.capacitacion,
    required this.abrir,
    this.editar,
    this.eliminar,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.all(16),
      title: Text(capacitacion.titulo),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            capacitacion.etiquetaTipo,
            style: TextStyle(color: Theme.of(context).colorScheme.primary),
          ),
          if (capacitacion.descripcion.isNotEmpty)
            Text(
              capacitacion.descripcion,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
      onTap: abrir,
      trailing: editar == null && eliminar == null
          ? const Icon(Icons.chevron_right)
          : PopupMenuButton<String>(
              onSelected: (valor) {
                if (valor == 'editar') editar?.call();
                if (valor == 'eliminar') eliminar?.call();
              },
              itemBuilder: (_) => [
                if (editar != null)
                  const PopupMenuItem(value: 'editar', child: Text('Editar')),
                if (eliminar != null)
                  const PopupMenuItem(
                    value: 'eliminar',
                    child: Text('Eliminar'),
                  ),
              ],
            ),
    ),
  );
}
