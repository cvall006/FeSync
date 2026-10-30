# Finanzas V1 — validación Android nativa

**Android compilado y ejecutado: SÍ.** Se ejecutó un APK **debug x86_64**, entrada `lib/main.dart`, paquete `com.example.fesync.finanzasdemo`, en el AVD existente `Medium_Phone_API_36.1`. Se usaron los plugins Android reales de Firebase, sin adaptadores FlutterFire de pruebas. No es una validación de dispositivo físico, ARM64, release ni distribución.

## Evidencia del circuito realizado

| Paso efectivamente realizado | Resultado | Evidencia |
| --- | --- | --- |
| Login con correo y contraseña demo | Auth Android autenticó al encargado sintético | `app-arranque.log`, `09-dashboard-corregido.png` |
| Dashboard habitual → Finanzas | Callable normal `finanzasV1Consultar`, región `southamerica-west1`; saldo inicial CLP 10000 | `09-dashboard-corregido.png`, `10-finanzas.png` |
| Nuevo ingreso, caja, categoría ingreso/diezmos, CLP 250 | Confirmado desde el formulario Android; saldo 10250 | `12-ingreso-listo.png`, `13-ingreso-confirmado.png` |
| Nuevo gasto, caja, categoría gasto, CLP 40 | Confirmado desde el formulario Android; saldo 10210 | `15-gasto-listo.png`, `16-gasto-confirmado.png`, `estado-operaciones.json` |
| Historial | Apertura #1, ingreso #2, gasto #3 | `17-historial.png`, `ui-historial.xml` |
| Volver al Dashboard, detener proceso y abrir nuevamente | Sesión conservada; Finanzas vuelve a mostrar 10210, corte 3 y dos recibos del encargado; ningún movimiento adicional | `18-reinicio-dashboard.png`, `19-reinicio-saldo.png`, `estado-reinicio.json` |
| Revocar encargado con el titular sintético | Callable normal `actualizarEncargadoFinanciero`; consulta y gasto posteriores HTTP 403, libro sin cambios | `estado-revocado.json` |
| Actualizar Finanzas en Android después de la revocación | Retira saldo/operaciones y muestra «Acceso no verificable» | `21-revocado-refresco.png`, `ui-revocado-refresco.xml` |
| Cerrar sesión e ingresar como miembro ordinario | Dashboard funciona y no muestra Finanzas; consulta del miembro rechazada HTTP 403 en control local complementario | `24-miembro-dashboard.png`, `ui-miembro.xml`, `estado-operaciones.json` |

Todos los archivos de evidencia están en [finanzas_android_nativo_2026-10-26](finanzas_android_nativo_2026-10-26/). La apertura de CLP 10000 fue preparada por la fixture mediante los callables normales; ingreso y gasto se hicieron **por toques y teclado ADB sobre la interfaz Android**. Las fechas contables introducidas explícitamente fueron `2026-10-26`; el AVD mostraba reloj UTC del día 27. Las verificaciones del libro desde Node son evidencia complementaria, no sustituyen la navegación nativa.

No se ensayaron transferencia, reversión, cambio mensual ni pérdida artificial de respuesta en Android en esta ejecución; sus resultados anteriores no se presentan como pruebas nativas nuevas. El reinicio prueba persistencia de sesión/estado confirmado, no una respuesta deliberadamente perdida.

## Aislamiento y límites observados

