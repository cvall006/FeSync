# Cierre local de pertenencia legacy

**APTO PARA SOLICITAR AUTORIZACIÓN DE MIGRACIÓN/PUBLICACIÓN.** La solución existente se verificó desde el Web compilado y la entrada normal de Functions en `demo-fesync`. La publicación general requiere preparar primero los perfiles legacy y resolver las excepciones; actualizar Hosting por sí solo sigue siendo insuficiente. No se acredita el estado de ningún perfil real.

## Causa y solución mínima

`RootGate._salirCongregacion` en `lib/main.dart` lee el perfil del servidor y exige una generación `pertenenciaId` válida. Cuando falta muestra «La cuenta requiere migración de pertenencia antes de salir» y no envía la operación. `desvincularMiembroIglesia` también exige esa generación vigente para impedir que una solicitud vieja afecte un reingreso. Las reglas permiten ciertas operaciones antiguas sobre perfiles sin generación, pero eso no satisface el contrato del cliente actual.

Se reutilizaron **sin cambios** `herramientas/migracion_demo/herramienta.js`, su CLI y `functions/migraciones/pertenencia_ejecucion.js`, clasificador y simulador. No faltaba un caso de escritura en el motor: faltaba ensayar su continuidad con el cliente actual. No se alteraron Flutter, reglas, exports, Finanzas, titularidad ni contratos de membresía.

El motor genera en servidor una **generación nueva de la pertenencia actual**, mediante `generarPertenenciaId()` existente (256 bits aleatorios). No deduce ni recupera un identificador histórico, ni utiliza uno escogido por el cliente. La fecha del comprobante es `serverTimestamp` de la migración, nunca una fecha de ingreso reconstruida.

Únicas escrituras del migrador: `usuarios_globales/{uid}.pertenenciaId` y comprobante privado `migraciones_pertenencia/{uid}` en la misma transacción; la herramienta existente añade sus checkpoints privados. Se comparan iglesia y `updateTime` exacto de la selección y se relee la administración. No se borran o reemplazan IDs previos, recibos ni comprobantes. El cierre voluntario posterior usa el motor de salida normal y su revocación existente; esa revocación no es efecto de la migración.

## Datos y clasificación

La evidencia mínima admitida por el contrato existente es: UID documental válido; perfil actual con **clave pertenenciaId ausente**; una sola `iglesiaId` canónica válida; rol reconocido; documento de esa iglesia existente con `adminUid` válido y coherente con el rol del perfil; versión exacta del perfil seleccionado; ausencia del comprobante de migración previo. No necesita nombre, correo, fechas históricas ni datos financieros.

| Caso | Tratamiento |
| --- | --- |
| Servidor o líder sin ID, iglesia verificable y no titular | Candidato automático; conservar todos los demás campos |
| Titular sin ID, rol admin e identidad coincidente con adminUid | Candidato automático; no transferir administración ni habilitar su salida |
| Encargado con perfil coherente sin ID | Igual que su rol de membresía; conservar íntegramente designación y habilitación financieras |
| ID ya existente y válido | Omitir, sin acreditar procedencia por su formato ni renovarlo |
| Perfil sin iglesia | Omitir; no inventar una pertenencia activa |
| ID presente nulo/vacío/inválido, iglesia inexistente/no verificable, rol desconocido o titularidad contradictoria | Revisión humana; ninguna reparación automática |
| Varios valores en iglesiaId, relaciones concurrentes contradictorias o evidencia externa de varias pertenencias activas | Revisión humana; no elegir una iglesia automáticamente |
| Iglesia/versión cambiada después de selección, comprobante previo inesperado o resultado incierto | Detener/conservar selección y evidencia; verificar antes de reanudar |

FeSync representa una pertenencia activa por perfil. Se ensayaron **varios usuarios e iglesias independientes**, salida y reingreso a otra iglesia; no se añadió una estructura de membresías simultáneas. La herramienta no busca toda posible relación histórica o campo auxiliar de otros sistemas: si un inventario autorizado identifica otra relación contradictoria, ese registro debe excluirse de la ejecución automática. No se presume que no existan esas anomalías en producción.

