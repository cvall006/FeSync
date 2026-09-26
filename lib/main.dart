import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'core/services/auth_service.dart';
import 'core/models/app_models.dart';
import 'modules/auth/auth_screen.dart';
import 'modules/auth/onboarding_iglesia_screen.dart';
import 'modules/dashboard/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const FeSyncApp());
}

class FeSyncApp extends StatelessWidget {
  const FeSyncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FeSync',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F1115),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF3B82F6),
          surface: Color(0xFF1A1D24),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF0F1115),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF334155))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF3B82F6))),
          labelStyle: const TextStyle(color: Color(0xFF94A3B8)),
        ),
      ),
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
    _revisarSesion();
  }

  void _revisarSesion() async {
    setState(() => _cargando = true);
    final user = _authService.currentUser;
    if (user != null) {
      final perfil = await _authService.obtenerPerfilUsuario(user.uid);
      if (mounted) setState(() => _perfil = perfil);
    } else {
      if (mounted) setState(() => _perfil = null);
    }
    if (mounted) setState(() => _cargando = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Color(0xFF3B82F6))),
      );
    }

    final user = _authService.currentUser;

    // 1. Sin sesión iniciada: Pantalla de Login / Registro
    if (user == null) {
      return AuthScreen(onVinculado: _revisarSesion);
    }

    // 2. Sesión iniciada pero sin iglesia asignada: Onboarding
    if (_perfil == null) {
      return OnboardingIglesiaScreen(
        user: user,
        onCompletado: _revisarSesion,
      );
    }

    // 3. Usuario completo con iglesia asignada: Dashboard
    return DashboardScreen(
      usuario: _perfil!,
      onCerrarSesion: () async {
        await _authService.cerrarSesion();
        _revisarSesion();
      },
    );
  }
}