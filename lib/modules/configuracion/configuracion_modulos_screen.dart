import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';

class ConfiguracionModulosScreen extends StatelessWidget {
  final UsuarioModel usuario;

  const ConfiguracionModulosScreen({super.key, required this.usuario});

  DocumentReference<Map<String, dynamic>> get _iglesiaRef =>
      FirebaseFirestore.instance.collection('iglesias').doc(usuario.iglesiaId);

  bool _obtenerEstado(Map<String, dynamic> modulos, String clave) {
    final valor = modulos[clave];

    if (valor is bool) {
      return valor;
    }

    return true;
  }

  Future<void> _actualizarModulo(
    BuildContext context,
    String clave,
    bool activo,
  ) async {
    try {
      await _iglesiaRef.update({'modulosActivos.$clave': activo});
    } catch (error) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No fue posible actualizar el módulo: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (usuario.rolGlobal != 'admin_iglesia') {
      return const Scaffold(
        backgroundColor: Color(0xFF0F1115),
        body: Center(
          child: Text(
            'No tienes permisos para modificar los módulos.',
            style: TextStyle(color: Color(0xFF94A3B8)),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
        title: const Text('Configuración de Módulos'),
      ),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: _iglesiaRef.snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No fue posible cargar la configuración.\n'
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
                'No se encontró la iglesia.',
                style: TextStyle(color: Color(0xFF94A3B8)),
              ),
            );
          }

          final data = snapshot.data!.data() ?? {};

          final rawModulos = data['modulosActivos'];

          final modulos = rawModulos is Map<String, dynamic>
              ? rawModulos
              : <String, dynamic>{};

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Módulos Congregacionales',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Activa o desactiva los módulos que estarán disponibles '
                'para los usuarios de esta iglesia.',
                style: TextStyle(color: Color(0xFF94A3B8), height: 1.4),
              ),
              const SizedBox(height: 24),

              _ModuloSwitch(
                titulo: 'Servidores & Protocolo',
                descripcion: 'Turnos, asignaciones y equipos de servicio',
                icono: Icons.handshake,
                color: const Color(0xFF3B82F6),
                activo: _obtenerEstado(modulos, 'servidores'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'servidores', valor);
                },
              ),

              _ModuloSwitch(
                titulo: 'Agenda General',
                descripcion: 'Cultos, reuniones y actividades congregacionales',
                icono: Icons.calendar_month,
                color: const Color(0xFF10B981),
                activo: _obtenerEstado(modulos, 'agenda'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'agenda', valor);
                },
              ),

              _ModuloSwitch(
                titulo: 'Capacitaciones',
                descripcion: 'Videos, lecturas y material de formación',
                icono: Icons.school,
                color: const Color(0xFF06B6D4),
                activo: _obtenerEstado(modulos, 'capacitaciones'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'capacitaciones', valor);
                },
              ),

              _ModuloSwitch(
                titulo: 'Escuela Bíblica',
                descripcion: 'Módulos, clases, asistencia y calificaciones',
                icono: Icons.menu_book,
                color: const Color(0xFFF59E0B),
                activo: _obtenerEstado(modulos, 'escuela'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'escuela', valor);
                },
              ),

              _ModuloSwitch(
                titulo: 'Comunidad',
                descripcion: 'Avisos y peticiones de la iglesia',
                icono: Icons.groups,
                color: const Color(0xFFEC4899),
                activo: _obtenerEstado(modulos, 'comunidades'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'comunidades', valor);
                },
              ),

              _ModuloSwitch(
                titulo: 'Adora Live',
                descripcion:
                    'Repertorio, agenda, setlists y equipo de alabanza',
                icono: Icons.music_note,
                color: const Color(0xFF8B5CF6),
                activo: _obtenerEstado(modulos, 'adoraLive'),
                onChanged: (valor) {
                  _actualizarModulo(context, 'adoraLive', valor);
                },
              ),

              const SizedBox(height: 20),

              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1D24),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, color: Color(0xFF60A5FA)),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Los cambios se aplican automáticamente. '
                        'Desactivar un módulo no elimina sus datos; '
                        'solo deja de mostrarlo en el Dashboard.',
                        style: TextStyle(color: Color(0xFFCBD5E1), height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ModuloSwitch extends StatelessWidget {
  final String titulo;
  final String descripcion;
  final IconData icono;
  final Color color;
  final bool activo;
  final ValueChanged<bool> onChanged;

  const _ModuloSwitch({
    required this.titulo,
    required this.descripcion,
    required this.icono,
    required this.color,
    required this.activo,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1D24),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: activo
              ? color.withValues(alpha: 0.45)
              : const Color(0xFF334155),
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: color.withValues(alpha: 0.15),
            child: Icon(icono, color: activo ? color : Colors.grey),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(
                    color: activo ? Colors.white : Colors.grey,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  descripcion,
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: activo,
            onChanged: onChanged,
            activeTrackColor: color.withValues(alpha: 0.55),
            activeThumbColor: color,
          ),
        ],
      ),
    );
  }
}
