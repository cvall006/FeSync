import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/models/app_models.dart';
import 'core/providers/theme_provider.dart';
import 'core/services/auth_service.dart';
import 'core/services/notification_service.dart';
import 'firebase_options.dart';
import 'modules/adora_live/adora_live_screen.dart';
import 'modules/agenda/agenda_screen.dart';
import 'modules/auth/auth_screen.dart';
import 'modules/auth/onboarding_iglesia_screen.dart';
import 'modules/capacitaciones/capacitaciones_screen.dart';
import 'modules/comunidad/comunidad_screen.dart';
import 'modules/dashboard/dashboard_screen.dart';
import 'modules/escuela/escuela_screen.dart';
import 'modules/servidores/servidores_screen.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  final soportaFcmBackground =
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS);

  if (soportaFcmBackground) {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  await NotificationService.instance.initialize();

  runApp(
    ChangeNotifierProvider(
      create: (_) => ThemeProvider(),
      child: const FeSyncApp(),
    ),
  );
}

class FeSyncApp extends StatelessWidget {
  const FeSyncApp({super.key});

  ThemeData _temaOscuro() {
    return ThemeData.dark().copyWith(
      scaffoldBackgroundColor: const Color(0xFF0F1115),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF1A1D24),
        foregroundColor: Colors.white,
      ),
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF3B82F6),
        surface: Color(0xFF1A1D24),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF0F1115),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF334155)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF334155)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3B82F6)),
        ),
        labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
      ),
    );
  }

  ThemeData _temaClaro() {
    return ThemeData.light().copyWith(
      scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: Color(0xFF111827),
        elevation: 1,
      ),
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF3B82F6),
        surface: Colors.white,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3B82F6)),
        ),
        labelStyle: const TextStyle(color: Color(0xFF64748B)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();

    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'FeSync',
      debugShowCheckedModeBanner: false,
      theme: _temaClaro(),
      darkTheme: _temaOscuro(),
      themeMode: themeProvider.themeMode,
      home: const RootGate(),
    );
  }
}

class RootGate extends StatefulWidget {
  const RootGate({super.key});

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  final AuthService _authService = AuthService();

  UsuarioModel? _perfil;

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>?
  _perfilSubscription;

  String? _uidEscuchado;

  bool _cargando = true;

  bool _tapWebProcesado = false;

  @override
  void initState() {
    super.initState();

    NotificationService.instance.setTapHandler(_manejarTapNotificacion);

    _revisarSesion();
  }

  @override
  void dispose() {
    _perfilSubscription?.cancel();

    super.dispose();
  }

  Future<void> _cancelarEscuchaPerfil() async {
    await _perfilSubscription?.cancel();

    _perfilSubscription = null;
    _uidEscuchado = null;
  }

  void _escucharPerfilUsuario(String uid) {
    if (_uidEscuchado == uid && _perfilSubscription != null) {
      return;
    }

    _perfilSubscription?.cancel();

    _uidEscuchado = uid;

    _perfilSubscription = FirebaseFirestore.instance
        .collection('usuarios_globales')
        .doc(uid)
        .snapshots()
        .listen(
          (snapshot) {
            if (!mounted) {
              return;
            }

            final data = snapshot.data();

            final perfilAnterior = _perfil;

            UsuarioModel? perfilNuevo;

            if (snapshot.exists && data != null) {
              perfilNuevo = UsuarioModel.fromMap(data, snapshot.id);
            }

            final iglesiaAnterior = perfilAnterior?.iglesiaId ?? '';

            final iglesiaNueva = perfilNuevo?.iglesiaId ?? '';

            final rolAnterior = perfilAnterior?.rolGlobal ?? '';

            final rolNuevo = perfilNuevo?.rolGlobal ?? '';

            final cambioVinculacion =
                iglesiaAnterior != iglesiaNueva || rolAnterior != rolNuevo;

            if (!cambioVinculacion) {
              return;
            }

            setState(() {
              _perfil = perfilNuevo;
            });

            /*
         * Si el usuario fue desvinculado,
         * cambió de congregación o cambió
         * su rol mientras tenía un módulo
         * abierto, regresamos a la ruta
         * principal para que RootGate
         * muestre el estado correcto.
         */
            WidgetsBinding.instance.addPostFrameCallback((_) {
              final navigator = navigatorKey.currentState;

              if (navigator == null) {
                return;
              }

              navigator.popUntil((route) => route.isFirst);
            });
          },
          onError: (error) {
            debugPrint(
              'No se pudo escuchar '
              'el perfil del usuario: '
              '$error',
            );
          },
        );
  }

  String? _claveContadorDesdeTipo(String? tipo) {
    switch (tipo) {
      case 'muro_comunidad':
        return 'comunidades';

      case 'agenda':
        return 'agenda';

      case 'servidores':
        return 'servidores';

      case 'adora_live':
        return 'adoraLive';

      case 'capacitaciones':
        return 'capacitaciones';

      case 'escuela':
        return 'escuela';

      default:
        return null;
    }
  }

