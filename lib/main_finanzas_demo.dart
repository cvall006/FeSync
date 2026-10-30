import 'main.dart' as app;

/// Compatibilidad con las instrucciones anteriores. La aplicación es main.dart.
Future<void> main() async {
  if (!const bool.fromEnvironment('FESYNC_FINANZAS_DEMO')) {
    throw StateError('Esta entrada requiere FESYNC_FINANZAS_DEMO=true.');
  }
  await app.main();
}
