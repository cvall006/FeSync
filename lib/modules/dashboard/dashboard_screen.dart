import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../adora_live/adora_live_screen.dart';
import '../agenda/agenda_screen.dart';
import '../capacitaciones/capacitaciones_screen.dart';
import '../comunidad/comunidad_screen.dart';
import '../configuracion/configuracion_modulos_screen.dart';
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

  bool _moduloActivo(Map<String, dynamic> modulos, String clave) {
    final valor = modulos[clave];

    if (valor is bool) {
      return valor;
    }

    // Compatibilidad con iglesias creadas antes
    // de que existiera esta clave.
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final iglesiaRef = FirebaseFirestore.instance
        .collection('iglesias')
        .doc(usuario.iglesiaId);

    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: StreamBuilder<DocumentSnapshot>(
          stream: iglesiaRef.snapshots(),
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
          if (usuario.rolGlobal == 'admin_iglesia')
            IconButton(
              tooltip: 'Configurar módulos',
              icon: const Icon(Icons.settings, color: Color(0xFF94A3B8)),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        ConfiguracionModulosScreen(usuario: usuario),
                  ),
                );
              },
            ),
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
      body: StreamBuilder<DocumentSnapshot>(
        stream: iglesiaRef.snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No fue posible cargar los módulos.\n'
                  '${snapshot.error}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.redAccent),
                ),
              ),
            );
          }

          if (!snapshot.hasData || !snapshot.data!.exists) {
            return const Center(
              child: Text(
                'No se encontró la configuración de la iglesia.',
                style: TextStyle(color: Color(0xFF94A3B8)),
              ),
            );
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;

          final rawModulos = data['modulosActivos'];

          final modulos = rawModulos is Map<String, dynamic>
              ? rawModulos
              : <String, dynamic>{};

          final tarjetas = <Widget>[];

          if (_moduloActivo(modulos, 'servidores')) {
            tarjetas.add(
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
            );
          }

          if (_moduloActivo(modulos, 'agenda')) {
            tarjetas.add(
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
            );
          }

          if (_moduloActivo(modulos, 'capacitaciones')) {
            tarjetas.add(
              _ModuloCard(
                titulo: 'Capacitaciones',
                subtitulo: 'Videos, lecturas y formación',
                icono: Icons.school,
                color: const Color(0xFF06B6D4),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CapacitacionesScreen(usuario: usuario),
                    ),
                  );
                },
              ),
            );
          }

          if (_moduloActivo(modulos, 'escuela')) {
            tarjetas.add(
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
            );
          }

          if (_moduloActivo(modulos, 'comunidades')) {
            tarjetas.add(
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
            );
          }

          if (_moduloActivo(modulos, 'adoraLive')) {
            tarjetas.add(
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
            );
          }

          return Padding(
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
                  child: tarjetas.isEmpty
                      ? const Center(
                          child: Text(
                            'No hay módulos activos para esta iglesia.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 16,
                            ),
                          ),
                        )
                      : GridView.count(
                          crossAxisCount:
                              MediaQuery.of(context).size.width > 600 ? 3 : 2,
                          crossAxisSpacing: 16,
                          mainAxisSpacing: 16,
                          children: tarjetas,
                        ),
                ),
              ],
            ),
          );
        },
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

  const _ModuloCard({
    required this.titulo,
    required this.subtitulo,
    required this.icono,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1D24),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.15),
              child: Icon(icono, color: color),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
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
