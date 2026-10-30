# FIN-7B / FIN-7B.1 — validación real del adaptador y contrato de auditoría

Fecha: 2026-10-17. Rama inspeccionada: `integration/adora-live`.
Solo infraestructura de pruebas nueva en este directorio. FIN-7A, reglas,
Functions públicas, Flutter y archivos de Work permanecen intactos.

**FIN-7B.1 conserva las reglas: la auditoría es legible por responsables
financieros vigentes, mientras que los recibos son exclusivos del backend.**
El resultado 22/23 y las incidencias de FIN-7B se conservan abajo como evidencia
histórica. La resolución y validación actual se documentan al final; no suponen
autorización de publicación ni seguridad global demostrada.
Resultado actual FIN-7B.1: **49/49 en el ejecutor (incluidas guardas y orquestador),
46/46 regresiones financieras y 1.139/1.139 Node; cero fallos u omisiones.**

## Ejecución protegida

Desde la raíz del repositorio:

```powershell
node test/finanzas_contabilidad_integracion/iniciar.js
node --test test/finanzas_contabilidad_integracion/entorno.test.js
```

El primer comando inicia un emulador nuevo y ejecuta las pruebas. La segunda
orden solo prueba guardas puras; no importa SDKs ni conecta a ningún servicio.
El ejecutor incluye esas guardas antes de la integración. FIN-7B.1 añade al final
las regresiones existentes de `test/finanzas_rules/finanzas.test.js`, ejecutadas
secuencialmente en el mismo emulador, sin modificar esa suite ni sus reglas.

Requiere Firebase CLI, Java y dependencias locales ya instaladas. No instala
ni descarga dependencias. Proyecto fijo `demo-fesync`; Firestore fijo
`127.0.0.1:8088`; hub 4408 y logging 4508. Comprueba puertos libres y no se
conecta a otro emulador con datos preexistentes. La CLI anuncia también su
websocket interno en 9150; no se ejecutaron otros emuladores simultáneamente.
Cada inicio usa configuración y copia exacta de las reglas en un temporal:
Firebase CLI prohíbe referenciar reglas fuera del directorio de configuración.
No se modifica `firestore.rules` ni la configuración principal.

El proceso hijo recibe una lista limitada de variables. Se rechazan proyecto
ajeno, host/puerto distintos, credenciales ADC explícitas, token CLI y token
OAuth. Se verifican variables ANTES de importar/crear SDKs. Admin Firestore se
construye con host, ssl=false y proyecto explícitos; además se comprueban sus
settings normalizados. El cliente OAuth vacío evita descubrimiento de ADC.
`owner` es el mecanismo administrativo del emulador, no una credencial real.
SDK cliente usa identidades ficticias de rules-unit-testing, sin Auth real.
No se invocan Functions públicas ni Messaging, ni se prueban tokens Auth reales.

La suite borra solo los datos ficticios de su emulador entre escenarios.
`ejecutar.js` falla con código distinto de cero si hay cualquier fallo. El
primer fallo de escenario suspende los siguientes; no hay bucles de reejecución
de pruebas ni conversión de fallos a aprobaciones.

## Resultados históricos de FIN-7B (antes de FIN-7B.1)

| Validación | Resultado |
| --- | --- |
| Integración final con Firestore Emulator real | 23 escenarios: 22 aprobados, 1 fallido, 0 omitidos |
| Guardas sin SDK | 11 aprobadas, 0 fallidas |
| `npm.cmd test` en functions | 1.139 aprobadas, 0 fallidas; regresiones con dobles/pruebas puras, no 1.139 integraciones |
| Sintaxis JS de este directorio | `node --check` |

Detalle de la ejecución final:

