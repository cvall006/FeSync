import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../../core/widgets/safe_avatar.dart';
import '../adora_live/adora_live_screen.dart';
import '../agenda/agenda_screen.dart';
import '../capacitaciones/capacitaciones_screen.dart';
import '../comunidad/comunidad_screen.dart';
import '../configuracion/configuracion_modulos_screen.dart';
import '../escuela/escuela_screen.dart';
import '../miembros/gestion_miembros_screen.dart';
import '../perfil/perfil_screen.dart';
import '../servidores/servidores_screen.dart';

class DashboardScreen extends StatelessWidget {
  final UsuarioModel usuario;

  final Future<void> Function() onCerrarSesion;
  final Future<void> Function() onPerfilActualizado;
  final Future<void> Function() onSalirCongregacion;

  const DashboardScreen({
    super.key,
    required this.usuario,
    required this.onCerrarSesion,
    required this.onPerfilActualizado,
    required this.onSalirCongregacion,
  });

  bool _moduloActivo(Map<String, dynamic> modulos, String clave) {
    final valor = modulos[clave];

    if (valor is bool) {
      return valor;
    }

    return true;
  }

  int _contadorPendiente(Map<String, dynamic> pendientes, String clave) {
    final valor = pendientes[clave];

    if (valor is num) {
      return valor.toInt();
    }

    return int.tryParse(valor?.toString() ?? '') ?? 0;
  }

