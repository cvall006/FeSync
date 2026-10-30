import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'finanzas_configuracion_service_test.dart'
    show FirestoreConfiguracionPrueba, SnapshotConfiguracionPrueba;

class _Db extends FirestoreConfiguracionPrueba {
  final documentos = <String, Map<String, dynamic>>{};
  final escrituras = <String>[];
  void Function(String)? alLeer;
  @override
  Future<T> runTransaction<T>(
    TransactionHandler<T> action, {
    Duration timeout = const Duration(seconds: 30),
    int maxAttempts = 5,
  }) async {
    final tx = _Tx(this);
    final result = await action(tx);
    for (final change in tx.cambios) {
      expect(change.$1, startsWith('iglesias/a/escuela_ciclos/'));
      final data = change.$2.map(
        (k, v) => MapEntry(
          k,
          v is FieldValue ? Timestamp.fromMillisecondsSinceEpoch(1000) : v,
        ),
      );
      if (change.$3) {
        documentos[change.$1] = data;
      } else {
        documentos[change.$1]!.addAll(data);
      }
      escrituras.add(change.$1);
    }
    return result;
  }
}

class _Tx implements Transaction {
  _Tx(this.db);
  final _Db db;
  final cambios = <(String, Map<String, dynamic>, bool)>[];
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
  Transaction set<T>(DocumentReference<T> ref, T data, [SetOptions? options]) {
    cambios.add((ref.path, Map<String, dynamic>.from(data as Map), true));
    return this;
  }

