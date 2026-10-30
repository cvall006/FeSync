import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_service.dart';
import 'package:fesync/modules/escuela/escuela_carga_masiva_screen.dart';
import 'package:fesync/modules/escuela/escuela_carga_masiva_service.dart';
import 'package:fesync/modules/escuela/escuela_historial_service.dart';
import 'package:fesync/modules/escuela/escuela_models.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class _Fuente implements EscuelaAsignacionesRepositorio {
  int consultas = 0;
  @override
  Stream<List<EscuelaCiclo>> ciclos() {
    consultas++;
    return Stream.value(const [
      EscuelaCiclo(id: 'c', nombre: 'Otoño', anio: 2026, cerrado: false),
      EscuelaCiclo(id: 'viejo', nombre: 'Cerrado', anio: 2025, cerrado: true),
    ]);
  }

  @override
  Stream<List<EscuelaHermano>> hermanos() => Stream.value(const [
    EscuelaHermano('ana', 'Ana'),
    EscuelaHermano('beto', 'Beto'),
  ]);
  @override
  Stream<List<EscuelaModuloModel>> modulos() => Stream.value([
    for (final id in ['m1', 'm2', 'm3'])
      EscuelaModuloModel(
        id: id,
        titulo: 'Módulo $id',
        descripcion: '',
        creadorUid: '',
        fechaCreacion: null,
        clases: const [],
      ),
  ]);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Carga implements EscuelaCargaRepositorio {
  final consultas = <(List<String>, Map<String, EstadoEscuela>, bool)>[];
  bool falla = false;
  @override
  Future<List<EscuelaCargaFila>> revisar({
    required String cicloId,
    required List<String> hermanos,
    required Map<String, EstadoEscuela> modulos,
    required bool confirmar,
  }) async {
    consultas.add((List.of(hermanos), Map.of(modulos), confirmar));
    if (falla) throw StateError('Red');
    return [
      for (final uid in hermanos)
        for (final m in modulos.keys)
          EscuelaCargaFila(
            uid,
            m,
            uid == 'ana' ? 'creado' : 'conflicto',
            uid == 'ana' ? '' : 'Se conserva.',
          ),
    ];
  }
}

