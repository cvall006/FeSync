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
import 'core/services/coordinador_desvinculacion.dart';
import 'core/services/desvinculacion_pendiente_service.dart';
import 'core/services/desvinculacion_service.dart';
import 'core/services/firebase_emulator_bootstrap.dart';
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
import 'modules/miembros/gestion_miembros_screen.dart';
import 'modules/servidores/servidores_screen.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  validarSeleccionFirebase();

  // Desarrollo en cualquier plataforma: nunca seleccionar Firebase real.
  if (kDebugMode && !finanzasEmuladores) {
    throw StateError('Debug requiere FESYNC_FINANZAS_DEMO=true.');
  }
  if (finanzasEmuladores) {
    await inicializarFirebaseEmuladores();
  } else {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  }

  final soportaFcmBackground =
      !finanzasEmuladores &&
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS);

  if (soportaFcmBackground) {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  if (!finanzasEmuladores) {
    await NotificationService.instance.initialize();
  }

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
      home: const RootGate(habilitarNotificaciones: !finanzasEmuladores),
    );
  }
}

class RootGate extends StatefulWidget {
  const RootGate({
    super.key,
    this.authService,
    this.observarPerfil,
    this.dashboardBuilder,
    this.habilitarNotificaciones = true,
    this.persistenciaSalida,
    this.remotoSalida,
    this.dashboardConSalidaBuilder,
  });
  final AuthService? authService;
  final Stream<Map<String, dynamic>?> Function(String uid)? observarPerfil;
  final Widget Function(BuildContext context, UsuarioModel perfil)?
  dashboardBuilder;
  final bool habilitarNotificaciones;
  final DesvinculacionPendienteService? persistenciaSalida;
  final DesvinculacionService? remotoSalida;
  final Widget Function(BuildContext, UsuarioModel, Future<void> Function())?
  dashboardConSalidaBuilder;

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  late final AuthService _authService;
  late final DesvinculacionPendienteService _persistenciaSalida;
  late final CoordinadorDesvinculacion _salida;
  final _sesionesSalida = StreamController<String?>.broadcast(sync: true);
  SolicitudDesvinculacionPendiente? _solicitudSalida;
  ContextoDesvinculacion? _contextoSalida;
  String? _iglesiaSalidaLegacy;
  bool _salidaOcupada = false;
  bool _salidaBloqueada = false;
  bool _salidaVerificada = false;
  bool _sinSolicitudComprobada = false;
  String _mensajeSalida = 'Es necesario verificar el resultado de la salida.';
  bool get _bloqueaSalida =>
      _salidaBloqueada ||
      _salidaOcupada ||
      (_solicitudSalida != null && !_salidaVerificada);
  StreamSubscription<dynamic>? _authSubscription;
  int _revisionSesion = 0;

  UsuarioModel? _perfil;

  StreamSubscription<Map<String, dynamic>?>? _perfilSubscription;
  String? _periodoPerfil;
  String? _uidSesion;
  int _revisionPerfil = 0;
  int _versionDatosPerfil = 0;

  String? _uidEscuchado;

  bool _cargando = true;

  bool _tapWebProcesado = false;

  @override
  void initState() {
    super.initState();
    _authService = widget.authService ?? AuthService();
    final remoto =
        widget.remotoSalida ??
        DesvinculacionService(uidActual: () => _authService.currentUser?.uid);
    _persistenciaSalida =
        widget.persistenciaSalida ??
        DesvinculacionPendienteService(
          uidActual: () => _authService.currentUser?.uid,
          remoto: remoto,
        );
    _salida = CoordinadorDesvinculacion(
      uidActual: () => _authService.currentUser?.uid,
      cambiosSesion: _sesionesSalida.stream,
      persistencia: _persistenciaSalida,
      remoto: remoto,
    );
    _uidSesion = _authService.currentUser?.uid;
    _authService.ingreso.addListener(_cambioIngreso);

    if (widget.habilitarNotificaciones) {
      NotificationService.instance.setTapHandler(_manejarTapNotificacion);
    }

    _authSubscription = _authService.authStateChanges.listen((user) {
      if (!mounted || _uidSesion == user?.uid) {
        return;
      }
      _uidSesion = user?.uid;
      _sesionesSalida.add(user?.uid);
      _solicitudSalida = null;
      _contextoSalida = null;
      _iglesiaSalidaLegacy = null;
      _salidaOcupada = _salidaBloqueada = _salidaVerificada = false;
      _sinSolicitudComprobada = false;
      _revisionSesion++;
      unawaited(_cancelarEscuchaPerfil());
      _authService.ingreso.cambiarSesion(user?.uid);
      setState(() {
        _perfil = null;
        _periodoPerfil = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          navigatorKey.currentState?.popUntil((route) => route.isFirst);
        }
      });
      unawaited(_revisarSesion());
    });

