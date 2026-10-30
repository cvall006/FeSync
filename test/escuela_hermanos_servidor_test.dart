// Dobles del SDK usados exclusivamente para reproducir eventos caché/servidor.
// ignore_for_file: subtype_of_sealed_class

import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'finanzas_configuracion_service_test.dart'
    show MetadatosConfiguracionPrueba;

class _Db implements FirebaseFirestore {
  final flujo = StreamController<_Snapshot>();
  final filtros = <(Object, Object?)>[];
  bool? cambiosMetadata;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Acceso inesperado a Firestore.');

  @override
  CollectionReference<Map<String, dynamic>> collection(String path) {
    expect(path, 'usuarios_globales');
    return _Coleccion(this);
  }

  void emitir(
    Map<String, Map<String, dynamic>> perfiles, {
    required bool cache,
  }) {
    flujo.add(
      _Snapshot(
        perfiles.entries.map((e) => _Doc(e.key, e.value)).toList(),
        cache,
      ),
    );
  }
}

class _Coleccion implements CollectionReference<Map<String, dynamic>> {
  _Coleccion(this.db);
  final _Db db;
  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #where) {
      final campo = invocation.positionalArguments.single;
      final valor = invocation.namedArguments[#isEqualTo];
      db.filtros.add((campo, valor));
      expect(campo, 'iglesiaId');
      expect(valor, 'a');
      return _Query(db, valor);
    }
    throw StateError('Operación fuera del selector de hermanos.');
  }
}

class _Query implements Query<Map<String, dynamic>> {
  _Query(this.db, this.iglesia);
  final _Db db;
  final Object? iglesia;
  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    db.cambiosMetadata = includeMetadataChanges;
    expect(source, ListenSource.defaultSource);
    return db.flujo.stream.map(
      (s) => _Snapshot(
        s.docs.where((d) => d.data()['iglesiaId'] == iglesia).toList(),
        s.metadata.isFromCache,
      ),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Consulta inesperada.');
}

class _Snapshot implements QuerySnapshot<Map<String, dynamic>> {
  _Snapshot(this.docs, bool cache)
    : metadata = MetadatosConfiguracionPrueba(cache);
  @override
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;
  @override
  final SnapshotMetadata metadata;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Snapshot inesperado.');
}

class _Doc implements QueryDocumentSnapshot<Map<String, dynamic>> {
  _Doc(this.id, this.datos);
  @override
  final String id;
  final Map<String, dynamic> datos;
  @override
  Map<String, dynamic> data() => datos;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Documento inesperado.');
}

void main() {
  late _Db db;
  late EscuelaAsignacionesService service;
  setUp(() {
    db = _Db();
    service = EscuelaAsignacionesService(
      iglesiaId: 'a',
      actorUid: 'titular',
      firestore: db,
      uidActual: () => 'titular',
    );
  });
  tearDown(() => db.flujo.close());

  test('El .first del selector ignora caché con solo el titular y espera la iglesia completa', () async {
    var entregado = false;
    final resultado = service.hermanos().first.then((lista) {
      entregado = true;
      return lista;
    });
    db.emitir({
      'titular': {'iglesiaId': 'a', 'nombre': 'Titular'},
    }, cache: true);
    await Future<void>.delayed(Duration.zero);
    expect(entregado, false);
    db.emitir({
      'titular': {'iglesiaId': 'a', 'nombre': 'Titular'},
      'ana': {'iglesiaId': 'a', 'nombre': 'Ana'},
      'beto': {'iglesiaId': 'a', 'nombre': 'Beto', 'pertenenciaId': 'a' * 64},
      'externo': {'iglesiaId': 'b', 'nombre': 'Externo'},
      'salido': {'nombre': 'Sin iglesia'},
    }, cache: false);
    final lista = await resultado;
    expect(lista.map((h) => h.uid), ['ana', 'beto', 'titular']);
    expect(db.filtros, [('iglesiaId', 'a')]);
    expect(db.cambiosMetadata, true);
  });

  test('La confirmación del servidor con documentos idénticos también completa la lectura', () async {
    final resultado = service.hermanos().first;
    final perfiles = {
      'titular': {'iglesiaId': 'a', 'nombre': 'Titular'},
    };
    db.emitir(perfiles, cache: true);
    await Future<void>.delayed(Duration.zero);
    db.emitir(perfiles, cache: false);
    expect((await resultado).single.uid, 'titular');
    expect(db.cambiosMetadata, true);
  });

  test('Caché vacía no se interpreta como iglesia sin miembros', () async {
    final resultado = service.hermanos().first;
    db.emitir({}, cache: true);
    db.emitir({
      'ana': {'iglesiaId': 'a', 'nombre': 'Ana'},
    }, cache: false);
    expect((await resultado).single.uid, 'ana');
  });

  test(
    'Errores de permisos se propagan; no se usa la lista parcial de caché',
    () async {
      final resultado = service.hermanos().first;
      final comprobacion = expectLater(
        resultado,
        throwsA(isA<FirebaseException>()),
      );
      db.emitir({
        'titular': {'iglesiaId': 'a', 'nombre': 'Titular'},
      }, cache: true);
      db.flujo.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'permission-denied'),
      );
      await comprobacion;
    },
  );
}
