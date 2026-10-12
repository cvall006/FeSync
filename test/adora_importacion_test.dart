import 'package:fesync/modules/adora_live/adora_models.dart';
import 'package:fesync/modules/adora_live/adora_parser_acordes.dart';
import 'package:fesync/modules/adora_live/adora_visor_cancion_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const casoA = '''G
//Que toda la Creación
Alabe a Dios, Alabe a Dios//

VERSO 1
     G                    Am          G
Te alabo en el valle, Te alabo en el monte
     D                  C           G
Te alabo en el día, Te alabo en la noche
     G                 Am        G
Te alabo en el medio Estando rodeado
         D                 C       G
Porque cuando alabo, Tú estás a mi lado''';

const casoB = '''Intro: ////Bm - G - D - A////

G
Un estruendo de muchas aguas
Bm          F#m
Se escucha aquí
G
Trae sanidad, trae libertad
Bm          F#m
Gozo y salvación
G
Es el río del Señor
    Bm             F#m
Que nace de su corazón

Intro:
//C#/A – D//

Verso:
         D               Em-D
Quien podrá separarme de ti Dios
    Bm          A
Si aún cuando te fallo
       G
Aquí estás

Precoro:
      A             Bm       G
Ni lo alto ni lo profundo me pueden alejar de ti
       A           Bm        G
Ninguna cosa en el mundo, me puede separar
de ti

Coro:
            D
Mejor es un día en tu casa
    G                 Bm
Que mil años lejos de ti Dios
F#m            G
Tú eres mi gozo Dios

              D
En ti todo es nuevo
            G
Borras mi pasado
              Bm       F#m          G
Ya no hay tristeza, tú eres mi gozo Dios
   Em       G-D
Tú eres mi gozo, Dios

Intro:
C#/A – D''';

String espaciosNormales(String texto) => texto.replaceAll('\u00A0', ' ');

