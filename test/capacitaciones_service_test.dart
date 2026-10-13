import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_service.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_models.dart';

import 'capacitaciones_2_test.dart' show usuarioCapacitacion;

class DbPrueba implements FirebaseFirestore {
  final List<String> eventos;
  bool falla = false;
  DbPrueba(this.eventos);
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      ColeccionPrueba(this, path);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// Dobles locales para verificar el orden de operaciones del SDK.
// ignore: subtype_of_sealed_class
class ColeccionPrueba implements CollectionReference<Map<String, dynamic>> {
  final DbPrueba db;
  @override
  final String path;
  ColeccionPrueba(this.db, this.path);
  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) =>
      DocumentoPrueba(db, '${this.path}/${path ?? 'nuevo'}');
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class DocumentoPrueba implements DocumentReference<Map<String, dynamic>> {
  final DbPrueba db;
  @override
  final String path;
  DocumentoPrueba(this.db, this.path);
  @override
  String get id => path.split('/').last;
  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      ColeccionPrueba(db, '${this.path}/$path');
  @override
  Future<void> set(Map<String, dynamic> data, [SetOptions? options]) async {
    db.eventos.add('guardar:$path');
    if (db.falla) throw StateError('fallo Firestore');
  }

  @override
  Future<void> delete() async {
    db.eventos.add('borrarDocumento:$path');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class StoragePrueba implements FirebaseStorage {
  final List<String> eventos;
  bool fallaUpload = false;
  bool fallaDelete = false;
  StoragePrueba(this.eventos);
  @override
  Reference ref([String? path]) => ReferenciaPrueba(this, path ?? '');
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ReferenciaPrueba implements Reference {
  final StoragePrueba store;
  @override
  final String fullPath;
  ReferenciaPrueba(this.store, this.fullPath);
  @override
  String get bucket => 'bucket';
  @override
  UploadTask putData(Uint8List data, [SettableMetadata? metadata]) {
    store.eventos.add('subir:$fullPath');
    return UploadPrueba(store.fallaUpload);
  }

  @override
  Future<void> delete() async {
    store.eventos.add('borrarArchivo:$fullPath');
    if (store.fallaDelete) {
      throw FirebaseException(plugin: 'storage', code: 'unauthorized');
    }
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class SnapshotPrueba implements TaskSnapshot {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class UploadPrueba implements UploadTask {
  final bool falla;
  UploadPrueba(this.falla);
  @override
  Stream<TaskSnapshot> get snapshotEvents => const Stream.empty();
  @override
  Future<bool> cancel() async => true;
  @override
  Future<R> then<R>(
    FutureOr<R> Function(TaskSnapshot) onValue, {
    Function? onError,
  }) =>
      (falla
              ? Future<TaskSnapshot>.error(StateError('upload'))
              : Future<TaskSnapshot>.value(SnapshotPrueba()))
          .then(onValue, onError: onError);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const antiguo = CapacitacionModel(
  id: 'c',
  titulo: 'Material',
  descripcion: '',
  contenido: '',
  linkVideo: '',
  tipo: 'archivo',
  tipoContenido: 'archivo',
  fechaCreacion: null,
  archivoUrl: 'gs://bucket/capacitaciones/iglesia/general/c/viejo.pdf',
);
final pdf = Uint8List.fromList('%PDF-1.4\n'.codeUnits);

void main() {
  test(
    'Reemplazo guarda nuevo upload y documento antes de borrar el anterior',
    () async {
      final eventos = <String>[];
      final service = CapacitacionesService(
        usuarioCapacitacion('lider_area'),
        firestore: DbPrueba(eventos),
        firebaseStorage: StoragePrueba(eventos),
      );
      await service.guardarContenido(
        antiguo,
        anterior: antiguo,
        bytes: pdf,
        nombreArchivo: 'nuevo.pdf',
      );
      expect(eventos[0], startsWith('subir:capacitaciones/iglesia/general/c/'));
      expect(eventos[1], 'guardar:iglesias/iglesia/capacitaciones/c');
      expect(
        eventos[2],
        'borrarArchivo:capacitaciones/iglesia/general/c/viejo.pdf',
      );
    },
  );
  test(
    'Si Firestore falla limpia solo el nuevo upload y conserva el antiguo',
    () async {
      final eventos = <String>[];
      final db = DbPrueba(eventos)..falla = true;
      final service = CapacitacionesService(
        usuarioCapacitacion('admin_iglesia'),
        firestore: db,
        firebaseStorage: StoragePrueba(eventos),
      );
      await expectLater(
        service.guardarContenido(
          antiguo,
          anterior: antiguo,
          bytes: pdf,
          nombreArchivo: 'nuevo.pdf',
        ),
        throwsStateError,
      );
      expect(eventos.last, contains('nuevo.pdf'));
      expect(
        eventos.any(
          (e) =>
              e == 'borrarArchivo:capacitaciones/iglesia/general/c/viejo.pdf',
        ),
        false,
      );
    },
  );
  test('Fallo de limpieza posterior informa éxito con pendiente, no repite escritura', () async {
    final eventos = <String>[];
    final service = CapacitacionesService(
      usuarioCapacitacion('admin_iglesia'),
      firestore: DbPrueba(eventos),
      firebaseStorage: StoragePrueba(eventos)..fallaDelete = true,
    );
    final aviso = await service.guardarContenido(
      antiguo,
      anterior: antiguo,
      bytes: pdf,
      nombreArchivo: 'nuevo.pdf',
    );
    expect(aviso, contains('guardado'));
    expect(eventos.where((e) => e.startsWith('guardar:')), hasLength(1));
  });
  test('Borrado no elimina archivos de otro tenant/documento', () async {
    final eventos = <String>[];
    final service = CapacitacionesService(
      usuarioCapacitacion('admin_iglesia'),
      firestore: DbPrueba(eventos),
      firebaseStorage: StoragePrueba(eventos),
    );
    final otro = CapacitacionModel.fromMap({
      ...antiguo.toMap(),
      'archivoUrl': 'gs://bucket/capacitaciones/otra/general/c/a.pdf',
    }, 'c');
    await expectLater(service.eliminarContenido(otro), throwsFormatException);
    expect(eventos, isEmpty);
    await service.eliminarContenido(antiguo);
    expect(eventos, [
      'borrarDocumento:iglesias/iglesia/capacitaciones/c',
      'borrarArchivo:capacitaciones/iglesia/general/c/viejo.pdf',
    ]);
  });
  test('Miembro no puede guardar ni eliminar contenidos', () async {
    final eventos = <String>[];
    final service = CapacitacionesService(
      usuarioCapacitacion('servidor'),
      firestore: DbPrueba(eventos),
      firebaseStorage: StoragePrueba(eventos),
    );
    await expectLater(service.guardarContenido(antiguo), throwsStateError);
    await expectLater(service.eliminarContenido(antiguo), throwsStateError);
    expect(eventos, isEmpty);
  });
}
