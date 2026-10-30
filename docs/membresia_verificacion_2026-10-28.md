# Membresía: verificación final anterior a migración

**Datos: 22 candidatos confirmados para preparación de pertenencia. Ejecución real: BLOQUEADA por las reglas desplegadas y por falta de ejecutor de producción aprobado.** Los siete ambiguos quedan separados; no necesitan resolverse para proponer un piloto limitado a los confirmados. No se migró ningún perfil.

## Alcance confirmado

Solo `fesync-app-2026`, base `(default)`. Fotografía Firestore **2026-10-29T00:18:03.000Z**, **28/10/2026 21:18:03 en Santiago**. [Resultado agregado y solicitudes](membresia_verificacion_2026-10-28/resultado.json).

| Grupo | Cantidad | Decisión sobre los datos |
| --- | ---: | --- |
| Candidatos confirmados | **22** | Migrables bajo las precondiciones de ejecución de abajo |
| De esos candidatos: requieren revisión adicional | **0** | Sin conflictos detectados en las relaciones consultadas |
| De esos candidatos: no migrables | **0** | Ninguno excluido por identidad ausente/deshabilitada o comprobante previo |
| Ambiguos originales | **7** | Excluir de toda migración automática |
| Sin pertenencia activa | **6** | Fuera de migración automática |
| **Total de perfiles** | **35** | Los subgrupos de candidatos no se suman otra vez |

Los 22 conservan ausencia de pertenenciaId, iglesia existente y rol/titularidad coherentes. **22 identidades Auth existen y están habilitadas; 22 comprobantes de migración están ausentes.** La segunda lectura no detectó cambios de versión en esos perfiles durante la verificación. Hay **20 candidatos no titulares y dos titulares**.

Se consultaron únicamente `encargadoUid` de las dos iglesias de los candidatos: **ambos documentos de acceso están ausentes en esa fotografía**. Por tanto no se observó designación de encargado en la fuente canónica del producto ni conflictos derivados; no se crearon esas configuraciones. Esto no afirma el estado de otros datos financieros o de sus habilitaciones, que no se leyeron.

No se observaron titularidades múltiples ni contradicciones de titularidad en las dos iglesias. FeSync representa una pertenencia activa canónica por perfil; no se certifican relaciones históricas o campos ajenos a ese contrato. La confirmación se refiere al estado observado, no reconstruye fechas de ingreso ni acredita historia previa.

## Siete casos para revisión humana

**Seis** referencian una iglesia que no existe; **uno** tiene `iglesiaId` de tipo cadena pero vacío. No se completaron vínculos ni se asignaron roles/IDs.

El [reporte privado de revisión](../migrate_working_dir/membresia_revision_2026-10-28/revision.json) contiene una entrada por ambiguo con UID/ruta de perfil, versión observada, motivo, referencia de iglesia cuando existe y acción manual. También contiene las referencias de los 22 confirmados y la propuesta concreta de un único perfil para piloto; el informe general no publica esas referencias.

La carpeta privada tiene **herencia de ACL desactivada y permiso únicamente para el usuario Windows actual**; se comprobó también la ACL del archivo. Está excluida por la regla Git existente `migrate_working_dir/`, fuera de builds y del paquete Web. No se modificó `.gitignore`. Se conservó la copia inicial, igualmente protegida, en `.dart_tool/membresia_revision_2026-10-28/revision.json`. [Control agregado y hash del reporte](membresia_verificacion_2026-10-28/reporte-privado-control.json). No adjuntar estas referencias a un PR, Hosting o informe general.

Intervención requerida: contrastar cada vínculo huérfano con evidencia administrativa autorizada y el campo vacío con el origen del registro. Cualquier corrección posterior necesita decisión explícita independiente; la migración no debe elegir una iglesia alternativa, crear una iglesia faltante, eliminar roles ni inventar una fecha. Los seis sin pertenencia activa siguen excluidos.

## Reglas remotas: bloqueantes

Se leyó el release `cloud.firestore`, su fuente y nuevamente el release. Permaneció estable: ruleset **`26a2c1e2-5ea0-4d03-bf30-b19ac39873af`**, actualizado **2026-10-13T01:23:28.514049Z**; fuente idéntica al snapshot del preflight anterior. SHA-256 **`8398b1200abe8f2b5c1f879bcf866566b7f1d0c68e55c6b37893117ae6d324f0`**.

En [la fuente desplegada leída](membresia_verificacion_2026-10-28/remotas-0.rules), el `allow update` de perfil propio solo conserva `iglesiaId` y `rolGlobal`; no conserva pertenenciaId. Las reglas locales protegen ese campo.

