import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_models.dart';
import 'package:fesync/modules/escuela/escuela_asignaciones_service.dart';
import 'package:fesync/modules/escuela/escuela_historial_service.dart';
import 'package:fesync/modules/escuela/escuela_historial_screen.dart';

const c1 = EscuelaCiclo(
  id: 'c1',
  nombre: 'Primer ciclo',
  anio: 2026,
  cerrado: false,
);
const c2 = EscuelaCiclo(
  id: 'c2',
  nombre: 'Segundo ciclo',
  anio: 2026,
  cerrado: true,
);
const previo = EscuelaAsignacion(
  hermanoUid: 'ana',
  nombreHermano: 'Ana',
  moduloId: 'm1',
  tituloModulo: 'Fundamentos',
  estado: EstadoEscuela.completado,
  revision: 2,
);
const ana = EscuelaAsignacion(
  hermanoUid: 'ana',
  nombreHermano: 'Ana',
  moduloId: 'm2',
  tituloModulo: 'Evangelios',
  estado: EstadoEscuela.enCurso,
  revision: 3,
  historialModulos: [previo],
);
const beto = EscuelaAsignacion(
  hermanoUid: 'beto',
  nombreHermano: 'Beto',
  moduloId: 'm2',
  tituloModulo: 'Evangelios',
  estado: EstadoEscuela.pendiente,
  revision: 1,
);
final datos = [
  EscuelaHistorialCiclo(c1, [ana, beto]),
  const EscuelaHistorialCiclo(c2, [previo]),
];

class _Fuente implements EscuelaHistorialFuente {
  bool fallaInicio = false;
  final ciclosController = StreamController<List<EscuelaCiclo>>.broadcast();
  final grupos = <String, StreamController<List<EscuelaAsignacion>>>{};
  final propios = <String, StreamController<EscuelaAsignacion?>>{};
  final consultas = <String>[];
  @override
  Stream<List<EscuelaCiclo>> ciclos() {
    if (fallaInicio) throw StateError('La sesión cambió.');
    return ciclosController.stream;
  }

  @override
  Stream<List<EscuelaAsignacion>> asignaciones(String cicloId) {
    consultas.add('grupo:$cicloId');
    return (grupos.putIfAbsent(
      cicloId,
      () => StreamController.broadcast(),
    )).stream;
  }

  @override
  Stream<EscuelaAsignacion?> asignacionDe(String cicloId, String uid) {
    consultas.add('propio:$cicloId:$uid');
    return (propios.putIfAbsent(
      cicloId,
      () => StreamController.broadcast(),
    )).stream;
  }

  Future<void> cerrar() async {
    await ciclosController.close();
    for (final c in grupos.values) {
      await c.close();
    }
    for (final c in propios.values) {
      await c.close();
    }
  }
}

class _Repo implements EscuelaHistorialRepositorio {
  final consultas = <String?>[];
  Stream<List<EscuelaHistorialCiclo>>? flujo;
  @override
  Stream<List<EscuelaHistorialCiclo>> historial({String? hermanoUid}) {
    consultas.add(hermanoUid);
    return flujo ??
        Stream.value(
          hermanoUid == null
              ? datos
              : datos.map((c) => c.delHermano(hermanoUid)).toList(),
        );
  }
}

UsuarioModel usuario(String rol, {String uid = 'ana', String iglesia = 'a'}) =>
    UsuarioModel(
      uid: uid,
      email: '',
      nombre: 'Ana',
      iglesiaId: iglesia,
      rolGlobal: rol,
    );
