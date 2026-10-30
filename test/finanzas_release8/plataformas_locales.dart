// Adaptadores exclusivos del test de main.dart: SDK Flutter sobre HTTP local.
// No sustituyen nombres/contratos ni la autorización del servidor.
// ignore_for_file: depend_on_referenced_packages, curly_braces_in_flow_control_structures
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart'
    as auth;
import 'package:cloud_firestore_platform_interface/cloud_firestore_platform_interface.dart'
    as store;
import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart'
    as fn;
import 'package:firebase_storage_platform_interface/firebase_storage_platform_interface.dart'
    as storage;
import 'package:flutter_test/flutter_test.dart';

final destinos = <String>[];
final llamadas = <String>[];
late Map<String, dynamic> sesion;
bool perderRespuesta = false;

void validarUri(Uri uri) {
  if (uri.scheme != 'http' ||
      uri.host != '127.0.0.1' ||
      ![8088, 9098, 5018].contains(uri.port))
    throw StateError('Conexion externa prohibida: $uri');
  destinos.add('${uri.scheme}://${uri.host}:${uri.port}');
}

class SoloLocal extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      _Cliente(super.createHttpClient(context));
}

class _Cliente implements HttpClient {
  _Cliente(this.real);
  final HttpClient real;
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) {
    validarUri(url);
    return real.openUrl(method, url);
  }

  @override
  Future<HttpClientRequest> postUrl(Uri url) => openUrl('POST', url);
  @override
  Future<HttpClientRequest> getUrl(Uri url) => openUrl('GET', url);
  @override
  void close({bool force = false}) => real.close(force: force);
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('HTTP no previsto: ${invocation.memberName}');
}

Future<Map<String, dynamic>> http(
  String url, {
  Map<String, dynamic>? body,
  String? token,
}) async {
  final c = HttpClient();
  try {
    final req = await c.openUrl(body == null ? 'GET' : 'POST', Uri.parse(url));
    req.followRedirects = false;
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set('Authorization', 'Bearer $token');
    if (body != null) req.write(jsonEncode(body));
    final res = await req.close();
    final data = jsonDecode(
      await res.transform(utf8.decoder).join(),
    ) as Map<String, dynamic>;
    if (res.statusCode != 200 || data['error'] != null)
      throw StateError('Respuesta local rechazada ${res.statusCode}');
    return data;
  } finally {
    c.close(force: true);
  }
}

class CoreLocal extends FirebasePlatform {
  late FirebaseAppPlatform valor;
  @override
  List<FirebaseAppPlatform> get apps => [valor];
  @override
  Future<FirebaseAppPlatform> initializeApp({
    String? name,
    FirebaseOptions? options,
  }) async {
    expect(options!.projectId, 'demo-fesync');
    valor = FirebaseAppPlatform(name ?? '[DEFAULT]', options);
    return valor;
  }

  @override
  FirebaseAppPlatform app([String name = '[DEFAULT]']) => valor;
}

class AuthLocal extends auth.FirebaseAuthPlatform {
  late final auth.UserPlatform usuario = _Usuario(this);
  @override
  auth.FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;
  @override
  auth.FirebaseAuthPlatform setInitialValues({
    auth.InternalUserDetails? currentUser,
    String? languageCode,
  }) => this;
  @override
  auth.UserPlatform get currentUser => usuario;
  @override
  Stream<auth.UserPlatform?> authStateChanges() => Stream.value(usuario);
  @override
  Stream<auth.UserPlatform?> idTokenChanges() => Stream.value(usuario);
  @override
  Future<void> useAuthEmulator(String host, int port) async {
    expect(host, '127.0.0.1');
    expect(port, 9098);
  }
}

class _Multi extends auth.MultiFactorPlatform {
  _Multi(super.auth);
}

class _Usuario extends auth.UserPlatform {
  _Usuario(auth.FirebaseAuthPlatform a)
    : super(
        a,
        _Multi(a),
        auth.InternalUserDetails(
          userInfo: auth.InternalUserInfo(
            uid: sesion['localId'],
            isAnonymous: false,
            isEmailVerified: false,
          ),
          providerData: [],
        ),
      );
  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async =>
      sesion['idToken'];
}

