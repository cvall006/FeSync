# FIN-MVP: integración habitual y preparación Android

Finanzas funciona desde `lib/main.dart`, inicio de sesión y Dashboard habituales,
contra `demo-fesync`. Android está preparado, pero **no se ejecutó en un teléfono**:
ADB no detectó dispositivos y la validación nativa offline encontró dependencias
ausentes. No se habilitó producción ni se modificó el motor contable.

## Integración comprobada

Se revisó el [informe visual anterior](fin_mvp_visual_2026-10-24.md) y el estado
local. El Dashboard ya reutilizaba `AccesoFinanzasMvp`, pero lo construía solo
con `FESYNC_FINANZAS_DEMO`. Se retiró esa condición. El acceso permanece oculto
hasta que el servidor autoriza al usuario; vuelve a comprobarse al regresar.
Su clave también cambia al cambiar iglesia, pertenencia, rol o titular.

`main.dart` ahora admite el arranque explícito con emuladores antes de crear
servicios. La entrada antigua `main_finanzas_demo.dart` delega en esta misma
aplicación. La pantalla y el servicio financiero existentes se reutilizan.

Se compiló **`-t lib/main.dart`** y se interactuó con Chrome real mediante CDP:
login, Dashboard, Finanzas, cuentas, categorías, operaciones, historial, regreso
al panel y recarga con sesión restaurada. El alojamiento web conserva la página
aislada para impedir el worker de Work; esa página no implementa la navegación.
No se cambió `web/index.html` ni se utilizó Firebase real.

Se conservaron los cinco movimientos anteriores y se añadieron desde los
formularios habituales ingreso **1.000**, gasto **400** y transferencia Caja →
Banco **600**. Resultado: **8 movimientos**, Caja **88.000**, Banco **30.600**,
total **CLP 118.600**, ingresos del mes **31.000**, gastos **12.400**.

Titular y encargado vigente vieron Finanzas; el miembro no lo vio y su consulta
directa recibió `functions/permission-denied`. Revocar al encargado con un
formulario abierto impidió el envío, rechazó un nuevo intento en servidor y
ocultó la navegación. La autorización transaccional existente sigue comprobándose
en cada operación; no se modificó el backend. El encargado quedó revocado.

También se abrieron y cerraron Agenda, Servidores, Capacitaciones, Escuela,
Comunidad, Adora Live, Gestión de Miembros, Configuración de Módulos y Perfil.
No hubo errores visibles. Fue una comprobación de navegación y lectura sobre
la fixture, no una prueba exhaustiva de edición de cada módulo.

Evidencia: [Dashboard](fin_mvp_consolidacion_2026-10-24/19-main-dashboard-final.png),
[Finanzas](fin_mvp_consolidacion_2026-10-24/20-main-finanzas-final.png),
[390 px](fin_mvp_consolidacion_2026-10-24/21-main-390-final.png),
[libro](fin_mvp_consolidacion_2026-10-24/principal-verificado.json),
[roles](fin_mvp_consolidacion_2026-10-24/roles-verificados.json),
[revocación](fin_mvp_consolidacion_2026-10-24/revocacion-verificada.json) y
[otros módulos](fin_mvp_consolidacion_2026-10-24/modulos-verificados.json).
La auditoría de esta sesión registró 186 solicitudes, cero solicitudes a
servicios públicos Firebase y cero excepciones de aplicación.
[Auditoría](fin_mvp_consolidacion_2026-10-24/navegacion-final.json).

## Android preparado y límites reales

El APK debug tiene identificador separado `com.example.fesync.finanzasdemo`,
recursos Firebase ficticios y arranque automático de Firebase/FCM desactivado.
El arranque Dart exige debug y activación explícita de emuladores. Se rechazaron
hosts de producción/LAN; Auth, Firestore y Functions se conectan a puertos
locales. Storage apunta al puerto local 9198 sin servicio y FCM/Google Sign-In
están desactivados en esta prueba. Subidas y notificaciones quedan fuera de ella.

