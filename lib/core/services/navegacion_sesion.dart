import 'dart:async';

import 'package:flutter/material.dart';

StreamSubscription<bool> observarNavegacionSesion({
  required Stream<bool> cambios,
  required bool inicialmenteAutenticado,
  required GlobalKey<NavigatorState> navigatorKey,
  required VoidCallback onSesionCerrada,
  required VoidCallback onSesionAbierta,
}) {
  var autenticadoAnterior = inicialmenteAutenticado;
  return cambios.distinct().listen((autenticado) {
    if (autenticado == autenticadoAnterior) return;
    autenticadoAnterior = autenticado;
    if (autenticado) {
      onSesionAbierta();
      return;
    }
    onSesionCerrada();
    // RootGate first rebuilds as login; then remove every secondary route.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      navigatorKey.currentState?.popUntil((route) => route.isFirst);
    });
  });
}
