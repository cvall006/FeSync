# Preflight real de membresía legacy — solo lectura

**Decisión: BLOQUEADO para autorizar una migración general con alcance definitivo.** Se completó el inventario mínimo autorizado: hay **22 candidatos según membresía**, pero no se certifican como 22 migraciones ejecutables. Hay **7 perfiles ambiguos** y siguen excluidas comprobaciones necesarias sobre comprobantes y encargos. No se ejecutó ninguna migración.

## Cantidades observadas

Proyecto único `fesync-app-2026`, base `(default)`. Fotografía consistente a **2026-10-29 00:10:08 UTC**, equivalente al **28 de octubre de 2026, 21:10:08 en Santiago**. [Resultado agregado y registro de solicitudes](membresia_preflight_2026-10-28/resultado.json).

| Categoría excluyente | Perfiles |
| --- | ---: |
| Candidatos según los campos de membresía y titularidad | **22** |
| Ambiguos: iglesia referenciada inexistente en esa fotografía | **6** |
| Ambiguos: iglesiaId inválido | **1** |
| Con pertenenciaId válido en formato, sin acreditar procedencia | **0** |
| Sin pertenencia activa; no requieren asignación automática | **6** |
| **Total** | **35** |

Se observaron **2 documentos de iglesias**. En esos campos: **0** titulares asociados a varias iglesias, **0** iglesias sin perfil del titular, **0** administraciones no verificables y **0** contradicciones entre titular y rol/iglesia de su perfil. Estas métricas de iglesias no se suman a los 35 perfiles.

Los seis vínculos huérfanos **no se corrigen** buscando otra iglesia, creando una iglesia o retirando roles. El valor inválido tampoco se normaliza. No se infiere que el valor inválido represente una membresía múltiple. No se consultaron relaciones fuera del esquema canónico; cero titularidades múltiples observadas no acredita ausencia de cualquier relación histórica o externa.

## Acceso mínimo y separación de operaciones

Se revisaron el [procedimiento anterior](membresia_legacy_2026-10-28.md), `herramientas/migracion_demo/{cli,argumentos,entorno,herramienta}.js` y el motor existente. La CLI distingue `preflight/simular/verificar` de `aplicar/reanudar`; el adaptador restringe las escrituras del motor a ID/comprobante y coordina sus checkpoints. Sin embargo, sus lecturas usan `snapshot.data()` completo y la guarda solo admite emuladores. **No se utilizó esa herramienta contra producción ni se cambió su projectId.**

Se añadió [un lector separado](../herramientas/preflight_membresia_lectura.cjs), sin SDK Admin, sin importación del ejecutor/coordinador, sin opción de escritura y sin destino configurable:

- Firestore: únicamente `GET documents.list`, proyecto/base fijos, redirecciones rechazadas.
- `usuarios_globales`: máscara exacta `iglesiaId`, `rolGlobal`, `pertenenciaId`.
- `iglesias`: máscara exacta `adminUid`.
- Metadatos documentales necesarios para validar respuesta/versión y correlacionar en memoria. Ningún UID, vínculo individual, token, nombre o correo se imprime o guarda en el resultado.
- Tres solicitudes Firestore, HTTP 200: un sondeo acotado de perfil para obtener el reloj HTTP y dos listados con el mismo `readTime`. No hubo otras lecturas de documentos.
- La paginación conserva máscara y fotografía; se detiene ante error, permisos insuficientes, respuesta fuera de máscara, duplicados, ciclo o límite. No amplía lecturas ni usa un fallback sin máscara.

Se reutilizó una sesión CLI existente mediante lectura directa de su archivo. Fue necesaria una renovación OAuth **en memoria** (`POST` al servicio de autenticación), sin generar cuentas/claves, persistir tokens o modificar configuración. Todas las solicitudes a Firestore fueron GET. Esto acredita las operaciones del lector, no afirma que la identidad utilizada tenga un rol IAM exclusivamente lector.

La API documenta [GET con máscara de campos y readTime](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list). No se crearon transacciones remotas, checkpoints, exportaciones, auditorías de aplicación ni documentos. Los identificadores se usaron solo en memoria para correlacionar perfil e iglesia y luego producir agregados.

## Límites que impiden certificar una lista de escritura

