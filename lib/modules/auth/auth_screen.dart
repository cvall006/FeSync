import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  final VoidCallback onVinculado;
  final AuthService? authService;

  const AuthScreen({super.key, required this.onVinculado, this.authService});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  late final AuthService _authService = widget.authService ?? AuthService();

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
    if (_cargando || _authService.ingreso.ocupado) {
      return;
    }
    if (!_esLogin) {
      final confirmar = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmar nueva intención'),
          content: const Text(
            'Iniciar una solicitud de ingreso con estos datos? Una solicitud pendiente conservará su identidad.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmar'),
            ),
          ],
        ),
      );
      if (confirmar != true || !mounted) {
        return;
      }
    }
    setState(() {
      _cargando = true;
      _error = null;
    });

    try {
      if (_esLogin) {
        await _authService.iniciarConEmail(
          _emailCtrl.text.trim(),
          _passCtrl.text.trim(),
        );
      } else if (!_creandoIglesia) {
        final user =
            _authService.currentUser ??
            (await _authService.crearConEmail(
              _emailCtrl.text.trim(),
              _passCtrl.text.trim(),
            )).user!;

        final resultado = await _authService.vincularConCodigoPersistente(
          uid: user.uid,
          email: _emailCtrl.text.trim(),
          nombre: _nombreCtrl.text.trim(),
          codigo: _codigoCtrl.text.trim(),
          confirmarNuevaIntencion: true,
        );

        if (!resultado.confirmado) {
          if (mounted) {
            setState(() {
              _error = resultado.mensaje;
            });
          }
          return;
        }
      } else {
        final user =
            _authService.currentUser ??
            (await _authService.crearConEmail(
              _emailCtrl.text.trim(),
              _passCtrl.text.trim(),
            )).user!;

        final resultado = await _authService.registrarNuevaIglesiaPersistente(
          uid: user.uid,
          email: _emailCtrl.text.trim(),
          nombreAdmin: _nombreCtrl.text.trim(),
          nombreIglesia: _iglesiaCtrl.text.trim(),
          codigoDeseado: _codigoCtrl.text.trim(),
          descripcionIglesia: '',
          confirmarNuevaIntencion: true,
        );

        if (!resultado.confirmado) {
          if (mounted) {
            setState(() {
              _error = resultado.mensaje;
            });
          }
          return;
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
        _error = 'No se pudo completar el acceso. Revisa la sesión o recupera la solicitud.';
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
        _error = 'No se pudo iniciar sesión con Google.';
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
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final surface = theme.colorScheme.surface;

    final secondary = theme.colorScheme.onSurfaceVariant;

    final border = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.asset(
                  'assets/logo/Logo1.png',
                  width: 180,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 12),

                Text(
                  _esLogin
                      ? 'Inicia sesión para continuar'
                      : (_creandoIglesia
                            ? 'Registra tu congregación'
                            : 'Únete a tu iglesia'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: secondary, fontSize: 14),
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

                if (!_esLogin) ...[
                  TextField(
                    enabled: !_cargando && !_authService.ingreso.ocupado,
                    controller: _nombreCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Tu Nombre y Apellido',
                      prefixIcon: Icon(Icons.person),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                if (!_esLogin && _creandoIglesia) ...[
                  TextField(
                    enabled: !_cargando && !_authService.ingreso.ocupado,
                    controller: _iglesiaCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Nombre de la Iglesia',
                      prefixIcon: Icon(Icons.church),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                TextField(
                  enabled: !_cargando && !_authService.ingreso.ocupado,
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
                  enabled: !_cargando && !_authService.ingreso.ocupado,
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
                    enabled: !_cargando && !_authService.ingreso.ocupado,
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
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
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

                Row(
                  children: [
                    Expanded(child: Divider(color: border)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text(
                        'o continúa con',
                        style: TextStyle(color: secondary, fontSize: 12),
                      ),
                    ),
                    Expanded(child: Divider(color: border)),
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
                  onPressed:
                      _cargando ||
                          const bool.fromEnvironment('FESYNC_FINANZAS_DEMO')
                      ? null
                      : _iniciarConGoogle,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Image.asset('assets/google.png', height: 20),
                      const SizedBox(width: 12),
                      const Flexible(
                        child: Text(
                          'Continuar con Google',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            fontFamily: 'Roboto',
                            color: Colors.black87,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                TextButton(
                  onPressed: _cargando || _authService.ingreso.ocupado
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
                    style: const TextStyle(color: Color(0xFF3B82F6)),
                  ),
                ),

                if (!_esLogin)
                  TextButton(
                    onPressed: _cargando || _authService.ingreso.ocupado
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
                      textAlign: TextAlign.center,
                      style: TextStyle(color: secondary, fontSize: 12),
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
