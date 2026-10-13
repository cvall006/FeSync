import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:fesync/core/models/app_models.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_archivos.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_logica.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_markdown.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_models.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

UsuarioModel usuarioCapacitacion(String rol) => UsuarioModel(
  uid: 'u',
  nombre: 'Usuario',
  email: '',
  iglesiaId: 'iglesia',
  rolGlobal: rol,
);
CapacitacionModel contenidoCapacitacion({
  String categoria = '',
  String? tipoContenido,
  String tipo = 'texto',
  String nombreArchivo = '',
}) => CapacitacionModel(
  id: 'contenido',
  titulo: 'Amor y Liderazgo',
  descripcion: 'Para la familia',
  contenido: '**Literal**\nReflexión',
  linkVideo: 'https://youtu.be/video',
  tipo: tipo,
  fechaCreacion: null,
  categoriaId: categoria,
  tipoContenido: tipoContenido,
  archivoNombre: nombreArchivo,
);

void main() {
  const categorias = [
    CapacitacionCategoriaModel(id: 'c1', nombre: 'Liderazgo', orden: 2),
    CapacitacionCategoriaModel(
      id: 'c2',
      nombre: 'Familia',
      orden: 1,
      activa: false,
    ),
  ];
  test('Modelo de categoría, orden y activas', () {
    final c = CapacitacionCategoriaModel.fromMap({
      'nombre': 'Familia',
      'descripcion': 'Tema',
      'orden': 1,
      'activa': false,
      'creadorUid': 'u',
    }, 'c2');
    expect(c.toMap()['nombre'], 'Familia');
    expect(categoriasVisibles(categorias, false).map((c) => c.id), ['', 'c1']);
    expect(categoriasVisibles(categorias, true).map((c) => c.id), [
      '',
      'c2',
      'c1',
    ]);
  });
  test('General virtual y categorías huérfanas no migran documentos', () {
    expect(CapacitacionCategoriaModel.general.id, '');
    expect(categoriaEfectiva(contenidoCapacitacion(), categorias), '');
    expect(
      categoriaEfectiva(
        contenidoCapacitacion(categoria: 'borrada'),
        categorias,
      ),
      '',
    );
    expect(
      categoriaEfectiva(contenidoCapacitacion(categoria: 'c1'), categorias),
      'c1',
    );
  });
  test('Documentos heredados conservan lectura literal y vídeos', () {
    final texto = CapacitacionModel.fromMap({
      'contenido': '**Texto literal**',
    }, 'viejo');
    expect(texto.esHeredada, true);
    expect(texto.esTexto, true);
    expect(texto.contenido, '**Texto literal**');
    final video = CapacitacionModel.fromMap({
      'tipo': 'video',
      'linkVideo': 'https://youtube.com/watch?v=abc',
    }, 'video');
    expect(video.esVideo, true);
    expect(video.etiquetaTipo, '▶ Video');
  });
  test(
    'Reflexión, archivo y enlace usan nuevos campos sin quitar los viejos',
    () {
      expect(
        contenidoCapacitacion(tipoContenido: 'reflexion').esHeredada,
        false,
      );
      expect(
        contenidoCapacitacion(
          tipoContenido: 'archivo',
          nombreArchivo: 'guia.pdf',
        ).etiquetaTipo,
        '📄 PDF',
      );
      expect(
        contenidoCapacitacion(
          tipoContenido: 'archivo',
          nombreArchivo: 'tema.pptx',
        ).etiquetaTipo,
        '🎞 Presentación',
      );
      expect(contenidoCapacitacion(tipoContenido: 'enlace').esVideo, true);
      final nuevo = CapacitacionModel.fromMap({
        'tipoContenido': 'archivo',
        'categoriaId': 'c1',
        'archivoUrl': 'gs://b/ruta',
        'archivoNombre': 'guia.pdf',
        'archivoTipo': 'application/pdf',
        'archivoTamano': 123,
      }, 'c');
      expect(nuevo.toMap()['archivoTamano'], 123);
      expect(nuevo.archivoUrl, 'gs://b/ruta');
    },
  );
  test('Búsqueda por título, descripción, mayúsculas y categoría', () {
    final lista = [
      contenidoCapacitacion(categoria: 'c1'),
      contenidoCapacitacion(),
    ];
    expect(filtrarCapacitaciones(lista, 'LIDERAZGO'), hasLength(2));
    expect(filtrarCapacitaciones(lista, ' FAMILIA '), hasLength(2));
    expect(
      filtrarCapacitaciones(
        lista,
        'amor',
        categoriaId: 'c1',
        categorias: categorias,
      ),
      hasLength(1),
    );
    expect(
      filtrarCapacitaciones(lista, '', categoriaId: '', categorias: categorias),
      hasLength(1),
    );
    expect(filtrarCapacitaciones(lista, 'inexistente'), isEmpty);
  });
  test('URLs activas o locales no se abren desde Markdown', () {
    expect(enlaceCapacitacionSeguro('javascript:alert(1)'), isNull);
    expect(enlaceCapacitacionSeguro('file:///tmp/a'), isNull);
    expect(enlaceCapacitacionSeguro('https://ejemplo.cl'), isNotNull);
  });
  test('Lista de extensiones permitidas, tamaño y MIME', () {
    for (final ext in tiposArchivoCapacitacion.keys) {
      expect(validarArchivoCapacitacion('archivo.$ext', 1), isNull);
    }
    for (final ext in ['exe', 'apk', 'bat', 'cmd', 'ps1', 'sh', 'js', 'zip']) {
      expect(validarArchivoCapacitacion('archivo.$ext', 1), isNotNull);
    }
    expect(
      validarArchivoCapacitacion('a.pdf', limiteArchivoCapacitacion),
      isNull,
    );
    expect(
      validarArchivoCapacitacion('a.pdf', limiteArchivoCapacitacion + 1),
      isNotNull,
    );
    expect(validarArchivoCapacitacion('a.pdf', 0), isNotNull);
    expect(
      validarArchivoCapacitacion(
        'a.pdf',
        100,
        mimeDeclarado: 'application/x-msdownload',
      ),
      isNotNull,
    );
  });
  test('Firmas falsas e imágenes renombradas se rechazan', () {
    final exe = Uint8List.fromList([0x4d, 0x5a, 0, 0]);
    expect(
      validarArchivoCapacitacion('a.pdf', exe.length, bytes: exe),
      isNotNull,
    );
    final texto = Uint8List.fromList('hola'.codeUnits);
    expect(
      validarArchivoCapacitacion('a.pdf', texto.length, bytes: texto),
      isNotNull,
    );
    expect(
      validarArchivoCapacitacion('a.png', texto.length, bytes: texto),
      isNotNull,
    );
    expect(
      validarArchivoCapacitacion('a.jpg', texto.length, bytes: texto),
      isNotNull,
    );
    expect(
      validarArchivoCapacitacion('a.txt', texto.length, bytes: texto),
      isNull,
    );
  });
  test('Office requiere su contenedor real, no ZIP renombrado ni macros', () {
    Uint8List office(String principal, {bool macro = false}) {
      final archivo = Archive()
        ..add(ArchiveFile('[Content_Types].xml', 1, [0]))
        ..add(ArchiveFile(principal, 1, [0]));
      if (macro) archivo.add(ArchiveFile('word/vbaProject.bin', 1, [0]));
      return Uint8List.fromList(ZipEncoder().encode(archivo));
    }

    final doc = office('word/document.xml');
    expect(
      validarArchivoCapacitacion('a.docx', doc.length, bytes: doc),
      isNull,
    );
    expect(
      validarArchivoCapacitacion('a.pptx', doc.length, bytes: doc),
      isNotNull,
    );
    final macro = office('word/document.xml', macro: true);
    expect(
      validarArchivoCapacitacion('a.docx', macro.length, bytes: macro),
      isNotNull,
    );
  });
  test('Rutas de Storage son por tenant y capacitación', () {
    final ruta = rutaArchivoCapacitacion(
      iglesiaId: 'iglesia',
      categoriaId: '',
      capacitacionId: 'c',
      nombre: '../../Guía.pdf',
    );
    expect(ruta, startsWith('capacitaciones/iglesia/general/c/'));
    expect(
      validarReferenciaArchivo(
        'gs://bucket/capacitaciones/iglesia/general/c/a.pdf',
        bucket: 'bucket',
        iglesiaId: 'iglesia',
        capacitacionId: 'c',
      ),
      'capacitaciones/iglesia/general/c/a.pdf',
    );
    for (final url in [
      'gs://bucket/capacitaciones/otra/general/c/a.pdf',
      'gs://bucket/capacitaciones/iglesia/general/otra/a.pdf',
      'gs://otro/capacitaciones/iglesia/general/c/a.pdf',
      'https://publico/a.pdf',
    ]) {
      expect(
        () => validarReferenciaArchivo(
          url,
          bucket: 'bucket',
          iglesiaId: 'iglesia',
          capacitacionId: 'c',
        ),
        throwsFormatException,
      );
    }
  });
  test('Toolbar conserva el texto y envuelve la selección', () {
    final controller = TextEditingController(text: 'hola mundo')
      ..selection = const TextSelection(baseOffset: 0, extentOffset: 4);
    insertarFormatoMarkdown(controller, '**', '**', 'Negrita');
    expect(controller.text, '**hola** mundo');
    controller.dispose();
  });
  for (final rol in ['servidor', 'lider_area', 'admin_iglesia']) {
    testWidgets('Acciones de administración: $rol', (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 640));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AccionesCapacitaciones(
              usuario: usuarioCapacitacion(rol),
              nuevaCategoria: () {},
              nuevoContenido: () {},
            ),
          ),
        ),
      );
      final permitido = rol != 'servidor';
      expect(
        find.text('Nueva categoría'),
        permitido ? findsOneWidget : findsNothing,
      );
      expect(
        find.text('Nueva capacitación'),
        permitido ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('Lectura antigua muestra literalmente los caracteres Markdown', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ReflexionCapacitacion(contenido: '**Literal**', heredada: true),
        ),
      ),
    );
    expect(find.text('**Literal**'), findsOneWidget);
  });
  testWidgets('Markdown y toolbar ligera funcionan en pantalla angosta', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Column(
              children: [
                EditorMarkdownCapacitacion(controller: controller),
                const ReflexionCapacitacion(
                  contenido: '# Título\n**Negrita**\n- Lista\n> Cita',
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('B'));
    expect(controller.text, '**Negrita**');
    expect(tester.takeException(), isNull);
  });
}
