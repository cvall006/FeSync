import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_model.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_service.dart';
import 'package:flutter_test/flutter_test.dart';

class FirestoreConfiguracionPrueba implements FirebaseFirestore {
  final lecturas = <String>[];
  final observaciones = <String>[];
  final inesperados = <Symbol>[];
  DocumentSnapshot<Map<String, dynamic>> snapshot = SnapshotConfiguracionPrueba(
    existe: false,
  );
  Object? error;
  Stream<DocumentSnapshot<Map<String, dynamic>>>? flujo;
  GetOptions? opciones;
  bool? incluyeMetadatos;

  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      ColeccionConfiguracionPrueba(this, path);

  @override
  dynamic noSuchMethod(Invocation invocation) {
    inesperados.add(invocation.memberName);
    throw StateError('Operación Firestore inesperada.');
  }
}

// ignore: subtype_of_sealed_class
class ColeccionConfiguracionPrueba
    implements CollectionReference<Map<String, dynamic>> {
  final FirestoreConfiguracionPrueba db;
  @override
  final String path;
  ColeccionConfiguracionPrueba(this.db, this.path);

  @override
  DocumentReference<Map<String, dynamic>> doc([String? path]) =>
      DocumentoConfiguracionPrueba(db, '${this.path}/$path');

  @override
  dynamic noSuchMethod(Invocation invocation) => db.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class DocumentoConfiguracionPrueba
    implements DocumentReference<Map<String, dynamic>> {
  final FirestoreConfiguracionPrueba db;
  @override
  final String path;
  DocumentoConfiguracionPrueba(this.db, this.path);

  @override
  CollectionReference<Map<String, dynamic>> collection(String path) =>
      ColeccionConfiguracionPrueba(db, '${this.path}/$path');

  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([
    GetOptions? options,
  ]) async {
    db.lecturas.add(path);
    db.opciones = options;
    if (db.error != null) throw db.error!;
    return db.snapshot;
  }

  @override
  Stream<DocumentSnapshot<Map<String, dynamic>>> snapshots({
    bool includeMetadataChanges = false,
    ListenSource source = ListenSource.defaultSource,
  }) {
    db.observaciones.add(path);
    db.incluyeMetadatos = includeMetadataChanges;
    return db.flujo ?? Stream.value(db.snapshot);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => db.noSuchMethod(invocation);
}

// ignore: subtype_of_sealed_class
class SnapshotConfiguracionPrueba
    implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  final bool exists;
  final Map<String, dynamic>? datos;
  final bool desdeCache;
  SnapshotConfiguracionPrueba({
    required bool existe,
    this.datos,
    this.desdeCache = false,
  }) : exists = existe;

  @override
  SnapshotMetadata get metadata => MetadatosConfiguracionPrueba(desdeCache);

  @override
  Map<String, dynamic>? data() => datos;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MetadatosConfiguracionPrueba implements SnapshotMetadata {
  @override
  final bool isFromCache;
  MetadatosConfiguracionPrueba(this.isFromCache);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FunctionsConfiguracionPrueba implements FirebaseFunctions {
  final llamadas = <({String nombre, Object? parametros})>[];
  Object? error;

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      CallableConfiguracionPrueba(this, name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class CallableConfiguracionPrueba implements HttpsCallable {
  final FunctionsConfiguracionPrueba functions;
  final String nombre;
  CallableConfiguracionPrueba(this.functions, this.nombre);

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    functions.llamadas.add((nombre: nombre, parametros: parameters));
    if (functions.error != null) throw functions.error!;
    return ResultadoConfiguracionPrueba<T>();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ResultadoConfiguracionPrueba<T> implements HttpsCallableResult<T> {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late FirestoreConfiguracionPrueba db;
  late FunctionsConfiguracionPrueba functions;
  late FinanzasConfiguracionService servicio;
  late List<String> regiones;

  setUp(() {
    db = FirestoreConfiguracionPrueba();
    functions = FunctionsConfiguracionPrueba();
    regiones = [];
    servicio = FinanzasConfiguracionService(
      firestore: db,
      functionsPorRegion: (region) {
        regiones.add(region);
        return functions;
      },
    );
  });

  tearDown(() {
    expect(db.inesperados, isEmpty, reason: 'No se permiten escrituras SDK.');
  });

  test(
    'Documento ausente devuelve estado seguro y consulta la ruta exacta',
    () async {
      final modelo = await servicio.obtenerConfiguracion('iglesia');
      expect(modelo.existe, isFalse);
      expect(modelo.moduloHabilitado, isFalse);
      expect(modelo.encargadoUid, isNull);
      expect(db.lecturas, ['iglesias/iglesia/finanzas_config/acceso']);
      expect(db.opciones?.source, Source.server);
      expect(regiones, isEmpty);
    },
  );

  test('Lectura válida aplica el modelo y no llama a Functions', () async {
    db.snapshot = SnapshotConfiguracionPrueba(
      existe: true,
      datos: {'moduloHabilitado': true, 'encargadoUid': 'encargado'},
    );
    final modelo = await servicio.obtenerConfiguracion('iglesia');
    expect(modelo.existe, isTrue);
    expect(modelo.moduloHabilitado, isTrue);
    expect(modelo.encargadoUid, 'encargado');
    expect(functions.llamadas, isEmpty);
  });

  test(
    'Documento existente con datos malformados no se confunde con ausente',
    () async {
      db.snapshot = SnapshotConfiguracionPrueba(
        existe: true,
        datos: {'moduloHabilitado': 'true', 'encargadoUid': 42},
      );
      final modelo = await servicio.obtenerConfiguracion('iglesia');
      expect(modelo.existe, isTrue);
      expect(modelo.moduloHabilitado, isFalse);
      db.snapshot = SnapshotConfiguracionPrueba(existe: true);
      await expectLater(
        servicio.obtenerConfiguracion('iglesia'),
        throwsFormatException,
      );
    },
  );

  for (final codigo in ['permission-denied', 'unavailable', 'unknown']) {
    test(
      'Lectura propaga $codigo sin devolver configuración ausente',
      () async {
        final error = FirebaseException(
          plugin: 'cloud_firestore',
          code: codigo,
        );
        db.error = error;
        await expectLater(
          servicio.obtenerConfiguracion('iglesia'),
          throwsA(same(error)),
        );
      },
    );

    test('Observación propaga $codigo sin emitir estado falso', () async {
      final error = FirebaseException(plugin: 'cloud_firestore', code: codigo);
      db.flujo = Stream.error(error);
      await expectLater(
        servicio.observarConfiguracion('iglesia'),
        emitsInOrder([emitsError(same(error)), emitsDone]),
      );
    });

    test('Callable conserva el error $codigo', () async {
      final error = FirebaseFunctionsException(
        code: codigo,
        message: 'Error de prueba.',
        details: null,
      );
      functions.error = error;
      await expectLater(
        servicio.designarEncargado('iglesia', 'encargado'),
        throwsA(same(error)),
      );
      await expectLater(
        servicio.revocarEncargado('iglesia'),
        throwsA(same(error)),
      );
      await expectLater(
        servicio.actualizarEstadoModulo('iglesia', true),
        throwsA(same(error)),
      );
    });
  }

  test(
    'Observa ausencia, configuración, error y recuperación en la misma ruta',
    () async {
      final controlador =
          StreamController<DocumentSnapshot<Map<String, dynamic>>>();
      db.flujo = controlador.stream;
      final error = FirebaseException(
        plugin: 'cloud_firestore',
        code: 'unavailable',
      );
      final comprobacion = expectLater(
        servicio.observarConfiguracion('iglesia'),
        emitsInOrder([
          predicate<FinanzasConfiguracionModel>(
            (m) => !m.existe && !m.moduloHabilitado && m.encargadoUid == null,
          ),
          predicate<FinanzasConfiguracionModel>(
            (m) =>
                m.existe && m.moduloHabilitado && m.encargadoUid == 'encargado',
          ),
          emitsError(same(error)),
          predicate<FinanzasConfiguracionModel>(
            (m) => m.existe && !m.moduloHabilitado,
          ),
          emitsDone,
        ]),
      );
      controlador.add(SnapshotConfiguracionPrueba(existe: false));
      controlador.add(
        SnapshotConfiguracionPrueba(
          existe: true,
          datos: {'moduloHabilitado': true, 'encargadoUid': 'encargado'},
        ),
      );
      controlador.addError(error);
      controlador.add(
        SnapshotConfiguracionPrueba(
          existe: true,
          datos: {'moduloHabilitado': false},
        ),
      );
      await controlador.close();
      await comprobacion;
      expect(db.observaciones, ['iglesias/iglesia/finanzas_config/acceso']);
    },
  );

  test('Callables envían parámetros exactos y usan una instancia de la región correcta', () async {
    await servicio.designarEncargado('iglesia', 'encargado');
    await servicio.revocarEncargado('iglesia');
    await servicio.actualizarEstadoModulo('iglesia', true);
    await servicio.actualizarEstadoModulo('iglesia', false);
    expect(regiones, ['southamerica-west1']);
    expect(functions.llamadas.map((llamada) => llamada.nombre), [
      'actualizarEncargadoFinanciero',
      'actualizarEncargadoFinanciero',
      'actualizarEstadoModuloFinanzas',
      'actualizarEstadoModuloFinanzas',
    ]);
    expect(functions.llamadas.map((llamada) => llamada.parametros), [
      {
        'iglesiaId': 'iglesia',
        'accion': 'designar',
        'encargadoUid': 'encargado',
      },
      {'iglesiaId': 'iglesia', 'accion': 'revocar', 'encargadoUid': null},
      {'iglesiaId': 'iglesia', 'habilitado': true},
      {'iglesiaId': 'iglesia', 'habilitado': false},
    ]);
    expect(db.lecturas, isEmpty);
    expect(db.observaciones, isEmpty);
  });

  test('Iglesias inválidas fallan antes de acceder al SDK', () async {
    for (final iglesia in [
      '',
      '   ',
      '/',
      'a/b',
      '.',
      '..',
      '__reservado__',
      'a' * 1501,
      'é' * 751,
    ]) {
      await expectLater(
        servicio.obtenerConfiguracion(iglesia),
        throwsArgumentError,
      );
      expect(
        () => servicio.observarConfiguracion(iglesia),
        throwsArgumentError,
      );
      await expectLater(
        servicio.designarEncargado(iglesia, 'encargado'),
        throwsArgumentError,
      );
      await expectLater(
        servicio.revocarEncargado(iglesia),
        throwsArgumentError,
      );
      await expectLater(
        servicio.actualizarEstadoModulo(iglesia, true),
        throwsArgumentError,
      );
    }
    expect(db.lecturas, isEmpty);
    expect(db.observaciones, isEmpty);
    expect(regiones, isEmpty);
  });

  test('UID inválido no llama al backend', () async {
    for (final uid in [
      '',
      '   ',
      '/',
      'a/b',
      '.',
      '..',
      '__reservado__',
      'a' * 129,
    ]) {
      await expectLater(
        servicio.designarEncargado('iglesia', uid),
        throwsArgumentError,
      );
    }
    expect(functions.llamadas, isEmpty);
    expect(regiones, isEmpty);
  });

  test('La caché no representa ausencia ni acceso confirmado antes de una denegación', () async {
    final error = FirebaseException(
      plugin: 'cloud_firestore',
      code: 'permission-denied',
    );
    db.flujo = Stream<DocumentSnapshot<Map<String, dynamic>>>.multi((eventos) {
      eventos.add(SnapshotConfiguracionPrueba(existe: false, desdeCache: true));
      eventos.add(
        SnapshotConfiguracionPrueba(
          existe: true,
          desdeCache: true,
          datos: {'moduloHabilitado': true, 'encargadoUid': 'encargado'},
        ),
      );
      eventos.addError(error);
      eventos.close();
    });
    await expectLater(
      servicio.observarConfiguracion('iglesia'),
      emitsInOrder([emitsError(same(error)), emitsDone]),
    );
    expect(db.incluyeMetadatos, isTrue);
  });

  test('Conserva IDs válidos exactos y límites de bytes y UID', () async {
    final iglesia = 'é' * 750;
    final uid = 'á' * 128;
    await servicio.designarEncargado(iglesia, uid);
    await servicio.designarEncargado(' iglesia ', ' encargado ');
    expect(functions.llamadas.first.parametros, {
      'iglesiaId': iglesia,
      'accion': 'designar',
      'encargadoUid': uid,
    });
    expect(functions.llamadas.last.parametros, {
      'iglesiaId': ' iglesia ',
      'accion': 'designar',
      'encargadoUid': ' encargado ',
    });
  });
}
