# Preflight operativo del piloto real

**BLOQUEADO. No se ejecutó el dry-run fresco.** No hay ADC local disponible ni identidad ADC acreditada como lectora. La sesión Firebase CLI tiene permisos de lectura, pero también de escritura; no se convirtió ni utilizó como ADC. Las reglas reales siguen permitiendo alterar pertenenciaId.

Se revisó el [ejecutor y procedimiento preparados](membresia_piloto_2026-10-28.md). No se desarrollaron funcionalidades ni se modificaron migrador, reglas locales, Flutter o módulos del producto.

## Comprobaciones efectivas

| Comprobación | Resultado actual |
| --- | --- |
| ADC por variable de credenciales | Variable ausente |
| Archivo ADC predeterminado local | Ausente |
| gcloud en PATH | No disponible |
| Permisos de una identidad ADC | **No comprobables sin ADC**; no se intentó metadata server ni crear credenciales |
| Sesión CLI, permisos de lectura del piloto | Concedidos los seis consultados: `datastore.entities.get`, `datastore.entities.list`, `datastore.databases.get`, `firebaseauth.users.get`, `firebaserules.releases.get`, `firebaserules.rulesets.get` |
| Sesión CLI, escritura Firestore | También dispone de `datastore.entities.create/update/delete`; se consultó su disponibilidad, **no se ejercieron** |
| Dry-run fresco de un perfil | **No ejecutado**; no se leyeron perfiles, Auth de usuarios, comprobantes ni configuración financiera |
| Preparación/respaldo real de un dry-run | No existen; no confundir con las fixtures demo previas |

[Estado local y lote](membresia_operativo_2026-10-28/estado-local.json), [consultas remotas sanitizadas](membresia_operativo_2026-10-28/resultado.json). El reconocimiento de permisos se hizo mediante `testIamPermissions`, no `setIamPolicy`; no hubo cambios IAM. La renovación OAuth de la sesión CLI se realizó solo en memoria, sin guardar tokens ni exponer credenciales. Los permisos CLI no se atribuyen a una identidad ADC inexistente ni certifican una identidad de solo lectura.

Las únicas consultas de recursos reales fueron **un test de permisos y tres GET de Rules** (release, fuente y reverificación de release), todos HTTP 200, exclusivamente para `fesync-app-2026`. No hubo consultas Firestore/Storage de documentos, Functions invocadas ni Hosting modificado.

## Reglas reales y dry-run

Lectura efectuada **2026-10-29 00:47:13–17 UTC**, **28/10/2026 21:47:13–17 en Santiago**. El ruleset siguió estable durante las lecturas:

- Remoto: `26a2c1e2-5ea0-4d03-bf30-b19ac39873af`, actualización `2026-10-13T01:23:28.514049Z`.
- Hash remoto: `8398b1200abe8f2b5c1f879bcf866566b7f1d0c68e55c6b37893117ae6d324f0`.
- Hash del parche piloto: `d5daa593f92bce0ee18caa8eabdb2fd3259ce4bade7f98a4f22ae9c9d0be64b7`.

La [fuente recién leída](membresia_operativo_2026-10-28/firestore-remotas.rules) es idéntica al snapshot vulnerable anterior. Su regla de perfil propio conserva iglesia/rol, pero no pertenenciaId. **No es compatible con ejecutar la asignación protegida del piloto.** El parche preparado conserva flujos legacy sin generación y bloquea cambios cliente sobre generaciones protegidas; la edición auxiliar permanece permitida. Las 44 pruebas anteriores del parche son antecedente, no se presentan como reejecutadas aquí.

El código de `dryRun` del ejecutor preparado usa `runTransaction(..., {readOnly:true})` y no invoca el motor de escritura. Auth `accounts:lookup` y GET Rules son lecturas; solo persiste respaldos/preparación en archivos locales. El SDK instalado rechaza métodos de escritura en transacciones read-only. **Esta revisión de código y el ensayo demo anterior no equivalen a un dry-run real ejecutado ahora.**

