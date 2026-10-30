# FIN-RELEASE-8 — pendientes y mantenimiento V1

Implementación local, sin despliegues ni acceso a Firebase real. Las configuraciones publicables del cliente y del servidor siguen apagadas. Esta fase sustituye los bloqueos de pendientes y mantenimiento descritos en FIN-RELEASE-7; no autoriza publicar ni habilitar iglesias reales.

## Solicitudes y recuperación

Los dos contratos anteriores (`finanzasV1Consultar` y `finanzasV1Ejecutar`) se conservan. Se añaden dos exports normales en `southamerica-west1`:

| Callable | Contrato |
| --- | --- |
| `finanzasV1ResolverSolicitud` | `{accion: consultar o descartar, solicitud: cuerpoOriginal}`; el cuerpo original conserva exactamente `solicitudId`, `contexto`, `operacion`, `campos` |
| `finanzasV1Mantener` | `{solicitudId, contexto, accion, periodoId?}`; acciones `preparar`, `pausar`, `verificar`, `inicializar`, `cambiarPeriodo`, `reanudar`; período obligatorio únicamente para preparar/cambiar |
| Resolución de paso administrativo | Al mismo `finanzasV1Mantener`: `{accion: resolverSolicitud, solicitud: cuerpoOriginal, descartar: boolean}` |

Cada entrada exige Auth, entorno admitido, perfil y pertenencia actuales, titular válido, acceso financiero vigente, habilitación privada exacta de esa iglesia y ausencia de V2. El contexto enviado es una precondición, nunca una concesión de acceso. El mantenimiento exige además permiso `administrarConfiguracion` y que el actor sea el `adminUid` actual. Un encargado, incluso vigente, no puede mantener.

| Estado | Evidencia y conducta |
| --- | --- |
| `CONFIRMADA` | Intención, recibo original, entidad y auditoría coherentes. Se devuelve el ID/secuencia original sin volver a contabilizar. La consulta requiere permiso de lectura actual; no necesita conservar el permiso original de ajuste/escritura. |
| `NO_CONFIRMADA` | No se observó recibo en esa transacción. No demuestra que una llamada todavía en vuelo no vaya a confirmar. Flutter conserva el pendiente; solo el botón explícito de recuperar permite reintentar el mismo cuerpo si siguen vigentes sus condiciones. |
| `REQUIERE_NUEVA` | Cambiaron condiciones registradas, autorización de la operación, protocolo o período. Flutter explica el vencimiento y no ejecuta. Primero debe resolverse mediante descarte seguro. |
| `RECHAZADA` | Existe marcador terminal de descarte sin commit. El servidor impide ejecutar ese ID. Flutter archiva la resolución antes de liberar el pendiente. Una nueva operación requiere completar y enviar explícitamente un formulario, con ID aleatorio nuevo y fecha del período actual. |
| Resultado incierto | Timeout, pérdida de respuesta, error de almacenamiento o falta de autorización no prueban rechazo. Se conserva el cuerpo/ID; no se borra ni se cambia de iglesia. |

Abrir o refrescar la pantalla solo inspecciona el pendiente. No ejecuta automáticamente operaciones. Si se confirmó, archiva el recibo antes de vaciar el pendiente; si el archivo local falla, conserva el pendiente. Los prefijos de almacenamiento de FIN7 permanecen separados por entorno/proyecto y usuario. El mantenimiento tiene su propio pendiente persistido antes del HTTP.

El descarte crea `finanzas_resoluciones/{uid}/solicitudes/{id}` y su auditoría en una transacción. Captura de intención, escritor de movimientos y escritor de catálogo leen ese marcador. El descarte lee el recibo. Los conflictos y reintentos transaccionales garantizan exclusión entre commit y descarte. No modifica la intención original, movimientos, reversas ni recibos. Se contrasta la huella del cuerpo original; no se permite editar parámetros bajo un ID registrado.

Los pasos administrativos guardan recibos en `finanzas_mantenimiento/{uid}/solicitudes/{id}` y descartes en `finanzas_mantenimiento_resoluciones/{uid}/solicitudes/{id}`. Se autorizan de nuevo incluso al recuperar un resultado. Un paso perdido se recupera con el mismo ID/cuerpo; no se cambia la acción o el período. El descarte administrativo también cerca transaccionalmente llamadas retrasadas.