  Future<void> _limpiarContadorNotificacion(
    UsuarioModel perfil,
    String? tipo,
  ) async {
    final clave = _claveContadorDesdeTipo(tipo);

    if (clave == null) {
      return;
    }

    try {
      await FirebaseFirestore.instance
          .collection('usuarios_globales')
          .doc(perfil.uid)
          .update({'notificacionesPendientes.$clave': 0});
    } catch (error) {
      debugPrint(
        'No se pudo limpiar '
        'notificación pendiente '
        '$clave: $error',
      );
    }
  }

  Future<bool> _manejarTapNotificacion(Map<String, dynamic> data) async {
    final perfil = _perfil;

    if (perfil == null || perfil.iglesiaId.isEmpty) {
      return false;
    }

    final tipo = data['tipo']?.toString().trim();

    final navigator = navigatorKey.currentState;

    if (navigator == null) {
      return false;
    }

    await _limpiarContadorNotificacion(perfil, tipo);

    switch (tipo) {
      case 'muro_comunidad':
        await navigator.push(
          MaterialPageRoute(builder: (_) => ComunidadScreen(usuario: perfil)),
        );

        return true;

      case 'agenda':
        await navigator.push(
          MaterialPageRoute(builder: (_) => AgendaScreen(usuario: perfil)),
        );

        return true;

      case 'servidores':
        await navigator.push(
          MaterialPageRoute(builder: (_) => ServidoresScreen(usuario: perfil)),
        );

        return true;

      case 'adora_live':
        await navigator.push(
          MaterialPageRoute(builder: (_) => AdoraLiveScreen(usuario: perfil)),
        );

        return true;

      case 'capacitaciones':
        await navigator.push(
          MaterialPageRoute(
            builder: (_) => CapacitacionesScreen(usuario: perfil),
          ),
        );

        return true;

      case 'escuela':
        await navigator.push(
          MaterialPageRoute(builder: (_) => EscuelaScreen(usuario: perfil)),
        );

        return true;

      default:
        debugPrint(
          'Tipo de notificación '
          'no reconocido: $tipo',
        );

        return true;
    }
  }

  Future<void> _procesarNotificacionWeb() async {
    if (!kIsWeb || _tapWebProcesado) {
      return;
    }

    final uri = Uri.base;

    if (uri.queryParameters['fesyncNotification'] != '1') {
      return;
    }

    final tipo = uri.queryParameters['tipo'];

    if (tipo == null || tipo.trim().isEmpty) {
      _tapWebProcesado = true;

      return;
    }

    final data = <String, dynamic>{...uri.queryParameters};

    _tapWebProcesado = true;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _manejarTapNotificacion(data);
    });
  }

  Future<void> _revisarSesion() async {
    if (mounted) {
      setState(() {
        _cargando = true;
      });
    }

    final user = _authService.currentUser;

    if (user == null) {
      await _cancelarEscuchaPerfil();

      if (mounted) {
        setState(() {
          _perfil = null;
          _cargando = false;
        });
      }

      return;
    }

    final perfil = await _authService.obtenerPerfilUsuario(user.uid);

    _escucharPerfilUsuario(user.uid);

    if (perfil != null) {
      try {
        final doc = await FirebaseFirestore.instance
            .collection('usuarios_globales')
            .doc(user.uid)
            .get();

        final data = doc.data();

        final modoOscuro = data?['modoOscuro'];

        if (modoOscuro is bool && mounted) {
          context.read<ThemeProvider>().establecerModoOscuro(modoOscuro);
        }
      } catch (error) {
        debugPrint(
          'No se pudo leer '
          'preferencia de tema: '
          '$error',
        );
      }
    }

    if (mounted) {
      setState(() {
        _perfil = perfil;
      });
    }

    /*
     * Solo vinculamos FCM cuando el usuario
     * pertenece realmente a una iglesia.
     */
    if (perfil != null && perfil.iglesiaId.isNotEmpty) {
      await NotificationService.instance.configurarUsuario(user.uid);

      await NotificationService.instance.reanudarTapPendiente();
    }

    if (mounted) {
      setState(() {
        _cargando = false;
      });
    }

    if (_perfil != null && _perfil!.iglesiaId.isNotEmpty) {
      await _procesarNotificacionWeb();
    }
  }

  Future<void> _cerrarSesion() async {
    await NotificationService.instance.desvincularUsuario();

    await _cancelarEscuchaPerfil();

    await _authService.cerrarSesion();

    await _revisarSesion();
  }

  Future<void> _perfilActualizado() async {
    await _revisarSesion();
  }

  Future<void> _salirCongregacion() async {
    await _revisarSesion();
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF3B82F6)),
        ),
      );
    }

    final user = _authService.currentUser;

    if (user == null) {
      return AuthScreen(onVinculado: _revisarSesion);
    }

    if (_perfil == null || _perfil!.iglesiaId.isEmpty) {
      return OnboardingIglesiaScreen(user: user, onCompletado: _revisarSesion);
    }

    return DashboardScreen(
      usuario: _perfil!,
      onCerrarSesion: _cerrarSesion,
      onPerfilActualizado: _perfilActualizado,
      onSalirCongregacion: _salirCongregacion,
    );
  }
}
