import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/core/services/firebase_emulator_bootstrap.dart';

void main() {
  test('clave demo sintética compatible con la validación del SDK Android', () {
    final bootstrap = File('lib/core/services/firebase_emulator_bootstrap.dart')
        .readAsStringSync();
    final clave = RegExp(r"apiKey: '([^']+)'").firstMatch(bootstrap)!.group(1)!;
    final nativo = jsonDecode(
      File('android/app/src/debug/google-services.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    expect(clave, matches(RegExp(r'^A[\w-]{38}$')));
    expect(clave, contains('DemoFeSync'));
    expect(nativo['project_info']['project_id'], 'demo-fesync');
    expect(nativo['client'][0]['api_key'][0]['current_key'], clave);
  });

  test('host de emuladores sin activar demo no selecciona Firebase real', () {
    for (final debug in [true, false]) {
      expect(
        () => validarSeleccionFirebase(
          emuladores: false,
          debug: debug,
          host: '127.0.0.1',
        ),
        throwsStateError,
      );
    }
  });

  test('selección de Firebase rechaza demo release y host remoto', () {
    expect(
      () => validarSeleccionFirebase(emuladores: true, debug: false, host: ''),
      throwsStateError,
    );
    expect(
      () => validarSeleccionFirebase(
        emuladores: true,
        debug: true,
        host: 'firestore.googleapis.com',
      ),
      throwsStateError,
    );
    for (final debug in [true, false]) {
      expect(
        () =>
            validarSeleccionFirebase(emuladores: false, debug: debug, host: ''),
        returnsNormally,
      );
    }
    for (final host in ['', '127.0.0.1', '10.0.2.2']) {
      expect(
        () =>
            validarSeleccionFirebase(emuladores: true, debug: true, host: host),
        returnsNormally,
      );
    }
  });

  test(
    'no admite hosts de producción, LAN ni URLs como destino de emuladores',
    () {
      for (final host in [
        'fesync-app-2026.firebaseapp.com',
        '192.168.1.10',
        'https://127.0.0.1',
        '127.0.0.1.ejemplo.com',
        '',
      ]) {
        expect(() => validarHostEmulador(host), throwsStateError);
      }
      expect(validarHostEmulador('127.0.0.1'), '127.0.0.1');
      expect(validarHostEmulador('10.0.2.2'), '10.0.2.2');
    },
  );

  test(
    'sin activación explícita no inicializa Firebase de demostración',
    () async {
      await expectLater(inicializarFirebaseEmuladores(), throwsStateError);
    },
    skip: finanzasEmuladores,
  );
}