1. **Siete ambiguos reales.** Requieren evidencia y decisión humana privada. No migrarlos automáticamente ni suponer su iglesia, rol o titularidad. El resultado no incluye una lista personal para intervención, conforme al alcance agregado solicitado.
2. **22 significa candidatos, no comprobantes verificados.** El motor original exige que no exista `migraciones_pertenencia/{uid}` antes de asignar. No se leyó esa colección, ni recibos/auditorías. Podrían existir comprobantes anteriores que obliguen a revisar; no se afirma que existan ni que falten. La transacción futura debe conservar esta barrera.
3. **Encargados no verificables dentro de la autorización actual.** La designación vive en `iglesias/{id}/finanzas_config/acceso.encargadoUid`, fuera de los campos de membresía permitidos. No se leyó esa ruta ni se infirió el encargo desde rolGlobal. Cantidad y conflictos de encargados: **no determinados**, no cero. Verificar exclusivamente esa relación necesitará autorización adicional delimitada.
4. **Ejecutor real no aprobado.** La herramienta demo conserva su destino fijo y no es una herramienta de producción. Aún se debe revisar y autorizar el adaptador administrativo que reutilice el mismo motor y soporte selección cerrada, lotes, respaldo, comprobantes y recuperación. El lector de este encargo no incorpora una vía de aplicación.
5. **Reglas y clientes necesitan transición coordinada.** La revisión siguiente utiliza código y el snapshot remoto del preflight anterior; este inventario no vuelve a certificar el ruleset actualmente desplegado ni la versión servida de Hosting.

La prohibición de leer datos financieros, recibos y auditoría se respetó. No se amplió el acceso para intentar cerrar esas incertidumbres. El inventario de los campos permitidos quedó completo, aunque la aptitud operacional de escritura no esté acreditada.

## Compatibilidad de reglas y clientes

Las reglas **locales** conservan pertenenciaId frente a modificaciones/borrados/fabricación del cliente y mantienen lecturas financieras privadas y escrituras financieras directas denegadas. Conservan una transición acotada para perfiles sin generación; una vez migrado, el cliente antiguo que escribe salida/roles directamente queda denegado y necesita actualizarse.

El Web candidato exige generación para salida y gestión protegida. La preparación debe coordinarse antes de reemplazar el Web habitual, con Functions normales disponibles, reglas protectoras aprobadas y actualización del cliente. El ensayo demo previo comprobó que migrar con el motor existente permite salir mediante el flujo normal; este preflight no repitió escrituras ni invocó callables reales.

El [snapshot de reglas remoto del preflight anterior](firebase_preflight_2026-10-28.md) permitía al propio perfil cambiar pertenenciaId conservando iglesia/rol. No es seguro asignar generaciones y habilitar Finanzas bajo esa mutabilidad. **Antes de una futura escritura se debe revalidar el ruleset vigente bajo autorización y aplicar la revisión protectora si todavía falta**, además de la transición de clientes. No se presume que lo remoto siga idéntico ni que las reglas locales estén desplegadas. Las 103 pruebas de reglas anteriores son antecedente; no se presentan como reejecutadas aquí.

## Procedimiento posterior exacto, sujeto a autorización