void main() {
  test('Caso A: conserva letra y posiciones, reconoce acordes y sección', () {
    expect(normalizarTextoImportado(casoA), casoA);
    final lineas = casoA.split('\n');
    for (final indice in [0, 5, 7, 9, 11]) {
      expect(esLineaDeAcordes(lineas[indice]), isTrue);
      final bloques = procesarLinea(lineas[indice]);
      expect(bloques, hasLength(1));
      expect(espaciosNormales(bloques.single.acordeOriginal), lineas[indice]);
      expect(bloques.single.letra, isEmpty);
    }
    expect(esEtiquetaSeccion('VERSO 1'), isTrue);
    for (final indice in [1, 2, 6, 8, 10, 12]) {
      expect(esLineaDeAcordes(lineas[indice]), isFalse);
      expect(
        espaciosNormales(procesarLinea(lineas[indice]).single.letra),
        lineas[indice],
      );
    }
  });

  test('Caso B: separa intro y conserva progresiones, slash y letra', () {
    final esperado = casoB
        .replaceFirst('Intro: ////Bm - G - D - A////', 'Intro:\nBm - G - D - A')
        .replaceFirst('//C#/A – D//', 'C#/A – D');
    final normalizado = normalizarTextoImportado(casoB);
    expect(normalizado, esperado);
    expect(normalizarTextoImportado(normalizado), normalizado);
    for (final notacion in [
      'Em-D',
      'G-D',
      'Bm-A-G',
      'Bm - G - D - A',
      'C#/A – D',
    ]) {
      expect(esLineaDeAcordes(notacion), isTrue);
      final bloques = procesarLinea(notacion);
      expect(bloques, hasLength(1));
      expect(espaciosNormales(bloques.single.acordeOriginal), notacion);
    }
    expect(esLineaDeAcordes('de ti'), isFalse);
    expect(procesarLinea('de ti').single.acordeOriginal, isEmpty);
    expect(procesarLinea('de ti').single.letra, 'de\u00A0ti');
  });

  test('Reconoce variantes musicales y secciones completas', () {
    for (final acorde in [
      'C',
      'C#',
      'Db',
      'Cm',
      'C#m',
      'Bbm',
      'C7',
      'Cm7',
      'Cmaj7',
      'C9',
      'C11',
      'C13',
      'Csus2',
      'Csus4',
      'Cadd9',
      'Cdim',
      'Caug',
      'C/G',
      'C#/A',
      'D/F#',
      'G/B',
      'F#m',
      'F#m7',
      'C7(b9)',
    ]) {
      expect(esLineaDeAcordes(acorde), isTrue, reason: acorde);
    }
    for (final seccion in [
      'Intro',
      'Intro:',
      'Intro 2',
      'Verso',
      'Verso:',
      'Verso 1',
      'Verso 2',
      'Coro',
      'Precoro',
      'Pre-coro',
      'Pre coro',
      'Puente',
      'Final',
      'Instrumental',
      'Interludio',
      'Outro',
      'Bridge',
      '=== Solo ===',
    ]) {
      expect(esEtiquetaSeccion(seccion.toUpperCase()), isTrue, reason: seccion);
      expect(esLineaDeAcordes(seccion), isFalse);
      expect(procesarLinea(seccion).single.acordeOriginal, isEmpty);
    }
    for (final texto in [
      '| - – —',
      '//Que toda la Creación',
      'Alabe a Dios, Alabe a Dios//',
      'C(texto)',
      'Em--D',
      'Intro: Dios es amor',
    ]) {
      expect(esLineaDeAcordes(texto), isFalse, reason: texto);
      expect(normalizarTextoImportado(texto), texto);
    }
  });

  test('Normaliza saltos, tabs, invisibles y espacios sin perder sangría', () {
    expect(
      normalizarTextoImportado(
        '\uFEFFVERSO 1\r\n\tG\u00A0 Am  \rLetra\u2028C\u2029D\u200B\n\n\n\n\nFin',
      ),
      'VERSO 1\n    G  Am\nLetra\nC\nD\n\n\nFin',
    );
    expect(normalizarTextoImportado('     //C#/A – D//  '), '     C#/A – D');
    expect(normalizarTextoImportado(''), '');
  });

  test('Formato heredado: mantiene bloques y texto de canciones con corchetes', () {
    const antigua =
        'Intro:\n[Bm] [-] [G] [-] [D] [-] [A]\n\nQu[Bm]iero levantar a ti[G] mis manos...';
    expect(normalizarTextoImportado(antigua), antigua);
    final intro = procesarLinea('[Bm] [-] [G] [-] [D] [-] [A]');
    expect(intro.map((b) => b.acordeOriginal), [
      'Bm',
      '',
      'G',
      '',
      'D',
      '',
      'A',
    ]);
    final verso = procesarLinea('Qu[Bm]iero levantar a ti[G] mis manos...');
    expect(verso.map((b) => b.acordeOriginal), ['', 'Bm', 'G']);
    expect(
      espaciosNormales(verso.map((b) => b.letra).join()),
      'Quiero levantar a ti mis manos...',
    );
    expect(procesarLinea('[G]Texto').single.acordeOriginal, 'G');
    expect(procesarLinea('[Am]Texto').single.letra, 'Texto');
  });

  test('Transposición conserva estructura de progresiones y slash chords', () {
    for (final texto in ['Em-D', 'C#/A', 'Bm - G - D - A', 'C#/A – D']) {
      expect(transponerTextoAcorde(texto, 0), texto);
    }
    expect(transponerTextoAcorde('Em-D', 2), 'F#m-E');
    expect(transponerTextoAcorde('G-D', -2), 'F-C');
    expect(transponerTextoAcorde('C#/A', 2), 'D#/B');
    expect(transponerTextoAcorde('Bm - G - D - A', 2), 'C#m - A - E - B');
    expect(transponerTextoAcorde('C#/A – D', 2), 'D#/B – E');
    expect(transponerTextoAcorde('Db  F#m7', 1), 'D  Gm7');
  });

  testWidgets(
    'Visor renderiza importación, transpone y oculta acordes en mic mode',
    (tester) async {
      const cancion = AdoraCancionModel(
        id: 'prueba',
        titulo: 'Prueba',
        autor: '',
        tono: 'D',
        letra: 'Intro: ////Bm - G - D - A////\nVerso 1\n    Em-D     C#/A\nde ti\n[G]Texto',
        vozPrincipal: '',
        youtube: '',
        creadorUid: '',
        fechaCreacion: null,
      );
      await tester.pumpWidget(
        const MaterialApp(
          home: AdoraVisorCancionScreen(cancion: cancion, puedeEditar: true),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Intro:'), findsOneWidget);
      expect(
        find.text('Bm\u00A0-\u00A0G\u00A0-\u00A0D\u00A0-\u00A0A'),
        findsOneWidget,
      );
      expect(find.text('Verso\u00A01'), findsOneWidget);
      await tester.tap(find.byTooltip('Subir semitono'));
      await tester.pump();
      expect(
        find.text(
          '\u00A0\u00A0\u00A0\u00A0Fm-D#\u00A0\u00A0\u00A0\u00A0\u00A0D/A#',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Solo letra'));
      await tester.pump();
      expect(find.text('de ti'), findsOneWidget);
      expect(find.text('Texto'), findsOneWidget);
      expect(find.text('Intro:'), findsOneWidget);
      expect(find.text('Verso 1'), findsOneWidget);
      expect(find.text('G#'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Mostrar acordes'));
      await tester.pump();
      expect(find.text('G#'), findsOneWidget);
    },
  );
}