Future<void> turno() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  test(
    'Cambio de sesión antes de iniciar se entrega como error del historial',
    () async {
      final f = _Fuente()..fallaInicio = true;
      await expectLater(
        EscuelaHistorialService(f).historial().first,
        throwsStateError,
      );
      await f.cerrar();
    },
  );
  test(
    'Progreso usa solamente registros asignados, incluidos módulos anteriores',
    () {
      final h = datos.first.delHermano('ana');
      expect(h.total, 2);
      expect(h.completados, 1);
      expect(h.progreso, .5);
      expect(h.contar(EstadoEscuela.enCurso), 1);
      expect(h.contar(EstadoEscuela.pendiente), 0);
      expect(datos.last.delHermano('ana').completados, 1);
      expect(datos.last.delHermano('sin-registro').progreso, 0);
    },
  );
  test('Historial propio consulta solo documentos del UID y espera todos los ciclos', () async {
    final f = _Fuente();
    final eventos = <List<EscuelaHistorialCiclo>>[];
    final sub = EscuelaHistorialService(f)
        .historial(hermanoUid: 'ana')
        .listen(eventos.add);
    f.ciclosController.add([c1, c2]);
    await turno();
    expect(f.consultas, ['propio:c1:ana', 'propio:c2:ana']);
    f.propios['c1']!.add(ana);
    await turno();
    expect(eventos, isEmpty);
    f.propios['c2']!.add(previo);
    await turno();
    expect(eventos.single.first.total, 2);
    f.propios['c2']!.add(null);
    await turno();
    expect(eventos.last.last.total, 0);
    await sub.cancel();
    expect(f.propios.values.any((c) => c.hasListener), false);
    await f.cerrar();
  });
  test('Seguimiento escucha grupos, actualiza estados y elimina suscripciones de ciclos retirados', () async {
    final f = _Fuente();
    final eventos = <List<EscuelaHistorialCiclo>>[];
    final sub = EscuelaHistorialService(f).historial().listen(eventos.add);
    f.ciclosController.add([c1, c2]);
    await turno();
    f.grupos['c1']!.add([ana, beto]);
    f.grupos['c2']!.add([previo]);
    await turno();
    expect(eventos.last.first.total, 3);
    expect(eventos.last.first.completados, 1);
    f.ciclosController.add([c2]);
    await turno();
    expect(f.grupos['c1']!.hasListener, false);
    f.grupos['c2']!.add([previo]);
    await turno();
    expect(eventos.last.length, 1);
    await sub.cancel();
    await f.cerrar();
  });
  test(
    'Error de autorización invalida carga sin publicar resultados parciales',
    () async {
      final f = _Fuente();
      final eventos = <List<EscuelaHistorialCiclo>>[];
      final errores = <Object>[];
      final sub = EscuelaHistorialService(f)
          .historial()
          .listen(eventos.add, onError: errores.add);
      f.ciclosController.add([c1, c2]);
      await turno();
      f.grupos['c1']!.add([ana]);
      f.grupos['c2']!.addError(StateError('Revocado'));
      await turno();
      f.grupos['c2']!.add([previo]);
      await turno();
      expect(eventos, isEmpty);
      expect(errores, hasLength(1));
      await sub.cancel();
      await f.cerrar();
    },
  );
  test(
    'Sin ciclos se entrega lista vacía y se cancelan todos los listeners',
    () async {
      final f = _Fuente();
      final resultado = EscuelaHistorialService(f).historial().first;
      f.ciclosController.add([]);
      expect(await resultado, isEmpty);
      await turno();
      expect(f.ciclosController.hasListener, false);
      await f.cerrar();
    },
  );
  testWidgets(
    'Mi formación es de solo lectura, incluye módulos previos y ciclos cerrados',
    (t) async {
      final r = _Repo();
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaMiFormacionScreen(
            usuario: usuario('servidor'),
            repositorio: r,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(r.consultas, ['ana']);
      expect(find.text('Módulos completados: 2'), findsOneWidget);
      expect(find.text('1/2 módulos completados · 50%'), findsOneWidget);
      expect(find.text('Fundamentos'), findsWidgets);
      expect(find.text('Ciclo cerrado · Historial'), findsOneWidget);
      expect(find.text('Beto'), findsNothing);
      expect(find.byType(DropdownButton<EstadoEscuela>), findsNothing);
      expect(find.text('Confirmar'), findsNothing);
    },
  );
  testWidgets(
    'Seguimiento busca alumnos por nombre sin duplicarlos entre ciclos',
    (t) async {
      final r = _Repo();
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaSeguimientoScreen(
            usuario: usuario('lider_area'),
            repositorio: r,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(r.consultas, [null]);
      expect(find.text('Ana'), findsOneWidget);
      expect(find.text('Beto'), findsOneWidget);
      await t.enterText(find.byType(TextField), 'bet');
      await t.pump();
      expect(find.text('Ana'), findsNothing);
      expect(find.text('Beto'), findsOneWidget);
    },
  );
  testWidgets(
    'Filtrar ciclo muestra participantes y el detalle recupera todos los ciclos del alumno',
    (t) async {
      final r = _Repo();
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaSeguimientoScreen(
            usuario: usuario('admin_iglesia'),
            repositorio: r,
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.byType(DropdownButton<String>));
      await t.pumpAndSettle();
      await t.tap(find.text('2026 · Segundo ciclo').last);
      await t.pumpAndSettle();
      expect(find.text('Beto'), findsNothing);
      expect(find.text('Participantes: 1 · Mostrados: 1'), findsOneWidget);
      await t.tap(find.text('Ana'));
      await t.pumpAndSettle();
      expect(r.consultas, [null, 'ana']);
      expect(find.text('2026 · Primer ciclo'), findsOneWidget);
      expect(find.text('2026 · Segundo ciclo'), findsOneWidget);
    },
  );
  testWidgets('Miembro no inicia consulta de seguimiento general', (t) async {
    final r = _Repo();
    await t.pumpWidget(
      MaterialApp(
        home: EscuelaSeguimientoScreen(
          usuario: usuario('servidor'),
          repositorio: r,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(r.consultas, isEmpty);
    expect(find.textContaining('No tienes autorización'), findsOneWidget);
  });
  testWidgets(
    'Carga, vacío y error no muestran información ajena ni detalles técnicos',
    (t) async {
      final r = _Repo()..flujo = const Stream.empty();
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaMiFormacionScreen(
            usuario: usuario('servidor'),
            repositorio: r,
          ),
        ),
      );
      await t.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final vacio = _Repo()..flujo = Stream.value([]);
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaMiFormacionScreen(
            key: const ValueKey('vacio'),
            usuario: usuario('servidor'),
            repositorio: vacio,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.textContaining('Todavía no hay módulos'), findsOneWidget);
      final error = _Repo()..flujo = Stream.error(StateError('SECRETO'));
      await t.pumpWidget(
        MaterialApp(
          home: EscuelaMiFormacionScreen(
            key: const ValueKey('error'),
            usuario: usuario('servidor'),
            repositorio: error,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.textContaining('No se pudo cargar'), findsOneWidget);
      expect(find.textContaining('SECRETO'), findsNothing);
    },
  );
  testWidgets('Cambio de iglesia descarta historial de la cuenta anterior', (
    t,
  ) async {
    final r = _Repo();
    await t.pumpWidget(
      MaterialApp(
        home: EscuelaSeguimientoScreen(
          usuario: usuario('lider_area'),
          repositorio: r,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Beto'), findsOneWidget);
    final nuevo = _Repo()..flujo = Stream.value([]);
    await t.pumpWidget(
      MaterialApp(
        home: EscuelaSeguimientoScreen(
          usuario: usuario('lider_area', uid: 'otro', iglesia: 'b'),
          repositorio: nuevo,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Beto'), findsNothing);
  });
}
