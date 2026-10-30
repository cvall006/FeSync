import 'package:fesync/modules/finanzas/finanzas_permisos.dart';
import 'package:flutter_test/flutter_test.dart';

PermisosFinanzas permisos({
  String? uidAutenticado = 'admin',
  String? uidPerfil = 'admin',
  String? iglesiaIdSesion = 'iglesia',
  String? iglesiaIdPerfil = 'iglesia',
  String? iglesiaIdDocumento,
  String? rolGlobal = 'admin_iglesia',
  String? adminUid = 'admin',
  String? encargadoUid = 'encargado',
  bool? moduloHabilitado = true,
}) => PermisosFinanzas(
  uidAutenticado: uidAutenticado,
  uidPerfil: uidPerfil,
  iglesiaIdSesion: iglesiaIdSesion,
  iglesiaIdPerfil: iglesiaIdPerfil,
  iglesiaIdDocumento: iglesiaIdDocumento,
  rolGlobal: rolGlobal,
  adminUid: adminUid,
  encargadoUid: encargadoUid,
  moduloHabilitado: moduloHabilitado,
);

void esperarDenegacion(PermisosFinanzas politica) {
  expect(politica.puedeAcceder, isFalse);
  expect(politica.puedeAdministrarDesignaciones, isFalse);
  expect(politica.puedeAdministrarConfiguracion, isFalse);
}

