import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';

class OnboardingIglesiaScreen extends StatefulWidget {
  final User user;
  final VoidCallback onCompletado;

  const OnboardingIglesiaScreen({
    super.key,
    required this.user,
    required this.onCompletado,
  });

  @override
  State<OnboardingIglesiaScreen> createState() =>
      _OnboardingIglesiaScreenState();
}

class _OnboardingIglesiaScreenState extends State<OnboardingIglesiaScreen> {
  final AuthService _authService = AuthService();

  final TextEditingController _codigoCtrl = TextEditingController();
  final TextEditingController _iglesiaCtrl = TextEditingController();
  final TextEditingController _descUsuarioCtrl = TextEditingController();
  final TextEditingController _descIglesiaCtrl = TextEditingController();

  bool _creandoIglesia = false;
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _codigoCtrl.dispose();
    _iglesiaCtrl.dispose();
    _descUsuarioCtrl.dispose();
    _descIglesiaCtrl.dispose();
    super.dispose();
  }

  Future<void> _completar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });

    try {
      if (_creandoIglesia) {
        if (_iglesiaCtrl.text.trim().isEmpty ||
            _codigoCtrl.text.trim().isEmpty) {
          throw Exception('Completa los campos principales.');
        }

        final err = await _authService.registrarNuevaIglesia(
          uid: widget.user.uid,
          email: widget.user.email ?? '',
          nombreAdmin: widget.user.displayName ?? 'Pastor / Administrador',
          nombreIglesia: _iglesiaCtrl.text.trim(),
          codigoDeseado: _codigoCtrl.text.trim(),
          descripcionIglesia: _descIglesiaCtrl.text.trim(),
          fotoUrlAdmin: widget.user.photoURL,
          descripcionAdmin: _descUsuarioCtrl.text.trim(),
        );

        if (err != null) {
          throw Exception(err);
        }
      } else {
        if (_codigoCtrl.text.trim().isEmpty) {
          throw Exception('Ingresa el código.');
        }

        final err = await _authService.vincularConCodigo(
          uid: widget.user.uid,
          email: widget.user.email ?? '',
          nombre: widget.user.displayName ?? 'Servidor',
          codigo: _codigoCtrl.text.trim(),
          fotoUrl: widget.user.photoURL,
          descripcionUsuario: _descUsuarioCtrl.text.trim(),
        );

        if (err != null) {
          throw Exception(err);
        }
      }

      if (!mounted) {
        return;
      }

      widget.onCompletado();
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _cargando = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1D24),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.user.photoURL != null)
                  CircleAvatar(
                    radius: 36,
                    backgroundImage: NetworkImage(widget.user.photoURL!),
                  )
                else
                  const Icon(Icons.church, size: 48, color: Color(0xFF3B82F6)),

                const SizedBox(height: 12),

                Text(
                  '¡Hola, ${widget.user.displayName ?? "bienvenido"}!',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 8),

                Text(
                  _creandoIglesia
                      ? 'Configura tu congregación'
                      : 'Ingresa a tu iglesia',
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 13,
                  ),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 24),

                if (_error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.redAccent.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Colors.redAccent,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                TextField(
                  controller: _descUsuarioCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Descripción sobre ti (ej: Líder de jóvenes)',
                    prefixIcon: Icon(Icons.person),
                  ),
                ),

                const SizedBox(height: 12),

                if (_creandoIglesia) ...[
                  TextField(
                    controller: _iglesiaCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre de la Iglesia',
                      prefixIcon: Icon(Icons.business),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _descIglesiaCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Visión o Descripción de la Iglesia',
                      prefixIcon: Icon(Icons.menu_book),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                TextField(
                  controller: _codigoCtrl,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    labelText: _creandoIglesia
                        ? 'Crea un código (ej: JESED-1)'
                        : 'Código de tu congregación',
                    prefixIcon: const Icon(Icons.vpn_key),
                  ),
                ),

                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: _cargando ? null : _completar,
                    child: _cargando
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(
                            _creandoIglesia
                                ? 'Crear Congregación'
                                : 'Vincular y Continuar',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 12),

                TextButton(
                  onPressed: _cargando
                      ? null
                      : () {
                          setState(() {
                            _creandoIglesia = !_creandoIglesia;
                            _error = null;
                          });
                        },
                  child: Text(
                    _creandoIglesia
                        ? '¿Prefieres unirte a una existente?'
                        : '¿Eres pastor? Registra una nueva',
                    style: const TextStyle(
                      color: Color(0xFF60A5FA),
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
