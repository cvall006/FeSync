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
import 'modules/auth/auth_screen.dart';
import 'modules/auth/onboarding_iglesia_screen.dart';
import 'modules/comunidad/comunidad_screen.dart';
import 'modules/dashboard/dashboard_screen.dart';

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

  bool _cargando = true;

  @override
  void initState() {
    super.initState();

    NotificationService.instance.setTapHandler(_manejarTapNotificacion);

    _revisarSesion();
  }

  Future<bool> _manejarTapNotificacion(Map<String, dynamic> data) async {
    final perfil = _perfil;

    if (perfil == null) {
      return false;
    }

    final tipo = data['tipo']?.toString();

    if (tipo != 'muro_comunidad') {
      return true;
    }

    final navigator = navigatorKey.currentState;

    if (navigator == null) {
      return false;
    }

    await navigator.push(
      MaterialPageRoute(builder: (_) => ComunidadScreen(usuario: perfil)),
    );

    return true;
  }

  Future<void> _revisarSesion() async {
    if (mounted) {
      setState(() {
        _cargando = true;
      });
    }

    final user = _authService.currentUser;

    if (user != null) {
      final perfil = await _authService.obtenerPerfilUsuario(user.uid);

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
          debugPrint('No se pudo leer preferencia de tema: $error');
        }
      }

      if (mounted) {
        setState(() {
          _perfil = perfil;
        });
      }

      if (perfil != null) {
        await NotificationService.instance.configurarUsuario(user.uid);

        await NotificationService.instance.reanudarTapPendiente();
      }
    } else {
      if (mounted) {
        setState(() {
          _perfil = null;
        });
      }
    }

    if (mounted) {
      setState(() {
        _cargando = false;
      });
    }
  }

  Future<void> _cerrarSesion() async {
    await NotificationService.instance.desvincularUsuario();

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