**Prueba reproducida únicamente en emulador:** un usuario sintético pudo añadir, sustituir, anular y borrar pertenenciaId bajo el snapshot remoto, conservando iglesia/rol. Las cuatro operaciones quedaron denegadas bajo las reglas locales. La edición auxiliar legítima se permitió y la elevación propia a admin se denegó en ambos casos. [Dos pruebas comparativas aprobadas](membresia_verificacion_2026-10-28/reglas-emulador.log), proyecto demo-fesync aislado en 8098; ninguna escritura de prueba remota.

No iniciar la asignación de generaciones bajo las reglas remotas actuales. Primero debe autorizarse y verificarse la protección coordinada de pertenencia y la transición de clientes. El cliente antiguo que modifica salida/roles directamente dejará de poder hacerlo sobre perfiles migrados; debe actualizarse al cliente con callables normales. El nuevo cliente exige generación para esas acciones. No solucionar la transición debilitando reglas ni restaurando escritores antiguos de pertenencia.

## Estado del ejecutor existente

| Requisito | Evidencia y límite |
| --- | --- |
| Mismo motor, sin segunda membresía | `functions/migraciones/pertenencia_ejecucion.js` existente; no se modificó ni invocó en real |
| Precondiciones | Perfil/iglesia releídos en transacción, rol y titularidad coherentes, ausencia de ID/comprobante, iglesia y `updateTime` exacto contra selección |
| Escrituras mínimas | Solo añade pertenenciaId y crea comprobante en el mismo commit; no toca iglesia, roles, titularidad, encargos o contabilidad |
| Reintentos | Hasta cinco intentos transaccionales; generador servidor solo después de lecturas. ID existente se omite; comprobante previo impide reasignar un ID eliminado |
| Coordinación | Herramienta demo con checkpoint/reserva, fencing, selección pendiente persistente y reanudación; conserva versión ante conflicto/incertidumbre |
| Lote cerrado de producción | **No disponible:** la CLI demo recorre perfiles por cursor, no consume el manifiesto aprobado de estos 22. No usarla como selector real |
| Respaldo por lote | **No implementado** en el ejecutor demo. Checkpoint/comprobante no son respaldo de los campos anteriores ni restauración ensayada |
| Lecturas y permisos mínimos | Demo lee documentos completos mediante SDK y usa cliente OAuth vacío solo para emuladores. No hay identidad IAM real de ejecución validada con permisos mínimos ni adaptador real con máscaras y lista de destinos cerrada |
| Auth vigente | El motor no consulta Auth. El futuro ejecutor debe revalidar UID/estado antes del lote, además de las precondiciones transaccionales de Firestore |

**Conclusión:** el motor y la coordinación demo tienen las garantías de idempotencia necesarias, pero el ejecutor demo **no está listo para producción**. No se deben quitar sus guardas, sustituir el projectId o usar una sesión privilegiada para improvisar una aplicación.

