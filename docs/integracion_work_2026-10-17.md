# Integración controlada de Work — 17 de octubre de 2026

Integración y validación locales completadas. Este informe no autoriza publicación,
despliegue ni migración real. No se accedió a Firebase de producción.

## Base, integridad y respaldo

- Repositorio: `C:/Otro/fesync`, rama conservada `integration/adora-live`.
- Paquete: `FeSync_cambios_y_evidencia.zip`, localizado en Descargas.
- SHA-256 del ZIP: `3e3d4c19bb22bbfc494034ee410905286b7858c279c8060b964086870b611203`.
- Se verificaron las 20 entradas del manifiesto contra `despues_sha256`.
  Se rechazaron rutas fuera del paquete, nombres duplicados y tamaños inesperados.
  Se revisaron las diferencias y el parche; el parche no se ejecutó.
- Los 14 archivos existentes coincidían exactamente con `antes_sha256`.
  Las seis rutas nuevas no existían. Ningún archivo requería mezclar modificaciones
  divergentes o reemplazar un archivo que ya coincidiera con `despues_sha256`.
- Antes de editar se respaldó el árbol completo, incluido `.git`, índice,
  archivos sin seguimiento e ignorados: 22.698 archivos y 22 enlaces.
  Se extrajo en una carpeta externa y se compararon hashes y destinos de enlaces;
  después se comprobó que el origen seguía coincidiendo con el inventario.
- Respaldo persistente: `C:/Otro/fesync-respaldos/pre-work-20261017-GDbUSc`.
  Contiene `repositorio.tar`, inventario, estado Git, diffs staged/unstaged,
  matriz de integración, diff aplicado y evidencia de validación.
- SHA-256 de `repositorio.tar`:
  `3adc4fe85a5c4f3a40fec8a0d576321a959257771c895bd30ab1df0d64d28c80`.
  La copia persistente se volvió a verificar contra este hash.

El respaldo es de código y estado local; no contiene un respaldo de datos Firebase.
Se conserva separado de los archivos recibidos y de sus resultados históricos.

## Matriz de integración

En todas las filas «actualizar», el archivo principal coincidía con la base del
manifiesto. Se aplicó el contenido revisado sin usar una copia masiva del ZIP.

| Archivo | Acción | Cambio y límite revisado |
| --- | --- | --- |
| `functions/index.js` | Actualizar | Delegar limpieza FCM a comparación transaccional; exportaciones conservadas |
| `functions/package.json` | Actualizar | Declarar google-auth-library 10.9.1 como desarrollo |
| `functions/package-lock.json` | Actualizar | Metadatos de esa dependencia directa, sin actualizar versiones |
| `functions/test/nuevo_miembro.test.js` | Actualizar | Dobles compatibles con limpieza transaccional |
| `lib/core/services/coordinador_ingreso.dart` | Actualizar | Rechazo de reintento no resuelve incertidumbre anterior |
| `lib/core/services/desvinculacion_pendiente_service.dart` | Actualizar | Retirar supresión de dependencia transitiva |
| `lib/core/services/roles_pendiente_service.dart` | Actualizar | Retirar supresión de dependencia transitiva |
| `pubspec.yaml` | Actualizar | Declarar crypto como dependencia directa |
| `pubspec.lock` | Actualizar | Conservar crypto 3.0.7, clasificado como directo |
| `test/desvinculacion_integracion/integracion.test.js` | Actualizar | Diagnóstico limitado por etapa |
| `test/ingreso_coordinado_test.dart` | Actualizar y ajustar prueba | Ocho regresiones; parámetro message obligatorio en SDK actual |
| `test/pertenencia_migracion/ejecutar_ensayo.js` | Actualizar | Incluir limpieza FCM y diagnóstico sanitizado; aborta ante fallo |
| `test/pertenencia_migracion/ejecutar_pruebas.js` | Actualizar | Incluir prueba FCM con Firestore emulado |
| `test/pertenencia_migracion/ensayo.test.js` | Actualizar | Carrera de salida/reingreso a otra iglesia |
| `functions/fcm_limpieza.js` | Crear | Limpieza condicional por token en transacción |
| `functions/test/fcm_limpieza.test.js` | Crear | Doce pruebas con dobles |
| `functions/test/diagnostico_membresia.test.js` | Crear | Dos pruebas de sanitización |
| `test/desvinculacion_integracion/diagnostico.js` | Crear | Solo etapas y códigos admitidos, sin dumps del error |
| `test/pertenencia_migracion/fcm_limpieza.test.js` | Crear | Dos pruebas contra Firestore emulado |
| `docs/preparacion_produccion_2026-10-17.md` | Crear | Informe histórico de Work, no resultado de esta integración |

Los 20 archivos se incorporaron. No quedaron cambios del paquete excluidos.
Este informe es un archivo adicional de evidencia, no parte del ZIP.

## Corrección mínima e incidencias conservadas

El primer `flutter analyze --no-pub` falló con una incidencia:
`missing_required_argument` en `test/ingreso_coordinado_test.dart:228:26`.
El paquete construía `FirebaseFunctionsException(code: codigo)` sin `message`,
obligatorio en la versión resuelta de Cloud Functions.

