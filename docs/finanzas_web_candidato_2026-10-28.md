# Finanzas Web — cierre local del preflight

**Resultado: BLOQUEADO para reemplazar el Web habitual sin interrumpir todos los perfiles legados.** El contrato financiero y las dependencias del despliegue quedaron resueltos; hay un candidato release compilado y probado. Persiste una incompatibilidad concreta del cliente actual con perfiles sin `pertenenciaId`, descrita abajo. No es un bloqueo de firma Android ni requiere otro motor financiero.

## Estado de los tres bloqueos

| Bloqueo | Resultado |
| --- | --- |
| Consulta, ejecución, pendientes y mantenimiento | **Resuelto sobre dos endpoints.** `finanzasV1Consultar` conserva la consulta/historial; `finanzasV1Ejecutar` conserva contabilización y admite el sobre estricto `{tipo, datos}` para `resolverSolicitud` y `mantenimiento`. Delega en los módulos V1 existentes, con el mismo ID/cuerpo, autorizaciones, habilitación privada y transacciones. No se añadieron exports, motores ni acreditaciones. |
| Dependencias del Web y despliegue selectivo | **Resuelto localmente.** Plan de 10 creaciones y dos actualizaciones deliberadas; las otras 11 Functions del inventario remoto quedan fuera de los selectores. Las 15 dependencias efectivas del cliente estarán presentes con ese plan. |
| Reglas y compatibilidad anterior | **Reglas corregidas y probadas; transición del cliente incompleta.** Los perfiles sin generación conservan salida/roles/expulsión de clientes antiguos, sin poder añadirla. Los perfiles que ya tienen `pertenenciaId` nunca pueden borrarlo ni degradarse a legados. Sin embargo, el cliente actual exige pertenencia verificable para salida y otras acciones de membresía; actualizar un cliente sobre un perfil sin generación no lo resuelve. |

### Límite que mantiene el bloqueo

`lib/main.dart`, en `_salirCongregacion`, muestra **«La cuenta requiere migración de pertenencia antes de salir»** cuando falta `pertenenciaId`. La prueba existente **«Sin pertenenciaId muestra migración requerida y no llama callable»**, en `test/salida_voluntaria_test.dart`, se ejecutó y pasó dentro de la suite completa. Gestión de miembros también requiere pertenencia verificable para expulsión/roles.

Por tanto, **las reglas permiten conservar el cliente antiguo para perfiles legados, pero el Web nuevo aún no sustituye todos sus flujos**. Para perfiles protegidos, la actualización del cliente es obligatoria; para perfiles sin generación, esa actualización por sí sola es insuficiente. Antes de reemplazar Hosting se necesita cerrar la compatibilidad del cliente con esos legados o disponer de una preparación de pertenencia autorizada y verificable. No se inicializaron ni migraron perfiles; las migraciones quedaron fuera del alcance solicitado. No se afirma qué perfiles reales están en cada estado: no se consultaron datos reales.

## Functions exactas y política selectiva

Todas en **`southamerica-west1`**, proyecto **`fesync-app-2026`**. Se usa exclusivamente el inventario local del preflight del 28/10; no se volvió a consultar Firebase real.

**Crear estas 10:**

```text
finanzasV1Consultar
finanzasV1Ejecutar
actualizarEncargadoFinanciero
actualizarEstadoModuloFinanzas
consultarEstadoSolicitudIngreso
desvincularMiembroIglesia
consultarEstadoSolicitudDesvinculacion
recuperarContextoSolicitudDesvinculacion
obtenerContextoCambioRolMiembro
actualizarRolMiembro
```

**Actualizar deliberadamente estas dos existentes:** `registrarNuevaIglesiaSegura`, `vincularUsuarioConCodigo`. Sus implementaciones locales existentes proporcionan generación servidor y recibos con `solicitudId`; siguen aceptando clientes anteriores sin ese campo. Ambos contratos se probaron por la entrada normal en emuladores. No se modificó su lógica en esta intervención.

**Usar y conservar sin redesplegar:** `transferirAdministracionIglesia`, `actualizarEstadoTurnoSeguro`, `actualizarAsistenciaAdoraSegura`. Con las diez nuevas y las dos anteriores suman las **15 dependencias del cliente**. También se conservan las ocho Functions de notificaciones, completando las otras once existentes.

`finanzasV1ResolverSolicitud` y `finanzasV1Mantener` permanecen como exports locales de compatibilidad, pero **no forman parte de los selectores ni de las invocaciones SDK del candidato**. Su lógica se reutiliza internamente. La integración Flutter y Chrome registraron exclusivamente los dos endpoints normales.

