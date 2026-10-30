import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fesync/core/services/miembros_legacy_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'finanzas_configuracion_service_test.dart'
    show FirestoreConfiguracionPrueba, SnapshotConfiguracionPrueba;

class _Db extends FirestoreConfiguracionPrueba {
  final documentos = <String, Map<String, dynamic>>{};
  final escrituras = <(String, Map<String, dynamic>)>[];
  void Function(String)? alLeer;
  @override
  Future<T> runTransaction<T>(
    TransactionHandler<T> action, {
    Duration timeout = const Duration(seconds: 30),
    int maxAttempts = 5,
  }) async {
    final tx = _Tx(this);
    final result = await action(tx);
    escrituras.addAll(tx.cambios);
    return result;
  }
}

class _Tx implements Transaction {
  _Tx(this.db);
  final _Db db;
  final cambios = <(String, Map<String, dynamic>)>[];
  @override
  Future<DocumentSnapshot<T>> get<T extends Object?>(
    DocumentReference<T> ref,
  ) async {
    db.alLeer?.call(ref.path);
    final data = db.documentos[ref.path];
    return SnapshotConfiguracionPrueba(
      existe: data != null,
      datos: data == null ? null : Map.of(data),
    ) as DocumentSnapshot<T>;
  }

  @override
  Transaction update(DocumentReference ref, Map<Object, Object?> data) {
    cambios.add((ref.path, Map<String, dynamic>.from(data)));
    return this;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación inesperada');
}

void main() {
  late _Db db;
  late MiembrosLegacyService service;
  String? actor;
  setUp(() {
    db = _Db();
    actor = 'titular';
    db.documentos.addAll({
      'usuarios_globales/titular': {
        'iglesiaId': 'iglesia',
        'rolGlobal': 'admin_iglesia',
        'pertenenciaId': 'a' * 64,
      },
      'iglesias/iglesia': {'adminUid': 'titular'},
      'usuarios_globales/miembro': {
        'iglesiaId': 'iglesia',
        'rolGlobal': 'servidor',
        'nombre': 'Conservar',
      },
    });
    service = MiembrosLegacyService(firestore: db, uidActual: () => actor);
  });
  Future<void> cambiar({bool expulsar = false}) => service.actualizar(
    iglesiaId: 'iglesia',
    uidObjetivo: 'miembro',
    rolEsperado: 'servidor',
    expulsar: expulsar,
    nuevoRol: expulsar ? null : 'lider_area',
    descripcion: expulsar ? null : 'Descripción',
  );

  test(
    'Rol y descripción cambian solo campos permitidos del miembro',
    () async {
      await cambiar();
      expect(db.escrituras.single.$1, 'usuarios_globales/miembro');
      expect(db.escrituras.single.$2, {
        'rolGlobal': 'lider_area',
        'descripcion': 'Descripción',
      });
      expect(
        db.documentos['usuarios_globales/titular']!['pertenenciaId'],
        'a' * 64,
      );
    },
  );
  test(
    'Expulsión elimina solo pertenencia legacy, rol y descripción',
    () async {
      await cambiar(expulsar: true);
      expect(db.escrituras.single.$2.keys.toSet(), {
        'iglesiaId',
        'rolGlobal',
        'descripcion',
      });
      expect(db.escrituras.single.$2.values, everyElement(isA<FieldValue>()));
    },
  );
  for (final periodo in [null, 'a' * 64, 'invalido']) {
    test(
      'Clave presente $periodo no permite rol ni expulsión legacy',
      () async {
        db.documentos['usuarios_globales/miembro']!['pertenenciaId'] = periodo;
        await expectLater(cambiar(), throwsStateError);
        await expectLater(cambiar(expulsar: true), throwsStateError);
        expect(db.escrituras, isEmpty);
      },
    );
  }
  for (final caso in [
    'otra-iglesia',
    'titularidad',
    'rol-actor',
    'rol-objetivo',
    'sesion',
    'migracion-concurrente',
  ]) {
    test('Revalida $caso transaccionalmente sin escribir', () async {
      switch (caso) {
        case 'otra-iglesia':
          db.documentos['usuarios_globales/miembro']!['iglesiaId'] = 'otra';
        case 'titularidad':
          db.documentos['iglesias/iglesia']!['adminUid'] = 'otro';
        case 'rol-actor':
          db.documentos['usuarios_globales/titular']!['rolGlobal'] = 'servidor';
        case 'rol-objetivo':
          db.documentos['usuarios_globales/miembro']!['rolGlobal'] =
              'lider_area';
        case 'sesion':
          db.alLeer = (_) => actor = null;
        case 'migracion-concurrente':
          db.alLeer = (path) {
            if (path == 'usuarios_globales/miembro') {
              db.documentos[path]!['pertenenciaId'] = 'b' * 64;
            }
          };
      }
      await expectLater(cambiar(), throwsStateError);
      expect(db.escrituras, isEmpty);
    });
  }
  test('No permite autopromoción ni roles administrativos', () async {
    await expectLater(
      service.actualizar(
        iglesiaId: 'iglesia',
        uidObjetivo: 'titular',
        rolEsperado: 'servidor',
        nuevoRol: 'lider_area',
      ),
      throwsStateError,
    );
    await expectLater(
      service.actualizar(
        iglesiaId: 'iglesia',
        uidObjetivo: 'miembro',
        rolEsperado: 'servidor',
        nuevoRol: 'admin_iglesia',
      ),
      throwsStateError,
    );
    expect(db.escrituras, isEmpty);
  });
}