1. Autorizar el inventario privado necesario para intervenir y el acceso adicional mínimo: existencia/metadatos de comprobantes de migración y, si se requiere cerrar encargos, únicamente `encargadoUid` de acceso financiero. Revalidar también reglas/contratos desplegados. No autorizar lecturas genéricas de movimientos, recibos financieros, auditoría, nombres o correos para este fin.
2. Resolver/excluir los siete ambiguos mediante evidencia; no modificar sus relaciones como parte del lote. Definir si la solicitud de escritura abarca solo candidatos verificados o una transición general. Repetir la lectura mínima en una fotografía nueva: los 22 observados ahora no son una selección permanente ni una garantía frente a cambios.
3. Crear, en almacenamiento privado aprobado, un manifiesto de selección con UID, iglesia actual, rol, ausencia de ID, `updateTime` exacto y resultado de verificación de comprobante. Respaldar los documentos/campos del alcance aprobado y su estado previo, con permisos y restauración ensayados antes de escribir. No hacer una exportación global por defecto ni mezclar datos financieros. Esta preparación privada y su acceso se autorizan expresamente; nada se guardó aquí de perfiles reales.
4. Revisar el ejecutor administrativo real sobre **el mismo** `migrarPerfilPertenencia`, sin quitar guardas al demo ni generar otro motor. Aprobar su hash, proyecto/base, identidad IAM temporal, manifiesto cerrado, reserva/checkpoint, rutas y campos exactos de escritura. La autorización de este inventario no autoriza ese ejecutor.
5. Coordinar la ventana de clientes y protección de pertenencia. Mediante autorizaciones de despliegue independientes, asegurar primero Functions/contratos y reglas compatibles; impedir escrituras legacy incompatibles durante la transición. Mantener todas las habilitaciones financieras apagadas. Si la protección no se puede acreditar, no iniciar el piloto.
6. Ejecutar un **piloto de un perfil verificado**. Invocar el motor original con `seleccion:{uid,iglesiaId,version}` tomada del manifiesto y su adaptador transaccional revisado. Releer perfil/iglesia, comparar versión exacta, confirmar ausencia de ID y comprobante. El commit solo puede añadir ID y comprobante de migración; servidor genera la nueva generación actual y fecha real de preparación. No modificar rol, iglesia, titularidad ni designación financiera.
7. Verificar piloto: mismo estado previo salvo campo autorizado; un solo comprobante con origen/versiones coherentes, mismo commit; iglesia/titular/encargo inalterados. Probar salida y actualización con una cuenta de prueba expresamente autorizada, porque esa prueba sí modifica membresía; no usar una cuenta real cualquiera para demostrarlo.
8. Solo tras conformidad, continuar en **lotes de hasta cinco perfiles**, una transacción por perfil, con checkpoint persistente y métricas por lote. Revalidar selección en cada transacción; no considerar la lectura de hoy una autorización de estado futuro. Detener ante cualquier conflicto, ambigüedad, comprobante inesperado, error o diferencia fuera de alcance. Excluir los seis sin pertenencia y no renovar IDs encontrados.
9. Ante respuesta perdida/caída: conservar manifiesto y checkpoint; verificar ID/comprobante antes de repetir. Reanudar la misma selección bajo la reserva vigente; no sustituir versiones automáticamente. Una confirmación previa se reconoce sin segunda asignación. Si no se puede verificar el resultado, detener y pedir intervención humana.
10. Verificación final independiente y agregada, conciliación de excepciones, protección de pertenencia vigente y actualización de clientes. Publicar Hosting y demás recursos únicamente bajo autorización separada. Si hay incidente, detener lotes/publicación y conservar los IDs/comprobantes; no borrar generaciones para volver a legacy ni restaurar un cliente antiguo que dependa de escribir pertenencias directamente. Una restauración de respaldo requiere evaluación y autorización propia para no sobrescribir reingresos o cambios legítimos posteriores.

No se proporcionan comandos de escritura reales porque no hay ejecutor real aprobado ni manifiesto de candidatos definitivos. Lo que falta para solicitar una autorización de escritura concreta es cerrar las verificaciones mínimas, las excepciones del alcance y el ejecutor verificable.

## Pruebas y estado local

[Ocho pruebas locales del lector](membresia_preflight_2026-10-28/pruebas.log): todas aprobadas. Cubren exclusión de otras colecciones/proyectos y campos, separación GET sin cuerpo, fotografía/paginación, clasificación agregada, titularidad múltiple, respuesta fuera de máscara, 403 sin fallback y errores de cobertura/reloj. Se ejecutaron antes de la consulta real. No se instalaron dependencias ni se ejecutaron Flutter o pruebas con escrituras de emulador, innecesarias para este lector.

Se respaldaron **1.153 rutas previas**. HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live`, índice y archivos anteriores conservados; [respaldo](membresia_preflight_2026-10-28/respaldo.json), [integridad final](membresia_preflight_2026-10-28/integridad.json). Solo se añadieron lector, ocho pruebas e informe/evidencia agregada. Migrador, motor, reglas, Flutter, candidato Web y respaldos anteriores permanecen intactos.

Sin escrituras de recursos Firebase, migraciones, despliegues, activaciones, cambios de permisos/configuración, commits o cambio de rama. Sin consulta de datos financieros, recibos, auditoría, Auth de usuarios, nombres ni correos.
