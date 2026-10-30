enum EstadoResultadoIngreso {
  confirmado,
  incierto,
  rechazado,
  requiereDecision,
  requiereReconciliacion,
}

class ResultadoIngreso {
  const ResultadoIngreso(this.estado, this.mensaje);
  final EstadoResultadoIngreso estado;
  final String mensaje;
  bool get confirmado => estado == EstadoResultadoIngreso.confirmado;
}