void main() {
  test('Administrador titular accede y administra designaciones', () {
    final politica = permisos();
    expect(politica.puedeAcceder, isTrue);
    expect(politica.puedeAdministrarDesignaciones, isTrue);
  });

  for (final rol in ['lider_area', 'servidor']) {
    test('Encargado con rol $rol accede sin administrar designaciones', () {
      final politica = permisos(
        uidAutenticado: 'encargado',
        uidPerfil: 'encargado',
        rolGlobal: rol,
      );
      expect(politica.puedeAcceder, isTrue);
      expect(politica.puedeAdministrarDesignaciones, isFalse);
    });

    test('$rol sin designación no accede aunque coincida con adminUid', () {
      esperarDenegacion(permisos(rolGlobal: rol));
    });
  }

  test('Administrador también designado conserva ambos permisos', () {
    final politica = permisos(encargadoUid: 'admin');
    expect(politica.puedeAcceder, isTrue);
    expect(politica.puedeAdministrarDesignaciones, isTrue);
  });

  test('Administrador anterior con rol antiguo pierde ambos permisos', () {
    esperarDenegacion(permisos(adminUid: 'nuevo-admin'));
  });

  test('Administrador anterior degradado a líder pierde ambos permisos', () {
    esperarDenegacion(
      permisos(adminUid: 'nuevo-admin', rolGlobal: 'lider_area'),
    );
  });

  test('Administrador anterior designado solo conserva acceso financiero', () {
    final politica = permisos(
      adminUid: 'nuevo-admin',
      rolGlobal: 'lider_area',
      encargadoUid: 'admin',
    );
    expect(politica.puedeAcceder, isTrue);
    expect(politica.puedeAdministrarDesignaciones, isFalse);
  });

  test('Encargado de otra iglesia no accede', () {
    esperarDenegacion(
      permisos(
        uidAutenticado: 'encargado',
        uidPerfil: 'encargado',
        rolGlobal: 'servidor',
        iglesiaIdPerfil: 'otra-iglesia',
      ),
    );
  });

  test('Administrador de otra iglesia no accede', () {
    esperarDenegacion(permisos(iglesiaIdPerfil: 'otra-iglesia'));
  });

  test('UID autenticado distinto del perfil no accede', () {
    esperarDenegacion(permisos(uidAutenticado: 'otro'));
  });

  test('Designación no permite suplantar el perfil de otra persona', () {
    esperarDenegacion(permisos(uidAutenticado: 'encargado'));
  });

  test('UIDs e iglesias se comparan exactamente, sin normalización', () {
    esperarDenegacion(permisos(uidPerfil: 'admin '));
    esperarDenegacion(permisos(iglesiaIdPerfil: 'iglesia '));
    esperarDenegacion(permisos(adminUid: ' admin'));
    esperarDenegacion(permisos(rolGlobal: 'admin_iglesia '));
    esperarDenegacion(
      permisos(
        uidAutenticado: 'encargado',
        uidPerfil: 'encargado',
        rolGlobal: 'servidor',
        encargadoUid: 'encargado ',
      ),
    );
  });

  for (final habilitado in [null, false]) {
    test(
      'Módulo $habilitado permite administrar al titular, pero no acceder',
      () {
        final administrador = permisos(moduloHabilitado: habilitado);
        expect(administrador.puedeAcceder, isFalse);
        expect(administrador.puedeAdministrarConfiguracion, isTrue);
        expect(administrador.puedeAdministrarDesignaciones, isTrue);
        esperarDenegacion(
          permisos(
            uidAutenticado: 'encargado',
            uidPerfil: 'encargado',
            rolGlobal: 'servidor',
            moduloHabilitado: habilitado,
          ),
        );
      },
    );
  }

  for (final habilitado in [null, false, true]) {
    test('Administración es exclusiva del titular con módulo $habilitado', () {
      for (final rol in ['servidor', 'lider_area', 'admin_iglesia']) {
        final encargado = permisos(
          uidAutenticado: 'encargado',
          uidPerfil: 'encargado',
          rolGlobal: rol,
          moduloHabilitado: habilitado,
        );
        expect(encargado.puedeAcceder, habilitado == true);
        expect(encargado.puedeAdministrarConfiguracion, isFalse);
        expect(encargado.puedeAdministrarDesignaciones, isFalse);
      }
      final incompletos = [
        permisos(uidAutenticado: null, moduloHabilitado: habilitado),
        permisos(uidPerfil: null, moduloHabilitado: habilitado),
        permisos(iglesiaIdSesion: null, moduloHabilitado: habilitado),
        permisos(iglesiaIdPerfil: null, moduloHabilitado: habilitado),
        permisos(adminUid: null, moduloHabilitado: habilitado),
        permisos(rolGlobal: null, moduloHabilitado: habilitado),
        permisos(adminUid: 'nuevo-admin', moduloHabilitado: habilitado),
        permisos(iglesiaIdPerfil: 'otra', moduloHabilitado: habilitado),
        permisos(rolGlobal: 'servidor', moduloHabilitado: habilitado),
        permisos(rolGlobal: 'lider_area', moduloHabilitado: habilitado),
      ];
      for (final politica in incompletos) {
        esperarDenegacion(politica);
      }
      final administrador = permisos(moduloHabilitado: habilitado);
      expect(administrador.puedeAcceder, habilitado == true);
      expect(administrador.puedeAdministrarConfiguracion, isTrue);
      expect(administrador.puedeAdministrarDesignaciones, isTrue);
    });
  }

  test(
    'Documento de iglesia debe corresponder a la sesión cuando se aporta',
    () {
      for (final id in ['', '   ', 'otra', '/', '.', '..', '__reservado__']) {
        esperarDenegacion(permisos(iglesiaIdDocumento: id));
      }
      expect(
        permisos(iglesiaIdDocumento: 'iglesia').puedeAdministrarConfiguracion,
        isTrue,
      );
      expect(permisos().puedeAdministrarConfiguracion, isTrue);
    },
  );

  test(
    'Identificadores malformados deniegan incluso si coinciden entre sí',
    () {
      for (final id in ['a/b', '.', '..', '__reservado__', 'a' * 129]) {
        esperarDenegacion(
          permisos(
            uidAutenticado: id,
            uidPerfil: id,
            adminUid: id,
            encargadoUid: id,
          ),
        );
        esperarDenegacion(
          permisos(
            uidAutenticado: id,
            uidPerfil: id,
            encargadoUid: id,
            rolGlobal: 'servidor',
          ),
        );
      }
      for (final id in [
        'a/b',
        '.',
        '..',
        '__reservado__',
        'a' * 1501,
        'é' * 751,
      ]) {
        esperarDenegacion(
          permisos(
            iglesiaIdSesion: id,
            iglesiaIdPerfil: id,
            iglesiaIdDocumento: id,
          ),
        );
      }
      for (final rol in ['desconocido', 'admin_iglesia ']) {
        esperarDenegacion(permisos(rolGlobal: rol, encargadoUid: 'admin'));
      }
    },
  );

  for (final vacio in [null, '', '   ']) {
    test('Datos obligatorios incompletos ($vacio) deniegan ambos permisos', () {
      final incompletos = [
        permisos(uidAutenticado: vacio),
        permisos(uidPerfil: vacio),
        permisos(iglesiaIdSesion: vacio),
        permisos(iglesiaIdPerfil: vacio),
        permisos(rolGlobal: vacio),
        permisos(adminUid: vacio),
        permisos(uidAutenticado: vacio, uidPerfil: vacio, adminUid: vacio),
        permisos(iglesiaIdSesion: vacio, iglesiaIdPerfil: vacio),
        permisos(
          uidAutenticado: 'encargado',
          uidPerfil: 'encargado',
          rolGlobal: vacio,
        ),
        permisos(
          uidAutenticado: 'encargado',
          uidPerfil: 'encargado',
          rolGlobal: 'servidor',
          adminUid: vacio,
        ),
      ];
      for (final politica in incompletos) {
        esperarDenegacion(politica);
      }
    });

    test('Sin designación ($vacio), solo el administrador titular accede', () {
      final administrador = permisos(encargadoUid: vacio);
      expect(administrador.puedeAcceder, isTrue);
      expect(administrador.puedeAdministrarDesignaciones, isTrue);
      esperarDenegacion(
        permisos(
          uidAutenticado: 'encargado',
          uidPerfil: 'encargado',
          rolGlobal: 'servidor',
          encargadoUid: vacio,
        ),
      );
    });
  }
}