  Future<void> _abrirPerfil(BuildContext context) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PerfilScreen(
          usuario: usuario,
          onCerrarSesion: onCerrarSesion,
          onPerfilActualizado: onPerfilActualizado,
          onSalirCongregacion: onSalirCongregacion,
        ),
      ),
    );

    await onPerfilActualizado();
  }

  Future<void> _abrirModulo(
    BuildContext context, {
    required String claveContador,
    required WidgetBuilder builder,
  }) async {
    final usuarioRef = FirebaseFirestore.instance
        .collection('usuarios_globales')
        .doc(usuario.uid);

    try {
      await usuarioRef.update({'notificacionesPendientes.$claveContador': 0});
    } catch (error) {
      debugPrint(
        'No se pudo limpiar contador '
        '$claveContador: $error',
      );
    }

    if (!context.mounted) {
      return;
    }

    await Navigator.push(context, MaterialPageRoute(builder: builder));
  }

  @override
  Widget build(BuildContext context) {
    final iglesiaRef = FirebaseFirestore.instance
        .collection('iglesias')
        .doc(usuario.iglesiaId);

    final usuarioRef = FirebaseFirestore.instance
        .collection('usuarios_globales')
        .doc(usuario.uid);

    return Scaffold(
      appBar: AppBar(
        title: StreamBuilder<DocumentSnapshot>(
          stream: iglesiaRef.snapshots(),
          builder: (context, snapshot) {
            String nombreIglesia = 'Mi Iglesia';

            if (snapshot.hasData && snapshot.data!.exists) {
              final data = snapshot.data!.data() as Map<String, dynamic>?;

              nombreIglesia = data?['nombre']?.toString() ?? 'Mi Iglesia';
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nombreIglesia,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Hola, ${usuario.nombre}',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            );
          },
        ),
        actions: [
          if (usuario.rolGlobal == 'admin_iglesia')
            IconButton(
              tooltip: 'Gestión de miembros',
              icon: const Icon(Icons.group),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => GestionMiembrosScreen(usuario: usuario),
                  ),
                );
              },
            ),
          if (usuario.rolGlobal == 'admin_iglesia')
            IconButton(
              tooltip: 'Configurar módulos',
              icon: const Icon(Icons.settings),
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
            child: InkWell(
              borderRadius: BorderRadius.circular(30),
              onTap: () {
                _abrirPerfil(context);
              },
              child: SafeAvatar(
                imageUrl: usuario.fotoUrl,
                nombre: usuario.nombre,
                radius: 19,
              ),
            ),
          ),
        ],
      ),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: usuarioRef.snapshots(),
        builder: (context, usuarioSnapshot) {
          final usuarioData = usuarioSnapshot.data?.data();

          final rawPendientes = usuarioData?['notificacionesPendientes'];

          final pendientes = rawPendientes is Map
              ? Map<String, dynamic>.from(rawPendientes)
              : <String, dynamic>{};

          return StreamBuilder<DocumentSnapshot>(
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
                      'No fue posible cargar la iglesia.\n'
                      '${snapshot.error}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.redAccent),
                    ),
                  ),
                );
              }

              if (!snapshot.hasData || !snapshot.data!.exists) {
                return const Center(child: Text('No se encontró la iglesia.'));
              }

              final data = snapshot.data!.data() as Map<String, dynamic>;

              final raw = data['modulosActivos'];

              final modulos = raw is Map<String, dynamic>
                  ? raw
                  : <String, dynamic>{};

              final tarjetas = <Widget>[];

              if (_moduloActivo(modulos, 'servidores')) {
                tarjetas.add(
                  _ModuloCard(
                    titulo: 'Servidores & Protocolo',
                    subtitulo: 'Turnos, ujieres y aseo',
                    icono: Icons.handshake,
                    color: const Color(0xFF3B82F6),
                    notificaciones: _contadorPendiente(
                      pendientes,
                      'servidores',
                    ),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'servidores',
                        builder: (_) => ServidoresScreen(usuario: usuario),
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
                    notificaciones: _contadorPendiente(pendientes, 'agenda'),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'agenda',
                        builder: (_) => AgendaScreen(usuario: usuario),
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
                    notificaciones: _contadorPendiente(
                      pendientes,
                      'capacitaciones',
                    ),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'capacitaciones',
                        builder: (_) => CapacitacionesScreen(usuario: usuario),
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
                    notificaciones: _contadorPendiente(pendientes, 'escuela'),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'escuela',
                        builder: (_) => EscuelaScreen(usuario: usuario),
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
                    notificaciones: _contadorPendiente(
                      pendientes,
                      'comunidades',
                    ),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'comunidades',
                        builder: (_) => ComunidadScreen(usuario: usuario),
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
                    notificaciones: _contadorPendiente(pendientes, 'adoraLive'),
                    onTap: () {
                      _abrirModulo(
                        context,
                        claveContador: 'adoraLive',
                        builder: (_) => AdoraLiveScreen(usuario: usuario),
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
                    Text(
                      'Módulos Congregacionales',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Selecciona un área de servicio o consulta',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 20),
                    Expanded(
                      child: tarjetas.isEmpty
                          ? const Center(child: Text('No hay módulos activos.'))
                          : GridView.count(
                              crossAxisCount:
                                  MediaQuery.of(context).size.width > 600
                                  ? 3
                                  : 2,
                              crossAxisSpacing: 16,
                              mainAxisSpacing: 16,
                              children: tarjetas,
                            ),
                    ),
                  ],
                ),
              );
            },
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
  final int notificaciones;
  final VoidCallback onTap;

  const _ModuloCard({
    required this.titulo,
    required this.subtitulo,
    required this.icono,
    required this.color,
    required this.notificaciones,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final fondo = theme.colorScheme.surface;

    final borde = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    final tituloColor = theme.colorScheme.onSurface;

    final subtituloColor = theme.colorScheme.onSurfaceVariant;

    final textoContador = notificaciones > 99 ? '99+' : '$notificaciones';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: fondo,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: borde),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  CircleAvatar(
                    backgroundColor: color.withValues(alpha: 0.15),
                    child: Icon(icono, color: color),
                  ),
                  if (notificaciones > 0)
                    Positioned(
                      top: -7,
                      right: -12,
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 22,
                          minHeight: 22,
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.redAccent,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: fondo, width: 2),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          textoContador,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
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
                      color: tituloColor,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitulo,
                    style: TextStyle(fontSize: 11, color: subtituloColor),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
