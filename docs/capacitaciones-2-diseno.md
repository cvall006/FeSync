# Capacitaciones 2.0

## Auditoría

El módulo tenía dos archivos: pantalla y modelo. Usa `iglesias/{iglesiaId}/capacitaciones`, con `titulo`, `descripcion`, `tipo` (`texto`/`video`), `contenido`, `linkVideo` y `fechaCreacion`. El modelo interpreta documentos sin tipo como texto. Admin y líder crean/editan/eliminan según UI y reglas; cualquier miembro de la iglesia lee. Los vídeos se abren externamente y las lecturas se muestran como texto literal. Dashboard y notificaciones ya abren la pantalla del módulo. No se requiere cambiar esas rutas ni Functions.

Validación previa: analyze sin incidencias; 41 pruebas aprobadas.

## Diseño

- Mantener documentos y colección existentes. Categorías nuevas en `capacitaciones_categorias`. General es una categoría virtual, sin documento ni migración. Categorías inactivas se muestran únicamente a administradores; sus contenidos siguen existiendo.
- Extender modelo con campos opcionales; `tipoContenido` ausente conserva el renderer heredado. Nuevas reflexiones usan Markdown y conservan `tipo: texto`; enlaces conservan `tipo: video` y `linkVideo` para compatibilidad. Adjuntos usan `tipo: archivo`.
- Pantalla de temas con contadores y búsqueda; al entrar, filtrar el snapshot por categoría y título/descripción/contenido. Mostrar contenidos huérfanos en General sin modificar documentos.
- Editores StatefulWidget: controllers se liberan en dispose, después del desmontaje. El guardado espera upload y Firestore; no cierra rutas ajenas y bloquea doble pulsación.
- Servicio de datos por iglesia. Subir un nuevo objeto único, confirmar Firestore y después eliminar el objeto anterior. Si Firestore falla, limpiar únicamente el upload recién creado. El borrado verifica tenant, bucket e ID de capacitación antes de tocar Storage.
- Validación cliente: extensión, máximo 25 MiB, MIME detectado y firmas de PDF/imagen/documentos; rechazar binarios ejecutables. No se puede certificar que documentos Office o HTML carezcan de contenido activo sin escáner backend.
- `archivoUrl` guarda `gs://bucket/capacitaciones/iglesia/categoria/capacitacion/archivo`. El SDK obtiene bytes con autenticación. No crear URLs públicas con download tokens. Web abre PDF mediante Blob o descarga documentos; HTML siempre descarga. Móvil comparte bytes con apps del sistema. Imágenes se muestran desde memoria.
- Markdown no renderiza HTML; enlaces HTTP(S) externos, imágenes Markdown remotas deshabilitadas. No WebView ni renderer Office propio.
- Reglas locales: categorías y adjuntos aislados por iglesia, administración por admin/líder; Storage valida tamaño, extensión y MIME. No desplegar.

## Validación y pendientes

Añadir tests de modelos, compatibilidad, filtros, roles, toolbar y políticas de archivos/rutas. Probar reglas con emuladores si el entorno dispone de Java y Firebase CLI. No usar ni modificar datos reales para tests automatizados. La verificación manual de uploads y permisos necesita las reglas nuevas instaladas en un entorno de pruebas; producción no se cambia en este bloque.

## Implementación e informe final

### Archivos

