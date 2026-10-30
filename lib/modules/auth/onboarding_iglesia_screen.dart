import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';
import '../../core/services/ingreso_pendiente_service.dart';
import '../../core/widgets/safe_avatar.dart';

class OnboardingIglesiaScreen extends StatefulWidget {
  final User user;
  final VoidCallback onCompletado;
  final AuthService? authService;

  const OnboardingIglesiaScreen({
    super.key,
    required this.user,
    required this.onCompletado,
    this.authService,
  });

  @override
  State<OnboardingIglesiaScreen> createState() =>
      _OnboardingIglesiaScreenState();
}

class _OnboardingIglesiaScreenState extends State<OnboardingIglesiaScreen> {
  late final AuthService _authService;

  @override
  void initState() {
    super.initState();
    _authService = widget.authService ?? AuthService();
    _creandoIglesia =
        _authService.ingreso.solicitud?.tipo ==
        TipoIngresoPendiente.creacionIglesia;
    _authService.ingreso.addListener(_cambioIngreso);
  }

  void _cambioIngreso() {
    if (mounted) {
      setState(() {});
    }
  }

  final TextEditingController _codigoCtrl = TextEditingController();

  final TextEditingController _iglesiaCtrl = TextEditingController();

  final TextEditingController _descUsuarioCtrl = TextEditingController();

  final TextEditingController _descIglesiaCtrl = TextEditingController();

  bool _creandoIglesia = false;
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _authService.ingreso.removeListener(_cambioIngreso);
    _codigoCtrl.dispose();
    _iglesiaCtrl.dispose();
    _descUsuarioCtrl.dispose();
    _descIglesiaCtrl.dispose();

