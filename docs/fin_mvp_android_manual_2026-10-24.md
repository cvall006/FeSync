# FIN-MVP: prueba manual Android por USB

Estado actual: no hay dispositivo ADB conectado. No se ejecutaron estos pasos en
Android. La compilación offline está bloqueada por dependencias nativas ausentes
de `android_file_picker` (AGP 8.5.2 y Kotlin 1.8.22). Resolverlas es requisito
para producir el APK; `--no-pub` evita resolver paquetes Dart, pero no sustituye
la caché de Gradle. No se descargó nada durante la validación.

## Preparar el equipo y el teléfono

1. Conectar un teléfono por USB, habilitar depuración USB y aceptar su huella.
   Usar modo avión, sin Wi-Fi ni datos móviles, para comprobar que todo el flujo
   de esta prueba depende únicamente del enlace USB y los emuladores locales.
2. Desde `C:\Otro\fesync`, comprobar ADB y anotar el identificador autorizado:

```powershell
$adb = 'C:/Users/igles/AppData/Local/Android/sdk/platform-tools/adb.exe'
& $adb devices -l
$serialDemo = '<ID_DEL_TELEFONO>'
& $adb -s $serialDemo reverse tcp:8088 tcp:8088
& $adb -s $serialDemo reverse tcp:9098 tcp:9098
& $adb -s $serialDemo reverse tcp:5008 tcp:5008
& $adb -s $serialDemo reverse --list
```

Los emuladores Auth 9098, Firestore 8088 y Functions 5008 se dejaron activos.
Si ya terminaron, iniciarlos en otra terminal, sin ocupar ni reiniciar una sesión
existente:

```powershell
node test/finanzas_mvp/iniciar.js
```

3. Con las dependencias Android resueltas, ejecutar la **entrada habitual**:

```powershell
flutter run --debug --no-pub -t lib/main.dart -d $serialDemo --dart-define=FESYNC_FINANZAS_DEMO=true --dart-define=FESYNC_EMULATOR_HOST=127.0.0.1
```

No usar release/profile ni omitir la bandera demo. El paquete debug es
`com.example.fesync.finanzasdemo`, con etiqueta «FeSync demo local». No reemplaza
el paquete normal. Si se usa Android Emulator en lugar de teléfono USB, indicar
`FESYNC_EMULATOR_HOST=10.0.2.2`.

En la salida Flutter debe aparecer proyecto `demo-fesync` y puertos locales
9098/8088/5008. No deben aparecer destinos Firebase reales. Storage está dirigido
a 9198, sin servidor; no se probarán subidas. FCM y Google Sign-In están
desactivados. El login local se hace por correo y contraseña ficticios.

## Recorrido y evidencia a recoger

1. Ingresar con `admin@finanzas.demo` / `SoloDemo123!`. Abrir Finanzas desde el
   Dashboard, volver, abrir Perfil y Gestión de Miembros y regresar a Finanzas.
2. Revisar cuentas, categorías, configuración CLP, resumen e historial. Con la
   sesión actual el saldo es 118.600, Caja 88.000, Banco 30.600 y hay 8 movimientos.
   Si se reiniciaron los emuladores, la fixture será nueva: inicializar el libro,
   crear catálogo y registrar saldo inicial como en el informe visual anterior.
3. Probar teclado numérico, campo obligatorio, cero, decimal `1.5`, fecha
   incorrecta, scroll con teclado abierto, rotación y botón Atrás. Los rechazos
   no deben crear movimientos ni perder la solicitud pendiente.
4. Registrar ingreso 1.000, gasto 400 y transferencia Caja → Banco 600. Desde el
   estado actual se esperan 11 movimientos, saldo 119.200, Caja 88.000 y Banco
   31.200. Cerrar y reabrir la aplicación y verificar que coincidan.
5. Ingresar como `miembro@finanzas.demo` con la misma contraseña ficticia:
   Finanzas no debe aparecer. El encargado quedó revocado en la prueba web;
   tampoco debe tener acceso mientras no se vuelva a designar.
6. Para repetir designación/revocación usar el callable administrativo existente
   `actualizarEncargadoFinanciero` **en el puerto 5008 del proyecto demo-fesync**:
   `{iglesiaId: 'fin_mvp_demo', accion: 'designar', encargadoUid: UID_DE_ENCARGADO}`
   o `{iglesiaId: 'fin_mvp_demo', accion: 'revocar', encargadoUid: null}`,
   autenticado como titular demo. Abrir un formulario del encargado, revocar y
   confirmar: no debe enviarse una nueva operación ni seguir visible el acceso.

Registrar capturas de Dashboard, operación, resumen e intento tras revocación,
junto con modelo, versión Android, dimensiones/orientación y resultado real.
Una captura de Chrome con ancho móvil no es evidencia de ejecución Android.

Para retirar solamente las redirecciones de esta prueba al terminar:

```powershell
& $adb -s $serialDemo reverse --remove tcp:8088
& $adb -s $serialDemo reverse --remove tcp:9098
& $adb -s $serialDemo reverse --remove tcp:5008
```