## Mantenimiento mínimo

La entrada normal reutiliza el mantenimiento V1 y los proyectores existentes. No introduce un escritor alternativo de movimientos ni un editor de importes. El enlace «Mantenimiento de Finanzas» del Dashboard conduce a una pantalla pequeña para el titular; las decisiones de seguridad siempre vuelven a comprobarse en el servidor. No hay activación privada desde esa pantalla.

1. **Libro nuevo vacío:** con el acceso del producto previamente válido y habilitación privada autorizada, `preparar(AAAA-MM)` comprueba ausencia de controles, configuración y colecciones económicas. Crea metadatos CLP/escala 0/América-Santiago, resumen cero y protocolo bloqueado en época 1. No inventa cuentas, importes ni historia. Verificar e inicializar. `inicializar` repite la observación transaccional, exige ausencia de proyección previa y conciliación sin diferencias, crea el sello/verificación inicial y pasa a época 2 operativa.
2. **Libro V1 existente sin proyección incremental:** pausar, verificar e inicializar. No admite reinicializar una proyección existente. La inicialización reconstruye desde los originales y contrasta secuencias, controles, saldos, resúmenes, aperturas y reversas; registra corte, versión de control y digest. Toda inicialización declara `certificacionHistorica:false`.
3. **Libro incremental existente:** pausar, verificar y reanudar. La verificación observa y audita; no repara divergencias ni certifica procedencia histórica. Reanudar repite la comprobación completa en su propia transacción.
4. **Cambio mensual:** pausar, verificar, cambiar al mes inmediatamente siguiente, verificar y reanudar. El cambio exige consistencia completa en esa misma transacción y conserva la pausa. Crea el resumen nuevo con saldo inicial igual al final anterior, cambia el período de la proyección y no altera originales, recibos ni resumen anterior. Diciembre avanza a enero del año siguiente. No hay cron, apertura automática por reloj del dispositivo ni salto de meses.
5. **Respuesta perdida o reinicio:** recuperar el paso pendiente; un commit anterior devuelve el mismo recibo sin repetir el efecto ni su auditoría. Si no se puede completar, solicitar su descarte seguro y luego elegir explícitamente otro paso. Una sesión revocada no puede recuperar, descartar ni continuar el mantenimiento.

Cada paso y su recibo/auditoría se confirman juntos en una transacción Firestore. Es reanudable por pasos e idempotencia persistente; no es un trabajo por páginas con checkpoints intermedios. Límites conservados: 50 cuentas, 50 categorías, 50 saldos/aperturas, 24 resúmenes, 20.000 movimientos/reversas y 8 MiB de documentos de movimientos. La enumeración en páginas de 250 se realiza dentro de una sola transacción. Los límites de Firestore y el tiempo de transacción pueden rechazar antes; no hay actualización parcial. Al alcanzar el límite se rechaza, se mantiene la pausa y se requiere evaluación humana. No se amplía esta fase a otro motor.

## Incidencias que necesitan intervención humana

- **Revocación, cambio de iglesia o pertenencia:** conservar el ID y el pendiente. No otorgar acceso temporal ni trasladar el cuerpo a otra identidad. El titular vigente debe revisar mediante un procedimiento autorizado la situación de la operación; esta fase no permite recuperar recibos de otro usuario. Solo una restauración legítima de acceso/contexto permite usar la recuperación del propietario original. Sin ella el pendiente se conserva y requiere resolución operativa fuera de este cliente.
- **Recibo, entidad o auditoría incoherentes; movimiento sin recibo:** detenerse. No descartar ni crear una segunda operación para compensar una supuesta ausencia. Conservar evidencias y revisar las fuentes originales bajo autorización. No hay botón para reconstruir recibos o modificar el libro.
- **Proyección inexistente/divergente o historia no verificable:** mantener pausa. Una conciliación por sí sola no acredita el origen histórico. La inicialización verificable es obligatoria; si falla, no se concede excepción. La reparación y su autorización quedan fuera del alcance.
- **Período heredado cerrado con `periodosAbiertos:[]`:** con proyección íntegra se puede recuperar una confirmación y descartar una intención sin commit, pero no ejecutar ni reanudar. No se inventa un mes abierto: revisar y autorizar el saneamiento del metadato por separado. El circuito normal de cambio de mes evita producir ese estado.
- **Pérdida del almacenamiento local:** no reconstruir otro cuerpo bajo el mismo ID ni asumir rechazo. Conservar cualquier copia legítima del cuerpo y recibo; sin el cuerpo original y autorización vigente, revisión humana. Los errores normales de escritura del archivo local conservan el pendiente anterior.