  @override
  Transaction update(DocumentReference ref, Map<Object, Object?> data) {
    cambios.add((ref.path, Map<String, dynamic>.from(data), false));
    return this;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Operación inesperada');
}

void main() {
  const ciclo = 'iglesias/a/escuela_ciclos/c1';
  const asignacion = '$ciclo/asignaciones/hermano';
  late _Db db;
  late EscuelaAsignacionesService service;
  String? uid;
  setUp(() {
    uid = 'lider';
    db = _Db();
    db.documentos.addAll({
      'usuarios_globales/lider': {'iglesiaId': 'a', 'rolGlobal': 'lider_area'},
      'usuarios_globales/hermano': {'iglesiaId': 'a', 'nombre': 'Hermano'},
      'iglesias/a/escuela_modulos/m1': {'titulo': 'Fundamentos'},
      'iglesias/a/escuela_modulos/m2': {'titulo': 'Evangelios'},
      ciclo: {'version': 1, 'estado': 'abierto'},
      'iglesias/a/escuela_modulos/m1/evaluaciones/hermano': {'notaFinal': '7'},
    });
    service = EscuelaAsignacionesService(
      iglesiaId: 'a',
      actorUid: 'lider',
      firestore: db,
      uidActual: () => uid,
    );
  });
  Future<void> asignar({String modulo = 'm1', int? revision}) =>
      service.asignar('c1', 'hermano', modulo, revisionEsperada: revision);
  test(
    'Asigna por UID sin pertenenciaId y no modifica evaluaciones ni perfiles',
    () async {
      await asignar();
      final a = EscuelaAsignacion.fromMap(
        'hermano',
        db.documentos[asignacion]!,
      );
      expect(a.estado, EstadoEscuela.pendiente);
      expect(a.revision, 1);
      expect(a.nombreHermano, 'Hermano');
      expect(a.tituloModulo, 'Fundamentos');
      expect(db.escrituras, [asignacion]);
      expect(
        db.documentos['iglesias/a/escuela_modulos/m1/evaluaciones/hermano'],
        {'notaFinal': '7'},
      );
    },
  );
  test(
    'Cambio de módulo reinicia estado y una revisión antigua no pisa cambios',
    () async {
      await asignar();
      await service.cambiarEstado(
        'c1',
        'hermano',
        EstadoEscuela.completado,
        revisionEsperada: 1,
      );
      await expectLater(asignar(modulo: 'm2', revision: 1), throwsStateError);
      await asignar(modulo: 'm2', revision: 2);
      expect(db.documentos[asignacion]!['moduloId'], 'm2');
      expect(db.documentos[asignacion]!['estado'], 'pendiente');
      expect(db.documentos[asignacion]!['revision'], 3);
      final historia = EscuelaAsignacion.fromMap(
        'hermano',
        db.documentos[asignacion]!,
      );
      expect(historia.historialModulos.single.moduloId, 'm1');
      expect(historia.historialModulos.single.estado, EstadoEscuela.completado);
      await expectLater(asignar(modulo: 'm2', revision: 3), throwsStateError);
    },
  );
  test(
    'Dos primeras asignaciones concurrentes no sobrescriben la existente',
    () async {
      await asignar();
      await expectLater(asignar(modulo: 'm2'), throwsStateError);
      expect(db.documentos[asignacion]!['moduloId'], 'm1');
    },
  );
  test('Cierre preserva asignación y niega futuras ediciones', () async {
    await asignar();
    final before = Map.of(db.documentos[asignacion]!);
    await service.cerrarCiclo('c1');
    await expectLater(
      service.cambiarEstado(
        'c1',
        'hermano',
        EstadoEscuela.enCurso,
        revisionEsperada: 1,
      ),
      throwsStateError,
    );
    await expectLater(asignar(modulo: 'm2', revision: 1), throwsStateError);
    await expectLater(service.cerrarCiclo('c1'), throwsStateError);
    expect(db.documentos[asignacion], before);
  });

  test('Líder no puede eliminar aunque administre asignaciones', () async {
    await expectLater(service.eliminarCiclo('c1'), throwsStateError);
    expect(db.escrituras, isEmpty);
  });
  for (final cerrado in [false, true]) {
    test(
      'Administrador elimina idempotentemente sin borrar asignaciones: cerrado=$cerrado',
      () async {
        await asignar();
        final original = Map.of(db.documentos[asignacion]!);
        db.documentos['usuarios_globales/lider']!['rolGlobal'] =
            'admin_iglesia';
        if (cerrado) db.documentos[ciclo]!['estado'] = 'cerrado';
        await service.eliminarCiclo('c1');
        final count = db.escrituras.length;
        await service.eliminarCiclo('c1');
        expect(db.escrituras.length, count);
        expect(db.documentos[ciclo]!['eliminado'], true);
        expect(db.documentos[ciclo]!['eliminadoPor'], 'lider');
        expect(db.documentos[asignacion], original);
        await expectLater(asignar(modulo: 'm2', revision: 1), throwsStateError);
        await expectLater(service.cerrarCiclo('c1'), throwsStateError);
      },
    );
  }
  for (final caso in [
    'sin-rol',
    'otra-iglesia',
    'hermano-salio',
    'modulo-inexistente',
    'sesion-cambiada',
  ]) {
    test('$caso impide escribir', () async {
      switch (caso) {
        case 'sin-rol':
          db.documentos['usuarios_globales/lider']!['rolGlobal'] = 'servidor';
        case 'otra-iglesia':
          db.documentos['usuarios_globales/lider']!['iglesiaId'] = 'b';
        case 'hermano-salio':
          db.documentos['usuarios_globales/hermano']!['iglesiaId'] = 'b';
        case 'modulo-inexistente':
          db.documentos.remove('iglesias/a/escuela_modulos/m1');
        case 'sesion-cambiada':
          db.alLeer = (_) => uid = null;
      }
      await expectLater(asignar(), throwsStateError);
      expect(db.escrituras, isEmpty);
    });
  }
  test('Sin asignación no puede guardar estado; identificadores inválidos se rechazan', () async {
    await expectLater(
      service.cambiarEstado(
        'c1',
        'hermano',
        EstadoEscuela.completado,
        revisionEsperada: 1,
      ),
      throwsStateError,
    );
    await expectLater(
      service.asignar('c1', '../otro', 'm1', revisionEsperada: null),
      throwsArgumentError,
    );
    expect(db.escrituras, isEmpty);
  });
  test('Modelos rechazan estados y esquemas desconocidos', () {
    expect(() => EstadoEscuela.leer('aprobado'), throwsFormatException);
    expect(
      () => EscuelaCiclo.fromMap('c', {
        'version': 2,
        'nombre': 'C',
        'anio': 2026,
        'estado': 'abierto',
      }),
      throwsFormatException,
    );
  });

  test(
    'Más de un cambio conserva cada registro y el cierre no los modifica',
    () async {
      await asignar();
      await service.cambiarEstado(
        'c1',
        'hermano',
        EstadoEscuela.completado,
        revisionEsperada: 1,
      );
      await asignar(modulo: 'm2', revision: 2);
      await asignar(modulo: 'm1', revision: 3);
      final a = EscuelaAsignacion.fromMap(
        'hermano',
        db.documentos[asignacion]!,
      );
      expect(a.registros.map((r) => r.moduloId), ['m1', 'm2', 'm1']);
      expect(a.registros.map((r) => r.estado), [
        EstadoEscuela.completado,
        EstadoEscuela.pendiente,
        EstadoEscuela.pendiente,
      ]);
      final antes = Map.of(db.documentos[asignacion]!);
      await service.cerrarCiclo('c1');
      expect(db.documentos[asignacion], antes);
    },
  );
  test('Asignación legacy no fabrica registros anteriores', () async {
    await asignar();
    final a = EscuelaAsignacion.fromMap('hermano', db.documentos[asignacion]!);
    expect(a.historialModulos, isEmpty);
    expect(a.registros.length, 1);
  });
  test('Al alcanzar el límite se rechaza el siguiente módulo sin truncar historial', () async {
    await asignar();
    final registro = Map<String, dynamic>.of(db.documentos[asignacion]!);
    db.documentos[asignacion]!['historialModulos'] = List.generate(
      100,
      (_) => Map<String, dynamic>.of(registro),
    );
    final escrituras = db.escrituras.length;
    await expectLater(asignar(modulo: 'm2', revision: 1), throwsStateError);
    expect(db.escrituras.length, escrituras);
    expect(
      (db.documentos[asignacion]!['historialModulos'] as List).length,
      100,
    );
  });
}