[Plan exacto](finanzas_web_candidato_2026-10-28/plan-despliegue.json), [selectores solo documentados](finanzas_web_candidato_2026-10-28/selectores-solo-documentados.txt). `herramientas/finanzas_web_plan.cjs` solo genera/valida archivos offline; rechaza selectores generales, comodines, eliminaciones, actualización de Functions conservadas y proyecto distinto. **No ejecuta Firebase CLI.** Antes de un despliegue futuro autorizado habrá que revalidar el inventario real: este plan no debe aplicarse contra un estado remoto distinto por suposición.

## Reglas y privacidad

La intervención añade una excepción acotada a `usuarios_globales/{uid}`: ausencia de `pertenenciaId` tanto antes como después; salida propia solo para servidor/líder; administración antigua limitada a roles servidor/líder o expulsión dentro de la misma iglesia, sin modificar al titular ni otros campos. Si el servidor incorpora generación antes de la escritura antigua, la escritura queda denegada. Un valor existente nulo tampoco se considera ausencia y no permite degradación.

Los clientes continúan sin poder fabricar, cambiar o quitar `pertenenciaId`. Movimientos, cierres, auditoría, recibos y escrituras financieras directas siguen denegados. Titular/encargado vigente se verifican en servidor para operaciones, recuperación y mantenimiento; el mantenimiento sigue reservado al titular. No se cambiaron Storage ni los permisos de otros módulos.

[Diff mínimo de esta intervención](finanzas_web_candidato_2026-10-28/reglas-intervencion.patch); [diff completo frente al snapshot remoto](finanzas_web_candidato_2026-10-28/reglas-remoto-candidato.patch). Se conservaron los finales CRLF de las reglas.

## Pruebas efectivamente ejecutadas

| Validación | Resultado |
| --- | --- |
| `npm.cmd test`, con guardia TCP local | **1.788 aprobadas**, cero fallos |
| Política selectiva, incluyendo rechazos | **1 aprobada** |
| Entrada normal y contrato financiero sobre dos endpoints | **34 aprobadas**, cero fallos |
| Crear/vincular, cliente anterior sin ID y actual con ID/replay | **2 aprobadas**, cero fallos |
| Reglas: finanzas, privacidad, pertenencia y compatibilidad | **103 aprobadas**: 46 + 13 + 33 + 11 |
| `flutter test --no-pub` | **459 aprobadas**, cero fallos; **8 integraciones condicionadas omitidas** en esta pasada genérica |
| Integración Flutter desde `lib/main.dart` con HTTP real local | **1 aprobada**, ejecutada aparte; SDK de plataforma adaptado a emuladores |
| `flutter analyze --no-pub` del circuito/pruebas pertinentes | **Sin incidencias**, salida 0 |
| Web release publicable apagado y Web debug demo separados | **Ambos compilados**, salida 0; sin instalar dependencias NPM/Pub nuevas |
| Chrome headless, JavaScript compilado y SDK Web real | Login, Dashboard, ingreso/gasto, historial, recarga, pendiente, mantenimiento y cambio mensual comprobados |

La integración Flutter completa recorrió cuenta, apertura, categoría/diezmo, gasto, transferencia, reversión e historial paginado; perdió respuestas después del commit y recuperó el mismo recibo sin duplicar, también en mantenimiento. Comprobó vencimiento, descarte y solicitud nueva. La suite de servidor ejercitó autorización, revocación, aislamiento, gates apagados e inconsistencias sobre el transporte nuevo. [Evidencia del recorrido](finanzas_web_candidato_2026-10-28/flutter-navegacion.json).

**Chrome real, sin adaptadores FlutterFire:** ingreso 250 y gasto 40 dejaron **10210**; una solicitud sin commit por saldo insuficiente conservó ID tras recargar. Desde Dashboard se pausó, verificó, cambió octubre → noviembre, verificó y reanudó. La intención vencida no agregó movimiento; tras confirmar su descarte, un gasto explícito de 7 usó **otro ID** y fecha **2026-11-01**, dejando **10203**, corte **4**. El ID viejo tiene resolución terminal y no recibo. [Resultado verificable, IDs y límites de red](finanzas_web_candidato_2026-10-28/browser/resultado.json), [captura final](finanzas_web_candidato_2026-10-28/browser/34-noviembre-confirmado.png). La pérdida deliberada de respuesta se ensayó en la integración Flutter; no se presenta como una pérdida provocada en Chrome.

Todo servicio Firebase usado fue **demo-fesync**, Auth 9098, Firestore 8088/8098 y Functions 5018. Chrome tuvo proxy externo bloqueado e interceptación de red; solo los servicios locales pudieron operar. Se obtuvieron por GET bibliotecas SDK y una fuente públicas de gstatic, no datos/configuración de Firebase real; sus URLs constan en la evidencia. No hubo instalaciones adicionales. Los procesos Node de emuladores bloquearon sockets externos. Se cerraron exclusivamente Chrome y emuladores propios.