No se incluye aquí ninguna autorización para consultar o reparar datos reales.

## Privacidad, compatibilidad y límites de publicación

`firestore.rules` y `storage.rules` no cambian en FIN8. Las reglas locales corregidas en FIN6 deniegan lecturas directas de libro, recibos, intenciones, resoluciones y mantenimiento incluso al titular y con gate activo; todas las escrituras financieras siguen exclusivamente en servidor. Las nuevas rutas privadas también se prueban por documento y consulta. No se han inspeccionado reglas desplegadas y no se presume que coincidan.

Los contratos originales y el motor de movimientos permanecen; únicamente consultan el marcador terminal antes de capturar/escribir. Los clientes anteriores siguen operando y recuperando confirmaciones mientras conserven el permiso original. Un cliente anterior sin la nueva resolución no puede resolver condiciones vencidas: requiere actualizar el cliente; el servidor rechaza el ID descartado y no duplica. No se modifican V2, inventarios, Work, migración de membresía ni acreditaciones.

Bloqueos y comprobaciones restantes antes de publicar:

1. Autorización explícita de publicación y activación controlada. Cliente y servidor publicables siguen apagados, y no se han habilitado iglesias reales.
2. Revisar bajo autorización el estado realmente desplegado de reglas/configuración y la integridad de cada iglesia candidata. No se puede dar por hecha su correspondencia con el repositorio local.
3. Todo libro que exceda límites, tenga divergencias o procedencia no verificable queda excluido. Esta fase no incorpora una vía de reparación o acreditación administrativa.
4. Validación del transporte/almacenamiento seguro sobre las plataformas nativas que se vayan a distribuir. La navegación aquí es Flutter con adaptadores de prueba sobre HTTP real local; no es evidencia de un Android físico.

La secuencia de despliegue y reversión sigue siendo **solo documentada** en FIN5/FIN7: revisar paquete y contratos, desplegar únicamente con autorización, mantener desactivación global y privada, verificar reglas antes de permitir operación, preparar iglesia candidata con procedimiento autorizado y activar gradualmente. Ante incidencias pausar mediante el titular mientras exista acceso; el procedimiento autorizado del servidor puede apagar el gate y/o la habilitación global. Un gate apagado bloquea también recuperación y mantenimiento; no elimina los pendientes, recibos ni movimientos. No se revierte borrando datos ni restaurando un backend que desconozca los marcadores de descarte.

## Validación y trazabilidad

Los comandos reproducibles, resultados finales, evidencia por escenario, archivos y estado Git se adjuntan en `fin_release_8_2026-10-26/`. Los ensayos fijan `demo-fesync`, Auth/Firestore/Functions Emulator y endpoints locales. Un preload bloquea sockets Node externos; Flutter bloquea HTTP externo y registra destinos. No se usa una cuenta de servicio, Firebase real ni despliegue.

Se conserva el primer ensayo que pasó 32 pruebas de integración pero cuya navegación falló por colisión simultánea de dos procesos Flutter al copiar `NativeAssetsManifest.json`. Las 17 pruebas relevantes Flutter sí pasaron. La repetición final se ejecuta secuencialmente; no se presenta la colisión como un fallo funcional ni como un ensayo aprobado.

Un segundo ensayo pasó las 34 pruebas del servidor y detectó una colisión del propio ensayo entre la inspección de la pantalla abierta y la recuperación desde otra instancia del servicio. Se corrigió la secuencia del ensayo para cerrar primero la pantalla, simulando el reinicio. El cierre final `integracion-cierre.log` pasó tanto las 34 pruebas Node en emulador como la navegación Flutter conectada. No se desactivó el bloqueo de envíos del servicio.

