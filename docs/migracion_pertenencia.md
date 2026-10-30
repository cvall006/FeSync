# Simulación de migración de pertenenciaId

El simulador no asigna identificadores. Existe además un motor transaccional por
perfil, probado exclusivamente con datos ficticios en emulador. No hay ejecutor
de migración real, endpoint ni inicialización de Firebase Admin en estos módulos.
No se autorizan desvinculaciones ni se acredita la procedencia de IDs preexistentes.

## Contrato de lectura

`functions/migraciones/pertenencia_simulacion.js` exporta `simularPertenencias`.
Recibe un lector con tres métodos: `listarPerfiles`, `leerPerfil`, `leerIglesia`.
El contrato completo está documentado en el módulo. El consumidor es responsable
de inyectar exclusivamente lectores autorizados; el módulo no decide proyectos
ni obtiene credenciales. No hay ejecutor para proyectos reales.

El listado debe ordenar por ID documental en orden UTF-8, con cursor exclusivo.
Cada observación aporta un `version` opaco, estable y sin pérdida de precisión
(en la integración: updateTime, segundos y nanosegundos). Se vuelve a leer cada
perfil y se delegan las decisiones al clasificador existente.

La iglesia se lee solamente si el clasificador necesita ese contexto. Nunca se
interpreta un error como documento ausente. Errores de perfil/iglesia se agregan
como revisión; un error de paginación detiene el recorrido con métricas parciales.
Un perfil desaparecido requiere revisión. Cambios observables de versión producen
conflicto; faltas de versión producen revisión. No se corrige ningún caso.

Valores predeterminados: 50 documentos/página, 10 páginas, 500 perfiles.
Máximos: 100 documentos/página, 100 páginas, 10000 perfiles. No hay reintentos
automáticos, acumulación de documentos ni caché creciente. Se conserva una página
y una observación actual. El lector debe respetar el límite antes de materializar
la respuesta; respuestas excesivas o desordenadas se rechazan. El módulo no puede
limitar la memoria interna de un lector inyectado arbitrario.

La salida solo contiene contadores por categoría/motivo, páginas, lecturas intentadas,
incidencias y `completa`. Esta última indica que se observó el fin del recorrido,
no que todos los perfiles sean correctos: pueden existir errores de lectura.
Al alcanzar un límite no se hace una consulta adicional para adivinar si hay más
documentos. No se devuelve el cursor ni IDs individuales. No hay logs.

## Garantías y límites

- Solo se invocan los tres métodos de lectura; no se generan IDs ni se entregan
  planes de escritura. Los identificadores existentes se conservan íntegramente.
- Una simulación NO es una fotografía transaccional global. Inserciones detrás
  del cursor, cambios posteriores a una relectura o cambios de iglesia no observados
  pueden escapar al recorrido. Un conflicto es evidencia de cambio, no una reparación.
- La futura migración deberá volver a validar perfil, iglesia, versión exacta y
  ausencia del campo en una transacción, completando lecturas antes de escrituras.
- El motor descrito abajo confirma asignación y comprobante privado atómicamente;
  no se ha utilizado fuera del emulador. La revocación financiera sigue pendiente.

## Motor transaccional por perfil (4D)

`functions/migraciones/pertenencia_ejecucion.js` exporta `migrarPerfilPertenencia`.
Solo puede invocarse programáticamente con `db` explícito, `FieldValue` para
timestamp de servidor y `seleccion: { uid, iglesiaId, version }`. La versión debe
ser el updateTime observado antes de ejecutar, como `segundos:nanosegundos`, sin
redondearlo a milisegundos. El motor no descubre proyectos ni usa credenciales.
No hay bucle masivo, CLI ni callable. El generador existente es el predeterminado;
la inyección de generador se reserva para pruebas. Inyectar un db implica capacidad
de escritura: esta API interna NO constituye autorización para ejecutarla en real.

Cada transacción relee perfil e iglesia y reutiliza el clasificador. Si el perfil
es candidato, exige iglesia y versión exactas a la selección y lee el comprobante
privado antes de generar el ID y escribir. Solo actualiza `pertenenciaId`.
No normaliza ni borra campos presentes inválidos; tampoco sobrescribe IDs válidos.
La coherencia administrativa comprobada es la definida por el clasificador:
rol del perfil objetivo frente a adminUid de la iglesia. No se acreditan todos
los perfiles de terceros ni se conceden permisos administrativos/financieros.