Se añadió únicamente un mensaje estático al error ficticio. No se modificaron
las condiciones de las pruebas ni código productivo para resolverlo. Por ello,
19 archivos quedan idénticos al paquete y esta prueba difiere por ese ajuste.
El fallo inicial y el análisis posterior se conservan como evidencia separada.

La invocación inicial de Flutter encontró permisos insuficientes sobre el lockfile
externo del SDK. Se validó posteriormente con acceso autorizado al SDK instalado.
La revisión automática de permisos tuvo una interrupción por límite de uso durante
una comprobación de puertos: esa acción no se ejecutó entonces. Tras la indicación
del usuario de continuar, se completó la misma comprobación y los puertos estaban
libres. No se trató de un fallo de pruebas ni se eludió la revisión de permisos.

## Validación de esta integración

Herramientas existentes: Node 24.20.0, Flutter 3.47.2, Dart 3.13.2 y Firebase CLI
15.28.2. Se utilizaron emuladores ya almacenados en caché; no se instalaron herramientas.

| Validación | Resultado |
| --- | --- |
| `npm.cmd test` desde `functions/` | 691 aprobadas, 0 fallidas, 0 omitidas |
| FIN-2 y FIN-3, incluidas en Node | 196 pruebas: 103 de FIN-2 y 93 de FIN-3 |
| `node --check` sobre los 11 JS del paquete | Correcto |
| `flutter pub get --enforce-lockfile --offline` | Correcto, sin alterar las versiones resueltas |
| Primer análisis Flutter | Una incidencia en constructor de prueba; corregida como se indica arriba |
| Análisis Flutter posterior, `--no-pub` | Sin incidencias |
| Suite Flutter completa, `--no-pub` | 431 aprobadas, 0 fallidas |
| Selección explícita de las ocho nuevas regresiones | 8 aprobadas, 0 fallidas; subconjunto de las 431 |
| Ensayo completo protegido con emuladores | 171 aprobadas, 0 fallidas, 0 omitidas |

Las herramientas Flutter se invocaron mediante el snapshot oficial del SDK
instalado, equivalente a la CLI, con `--no-version-check`. No se ejecutó la app
normal con su configuración Firebase. La ejecución enfocada de ocho casos dejó
evidencia individual porque la salida de la suite completa intercala nombres de
pruebas concurrentes; no se suma otra vez al total ni oculta fallos.

El ensayo se ejecutó una vez, con `node test/pertenencia_migracion/iniciar_ensayo.js`,
Auth, Firestore, Functions y Storage locales, proyecto `demo-fesync` y puertos
verificados antes de arrancar. El ejecutor elimina credenciales heredadas, bloquea
Firebase Messaging y carga solo los callables de prueba. No hubo emuladores
concurrentes en los mismos puertos ni reintentos de suites fallidas.

| Suite integrada | Aprobadas |
| --- | ---: |
| Guardas del ensayo | 7 |
| Membresía/callables reales | 17 |
| Ensayo operativo de migración ficticia | 16 |
| Limpieza FCM con Firestore emulado | 2 |
| Roles | 27 |
| Simulador | 3 |
| Motor transaccional | 12 |
| Reglas de perfiles 6B | 33 |
| Reglas financieras | 46 |
| Capacitaciones y Storage | 8 |
| Total | 171 |

La simulación ficticia inicial encontró 11 perfiles: 3 candidatos, 3 omitidos y
5 en revisión. La verificación posterior encontró 0 candidatos y 3 comprobantes.
Estos datos pertenecen exclusivamente al emulador y no son una migración real.

## Conservación y límites

- Se verificaron sin cambios otros 280 archivos previos del proyecto, incluidos
  los nueve archivos de núcleo/pruebas FIN-2/FIN-3. Adora Live, Capacitaciones,
  membresía, roles, RootGate y reglas conservan el trabajo recibido salvo los
  archivos expresamente enumerados en la matriz.
- `index.js` mantiene las mismas exportaciones, sin duplicados. Las dependencias
  google-auth-library 10.9.1 y crypto 3.0.7 ya estaban resueltas; se formalizó su uso.
- El índice staged, HEAD y rama se conservan. Los cambios siguen sin commit y el
  repositorio continúa con los cambios locales anteriores; no representa un árbol limpio.
- `integracion-aplicada.diff` compara contra el respaldo inicial, no contra HEAD;
  así no atribuye a Work las modificaciones locales acumuladas previamente.
- No se modificaron reglas, código financiero FIN-2/FIN-3 ni módulos no enumerados.
  Los cachés y logs locales producidos por las validaciones no son cambios de negocio.
- La limpieza FCM protege por coincidencia del token; no acredita instalación o
  período, no soluciona asociaciones antiguas ni retira mensajes en tránsito.
- La corrida actual pasó los 17 escenarios de membresía. No demuestra la causa
  de los 17 fallos históricos ni permite declarar cerrada esa incidencia.
- Publicación, transición de clientes antiguos, migración real, procedencia de
  IDs existentes y revisión de designaciones históricas siguen pendientes.
- Las pruebas con dobles y emuladores no sustituyen pruebas de secure storage
  nativo, varios procesos/dispositivos, entrega FCM o recuperación de datos reales.

No se desplegó, migró producción, cambió de rama ni creó commits. No se avanzó a FIN-4.
