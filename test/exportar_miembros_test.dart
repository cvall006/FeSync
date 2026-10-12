import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/miembros/exportar_miembros.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

UsuarioModel usuario(String rol, {String iglesia = 'iglesia-actual'}) =>
    UsuarioModel(
      uid: 'uid-admin',
      email: 'admin@test.cl',
      nombre: 'Admin',
      iglesiaId: iglesia,
      rolGlobal: rol,
    );

const miembros = [
  {
    'nombre': 'María González',
    'email': 'maria@test.cl',
    'iglesiaId': 'iglesia-actual',
    'uid': 'uid-maria',
    'fcmToken': 'token-secreto',
    'devices': 'dispositivos',
    'fotoUrl': 'foto-privada',
    'rolGlobal': 'servidor',
  },
  {
    'nombre': 'Álvaro',
    'email': 'alvaro@test.cl',
    'iglesiaId': 'iglesia-actual',
  },
  {
    'nombre': 'Intruso',
    'email': 'otra@iglesia.cl',
    'iglesiaId': 'otra-iglesia',
  },
  {'nombre': ' ', 'email': null, 'iglesiaId': 'iglesia-actual'},
];

void main() {
  for (final rol in ['admin_iglesia', 'lider_area']) {
    test('$rol exporta solo nombre/email de su iglesia, ordenados', () {
      final texto = generarListaMiembros(
        usuario: usuario(rol),
        miembros: miembros,
        nombreIglesia: 'Mi iglesia',
      );
      expect(
        texto,
        'Miembros - Mi iglesia\n\n1. Álvaro\n   alvaro@test.cl\n\n2. María González\n   maria@test.cl\n\n3. Sin nombre\n   Sin correo',
      );
      for (final privado in [
        'uid-',
        'iglesia-actual',
        'otra-iglesia',
        'Intruso',
        'otra@iglesia.cl',
        'token-secreto',
        'dispositivos',
        'foto-privada',
        'servidor',
      ]) {
        expect(texto, isNot(contains(privado)));
      }
    });
  }
  test('Miembro normal o sin iglesia no puede generar lista', () {
    expect(
      generarListaMiembros(usuario: usuario('servidor'), miembros: miembros),
      isEmpty,
    );
    expect(
      generarListaMiembros(
        usuario: usuario('admin_iglesia', iglesia: ''),
        miembros: miembros,
      ),
      isEmpty,
    );
  });
  test('Lista vacía y encabezado de fallback', () {
    expect(
      generarListaMiembros(usuario: usuario('admin_iglesia'), miembros: []),
      isEmpty,
    );
    expect(
      generarListaMiembros(
        usuario: usuario('admin_iglesia'),
        miembros: miembros,
      ),
      startsWith('Miembros de la iglesia\n\n'),
    );
  });
  test('Orden español ignora acentos y coloca ñ entre n y o', () {
    final texto = generarListaMiembros(
      usuario: usuario('admin_iglesia'),
      miembros: ['Óscar', 'Ñandú', 'Nicolás', 'Álvaro'].map(
        (nombre) => {
          'nombre': nombre,
          'email': 'correo@test.cl',
          'iglesiaId': 'iglesia-actual',
        },
      ),
    );
    expect(texto.indexOf('Álvaro'), lessThan(texto.indexOf('Nicolás')));
    expect(texto.indexOf('Nicolás'), lessThan(texto.indexOf('Ñandú')));
    expect(texto.indexOf('Ñandú'), lessThan(texto.indexOf('Óscar')));
  });

  testWidgets('Oculta botón a miembros normales', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExportarMiembrosButton(
            usuario: usuario('servidor'),
            miembros: miembros,
          ),
        ),
      ),
    );
    expect(find.text('Exportar miembros'), findsNothing);
  });
  testWidgets('Lista vacía muestra aviso sin abrir opciones', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExportarMiembrosButton(
            usuario: usuario('lider_area'),
            miembros: const [],
          ),
        ),
      ),
    );
    await tester.tap(find.text('Exportar miembros'));
    await tester.pumpAndSettle();
    expect(find.text('No hay miembros para exportar.'), findsOneWidget);
    expect(find.text('Copiar lista'), findsNothing);
  });
  testWidgets('Copiar coloca solo los campos permitidos en Clipboard', (
    tester,
  ) async {
    String? copiado;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copiado = call.arguments['text'] as String;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ExportarMiembrosButton(
            usuario: usuario('admin_iglesia'),
            miembros: miembros,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Exportar miembros'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copiar lista'));
    await tester.pumpAndSettle();
    expect(
      copiado,
      generarListaMiembros(
        usuario: usuario('admin_iglesia'),
        miembros: miembros,
      ),
    );
    expect(find.text('Lista de miembros copiada'), findsOneWidget);
  });
  for (final falla in [false, true]) {
    testWidgets(
      'Compartir ${falla ? 'ofrece copiar si falla' : 'envía texto sin archivos'}',
      (tester) async {
        Map<dynamic, dynamic>? compartido;
        const canal = MethodChannel('dev.fluttercommunity.plus/share');
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(canal, (
          call,
        ) async {
          compartido = call.arguments as Map;
          if (falla) throw PlatformException(code: 'unavailable');
          return 'test-app';
        });
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            canal,
            null,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ExportarMiembrosButton(
                usuario: usuario('lider_area'),
                miembros: miembros,
              ),
            ),
          ),
        );
        await tester.tap(find.text('Exportar miembros'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Compartir lista'));
        await tester.pumpAndSettle();
        expect(
          compartido?['text'],
          generarListaMiembros(
            usuario: usuario('lider_area'),
            miembros: miembros,
          ),
        );
        expect(compartido?.containsKey('paths'), isFalse);
        if (falla) {
          expect(
            find.text('No fue posible compartir. Usa «Copiar lista».'),
            findsOneWidget,
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
