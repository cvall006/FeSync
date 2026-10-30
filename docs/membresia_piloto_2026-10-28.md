# Piloto de pertenencia legacy preparado localmente

**Ejecutor y transición preparados y probados en demo-fesync. Se puede solicitar la autorización del plan acotado; la ejecución real sigue detenida hasta proteger reglas, aprobar la identidad del operador y autorizar el dry-run/lote concretos.** No hubo lecturas ni escrituras de servicios Firebase reales en este encargo.

## Qué quedó concreto

[Ejecutor](../herramientas/migracion_piloto/cli.cjs) de un solo perfil que llama al motor existente `migrarPerfilPertenencia`. No se modificaron ese motor, el migrador demo, Flutter, reglas locales, Finanzas, V2, Work o inventarios. No se añadieron endpoints ni dependencias.

La selección real ya se materializó **solo localmente**, reutilizando la recomendación privada verificada del encargo anterior: [manifiesto protegido](../migrate_working_dir/piloto_legacy_2026-10-28/manifiesto.json), proyecto `fesync-app-2026`, lote `piloto-01`, **un perfil no titular ni encargado**. SHA-256 **`104ded7fe2dcb60f742ca6ab4b37fbef35f8c4bdb04066c9fc44ed982790e5b1`**. Su referencia no se publica en este informe.

La carpeta tiene ACL sin herencia y acceso del usuario Windows actual solamente; Git la ignora mediante `migrate_working_dir/` existente. No contiene todavía dry-run ni respaldos de producción: estos requieren lecturas autorizadas frescas. [Hashes del código/reglas y estado exacto](membresia_piloto_2026-10-28/plan.json).

## Barreras del ejecutor

- Proyecto explícito obligatorio y cotejado con el manifiesto y el cliente Firestore. Solo admite `demo-fesync` con Auth/Firestore locales exactos, o `fesync-app-2026` sin variables de emulador. Rechaza otro proyecto, configuración cruzada y credenciales reales en demo. El destino real no se obtiene cambiando el projectId del migrador demo.
- Manifiesto de **un único UID, iglesia y versión exacta**; no admite listas, roles aportados como autoridad ni selección automática durante aplicación. Prepararlo no inicializa Firebase ni ADC.
- `dry-run` obligatorio: verifica identidad Auth habilitada, reglas protectoras aprobadas y estado Firestore mediante transacción solo de lectura. Guarda respaldo y copia idéntica; luego sella una preparación de **10 minutos** ligada al manifiesto, código, respaldo y hash efectivo de reglas. No añade ID ni crea checkpoint remoto.
- Antes de cada intento de escritura vuelve a leer perfil y comprobante, y consulta administraciones de iglesias y sus `encargadoUid` en la misma transacción. Excluye titulares y encargados de cualquier iglesia observada, perfiles ambiguos/sin vínculo, versiones distintas y comprobantes previos. La consulta está acotada a 20 iglesias; si el proyecto supera ese límite, se detiene.
- Auth y reglas se revalidan también dentro de cada intento transaccional, inmediatamente antes de invocar el motor con sus lecturas cacheadas. Las versiones de perfil/iglesias/accesos quedan vinculadas al respaldo. Auth/reglas son servicios externos a la transacción: se necesita una ventana controlada sin cambios paralelos, no se afirma atomicidad entre servicios.
- Adaptador del motor limitado a actualizar **solo pertenenciaId del UID seleccionado** y crear **solo su comprobante original de seis campos**. No puede alterar otros perfiles, roles, iglesias, configuración financiera, movimientos o recibos contables. Todas las lecturas terminan antes de esas dos escrituras.
- `aplicar` exige el hash explícito del dry-run revisado. Sin archivos, con corrupción, copia diferente, código/manifiesto cambiado, preparación vencida o reglas no aprobadas, se detiene. No hay `force`, migración masiva o restauración remota automática.
- Reintento del commit confirmado recupera la generación/comprobante coherentes y no escribe otra vez. Si hubo salida/reingreso o datos posteriores incompatibles, detiene la aplicación. Una incertidumbre se resuelve con `verificar`, sin borrar ni compensar IDs.

El motor existente continúa usando sus transacciones/reintentos y generador servidor; no se fabricaron identificadores ni fechas históricas para el perfil real. Para este lote unitario, el comprobante existente y los artefactos locales cerrados evitan una segunda asignación; no se creó otro coordinador remoto de membresía.

## Respaldo y recuperación

El dry-run genera `respaldo.json`, `respaldo.copia.json` y `dry-run.json`, con creación exclusiva, escritura sincronizada, relectura y hash canónico SHA-256. La aplicación verifica ambos respaldos y su enlace con selección/código/preparación antes de operar. Los archivos deben permanecer en la carpeta privada.

Es un **respaldo acotado a la mutación y sus precondiciones**, no un export de perfiles personales: conserva presencia/ausencia y versión de los campos de membresía, ausencia del comprobante y versiones/relaciones de titularidad/encargo necesarias. Los demás campos del perfil no se leen ni modifican por el ejecutor; el adaptador solo permite añadir el campo protegido. El hash detecta corrupción accidental y vincula la revisión, no sustituye una firma externa ni protege contra un operador privilegiado que cambie todos los archivos y vuelva a autorizar otra preparación.

