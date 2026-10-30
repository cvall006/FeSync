import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_service.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_screen.dart';
import 'package:fesync/modules/escuela/escuela_models.dart';

class _Repo implements EscuelaAsignacionesRepositorio {
  final llamadas = <String>[];
  final cambios = StreamController<List<EscuelaCiclo>>.broadcast();
  final lista = <EscuelaAsignacion>[];
  final porCiclo = <String, List<EscuelaAsignacion>>{};
  final participantes = [const EscuelaHermano('hermano', 'Ana')];
  bool cerrado = false, falla = false;
  Completer<void>? espera;
  EscuelaCiclo ciclo(String id) => EscuelaCiclo(
    id: id,
    nombre: id == 'c1' ? 'Primer ciclo' : 'Segundo ciclo',
    anio: 2026,
    cerrado: cerrado || id == 'c2',
  );
  @override
  Stream<List<EscuelaCiclo>> ciclos() async* {
    yield [ciclo('c1'), ciclo('c2')];
    yield* cambios.stream;
  }

  @override
  Stream<List<EscuelaAsignacion>> asignaciones(String id) =>
      Stream.value(porCiclo[id] ?? lista);
  @override
  Stream<List<EscuelaHermano>> hermanos() => Stream.value(participantes);
  @override
  Stream<List<EscuelaModuloModel>> modulos() => Stream.value([
    const EscuelaModuloModel(
      id: 'm1',
      titulo: 'Fundamentos',
      descripcion: '',
      creadorUid: 'lider',
      fechaCreacion: null,
      clases: [],
    ),
    const EscuelaModuloModel(
      id: 'm2',
      titulo: 'Evangelios',
      descripcion: '',
      creadorUid: 'lider',
      fechaCreacion: null,
      clases: [],
    ),
  ]);
  @override
  Future<String> crearCiclo(String nombre, int anio) async {
    llamadas.add('crear:$nombre:$anio');
    return 'c1';
  }

  @override
  Future<void> cerrarCiclo(String id) async {
    llamadas.add('cerrar:$id');
    cerrado = true;
    cambios.add([ciclo('c1'), ciclo('c2')]);
  }

  @override
  Future<void> eliminarCiclo(String id) async {
    llamadas.add('eliminar:$id');
    cambios.add(id == 'c1' ? [ciclo('c2')] : [ciclo('c1')]);
  }

  @override
  Future<void> asignar(
    String c,
    String h,
    String m, {
    required int? revisionEsperada,
  }) async {
    llamadas.add('asignar:$c:$h:$m:$revisionEsperada');
  }

  @override
  Future<void> cambiarEstado(
    String c,
    String h,
    EstadoEscuela estado, {
    required int revisionEsperada,
  }) async {
    llamadas.add('estado:${estado.valor}:$revisionEsperada');
    if (espera != null) await espera!.future;
    if (falla) {
      throw StateError(
        'La asignación cambió. Revisa la lista antes de guardar.',
      );
    }
  }
}

