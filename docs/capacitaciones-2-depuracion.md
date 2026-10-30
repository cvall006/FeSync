# Capacitaciones 2.0: permisos y upload detenido

## Diagnóstico verificado

Se leyeron las releases activas de Firebase Rules API del proyecto `fesync-app-2026`, sin modificar el proyecto ni desplegar:

- Firestore: release `cloud.firestore`, actualizada el 2 de octubre de 2026, 19:37:55 UTC. No existe el match `capacitaciones_categorias`. La ruta cae en el deny de subcolecciones desconocidas. El match de `capacitaciones` sí existe y se conserva.
- Storage: release `firebase.storage/fesync-app-2026.firebasestorage.app`, actualizada el 2 de octubre de 2026, 17:32:36 UTC. Solo están permitidas fotografías bajo `usuarios/{userId}/{archivo}`. Todo `capacitaciones/...` cae en `allow read, write: if false`.

Los archivos locales ya contienen los matches necesarios. No se requiere ampliar permisos ni cambiar otras subcolecciones; hace falta que esas reglas estén instaladas en el entorno donde se pruebe, cuando se autorice. Cambiar archivos locales no cambia las reglas activas.

La ruta real de upload es:

```text
capacitaciones/{usuario.iglesiaId}/{categoriaId o general}/{capacitacionId}/{microsegundos}_{nombreSeguro}
```

El archivo usa MIME canónico. Para DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. La ruta coincide exactamente con el match local de Storage. El perfil consultado por las reglas debe pertenecer a esa iglesia y tener rol `admin_iglesia` o `lider_area`; cambiar iglesiaId en el cliente no autoriza acceso cruzado.

## Por qué podía quedar en 0%

El upload está denegado por las reglas activas. Además, el servicio tenía un listener de `snapshotEvents` sin `onError`, aunque el SDK web emite errores tanto por la tarea como por el stream. Los errores del stream podían escapar del manejo del guardado. En el `finally`, se intentaba borrar el objeto nuevo incluso si el upload había sido rechazado y se esperaba esa operación sin límite; la UI solo se restablecía después de terminar el servicio. Tampoco existía un límite para una tarea que no emitiera resultado.

La regresión automatizada reproduce un error `unauthorized` del stream con la tarea aún pendiente: ahora se propaga al editor inmediatamente, no escribe Firestore, no intenta borrar un objeto inexistente y permite reintentar. No se registró una traza de la sesión original del navegador, por lo que no se afirma cuál de estas esperas estaba activa exactamente en esa sesión. Si el depurador se detiene dentro del SDK, hay que continuar la ejecución para que alcance los handlers y el `finally`; no se modificó código de Pub Cache.

## Corrección

- `capacitaciones_service.dart`: manejar errores de stream y tarea mediante una única finalización, limitar upload a dos minutos, cancelar tareas fallidas o vencidas, normalizar progreso 0..1 y notificar cuando termina el upload.
- Cancelación explícita y desde `dispose`, con espera de cancelación de red acotada. El editor puede cancelar la subida y volver a intentar sin guardar datos incompletos.
- Limpiar el objeto nuevo únicamente si la subida terminó y Firestore falló. Desconexión del listener y operaciones de limpieza limitadas a cinco segundos; un fallo de limpieza no sustituye el error original. El archivo anterior continúa eliminándose después de confirmar el nuevo documento.
- `capacitaciones_editor.dart`: mensajes específicos para `FirebaseException`, permisos, cancelación y timeout. En `finally` restablecer ocupado, progreso y cancelación siempre que el widget siga montado, sin depender de que la ruta sea la actual. Tras upload exitoso mostrar procesamiento de metadata en lugar de mantener “Subiendo”.
- Categorías: mensaje claro de permisos y recuperación del estado del formulario.

Se conserva `archivoUrl` como referencia `gs://` resuelta con el SDK autenticado. No se agrega `getDownloadURL`: una URL pública con token no conserva la comprobación de pertenencia a iglesia en cada descarga. Este punto del flujo se implementa mediante la referencia autenticada y la metadata después de upload exitoso; no es la causa del 0%.

## DOCX real

Se localizó `Plan_Presentacion_FeSync.docx` en Descargas y se validó mediante el mismo código de la app: **1.101.904 bytes**, menor que 25 MiB, contenedor Office válido y MIME canónico compatible. No se modificó ni copió su contenido al repositorio. La prueba adicional se activa mediante `FESYNC_DOCX_PRUEBA`; las pruebas normales usan un contenedor DOCX generado localmente y no dependen de ese archivo personal.

## Pruebas y reglas

- `test/capacitaciones_upload_test.dart`: DOCX exitoso, DOCX real opcional, error de stream con tarea pendiente, timeout, UI restaurada, reintento, cancelación y desmontaje durante upload.
- `test/capacitaciones_service_test.dart`: ajuste del doble de upload para cancelación; pruebas existentes de reemplazo y fallos conservadas.
- `test/capacitaciones_rules/capacitaciones.test.js`: creación por líder y upload DOCX canónico añadidos a permisos, aislamiento, tamaño máximo, MIME, ejecutables y HTML existentes.
- `firestore.rules` y `storage.rules`: sin cambios adicionales en esta depuración. Ya contienen las reglas locales de Capacitaciones 2.0; se compilaron y probaron de nuevo en emuladores `demo-fesync`.

Resultados:

| Validación | Resultado |
| --- | --- |
| Formato solo archivos Dart modificados | Correcto |
| `flutter analyze` | Sin observaciones |
| `flutter test`, con el DOCX real opcional habilitado | 68 aprobadas |
| Firestore y Storage en emuladores locales | 8 aprobadas |
| `git diff --check` | Correcto |

Comando de la suite con el archivo real en este equipo:

```powershell
$env:FESYNC_DOCX_PRUEBA = 'C:\Users\igles\Downloads\Plan_Presentacion_FeSync.docx'
flutter test
```

Git mantiene los cambios de Capacitaciones 2.0 sin stage, más esta corrección y su nueva prueba/informe. `.vscode/` sigue siendo preexistente y no se tocó. No se modificaron otros módulos, dependencias ni archivos del SDK durante esta depuración. **No deploy, commit ni push.** La validación de subida real sigue pendiente de instalar las reglas en un entorno autorizado.
