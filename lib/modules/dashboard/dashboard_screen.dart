import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../adora_live/adora_live_screen.dart';
import '../agenda/agenda_screen.dart';
import '../capacitaciones/capacitaciones_screen.dart';
import '../comunidad/comunidad_screen.dart';
import '../escuela/escuela_screen.dart';
import '../servidores/servidores_screen.dart';

class DashboardScreen extends StatelessWidget {
  final UsuarioModel usuario;
  final VoidCallback onCerrarSesion;

  const DashboardScreen({
    super.key,
    required this.usuario,
    required this.onCerrarSesion,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: StreamBuilder<DocumentSnapshot>(
          stream: FirebaseFirestore.instance
              .collection('iglesias')
              .doc(usuario.iglesiaId)
              .snapshots(),
          builder: (context, snapshot) {
            String tituloIglesia = 'Cargando iglesia...';

            if (snapshot.hasData && snapshot.data!.exists) {
              final data = snapshot.data!.data() as Map<String, dynamic>?;

              tituloIglesia = data?['nombre']?.toString() ?? 'Mi Iglesia';
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tituloIglesia,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'Hola, ${usuario.nombre} - '
                  '${usuario.descripcion ?? "Servidor"}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ],
            );
          },
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                color: Color(0xFF334155),
                shape: BoxShape.circle,
              ),
              clipBehavior: Clip.antiAlias,
              child: usuario.fotoUrl != null && usuario.fotoUrl!.isNotEmpty
                  ? Image.network(
                      usuario.fotoUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) {
                        return const Icon(
                          Icons.person,
                          color: Colors.white,
                          size: 20,
                        );
                      },
                    )
                  : const Icon(Icons.person, color: Colors.white, size: 20),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFF94A3B8)),
            tooltip: 'Cerrar sesión',
            onPressed: onCerrarSesion,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Módulos Congregacionales',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Selecciona un área de servicio o consulta',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: GridView.count(
                crossAxisCount: MediaQuery.of(context).size.width > 600 ? 3 : 2,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  _ModuloCard(
                    titulo: 'Servidores & Protocolo',
                    subtitulo: 'Turnos, ujieres y aseo',
                    icono: Icons.handshake,
                    color: const Color(0xFF3B82F6),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ServidoresScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                  _ModuloCard(
                    titulo: 'Agenda General',
                    subtitulo: 'Cultos y reuniones',
                    icono: Icons.calendar_month,
                    color: const Color(0xFF10B981),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AgendaScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                  _ModuloCard(
                    titulo: 'Capacitaciones',
                    subtitulo: 'Videos, lecturas y formación',
                    icono: Icons.school,
                    color: const Color(0xFF06B6D4),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              CapacitacionesScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                  _ModuloCard(
                    titulo: 'Escuela Bíblica',
                    subtitulo: 'Módulos, clases y formación',
                    icono: Icons.menu_book,
                    color: const Color(0xFFF59E0B),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => EscuelaScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                  _ModuloCard(
                    titulo: 'Comunidad',
                    subtitulo: 'Avisos y peticiones',
                    icono: Icons.groups,
                    color: const Color(0xFFEC4899),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ComunidadScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                  _ModuloCard(
                    titulo: 'Adora Live',
                    subtitulo: 'Repertorio, agenda y setlists',
                    icono: Icons.music_note,
                    color: const Color(0xFF8B5CF6),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AdoraLiveScreen(usuario: usuario),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModuloCard extends StatelessWidget {
  final String titulo;
  final String subtitulo;
  final IconData icono;
  final Color color;
  final VoidCallback onTap;
  final bool disponible;

  const _ModuloCard({
    required this.titulo,
    required this.subtitulo,
    required this.icono,
    required this.color,
    required this.onTap,
    this.disponible = true,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: disponible ? onTap : null,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1D24),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: disponible
                ? const Color(0xFF334155)
                : const Color(0xFF1F2937),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                CircleAvatar(
                  backgroundColor: color.withValues(alpha: 0.15),
                  child: Icon(icono, color: color),
                ),
                if (!disponible)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white10,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'Pronto',
                      style: TextStyle(fontSize: 10, color: Colors.grey),
                    ),
                  ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: disponible ? Colors.white : Colors.grey,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitulo,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
