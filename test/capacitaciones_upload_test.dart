import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:share_plus/share_plus.dart' show XFile;
import 'package:file_picker/file_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_archivos.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_editor.dart';
import 'package:fesync/modules/capacitaciones/capacitaciones_service.dart';

import 'capacitaciones_2_test.dart' show usuarioCapacitacion;
import 'capacitaciones_service_test.dart'
    show DbPrueba, StoragePrueba, ReferenciaPrueba, SnapshotPrueba, antiguo;

Uint8List docxValido() => Uint8List.fromList(
  ZipEncoder().encode(
    Archive()
      ..add(ArchiveFile('[Content_Types].xml', 4, '<x/>'.codeUnits))
      ..add(ArchiveFile('word/document.xml', 4, '<w/>'.codeUnits)),
  ),
);

class TaskControlPrueba implements UploadTask {
  final resultado = Completer<TaskSnapshot>();
  final eventos = StreamController<TaskSnapshot>.broadcast(sync: true);
  bool cancelado = false;
  @override
  Stream<TaskSnapshot> get snapshotEvents => eventos.stream;
  @override
  Future<R> then<R>(
    FutureOr<R> Function(TaskSnapshot) onValue, {
    Function? onError,
  }) => resultado.future.then(onValue, onError: onError);
  @override
  Future<bool> cancel() async {
    cancelado = true;
    if (!resultado.isCompleted) {
      resultado.completeError(
        FirebaseException(plugin: 'firebase_storage', code: 'canceled'),
      );
    }
    return true;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class StorageControlPrueba extends StoragePrueba {
  final tareas = <TaskControlPrueba>[];
  SettableMetadata? metadata;
  StorageControlPrueba(super.eventos);
  @override
  Reference ref([String? path]) => ReferenciaControlPrueba(this, path ?? '');
}

class ReferenciaControlPrueba extends ReferenciaPrueba {
  ReferenciaControlPrueba(StorageControlPrueba super.store, super.fullPath);
  @override
  UploadTask putData(Uint8List data, [SettableMetadata? metadata]) {
    final storage = store as StorageControlPrueba;
    storage.eventos.add('subir:$fullPath');
    storage.metadata = metadata;
    final task = TaskControlPrueba();
    storage.tareas.add(task);
    return task;
  }
}

final class ArchivoPickerPrueba extends PlatformFile {
  final Uint8List bytes;
  ArchivoPickerPrueba(this.bytes);
  @override
  String get name => 'Plan_Presentacion_FeSync.docx';
  @override
  Uri get uri => Uri.parse('file:///material.docx');
  @override
  XFile get xFile => XFile.fromData(
    bytes,
    name: name,
    mimeType: tiposArchivoCapacitacion['docx'],
  );
  @override
  int lengthSync() => bytes.length;
  @override
  Future<int> length() async => bytes.length;
  @override
  Future<Uint8List> readAsBytes() async => bytes;
  @override
  Stream<Uint8List> readAsByteStream() => Stream.value(bytes);
}

class PickerPrueba extends FilePickerPlatform {
  @override
  Future<PlatformFile?> pickFile({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    Function(FilePickerStatus)? onFileLoading,
    int compressionQuality = 0,
    AndroidOptions androidOptions = const AndroidOptions(),
    DarwinOptions darwinOptions = const DarwinOptions(),
    WindowsOptions windowsOptions = const WindowsOptions(),
    LinuxOptions linuxOptions = const LinuxOptions(),
    WebOptions webOptions = const WebOptions(),
  }) async => ArchivoPickerPrueba(docxValido());
}

Future<void> abrirEditor(
  WidgetTester tester,
  CapacitacionesService service,
) async {
  final anterior = FilePickerPlatform.instance;
  FilePickerPlatform.instance = PickerPrueba();
  addTearDown(() => FilePickerPlatform.instance = anterior);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) =>
                  CapacitacionEditor(service: service, categorias: const []),
            ),
            child: const Text('Editor'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Editor'));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.widgetWithText(TextField, 'Título'),
    'Plan FeSync',
  );
  await tester.tap(
    find.widgetWithText(DropdownButtonFormField<String>, 'Tipo de contenido'),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Archivo').last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Seleccionar / reemplazar archivo'));
  await tester.tap(find.text('Seleccionar / reemplazar archivo'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Guardar capacitación'));
}

void main() {
  test(
    'DOCX válido conserva MIME canónico y se guarda solo tras upload exitoso',
    () async {
      final eventos = <String>[];
      final storage = StorageControlPrueba(eventos);
      final service = CapacitacionesService(
        usuarioCapacitacion('admin_iglesia'),
        firestore: DbPrueba(eventos),
        firebaseStorage: storage,
      );
      final progreso = <double>[];
      final guardado = service.guardarContenido(
        antiguo,
        bytes: docxValido(),
        nombreArchivo: 'Plan_Presentacion_FeSync.docx',
        progreso: progreso.add,
      );
      expect(eventos.where((e) => e.startsWith('guardar:')), isEmpty);
      storage.tareas.single.resultado.complete(SnapshotPrueba());
      await guardado;
      expect(storage.metadata?.contentType, tiposArchivoCapacitacion['docx']);
      expect(eventos.last, startsWith('guardar:'));
      expect(progreso.last, 1);
    },
  );

  final archivoReal = Platform.environment['FESYNC_DOCX_PRUEBA'];
  if (archivoReal != null) {
    test(
      'Plan_Presentacion_FeSync.docx real cumple validación completa',
      () async {
        final bytes = await File(archivoReal).readAsBytes();
        expect(bytes.length, lessThan(limiteArchivoCapacitacion));
        expect(
          validarArchivoCapacitacion(
            'Plan_Presentacion_FeSync.docx',
            bytes.length,
            bytes: bytes,
            mimeDeclarado: tiposArchivoCapacitacion['docx'],
          ),
          isNull,
        );
      },
    );
  }

  test('Error del stream se propaga aunque la tarea siga pendiente; no guarda ni limpia un objeto inexistente', () async {
    final eventos = <String>[];
    final storage = StorageControlPrueba(eventos);
    final service = CapacitacionesService(
      usuarioCapacitacion('admin_iglesia'),
      firestore: DbPrueba(eventos),
      firebaseStorage: storage,
    );
    final guardado = service.guardarContenido(
      antiguo,
      bytes: docxValido(),
      nombreArchivo: 'a.docx',
    );
    final comprobacion = expectLater(
      guardado,
      throwsA(
        isA<FirebaseException>().having((e) => e.code, 'code', 'unauthorized'),
      ),
    );
    storage.tareas.single.eventos.addError(
      FirebaseException(plugin: 'firebase_storage', code: 'unauthorized'),
    );
    await comprobacion;
    expect(eventos, hasLength(1));
    expect(storage.tareas.single.cancelado, true);
  });

  test(
    'Subida sin eventos tiene límite y se cancela sin guardar Firestore',
    () async {
      final eventos = <String>[];
      final storage = StorageControlPrueba(eventos);
      final service = CapacitacionesService(
        usuarioCapacitacion('admin_iglesia'),
        firestore: DbPrueba(eventos),
        firebaseStorage: storage,
        limiteSubida: const Duration(milliseconds: 20),
      );
      await expectLater(
        service.guardarContenido(
          antiguo,
          bytes: docxValido(),
          nombreArchivo: 'a.docx',
        ),
        throwsA(
          isA<FirebaseException>().having(
            (e) => e.code,
            'code',
            'upload-timeout',
          ),
        ),
      );
      expect(eventos, hasLength(1));
      expect(storage.tareas.single.cancelado, true);
    },
  );

  testWidgets('Storage denegado libera UI y permite reintentar el mismo DOCX', (
    tester,
  ) async {
    final eventos = <String>[];
    final storage = StorageControlPrueba(eventos);
    final service = CapacitacionesService(
      usuarioCapacitacion('lider_area'),
      firestore: DbPrueba(eventos),
      firebaseStorage: storage,
    );
    await abrirEditor(tester, service);
    await tester.tap(find.text('Guardar capacitación'));
    await tester.pump();
    expect(find.text('Subiendo 0%'), findsOneWidget);
    expect(
      tester
          .widget<ElevatedButton>(
            find.widgetWithText(ElevatedButton, 'Guardar capacitación'),
          )
          .onPressed,
      isNull,
    );
    storage.tareas.first.eventos.addError(
      FirebaseException(plugin: 'firebase_storage', code: 'unauthorized'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Subiendo 0%'), findsNothing);
    expect(
      find.text('No fue posible subir el archivo: permisos insuficientes.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<ElevatedButton>(
            find.widgetWithText(ElevatedButton, 'Guardar capacitación'),
          )
          .onPressed,
      isNotNull,
    );
    expect(eventos.where((e) => e.startsWith('guardar:')), isEmpty);
    await tester.tap(find.text('Guardar capacitación'));
    await tester.pump();
    expect(storage.tareas, hasLength(2));
    storage.tareas.last.resultado.complete(SnapshotPrueba());
    await tester.pumpAndSettle();
    expect(eventos.where((e) => e.startsWith('guardar:')), hasLength(1));
    expect(find.text('Guardar capacitación'), findsNothing);
    // El aviso previo de permisos puede seguir delante del aviso de éxito.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Capacitación guardada.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Cancelar subida libera el editor y desmontarlo cancela sin errores de lifecycle',
    (tester) async {
      final eventos = <String>[];
      final storage = StorageControlPrueba(eventos);
      final service = CapacitacionesService(
        usuarioCapacitacion('admin_iglesia'),
        firestore: DbPrueba(eventos),
        firebaseStorage: storage,
      );
      await abrirEditor(tester, service);
      await tester.tap(find.text('Guardar capacitación'));
      await tester.pump();
      await tester.ensureVisible(find.text('Cancelar subida'));
      await tester.tap(find.text('Cancelar subida'));
      await tester.pumpAndSettle();
      expect(
        find.text('Subida cancelada. Puedes volver a intentar.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Guardar capacitación'));
      await tester.tap(find.text('Guardar capacitación'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(storage.tareas.last.cancelado, true);
      expect(eventos.where((e) => e.startsWith('guardar:')), isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
}