    super.dispose();
  }

  Future<void> _completar() async {
    if (_cargando || _authService.ingreso.ocupado) {
      return;
    }
    final anterior = _authService.ingreso.solicitud;
    final nueva = anterior == null || !anterior.estado.sinResolver;
    if (nueva &&
        !await _confirmar(
          'Iniciar una nueva solicitud con los datos ingresados?',
        )) {
      return;
    }
    if (!mounted) {
      return;
    }
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

        final resultado = await _authService.registrarNuevaIglesiaPersistente(
          uid: widget.user.uid,
          email: widget.user.email ?? '',
          nombreAdmin: widget.user.displayName ?? 'Pastor / Administrador',
          nombreIglesia: _iglesiaCtrl.text.trim(),
          codigoDeseado: _codigoCtrl.text.trim(),
          descripcionIglesia: _descIglesiaCtrl.text.trim(),
          fotoUrlAdmin: widget.user.photoURL,
          descripcionAdmin: _descUsuarioCtrl.text.trim(),
          confirmarNuevaIntencion: nueva,
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
        if (_codigoCtrl.text.trim().isEmpty) {
          throw Exception('Ingresa el código.');
        }

        final resultado = await _authService.vincularConCodigoPersistente(
          uid: widget.user.uid,
          email: widget.user.email ?? '',
          nombre: widget.user.displayName ?? 'Servidor',
          codigo: _codigoCtrl.text.trim(),
          fotoUrl: widget.user.photoURL,
          descripcionUsuario: _descUsuarioCtrl.text.trim(),
          confirmarNuevaIntencion: nueva,
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

      widget.onCompletado();
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = 'No se pudo completar la solicitud. Recupera su estado antes de continuar.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _cargando = false;
        });
      }
    }
  }

  Future<bool> _confirmar(String mensaje) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmar intención'),
          content: Text(mensaje),
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
      ) ==
      true;

  Future<void> _recuperar() async {
    if (_cargando || _authService.ingreso.ocupado) {
      return;
    }
    final resultado = await _authService.ingreso.reconciliar();
    if (!mounted || _authService.currentUser?.uid != widget.user.uid) {
      return;
    }
    setState(() {
      _error = resultado.confirmado ? null : resultado.mensaje;
    });
    if (resultado.confirmado) widget.onCompletado();
  }

  Future<void> _abandonar() async {
    final anterior = _authService.ingreso.solicitud;
    if (anterior == null || _cargando || _authService.ingreso.ocupado) {
      return;
    }
    if (!await _confirmar(
      'Abandonar esta intención resuelta o no enviada? No se iniciará otra automáticamente.',
    )) {
      return;
    }
    final resultado = await _authService.ingreso.abandonarPendiente(
      confirmadoPorUsuario: true,
    );
    if (mounted) {
      setState(() {
        _error = resultado.mensaje;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final fondoTarjeta = theme.colorScheme.surface;

    final borde = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    final textoPrincipal = theme.colorScheme.onSurface;

    final textoSecundario = theme.colorScheme.onSurfaceVariant;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: fondoTarjeta,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borde),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SafeAvatar(
                  imageUrl: widget.user.photoURL,
                  nombre: widget.user.displayName ?? 'Usuario',
                  radius: 36,
                ),

                const SizedBox(height: 12),

                Text(
                  '¡Hola, '
                  '${widget.user.displayName ?? "bienvenido"}!',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: textoPrincipal,
                  ),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 8),

                Text(
                  _creandoIglesia
                      ? 'Configura tu congregación'
                      : 'Ingresa a tu iglesia',
                  style: TextStyle(color: textoSecundario, fontSize: 13),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 24),

                if (_error != null ||
                    _authService.ingreso.resultado != null) ...[
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
                      _error ?? _authService.ingreso.resultado!.mensaje,
                      style: const TextStyle(
                        color: Colors.redAccent,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                if (_authService.ingreso.resultado != null ||
                    _authService.ingreso.solicitud != null)
                  TextButton(
                    onPressed: _cargando || _authService.ingreso.ocupado
                        ? null
                        : _recuperar,
                    child: const Text('Recuperar estado de la solicitud'),
                  ),
                if ([
                  EstadoIngresoPendiente.pendiente,
                  EstadoIngresoPendiente.rechazada,
                ].contains(_authService.ingreso.solicitud?.estado))
                  TextButton(
                    onPressed: _cargando || _authService.ingreso.ocupado
                        ? null
                        : _abandonar,
                    child: const Text('Abandonar esta intención'),
                  ),

                TextField(
                  enabled: !_cargando && !_authService.ingreso.ocupado,
                  controller: _descUsuarioCtrl,
                  decoration: const InputDecoration(
                    labelText:
                        'Descripción sobre ti '
                        '(ej: Líder de jóvenes)',
                    prefixIcon: Icon(Icons.person),
                  ),
                ),

                const SizedBox(height: 12),

                if (_creandoIglesia) ...[
                  TextField(
                    enabled: !_cargando && !_authService.ingreso.ocupado,
                    controller: _iglesiaCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre de la Iglesia',
                      prefixIcon: Icon(Icons.business),
                    ),
                  ),

                  const SizedBox(height: 12),

                  TextField(
                    enabled: !_cargando && !_authService.ingreso.ocupado,
                    controller: _descIglesiaCtrl,
                    decoration: const InputDecoration(
                      labelText:
                          'Visión o Descripción '
                          'de la Iglesia',
                      prefixIcon: Icon(Icons.menu_book),
                    ),
                  ),

                  const SizedBox(height: 12),
                ],

                TextField(
                  enabled: !_cargando && !_authService.ingreso.ocupado,
                  controller: _codigoCtrl,
                  textCapitalization: TextCapitalization.characters,
                  decoration: InputDecoration(
                    labelText: _creandoIglesia
                        ? 'Crea un código '
                              '(ej: JESED-1)'
                        : 'Código de tu '
                              'congregación',
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
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    onPressed: _cargando || _authService.ingreso.ocupado
                        ? null
                        : _completar,
                    child: _cargando
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(
                            _authService
                                        .ingreso
                                        .solicitud
                                        ?.estado
                                        .sinResolver ==
                                    true
                                ? 'Reintentar la misma solicitud'
                                : _creandoIglesia
                                ? 'Crear Congregación'
                                : 'Vincular y Continuar',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 12),

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
                        ? '¿Prefieres unirte '
                              'a una existente?'
                        : '¿Eres pastor? '
                              'Registra una nueva',
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
