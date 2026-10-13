import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../core/models/app_models.dart';
import 'capacitaciones_archivos.dart';
import 'capacitaciones_logica.dart';
import 'capacitaciones_models.dart';

class CancelacionSubidaCapacitacion {
  final _senal = Completer<void>();
  UploadTask? _task;

  void cancelar() {
    if (!_senal.isCompleted) _senal.complete();
    final task = _task;
    if (task != null) unawaited(_cancelarTask(task));
  }

  Future<void> _cancelarTask(UploadTask task) async {
    try {
      await task.cancel().timeout(const Duration(seconds: 5));
    } catch (_) {
      // La cancelación de red no debe impedir liberar el editor.
    }
  }
}

class CapacitacionesService {
  final UsuarioModel usuario;
  final FirebaseFirestore db;
  final FirebaseStorage storage;
  final Duration limiteSubida;
  final Duration limiteLimpieza;
  CapacitacionesService(
    this.usuario, {
    FirebaseFirestore? firestore,
    FirebaseStorage? firebaseStorage,
    this.limiteSubida = const Duration(minutes: 2),
    this.limiteLimpieza = const Duration(seconds: 5),
  }) : db = firestore ?? FirebaseFirestore.instance,
       storage = firebaseStorage ?? FirebaseStorage.instance;

  CollectionReference<Map<String, dynamic>> get contenidos => db
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('capacitaciones');
  CollectionReference<Map<String, dynamic>> get categorias => db
      .collection('iglesias')
      .doc(usuario.iglesiaId)
      .collection('capacitaciones_categorias');
  void _administrar() {
    if (!puedeAdministrarCapacitaciones(usuario)) {
      throw StateError('No tienes permisos de administración.');
    }
  }

  Future<void> guardarCategoria(CapacitacionCategoriaModel categoria) async {
    _administrar();
    if (categoria.nombre.trim().isEmpty) {
      throw StateError('Ingresa el nombre de la categoría.');
    }
    if (categoria.id.isEmpty) {
      await categorias.add({
        ...categoria.toMap(),
        'creadorUid': usuario.uid,
        'fechaCreacion': FieldValue.serverTimestamp(),
      });
    } else {
      await categorias.doc(categoria.id).update({
        'nombre': categoria.nombre.trim(),
        'descripcion': categoria.descripcion.trim(),
        'orden': categoria.orden,
        'activa': categoria.activa,
      });
    }
  }

  Reference _referencia(String url, String id) => storage.ref(
    validarReferenciaArchivo(
      url,
      bucket: storage.ref().bucket,
      iglesiaId: usuario.iglesiaId,
      capacitacionId: id,
    ),
  );

