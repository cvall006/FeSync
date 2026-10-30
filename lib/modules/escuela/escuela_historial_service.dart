import 'dart:async';

import 'escuela_asignaciones_models.dart';
import 'escuela_asignaciones_service.dart';

class EscuelaHistorialCiclo {
  const EscuelaHistorialCiclo(this.ciclo, this.asignaciones);
  final EscuelaCiclo ciclo;
  final List<EscuelaAsignacion> asignaciones;
  Iterable<EscuelaAsignacion> get registros =>
      asignaciones.expand((a) => a.registros);
  int contar(EstadoEscuela estado) =>
      registros.where((a) => a.estado == estado).length;
  int get completados => contar(EstadoEscuela.completado);
  int get total => registros.length;
  double get progreso => total == 0 ? 0 : completados / total;
  EscuelaHistorialCiclo delHermano(String uid) => EscuelaHistorialCiclo(
    ciclo,
    asignaciones.where((a) => a.hermanoUid == uid).toList(),
  );
}

abstract interface class EscuelaHistorialRepositorio {
  Stream<List<EscuelaHistorialCiclo>> historial({String? hermanoUid});
}

/// Consultas por ruta de iglesia, sin collectionGroup ni índices nuevos.
/// El historial propio lee únicamente el documento del UID en cada ciclo.
class EscuelaHistorialService implements EscuelaHistorialRepositorio {
  EscuelaHistorialService(this.fuente);
  final EscuelaHistorialFuente fuente;

  @override
  Stream<List<EscuelaHistorialCiclo>> historial({String? hermanoUid}) {
    late StreamController<List<EscuelaHistorialCiclo>> salida;
    StreamSubscription<List<EscuelaCiclo>>? ciclosSub;
    final subs = <StreamSubscription<dynamic>>[];
    var cerrado = false, fallo = false, revision = 0;
    Future<void> cola = Future.value();
    void error(Object e, StackTrace s) {
      if (!cerrado && !fallo) {
        fallo = true;
        salida.addError(e, s);
      }
    }

    Future<void> observar(List<EscuelaCiclo> ciclos, int version) async {
      final previas = List.of(subs);
      subs.clear();
      await Future.wait(previas.map((s) => s.cancel()));
      if (cerrado || fallo || version != revision) return;
      if (ciclos.isEmpty) {
        salida.add(const []);
        return;
      }
      final valores = <String, List<EscuelaAsignacion>>{};
      for (final ciclo in ciclos) {
        final stream = hermanoUid == null
            ? fuente.asignaciones(ciclo.id)
            : fuente
                  .asignacionDe(ciclo.id, hermanoUid)
                  .map((a) => a == null ? <EscuelaAsignacion>[] : [a]);
        subs.add(
          stream.listen((asignaciones) {
            if (cerrado || fallo || version != revision) return;
            valores[ciclo.id] = asignaciones;
            // No mostrar porcentajes calculados a partir de una carga parcial.
            if (valores.length == ciclos.length) {
              salida.add(
                List.unmodifiable(
                  ciclos.map(
                    (c) => EscuelaHistorialCiclo(
                      c,
                      List.unmodifiable(valores[c.id]!),
                    ),
                  ),
                ),
              );
            }
          }, onError: error),
        );
      }
    }

    salida = StreamController<List<EscuelaHistorialCiclo>>(
      onListen: () {
        try {
          ciclosSub = fuente.ciclos().listen((ciclos) {
            final version = ++revision;
            cola = cola
                .then((_) => observar(ciclos, version))
                .catchError((Object e, StackTrace s) => error(e, s));
          }, onError: error);
        } catch (e, s) {
          error(e, s);
        }
      },
      onCancel: () async {
        cerrado = true;
        revision++;
        await ciclosSub?.cancel();
        await cola;
        await Future.wait(subs.map((s) => s.cancel()));
        subs.clear();
      },
    );
    return salida.stream;
  }
}
