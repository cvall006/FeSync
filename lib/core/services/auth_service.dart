import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';

import '../models/app_models.dart';
import '../models/resultado_ingreso.dart';
import 'coordinador_ingreso.dart';
import 'ingreso_pendiente_service.dart';

class AuthService {
  AuthService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    CoordinadorIngreso? coordinador,
  }) : _authOverride = auth,
       _firestoreOverride = firestore,
       _functionsOverride = functions,
       _coordinadorOverride = coordinador;

  final FirebaseAuth? _authOverride;
  final FirebaseFirestore? _firestoreOverride;
  final FirebaseFunctions? _functionsOverride;
  final CoordinadorIngreso? _coordinadorOverride;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;

  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;

  FirebaseFunctions get _functions =>
      _functionsOverride ??
      FirebaseFunctions.instanceFor(region: 'southamerica-west1');

  late final CoordinadorIngreso ingreso =
      _coordinadorOverride ??
      CoordinadorIngreso(
        uidActual: () => currentUser?.uid,
        leerPerfilServidor: leerPerfilServidor,
        llamar: (nombre, datos) async =>
            (await _functions.httpsCallable(nombre).call<Object?>(datos)).data,
      );

  Future<Map<String, dynamic>?> leerPerfilServidor(String uid) async =>
      (await _firestore
              .collection('usuarios_globales')
              .doc(uid)
              .get(const GetOptions(source: Source.server)))
          .data();

  Future<void> salirCongregacionLegacy({
    required String uid,
    required String iglesiaId,
  }) async {
    if (currentUser?.uid != uid || iglesiaId.isEmpty) {
      throw StateError('La sesión o la iglesia cambiaron.');
    }
    final ref = _firestore.collection('usuarios_globales').doc(uid);
    await _firestore.runTransaction((tx) async {
      final perfil = (await tx.get(ref)).data();
      final iglesia = (await tx.get(
        _firestore.collection('iglesias').doc(iglesiaId),
      )).data();
      if (currentUser?.uid != uid ||
          perfil == null ||
          perfil.containsKey('pertenenciaId') ||
          perfil['iglesiaId'] != iglesiaId ||
          !['servidor', 'lider_area'].contains(perfil['rolGlobal']) ||
          iglesia == null ||
          iglesia['adminUid'] == uid) {
        throw StateError('La pertenencia actual no admite salida legacy.');
      }
      tx.update(ref, {
        'iglesiaId': FieldValue.delete(),
        'rolGlobal': FieldValue.delete(),
        'descripcion': FieldValue.delete(),
      });
    });
  }

  static Future<void>? _googleInitialization;

  User? get currentUser => _auth.currentUser;

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  Future<UserCredential> iniciarConEmail(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  Future<UserCredential> crearConEmail(String email, String password) =>
      _auth.createUserWithEmailAndPassword(email: email, password: password);

  bool get _googleSignInNativoDisponible {
    if (kIsWeb || const bool.fromEnvironment('FESYNC_FINANZAS_DEMO')) {
      return false;
    }

    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS;
  }

  Future<void> _inicializarGoogleSignIn() {
    return _googleInitialization ??= GoogleSignIn.instance.initialize();
  }

  Future<UserCredential?> iniciarSesionConGoogle() async {
    if (const bool.fromEnvironment('FESYNC_FINANZAS_DEMO')) {
      throw StateError('En la prueba local usa correo y contraseña.');
    }
    if (kIsWeb) {
      final googleProvider = GoogleAuthProvider();

      return await _auth.signInWithPopup(googleProvider);
    }

    if (!_googleSignInNativoDisponible) {
      throw Exception(
        'El inicio de sesión con Google todavía no está habilitado '
        'para esta plataforma.',
      );
    }

    await _inicializarGoogleSignIn();

    try {
      final GoogleSignInAccount googleUser = await GoogleSignIn.instance
          .authenticate();

      final GoogleSignInAuthentication googleAuth = googleUser.authentication;

      final AuthCredential credential = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
      );

      return await _auth.signInWithCredential(credential);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return null;
      }

      rethrow;
    }
  }

  Future<UsuarioModel?> obtenerPerfilUsuario(String uid) async {
    final doc = await _firestore.collection('usuarios_globales').doc(uid).get();

    if (!doc.exists || doc.data() == null) {
      return null;
    }

    return UsuarioModel.fromMap(doc.data()!, uid);
  }

  // Wrappers compatibles: conservan Future<String?>, pero nunca omiten solicitudId.
  // Un consumidor debe confirmar una intención mediante el nuevo contrato tipado.
  Future<String?> vincularConCodigo({
    required String uid,
    required String email,
    required String nombre,
    required String codigo,
    String? fotoUrl,
    String? descripcionUsuario,
  }) async {
    final resultado = await vincularConCodigoPersistente(
      uid: uid,
      email: email,
      nombre: nombre,
      codigo: codigo,
      fotoUrl: fotoUrl,
      descripcionUsuario: descripcionUsuario,
    );
    return resultado.confirmado ? null : resultado.mensaje;
  }

  Future<ResultadoIngreso> vincularConCodigoPersistente({
    required String uid,
    required String email,
    required String nombre,
    required String codigo,
    String? fotoUrl,
    String? descripcionUsuario,
    bool confirmarNuevaIntencion = false,
  }) async {
    if (currentUser?.uid != uid) {
      return const ResultadoIngreso(
        EstadoResultadoIngreso.requiereReconciliacion,
        'Debes iniciar sesión nuevamente.',
      );
    }
    return ingreso.ingresar(TipoIngresoPendiente.vinculacion, {
      'codigo': codigo.trim().toUpperCase(),
      'nombre': nombre.trim(),
      'email': email.trim(),
      'fotoUrl': fotoUrl?.trim() ?? '',
      'descripcion': descripcionUsuario?.trim() ?? '',
    }, nuevaIntencionConfirmada: confirmarNuevaIntencion);
  }

  Future<String?> registrarNuevaIglesia({
    required String uid,
    required String email,
    required String nombreAdmin,
    required String nombreIglesia,
    required String codigoDeseado,
    required String descripcionIglesia,
    String? fotoUrlAdmin,
    String? descripcionAdmin,
  }) async {
    final resultado = await registrarNuevaIglesiaPersistente(
      uid: uid,
      email: email,
      nombreAdmin: nombreAdmin,
      nombreIglesia: nombreIglesia,
      codigoDeseado: codigoDeseado,
      descripcionIglesia: descripcionIglesia,
      fotoUrlAdmin: fotoUrlAdmin,
      descripcionAdmin: descripcionAdmin,
    );
    return resultado.confirmado ? null : resultado.mensaje;
  }

  Future<ResultadoIngreso> registrarNuevaIglesiaPersistente({
    required String uid,
    required String email,
    required String nombreAdmin,
    required String nombreIglesia,
    required String codigoDeseado,
    required String descripcionIglesia,
    String? fotoUrlAdmin,
    String? descripcionAdmin,
    bool confirmarNuevaIntencion = false,
  }) async {
    if (currentUser?.uid != uid) {
      return const ResultadoIngreso(
        EstadoResultadoIngreso.requiereReconciliacion,
        'Debes iniciar sesión nuevamente.',
      );
    }
    return ingreso.ingresar(TipoIngresoPendiente.creacionIglesia, {
      'email': email.trim(),
      'nombreAdmin': nombreAdmin.trim(),
      'nombreIglesia': nombreIglesia.trim(),
      'codigo': codigoDeseado.trim().toUpperCase(),
      'descripcionIglesia': descripcionIglesia.trim(),
      'fotoUrl': fotoUrlAdmin?.trim() ?? '',
      'descripcionAdmin': descripcionAdmin?.trim() ?? '',
    }, nuevaIntencionConfirmada: confirmarNuevaIntencion);
  }

  Future<void> cerrarSesion() async {
    if (_googleSignInNativoDisponible) {
      try {
        await _inicializarGoogleSignIn();

        await GoogleSignIn.instance.signOut();
      } catch (_) {
        // Firebase Auth igualmente se cerrará más abajo.
      }
    }

    await _auth.signOut();
  }
}
