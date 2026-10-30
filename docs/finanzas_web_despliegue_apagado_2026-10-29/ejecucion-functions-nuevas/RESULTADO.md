# Detenido antes de desplegar: IAM de invocación de servicios nuevos

**Functions creadas: ninguna. Revisiones nuevas: ninguna. No se invocó `firebase deploy`.**

Se verificaron los 79 archivos del paquete `e0adf6f2836dcf3f06200c15dadf39ef321d57ebd332ea90aed06ba8b1aa8525`, dependencias locales reutilizadas, proyecto, región `southamerica-west1` y configuración financiera apagada. Las diez Functions propuestas están ausentes en el inventario remoto. Las 13 existentes están ACTIVE, GEN_2, Node 24, en la región esperada; nombres, revisiones y fechas de actualización coinciden antes/después de las consultas. No hubo escrituras remotas.

Las siete APIs consultadas (Functions, Build, Artifact Registry, Run, Eventarc, Pub/Sub y Storage) están habilitadas; no se habilitó ninguna.

## Condición de detención encontrada

El CLI instalado llama a `run.setInvokerCreate(..., ["public"])` para crear los callables Gen 2: `firebase-tools/lib/deploy/functions/release/fabricator.js:483`. `firebase-tools/lib/gcp/run.js:116` construye una política con `roles/run.invoker`; `gcp/proto.js:91` convierte `public` en `allUsers` y se ejecuta `setIamPolicy` sobre cada servicio nuevo.

Es IAM de los diez servicios nuevos, no una actualización de las 13 Functions existentes ni una concesión de acceso directo a Firestore. La autorización de aplicación mediante `request.auth` y los controles financieros permanecen en el código. Sin embargo, es una escritura IAM necesaria del despliegue normal, que no se consideró expresamente autorizada bajo la condición de detener ante cambios IAM no aprobados. Se detuvo antes de crear recursos para evitar un despliegue parcial seguido de la configuración IAM.

No se cambió el candidato a invocación privada ni se alteró el CLI para omitir la política: eso cambiaría el comportamiento autorizado. No se crearon cuentas, claves, roles de proyecto ni permisos para el operador.

## Incidencia de medición resuelta

La primera comparación de huellas completas de respuesta detectó diferencias y cerró `resultado.json` con error. Las 13 revisiones/fechas ya coincidían. Una comprobación adicional exclusivamente de configuración reprodujo cambios de orden en `eventTrigger.eventFilters`; al normalizar el orden de esos filtros y de mapas, sin omitir campos, ambas respuestas resultaron iguales. Se conserva el resultado inicial y la explicación, no se presenta como un cambio de código remoto. Véase `estabilidad.json`.

## Estado financiero y alcance conservado

El paquete sigue con cliente false y servidor `publicable/fesync-app-2026/false`. No existen aún los dos callables financieros seleccionados en producción, por lo que no hay configuración financiera nueva desplegada. No se consultaron ni modificaron documentos, gates, perfiles, libros, montos, movimientos o recibos. Tampoco reglas, Hosting, las dos Functions de ingreso, IAM, APIs, facturación, Git HEAD/índice ni módulos ajenos.

## Próxima autorización necesaria

Si se acepta el IAM estándar de creación, autorizar expresamente **solo establecer `roles/run.invoker` para `allUsers` en los servicios Cloud Run correspondientes a las diez Functions nuevas del manifiesto**, manteniendo los chequeos de autenticación/aplicación y Finanzas apagado. No incluir permisos de proyecto, cuentas de servicio, servicios anteriores ni otras políticas. Revalidar de nuevo ausencia de las diez y estado del paquete antes de crear; detener si aparece cualquier otro cambio requerido. No se continúa a reglas, ingreso, Hosting ni datos.

Las políticas de agentes de servicio, permisos del operador y demás posibles requisitos de ejecución no se acreditan por este resultado. Si el intento futuro requiere alguno adicional, se vuelve a detener según el alcance autorizado.

Evidencia: `resultado.json` contiene inventario antes/después, revisiones de las 13 y consultas de APIs; `estabilidad.json` documenta la comparación adicional. Ninguno contiene tokens ni valores de variables remotas.