El comprobante `migraciones_pertenencia/{uid}` contiene versión del procedimiento,
origen, iglesia, ID asignado, versión anterior del perfil y timestamp servidor.
No incluye nombres, correos ni formularios. Es metadata privada de trazabilidad,
no un recibo de ingreso histórico, ni un permiso. La denegación general actual
impide lecturas/escrituras cliente en esa ruta; se comprueba con el emulador.
Su existencia bloquea una nueva asignación si un escritor privilegiado borró el ID:
ese caso exige revisión. No se borra ni reemplaza el comprobante automáticamente.

Una ejecución repetida observa el ID ya presente y omite sin escribir ni duplicar
comprobante, incluso con la selección original. Los no candidatos se clasifican
por sus datos actuales sin exigir versión igual: se mantienen intactos. Un cambio
de versión de un candidato provoca conflicto, aun si solo cambió un auxiliar.

El resumen de categoría/motivo y contadores se construye DESPUÉS de resolver la
transacción. Los reintentos internos pueden generar IDs descartados, pero solo el
confirmado queda en perfil/comprobante y el resultado cuenta una vez. La herramienta
futura deberá agregar únicamente resultados retornados, no intentos del callback.
Tras una interrupción entre commit y recepción, repetir es seguro pero puede
devolver omitido; los contadores del proceso no sustituyen el registro persistente.

Errores transaccionales devuelven una etiqueta genérica sin documentos, rutas ni
error original. Un error de confirmación puede ser incierto: revisar/repetir la misma
selección, nunca compensar borrando datos ni emitir otro ID automáticamente.
Las opciones inválidas se rechazan antes de usar db. No hay logs.

### Alcance de las pruebas

Los dobles modelan staging, lecturas antes de escrituras, cambios de versión y
reintentos, pero no prueban bloqueos, transporte ni durabilidad del servicio real.
El emulador comprueba transacciones reales del SDK, doble ejecución, concurrencia,
fallos del callback sin commit, timestamps y protección del comprobante.
La comparación usa todos los nanosegundos disponibles en updateTime; la prueba de
cambio real verifica versiones distintas, sin asumir una separación menor a 1 ms.

Los cambios externos de salida/reingreso/transferencia se coordinan antes de la
primera lectura transaccional para no bloquearse con los locks del servidor.
Un ABORTED inyectado antes del commit verifica el reintento del SDK; no reproduce
todos los fallos de transporte ni una caída de producción después de confirmar.
Nada de esto valida IAM, cuotas, backups o restauración de un proyecto real.

## Pruebas locales, sin credenciales

Se reutiliza `firebase.finanzas-test.json`; no se modifica configuración general.
No se necesitan instalaciones nuevas. Desde `functions/`:

```powershell
npm.cmd test
```

Desde la raíz del repositorio, con Java y Firebase CLI locales disponibles:

```powershell
$env:GCLOUD_PROJECT = 'demo-fesync'
$env:CI = 'true'
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
firebase.cmd emulators:exec --only firestore,storage --project demo-fesync --config firebase.finanzas-test.json "node test/pertenencia_migracion/ejecutar_pruebas.js"
```

El ejecutor exige `GCLOUD_PROJECT=demo-fesync`,
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8088` y
`FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9198` ANTES de importar/inicializar
SDKs o lanzar regresiones. Los hosts de emuladores los proporciona Firebase CLI.
Una discrepancia aborta. No se usan credenciales ni configuración de producción.
El cliente de integración usa un Auth vacío explícito y conexión local sin TLS;
no busca credenciales ADC ni consulta el servicio de metadatos. El SDK utiliza
su cabecera ficticia de emulador. Esta configuración solo existe en la prueba.
Usar una instancia local desechable: las suites limpian los datos de demo-fesync.

La integración escribe y elimina exclusivamente fixtures ficticios para preparar
escenarios y simular concurrencia, fuera del simulador. Compara datos y updateTime
antes/después para comprobar ausencia de escrituras durante recorridos estables.
La nueva suite del motor realiza además asignaciones transaccionales exclusivamente
en esa base ficticia. Su archivo también aplica la guarda demo/local antes del SDK.
Las suites se ejecutan secuencialmente porque comparten la base del emulador.

## Antes de una migración real (no autorizada en este paso)

Requerirá revisión separada de permisos administrativos, respaldo/restauración,
procedencia de IDs existentes, herramienta de ejecución, reanudación y métricas
confirmadas. El motor por perfil no aporta todavía ese procedimiento operativo.
Deben desplegarse primero las reglas protectoras y los ingresos que
renuevan el ID. Las rutas cliente de salida/expulsión y los clientes sin solicitudId
siguen siendo dependencias de la seguridad completa. Ningún resultado de esta
simulación debe presentarse como perfiles migrados.