El informe de intervención debe conservarse en un lugar privado autorizado: UID/ruta, categoría/motivo, versión seleccionada, evidencia de iglesia/administración, comprobante encontrado y decisión humana. No publicar perfiles ni incluirlos en logs generales. La CLI demo emite métricas agregadas; `completa:true` significa cobertura, **no** ausencia de anomalías. Exigir también `requiereRevision:false` para el conjunto que se pretende liberar, o excluir y resolver cada excepción antes de habilitar su cliente nuevo. No refrescar versiones ni borrar comprobantes para forzar un resultado.

## Pruebas ejecutadas ahora

| Prueba | Resultado |
| --- | --- |
| Node: pertenencia, migración, membresía, recuperación y diagnóstico | **250 aprobadas**, cero fallos |
| Guardas de herramienta existente | **26 aprobadas** |
| Integración existente del coordinador/migrador | **21 aprobadas** |
| Simulación existente con Firestore | **3 aprobadas** |
| Motor existente con transacciones y reglas | **12 aprobadas** |
| Puente nuevo: migrador → callables normales | **6 aprobadas** |
| Reglas financieras, privacidad y pertenencia/legacy | **103 aprobadas** (46 + 13 + 33 + 11), cero fallos |
| Flutter: salida, pendientes, coordinador e ingreso | **179 aprobadas** |
| Flutter: roles, expulsión e ingreso pendiente | **54 aprobadas** |
| Chrome headless, Web previamente compilado y SDK Firebase real contra emuladores | Bloqueo legacy reproducido; migración; salida normal confirmada |

No se presentan los 1.788 Node ni los 459 Flutter del encargo anterior como reejecutados. No se recompiló Web ni se ejecutó Android: no hubo cambios de producto o dependencias. `flutter analyze` no se repitió porque no cambió ningún Dart.

El puente nuevo migra cuatro perfiles, omite el actual y compara campos/versiones de iglesias y acceso financiero antes/después. Comprueba repetición y repaso sin nueva asignación; recibo único y recuperación de salida; reingreso por `vincularUsuarioConCodigo`, nueva generación y rechazo de solicitud antigua; titular que no puede salir sin transferir; aislamiento; salida del encargado con revocación por el handler existente. Las suites anteriores cubren conflictos, toma de reserva, caída post-commit, campos auxiliares, líder y protección de comprobantes. Las 103 reglas rechazan edición/borrado/fabricación cliente de pertenencia y preservan privacidad financiera.

**Chrome:** se sirvió sin modificar `build/finanzas_web_demo_candidato`, compilado en el encargo previo, con perfil de navegador nuevo. Login demo → Dashboard → Perfil → Salir reprodujo el aviso de migración; no había solicitudes HTTP a `desvincularMiembroIglesia`. El migrador existente añadió generación y comprobante a los dos perfiles sintéticos nuevos. Sin cambiar código ni cerrar sesión, volver al Dashboard → Perfil → Salir llevó a «Ingresa a tu iglesia». Firestore local confirmó un único recibo y generación conservada. La traza de red contiene dos entradas HTTP al endpoint (incluye negociación CORS); no se confunden con dos commits.

[Resultado y recibo sintético](membresia_legacy_2026-10-28/browser/resultado.json), [antes](membresia_legacy_2026-10-28/browser/06-legacy-bloqueado.png), [después](membresia_legacy_2026-10-28/browser/08-salida-migrado.png), [migración/verificación](membresia_legacy_2026-10-28/browser/migracion.json), [puente](membresia_legacy_2026-10-28/puente.json). Logs en la misma carpeta.

Se conservaron los intentos iniciales del puente: una aserción equiparaba indebidamente precisión del timestamp transformado y del commit; otra fixture usaba código de acceso en minúsculas aunque el callable lo normaliza a mayúsculas. Se corrigieron **solo las pruebas** y la pasada final de seis terminó sin fallos. La igualdad del commit perfil/comprobante sigue comprobándose por `updateTime`.

## Procedimiento futuro, sujeto a autorización

