import 'package:cloud_firestore/cloud_firestore.dart';

/// Compatibilidad exclusiva con perfiles sin la clave pertenenciaId. Las
/// reglas remotas siguen siendo la autoridad; nunca escribe generaciones.
class MiembrosLegacyService {
  MiembrosLegacyService({required this.firestore, required this.uidActual});
  final FirebaseFirestore firestore;
  final String? Function() uidActual;

  Future<void> actualizar({
    required String iglesiaId,
    required String uidObjetivo,
    required String rolEsperado,
    String? nuevoRol,
    String? descripcion,
    bool expulsar = false,
  }) async {
    final actor = uidActual();
    const roles = ['servidor', 'lider_area'];
    if (actor == null ||
        actor == uidObjetivo ||
        iglesiaId.isEmpty ||
        !roles.contains(rolEsperado) ||
        (nuevoRol != null && !roles.contains(nuevoRol)) ||
        (expulsar && (nuevoRol != null || descripcion != null))) {
      throw StateError('Operación de miembro no válida.');
    }
    final perfiles = firestore.collection('usuarios_globales');
    await firestore.runTransaction((tx) async {
      final admin = (await tx.get(perfiles.doc(actor))).data();
      final iglesia = (await tx.get(
        firestore.collection('iglesias').doc(iglesiaId),
      )).data();
      final objetivo = perfiles.doc(uidObjetivo);
      final miembro = (await tx.get(objetivo)).data();
      if (uidActual() != actor ||
          admin?['iglesiaId'] != iglesiaId ||
          admin?['rolGlobal'] != 'admin_iglesia' ||
          iglesia?['adminUid'] != actor ||
          iglesia?['adminUid'] == uidObjetivo ||
          miembro == null ||
          miembro.containsKey('pertenenciaId') ||
          miembro['iglesiaId'] != iglesiaId ||
          miembro['rolGlobal'] != rolEsperado) {
        throw StateError(
          'La administración o pertenencia cambió. Revisa de nuevo.',
        );
      }
      tx.update(
        objetivo,
        expulsar
            ? {
                'iglesiaId': FieldValue.delete(),
                'rolGlobal': FieldValue.delete(),
                'descripcion': FieldValue.delete(),
              }
            : {'rolGlobal': ?nuevoRol, 'descripcion': ?descripcion},
      );
    });
  }
}