| Archivos | Responsabilidad |
| --- | --- |
| `lib/modules/capacitaciones/capacitaciones_models.dart` | Modelo existente extendido y nuevo modelo de categoría. |
| `lib/modules/capacitaciones/capacitaciones_screen.dart` | Temas, contadores, búsqueda global y por categoría, navegación y CRUD. |
| `lib/modules/capacitaciones/capacitaciones_logica.dart` | Roles, categorías visibles, General, búsqueda y enlaces seguros. |
| `lib/modules/capacitaciones/capacitaciones_service.dart` | Firestore y Storage por iglesia, progreso, reemplazo y limpieza. |
| `lib/modules/capacitaciones/capacitaciones_archivos.dart` | Tamaño, extensión, MIME, firmas y referencias de Storage. |
| `lib/modules/capacitaciones/capacitaciones_editor.dart` | Formularios de categoría y capacitación, controladores y estados de guardado. |
| `lib/modules/capacitaciones/capacitaciones_markdown.dart` | Toolbar y lectura Markdown o literal heredada. |
| `lib/modules/capacitaciones/capacitaciones_detalle.dart` | Lectura, enlaces, datos del adjunto y acciones de apertura/descarga. |
| `lib/modules/capacitaciones/capacitaciones_widgets.dart` | Tarjetas y acciones según rol. |
| `lib/modules/capacitaciones/capacitaciones_descarga*.dart` | Exportación condicional, Blob en web y compartir con el sistema en móvil. |
| `pubspec.yaml`, `pubspec.lock` | Dependencias y resolución. |
| `macos/Flutter/GeneratedPluginRegistrant.swift` | Registro generado por Flutter para file_picker. |
| `firestore.rules`, `storage.rules` | Reglas locales, sin despliegue. |
| `test/capacitaciones_2_test.dart`, `test/capacitaciones_service_test.dart` | 21 pruebas nuevas de modelos, políticas, UI y servicio. |
| `test/capacitaciones_rules/` | Suite Node de reglas, dependencias y exclusión de node_modules. |
| `firebase.capacitaciones-test.json` | Configuración independiente para emuladores demo. `firebase.json` permanece intacto. |
| Este documento | Auditoría, diseño e informe. |

### Dependencias

Dependencias directas añadidas: `flutter_markdown_plus ^1.0.12`, `file_picker ^13.1.0`, `mime ^2.0.0`, `web ^1.1.1` y `archive ^4.3.0`. Las tres últimas ya existían como dependencias transitivas; ahora su uso es explícito. Se reutilizan `firebase_storage`, `cloud_firestore`, `share_plus` y `url_launcher`.

### Datos y compatibilidad

Categorías: `iglesias/{iglesiaId}/capacitaciones_categorias/{categoriaId}`, campos `nombre`, `descripcion`, `orden`, `activa`, `fechaCreacion` y `creadorUid`. General es virtual. El orden se calcula en memoria y se edita numéricamente; no se necesitan índices nuevos.

Capacitaciones: misma colección existente; campos opcionales `categoriaId`, `tipoContenido` (`reflexion`, `archivo`, `enlace`), `archivoUrl`, `archivoNombre`, `archivoTipo` y `archivoTamano`, conservando `contenido`, `linkVideo`, `tipo` y `fechaCreacion`. Sin categoría se muestra General. Sin `tipoContenido`, `tipo: video` abre el enlace y las demás lecturas conservan texto literal. Editar una lectura antigua no activa Markdown automáticamente; usar la toolbar o el interruptor sí lo activa. No se han movido, borrado ni reescrito documentos existentes.

La toolbar ofrece negrita, cursiva, título, subtítulo, lista, cita y enlace. El usuario puede escribir texto normal. Markdown se renderiza sin ejecutar HTML ni cargar imágenes remotas. Solo se abren enlaces HTTP(S).

### Materiales y permisos

Formatos: PDF, HTML/HTM, PPT/PPTX, DOC/DOCX, XLS/XLSX, TXT, PNG y JPG/JPEG. Máximo exacto: 26.214.400 bytes (25 MiB, indicado como 25 MB en la UI). Se comprueban MIME cuando está disponible, firmas y estructura del contenedor Office moderno; se rechazan ejecutables, contenedores falsificados y macros VBA detectadas en OOXML.

