# Respaldo del proyecto FeSync

El repositorio contiene el código Flutter, backend Functions, reglas Firestore y
Storage, configuraciones de ejemplo, pruebas y documentación técnica del trabajo
local. El respaldo se mantiene en la rama `integration/adora-live` del repositorio
`https://github.com/cvall006/FeSync`.

## Qué se conserva fuera de Git

Las dependencias descargadas, compilaciones, cachés, credenciales, certificados,
respaldos de datos y evidencias de ejecución permanecen en el equipo original.
En particular, `migrate_working_dir/` y los JSON, capturas y paquetes generados
dentro de `docs/` no se publican: pueden contener información de producción.
No se eliminan del disco al crear este respaldo.

Las configuraciones cliente Firebase (`firebase_options.dart` y
`google-services.json`) identifican la aplicación y no son credenciales Admin SDK.
Las claves privadas, contraseñas de firma y tokens de sesión no se incluyen.

GitHub respalda el proyecto, no el contenido de Firestore, Storage ni los usuarios
de Firebase Auth. Los datos reales requieren un respaldo separado y privado.

## Recuperar el código

```powershell
git clone --branch integration/adora-live https://github.com/cvall006/FeSync.git
cd FeSync
flutter pub get
npm --prefix functions ci
```

Para ejecutar las pruebas Flutter de Escuela:

```powershell
flutter test --no-pub test/escuela_asignaciones_service_test.dart test/escuela_asignaciones_screen_test.dart
```

Las pruebas de reglas de `test/escuela_rules/ejecutar.cjs` usan exclusivamente un
emulador local y requieren las herramientas y dependencias de pruebas indicadas
en `test/capacitaciones_rules/package.json`. El lanzador actual comprueba la
instalación existente en Windows; no descarga un emulador automáticamente.

## Estado de publicación al crear el respaldo

- Hosting live: `006c1af2a69d68d9`, con Finanzas V1 y ciclos/asignaciones de Escuela.
- Reglas Firestore: `b685784d-af0a-4e10-8d39-0fdbbb1d32d5`.
- Borrado de ciclos: lógico y recuperable, exclusivo de `admin_iglesia`.
- Se conservaron las 23 Functions; las dos funciones antiguas de ingreso no se
  actualizaron en los despliegues de Escuela.

El respaldo del código no ejecuta despliegues. No se debe usar un despliegue global
para reconstruir ese estado: algunas fuentes locales incluyen cambios de backend
que no se publicaron. Los scripts históricos de `docs/` son referencias de las
ejecuciones y dependen de evidencias locales excluidas del repositorio; no son una
automatización portable de restauración de producción.