dynamic decodificar(Map<String, dynamic> v) {
  if (v.containsKey('stringValue')) return v['stringValue'];
  if (v.containsKey('integerValue'))
    return int.parse(v['integerValue'].toString());
  if (v.containsKey('booleanValue')) return v['booleanValue'];
  if (v.containsKey('nullValue')) return null;
  if (v.containsKey('mapValue'))
    return ((v['mapValue']['fields'] ?? {}) as Map).map(
      (k, x) =>
          MapEntry(k.toString(), decodificar(Map<String, dynamic>.from(x))),
    );
  return null;
}

class StoreLocal extends store.FirebaseFirestorePlatform {
  store.Settings configuracion = const store.Settings();
  @override
  store.FirebaseFirestorePlatform delegateFor({
    required FirebaseApp app,
    required String databaseId,
  }) => this;
  @override
  store.Settings get settings => configuracion;
  @override
  set settings(store.Settings value) {
    configuracion = value;
  }

  @override
  store.DocumentReferencePlatform doc(String documentPath) =>
      _Documento(this, documentPath);
  @override
  store.CollectionReferencePlatform collection(String collectionPath) =>
      _Coleccion(this, collectionPath);
}

class _Coleccion extends store.CollectionReferencePlatform {
  _Coleccion(super.firestore, super.path);
  @override
  store.DocumentReferencePlatform doc([String? path]) =>
      firestore.doc('${this.path}/$path');
}

class _Documento extends store.DocumentReferencePlatform {
  _Documento(super.firestore, super.path);
  @override
  Future<store.DocumentSnapshotPlatform> get([
    store.GetOptions options = const store.GetOptions(),
  ]) async {
    expect(firestore.settings.host, '127.0.0.1:8088');
    final d = await http(
      'http://127.0.0.1:8088/v1/projects/demo-fesync/databases/(default)/documents/$path',
      token: sesion['idToken'],
    );
    final campos = (d['fields'] as Map).map(
      (k, v) =>
          MapEntry(k.toString(), decodificar(Map<String, dynamic>.from(v))),
    );
    return store.DocumentSnapshotPlatform(
      firestore,
      path,
      campos,
      store.InternalSnapshotMetadata(
        hasPendingWrites: false,
        isFromCache: false,
      ),
    );
  }

  @override
  Stream<store.DocumentSnapshotPlatform> snapshots({
    bool includeMetadataChanges = false,
    required store.ListenSource listenSource,
  }) => Stream.fromFuture(get());
}

class FunctionsLocal extends fn.FirebaseFunctionsPlatform {
  FunctionsLocal() : super(null, 'southamerica-west1');
  @override
  fn.FirebaseFunctionsPlatform delegateFor({
    FirebaseApp? app,
    required String region,
  }) {
    expect(app!.options.projectId, 'demo-fesync');
    expect(region, 'southamerica-west1');
    return this;
  }

  @override
  fn.HttpsCallablePlatform httpsCallable(
    String? origin,
    String name,
    fn.HttpsCallableOptions options,
  ) => _Callable(this, origin, name, options);
}

class _Callable extends fn.HttpsCallablePlatform {
  _Callable(
    fn.FirebaseFunctionsPlatform functions,
    String? origin,
    String name,
    fn.HttpsCallableOptions options,
  ) : super(functions, origin, name, options, null);
  @override
  Future<dynamic> call([Object? parameters]) async {
    expect(origin, 'http://127.0.0.1:5018');
    expect(
      [
        'finanzasV1Consultar',
        'finanzasV1Ejecutar',
      ].contains(name),
      true,
    );
    llamadas.add(name!);
    final r = await http(
      '$origin/demo-fesync/southamerica-west1/$name',
      body: {'data': parameters},
      token: sesion['idToken'],
    );
    if (perderRespuesta &&
        ['finanzasV1Ejecutar', 'finanzasV1Mantener'].contains(name)) {
      perderRespuesta = false;
      throw TimeoutException('Respuesta descartada tras commit');
    }
    return r['result'];
  }
}

class StorageLocal extends storage.FirebaseStoragePlatform {
  StorageLocal() : super(bucket: 'demo-fesync.firebasestorage.app');
  @override
  storage.FirebaseStoragePlatform delegateFor({
    required FirebaseApp app,
    required String bucket,
  }) => this;
  @override
  Future<void> useStorageEmulator(String host, int port) async {
    expect(host, '127.0.0.1');
    expect(port, 9198);
  }
}