| Validación final | Resultado | Evidencia |
| --- | --- | --- |
| `npm.cmd test`, desde `functions/` | 1.786 aprobadas, 0 fallos/omitidas | `npm-final.log` |
| `node test/finanzas_release8/iniciar.cjs` | 34 aprobadas del servidor + 1 navegación Flutter conectada; salida 0 | `integracion-cierre.log`, `emulador.json`, `flutter-navegacion.json` |
| `node test/finanzas_release8/reglas.cjs` | 46 financieras + 13 privacidad ampliada + 33 pertenencia; 92 aprobadas | `reglas-final.log` |
| Flutter relevante: pendientes, servicio, pantalla y paginación | 17 aprobadas | `flutter-relevante-inicial.log` |
| `flutter test --no-pub --reporter expanded`, suite completa | 456 aprobadas, 0 fallos; 6 integraciones condicionadas omitidas en la pasada genérica | `flutter-final.log` |
| Flutter analyze, sin pub: Finanzas, Dashboard, FIN8 y servicio | Sin incidencias, salida 0 | `analyze-cierre.log` |

La evidencia conectada registra saldo `10198 → 10187` y exactamente un movimiento agregado tras perder la respuesta. Los cuatro nombres normales están presentes y los únicos destinos HTTP son `127.0.0.1:9098`, `:8088` y `:5018`; conexiones externas observadas: 0. Se incluye pausa con respuesta perdida, recuperación del mismo paso, verificación y reanudación desde Dashboard. En el servidor se ejercitan también ingresos, gastos, transferencias, reversas, paginación y callables anteriores de roles/ingreso. Las ocho carreras de descarte/captura/escritura terminan siempre con recibo o marcador terminal excluyentes y secuencia exacta.

Respaldo previo verificado: 758 rutas, con SHA-256, diffs, índice, rama y HEAD en la ubicación registrada en `respaldo.json`. El informe final de integridad distingue modificaciones de esta fase frente a los numerosos cambios locales anteriores. No se crea commit ni se cambia de rama.

Rama preservada: `integration/adora-live`; HEAD `01223cd990312677ebbef2892ae7e99b1109e272`. Índice sin cambios. Hay 14 archivos preexistentes modificados por FIN8 y 744 rutas con su estado anterior conservado, incluida la eliminación Kotlin previa. `integridad.json` enumera cada cambio y cada fuente nueva con SHA-256; `intervencion.patch` contiene únicamente el diff respecto al respaldo, y `git-status.txt` conserva el estado completo. El único aviso de `git diff --check` es un espacio final preexistente de `functions/index.js`, ahora en línea 2047; se conserva deliberadamente.

Los cambios de esta fase se limitan a los dos exports adicionales de `functions/index.js`; los adaptadores V1, guardas y mantenimiento compartidos; los tres módulos nuevos `operativa.js`, `resolucion.js`, `administracion.js`; servicio/pantalla financiera, pantalla de mantenimiento y su enlace del Dashboard; contratos y escenarios de prueba; documentación/evidencia. Las listas exactas son `modificados` y `nuevasFuente` en `integridad.json`. El manifiesto `runtime-manifest.json` comprueba offline la clausura de dependencias actual y todos los archivos V1; los paquetes históricos FIN5/FIN7 se conservan y no son el artefacto actual para desplegar.

El runtime actual comprende 32 archivos (los 10 V1 incluidos), 25 exports y Node 24. No se instalan dependencias. La suite completa conserva regresiones de Dashboard, capacitación, ingreso, roles, membresía y salida; las seis pruebas conectadas condicionadas no se presentan como ejecutadas por ese comando. La navegación FIN8 sí se ejecutó por separado con su bandera explícita y emuladores, según la tabla.

**Cierre FIN-RELEASE-8:** circuito local de pendientes y mantenimiento V1 completado y validado. Se detiene el trabajo en esta fase. Ningún despliegue, consulta de producción, activación real, commit, cambio de rama, nueva acreditación o edición de reglas. La publicación sigue sujeta a autorización y a las comprobaciones de entorno/datos reales y plataforma descritas arriba.