| Escenarios | Evidencia / límite |
| --- | --- |
| 01 Gasto, seis escrituras, saldo y resumen | Snapshots reales: mismo updateTime en movimiento, saldo, resumen, control, auditoría y recibo; sentinels convertidos en Timestamp, campos auxiliares conservados |
| 02–03 Repetición / payload diferente | Replay sin escrituras ni nueva auditoría; cambio de monto con misma clave rechazado |
| 04 Respuesta perdida | Commit REAL seguido de excepción de transporte INYECTADA por decorador; replay recupera recibo sin duplicar |
| 05 Gastos concurrentes | Dos llamadas simultáneas de 7.000 sobre saldo 10.000; una confirma, otra SALDO_INSUFICIENTE; saldo 3.000 y una auditoría |
| 06–07 Revocación / transferencia | Escritura administrativa real intercalada al entrar al callback, antes de su primera lectura (inicio perezoso del SDK); ambas intenciones se deniegan. No prueba todos los órdenes ni una revocación que gane después de adquirir locks |
| 08–10 Pertenencia terminada / período distinto / otra iglesia | Denegación sin nuevas escrituras financieras |
| 11–13 Módulo inactivo / período cerrado / saldo insuficiente | Rechazo de dominio sin cambios parciales |
| 14 Error SDK antes de commit | Error real de validación undefined al preparar auditoría después de otras escrituras encoladas; ningún documento financiero cambia. No simula caída del proceso durante commit |
| 15 Reconstrucción | FIN-2 reconstruye resumen desde libro persistido; saldo adulterado bloquea siguiente gasto |
| 16 Retry del callback | Error ABORTED INYECTADO después del primer callback: SDK real lo reintenta; dos callbacks y un commit. No se atribuye a un conflicto natural observado |
| 17 Aislamiento documental | Cuenta de otra iglesia inyectada en catálogo rechazada; complementa actor ajeno del escenario 10. No es prueba exhaustiva de todas las consultas entre iglesias |
| 18 Aportante | Gasto rechaza aportante, movimiento conserva privado.aportante=null. No hay persistencia de ingresos/donantes implementada ni probada |
| 19–20 Volumen catálogos | 50 cuentas con sus saldos y 50 categorías aceptados; 51 bloquea sin escrituras |
| 21 Volumen libro | Gasto lleva libro de 199 a 200, replay histórico permitido, siguiente gasto bloqueado |
| 22 Acceso cliente | Recibos denegados incluso al actor original; recibos y auditoría denegados a usuario ajeno/sin sesión, incluyendo listado de auditoría |
| 23 Acceso cliente autorizado | FALLA: lectura get de auditoría por administrador titular tiene éxito |

El límite agregado de 2 MiB y casos de más de 200 documentos conservan cobertura
con dobles de FIN-7A; esta integración comprueba el borde de 200 y el intento
siguiente. No demuestra límites de transporte/memoria reales ni rendimiento de
producción. El costo de consultas y la contención del control global permanecen.

## Conflicto histórico que detuvo FIN-7B

El requisito 15 pide auditoría inaccesible por SDK cliente. Sin embargo,
`firestore.rules`, match `finanzas_auditoria/{eventoId}`, permite get/list a
`puedeLeerFinanzas(iglesiaId)` y prohíbe escrituras. Por diseño anterior esa
función admite administrador titular y encargado autorizado con módulo activo.
La lectura del administrador en el escenario 23 obtiene éxito real:

```text
Expected request to fail, but it succeeded.
tests 23 / pass 22 / fail 1 / skipped 0
```

No se ha observado acceso del público ni de usuarios ajenos. Es una discrepancia
entre FIN-7B literal y las reglas financieras previas, no evidencia de que el
adaptador debilite esas reglas. No se cambió la prueba a assertSucceeds ni se
relajaron reglas. Debe decidirse si la auditoría será exclusivamente servidor o
legible por los responsables financieros, y autorizar una fase separada para
alinear contrato/reglas/pruebas. No se corrigió código productivo ni se repitió
esta ejecución fallida.

## Incidencias de infraestructura conservadas

No se ocultan los intentos anteriores:

1. Arranque inicial: CLI rechazó `../../firestore.rules` fuera del proyecto de
   pruebas. Cero escenarios ejecutados. Se introdujo copia efímera de reglas.
2. Preparación con getFirestore(app): Admin SDK rechazó una credencial ficticia
   personalizada. Node marcó 23 fallos de hook, no 23 fallos del adaptador.
   Se adoptó Firestore exportado por Admin SDK, como en pruebas existentes.
