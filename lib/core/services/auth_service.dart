import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';

import '../models/app_models.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'southamerica-west1',
  );

  static Future<void>? _googleInitialization;

  User? get currentUser => _auth.currentUser;

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  bool get _googleSignInNativoDisponible {
    if (kIsWeb) {
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

  String _mensajeFuncion(FirebaseFunctionsException error) {
    final mensaje = error.message?.trim();

    if (mensaje != null && mensaje.isNotEmpty) {
      return mensaje;
    }

    switch (error.code) {
      case 'unauthenticated':
        return 'Debes iniciar sesión.';

      case 'invalid-argument':
        return 'Los datos ingresados no son válidos.';

      case 'not-found':
        return 'No se encontró la congregación.';

      case 'already-exists':
        return 'Ese código ya está en uso.';

      case 'failed-precondition':
        return 'No fue posible completar esta operación en el estado actual de tu cuenta.';

      case 'permission-denied':
        return 'No tienes permisos para realizar esta operación.';

      case 'unavailable':
        return 'El servicio no está disponible temporalmente. Inténtalo nuevamente.';

      default:
        return 'No fue posible completar la operación.';
    }
  }

  Future<String?> vincularConCodigo({
    required String uid,
    required String email,
    required String nombre,
    required String codigo,
    String? fotoUrl,
    String? descripcionUsuario,
  }) async {
    final user = _auth.currentUser;

    if (user == null || user.uid != uid) {
      return 'Debes iniciar sesión nuevamente.';
    }

    try {
      final callable = _functions.httpsCallable('vincularUsuarioConCodigo');

      await callable.call({
        'codigo': codigo.trim().toUpperCase(),
        'nombre': nombre.trim(),
        'email': email.trim(),
        'fotoUrl': fotoUrl?.trim() ?? '',
        'descripcion': descripcionUsuario?.trim() ?? '',
      });

      return null;
    } on FirebaseFunctionsException catch (e) {
      return _mensajeFuncion(e);
    } catch (error) {
      return 'No fue posible vincular tu cuenta: $error';
    }
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
    final user = _auth.currentUser;

    if (user == null || user.uid != uid) {
      return 'Debes iniciar sesión nuevamente.';
    }

    try {
      final callable = _functions.httpsCallable('registrarNuevaIglesiaSegura');

      await callable.call({
        'email': email.trim(),
        'nombreAdmin': nombreAdmin.trim(),
        'nombreIglesia': nombreIglesia.trim(),
        'codigo': codigoDeseado.trim().toUpperCase(),
        'descripcionIglesia': descripcionIglesia.trim(),
        'fotoUrl': fotoUrlAdmin?.trim() ?? '',
        'descripcionAdmin': descripcionAdmin?.trim() ?? '',
      });

      return null;
    } on FirebaseFunctionsException catch (e) {
      return _mensajeFuncion(e);
    } catch (error) {
      return 'No fue posible crear la congregación: $error';
    }
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
