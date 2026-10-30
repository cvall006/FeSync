# FeSync — validación de integración 6A

> Registro histórico de 6A. El cierre local posterior y sus incompatibilidades
> están en [TRANSICION_6B.md](TRANSICION_6B.md). La suite actual exige denegar las
> rutas SDK antes caracterizadas como abiertas; las reglas no se han desplegado.

La integración real de cambios ordinarios de rol y su alcance se documentan en
[ROLES_6C2.md](ROLES_6C2.md). El mismo ejecutor protegido incluye esa suite.

Infraestructura exclusiva de pruebas. No despliega, no migra usuarios reales y no
autoriza publicar el módulo. Reutiliza las dependencias instaladas; no ejecutar
`npm install` para esta suite. Las fixtures borran **solo el emulador local**.

## Ejecución

Desde la raíz del repositorio:

```powershell
node test/desvinculacion_integracion/iniciar.js
npm.cmd --prefix functions test
flutter test test/desvinculacion_pendiente_service_test.dart --no-pub --plain-name "Límite del índice"
```

Se requiere Node 24, Firebase CLI y Java 21 ya disponibles. En Windows el
ejecutor admite el JBR existente de Android Studio; también admite JAVA_HOME.
No crea una instalación de Java ni actualiza paquetes. El aviso de firebase-tools
sobre firebase-functions antiguo no se corrige instalando dependencias en este paso.

El ejecutor fija `demo-fesync` y puertos loopback: Auth 9098, Functions 5008,
Firestore 8088 y Storage 9198. Configuración independiente:
`firebase.desvinculacion-test.json`; firebase.json permanece intacto. Rechaza
credenciales administrativas y proyectos alternativos. El proceso CLI recibe
un entorno mínimo y configuración temporal vacía, sin heredar variables privadas
del IDE ni sesiones de Firebase CLI. Los ejecutores internos comprueban todas
las variables de emulador antes de importar SDKs. No utilizar datos reales.

## Qué se integra realmente

`functions/test/integracion_runtime/index.js` exporta nueve **callables originales**
desde functions/index.js, conservando Functions v2 y southamerica-west1. No sustituye
Auth, transacciones ni Firestore. No exporta triggers de notificaciones. Bloquea
explícitamente getMessaging porque FCM no dispone de emulador; este componente
queda fuera de la validación. El arranque aborta fuera del runtime de emuladores.

Las identidades anónimas se crean en Auth Emulator; sus ID tokens quedan solo en
memoria. Se llama al protocolo HTTP callable real con esos tokens. La preparación
y verificación de fixtures usa Firestore Admin contra el host local sin ADC.
Las comprobaciones cliente usan REST autenticado, sujeto a firestore.rules real.
No hay llamadas directas a handlers en la suite principal.

## Matriz

| Escenario | Evidencia |
| --- | --- |
| Salida y expulsión de encargado | Perfil, configuración, elegibilidad, auditoría y recibo tienen el mismo updateTime de commit; se conserva configuración auxiliar |
| FCM legado | Desaparecen fcmToken/fcmTokenActualizado; dispositivo legado permanece deliberadamente intacto |
| Miembro ordinario | No se revoca la designación de otra persona; soporta FCM nulo/ausente |
| Error financiero, permisos, sin Auth, período incorrecto | Fotografía recursiva y updateTime anteriores/posteriores idénticos |
| Perfil legado sin pertenenciaId | failed-precondition, sin escrituras; requiere migración |
| Replay y dos solicitudes concurrentes iguales | Una revocación/auditoría/recibo efectivo; sin cambios adicionales |
| Reingreso a misma iglesia y cambio a otra | Nuevo ID por ingreso; replay anterior rechazado sin tocar token ni período nuevos |
| Consulta y recuperación históricas | Contexto original desde recibo propio; nuevo período no implica fallo histórico |
| Creación de iglesia y vinculación | Callables reales con recibo persistente; reintento no crea otra iglesia/pertenencia |
| Designación y activación | Módulo nuevo deshabilitado; habilitar repetidamente no añade auditoría ni escribe |
| Expulsión frente a designación del mismo encargado/reemplazo | Solicitudes HTTP solapadas; estados finales coherentes y sin doble revocación |
| Transferencia frente a expulsión | Se acepta un orden serial válido; titular anterior no puede iniciar otra expulsión |
| Consulta después de transferencia | Actor original conserva consulta histórica, sin privilegios nuevos |
| Recibos privados | GET, listado y PATCH SDK/REST denegados incluso al propio actor; otro actor no recupera recibos ajenos |
| Salida/expulsión cliente antigua | Se reproduce bypass vigente y recuperación de acceso financiero al reingresar; es caracterización de un riesgo, no aprobación de seguridad |
| Índice Flutter de 64 referencias | Prueba aislada existente: no descarta pendientes; poda solo referencias confirmadas |

