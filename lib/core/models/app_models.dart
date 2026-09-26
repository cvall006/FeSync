class UsuarioModel {
  final String uid;
  final String email;
  final String nombre;
  final String iglesiaId;
  final String rolGlobal;
  final String? fotoUrl;
  final String? descripcion;

  UsuarioModel({
    required this.uid,
    required this.email,
    required this.nombre,
    required this.iglesiaId,
    required this.rolGlobal,
    this.fotoUrl,
    this.descripcion,
  });

  factory UsuarioModel.fromMap(Map<String, dynamic> map, String docId) {
    return UsuarioModel(
      uid: docId,
      email: map['email'] ?? '',
      nombre: map['nombre'] ?? '',
      iglesiaId: map['iglesiaId'] ?? '',
      rolGlobal: map['rolGlobal'] ?? 'servidor',
      fotoUrl: map['fotoUrl'],
      descripcion: map['descripcion'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'nombre': nombre,
      'iglesiaId': iglesiaId,
      'rolGlobal': rolGlobal,
      'fotoUrl': fotoUrl,
      'descripcion': descripcion,
    };
  }
}

class IglesiaModel {
  final String id;
  final String nombre;
  final String codigoAcceso;
  final String adminUid;
  final String? logoUrl;
  final String? descripcion;

  IglesiaModel({
    required this.id,
    required this.nombre,
    required this.codigoAcceso,
    required this.adminUid,
    this.logoUrl,
    this.descripcion,
  });

  factory IglesiaModel.fromMap(Map<String, dynamic> map, String docId) {
    return IglesiaModel(
      id: docId,
      nombre: map['nombre'] ?? '',
      codigoAcceso: map['codigoAcceso'] ?? '',
      adminUid: map['adminUid'] ?? '',
      logoUrl: map['logoUrl'],
      descripcion: map['descripcion'],
    );
  }
}