Se corrigió un defecto relevante para USB: FlutterFire remapea por defecto
`127.0.0.1` a `10.0.2.2` en Android. Se desactivó ese remapeo para respetar
`adb reverse`; para Android Emulator se puede indicar `10.0.2.2` explícitamente.
La configuración HTTP debug permite solo esos hosts locales. La separación de
proyecto demo sigue las [indicaciones de Firebase](https://firebase.google.com/docs/emulator-suite/connect_auth),
y la desactivación nativa de FCM las [indicaciones de FCM](https://firebase.google.com/docs/cloud-messaging/android/get-started).

`adb devices -l` devolvió lista vacía. Gradle offline no llegó a validar el APK:
faltan `com.android.tools.build:gradle:8.5.2` y
`org.jetbrains.kotlin:kotlin-gradle-plugin:1.8.22`, requeridos por
`android_file_picker`. No se instalaron ni descargaron dependencias.
El aislamiento Android se comprobó por configuración y código; falta confirmarlo
dinámicamente en el dispositivo. No hay capturas Android ni APK validado.

[Estado ADB](fin_mvp_consolidacion_2026-10-24/adb-devices.log),
[log Gradle](fin_mvp_consolidacion_2026-10-24/android-gradle.log),
[preparación](fin_mvp_consolidacion_2026-10-24/android-preparacion.json) y
[pasos manuales USB](fin_mvp_android_manual_2026-10-24.md).

## Verificación y archivos

| Comprobación final | Resultado |
| --- | --- |
| Suite Flutter completa | **441 aprobadas**, 1 omisión intencional de la prueba activable de emuladores |
| `flutter analyze --no-pub` | **No issues found** |
| Web debug, `lib/main.dart`, sin pub | Compilación correcta |
| Flujo normal, roles y revocación con SDK reales | Aprobados en Chrome + emuladores |
| Android | Sin dispositivo; compilación bloqueada por caché incompleta |

[Pruebas](fin_mvp_consolidacion_2026-10-24/flutter-test-final.log),
[análisis](fin_mvp_consolidacion_2026-10-24/flutter-analyze-final.log),
[compilación](fin_mvp_consolidacion_2026-10-24/build-main-web-final.log).
Las 1.770 pruebas Node anteriores se conservan como antecedente; no se presentan
como una nueva ejecución, pues no cambió código del servidor.

Archivos existentes modificados en esta tarea:

- `lib/main.dart`, `lib/main_finanzas_demo.dart`: arranque habitual compartido.
- `lib/modules/dashboard/dashboard_screen.dart`: acceso sin condición demo y
  renovación del contexto.
- `lib/core/services/auth_service.dart`, `lib/modules/auth/auth_screen.dart`:
  evitar Google Sign-In y su inicialización al cerrar sesión en la prueba local.
- `android/app/build.gradle.kts`, `android/app/src/debug/AndroidManifest.xml`:
  separación y protección del APK debug.
- `test/finanzas_mvp/sesion.js`: instrucciones de arranque normal y USB.

Nuevos: `lib/core/services/firebase_emulator_bootstrap.dart`,
`test/firebase_emulator_bootstrap_test.dart`,
`android/app/src/debug/google-services.json` y
`android/app/src/debug/res/xml/finanzas_demo_network_security.xml`, además de
documentación y evidencia. El resto del código local se conservó por hash,
incluidos V2, inventarios, herramientas Work, reglas, dependencias y motor V1.
Gradle retiró una marca temporal `.salive` de su compilador; no se borraron fuentes.
[Integridad](fin_mvp_consolidacion_2026-10-24/integridad.json).

Sigue el espacio final preexistente de `functions/index.js:2021`, fuera del
alcance. No hubo commits, cambio de rama, despliegues ni instalaciones.

Pendiente para Android: resolver esas dependencias nativas, compilar y ejecutar
el recorrido USB. Pendiente para producción: los callables `finanzasMvp*` siguen
exportados **solo por el runtime de emuladores**; no se exponen desde
`functions/index.js`. La integración cliente está disponible, pero no se afirma
que Finanzas esté habilitado en Firebase real. No se abrió otra fase de arquitectura.

La aplicación compilada y los emuladores siguen disponibles en
<http://localhost:7358/>; usuario ficticio `admin@finanzas.demo`, contraseña
`SoloDemo123!`. El Chrome automatizado se cerró y los datos continúan efímeros.