  Future<String?> guardarContenido(
    CapacitacionModel contenido, {
    CapacitacionModel? anterior,
    Uint8List? bytes,
    String? nombreArchivo,
    void Function(double)? progreso,
    void Function()? archivoSubido,
    CancelacionSubidaCapacitacion? cancelacion,
  }) async {
    _administrar();
    if (contenido.titulo.trim().isEmpty) throw StateError('Ingresa un título.');
    if (contenido.esArchivo && bytes == null && contenido.archivoUrl.isEmpty) {
      throw StateError('Selecciona un archivo.');
    }
    final doc = anterior == null
        ? contenidos.doc()
        : contenidos.doc(anterior.id);
    final datos = contenido.toMap();
    Reference? nuevoArchivo;
    StreamSubscription<TaskSnapshot>? subscription;
    UploadTask? task;
    var subido = false;
    var confirmado = false;
    try {
      if (bytes != null) {
        final nombre = nombreArchivo ?? '';
        final error = validarArchivoCapacitacion(
          nombre,
          bytes.length,
          bytes: bytes,
        );
        if (error != null) throw StateError(error);
        final unico =
            '${DateTime.now().microsecondsSinceEpoch}_${nombreStorageSeguro(nombre)}';
        nuevoArchivo = storage.ref(
          rutaArchivoCapacitacion(
            iglesiaId: usuario.iglesiaId,
            categoriaId: contenido.categoriaId,
            capacitacionId: doc.id,
            nombre: unico,
          ),
        );
        final mime =
            tiposArchivoCapacitacion[extensionArchivoCapacitacion(nombre)]!;
        task = nuevoArchivo.putData(
          bytes,
          SettableMetadata(
            contentType: mime,
            contentDisposition:
                'attachment; filename="${nombreStorageSeguro(nombre)}"',
          ),
        );
        final fin = Completer<void>();
        void fallar(Object error, StackTrace stack) {
          if (!fin.isCompleted) fin.completeError(error, stack);
        }

        // Storage comunica errores tanto por la tarea como por el stream.
        unawaited(
          task.then<void>((_) {
            subido = true;
            if (!fin.isCompleted) fin.complete();
          }, onError: fallar),
        );
        subscription = task.snapshotEvents.listen((snapshot) {
          if (snapshot.totalBytes > 0) {
            progreso?.call(
              (snapshot.bytesTransferred / snapshot.totalBytes).clamp(0, 1),
            );
          }
        }, onError: fallar);
        cancelacion?._task = task;
        await Future.any<void>([
          fin.future,
          if (cancelacion != null)
            cancelacion._senal.future.then<void>((_) {
              throw FirebaseException(
                plugin: 'firebase_storage',
                code: 'canceled',
              );
            }),
        ]).timeout(
          limiteSubida,
          onTimeout: () {
            throw FirebaseException(
              plugin: 'firebase_storage',
              code: 'upload-timeout',
            );
          },
        );
        progreso?.call(1);
        archivoSubido?.call();
        datos.addAll({
          'archivoUrl': 'gs://${nuevoArchivo.bucket}/${nuevoArchivo.fullPath}',
          'archivoNombre': nombre,
          'archivoTipo': mime,
          'archivoTamano': bytes.length,
        });
      }
      if (anterior == null) {
        datos['fechaCreacion'] = FieldValue.serverTimestamp();
      }
      await doc.set(datos, SetOptions(merge: true));
      confirmado = true;
    } finally {
      cancelacion?._task = null;
      if (!subido && task != null) {
        unawaited(CancelacionSubidaCapacitacion()._cancelarTask(task));
      }
      try {
        await subscription?.cancel().timeout(limiteLimpieza);
      } catch (_) {
        // Preservar el error original aunque falle la desconexión del listener.
      }
      // Una subida rechazada no creó un objeto que haya que eliminar.
      if (!confirmado && subido && nuevoArchivo != null) {
        try {
          await nuevoArchivo.delete().timeout(limiteLimpieza);
        } catch (_) {
          /* Preserve the original write/upload error. */
        }
      }
    }
    // The old object is deleted only after both upload and Firestore commit.
    if (anterior != null &&
        anterior.archivoUrl.isNotEmpty &&
        anterior.archivoUrl != datos['archivoUrl']) {
      try {
        await _borrarArchivo(anterior.archivoUrl, anterior.id);
      } catch (_) {
        return 'Contenido guardado; no se pudo limpiar el archivo anterior. Contacta al administrador.';
      }
    }
    return null;
  }

  Future<void> _borrarArchivo(String url, String id) async {
    try {
      await _referencia(url, id).delete().timeout(limiteLimpieza);
    } on FirebaseException catch (error) {
      if (error.code != 'object-not-found') rethrow;
    }
  }

  Future<String?> eliminarContenido(CapacitacionModel contenido) async {
    _administrar();
    if (contenido.archivoUrl.isNotEmpty) {
      _referencia(
        contenido.archivoUrl,
        contenido.id,
      ); // Validate before deleting any document.
    }
    await contenidos.doc(contenido.id).delete();
    if (contenido.archivoUrl.isNotEmpty) {
      try {
        await _borrarArchivo(contenido.archivoUrl, contenido.id);
      } catch (_) {
        return 'Contenido eliminado; su archivo requiere limpieza por un administrador.';
      }
    }
    return null;
  }

  Future<Uint8List> leerArchivo(CapacitacionModel contenido) async {
    final bytes = await _referencia(
      contenido.archivoUrl,
      contenido.id,
    ).getData(limiteArchivoCapacitacion);
    if (bytes == null) throw StateError('El archivo no está disponible.');
    final error = validarArchivoCapacitacion(
      contenido.archivoNombre,
      bytes.length,
      bytes: bytes,
      mimeDeclarado: contenido.archivoTipo.isEmpty
          ? null
          : contenido.archivoTipo,
    );
    if (error != null) throw StateError(error);
    return bytes;
  }
}