void main() {
  late _Repo repo;
  setUp(() => repo = _Repo());
  tearDown(() => repo.cambios.close());
  Future<void> montar(WidgetTester t, {String rol = 'lider_area'}) async {
    await t.pumpWidget(
      MaterialApp(
        home: EscuelaAsignacionesScreen(
          usuario: UsuarioModel(
            uid: 'lider',
            email: '',
            nombre: 'Líder',
            iglesiaId: 'a',
            rolGlobal: rol,
          ),
          repositorio: repo,
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  void agregar() => repo.lista.add(
    const EscuelaAsignacion(
      hermanoUid: 'hermano',
      nombreHermano: 'Ana',
      moduloId: 'm1',
      tituloModulo: 'Fundamentos',
      estado: EstadoEscuela.pendiente,
      revision: 4,
    ),
  );
  testWidgets(
    'Encargado asigna módulo por hermano y confirmación; cancelar no escribe',
    (t) async {
      await montar(t);
      await t.tap(find.text('Asignar módulo'));
      await t.pumpAndSettle();
      expect(find.textContaining('Ana'), findsOneWidget);
      await t.tap(find.text('Cancelar'));
      await t.pumpAndSettle();
      expect(repo.llamadas, isEmpty);
      await t.tap(find.text('Asignar módulo'));
      await t.pumpAndSettle();
      await t.tap(find.text('Confirmar asignación'));
      await t.pumpAndSettle();
      expect(repo.llamadas, ['asignar:c1:hermano:m1:null']);
    },
  );
  testWidgets(
    'Cambio de módulo advierte reinicio y utiliza revisión observada',
    (t) async {
      agregar();
      await montar(t);
      await t.tap(find.text('Cambiar módulo'));
      await t.pumpAndSettle();
      expect(find.textContaining('vuelve a Pendiente'), findsOneWidget);
      await t.tap(
        find
            .descendant(
              of: find.byType(AlertDialog),
              matching: find.byType(DropdownButton<String>),
            )
            .last,
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Evangelios').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Confirmar asignación'));
      await t.pumpAndSettle();
      expect(repo.llamadas, ['asignar:c1:hermano:m2:4']);
    },
  );
  testWidgets(
    'Estados piden confirmación, bloquean duplicados y muestran conflictos',
    (t) async {
      agregar();
      repo.falla = true;
      await montar(t);
      await t.tap(find.text('Pendiente'));
      await t.pumpAndSettle();
      await t.tap(find.text('En curso').last);
      await t.pumpAndSettle();
      expect(repo.llamadas, isEmpty);
      await t.tap(find.text('Confirmar'));
      await t.pumpAndSettle();
      expect(repo.llamadas, ['estado:en_curso:4']);
      expect(find.textContaining('La asignación cambió'), findsOneWidget);
    },
  );
  testWidgets('Miembro consulta asignaciones sin controles administrativos', (
    t,
  ) async {
    agregar();
    await montar(t, rol: 'servidor');
    expect(find.text('Fundamentos'), findsOneWidget);
    expect(find.text('Cambiar módulo'), findsNothing);
    expect(find.text('Asignar módulo'), findsNothing);
    expect(find.byTooltip('Crear ciclo'), findsNothing);
    expect(find.text('Cerrar ciclo'), findsNothing);
  });
  testWidgets('Cerrar ciclo conserva lectura y oculta controles', (t) async {
    agregar();
    await montar(t);
    await t.tap(find.text('Cerrar ciclo'));
    await t.pumpAndSettle();
    expect(find.textContaining('no podrán modificarse'), findsOneWidget);
    await t.tap(find.text('Confirmar'));
    await t.pumpAndSettle();
    expect(repo.llamadas, ['cerrar:c1']);
    expect(find.text('Fundamentos'), findsOneWidget);
    expect(find.text('Historial: este ciclo está cerrado.'), findsOneWidget);
    expect(find.text('Asignar módulo'), findsNothing);
    expect(find.text('Cambiar módulo'), findsNothing);
  });
  testWidgets('Selector de ciclo consulta historial independiente', (t) async {
    agregar();
    repo.porCiclo['c2'] = [
      const EscuelaAsignacion(
        hermanoUid: 'hermano',
        nombreHermano: 'Ana',
        moduloId: 'm2',
        tituloModulo: 'Evangelios',
        estado: EstadoEscuela.completado,
        revision: 1,
      ),
    ];
    await montar(t);
    await t.tap(find.text('2026 · Primer ciclo'));
    await t.pumpAndSettle();
    await t.tap(find.text('2026 · Segundo ciclo · Cerrado').last);
    await t.pumpAndSettle();
    expect(find.text('Evangelios'), findsOneWidget);
    expect(find.text('Fundamentos'), findsNothing);
    expect(repo.llamadas, isEmpty);
  });
  testWidgets('Crear ciclo toma nombre y año sin modificar catálogo', (
    t,
  ) async {
    await montar(t);
    await t.tap(find.byTooltip('Crear ciclo'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).first, 'Tercer ciclo');
    await t.enterText(find.byType(TextField).last, '2026');
    await t.pump();
    await t.tap(find.text('Crear'));
    await t.pumpAndSettle();
    expect(repo.llamadas, ['crear:Tercer ciclo:2026']);
  });

  testWidgets(
    'El selector permite asignar a cualquier hermano recibido, además del autenticado',
    (t) async {
      repo.participantes.addAll([
        const EscuelaHermano('lider', 'Usuario autenticado'),
        const EscuelaHermano('beto', 'Beto'),
      ]);
      await montar(t);
      await t.tap(find.text('Asignar módulo'));
      await t.pumpAndSettle();
      final selector = find
          .descendant(
            of: find.byType(AlertDialog),
            matching: find.byType(DropdownButton<String>),
          )
          .first;
      expect(
        t
            .widget<DropdownButton<String>>(selector)
            .items!
            .map((item) => item.value),
        containsAll(['hermano', 'lider', 'beto']),
      );
      await t.tap(selector);
      await t.pumpAndSettle();
      await t.tap(find.textContaining('Beto').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Confirmar asignación'));
      await t.pumpAndSettle();
      expect(repo.llamadas, ['asignar:c1:beto:m1:null']);
    },
  );

  testWidgets('Solo administrador ve eliminar; líder y miembro no', (t) async {
    await montar(t);
    expect(find.text('Eliminar ciclo'), findsNothing);
    await montar(t, rol: 'servidor');
    expect(find.text('Eliminar ciclo'), findsNothing);
    await montar(t, rol: 'admin_iglesia');
    expect(find.text('Eliminar ciclo'), findsOneWidget);
  });
  for (final cerrado in [false, true]) {
    testWidgets(
      'Administrador confirma borrado recuperable de ciclo cerrado=$cerrado',
      (t) async {
        repo.cerrado = cerrado;
        await montar(t, rol: 'admin_iglesia');
        await t.tap(find.text('Eliminar ciclo'));
        await t.pumpAndSettle();
        expect(find.textContaining('conservadas internamente'), findsOneWidget);
        await t.tap(find.text('Cancelar'));
        await t.pumpAndSettle();
        expect(repo.llamadas, isEmpty);
        await t.tap(find.text('Eliminar ciclo'));
        await t.pumpAndSettle();
        await t.tap(find.text('Confirmar'));
        await t.pumpAndSettle();
        expect(repo.llamadas, ['eliminar:c1']);
        expect(find.text('2026 · Primer ciclo'), findsNothing);
      },
    );
  }

  testWidgets(
    'Una escritura pendiente bloquea otra decisión y sobrevive al cierre de pantalla',
    (t) async {
      agregar();
      repo.espera = Completer<void>();
      await montar(t);
      await t.tap(find.text('Pendiente'));
      await t.pumpAndSettle();
      await t.tap(find.text('Completado').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Confirmar'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400));
      expect(repo.llamadas, ['estado:completado:4']);
      final boton = t.widget<TextButton>(
        find.widgetWithText(TextButton, 'Cambiar módulo'),
      );
      expect(boton.onPressed, isNull);
      await t.pumpWidget(const MaterialApp(home: SizedBox()));
      repo.espera!.complete();
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('Asignaciones y diálogo se adaptan a pantalla estrecha', (
    t,
  ) async {
    t.view.physicalSize = const Size(360, 640);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    agregar();
    await montar(t);
    await t.tap(find.text('Cambiar módulo'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    await t.tap(find.text('Cancelar'));
    await t.pumpAndSettle();
    expect(repo.llamadas, isEmpty);
  });

  testWidgets(
    'Cambiar de cuenta durante un formulario no crea un ciclo en otra iglesia',
    (t) async {
      await montar(t);
      await t.tap(find.byTooltip('Crear ciclo'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, 'Ciclo anterior');
      await t.pump();
      final nuevo = _Repo();
      addTearDown(nuevo.cambios.close);
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaAsignacionesScreen(
            usuario: UsuarioModel(
              uid: 'otro',
              email: '',
              nombre: 'Otro',
              iglesiaId: 'b',
              rolGlobal: 'lider_area',
            ),
            repositorio: nuevo,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Crear'));
      await t.pumpAndSettle();
      expect(repo.llamadas, isEmpty);
      expect(nuevo.llamadas, isEmpty);
    },
  );
}
