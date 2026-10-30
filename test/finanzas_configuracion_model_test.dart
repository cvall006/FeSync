import 'package:fesync/modules/finanzas/finanzas_configuracion_model.dart';
import 'package:fesync/modules/finanzas/finanzas_permisos.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Configuración ausente queda deshabilitada y sin encargado', () {
    final modelo = FinanzasConfiguracionModel.fromMap(null);
    expect(modelo.existe, isFalse);
    expect(modelo.moduloHabilitado, isFalse);
    expect(modelo.encargadoUid, isNull);
  });

  test('Documento existente vacío se distingue del ausente', () {
    final modelo = FinanzasConfiguracionModel.fromMap({});
    expect(modelo.existe, isTrue);
    expect(modelo.moduloHabilitado, isFalse);
    expect(modelo.encargadoUid, isNull);
  });

  for (final habilitado in [true, false]) {
    test('Interpreta booleano $habilitado y encargado válido', () {
      final modelo = FinanzasConfiguracionModel.fromMap({
        'moduloHabilitado': habilitado,
        'encargadoUid': 'encargado',
      });
      expect(modelo.existe, isTrue);
      expect(modelo.moduloHabilitado, habilitado);
      expect(modelo.encargadoUid, 'encargado');
    });
  }

  test('Encargado opcional no impide habilitación explícita', () {
    for (final datos in [
      {'moduloHabilitado': true},
      {'moduloHabilitado': true, 'encargadoUid': null},
    ]) {
      final modelo = FinanzasConfiguracionModel.fromMap(datos);
      expect(modelo.moduloHabilitado, isTrue);
      expect(modelo.encargadoUid, isNull);
    }
  });

  test('Tipos inválidos o habilitación ausente nunca habilitan', () {
    for (final valor in [null, 'true', 'false', 1, 0, [], {}]) {
      final modelo = FinanzasConfiguracionModel.fromMap({
        'moduloHabilitado': valor,
        'encargadoUid': 'encargado',
      });
      expect(modelo.moduloHabilitado, isFalse);
      expect(modelo.encargadoUid, isNull);
    }
    expect(
      FinanzasConfiguracionModel.fromMap({'encargadoUid': 'encargado'})
          .moduloHabilitado,
      isFalse,
    );
  });

  test('Encargado inválido deshabilita y no otorga acceso', () {
    for (final uid in [
      42,
      true,
      [],
      {},
      '',
      '   ',
      '/',
      'a/b',
      '.',
      '..',
      '__reservado__',
      'a' * 129,
    ]) {
      final modelo = FinanzasConfiguracionModel.fromMap({
        'moduloHabilitado': true,
        'encargadoUid': uid,
      });
      expect(modelo.existe, isTrue);
      expect(modelo.moduloHabilitado, isFalse);
      expect(modelo.encargadoUid, isNull);
      final permisos = PermisosFinanzas(
        uidAutenticado: 'encargado',
        uidPerfil: 'encargado',
        iglesiaIdSesion: 'iglesia',
        iglesiaIdPerfil: 'iglesia',
        rolGlobal: 'servidor',
        adminUid: 'admin',
        encargadoUid: modelo.encargadoUid,
        moduloHabilitado: modelo.moduloHabilitado,
      );
      expect(permisos.puedeAcceder, isFalse);
    }
  });

  test('UID válido de 128 caracteres y Unicode conserva identidad exacta', () {
    final uid = 'á' * 128;
    final modelo = FinanzasConfiguracionModel.fromMap({
      'moduloHabilitado': true,
      'encargadoUid': uid,
    });
    expect(modelo.encargadoUid, uid);
    expect(modelo.moduloHabilitado, isTrue);
  });

  test(
    'El modelo no conserva referencias al mapa ni normaliza identidades',
    () {
      final datos = <String, dynamic>{
        'moduloHabilitado': true,
        'encargadoUid': ' encargado ',
      };
      final modelo = FinanzasConfiguracionModel.fromMap(datos);
      datos['moduloHabilitado'] = false;
      datos['encargadoUid'] = null;
      expect(modelo.moduloHabilitado, isTrue);
      expect(modelo.encargadoUid, ' encargado ');
    },
  );
}
