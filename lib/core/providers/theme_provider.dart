import 'package:flutter/material.dart';

class ThemeProvider extends ChangeNotifier {
  bool _modoOscuro = true;

  bool get modoOscuro => _modoOscuro;

  ThemeMode get themeMode => _modoOscuro ? ThemeMode.dark : ThemeMode.light;

  void establecerModoOscuro(bool valor) {
    if (_modoOscuro == valor) {
      return;
    }

    _modoOscuro = valor;
    notifyListeners();
  }
}
