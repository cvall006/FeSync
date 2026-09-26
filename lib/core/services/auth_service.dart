import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';

import '../models/app_models.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

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

  Future<String?> vincularConCodigo({
    required String uid,
    required String email,
    required String nombre,
    required String codigo,
    String? fotoUrl,
    String? descripcionUsuario,
  }) async {
    final query = await _firestore
        .collection('iglesias')
        .where('codigoAcceso', isEqualTo: codigo.trim().toUpperCase())
        .limit(1)
        .get();

    if (query.docs.isEmpty) {
      return 'El código ingresado no existe.';
    }

    final iglesiaId = query.docs.first.id;

    final nuevoUsuario = UsuarioModel(
      uid: uid,
      email: email,
      nombre: nombre,
      iglesiaId: iglesiaId,
      rolGlobal: 'servidor',
      fotoUrl: fotoUrl,
      descripcion: descripcionUsuario,
    );

    await _firestore
        .collection('usuarios_globales')
        .doc(uid)
        .set(nuevoUsuario.toMap());

    return null;
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
    final codigoLimpio = codigoDeseado.trim().toUpperCase();

    final check = await _firestore
        .collection('iglesias')
        .where('codigoAcceso', isEqualTo: codigoLimpio)
        .limit(1)
        .get();

    if (check.docs.isNotEmpty) {
      return 'Ese código ya está en uso.';
    }

    final nuevaIglesiaRef = _firestore.collection('iglesias').doc();

    await nuevaIglesiaRef.set({
      'nombre': nombreIglesia.trim(),
      'descripcion': descripcionIglesia.trim(),
      'codigoAcceso': codigoLimpio,
      'adminUid': uid,
      'logoUrl': '',
      'modulosActivos': {
        'servidores': true,
        'adoraLive': true,
        'agenda': true,
        'escuela': false,
        'comunidades': false,
      },
      'fechaCreacion': FieldValue.serverTimestamp(),
    });

    final adminUser = UsuarioModel(
      uid: uid,
      email: email,
      nombre: nombreAdmin,
      iglesiaId: nuevaIglesiaRef.id,
      rolGlobal: 'admin_iglesia',
      fotoUrl: fotoUrlAdmin,
      descripcion: descripcionAdmin,
    );

    await _firestore
        .collection('usuarios_globales')
        .doc(uid)
        .set(adminUser.toMap());

    return null;
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