Las dos copias locales verificadas resisten pérdida/corrupción de un archivo, **no pérdida del dispositivo**. Antes de autorizar el piloto real, conservar una copia adicional en un destino privado independiente aprobado y verificar su hash. No se hizo una exportación remota ni se escribió fuera del workspace.

Procedimiento de recuperación:

1. Archivo principal perdido: `recuperar-respaldo` reconstruye únicamente el archivo local desde su copia, cotejando la preparación; no sobrescribe uno existente ni llama Firebase. Después ejecutar `verificar-respaldo`. Se ensayó esta recuperación en demo.
2. Copia corrupta, hash discrepante o dry-run parcial: detener. Conservar los archivos; recuperar una copia íntegra del destino autorizado. No recalcular hashes para aceptar una copia alterada ni reutilizar un directorio incompleto como si hubiera pasado el dry-run.
3. Respuesta perdida/caída después de intentar aplicar: `verificar` distingue `CONFIRMADO`, `SIN_COMMIT` y `REVISION_MANUAL`; puede reconocer un commit previo aunque la preparación haya vencido, sin nueva escritura. La aplicación solo vuelve a intentar un estado sin commit si la preparación y las precondiciones siguen vigentes.
4. Vencimiento/conflicto sin commit: no actualizar silenciosamente la versión. Si se autoriza una nueva revisión, conservar el directorio anterior y preparar un directorio privado nuevo con selección aprobada y otro dry-run; nunca sobrescribir el respaldo anterior.
5. Restauración de datos remotos: no es un rollback automático. Comparar respaldo, comprobante y estado actual mediante lecturas autorizadas; ensayar la reconstrucción en una copia aislada, y solicitar autorización separada de cada reparación. **No borrar pertenenciaId/comprobante para devolver un perfil a legacy, ni sobrescribir una salida/reingreso legítimos posteriores.** El caso normal de respuesta perdida se recupera por el comprobante, sin restaurar datos.

## Parche mínimo de reglas

[Diff revisable](membresia_piloto_2026-10-28/reglas-piloto.patch) y [artefacto completo](membresia_piloto_2026-10-28/firestore.piloto.rules), SHA-256 **`d5daa593f92bce0ee18caa8eabdb2fd3259ce4bade7f98a4f22ae9c9d0be64b7`**. Se parte del snapshot remoto verificado y se sustituye únicamente el bloque de perfiles por la protección/transición de membresía local existente. Una prueba compara por bytes todo lo que queda fuera de ese bloque.

No se editó `firestore.rules`. El parche:

- Impide añadir, sustituir o borrar pertenenciaId desde cualquier cliente.
- Conserva edición auxiliar propia, lecturas, consultas acotadas y administración auxiliar legítimas.
- Conserva salida/gestión antigua solo para perfiles que **no tienen el campo ni antes ni después**, con roles y campos acotados. No permite degradar perfiles migrados, falsificar iglesia o elevarse a titular.
- Para perfiles migrados exige la vía servidor de salida/expulsión/roles. El cliente antiguo debe actualizarse; no se promete que sus escrituras directas sigan válidas sobre esos perfiles.

El resto del snapshot remoto queda idéntico, incluidas las denegaciones financieras por defecto. Este artefacto sirve para **el piloto de membresía con Finanzas apagado**; no sustituye la revisión completa de reglas del candidato financiero para su futura publicación general. No se desplegó ninguna revisión.

## Transición y puntos de detención

1. Autorizar por separado la revisión protectora de reglas y revalidar por lectura su base remota antes de desplegarla. Detener si el snapshot cambió. Aplicar solo el artefacto aprobado y verificar después su hash efectivo.
2. Bajo autorización de despliegue independiente, asegurar los callables normales compatibles utilizando el plan selectivo del candidato anterior; no borrar ni reemplazar accidentalmente las 13 Functions existentes. Cliente y servidor financieros siguen apagados. El ejecutor de migración no despliega ni activa nada.
3. Hacer disponible el Web candidato compatible para el **usuario piloto**, por ejemplo en un canal de prueba autorizado, y confirmar que su URL permite iniciar sesión con su método autorizado. No reemplazar todavía Hosting habitual para todos: los siete ambiguos no están preparados y el cliente actual exige generación para salir. Los demás legados conservan sus rutas antiguas bajo el parche.
4. Confirmar que el piloto usa el cliente nuevo antes de migrarlo. La aplicación real requiere identidad ADC/IAM aprobada y lecturas frescas mínimas; no usar la sesión CLI antigua como prueba de permisos del ejecutor.
5. Ejecutar dry-run real solo con autorización de lectura y respaldo local. Revisar selección privada, hash de código/reglas y copias. Obtener autorización explícita del **único UID/lote/preparación**, y aplicar dentro de su vigencia. Ante cualquier bloqueo, detener sin ampliar alcance.
6. Verificar el commit y navegación del piloto. Una salida real modifica membresía y necesita autorización específica del usuario/cuenta de prueba; la autorización de migración no la incluye implícitamente.
7. Mantener los siete ambiguos y seis sin vínculo fuera del piloto. El cierre del piloto no autoriza otros lotes ni Hosting live. El reemplazo Web general sigue condicionado a resolver/excluir expresamente los casos ambiguos y la transición de clientes; no habilitar Finanzas como efecto de migrar pertenencia.