3. Primera ejecución efectiva: gasto confirmado, pero escenario 01 falló por
   una aserción de prueba excesiva (serverTimestamp exactamente igual a updateTime);
   22 escenarios suspendidos. Se corrigió la prueba para comprobar updateTime
   común y timestamps servidor comunes entre los seis documentos, sin exigir
   igualdad entre ambos conceptos. No se cambió el adaptador.
   Hubo además un intento de detección de metadata ADC, bloqueado con EACCES
   antes de conectar; se eliminó usando GoogleAuth con OAuth2Client vacío.
   No hubo conexión Firebase real ni credenciales reales.
4. Ejecución final: 22 aprobadas, fallo de reglas/contrato en escenario 23.
   Infraestructura y emulador cerrados normalmente tras el fallo.

## Garantías y pendientes

Las transacciones reales aceptaron DocumentReference, Query.limit, snapshots,
updateTime con segundos/nanosegundos, create/update y serverTimestamp del
adaptador. El decorador verifica lecturas antes de escrituras sin reemplazar
snapshots o transacciones por dobles. Consulta completa limitada a máximo+1
funciona en transacción en este SDK/emulador; no se añadieron índices.

Se observaron atomicidad del commit, idempotencia y un orden de concurrencia
con saldo limitado. No son demostraciones exhaustivas de todos los interleavings,
locks/timeout, fallos de red, regiones, costos ni comportamiento de producción.
El retry ABORTED y la pérdida de respuesta fueron inyectados expresamente y se
distinguen de concurrencia natural. Ausencia de Messaging/otros efectos externos
se apoya en inspección del adaptador y auditoría única tras retry; no se hizo
una interceptación exhaustiva de tráfico o de procesos externos.

No hay endpoints contables, integración Flutter, autorización Auth emulada por
callable, validación de ingresos, reserva de códigos al crear catálogos, marcador
de reversión ni cierre mensual productivo en FIN-7B. Son fases posteriores.
Se detiene aquí sin despliegues, producción, migraciones reales, instalaciones,
commits, cambios de rama ni correcciones del adaptador.

## FIN-7B.1 — contrato de lectura resuelto y validado

Decisión: conservar `firestore.rules` sin cambios. El anterior requisito de
denegación total de auditoría era una expectativa incorrecta: el diseño y las
pruebas financieras existentes admiten expresamente su lectura por responsables
financieros. Se reemplazó únicamente esa expectativa y se añadieron casos de
denegación; no se eliminó cobertura de seguridad para hacer pasar la suite.

Regla exacta: `iglesias/{iglesiaId}/finanzas_auditoria/{eventoId}` permite get y
list si `puedeLeerFinanzas()` y deniega create, update y delete sin excepciones.
Esta función exige sesión y perfil existente con pertenencia actual exacta a
la iglesia, iglesia existente con titular coherente (adminUid apunta a perfil de
esa iglesia con rol admin_iglesia), configuración existente con habilitación
explícita true y, además, titularidad del actor con rol coherente o coincidencia
con encargadoUid vigente. Ser líder/servidor sin designación no concede lectura.
No hay comodín que abra la ruta financiera. Módulo false deniega auditoría
incluso al titular; su acceso excepcional a finanzas_config/acceso es distinto.

Las pruebas usan el mismo cliente antes y después de revocar designación,
desvincular, cambiar iglesia o transferir titularidad. El servidor deniega nuevas
lecturas get/list tras esos cambios. No se promete retirar datos previamente
descargados o almacenados en caché del dispositivo, ni borrar copias/exportaciones.
La desvinculación se modeló alterando el perfil desde Admin del emulador: prueba
las reglas, no vuelve a probar aquí todo el callable de membresía.

Comparación con FIN-3: ambos exigen módulo habilitado, iglesia/pertenencia actual,
titular válido y titularidad/designación explícita. FIN-3 añade para preparar una
operación monetaria las precondiciones originales de pertenenciaId y versión de
acceso, con validación estricta de contexto/roles. Las reglas de lectura no reciben
esa intención ni comparan updateTime o pertenenciaId esperado; no son una copia
de FIN-3 ni sustituyen la autorización transaccional del adaptador. Se mantiene
la compatibilidad de lectura de perfiles legados; no se afirma que todos los
casos malformados de contexto tengan idéntico comportamiento en ambas políticas.
La revocación permanente de designación al salir y el reingreso seguro dependen
del backend de membresía existente; esta fase no amplía ni modifica ese contrato.

