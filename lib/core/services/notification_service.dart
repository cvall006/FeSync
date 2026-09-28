import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../firebase_options.dart';

typedef NotificationTapHandler = Future<bool> Function(
  Map<String, dynamic> data,
);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const String _webVapidKey =
      'BK_KWFnlb2CuUzAy7jO47uNJRmgLOM-SBMTt7tvc37pJ_7DH2kWBYSbcJ1Mf1yZtKdKhxMmoGZTfQSuvJTqsg5c';

  static const String _channelId = 'fesync_high_importance';

  static const String _channelName = 'Notificaciones FeSync';

  static const String _channelDescription = 'Avisos importantes de FeSync';

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  StreamSubscription<String>? _tokenRefreshSubscription;

  NotificationTapHandler? _tapHandler;

  Map<String, dynamic>? _tapPendiente;

  String? _usuarioUid;
  String? _tokenActual;

  bool _inicializado = false;

  bool get _esAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  bool get _esApple =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS);

  bool get _soportaFcm => kIsWeb || _esAndroid || _esApple;

  String get _plataforma {
    if (kIsWeb) {
      return 'web';
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.macOS:
        return 'macos';
      case TargetPlatform.windows:
        return 'windows';
      case TargetPlatform.linux:
        return 'linux';
      default:
        return 'desconocida';
    }
  }

  String _idDispositivo(String token) {
    return Uri.encodeComponent(token);
  }

  Future<void> initialize() async {
    if (_inicializado) {
      return;
    }

    _inicializado = true;

    if (!_soportaFcm) {
      return;
    }

    if (!kIsWeb) {
      const androidSettings = AndroidInitializationSettings(
        '@mipmap/ic_launcher',
      );

      const appleSettings = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      const initializationSettings = InitializationSettings(
        android: androidSettings,
        iOS: appleSettings,
        macOS: appleSettings,
      );

      await _localNotifications.initialize(
        settings: initializationSettings,
        onDidReceiveNotificationResponse: (response) async {
          final payload = response.payload;

          if (payload == null || payload.isEmpty) {
            return;
          }

          try {
            final decoded = jsonDecode(payload);

            if (decoded is Map) {
              await _procesarTap(Map<String, dynamic>.from(decoded));
            }
          } catch (error) {
            debugPrint('No se pudo leer payload de notificación: $error');
          }
        },
      );

      if (_esAndroid) {
        const channel = AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: _channelDescription,
          importance: Importance.max,
        );

        await _localNotifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.createNotificationChannel(channel);
      }

      if (_esApple) {
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      final launchDetails = await _localNotifications
          .getNotificationAppLaunchDetails();

      final payload = launchDetails?.notificationResponse?.payload;

      if (payload != null && payload.isNotEmpty) {
        try {
          final decoded = jsonDecode(payload);

          if (decoded is Map) {
            _tapPendiente = Map<String, dynamic>.from(decoded);
          }
        } catch (_) {}
      }
    }

    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    FirebaseMessaging.onMessageOpenedApp.listen((message) async {
      await _procesarTap(Map<String, dynamic>.from(message.data));
    });

    final mensajeInicial = await _messaging.getInitialMessage();

    if (mensajeInicial != null) {
      _tapPendiente = Map<String, dynamic>.from(mensajeInicial.data);
    }

    _tokenRefreshSubscription ??= _messaging.onTokenRefresh.listen((
      nuevoToken,
    ) async {
      final uid = _usuarioUid;

      if (uid == null) {
        _tokenActual = nuevoToken;
        return;
      }

      final tokenAnterior = _tokenActual;

      if (tokenAnterior != null && tokenAnterior != nuevoToken) {
        await _eliminarDispositivo(uid, tokenAnterior);
      }

      _tokenActual = nuevoToken;

      await _guardarToken(uid, nuevoToken);
    });
  }

  Future<void> configurarUsuario(String uid) async {
    _usuarioUid = uid;

    if (!_soportaFcm) {
      return;
    }

    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied ||
          settings.authorizationStatus == AuthorizationStatus.notDetermined) {
        debugPrint('Permiso de notificaciones no concedido.');

        return;
      }

      final token = kIsWeb
          ? await _messaging.getToken(vapidKey: _webVapidKey)
          : await _messaging.getToken();

      if (token == null || token.isEmpty) {
        debugPrint('FCM no devolvió token.');

        return;
      }

      final tokenAnterior = _tokenActual;

      if (tokenAnterior != null && tokenAnterior != token) {
        await _eliminarDispositivo(uid, tokenAnterior);
      }

      _tokenActual = token;

      await _guardarToken(uid, token);
    } catch (error) {
      debugPrint('Error configurando FCM: $error');
    }
  }

  Future<void> _guardarToken(String uid, String token) async {
    final usuarioRef = FirebaseFirestore.instance
        .collection('usuarios_globales')
        .doc(uid);

    final dispositivoRef = usuarioRef
        .collection('dispositivos')
        .doc(_idDispositivo(token));

    final batch = FirebaseFirestore.instance.batch();

    batch.set(usuarioRef, {
      // Compatibilidad temporal con
      // la implementación anterior.
      'fcmToken': token,
      'fcmTokenActualizado': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    batch.set(dispositivoRef, {
      'token': token,
      'plataforma': _plataforma,
      'activo': true,
      'actualizado': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    await batch.commit();

    debugPrint('Token FCM registrado para $_plataforma.');
  }

  Future<void> _eliminarDispositivo(String uid, String token) async {
    try {
      await FirebaseFirestore.instance
          .collection('usuarios_globales')
          .doc(uid)
          .collection('dispositivos')
          .doc(_idDispositivo(token))
          .delete();
    } catch (error) {
      debugPrint('No se pudo eliminar token anterior: $error');
    }
  }

  Future<void> desvincularUsuario() async {
    final uid = _usuarioUid;
    final token = _tokenActual;

    _usuarioUid = null;
    _tokenActual = null;

    if (uid == null || token == null || !_soportaFcm) {
      return;
    }

    try {
      final usuarioRef = FirebaseFirestore.instance
          .collection('usuarios_globales')
          .doc(uid);

      await _eliminarDispositivo(uid, token);

      final snapshot = await usuarioRef.get();

      final data = snapshot.data();

      if (data?['fcmToken']?.toString() == token) {
        await usuarioRef.update({
          'fcmToken': FieldValue.delete(),
          'fcmTokenActualizado': FieldValue.delete(),
        });
      }

      await _messaging.deleteToken();
    } catch (error) {
      debugPrint('Error desvinculando token FCM: $error');
    }
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    if (kIsWeb) {
      debugPrint(
        'FCM Web foreground: '
        '${message.notification?.title ?? "FeSync"}',
      );

      return;
    }

    if (!_esAndroid) {
      return;
    }

    final notification = message.notification;

    final titulo = notification?.title ?? 'FeSync';

    final cuerpo = notification?.body ?? 'Tienes una nueva notificación.';

    const androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDescription,
      importance: Importance.max,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    );

    const details = NotificationDetails(android: androidDetails);

    final id = DateTime.now().millisecondsSinceEpoch.remainder(2147483647);

    await _localNotifications.show(
      id: id,
      title: titulo,
      body: cuerpo,
      notificationDetails: details,
      payload: jsonEncode(message.data),
    );
  }

  void setTapHandler(NotificationTapHandler handler) {
    _tapHandler = handler;

    reanudarTapPendiente();
  }

  Future<void> reanudarTapPendiente() async {
    final pendiente = _tapPendiente;

    if (pendiente == null) {
      return;
    }

    await _procesarTap(pendiente);
  }

  Future<void> _procesarTap(Map<String, dynamic> data) async {
    _tapPendiente = Map<String, dynamic>.from(data);

    final handler = _tapHandler;

    if (handler == null) {
      return;
    }

    final procesado = await handler(_tapPendiente!);

    if (procesado) {
      _tapPendiente = null;
    }
  }
}
