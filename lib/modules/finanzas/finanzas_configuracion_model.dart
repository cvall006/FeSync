/// Estado local de configuración; no sustituye la política ni las reglas.
class FinanzasConfiguracionModel {
  final bool existe;
  final bool moduloHabilitado;
  final String? encargadoUid;

  const FinanzasConfiguracionModel._({
    required this.existe,
    required this.moduloHabilitado,
    required this.encargadoUid,
  });

  const FinanzasConfiguracionModel.ausente()
    : existe = false,
      moduloHabilitado = false,
      encargadoUid = null;

  factory FinanzasConfiguracionModel.fromMap(Map<String, dynamic>? datos) {
    if (datos == null) return const FinanzasConfiguracionModel.ausente();

    final habilitado = datos['moduloHabilitado'];
    final encargado = datos['encargadoUid'];
    final valido =
        habilitado is bool &&
        (encargado == null ||
            (encargado is String && esEncargadoUidValido(encargado)));

    return FinanzasConfiguracionModel._(
      existe: true,
      moduloHabilitado: valido && habilitado == true,
      encargadoUid: valido ? encargado as String? : null,
    );
  }

  /// Conserva la identidad exacta; no recorta ni normaliza UIDs.
  static bool esEncargadoUidValido(String uid) =>
      uid.trim().isNotEmpty &&
      uid.length <= 128 &&
      !uid.contains('/') &&
      uid != '.' &&
      uid != '..' &&
      !RegExp(r'^__.*__$', dotAll: true).hasMatch(uid);
}