Para el ejecutor futuro, proponer únicamente las operaciones IAM necesarias: `datastore.entities.get`, `list` si el verificador lo requiere, `create`, `update` y `datastore.databases.get` para transacciones; Auth `firebaseauth.users.get` para la verificación. No requiere borrar documentos, importar/exportar globalmente, desplegar, administrar IAM o acceder a secretos. Es una propuesta pendiente de validar con una identidad temporal y alcance de base adecuados; no se cambiaron permisos ni se probó escritura real con ese rol. Las restricciones de rutas/campos y de manifiesto deben imponerse también en el adaptador revisado, sin suponer aislamiento por campo a partir del nombre de un rol. [Correspondencia oficial de operaciones e IAM](https://firebase.google.com/docs/firestore/security/iam).

## Primer lote recomendado y autorización posterior

**Un perfil no titular y no encargado**, seleccionado entre los 20 confirmados de ese grupo. Su referencia y versión están en `primerLoteSugerido` del reporte privado. Los dos titulares pueden considerarse después de comprobar el piloto; no se transfiere su administración ni se les habilita salida.

Antes de solicitar autorización de ejecución de ese lote concreto:

1. Aprobar el cambio protector de reglas y la transición de cliente/Functions como intervención separada. Verificar después su estado efectivo y disponibilidad de los contratos normales. Finanzas permanece apagado; nada de esto se desplegó aquí.
2. Aprobar un ejecutor administrativo mínimo que invoque **el mismo motor**, consuma el manifiesto privado cerrado y rechace cualquier UID/ruta/campo fuera del lote. Separar verificación de aplicación y exigir modo de aplicación explícito; no ofrecer un destino genérico. No introducir otro motor ni nuevas credenciales permanentes.
3. Preparar respaldo privado del lote y de las precondiciones necesarias, fuera de Git/Hosting. Incluir presencia/ausencia de campos, valores/versiones originales del perfil y ausencia del comprobante; registrar las referencias/hash del ejecutor y del manifiesto. Ensayar recuperación y cotejo antes de escribir. Un checksum o el reporte de hoy, por sí solos, no sustituyen ese respaldo.
4. Revalidar lectura mínima de perfil, iglesia/titularidad, identidad Auth, comprobante y encargo del piloto inmediatamente antes de ejecutar. Las versiones observadas hoy no se actualizan automáticamente ni autorizan datos futuros. Auth y Firestore no comparten una transacción; la comprobación de identidad es observacional y debe repetirse, mientras el motor protege las condiciones Firestore dentro de su transacción.
5. Obtener autorización **del UID privado, versión y lote de uno**, identidad temporal, respaldo y hash del ejecutor. Solo entonces permitir el commit original: nueva generación servidor y comprobante, sin ninguna otra mutación. La migración no reconstruye historia ni concede una designación financiera.
6. Verificar antes/después que solo se añadió el campo autorizado y su comprobante coherente, que iglesia/roles/titularidad/encargo permanecen iguales y que no hay segunda asignación al repetir la misma selección. Una prueba de salida real modifica membresía y necesita una cuenta/acción de prueba expresamente autorizada; no usar una persona real cualquiera.
7. Ante respuesta perdida, conservar checkpoint/selección; verificar ID y comprobante antes de reanudar. Ante conflicto, cambio de versión, identidad deshabilitada o evidencia incierta, detener sin refrescar selección ni borrar ID/comprobante. La recuperación nunca consiste en degradar a legacy. Solo después de validar el piloto proponer lotes siguientes de hasta cinco, excluyendo los siete ambiguos y los seis sin pertenencia activa.

No hacen falta nuevas lecturas personales generales para definir el grupo de 22. Los bloqueos pendientes son concretos: **protección efectiva de reglas, transición del cliente y ejecutor real con selección cerrada/respaldo**, no otra investigación de datos financieros.

## Evidencia y conservación

El verificador nuevo mantiene separado el resultado agregado del archivo privado. Consultó perfiles únicamente con `iglesiaId/rolGlobal/pertenenciaId`, iglesias solo `adminUid`, comprobantes de migración solo existencia/`version`, y acceso financiero solo `encargadoUid`. Se detiene ante permisos insuficientes sin ampliar el acceso. No se consultaron movimientos, montos, recibos contables, auditoría financiera, nombres, correos, teléfonos ni proveedores de autenticación.

**28 GET Firestore**, **3 GET de reglas** y **un POST Auth `accounts:lookup`** con proyección `users(localId,disabled)`. Ese [POST está documentado como consulta de cuentas](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/lookup); no modifica usuarios. La renovación OAuth adicional fue solo en memoria, sin persistir sesión ni crear cuentas/claves. Las lecturas Firestore compartieron fotografía salvo la relectura final de versiones; Auth/reglas tienen sus verificaciones separadas. No se presenta el conjunto como una transacción global o autorización de un estado futuro.

Pruebas ejecutadas: **17 locales del inventario/verificador** y **2 comparativas de reglas en emulador**, todas aprobadas. Incluyen 403 sin fallback, máscara de datos personales, rechazo de otras rutas, Auth ausente/deshabilitado, comprobantes previos, encargo cruzado, cambio de versión y separación de informes. No se repitieron las suites financieras/Flutter porque no hubo cambios de producto.

Respaldo inicial de **1.160 rutas**; [respaldo](membresia_verificacion_2026-10-28/respaldo.json) e [integridad final](membresia_verificacion_2026-10-28/integridad.json). HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live`, índice y archivos anteriores conservados. Solo se añadieron verificador/pruebas, informe/evidencia y referencias privadas protegidas. Motor de membresía y financiero, demo, Flutter, reglas locales, V2, inventarios y Work intactos. `git diff --check` conserva únicamente el espacio final previo en `functions/index.js:2047`.

**Sin escrituras remotas, migraciones, despliegues, activaciones, cambios de permisos reales, commits ni cambio de rama.** Se modificaron únicamente ACL locales del reporte solicitado y archivos locales nuevos. El emulador aislado propio quedó cerrado.
