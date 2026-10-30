import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fesync/core/services/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'finanzas_configuracion_service_test.dart'
    show FirestoreConfiguracionPrueba, SnapshotConfiguracionPrueba;
import 'ingreso_coordinado_test.dart' show AuthIngresoPrueba;

class _Db extends FirestoreConfiguracionPrueba {
  final documentos = <String, Map<String, dynamic>>{};
  final escrituras = <(String, Map<String, dynamic>)>[];
  void Function(String)? alLeer;
  @override
  Future<T> runTransaction<T>(
    TransactionHandler<T> transactionHandler, {
    Duration timeout = const Duration(seconds: 30),
    int maxAttempts = 5,
  }) async {
    final tx = _Tx(this);
    final result = await transactionHandler(tx);
    for (final write in tx.cambios) {
      expect(write.$2.values, everyElement(isA<FieldValue>()));
      for (final key in write.$2.keys) {
        documentos[write.$1]!.remove(key);
      }
      escrituras.add(write);
    }
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
    final d = db.documentos[ref.path];
    return SnapshotConfiguracionPrueba(
      existe: d != null,
      datos: d == null ? null : Map.of(d),
    ) as DocumentSnapshot<T>;
  }

  @override
  Transaction update(DocumentReference ref, Map<Object, Object?> data) {
    cambios.add((ref.path, Map<String, dynamic>.from(data)));
    return this;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación no autorizada en prueba');
}

void main() {
  late _Db db;
  late AuthIngresoPrueba auth;
  late AuthService service;
  setUp(() {
    db = _Db();
    auth = AuthIngresoPrueba('legacy');
    db.documentos['usuarios_globales/legacy'] = {
      'iglesiaId': 'iglesia',
      'rolGlobal': 'servidor',
      'descripcion': 'aux',
      'nombre': 'Conservar',
      'tema': 'oscuro',
    };
    db.documentos['iglesias/iglesia'] = {'adminUid': 'titular'};
    service = AuthService(auth: auth, firestore: db);
  });
  tearDown(() => auth.cambios.close());
  Future<void> salir() =>
      service.salirCongregacionLegacy(uid: 'legacy', iglesiaId: 'iglesia');

  test(
    'Salida legacy transaccional modifica solo campos permitidos por reglas',
    () async {
      await salir();
      expect(db.escrituras.single.$1, 'usuarios_globales/legacy');
      expect(db.escrituras.single.$2.keys, [
        'iglesiaId',
        'rolGlobal',
        'descripcion',
      ]);
      expect(db.documentos['usuarios_globales/legacy'], {
        'nombre': 'Conservar',
        'tema': 'oscuro',
      });
    },
  );
  for (final value in [null, 'a' * 64, 'invalida']) {
    test('Nunca usa legacy si existe la clave pertenenciaId: $value', () async {
      db.documentos['usuarios_globales/legacy']!['pertenenciaId'] = value;
      await expectLater(salir(), throwsStateError);
      expect(db.escrituras, isEmpty);
    });
  }
  test('Titular, otra iglesia o sesión cambiada no escriben', () async {
    db.documentos['iglesias/iglesia']!['adminUid'] = 'legacy';
    await expectLater(salir(), throwsStateError);
    db.documentos['iglesias/iglesia']!['adminUid'] = 'titular';
    db.documentos['usuarios_globales/legacy']!['iglesiaId'] = 'otra';
    await expectLater(salir(), throwsStateError);
    db.documentos['usuarios_globales/legacy']!['iglesiaId'] = 'iglesia';
    db.alLeer = (_) => auth.cambiar('otro');
    await expectLater(salir(), throwsStateError);
    expect(db.escrituras, isEmpty);
  });
}
