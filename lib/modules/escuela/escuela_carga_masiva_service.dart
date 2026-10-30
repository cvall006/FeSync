import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'escuela_asignaciones_models.dart';

class EscuelaCargaFila {
  const EscuelaCargaFila(
    this.hermanoUid,
    this.moduloId,
    this.resultado,
    this.mensaje,
  );
  final String hermanoUid, moduloId, resultado, mensaje;
}

abstract interface class EscuelaCargaRepositorio {
  Future<List<EscuelaCargaFila>> revisar({
    required String cicloId,
    required List<String> hermanos,
    required Map<String, EstadoEscuela> modulos,
    required bool confirmar,
  });
}

/// Cada lote concilia de nuevo en el servidor. Una respuesta perdida no obliga
/// a repetir escrituras: los registros ya confirmados se omiten por módulo.
class EscuelaCargaMasivaService implements EscuelaCargaRepositorio {
  EscuelaCargaMasivaService({
    required this.iglesiaId,
    required this.actorUid,
    String? Function()? uidActual,
    Future<dynamic> Function(Map<String, dynamic>)? invocar,
  }) : _uidActual = uidActual ?? (() => FirebaseAuth.instance.currentUser?.uid),
       _invocar = invocar ?? _llamar;
  final String iglesiaId, actorUid;
  final String? Function() _uidActual;
  final Future<dynamic> Function(Map<String, dynamic>) _invocar;

  static Future<dynamic> _llamar(Map<String, dynamic> datos) async {
    final respuesta =
        await FirebaseFunctions.instanceFor(region: 'southamerica-west1')
            .httpsCallable(
              'escuelaCargarModulos',
              options: HttpsCallableOptions(
                timeout: const Duration(seconds: 140),
              ),
            )
            .call<dynamic>(datos);
    return respuesta.data;
  }

  @override
  Future<List<EscuelaCargaFila>> revisar({
    required String cicloId,
    required List<String> hermanos,
    required Map<String, EstadoEscuela> modulos,
    required bool confirmar,
  }) async {
    if (hermanos.isEmpty || modulos.isEmpty || modulos.length > 30) {
      throw ArgumentError('Selecciona hermanos y entre 1 y 30 módulos.');
    }
    final filas = <EscuelaCargaFila>[];
    for (var inicio = 0; inicio < hermanos.length; inicio += 30) {
      if (_uidActual() != actorUid) {
        throw StateError('La sesión cambió. Vuelve a entrar a Escuela.');
      }
      final grupo = hermanos.skip(inicio).take(30).toList();
      try {
        final respuesta = await _invocar({
          'iglesiaId': iglesiaId,
          'cicloId': cicloId,
          'hermanos': grupo,
          'modulos': modulos.entries
              .map((m) => {'moduloId': m.key, 'estado': m.value.valor})
              .toList(),
          'confirmar': confirmar,
        });
        if (_uidActual() != actorUid) {
          throw StateError('La sesión cambió. Vuelve a entrar a Escuela.');
        }
        for (final fila in (respuesta as Map)['resultados'] as List) {
          filas.add(
            EscuelaCargaFila(
              fila['hermanoUid'] as String,
              fila['moduloId'] as String,
              fila['resultado'] as String,
              fila['mensaje'] as String,
            ),
          );
        }
      } on FirebaseFunctionsException catch (e) {
        for (final uid in hermanos.skip(inicio)) {
          for (final modulo in modulos.keys) {
            filas.add(
              EscuelaCargaFila(
                uid,
                modulo,
                'error',
                ['unauthenticated', 'permission-denied'].contains(e.code)
                    ? 'Sin autorización vigente. Vuelve a entrar a Escuela.'
                    : 'Resultado no confirmado. Revisa y reintenta para conciliar sin duplicar.',
              ),
            );
          }
        }
        break; // No enviar más lotes después de un resultado incierto.
      }
    }
    return filas;
  }
}