Las concurrencias HTTP se solapan sin instrumentar handlers. Esto verifica
resultados admitidos, no fuerza todos los órdenes posibles ni acredita que en
cada ejecución ocurra un reintento interno de Firestore. La fotografía de fallos
no equivale a inyectar una caída del servidor durante el commit.

## Regresiones y alcance

Validación final del paso 6A, exclusivamente sobre datos ficticios:

| Suite | Aprobadas | Fallidas |
| --- | ---: | ---: |
| Auth + Functions + Firestore + reglas (nueva) | 17 | 0 |
| Simulador de pertenencia emulado | 3 | 0 |
| Motor transaccional de pertenencia emulado | 12 | 0 |
| Reglas de pertenencia | 20 | 0 |
| Reglas de Finanzas y elegibilidad | 46 | 0 |
| Capacitaciones / Storage | 8 | 0 |
| Node completo (lógica pura/dobles y guardias) | 406 | 0 |
| Flutter aislado, límite de 64 referencias | 1 | 0 |

El ejecutor completo terminó con código 0 y apagó los emuladores. Los seis JS
nuevos pasan node --check. La advertencia de versión del SDK no impidió la prueba.
No se requirieron correcciones en backend productivo. El primer intento del
nuevo arranque aislado detectó PATH de Java incompleto en Windows; se corrigió
solo la infraestructura y se validó de nuevo el recorrido completo.

El ejecutor ejecuta secuencialmente la nueva integración, el simulador y motor
de pertenencia existentes, y las suites de reglas de pertenencia, Finanzas y
Capacitaciones (incluido Storage). Las suites de reglas usan identidades sintéticas
de rules-unit-testing sobre emuladores reales; no todas pasan por Auth/Functions.
El motor tiene además escenarios de fallos instrumentados sobre Firestore emulado.
`npm.cmd test` es regresión Node con dobles/lógica pura, no prueba integrada.
La prueba Flutter del índice usa almacenamiento inyectado, no secure storage nativo.

## Bloqueos reproducidos antes de publicación

- firestore.rules todavía permite salida propia eliminando iglesiaId/rolGlobal y
  expulsión administrativa por SDK. Estas rutas no revocan encargadoUid ni
  elegibilidad, no crean recibo y no retiran FCM legado. Se conservan sin modificar.
- Al reingresar tras esa ruta antigua, una designación conservada puede volver a
  satisfacer las reglas financieras. Es necesario cerrar/migrar las rutas cliente
  coordinadamente con compatibilidad y preparación de usuarios legados.
- La edición auxiliar propia sigue admitiendo tokens y la subcolección
  usuarios_globales/{uid}/dispositivos sigue siendo editable por su dueño.
  La invalidación completa por instalación/período y mensajes en tránsito no se resuelve aquí.
- Perfiles legados sin ID quedan bloqueados por el callable centralizado. No se
  ejecuta la migración ni se acredita procedencia de IDs existentes por su formato.
- El índice Flutter no proporciona exclusión entre procesos/dispositivos ni
  recupera registros anteriores sin índice o almacenamiento local perdido.
- Esta suite no prueba una app Flutter completa, dispositivos físicos, entrega
  FCM, latencia de producción ni todos los interleavings de concurrencia.

No se modifican backend productivo, Flutter, reglas, contratos ni dependencias.
