import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_model.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_screen.dart';
import 'package:fesync/modules/finanzas/finanzas_configuracion_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class ServicioPantallaPrueba extends FinanzasConfiguracionService {
  final cambios = StreamController<FinanzasConfiguracionModel>.broadcast(
    sync: true,
  );
  final observaciones = <String>[];
  final operaciones = <String>[];
  Object? error;
  Completer<void>? pendiente;

  @override
  Stream<FinanzasConfiguracionModel> observarConfiguracion(String iglesiaId) {
    observaciones.add(iglesiaId);
    return cambios.stream;
  }

  Future<void> _operar(String accion) async {
    operaciones.add(accion);
    if (pendiente != null) await pendiente!.future;
    if (error != null) throw error!;
  }

  @override
  Future<void> actualizarEstadoModulo(String iglesiaId, bool habilitado) =>
      _operar('estado:$iglesiaId:$habilitado');

  @override
  Future<void> designarEncargado(String iglesiaId, String encargadoUid) =>
      _operar('designar:$iglesiaId:$encargadoUid');

  @override
  Future<void> revocarEncargado(String iglesiaId) =>
      _operar('revocar:$iglesiaId');
}

UsuarioModel perfil({
  String uid = 'admin',
  String rol = 'admin_iglesia',
  String iglesia = 'iglesia',
  String nombre = 'Ana',
}) => UsuarioModel(
  uid: uid,
  email: '',
  nombre: nombre,
  iglesiaId: iglesia,
  rolGlobal: rol,
);

ContextoAdministracionFinanzas contexto({
  String? uid = 'admin',
  String rol = 'admin_iglesia',
  String iglesiaPerfil = 'iglesia',
  String iglesiaSesion = 'iglesia',
  String iglesiaDocumento = 'iglesia',
  String adminUid = 'admin',
}) => ContextoAdministracionFinanzas(
  uidAutenticado: uid,
  iglesiaIdSesion: iglesiaSesion,
  perfil: perfil(rol: rol, iglesia: iglesiaPerfil),
  iglesia: IglesiaModel(
    id: iglesiaDocumento,
    nombre: 'Iglesia',
    codigoAcceso: '',
    adminUid: adminUid,
  ),
);

FinanzasConfiguracionModel configuracion({
  bool habilitado = false,
  String? encargado,
}) => FinanzasConfiguracionModel.fromMap({
  'moduloHabilitado': habilitado,
  'encargadoUid': encargado,
});

final estado = find.byKey(const ValueKey('finanzas-estado'));
final designar = find.byKey(const ValueKey('finanzas-designar'));
final revocar = find.byKey(const ValueKey('finanzas-revocar'));

Future<void> confirmar(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
  await tester.pumpAndSettle();
}