Contenido real de auditoría del gasto: versionEsquema, iglesiaId, evento,
responsable {uid, pertenenciaId}, movimientoId, solicitudId, secuencia y
fechaCreacion. La prueba comprueba exactamente estas claves, también las internas
de responsable, contra un evento REAL producido por el adaptador.
UID y período son identificadores pseudónimos y deben tratarse como metadatos
privados de trazabilidad; no son información pública ni credenciales. No se
incluyen nombres, correos, teléfonos, tokens, códigos de ingreso, donantes,
descripciones libres, payload, huellas o datos del recibo. La lectura interna
por responsables actuales es apropiada para rendición de cuentas. La prueba de
forma exacta cubre el evento gasto_registrado, no todos los eventos futuros.

Los recibos permanecen fuera de las rutas financieras legibles, bajo
operaciones_financieras/{uid}/solicitudes/{solicitudId}, con denegación general
cliente. Se verifican get/list denegados para titular, encargado, revocado,
miembro, líder, otra iglesia, desvinculado y módulo inactivo; el caso 22 cubre
también usuario sin sesión y ajeno. Admin SDK, como siempre, ignora las reglas.

| Política | Resultado real con emulador |
| --- | --- |
| Titular y encargado vigentes con módulo activo | Get y list de auditoría permitidos; solo campos de trazabilidad esperados |
| Encargado revocado, miembro/líder sin designación | Get y list denegados |
| Otra iglesia, desvinculado, administrador anterior | Get y list denegados |
| Titular incoherente o módulo deshabilitado | Get y list denegados |
| Lectura/listado cliente de recibos privados | Denegados en todos los casos comprobados |
| Create/update/delete, reemplazo y set merge de auditoría | Denegados a titular, encargado, ajeno y usuario sin sesión; documento original conservado |

Validación final, una ejecución limpia después de corregir la infraestructura:

| Comando / suite | Aprobadas | Fallidas / omitidas |
| --- | --- | --- |
| node test/finanzas_contabilidad_integracion/iniciar.js | 49 | 0 / 0 |
| Regresión financiera existente, ejecutada como hijo secuencial en el mismo emulador | 46 | 0 / 0 |
| npm.cmd test desde functions | 1.139 | 0 / 0 |
| node --check en JS de este directorio | Correcto | Sin errores |

Los 49 resultados del ejecutor son 37 escenarios integrados, 11 guardas puras y
1 orquestador/verificador de regresiones. Las 46 pruebas hijas se contabilizan
separadamente; no deben sumarse otra vez como parte de esos 49 ni presentarse
las guardas como integraciones Firebase. No se ejecutaron Capacitaciones/Storage
en esta fase, que exige las regresiones financieras existentes.

Incidencia de infraestructura FIN-7B.1: en la primera ejecución ampliada,
Node heredó NODE_TEST_CONTEXT al hijo y omitió la suite financiera con advertencia
de ejecución recursiva, pese a devolver código cero. Ese resultado NO acredita
regresiones ejecutadas. Se eliminó solo esa variable del entorno hijo y se añadió
verificación de resumen con total positivo, pass=total, fail=0 y skipped=0.
En la ejecución final el hijo ejecutó realmente 46 pruebas en aproximadamente
18 segundos. No se cambió ninguna prueba financiera existente ni se repitió un
fallo funcional para ocultarlo. Las incidencias anteriores de FIN-7B se mantienen
en su sección histórica.

Archivos de FIN-7B.1: únicamente integracion.test.js y este README. No hay cambios
en reglas, adaptador, Functions productivas, Flutter, Work, dependencias o
configuración de emuladores. Se cierra la discrepancia del contrato de auditoría;
permanecen los límites de FIN-7B: concurrencia observada no exhaustiva, fallos de
transporte/ABORTED inyectados, sin endpoints y sin autorización de despliegue.