Ruta: `capacitaciones/{iglesiaId}/{categoriaId o general}/{capacitacionId}/{marcaTiempo_nombreSeguro}`. `archivoUrl` es una referencia `gs://` que se resuelve con el SDK autenticado. Nunca se usa `getDownloadURL`. Se carga el material antes de abrir/descargar para que la acción web ocurra mediante un gesto directo y no quede bloqueada por el navegador.

Web: PDF en pestaña del navegador; Office y otros documentos mediante descarga; imágenes en memoria. HTML se descarga como adjunto. Android/iOS: compartir el archivo con aplicaciones del sistema mediante `share_plus`; la apertura depende de las apps instaladas. No se incorpora un renderer Office ni WebView.

Admin y `lider_area` administran categorías y contenidos. Servidor/miembro solo lee, abre y descarga, y la UI muestra únicamente categorías activas. Las reglas permiten lectura a miembros de la iglesia, incluso de categorías inactivas, siguiendo el requisito de lectura de reglas: la desactivación afecta a la presentación, no constituye una revocación de acceso.

Firestore conserva las reglas actuales de contenidos y añade validación de categorías, pertenencia, roles y protección de autor/fecha. Storage consulta el perfil `usuarios_globales/{uid}`, valida iglesia/rol, extensión, MIME y tamaño; HTML exige `contentDisposition: attachment`. Se mantienen las reglas existentes de fotografías.

Reemplazo: upload nuevo → guardar documento → borrar objeto anterior. Si falla el guardado, se intenta limpiar solamente el objeto nuevo. Si falla la limpieza posterior al guardado o al borrado, se muestra una advertencia y la UI vuelve a estar disponible. Bucket, iglesia y capacitación se verifican antes de eliminar un objeto.

### Validaciones ejecutadas

- `flutter pub get`: correcto.
- `dart format`: únicamente los archivos Dart del bloque.
- `flutter analyze`: sin observaciones, incluido el análisis final.
- `flutter test`: 62 pruebas aprobadas, 21 nuevas y 41 existentes.
- Firestore y Storage: emuladores locales del proyecto `demo-fesync`, 6 pruebas aprobadas. Las reglas compilan y rechazan acceso cruzado, escrituras de miembros, MIME incorrecto, ejecutables y tamaño excesivo. HTML requiere adjunto.
- `flutter run -d chrome`: compilación y arranque correctos; conexión con el servicio de depuración y entrada a `main` confirmadas.
- `git diff --check`: correcto.
- Git: cambios sin stage; `.vscode/` era preexistente y no se ha tocado. No se hizo commit, push ni deploy.

Comando reproducible de reglas desde la raíz (requiere Java 21 y Firebase CLI; en este equipo se usa el JBR de Android Studio):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
npm.cmd --prefix test/capacitaciones_rules ci
firebase.cmd emulators:exec --only firestore,storage --project demo-fesync --config firebase.capacitaciones-test.json "npm.cmd --prefix test/capacitaciones_rules test"
```

### Pendientes y límites

Los diez recorridos manuales solicitados (crear categoría/reflexión, visualizar como miembro, subir/abrir/descargar PDF, editar, mover, borrar y revisar contenido heredado) **no se han realizado en una sesión autenticada**. El smoke test de Chrome no equivale a esos recorridos. Requieren un entorno de pruebas con las reglas nuevas y usuarios de los distintos roles. Android/iOS tampoco se han ejecutado físicamente.

Hasta que se autorice e instale la configuración en un entorno adecuado, crear categorías o subir adjuntos puede recibir permisos denegados con las reglas antiguas. La pantalla conserva acceso a General si la consulta de categorías falla.

Las reglas Storage no inspeccionan bytes ni certifican documentos como libres de malware; el cliente agrega comprobaciones, pero no sustituye un escáner backend. HTML y documentos Office descargados deben abrirse en una aplicación de confianza. La limpieza Firestore/Storage no es una transacción distribuida: un fallo de eliminación puede dejar un objeto huérfano y se informa al administrador. No se hicieron cambios en otros módulos ni Functions.