void main() {
  test(
    'lotes de 30, fallo parcial detiene el envío y reintento concilia todos',
    () async {
      final hermanos = List.generate(65, (i) => 'h$i');
      final llamadas = <int>[];
      final guardados = <String>{};
      var fallar = true;
      final servicio = EscuelaCargaMasivaService(
        iglesiaId: 'a',
        actorUid: 'admin',
        uidActual: () => 'admin',
        invocar: (datos) async {
          final uids = List<String>.from(datos['hermanos'] as List);
          llamadas.add(uids.length);
          final filas = [
            for (final uid in uids)
              {
                'hermanoUid': uid,
                'moduloId': 'm1',
                'resultado': guardados.add(uid) ? 'creado' : 'omitido',
                'mensaje': '',
              },
          ];
          if (fallar && llamadas.length == 2) {
            throw FirebaseFunctionsException(
              code: 'deadline-exceeded',
              message: 'Respuesta perdida',
            );
          }
          return {'resultados': filas};
        },
      );
      final primero = await servicio.revisar(
        cicloId: 'c',
        hermanos: hermanos,
        modulos: {'m1': EstadoEscuela.completado},
        confirmar: true,
      );
      expect(llamadas, [30, 30]);
      expect(primero.where((f) => f.resultado == 'error').length, 35);
      fallar = false;
      final segundo = await servicio.revisar(
        cicloId: 'c',
        hermanos: hermanos,
        modulos: {'m1': EstadoEscuela.completado},
        confirmar: true,
      );
      expect(llamadas, [30, 30, 30, 30, 5]);
      expect(segundo.where((f) => f.resultado == 'omitido').length, 60);
      expect(segundo.where((f) => f.resultado == 'creado').length, 5);
      expect(guardados.length, 65);
    },
  );
  test('cambio de sesión impide iniciar la carga', () async {
    final servicio = EscuelaCargaMasivaService(
      iglesiaId: 'a',
      actorUid: 'admin',
      uidActual: () => 'otro',
      invocar: (_) async => throw StateError('No debe invocar'),
    );
    await expectLater(
      servicio.revisar(
        cicloId: 'c',
        hermanos: ['ana'],
        modulos: {'m': EstadoEscuela.pendiente},
        confirmar: true,
      ),
      throwsStateError,
    );
  });
  late _Fuente fuente;
  late _Carga carga;
  setUp(() {
    fuente = _Fuente();
    carga = _Carga();
  });
  Future<void> montar(WidgetTester t, {String rol = 'lider_area'}) async {
    t.view.resetPhysicalSize();
    t.view.physicalSize = const Size(1200, 2200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(
      MaterialApp(
        home: EscuelaCargaMasivaScreen(
          usuario: UsuarioModel(
            uid: 'lider',
            email: '',
            nombre: 'Líder',
            iglesiaId: 'a',
            rolGlobal: rol,
          ),
          repositorio: fuente,
          carga: carga,
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  Future<void> elegir(WidgetTester t, String etiqueta, String opcion) async {
    final campo = find
        .byType(DropdownButtonFormField<String>)
        .filterByLabel(etiqueta);
    await t.ensureVisible(campo);
    await t.tap(campo);
    await t.pumpAndSettle();
    await t.tap(find.text(opcion).last);
    await t.pumpAndSettle();
  }

  testWidgets(
    'selecciona varios hermanos, busca, asigna varios estados y confirma una sola acción',
    (t) async {
      await montar(t);
      await elegir(t, 'Ciclo', 'Otoño · 2026');
      await t.tap(find.text('Seleccionar todos'));
      await t.pump();
      expect(find.text('Hermanos seleccionados: 2'), findsOneWidget);
      await t.enterText(find.byType(TextField), 'Ana');
      await t.pump();
      expect(find.widgetWithText(CheckboxListTile, 'Beto'), findsNothing);
      await t.enterText(find.byType(TextField), '');
      await t.pump();
      await elegir(t, 'Módulo m1', 'Completado');
      await elegir(t, 'Módulo m2', 'En curso');
      await elegir(t, 'Módulo m3', 'Pendiente');
      await t.ensureVisible(find.text('Vista previa'));
      await t.tap(find.text('Vista previa'));
      await t.pumpAndSettle();
      expect(carga.consultas.single.$1, ['ana', 'beto']);
      expect(carga.consultas.single.$2.values, [
        EstadoEscuela.completado,
        EstadoEscuela.enCurso,
        EstadoEscuela.pendiente,
      ]);
      expect(carga.consultas.single.$3, false);
      expect(find.text('Conflictos: 3'), findsOneWidget);
      await t.ensureVisible(find.text('Guardar carga masiva'));
      await t.tap(find.text('Guardar carga masiva'));
      await t.pumpAndSettle();
      expect(carga.consultas.length, 1);
      await t.tap(find.text('Confirmar carga'));
      await t.pumpAndSettle();
      expect(carga.consultas.last.$3, true);
      expect(find.text('Creados: 3'), findsOneWidget);
      expect(find.text('Conciliar y revisar de nuevo'), findsOneWidget);
    },
  );
  testWidgets('deseleccionar todos impide preview y no asignar no se envía', (
    t,
  ) async {
    await montar(t);
    await elegir(t, 'Ciclo', 'Otoño · 2026');
    await t.tap(find.text('Seleccionar todos'));
    await t.pump();
    await elegir(t, 'Módulo m1', 'Pendiente');
    await elegir(t, 'Módulo m2', 'Completado');
    await elegir(t, 'Módulo m2', 'No asignar');
    await t.tap(find.text('Deseleccionar todos'));
    await t.pump();
    expect(
      t
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Vista previa'),
          )
          .onPressed,
      isNull,
    );
    await t.tap(find.widgetWithText(CheckboxListTile, 'Ana'));
    await t.pump();
    await t.tap(find.text('Vista previa'));
    await t.pumpAndSettle();
    expect(carga.consultas.single.$1, ['ana']);
    expect(carga.consultas.single.$2.keys, ['m1']);
  });
  testWidgets('miembro común no consulta datos ni puede cargar', (t) async {
    await montar(t, rol: 'servidor');
    expect(
      find.text('No tienes permiso para administrar Escuela.'),
      findsOneWidget,
    );
    expect(fuente.consultas, 0);
    expect(carga.consultas, isEmpty);
  });
  testWidgets('error de red ofrece conciliación sin afirmar éxito', (t) async {
    await montar(t);
    carga.falla = true;
    await elegir(t, 'Ciclo', 'Otoño · 2026');
    await t.tap(find.text('Seleccionar todos'));
    await t.pump();
    await elegir(t, 'Módulo m1', 'Completado');
    await t.tap(find.text('Vista previa'));
    await t.pumpAndSettle();
    expect(find.textContaining('No se confirmó el resultado.'), findsOneWidget);
    expect(find.text('Guardar carga masiva'), findsNothing);
  });
  test('formato de carga se refleja en los contadores existentes de formación y seguimiento', () {
    Map<String, dynamic> registro(String id, String estado, int revision) => {
      'version': 1,
      'hermanoUid': 'ana',
      'nombreHermano': 'Ana',
      'moduloId': id,
      'tituloModulo': id,
      'estado': estado,
      'revision': revision,
      'asignadoPor': 'lider',
      'actualizadoPor': 'lider',
      'asignadoEn': Timestamp.fromMillisecondsSinceEpoch(1),
      'actualizadoEn': Timestamp.fromMillisecondsSinceEpoch(1),
    };
    final asignacion = EscuelaAsignacion.fromMap('ana', {
      ...registro('m3', 'pendiente', 3),
      'historialModulos': [
        registro('m1', 'completado', 1),
        registro('m2', 'en_curso', 2),
      ],
    });
    final c = EscuelaHistorialCiclo(
      const EscuelaCiclo(id: 'c', nombre: 'Otoño', anio: 2026, cerrado: false),
      [asignacion],
    );
    expect(c.total, 3);
    expect(c.completados, 1);
    expect(c.progreso, closeTo(1 / 3, .0001));
    expect(c.delHermano('ana').total, 3);
    expect(c.delHermano('otro').total, 0);
  });
}

extension on Finder {
  Finder filterByLabel(String etiqueta) => find.byWidgetPredicate(
    (w) =>
        w is DropdownButtonFormField<String> &&
        w.decoration.labelText == etiqueta,
  );
}
