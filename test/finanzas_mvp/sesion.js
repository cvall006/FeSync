'use strict';
const { abrir, preparar } = require('./soporte');
(async () => {
  const db = abrir(); await preparar(db); await db.terminate();
  console.log('\nFixtures NUEVAS preparadas, sin movimientos ni protocolo.');
  console.log('Acceso: admin@finanzas.demo / SoloDemo123!');
  console.log('También: encargado@finanzas.demo, miembro@finanzas.demo, lider@finanzas.demo. Misma contraseña ficticia.');
  console.log('Flutter web (aplicación habitual): flutter build web --debug --no-pub --no-web-resources-cdn -t lib/main.dart --dart-define=FESYNC_FINANZAS_DEMO=true');
  console.log('Android USB: adb reverse tcp:8088 tcp:8088; adb reverse tcp:9098 tcp:9098; adb reverse tcp:5008 tcp:5008');
  console.log('Android debug: flutter run --debug --no-pub -t lib/main.dart --dart-define=FESYNC_FINANZAS_DEMO=true --dart-define=FESYNC_EMULATOR_HOST=127.0.0.1 -d <ID_ADB>');
  console.log('Servidor web: node test/finanzas_mvp/servir_web.js');
  console.log('Navegador: http://localhost:7358/finanzas_demo.html (servidor demo aislado; sin workers de Work).');
  console.log('Ctrl+C para terminar. Los datos son efímeros; no se exportan ni se conectan a producción.');
  setInterval(() => {}, 30000);
})().catch(e => { console.error(e); process.exitCode=1; });
