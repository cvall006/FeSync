import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

const finanzasEmuladores = bool.fromEnvironment('FESYNC_FINANZAS_DEMO');

/// Un host de prueba sin activar la demo no debe seleccionar Firebase real.
/// Esta validación ocurre antes de inicializar cualquier SDK.
void validarSeleccionFirebase({
  bool emuladores = finanzasEmuladores,
  bool debug = kDebugMode,
  String host = const String.fromEnvironment('FESYNC_EMULATOR_HOST'),
  String transporte = const String.fromEnvironment(
    'FESYNC_FINANZAS_TRANSPORTE',
  ),
}) {
  if ((transporte == 'emulador' && !emuladores) ||
      (transporte == 'publicable' && (emuladores || debug)) ||
      !['', 'deshabilitado', 'emulador', 'publicable'].contains(transporte)) {
    throw StateError('Selección de transporte financiero incoherente.');
  }
  if (!emuladores && host.isNotEmpty) {
    throw StateError(
      'FESYNC_EMULATOR_HOST requiere FESYNC_FINANZAS_DEMO=true.',
    );
  }
  if (emuladores && !debug) {
    throw StateError('La configuración demo solo admite compilaciones debug.');
  }
  if (emuladores && host.isNotEmpty) {
    validarHostEmulador(host);
  }
}

String validarHostEmulador(String host) {
  if (!['127.0.0.1', 'localhost', '10.0.2.2'].contains(host)) {
    throw StateError('Solo se permiten emuladores locales.');
  }
  return host;
}

/// Se ejecuta antes de crear servicios, escuchar sesiones o abrir el Dashboard.
Future<void> inicializarFirebaseEmuladores() async {
  if (!finanzasEmuladores || !kDebugMode) {
    throw StateError(
      'Los emuladores requieren modo debug y FESYNC_FINANZAS_DEMO=true.',
    );
  }
  final host = validarHostEmulador(
    const String.fromEnvironment(
      'FESYNC_EMULATOR_HOST',
      defaultValue: '127.0.0.1',
    ),
  );
  await Firebase.initializeApp(
    options: FirebaseOptions(
      apiKey: 'AIzaSyDemoFeSync00000000000000000000000',
      appId: !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? '1:1234567890:android:0000000000000000000000'
          : '1:1234567890:web:demo-fesync',
      messagingSenderId: '1234567890',
      projectId: 'demo-fesync',
      storageBucket: 'demo-fesync.firebasestorage.app',
    ),
  );
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: false,
  );
  // En un teléfono USB, 127.0.0.1 llega al PC mediante adb reverse.
  // El mapeo automático a 10.0.2.2 solo sirve para el Android Emulator.
  FirebaseFirestore.instance.useFirestoreEmulator(
    host,
    8088,
    automaticHostMapping: false,
  );
  await FirebaseAuth.instance.useAuthEmulator(
    host,
    9098,
    automaticHostMapping: false,
  );
  FirebaseFunctions.instanceFor(region: 'southamerica-west1')
      .useFunctionsEmulator(host, 5018, automaticHostMapping: false);
  // Storage no forma parte de esta fixture: falla localmente si otro módulo
  // intenta subir un archivo, sin recurrir al bucket de producción.
  await FirebaseStorage.instance.useStorageEmulator(
    host,
    9198,
    automaticHostMapping: false,
  );
  debugPrint(
    'FeSync: demo-fesync; Auth $host:9098; Firestore $host:8088; '
    'Functions $host:5018; Storage $host:9198 (sin servicio); FCM desactivado.',
  );
}