El primer intento de ampliar reglas a materiales de capacitaciones falló por infraestructura: esa suite exigía también Storage y otro puerto, ausentes del ejecutor Firestore aislado. Se conserva `reglas-infra-inicial.log`; la pasada final pertinente de **103** terminó con salida 0. Storage no cambió y no se declara esa suite adicional como aprobada.

## Candidato revisable

Único artefacto para revisión: [paquete/firebase.json](finanzas_web_candidato_2026-10-28/paquete/firebase.json), con **32 archivos de runtime**, reglas y Hosting compilado: **78 archivos** verificados por SHA-256. [Manifest exacto](finanzas_web_candidato_2026-10-28/paquete-manifest.json), digest `6c67b428b54354a46da364172f47030274d28125be4b8bbde488a89bb0748b6f`.

Flutter copia `web/finanzas_demo.html` al build intermedio. El ensamblador **lo excluye** del Hosting final y rechaza marcadores demo en todos los archivos de texto copiados. No debe publicarse el build intermedio directamente. El paquete apunta a su carpeta `hosting`, conserva el rewrite SPA y añade `no-cache` a index/bootstrap; no se modificó el Hosting remoto.

El JavaScript release tiene **3881896 bytes**, SHA-256 `2eecbf5383857d1a1c00cadda600670e150d38a0bbf8b25474e542bad76478b9`. No contiene los marcadores de emulador comprobados. Cliente `FESYNC_FINANZAS_CLIENTE_HABILITADO=false`; configuración servidor de ejemplo apagada; sin `.env`, fixtures o credenciales en el runtime ensamblado. La barrera global sigue rechazando antes de DB si no se habilita expresamente. La compilación demo usada por Chrome está separada y no se incluye en Hosting.

## Secuencia futura y reversión — solo documentadas

1. Cerrar el límite de perfiles legados del cliente o acotar expresamente una prueba que no reemplace el Web habitual. Acordar actualización obligatoria para perfiles protegidos y preparar la compatibilidad necesaria, sin asignar pertenencias por suposición.
2. Obtener autorización de los hashes, de las diez creaciones, de las dos actualizaciones existentes y de las reglas concretas. Revalidar el inventario remoto bajo autorización; detener si cambió. Conservar el Hosting anterior `504bdb13ab09a0ac` y los rulesets del preflight.
3. Desde el paquete aprobado, usar únicamente los doce selectores documentados, `--project fesync-app-2026` y su configuración. Mantener servidor y gates apagados. No usar despliegue general ni `--force`; no seleccionar las otras once Functions ni los alias de compatibilidad.
4. Publicar por separado la revisión Firestore aprobada y luego el Hosting compatible; Storage no necesita despliegue. Verificar el artefacto/hash y las versiones de clientes retenidas antes de sustituir el Web habitual.
5. Preparación/verificación de datos y activación de una iglesia piloto requieren autorización independiente. Para libros existentes, resolver el procedimiento de pausa antes de habilitar operaciones; mantenimiento y recuperación también requieren gate/global. Nada de ello se hizo aquí.

**Reversión:** detener ampliación, pausar/apagar gate/global mediante intervención autorizada; el apagado también bloquea recuperación. Restaurar una versión Hosting compatible considerando pestañas/cachés; conservar recibos, resoluciones y Functions compatibles con solicitudes emitidas. No borrar datos ni volver a escritores anteriores. No restaurar ciegamente las reglas previas a protección de pertenencia mientras V1 pueda operar.

## Archivos y Git

Respaldo verificado de **918 rutas previas**, con sus diffs e índice. **Siete archivos previos modificados:** `functions/finanzas_publicacion.js`, los dos archivos de transporte/servicio Flutter financiero, `firestore.rules`, y pruebas/soporte en `test/finanzas_release3/integracion.cjs`, `test/finanzas_release8/plataformas_locales.dart`, `test/finanzas_rules/pertenencia.test.js`. Nuevos: pruebas de contrato y carpeta `test/finanzas_web_candidato`, planificador offline, este informe y evidencia/paquete. [Diff de intervención](finanzas_web_candidato_2026-10-28/intervencion.patch), [integridad](finanzas_web_candidato_2026-10-28/integridad.json), [respaldo](finanzas_web_candidato_2026-10-28/respaldo.json).

HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live` e índice preservados; ningún archivo previo perdido. Motor contable, V2, inventarios, Work, migraciones e informes/respaldos anteriores intactos. No se desplegó, publicó Hosting, consultó Firebase real, habilitó una iglesia real, generó credenciales, creó commits ni cambió de rama.