- Proyecto fijo **demo-fesync**, Auth `127.0.0.1:9098`, Firestore `127.0.0.1:8088`, Functions `127.0.0.1:5018`. En Android esas direcciones funcionan mediante **`adb reverse` explícito**, con mapeo automático de host desactivado. No se supone que localhost del teléfono sea el PC. Ver `adb-reverse.txt` y la línea de bootstrap en los logs nativos.
- AVD arrancado con `-read-only -no-snapshot -no-window`, sin borrar datos del AVD guardado, y ambos adaptadores QEMU con `restrict=on,ipv6=off`. Los argumentos efectivos constan en `avd-stdout.log`. Esa opción [aísla la red invitada según QEMU](https://www.qemu.org/docs/master/system/invocation.html); los servicios locales se alcanzaron por ADB. La prueba contra `192.0.2.1:443`, dirección reservada TEST-NET, devolvió `Network is unreachable` (`red-negativa.txt`). No se probó conectividad contra Firebase real.
- Los procesos Node de la fixture/Functions usaron la guardia existente `red_local.cjs`, sin credenciales reales y con destinos de emulador fijados. Reglas locales copiadas a configuración temporal; no se consultaron reglas desplegadas. `infraestructura.json` identifica el backend normal usado.
- El SDK nativo **FirebaseInstanceId 21.1.0** intentó obtener un token auxiliar de **Firebase Installations**, pese a tener el autoarranque de Messaging desactivado. Falló por el aislamiento; consta en `app-final.log`. Esto impide afirmar «cero intentos auxiliares»: no se permitió salida hacia Firebase real, y Finanzas sí completó sus llamadas locales. **Mantener el aislamiento del AVD al repetir la prueba**; las banderas demo por sí solas no acreditan que todos los SDK auxiliares eviten intentos externos.
- La retirada automática inmediata del saldo tras revocación **no quedó validada**: la primera captura posterior aún mostraba datos previamente obtenidos; al actualizar se retiraron. El listener nativo registró `GOAWAY / too_many_pings` y posteriormente `PERMISSION_DENIED`. Cada consulta/escritura nueva fue rechazada por el servidor. No se atribuye una causa definitiva al retardo; verificar de nuevo el listener antes de exigir una garantía de invalidación inmediata en pantalla.
- Hubo alertas ANR del launcher/System UI bajo presión de memoria, no un cierre fatal observado de FeSync. Se redujeron tamaño/densidad y animaciones solo en la sesión temporal. La prueba funcional terminó y el AVD y la suite propia de emuladores se cerraron al finalizar; no se guardó snapshot.

## Compilación, dependencias y corrección mínima

Toolchain observado: Flutter **3.47.2**, Dart **3.13.2**, Java JBR **21.0.8**, Gradle **9.3.1**, Android Emulator **36.3.10**, imagen Google Play x86_64 API **36.1**. SDK ya presente, plataformas 34/36 y build-tools 36.0.0/36.1.0. No se instaló otra imagen, plataforma ni dependencia de Pub.

El proyecto principal configura AGP **9.1.0** y Kotlin **2.4.0**. El plugin ya presente `android_file_picker 2.0.1` declara AGP **8.5.2** y Kotlin **1.8.22** en su propio classpath. No se cambiaron estas versiones para evitar descargas. Gradle también resolvió classpaths transitivos requeridos, entre ellos AGP 8.12.1/Kotlin 2.2.0.

Se permitió a `:app:assembleDebug` descargar únicamente lo que su resolución exigió. El log registra **537 URLs de descarga**, incluyendo POM, metadatos y artefactos transitivos; **no son 537 librerías distintas**. Los únicos hosts de esas descargas fueron `dl.google.com` y `repo.maven.apache.org`. Inventario exacto: [dependencias-descargadas.json](finanzas_android_nativo_2026-10-26/dependencias-descargadas.json); registro original: `gradle-online.log`. No se modificaron manifiestos de dependencias ni lockfiles.

Se reprodujo un defecto Android: la clave **ficticia** del bootstrap tenía 41 caracteres. Firebase Functions Android devolvía `IllegalArgumentException: Please set a valid API key` y el Dashboard ocultaba Finanzas. El depurador local permitió leer la excepción (`defecto-nativo.txt`), sin cambiar autorizaciones ni usar una clave real. Se ajustó la cadena sintética al formato de 39 caracteres exigido por el SDK y se mantuvieron consistentes la configuración debug y la guardia web demo. La prueba nueva exige formato, marca ficticia, proyecto demo y coincidencia con Android.

### Pruebas efectivamente ejecutadas

| Validación | Resultado |
| --- | --- |
| Gradle debug con descarga de dependencias necesarias | Salida 0, `BUILD SUCCESSFUL in 11m 29s` (`gradle-online.log`) |
| Gradle debug offline con túneles ADB | Salida 0, `BUILD SUCCESSFUL in 7m 3s` (`gradle-adb-reverse.log`) |
| Gradle debug offline después de corregir la clave ficticia | Salida 0, `BUILD SUCCESSFUL in 1m 41s` (`gradle-corregido.log`) |
| Instalación y ejecución en AVD | `adb install -r`: Success; actividad Android ejecutada; capturas/XML y `apk-instalado.txt` |
| `flutter test --no-pub` | **458 aprobadas, 0 fallos, 7 condicionadas omitidas**; `flutter-test.log` |
| `flutter analyze --no-pub lib/main.dart lib/core/services/firebase_emulator_bootstrap.dart lib/modules/finanzas lib/modules/dashboard/dashboard_screen.dart test/firebase_emulator_bootstrap_test.dart` | Salida 0, **No issues found**, 56.6 s; `flutter-analyze.log` |
| `node --check` de los tres ayudantes Android | Salida 0 |
| Integración nativa normal y controles complementarios locales | Ingreso/gasto, saldo/historial, reinicio, miembro y revocación descritos arriba |

No se repitieron las 1786 Node, 34 integraciones y 92 reglas de FIN9: el backend y las reglas permanecen idénticos al respaldo. Las 7 pruebas Flutter condicionadas omitidas no se cuentan como integraciones aprobadas en esta pasada.

APK debug final: `build/app/outputs/apk/debug/app-debug.apk`, **88518749 bytes**, SHA-256 `c2a35edd433c7af3c22cd1e8bb6b93b0351d3ba81c66e7c5f142997165ef0f17`. No es un artefacto release ni se distribuyó.

### Repetición local acotada

Desde la raíz del proyecto, abrir primero `node test/finanzas_android_nativo/iniciar.cjs` en una consola. El ayudante rechaza proyectos/credenciales alternativos y no vacía emuladores ajenos. Para una repetición, conservar aparte las evidencias actuales y retirar únicamente el archivo de señal `docs/finanzas_android_nativo_2026-10-26/finalizar`; cada corrida crea nuevos actores sintéticos. La fixture permanece hasta esa señal o 45 minutos.

Arrancar el AVD existente con los argumentos documentados arriba, incluyendo **ambos** `-network-user-mode-options restrict=on,ipv6=off` y `-wifi-user-mode-options restrict=on,ipv6=off`. Usar `-port 5562` y dirigir todos los comandos al serial `emulator-5562`. Ejecutar `adb -s emulator-5562 reverse tcp:8088 tcp:8088`, y lo mismo para `9098` y `5018`, antes de iniciar la app.

Comando de compilación utilizado, con configuración demo explícita y caché ya resuelta:

```powershell
$finDemo = Get-Content config/finanzas_v1/emulador.json -Raw | ConvertFrom-Json
$finDefines = ($finDemo.PSObject.Properties | ForEach-Object {
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Name+'='+$_.Value))
}) -join ','
$env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr'
./android/gradlew.bat --offline --no-daemon --max-workers=2 `
  '-Dorg.gradle.jvmargs=-Xmx3G' -p android :app:assembleDebug `
  '-Ptarget=lib/main.dart' '-Ptarget-platform=android-x64' "-Pdart-defines=$finDefines"
adb -s emulator-5562 install -r build/app/outputs/apk/debug/app-debug.apk
adb -s emulator-5562 shell am start -n com.example.fesync.finanzasdemo/com.example.fesync.MainActivity
```

Usar únicamente las credenciales sintéticas de `fixture.json`. `control.cjs estado <etiqueta>` consulta el libro demo; `control.cjs revocar <etiqueta>` revoca solo al encargado de esa fixture por el callable normal. No son herramientas administrativas publicables.

## Archivos y preservación

Cuatro archivos previos modificados en esta intervención:

- `lib/core/services/firebase_emulator_bootstrap.dart`: formato de la clave ficticia demo.
- `android/app/src/debug/google-services.json`: la misma clave ficticia, solo debug.
- `test/finanzas_mvp/servir_web.js`: guardia consistente con esa cadena.
- `test/firebase_emulator_bootstrap_test.dart`: regresión del contrato nativo demo.

Nuevos: `test/finanzas_android_nativo/{iniciar,ejecutar,control}.cjs`, este informe y su carpeta de evidencia. [Diff de esta intervención](finanzas_android_nativo_2026-10-26/intervencion.patch), [integridad](finanzas_android_nativo_2026-10-26/integridad.json), [respaldo](finanzas_android_nativo_2026-10-26/respaldo.json), [estado Git completo](finanzas_android_nativo_2026-10-26/git-status.txt).

Respaldo inicial verificado de **841 rutas**: **837 sin cambios**, las cuatro anteriores modificadas, ninguna perdida; se conserva la eliminación Kotlin preexistente. HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live`, índice idéntico. El repositorio ya estaba sucio y sigue con todos sus cambios previos; `git diff --check` solo señala el espacio final preexistente en `functions/index.js:2047`.

Reglas, backend/motor V1, V2, inventarios, Work, membresía, versiones de Gradle/plugins, firma release y configuración publicable permanecen intactos. Cliente publicable sigue con `FESYNC_FINANZAS_CLIENTE_HABILITADO=false`; no se habilitó el servidor real ni ninguna iglesia real.

## Pendientes para distribución firmada

1. **Firma:** `android/app/build.gradle.kts` todavía asigna la firma debug al build release. Antes de distribuir, un operador autorizado debe aportar/controlar la clave de subida o distribución y definir un `signingConfig` release propio, cargando rutas/alias/contraseñas desde un archivo local excluido de Git o secretos del sistema de compilación. Cambiar release para usarlo y fallar si falta, sin fallback a debug. Respaldar el keystore fuera del repositorio con acceso restringido; usar Play App Signing si corresponde al canal elegido. No imprimir claves/contraseñas en logs ni adjuntar el keystore al paquete. **No se generó, leyó ni expuso una clave real de distribución y no se compiló release.**
2. Confirmar identidad de aplicación/canal y asociación Firebase para la distribución autorizada; aquí solo se instaló el sufijo demo. No asumir que `com.example.fesync` es una identidad final aprobada. Quedan fuera de esta prueba dispositivo físico, ARM64 y comportamiento release firmado.
3. Conservar el aislamiento al probar Android demo y resolver/verificar las limitaciones de SDK auxiliar y listener descritas arriba antes de prometer ausencia de intentos externos o invalidación visual inmediata sin aislamiento/refresco.
4. Las autorizaciones de preflight real, despliegue, activación privada por iglesia y distribución continúan pendientes según FIN9. Esta prueba cierra la falta de compilación/ejecución Android debug; **no autoriza publicación** ni sustituye una validación de release firmada.

No hubo acceso a Firebase real, consultas a producción, despliegues, activaciones reales, commits ni cambio de rama. No se inicia FIN-RELEASE-10 ni otra fase de arquitectura.
