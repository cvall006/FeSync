import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/finanzas/finanzas_transporte_config.dart';
import 'package:fesync/modules/finanzas/finanzas_mvp_service.dart';
import 'package:fesync/core/services/firebase_emulator_bootstrap.dart';
import 'package:fesync/main.dart' as app;

void main() {
  test('main debug sin demo falla antes de inicializar Firebase', () async {
    await expectLater(
      app.main(),
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'mensaje',
          'Debug requiere FESYNC_FINANZAS_DEMO=true.',
        ),
      ),
    );
  }, skip: finanzasEmuladores);
  test('nombres normales, región y selección demo fail closed', () {
    expect(FinanzasTransporteConfig.consultar, 'finanzasV1Consultar');
    expect(FinanzasTransporteConfig.ejecutar, 'finanzasV1Ejecutar');
    expect(FinanzasTransporteConfig.region, 'southamerica-west1');
    const demo = FinanzasTransporteConfig(
      entorno: 'emulador',
      proyecto: 'demo-fesync',
    );
    expect(
      () => demo.validar(proyectoApp: 'demo-fesync', demo: true),
      returnsNormally,
    );
    for (final project in ['fesync-app-2026', '', 'otro']) {
      expect(
        () => demo.validar(proyectoApp: project, demo: true),
        throwsStateError,
      );
    }
    expect(
      () => demo.validar(proyectoApp: 'demo-fesync', demo: false),
      throwsStateError,
    );
    expect(
      () => demo.validar(proyectoApp: 'demo-fesync', demo: true, debug: false),
      throwsStateError,
    );
    expect(
      () =>
          validarSeleccionFirebase(emuladores: true, transporte: 'publicable'),
      throwsStateError,
    );
    expect(
      () => validarSeleccionFirebase(emuladores: false, transporte: 'emulador'),
      throwsStateError,
    );
  });
  test('publicable requiere selección, release, proyecto y permiso local explícitos', () {
    const apagada = FinanzasTransporteConfig(
      entorno: 'publicable',
      proyecto: 'fesync-app-2026',
    );
    expect(
      () => apagada.validar(proyectoApp: 'fesync-app-2026', debug: false),
      throwsStateError,
    );
    const preparada = FinanzasTransporteConfig(
      entorno: 'publicable',
      proyecto: 'fesync-app-2026',
      habilitado: true,
    );
    expect(
      () => preparada.validar(
        proyectoApp: 'fesync-app-2026',
        debug: false,
        demo: false,
      ),
      returnsNormally,
    );
    expect(
      () => preparada.validar(proyectoApp: 'otro', debug: false),
      throwsStateError,
    );
    expect(
      () => preparada.validar(proyectoApp: 'fesync-app-2026', debug: true),
      throwsStateError,
    );
    expect(
      () => preparada.validar(
        proyectoApp: 'fesync-app-2026',
        debug: false,
        demo: true,
      ),
      throwsStateError,
    );
  });
  test('servicio usa contrato normal sin inicializador público', () async {
    final names = <String>[];
    final s = FinanzasMvpService(
      llamar: (nombre, datos) async {
        names.add(nombre);
        expect(datos['historialPaginado'], true);
        return {};
      },
    );
    await s.consultar();
    await s.consultarPagina('cursor', 10);
    expect(names, ['finanzasV1Consultar', 'finanzasV1Consultar']);
    await expectLater(s.inicializar({}, '2026-10'), throwsStateError);
    expect(names.length, 2);
  });
}