Además de ADC, el ejecutor exige un hash de reglas protector aprobado: con las reglas actuales se detendría con `REGLAS_NO_PROTEGIDAS` antes de crear preparación. No se relajó esa barrera para producir un dry-run aparentemente aprobado. Su recorrido completo también comprueba la relación `encargadoUid`; no se ejecutó esa lectura ni se supuso una excepción a la restricción financiera de este encargo. Una autorización futura deberá delimitar esa comprobación de pertenencia/encargo mínima, excluyendo datos contables.

## Único lote identificado

[Manifiesto privado existente](../migrate_working_dir/piloto_legacy_2026-10-28/manifiesto.json): proyecto `fesync-app-2026`, lote **`piloto-01`**, un perfil seleccionado en la verificación anterior como no titular ni encargado. SHA-256 **`104ded7fe2dcb60f742ca6ab4b37fbef35f8c4bdb04066c9fc44ed982790e5b1`**.

Se verificaron hash, ACL del contenedor (sin herencia, solo usuario Windows actual) y exclusión Git. No se sustituyó UID ni versión. La elegibilidad actual del perfil **no se revalidó** porque no se ejecutó el dry-run. Los 22 elegibles, siete ambiguos y seis sin pertenencia siguen siendo resultados de la fotografía anterior; no se afirman como un nuevo recuento real. Los ambiguos/excluidos no entran en este lote.

## Orden seguro y detenciones

1. **Ahora: detener la ejecución.** Proveer una identidad ADC lectora aprobada y verificar sus permisos sin generar claves, conceder roles o sustituirla automáticamente por la sesión CLI. No se incluyen comandos de login o cambios IAM: no están autorizados. La lectura preparatoria y una posterior escritura requieren autorizaciones distintas; no atribuir capacidad de aplicación a la identidad lectora.
2. **Reglas primero, con autorización de despliegue independiente.** Revalidar el snapshot base y aprobar el diff exacto; desplegar exclusivamente reglas protectoras y verificar el hash efectivo. Si cambió la base, detener antes de desplegar. Mantener el modo financiero apagado; no se consultaron sus estados reales en este encargo.
3. **Functions compatibles y acceso al cliente piloto.** Reutilizar los doce selectores del plan anterior, previa autorización y revalidación del inventario. No hacer deploy general, borrar Functions ni reemplazar las otras once existentes. Antes de las dos actualizaciones deliberadas, conservar artefactos/versiones de recuperación verificados: una lista de nombres no respalda implementaciones. No se relistaron Functions ni se certificaron sus fuentes actuales aquí.
4. **Hosting habitual permanece sin reemplazo.** Hacer accesible el candidato compatible únicamente al piloto mediante un canal aprobado. Confirmar autenticación y actualización del piloto antes de asignar generación. Los clientes antiguos conservan las rutas de perfiles legacy, pero no deben escribir salida/roles sobre el perfil migrado. Los siete ambiguos impiden asumir que el Web nuevo puede sustituir ya todos sus flujos.
5. **Continuidad del cliente obligatorio.** El comando anterior proponía un canal con expiración de un día. No autorizar la migración si ese canal puede caducar dejando al piloto únicamente con un cliente incompatible. Aprobar responsable, vigencia/renovación y acceso compatible hasta la transición general; no borrar el canal tras el commit mientras siga siendo necesario. Una renovación es otro despliegue y necesita autorización; no se promete realizarla automáticamente.
6. **Dry-run fresco, después de cerrar sus precondiciones.** Con identidad lectora aprobada, reglas correctas y alcance de lectura delimitado, verificar el mismo UID/versión y producir respaldos privados. Si una precondición cambió, detener sin refrescar versión ni elegir otra persona automáticamente. Conservar también copia independiente privada aprobada.
7. **Autorización final independiente.** Solo después de revisar los artefactos frescos, aprobar exactamente lote/UID privado, hash de código, respaldo y SHA del dry-run vigente, además de una identidad con escritura mínima expresamente autorizada. Este preflight no concede esa autorización. La preparación vence a los diez minutos: vencimiento exige nueva preparación/revisión, nunca `force`.

## Reversión y recuperación por punto

