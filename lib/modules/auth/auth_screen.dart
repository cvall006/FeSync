import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  final VoidCallback onVinculado;

  const AuthScreen({super.key, required this.onVinculado});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final AuthService _authService = AuthService();

  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passCtrl = TextEditingController();
  final TextEditingController _nombreCtrl = TextEditingController();
  final TextEditingController _codigoCtrl = TextEditingController();
  final TextEditingController _iglesiaCtrl = TextEditingController();

  bool _esLogin = true;
  bool _creandoIglesia = false;
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _nombreCtrl.dispose();
    _codigoCtrl.dispose();
    _iglesiaCtrl.dispose();
    super.dispose();
  }

  Future<void> _ejecutarAccion() async {
    setState(() {
      _cargando = true;
      _error = null;
    });

    try {
      if (_esLogin) {
        await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: _emailCtrl.text.trim(),
          password: _passCtrl.text.trim(),
        );
      } else if (!_creandoIglesia) {
        final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: _emailCtrl.text.trim(),
          password: _passCtrl.text.trim(),
        );

        final err = await _authService.vincularConCodigo(
          uid: cred.user!.uid,
          email: _emailCtrl.text.trim(),
          nombre: _nombreCtrl.text.trim(),
          codigo: _codigoCtrl.text.trim(),
        );

        if (err != null) {
          throw Exception(err);
        }
      } else {
        final cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: _emailCtrl.text.trim(),
          password: _passCtrl.text.trim(),
        );

        final err = await _authService.registrarNuevaIglesia(
          uid: cred.user!.uid,
          email: _emailCtrl.text.trim(),
          nombreAdmin: _nombreCtrl.text.trim(),
          nombreIglesia: _iglesiaCtrl.text.trim(),
          codigoDeseado: _codigoCtrl.text.trim(),
          descripcionIglesia: '',
        );

        if (err != null) {
          throw Exception(err);
        }
      }

      if (!mounted) {
        return;
      }

      widget.onVinculado();
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

  Future<void> _iniciarConGoogle() async {
    setState(() {
      _cargando = true;
      _error = null;
    });

    try {
      final cred = await _authService.iniciarSesionConGoogle();

      if (!mounted) {
        return;
      }

      if (cred != null) {
        widget.onVinculado();
      }
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
                const Icon(Icons.sync, size: 54, color: Color(0xFF3B82F6)),
                const SizedBox(height: 8),
                const Text(
                  'FeSync',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  _esLogin
                      ? 'Inicia sesión para continuar'
                      : (_creandoIglesia
                            ? 'Registra tu congregación'
                            : 'Únete a tu iglesia'),
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 24),

                if (_error != null) ...[
                  Container(
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

                if (!_esLogin) ...[
                  TextField(
                    controller: _nombreCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Tu Nombre y Apellido',
                      prefixIcon: Icon(Icons.person),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                if (!_esLogin && _creandoIglesia) ...[
                  TextField(
                    controller: _iglesiaCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre de la Iglesia',
                      prefixIcon: Icon(Icons.church),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: 'Correo electrónico',
                    prefixIcon: Icon(Icons.email),
                  ),
                ),
                const SizedBox(height: 12),

                TextField(
                  controller: _passCtrl,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(
                    labelText: 'Contraseña',
                    prefixIcon: Icon(Icons.lock),
                  ),
                ),
                const SizedBox(height: 12),

                if (!_esLogin) ...[
                  TextField(
                    controller: _codigoCtrl,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      labelText: _creandoIglesia
                          ? 'Crea un código único (ej: JESED-1)'
                          : 'Código de tu iglesia',
                      prefixIcon: const Icon(Icons.vpn_key),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                const SizedBox(height: 20),

                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: _cargando ? null : _ejecutarAccion,
                    child: _cargando
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(
                            _esLogin ? 'Ingresar' : 'Registrarme',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 16),

                const Row(
                  children: [
                    Expanded(child: Divider(color: Color(0xFF334155))),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 10),
                      child: Text(
                        'o continúa con',
                        style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12,
                        ),
                      ),
                    ),
                    Expanded(child: Divider(color: Color(0xFF334155))),
                  ],
                ),

                const SizedBox(height: 16),

                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black87,
                    minimumSize: const Size(double.infinity, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    elevation: 1,
                  ),
                  onPressed: _cargando ? null : _iniciarConGoogle,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Image.asset('assets/google.png', height: 20),
                      const SizedBox(width: 12),
                      const Text(
                        'Continuar con Google',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          fontFamily: 'Roboto',
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                TextButton(
                  onPressed: _cargando
                      ? null
                      : () {
                          setState(() {
                            _esLogin = !_esLogin;
                            _error = null;
                          });
                        },
                  child: Text(
                    _esLogin
                        ? '¿No tienes cuenta? Regístrate aquí'
                        : '¿Ya tienes cuenta? Inicia sesión',
                    style: const TextStyle(color: Color(0xFF60A5FA)),
                  ),
                ),

                if (!_esLogin)
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
                          ? '¿Deseas unirte a una iglesia existente?'
                          : '¿Eres pastor? Registra una nueva iglesia',
                      style: const TextStyle(
                        color: Color(0xFF94A3B8),
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