1. Autorizar por separado inventario privado de perfiles/iglesias, respaldo con restauración comprobable y ejecución administrativa de la migración. Nada de ello se hizo sobre datos reales. Revisar procedencia de IDs preexistentes y relaciones contradictorias; formato no basta.
2. Mantener apagadas las habilitaciones financieras. Revalidar el plan selectivo del [candidato Web anterior](finanzas_web_candidato_2026-10-28.md): dos actualizaciones deliberadas y diez Functions nuevas, incluidas las de membresía; conservar las otras once. No desplegar de forma general ni eliminar Functions.
3. Coordinar una ventana de transición y actualización obligatoria: desplegar únicamente Functions/reglas aprobadas antes de asignar generaciones reales; evitar que clientes viejos sigan escribiendo pertenencias durante esa preparación. Tras recibir generación, los clientes antiguos que escriben salida/rol directamente quedan denegados y deben actualizarse. Mantener la protección de pertenencia y las denegaciones financieras; no restaurar reglas permisivas para resolver la transición.
4. Revisar y aprobar el ejecutor administrativo real que invoque **el mismo motor existente** con selección/versiones, transacciones, checkpoints y comprobantes. La CLI `migracion_demo` permanece **exclusivamente emulador**: no ejecutarla contra Firebase real ni habilitarla quitando guardas/cambiando el projectId. Este trabajo demuestra la solución y permite pedir autorización; no entrega una CLI de producción ni credenciales/IAM aprobados. Su ejecución real sigue siendo un requisito operativo previo.
5. Simulación completa, listado privado de excepciones y aprobación de candidatos; ensayo piloto autorizado, lote mínimo, relectura transaccional y verificación antes/después de que solo se añadieron ID y comprobante. En conflictos o incertidumbre, detener, conservar evidencia y verificar/reanudar la misma selección. No renovar un ID ni borrar recibos como compensación.
6. Completar y verificar los perfiles del alcance aprobado; resolver manualmente/excluir cada ambiguo. Publicar entonces el Web revisado, exigir recarga/actualización y verificar salida/gestión con cuentas de prueba autorizadas. La migración de pertenencia no activa Finanzas, no acredita historia financiera ni sustituye su preparación/activación privada.
7. Ante incidentes: detener lotes y publicación; conservar IDs/comprobantes y revisar el estado. El rollback de Hosting debe conservar un cliente compatible con generaciones; volver a un escritor antiguo de pertenencia no es reversión segura. No borrar pertenenciaId ni comprobantes para regresar a legacy. Activación financiera y cualquier modificación remota necesitan autorización independiente.

No es necesaria una transición que permita al cliente fabricar IDs. La vía mínima elegida es **migración previa coordinada y verificable**, con actualización de clientes protegidos. El reemplazo general de Hosting queda condicionado al inventario y a la migración autorizados; no se afirma que todas las cuentas reales sean migrables automáticamente.

## Cambios y conservación

Solo se añadieron `test/membresia_legacy/` (ensayo, adaptadores de ejecución local y control de Chrome), este informe y su carpeta de evidencia. Motor/migrador, reglas, Dart, configuración y candidato de publicación anteriores permanecen intactos. El launcher nuevo exige puertos libres y no reutiliza ni limpia sesiones ajenas. Los borrados de fixture se limitaron al demo local propio.

Respaldo inicial: **1.112 rutas**, HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live`. [Respaldo](membresia_legacy_2026-10-28/respaldo.json), [integridad final y archivos nuevos](membresia_legacy_2026-10-28/integridad.json). Se conserva el índice y todo archivo previo. `git diff --check` sigue señalando únicamente el espacio final preexistente de `functions/index.js:2047`.

Auth 9098, Firestore 8088/8098 y Functions 5018, siempre **demo-fesync**. Node usó barrera de sockets locales en el ensayo principal; Chrome tuvo proxy/DNS externo bloqueados e interceptación: solo servicios locales y GET de SDK/fuentes estáticos públicos de gstatic, sin servicios Firebase reales. Se cerraron Chrome y emuladores propios. Sin producción, despliegues, instalaciones, commits, cambios de rama ni activación real.