| Momento del incidente | Acción y límite exactos |
| --- | --- |
| Estado actual, sin despliegues ni commit | No hay nada remoto que revertir. Conservar manifiesto/evidencia y no iniciar aplicación |
| Fallo tras proteger reglas, antes de migrar | Detener el rollout. Corregir hacia una revisión protectora verificada; no restaurar ciegamente la regla mutable. Cualquier reversión exige comprobar que no haya nuevas generaciones emitidas por otros ingresos y autorizar el diff concreto |
| Fallo de Functions/cliente, antes de migrar | No migrar. Hosting live sigue intacto; conservar las Functions previas y reparar/revertir únicamente con el artefacto anterior verificado y autorización. No inventar una fuente de rollback a partir del inventario |
| Canal piloto no accesible o próximo a caducar | Detener antes del commit. Después del commit, mantener/renovar acceso compatible bajo autorización hasta disponer de alternativa; no regresar al escritor legacy del perfil protegido |
| Respuesta perdida al aplicar | Detener nuevas escrituras; usar `verificar` con lecturas autorizadas. `CONFIRMADO` recupera el mismo resultado; `SIN_COMMIT` no autoriza por sí solo un reintento; `REVISION_MANUAL` bloquea |
| Respaldo local perdido | `recuperar-respaldo` desde copia íntegra y `verificar-respaldo`; solo reconstruye archivos locales, nunca Firestore |
| Commit confirmado y otra incidencia | Conservar ID/comprobante y endpoints de recuperación. No borrar ni degradar pertenencia, no restaurar un perfil antiguo sobre un reingreso y no eliminar Functions con solicitudes emitidas. Cualquier reparación real requiere comparación y autorización separadas |

Los comandos futuros están [preparados aquí](membresia_piloto_2026-10-28/comandos-solo-documentados.ps1.txt); su bloque de expiración de canal está subordinado a la condición de continuidad anterior. Los comandos esenciales del lote, **solo documentados**, son:

```powershell
$Piloto = 'C:\Otro\fesync\migrate_working_dir\piloto_legacy_2026-10-28'
# DETENER hasta disponer de ADC lectora autorizada, reglas y alcance compatibles.
node herramientas/migracion_piloto/cli.cjs dry-run --proyecto fesync-app-2026 --directorio $Piloto
node herramientas/migracion_piloto/cli.cjs verificar-respaldo --proyecto fesync-app-2026 --directorio $Piloto
# DETENER para revision y autorizacion de escritura del UID/lote/artefactos frescos.
$ConfirmacionAutorizada = '<SHA256_DEL_DRY_RUN_EXPRESAMENTE_AUTORIZADO>'
node herramientas/migracion_piloto/cli.cjs aplicar --proyecto fesync-app-2026 --directorio $Piloto --confirmar $ConfirmacionAutorizada
node herramientas/migracion_piloto/cli.cjs verificar --proyecto fesync-app-2026 --directorio $Piloto
# Solo ante perdida del archivo principal; nunca reemplaza datos remotos.
node herramientas/migracion_piloto/cli.cjs recuperar-respaldo --proyecto fesync-app-2026 --directorio $Piloto
```

Ninguno de esos comandos reales se ejecutó en este encargo. No se proporcionó una confirmación de escritura ni se creó un dry-run de producción ficticio.

## Conservación y decisión

Se ejecutaron únicamente **cinco pruebas locales de guardas**, todas aprobadas, además de la revisión de código y las lecturas operativas descritas. No se repitieron Flutter, suites de emulador ni compilaciones; no hubo cambios de implementación que lo requirieran.

Respaldo inicial de **1.201 rutas**. [Respaldo](membresia_operativo_2026-10-28/respaldo.json) e [integridad final](membresia_operativo_2026-10-28/integridad.json). HEAD/rama/índice y archivos previos preservados. Solo se añadieron este informe y evidencia del preflight; sin modificar ejecutor, migrador, reglas, Finance V1/V2, Flutter, Work o inventarios.

**BLOQUEADO por ausencia de ADC lectora verificada, reglas remotas incompatibles y falta de preparación fresca autorizable.** El lote unitario está identificado, pero no está listo para solicitar autorización de su commit con artefactos actuales. El siguiente paso es resolver esas precondiciones y la continuidad del cliente, sin ampliar el número de perfiles ni investigar datos financieros.

**Sin escrituras de recursos reales, migraciones, despliegues, activaciones, cambios IAM, creación/exposición de credenciales, commits ni cambio de rama.**