    _revisarSesion();
  }

  @override
  void dispose() {
    _authService.ingreso.removeListener(_cambioIngreso);
    _authSubscription?.cancel();
    _perfilSubscription?.cancel();
    unawaited(_salida.dispose());
    unawaited(_sesionesSalida.close());

    super.dispose();
  }

  void _cambioIngreso() {
    if (!mounted) {
      return;
    }
    setState(() {});
    if (_authService.ingreso.bloqueaDashboard) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _authService.ingreso.bloqueaDashboard) {
          navigatorKey.currentState?.popUntil((route) => route.isFirst);
        }
      });
    }
  }

  Future<void> _cancelarEscuchaPerfil() async {
    _revisionPerfil++;
    final subscription = _perfilSubscription;
    _perfilSubscription = null;
    _uidEscuchado = null;
    await subscription?.cancel();
  }

  void _escucharPerfilUsuario(String uid) {
    if (_uidEscuchado == uid && _perfilSubscription != null) {
      return;
    }

    _perfilSubscription?.cancel();

    _uidEscuchado = uid;
    final revision = ++_revisionPerfil;

    final flujo =
        widget.observarPerfil?.call(uid) ??
        FirebaseFirestore.instance
            .collection('usuarios_globales')
            .doc(uid)
            .snapshots(includeMetadataChanges: true)
            .where(
              (snapshot) =>
                  !snapshot.metadata.isFromCache ||
                  (_authService.ingreso.solicitud == null &&
                      !_bloqueaSalida &&
                      _solicitudSalida == null),
            )
            .map((snapshot) => snapshot.data());
    _perfilSubscription = flujo.listen(
      (data) {
        if (!mounted ||
            revision != _revisionPerfil ||
            _authService.currentUser?.uid != uid) {
          return;
        }

        final perfilAnterior = _perfil;
        _versionDatosPerfil++;

        UsuarioModel? perfilNuevo;

        if (data != null) {
          perfilNuevo = UsuarioModel.fromMap(data, uid);
        }

        final iglesiaAnterior = perfilAnterior?.iglesiaId ?? '';

        final iglesiaNueva = perfilNuevo?.iglesiaId ?? '';

        final rolAnterior = perfilAnterior?.rolGlobal ?? '';

        final rolNuevo = perfilNuevo?.rolGlobal ?? '';

        final periodo = data?['pertenenciaId'] is String
            ? data!['pertenenciaId'] as String
            : null;
        final cambioVinculacion =
            iglesiaAnterior != iglesiaNueva ||
            rolAnterior != rolNuevo ||
            _periodoPerfil != periodo;

        if (!cambioVinculacion) {
          return;
        }

        setState(() {
          _perfil = perfilNuevo;
          _periodoPerfil = periodo;
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
          if (!mounted ||
              revision != _revisionPerfil ||
              _authService.currentUser?.uid != uid) {
            return;
          }
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
          'Se mantendrá el estado vigente de recuperación.',
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

    if (perfil == null ||
        _bloqueaSalida ||
        perfil.iglesiaId.isEmpty ||
        !_authService.ingreso.permitePerfil(
          perfil.uid,
          perfil.iglesiaId,
          _periodoPerfil,
        )) {
      return false;
    }

    final tipo = (data['tipo'] ?? data['type'])?.toString().trim();

    final navigator = navigatorKey.currentState;

    if (navigator == null) {
      return false;
    }

    await _limpiarContadorNotificacion(perfil, tipo);
    if (!mounted || _authService.currentUser?.uid != perfil.uid) {
      return true;
    }

    switch (tipo) {
      case 'nuevo_miembro':
        if (data['iglesiaId'] != perfil.iglesiaId ||
            perfil.rolGlobal != 'admin_iglesia') {
          return true;
        }
        await navigator.push(
          MaterialPageRoute(
            builder: (_) => GestionMiembrosScreen(usuario: perfil),
          ),
        );
        return true;

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

    final tipo = uri.queryParameters['tipo'] ?? uri.queryParameters['type'];

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
    final revision = ++_revisionSesion;
    if (mounted) {
      setState(() {
        _cargando = true;
      });
    }

    final user = _authService.currentUser;
    _authService.ingreso.cambiarSesion(user?.uid);

    if (user == null) {
      await _cancelarEscuchaPerfil();

      if (mounted && revision == _revisionSesion) {
        setState(() {
          _perfil = null;
          _cargando = false;
        });
      }

      return;
    }

    await _authService.ingreso.prepararSesion();
    if (!mounted ||
        revision != _revisionSesion ||
        _authService.currentUser?.uid != user.uid) {
      return;
    }
    try {
      final salidaLocal = await _persistenciaSalida.recuperarSalidaPropia(
        user.uid,
      );
      if (!mounted || revision != _revisionSesion || _uidSesion != user.uid) {
        return;
      }
      _solicitudSalida = salidaLocal;
      _sinSolicitudComprobada = salidaLocal == null;
    } catch (_) {
      if (mounted && revision == _revisionSesion && _uidSesion == user.uid) {
        _salidaBloqueada = true;
        _mensajeSalida = 'No se puede leer la solicitud de salida. No se creará otra intención.';
      }
    }
    if (!mounted || revision != _revisionSesion || _uidSesion != user.uid) {
      return;
    }
    final perfil = await _authService.obtenerPerfilUsuario(user.uid);

    bool vigente() =>
        mounted &&
        revision == _revisionSesion &&
        _authService.currentUser?.uid == user.uid;
    if (!vigente()) {
      return;
    }

    _escucharPerfilUsuario(user.uid);

    if (perfil != null) {
      try {
        final data = await _authService.leerPerfilServidor(user.uid);
        if (!vigente()) {
          return;
        }
        _periodoPerfil = data?['pertenenciaId'] is String
            ? data!['pertenenciaId'] as String
            : null;

        final modoOscuro = data?['modoOscuro'];

        if (modoOscuro is bool && mounted && vigente()) {
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

    if (!vigente()) {
      return;
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
    if (widget.habilitarNotificaciones &&
        !_bloqueaSalida &&
        perfil != null &&
        perfil.iglesiaId.isNotEmpty &&
        _authService.ingreso.permitePerfil(
          user.uid,
          perfil.iglesiaId,
          _periodoPerfil,
        )) {
      await NotificationService.instance.configurarUsuario(user.uid);
      if (!vigente()) {
        return;
      }

      await NotificationService.instance.reanudarTapPendiente();
      if (!vigente()) {
        return;
      }
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
    if (widget.habilitarNotificaciones) {
      await NotificationService.instance.desvincularUsuario();
    }

    await _cancelarEscuchaPerfil();

    await _authService.cerrarSesion();
  }

  Future<void> _perfilActualizado() async {
    if (_bloqueaSalida) return;
    await _revisarSesion();
  }

  Future<void> _salirCongregacion() async {
    if (_bloqueaSalida) return;
    final uid = _authService.currentUser?.uid;
    if (uid == null) return;
    final revision = _revisionSesion;
    final iglesia = _perfil?.iglesiaId;
    final periodo = _periodoPerfil;
    _iglesiaSalidaLegacy = null;
    setState(() {
      _salidaOcupada = _salidaBloqueada = true;
      _salidaVerificada = false;
      _mensajeSalida = 'Verificando la solicitud de salida…';
    });
    _mostrarRecuperacionSalida();
    try {
      final previa = await _persistenciaSalida.recuperarSalidaPropia(uid);
      if (!_salidaVigente(revision, uid)) return;
      _sinSolicitudComprobada = previa == null;
      if (previa != null &&
          previa.estado != EstadoDesvinculacionPendiente.confirmada) {
        _solicitudSalida = previa;
        _mensajeSalida = 'Existe una salida pendiente. Consulta su resultado antes de continuar.';
        return;
      }
      final data = await _authService.leerPerfilServidor(uid);
      if (!_salidaVigente(revision, uid)) return;
      if (previa == null &&
          data != null &&
          !data.containsKey('pertenenciaId') &&
          periodo == null &&
          iglesia != null &&
          iglesia.isNotEmpty &&
          data['iglesiaId'] == iglesia &&
          ['lider_area', 'servidor'].contains(data['rolGlobal'])) {
        _iglesiaSalidaLegacy = iglesia;
        _sinSolicitudComprobada = false;
        await _authService.salirCongregacionLegacy(
          uid: uid,
          iglesiaId: iglesia,
        );
        await _verificarSalidaLegacy(revision, uid);
        return;
      }
      if (!_periodoValido(data?['pertenenciaId'])) {
        _mensajeSalida =
            'La cuenta requiere migración de pertenencia antes de salir.';
        return;
      }
      if (iglesia == null ||
          iglesia.isEmpty ||
          data?['iglesiaId'] != iglesia ||
          data?['pertenenciaId'] != periodo ||
          !['lider_area', 'servidor'].contains(data?['rolGlobal'])) {
        _mensajeSalida = 'La pertenencia cambió o requiere verificación. No se inició otra solicitud.';
        return;
      }
      final c = ContextoDesvinculacion(
        actorUid: uid,
        uidObjetivo: uid,
        iglesiaId: iglesia,
        accion: AccionDesvinculacion.salir,
        pertenenciaId: data!['pertenenciaId'] as String,
      );
      _contextoSalida = c;
      _sinSolicitudComprobada = false;
      final resultado = await _salida.iniciar(
        contexto: c,
        decisionConfirmada: true,
      );
      if (!_salidaVigente(revision, uid)) return;
      final salidaLocal = await _persistenciaSalida.recuperarSalidaPropia(uid);
      if (!_salidaVigente(revision, uid)) return;
      _solicitudSalida = salidaLocal;
      await _aplicarResultadoSalida(resultado, c, revision, uid);
    } catch (_) {
      if (_salidaVigente(revision, uid)) {
        _mensajeSalida = 'No se pudo confirmar la salida. Conserva la solicitud y consulta su estado.';
      }
    } finally {
      if (_salidaVigente(revision, uid)) setState(() => _salidaOcupada = false);
    }
  }

  bool _salidaVigente(int revision, String uid) =>
      mounted &&
      revision == _revisionSesion &&
      _uidSesion == uid &&
      _authService.currentUser?.uid == uid;

  Future<void> _verificarSalidaLegacy(int revision, String uid) async {
    final data = await _authService.leerPerfilServidor(uid);
    if (!_salidaVigente(revision, uid)) return;
    if (data != null &&
        !data.containsKey('pertenenciaId') &&
        !data.containsKey('iglesiaId') &&
        !data.containsKey('rolGlobal')) {
      _perfil = UsuarioModel.fromMap(data, uid);
      _periodoPerfil = null;
      _salidaVerificada = true;
      _salidaBloqueada = false;
      _iglesiaSalidaLegacy = null;
      return;
    }
    _sinSolicitudComprobada =
        data != null &&
        !data.containsKey('pertenenciaId') &&
        data['iglesiaId'] == _iglesiaSalidaLegacy &&
        ['lider_area', 'servidor'].contains(data['rolGlobal']);
    _mensajeSalida = 'La salida no está confirmada en el perfil actual. Consulta otra vez antes de continuar.';
  }

  static bool _periodoValido(Object? valor) =>
      valor is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(valor);

  void _mostrarRecuperacionSalida() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _bloqueaSalida) {
        navigatorKey.currentState?.popUntil((r) => r.isFirst);
      }
    });
  }

  Future<void> _aplicarResultadoSalida(
    ResultadoCoordinacionDesvinculacion r,
    ContextoDesvinculacion c,
    int revision,
    String uid,
  ) async {
    if (!_salidaVigente(revision, uid)) return;
    if (r.estado != EstadoCoordinacionDesvinculacion.confirmada) {
      _mensajeSalida = r.codigo == 'recibo-ausente-no-concluyente'
          ? 'El recibo aún no está disponible. Esto no demuestra que la salida haya fallado.'
          : 'La salida no está confirmada. Conserva la solicitud y consulta su estado.';
      return;
    }
    final versionPerfil = _versionDatosPerfil;
    final data = await _authService.leerPerfilServidor(uid);
    if (!_salidaVigente(revision, uid)) return;
    if (_versionDatosPerfil != versionPerfil) {
      _mensajeSalida = 'El perfil cambió durante la verificación. Consulta otra vez la salida.';
      return;
    }
    final sinIglesia =
        data != null &&
        !data.containsKey('iglesiaId') &&
        !data.containsKey('rolGlobal');
    final nueva =
        data != null &&
        data['iglesiaId'] is String &&
        (data['iglesiaId'] as String).isNotEmpty &&
        [
          'admin_iglesia',
          'lider_area',
          'servidor',
        ].contains(data['rolGlobal']) &&
        data['pertenenciaId'] != c.pertenenciaId;
    if (!_periodoValido(data?['pertenenciaId']) || (!sinIglesia && !nueva)) {
      _mensajeSalida =
          'La salida está confirmada, pero falta verificar el perfil actual.';
      return;
    }
    // El recibo acredita historia, nunca pertenencia actual. No limpiar FCM:
    // el backend retira el token legado; los dispositivos antiguos siguen pendientes.
    _perfil = UsuarioModel.fromMap(data, uid);
    _periodoPerfil = data['pertenenciaId'] as String;
    _salidaVerificada = true;
    _salidaBloqueada = false;
  }

  Future<void> _recuperarSalida({bool reintentar = false}) async {
    if (_salidaOcupada) return;
    final uid = _authService.currentUser?.uid;
    if (uid == null) return;
    final revision = _revisionSesion;
    setState(() => _salidaOcupada = true);
    try {
      if (_iglesiaSalidaLegacy != null) {
        await _verificarSalidaLegacy(revision, uid);
        return;
      }
      final registro = await _persistenciaSalida.recuperarSalidaPropia(uid);
      if (!_salidaVigente(revision, uid)) return;
      _solicitudSalida = registro;
      if (registro == null) {
        _mensajeSalida = 'No se recuperó un registro verificable. No se creará otra solicitud.';
        return;
      }
      if (reintentar && _contextoSalida != null) {
        final c = _contextoSalida!;
        final r = await _salida.reintentar(contexto: c);
        await _aplicarResultadoSalida(r, c, revision, uid);
      } else {
        final r = await _salida.recuperarContexto(
          solicitudId: registro.solicitudId,
        );
        if (!_salidaVigente(revision, uid)) return;
        final c = r.contextoRecuperado;
        if (c == null) {
          _mensajeSalida = r.codigo == 'recibo-ausente-no-concluyente'
              ? 'El recibo aún no está disponible. Conserva la solicitud original.'
              : 'No se pudo verificar el contexto original. La salida permanece bloqueada.';
          return;
        }
        if (c.actorUid != uid ||
            c.uidObjetivo != uid ||
            c.accion != AccionDesvinculacion.salir) {
          _mensajeSalida =
              'El contexto original no corresponde a una salida propia.';
          return;
        }
        _contextoSalida = c;
        await _aplicarResultadoSalida(r, c, revision, uid);
      }
    } catch (_) {
      if (_salidaVigente(revision, uid)) _mensajeSalida = 'No se pudo recuperar la salida. No borres el registro ni crees otra intención.';
    } finally {
      if (_salidaVigente(revision, uid)) setState(() => _salidaOcupada = false);
    }
  }

  Widget _recuperacionSalida() => Scaffold(
    appBar: AppBar(title: const Text('Verificar salida')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_mensajeSalida),
            const SizedBox(height: 16),
            if (_salidaOcupada) const CircularProgressIndicator(),
            ElevatedButton(
              onPressed: _salidaOcupada ? null : () => _recuperarSalida(),
              child: const Text('Consultar salida'),
            ),
            if (_contextoSalida != null)
              TextButton(
                onPressed: _salidaOcupada
                    ? null
                    : () => _recuperarSalida(reintentar: true),
                child: const Text('Reintentar la misma solicitud'),
              ),
            if (_sinSolicitudComprobada && !_salidaOcupada)
              TextButton(
                onPressed: () => setState(() => _salidaBloqueada = false),
                child: const Text('Volver sin iniciar salida'),
              ),
            TextButton(
              onPressed: _salidaOcupada ? null : _cerrarSesion,
              child: const Text('Cerrar sesión'),
            ),
          ],
        ),
      ),
    ),
  );

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
      return AuthScreen(onVinculado: _revisarSesion, authService: _authService);
    }

    if (_bloqueaSalida) return _recuperacionSalida();

    if (!_authService.ingreso.inicializado ||
        _authService.ingreso.uid != user.uid) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_perfil == null ||
        _perfil!.iglesiaId.isEmpty ||
        !_authService.ingreso.permitePerfil(
          user.uid,
          _perfil!.iglesiaId,
          _periodoPerfil,
        )) {
      return OnboardingIglesiaScreen(
        key: ValueKey(user.uid),
        user: user,
        onCompletado: _revisarSesion,
        authService: _authService,
      );
    }

    if (widget.dashboardBuilder != null) {
      return widget.dashboardBuilder!(context, _perfil!);
    }

    if (widget.dashboardConSalidaBuilder != null) {
      return widget.dashboardConSalidaBuilder!(
        context,
        _perfil!,
        _salirCongregacion,
      );
    }

    return DashboardScreen(
      usuario: _perfil!,
      onCerrarSesion: _cerrarSesion,
      onPerfilActualizado: _perfilActualizado,
      onSalirCongregacion: _salirCongregacion,
    );
  }
}