[Comandos y detenciones exactos, SOLO DOCUMENTADOS](membresia_piloto_2026-10-28/comandos-solo-documentados.ps1.txt). No se ejecutó ningún comando real de dry-run, aplicación, despliegue o Hosting.

## Evidencia ejecutada

| Validación actual | Resultado |
| --- | --- |
| Guardas nuevas de proyecto, selección, CLI, integridad y diff aislado | **5 aprobadas** |
| Piloto/emulador: CLI, respaldo, repetición, recuperación, exclusiones y revocación | **8 aprobadas** |
| Reglas del artefacto: pertenencia y compatibilidad anterior | **44 aprobadas** (33 + 11) |
| Node existente: migración, ingreso, salida, recuperación y diagnóstico | **250 aprobadas** |
| Flutter existente: salida y gestión de miembros/roles/expulsión | **46 aprobadas** |

El [piloto CLI real en emulador](membresia_piloto_2026-10-28/demo/resultado.json) preparó un solo perfil, produjo respaldos idénticos, asignó una generación y un comprobante con el mismo commit y repitió sin cambiar versión ni ID. Se recuperó el archivo principal perdido desde la copia. El perfil pudo salir mediante `desvincularMiembroIglesia` normal en `southamerica-west1`; conservó su generación y quedó desvinculado. Los campos auxiliares sintéticos permanecieron intactos. [Artefactos demo](membresia_piloto_2026-10-28/demo/), [log completo](membresia_piloto_2026-10-28/emuladores.log).

Una prueba distinta descartó la respuesta transaccional después de un commit verdadero del emulador: el motor informó incertidumbre, la verificación encontró el comprobante y el reintento no volvió a asignar. Se probaron rechazo de titular/encargado de otra iglesia, cambio de iglesia/encargo tras dry-run, Auth deshabilitada y revocación observada dentro del intento, respaldo alterado, cambio de UID/manifiesto, vencimiento y reglas no aprobadas. Las pruebas de reglas verificaron clientes antiguos y aislamiento; las Flutter existentes verificaron el circuito normal sin escrituras directas.

No se ejecutó Chrome/Android ni una nueva compilación Web en este encargo; el producto y los artefactos compilados anteriores no cambiaron. Los ensayos Node tuvieron sockets externos bloqueados y destino fijo demo-fesync, Auth 9098, Firestore 8088/8098 y Functions 5018. Los emuladores propios quedaron cerrados.

## Bloqueos y autorizaciones necesarias

1. **Reglas reales bloqueantes según la última lectura autorizada.** Autorizar el parche y su verificación efectiva, con transición coordinada. Este encargo no volvió a consultar el proyecto real.
2. **Identidad del ejecutor pendiente.** No se detectó variable de credenciales ni archivo ADC predeterminado local; `gcloud` tampoco está disponible en PATH. La sesión Firebase CLI anterior no equivale a ADC. Proporcionar una identidad temporal/ADC expresamente aprobada y permisos mínimos; no se crearon credenciales ni se modificó IAM. Validar lecturas/permiso transaccional sin conceder Owner/Editor o borrados globales por comodidad.
3. **Autorización de lecturas mínimas y respaldo del dry-run real.** Incluye campos de membresía, identidad UID/disabled, comprobante y relaciones adminUid/encargadoUid; ningún movimiento, monto, recibo contable o auditoría financiera. Aprobar destino independiente de copia privada.
4. **Autorización de aplicación para un solo perfil y hash concreto del dry-run vigente.** El manifiesto anterior está materializado, pero su versión debe seguir coincidiendo. No autoriza corregir roles, titulares o los siete ambiguos.
5. **Despliegues/cliente de prueba y eventual salida de prueba** requieren autorización independiente; la selección del piloto no autoriza Hosting live ni activación financiera.

## Archivos y Git

Respaldo previo de **1.173 rutas**; [respaldo](membresia_piloto_2026-10-28/respaldo.json), [integridad final](membresia_piloto_2026-10-28/integridad.json). HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live`, índice y archivos anteriores preservados. Solo se añadieron `herramientas/migracion_piloto/`, `test/membresia_piloto/`, este informe y artefactos/evidencia, más el manifiesto privado ignorado. Se conservaron todos los respaldos anteriores. El único aviso previo de `git diff --check` sigue siendo el espacio final de `functions/index.js:2047`.

**Cero contactos con Firebase real en este encargo, cero escrituras reales, cero despliegues y cero activaciones. Sin commits ni cambio de rama.** El paquete Finanzas Web anterior, contabilidad y módulos ajenos permanecen intactos.
