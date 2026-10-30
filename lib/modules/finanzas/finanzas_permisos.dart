import 'dart:convert';

/// Política de presentación; Cloud Functions y reglas son la autoridad.
class PermisosFinanzas {
  final String? uidAutenticado;
  final String? uidPerfil;
  final String? iglesiaIdSesion;
  final String? iglesiaIdPerfil;
  final String? iglesiaIdDocumento;
  final String? rolGlobal;
  final String? adminUid;
  final String? encargadoUid;
  final bool? moduloHabilitado;

  const PermisosFinanzas({
    required this.uidAutenticado,
    required this.uidPerfil,
    required this.iglesiaIdSesion,
    required this.iglesiaIdPerfil,
    required this.rolGlobal,
    required this.adminUid,
    required this.encargadoUid,
    required this.moduloHabilitado,
    this.iglesiaIdDocumento,
  });

  bool get _contextoValido =>
      _uidValido(uidAutenticado) &&
      _uidValido(uidPerfil) &&
      _uidValido(adminUid) &&
      _idDocumentoValido(iglesiaIdSesion) &&
      _idDocumentoValido(iglesiaIdPerfil) &&
      const ['admin_iglesia', 'lider_area', 'servidor'].contains(rolGlobal) &&
      uidAutenticado == uidPerfil &&
      iglesiaIdSesion == iglesiaIdPerfil &&
      // Opcional para conservar compatibilidad con quienes no reciben iglesia.
      (iglesiaIdDocumento == null ||
          (_idDocumentoValido(iglesiaIdDocumento) &&
              iglesiaIdDocumento == iglesiaIdSesion));

  bool get _esAdministradorTitular =>
      rolGlobal == 'admin_iglesia' && uidAutenticado == adminUid;

  /// Sin encargado designado, únicamente el administrador titular accede.
  bool get puedeAcceder =>
      moduloHabilitado == true &&
      _contextoValido &&
      (_esAdministradorTitular ||
          (_uidValido(encargadoUid) && uidAutenticado == encargadoUid));

  /// Configurar y designar no requiere habilitar antes el módulo.
  bool get puedeAdministrarConfiguracion =>
      _contextoValido && _esAdministradorTitular;

  /// Alias compatible de la política administrativa única.
  bool get puedeAdministrarDesignaciones => puedeAdministrarConfiguracion;

  static bool _uidValido(String? valor) =>
      _idDocumentoValido(valor) && valor!.length <= 128;

  static bool _idDocumentoValido(String? valor) =>
      valor != null &&
      valor.trim().isNotEmpty &&
      utf8.encode(valor).length <= 1500 &&
      !valor.contains('/') &&
      valor != '.' &&
      valor != '..' &&
      !RegExp(r'^__.*__$', dotAll: true).hasMatch(valor);
}