void main() {
  late ServicioPantallaPrueba servicio;
  late ValueNotifier<ContextoAdministracionFinanzas?> sesion;
  late List<UsuarioModel> miembros;
  late List<String> consultasMiembros;
  Future<List<UsuarioModel>> Function(String)? cargar;

  setUp(() {
    servicio = ServicioPantallaPrueba();
    sesion = ValueNotifier(contexto());
    miembros = [perfil(uid: 'ana', rol: 'servidor')];
    consultasMiembros = [];
    cargar = null;
  });

  tearDown(() async {
    await servicio.cambios.close();
    sesion.dispose();
  });

  Future<void> abrir(
    WidgetTester tester, {
    FinanzasConfiguracionModel? datos,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: FinanzasConfiguracionScreen(
          contexto: sesion,
          servicio: servicio,
          cargarMiembros:
              cargar ??
              (iglesiaId) async {
                consultasMiembros.add(iglesiaId);
                return miembros;
              },
        ),
      ),
    );
    servicio.cambios.add(datos ?? configuracion());
    await tester.pump();
  }

  testWidgets(
    'Titular abre configuración desactivada sin habilitar automáticamente',
    (tester) async {
      await abrir(tester, datos: const FinanzasConfiguracionModel.ausente());
      expect(find.text('Finanzas desactivado'), findsOneWidget);
      expect(find.text('Sin encargado designado'), findsOneWidget);
      expect(tester.widget<FilledButton>(estado).onPressed, isNotNull);
      expect(servicio.observaciones, ['iglesia']);
      expect(servicio.operaciones, isEmpty);
    },
  );

  testWidgets(
    'Muestra estado y encargado confirmados; refleja cambios del stream',
    (tester) async {
      await abrir(
        tester,
        datos: configuracion(habilitado: true, encargado: 'ana'),
      );
      expect(find.text('Finanzas activado'), findsOneWidget);
      expect(find.text('Encargado actual: ana'), findsOneWidget);
      servicio.cambios.add(configuracion());
      await tester.pump();
      expect(find.text('Finanzas desactivado'), findsOneWidget);
      expect(find.text('Encargado actual: ana'), findsNothing);
    },
  );

  for (final caso in [
    (nombre: 'líder', valor: contexto(rol: 'lider_area')),
    (nombre: 'servidor', valor: contexto(rol: 'servidor')),
    (nombre: 'rol desconocido', valor: contexto(rol: 'desconocido')),
    (nombre: 'rol malformado', valor: contexto(rol: 'admin_iglesia ')),
    (
      nombre: 'iglesia malformada aunque coincidente',
      valor: contexto(
        iglesiaPerfil: 'a/b',
        iglesiaSesion: 'a/b',
        iglesiaDocumento: 'a/b',
      ),
    ),
    (nombre: 'otra iglesia', valor: contexto(iglesiaPerfil: 'otra')),
    (
      nombre: 'documento de otra iglesia',
      valor: contexto(iglesiaDocumento: 'otra'),
    ),
    (nombre: 'administrador anterior', valor: contexto(adminUid: 'nuevo')),
    (nombre: 'sin identidad', valor: contexto(uid: null)),
    (nombre: 'identidad discrepante', valor: contexto(uid: 'otro')),
    (nombre: 'iglesia vacía', valor: contexto(iglesiaSesion: '')),
    (nombre: 'sin contexto', valor: null),
    (
      nombre: 'sin perfil',
      valor: ContextoAdministracionFinanzas(
        uidAutenticado: 'admin',
        iglesiaIdSesion: 'iglesia',
        perfil: null,
        iglesia: contexto().iglesia,
      ),
    ),
    (
      nombre: 'sin iglesia',
      valor: ContextoAdministracionFinanzas(
        uidAutenticado: 'admin',
        iglesiaIdSesion: 'iglesia',
        perfil: perfil(),
        iglesia: null,
      ),
    ),
  ]) {
    testWidgets('${caso.nombre} no consulta ni visualiza configuración', (
      tester,
    ) async {
      sesion.value = caso.valor;
      await abrir(
        tester,
        datos: configuracion(habilitado: true, encargado: 'privado'),
      );
      expect(
        find.text('No tienes permisos para administrar Finanzas.'),
        findsOneWidget,
      );
      expect(estado, findsNothing);
      expect(find.textContaining('Encargado actual'), findsNothing);
      expect(servicio.observaciones, isEmpty);
      expect(servicio.operaciones, isEmpty);
    });
  }

  for (final habilitado in [false, true]) {
    testWidgets('Cambio desde $habilitado exige confirmar y puede cancelarse', (
      tester,
    ) async {
      await abrir(tester, datos: configuracion(habilitado: habilitado));
      await tester.tap(estado);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(servicio.operaciones, isEmpty);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();
      expect(servicio.operaciones, isEmpty);
      await tester.tap(estado);
      await tester.pumpAndSettle();
      await confirmar(tester);
      expect(servicio.operaciones, ['estado:iglesia:${!habilitado}']);
      // El resultado del callable no se representa como confirmación del estado.
      expect(
        find.text('Finanzas ${habilitado ? 'activado' : 'desactivado'}'),
        findsOneWidget,
      );
    });
  }

  testWidgets(
    'Designación filtra perfiles válidos de la iglesia, busca y confirma',
    (tester) async {
      miembros = [
        perfil(uid: 'ana', rol: 'servidor'),
        perfil(uid: 'externo', iglesia: 'otra', nombre: 'Externo'),
        perfil(uid: '', nombre: 'Sin UID'),
        perfil(uid: 'mal/uid', nombre: 'UID inválido'),
        perfil(uid: 'beatriz', nombre: 'Beatriz'),
      ];
      await abrir(tester);
      await tester.tap(designar);
      await tester.pumpAndSettle();
      expect(consultasMiembros, ['iglesia']);
      expect(find.text('Externo'), findsNothing);
      expect(find.text('Sin UID'), findsNothing);
      expect(find.text('UID inválido'), findsNothing);
      await tester.enterText(find.byType(TextField), 'ana');
      await tester.pump();
      expect(find.text('Beatriz'), findsNothing);
      await tester.tap(find.text('Ana'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(servicio.operaciones, isEmpty);
      await confirmar(tester);
      expect(servicio.operaciones, ['designar:iglesia:ana']);
      expect(find.text('Finanzas desactivado'), findsOneWidget);
    },
  );

  testWidgets('Revocación exige confirmar y no desactiva automáticamente', (
    tester,
  ) async {
    await abrir(
      tester,
      datos: configuracion(habilitado: true, encargado: 'ana'),
    );
    await tester.tap(revocar);
    await tester.pumpAndSettle();
    expect(servicio.operaciones, isEmpty);
    await confirmar(tester);
    expect(servicio.operaciones, ['revocar:iglesia']);
    expect(find.text('Finanzas activado'), findsOneWidget);
  });

  testWidgets('Operación pendiente bloquea botones y solicitudes duplicadas', (
    tester,
  ) async {
    servicio.pendiente = Completer<void>();
    await abrir(tester, datos: configuracion(encargado: 'ana'));
    await tester.tap(estado);
    await tester.pumpAndSettle();
    final boton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Confirmar'),
    );
    boton.onPressed!();
    boton.onPressed!();
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(estado).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(designar).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(revocar).onPressed, isNull);
    expect(servicio.operaciones, ['estado:iglesia:true']);
    servicio.pendiente!.complete();
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(estado).onPressed, isNotNull);
  });

  for (final codigo in ['permission-denied', 'unavailable', 'unknown']) {
    testWidgets('Error $codigo del callable tiene mensaje seguro', (
      tester,
    ) async {
      servicio.error = FirebaseException(
        plugin: 'functions',
        code: codigo,
        message: 'detalle-interno-privado',
      );
      await abrir(tester, datos: configuracion(encargado: 'ana'));
      await tester.tap(estado);
      await tester.pumpAndSettle();
      await confirmar(tester);
      expect(find.textContaining('detalle-interno'), findsNothing);
      if (codigo == 'permission-denied') {
        expect(
          find.text('No tienes permisos para administrar Finanzas.'),
          findsOneWidget,
        );
        expect(find.textContaining('Encargado actual'), findsNothing);
        expect(estado, findsNothing);
      } else if (codigo == 'unavailable') {
        expect(find.textContaining('Comprueba tu conexión'), findsOneWidget);
      } else {
        expect(
          find.text(
            'No fue posible completar la operación. Inténtalo nuevamente.',
          ),
          findsOneWidget,
        );
      }
    });

    testWidgets('Error $codigo del stream oculta datos previos', (
      tester,
    ) async {
      await abrir(tester, datos: configuracion(encargado: 'ana'));
      servicio.cambios.addError(
        FirebaseException(
          plugin: 'firestore',
          code: codigo,
          message: 'detalle-interno-privado',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Encargado actual'), findsNothing);
      expect(estado, findsNothing);
      expect(find.textContaining('detalle-interno'), findsNothing);
      expect(find.text('Reintentar'), findsOneWidget);
    });
  }

  testWidgets('Pérdida de autorización cierra confirmación y evita operación', (
    tester,
  ) async {
    await abrir(tester, datos: configuracion(encargado: 'ana'));
    await tester.tap(revocar);
    await tester.pumpAndSettle();
    sesion.value = contexto(adminUid: 'nuevo');
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.textContaining('Encargado actual'), findsNothing);
    expect(estado, findsNothing);
    expect(servicio.operaciones, isEmpty);
    servicio.cambios.add(configuracion(habilitado: true, encargado: 'privado'));
    await tester.pump();
    expect(find.textContaining('privado'), findsNothing);
  });

  testWidgets('Pérdida de sesión cierra selector con nombres privados', (
    tester,
  ) async {
    await abrir(tester);
    await tester.tap(designar);
    await tester.pumpAndSettle();
    expect(find.text('Ana'), findsOneWidget);
    sesion.value = null;
    await tester.pumpAndSettle();
    expect(find.text('Ana'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(servicio.operaciones, isEmpty);
  });

  testWidgets(
    'Consulta de miembros tardía no abre selector tras perder autorización',
    (tester) async {
      final pendiente = Completer<List<UsuarioModel>>();
      cargar = (_) => pendiente.future;
      await abrir(tester);
      await tester.tap(designar);
      await tester.pump();
      sesion.value = contexto(rol: 'lider_area');
      await tester.pump();
      pendiente.complete(miembros);
      await tester.pumpAndSettle();
      expect(find.text('Seleccionar encargado'), findsNothing);
      expect(servicio.operaciones, isEmpty);
    },
  );

  testWidgets(
    'Desmontar con operación pendiente no actualiza una pantalla cerrada',
    (tester) async {
      servicio.pendiente = Completer<void>();
      await abrir(tester);
      await tester.tap(estado);
      await tester.pumpAndSettle();
      await confirmar(tester);
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      servicio.pendiente!.complete();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Cambio confirmado cierra una confirmación de revocación obsoleta',
    (tester) async {
      await abrir(tester, datos: configuracion(encargado: 'ana'));
      await tester.tap(revocar);
      await tester.pumpAndSettle();
      servicio.cambios.add(configuracion(encargado: 'nuevo'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('Encargado actual: nuevo'), findsOneWidget);
      expect(servicio.operaciones, isEmpty);
      expect(tester.widget<FilledButton>(estado).onPressed, isNotNull);
    },
  );

  testWidgets('Restaurar contexto no desbloquea una petición aún pendiente', (
    tester,
  ) async {
    servicio.pendiente = Completer<void>();
    await abrir(tester);
    await tester.tap(estado);
    await tester.pumpAndSettle();
    await confirmar(tester);
    sesion.value = null;
    await tester.pumpAndSettle();
    sesion.value = contexto();
    await tester.pump();
    servicio.cambios.add(configuracion());
    await tester.pump();
    expect(tester.widget<FilledButton>(estado).onPressed, isNull);
    expect(servicio.operaciones, ['estado:iglesia:true']);
    servicio.pendiente!.complete();
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(estado).onPressed, isNotNull);
  });

  for (final designacion in [true, false]) {
    testWidgets(
      'Cancelar ${designacion ? 'designación' : 'revocación'} no llama al backend',
      (tester) async {
        await abrir(tester, datos: configuracion(encargado: 'actual'));
        await tester.tap(designacion ? designar : revocar);
        await tester.pumpAndSettle();
        if (designacion) {
          await tester.tap(find.text('Ana'));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Cancelar'));
        await tester.pumpAndSettle();
        expect(servicio.operaciones, isEmpty);
        expect(find.text('Encargado actual: actual'), findsOneWidget);
        expect(tester.widget<FilledButton>(estado).onPressed, isNotNull);
      },
    );
  }

  testWidgets(
    'Error al buscar miembros no expone detalles ni designa candidatos',
    (tester) async {
      cargar = (_) async => throw FirebaseException(
        plugin: 'firestore',
        code: 'unavailable',
        message: 'datos-privados',
      );
      await abrir(tester);
      await tester.tap(designar);
      await tester.pumpAndSettle();
      expect(find.textContaining('Comprueba tu conexión'), findsOneWidget);
      expect(find.textContaining('datos-privados'), findsNothing);
      expect(servicio.operaciones, isEmpty);
    },
  );

  for (final habilitado in [false, true]) {
    testWidgets(
      'Pérdida de titularidad durante operación con módulo $habilitado oculta y bloquea',
      (tester) async {
        servicio.pendiente = Completer<void>();
        await abrir(
          tester,
          datos: configuracion(habilitado: habilitado, encargado: 'ana'),
        );
        final accionAnterior = tester.widget<FilledButton>(estado).onPressed!;
        await tester.tap(estado);
        await tester.pumpAndSettle();
        await confirmar(tester);
        sesion.value = contexto(adminUid: 'nuevo');
        await tester.pumpAndSettle();
        expect(
          find.text('No tienes permisos para administrar Finanzas.'),
          findsOneWidget,
        );
        expect(find.textContaining('Encargado actual'), findsNothing);
        expect(estado, findsNothing);
        expect(designar, findsNothing);
        expect(revocar, findsNothing);
        accionAnterior();
        servicio.cambios.add(
          configuracion(habilitado: true, encargado: 'privado'),
        );
        await tester.pump();
        expect(find.textContaining('privado'), findsNothing);
        servicio.pendiente!.complete();
        await tester.pumpAndSettle();
        accionAnterior();
        await tester.pump();
        expect(servicio.operaciones, ['estado:iglesia:${!habilitado}']);
        expect(estado, findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
