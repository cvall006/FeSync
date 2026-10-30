# FIN-RELEASE-5 — preparación controlada de Finanzas V1

**Decisión: BLOQUEADO para publicación operativa real.** Se entrega un candidato
revisable y un procedimiento condicionado; no una autorización de despliegue ni
una habilitación. No se ejecutaron despliegues, consultas a Firebase real,
migraciones reales, cambios de reglas, commits o cambios de rama.

## A. Artefacto y alcance exacto

- [ZIP candidato Functions](fin_release_5_2026-10-26/functions-v1-candidato.zip),
  preparado offline por `prepareFunctionsUpload` del Firebase CLI instalado.
- [Directorio del paquete](fin_release_5_2026-10-26/paquete/firebase.json): fuente
  `functions`, sin reglas, hosting, storage, emuladores ni alias de proyecto.
- [Lista exacta de 30 archivos](fin_release_5_2026-10-26/archivos-paquete.txt):
  configuración más 29 archivos de Functions. El ZIP contiene los 29 de Functions;
  el CLI recibe la configuración desde fuera del ZIP.
- [Manifiesto de tamaños, SHA-256, imports y 23 exports](fin_release_5_2026-10-26/paquete-manifest.json).
- [Verificación de cada entrada ZIP](fin_release_5_2026-10-26/zip-integridad.json).

Digest del conjunto ordenado de fuentes:
`52a067d7f8a166f9ea26648bf6f2a7df820e063f3480594213c4d35b79d87521`.
SHA-256 del ZIP:
`4b01e63e50487237a038af303483e82923c0d25607b0f79857c6237adf8b3f98`.
Los bytes del runtime son los iniciales de esta intervención. No se modifican
`functions/index.js`, `finanzas_publicacion.js`, `finanzas_v1/`, `finanzas_core/`,
dependencias, Flutter de aplicación ni reglas.

El paquete conserva `index.js`, los módulos de membresía/roles y notificaciones
que requieren sus exports y todas las dependencias locales transitivas. Incluye
los siete archivos V1, también `mantenimiento.js`, aunque no sea callable.
Excluye pruebas, fixtures, herramientas demo, preparadores V2, inventarios,
credenciales y `node_modules`. El runtime de Adora y Work que ya está en el index
se conserva literalmente. No se genera ni modifica ninguna acreditación.

`test/finanzas_release5/paquete.cjs` construye el cierre de imports estáticos sin
ejecutar index ni SDKs, rechaza rutas fuera de Functions, dependencias de prueba,
imports dinámicos y dependencias locales del lock. Copia o verifica bytes iguales;
no sobreescribe un candidato diferente. La nueva prueba Node exige que estén todos
los archivos V1, exports conocidos y módulos centrales. `package-lock.json` queda
intacto: Node `24`, `firebase-admin` resuelto `13.10.0`, `firebase-functions`
`6.6.0`; `google-auth-library` continúa como dependencia de desarrollo existente.
La instalación de runtime correspondería a la infraestructura de build, usando
el lock y sus integridades; no se instaló nada durante esta preparación.

La configuración original `firebase.json` no excluye `functions/test` ni las
carpetas demo al empaquetar. El empaquetador local del CLI excluye por defecto
`node_modules` y `.git`, no todos esos archivos. **No usar todo el directorio
Functions del workspace como sustituto del paquete revisado.** El candidato
reduce la superficie por cierre de dependencias y conserva el contrato normal.

## B. Bloqueos por criticidad

| Prioridad | Hallazgo verificable | Condición para levantarlo |
| --- | --- | --- |
| P0 — privacidad | Las reglas actuales permiten a titular y encargado leer documentos completos de `finanzas_movimientos` y `finanzas_auditoria`. La lectura no exige `publicacion_v1`, pertenenciaId de generación ni las precondiciones del API. El emulador demuestra acceso al aportante privado y auditoría con el gate ausente. | Autorizar una política de acceso directo y, si corresponde, un cambio de reglas separado con pruebas de privacidad y revocación; no realizado aquí. |
| P0 — entorno | `finanzas_v1/entorno.js` y sus consumidores exigen demo-fesync, Auth 9098, Firestore 8088, Functions emulado y ausencia de credenciales reales. Un despliegue de estos bytes rechazaría todas las llamadas V1 reales. | Autorizar y probar una política de entorno publicable explícita que conserve el gate privado apagado; no quitar simplemente la barrera. |
| P1 — cliente | `FinanzasMvpService` llama `finanzasMvpConsultar/Ejecutar/Inicializar`; index solo exporta `finanzasV1Consultar/Ejecutar`. La inicialización pública demo no existe en la entrada normal. | Autorizar una selección explícita del transporte normal y la experiencia de iglesia aún no preparada. La adaptación HTTP usada en pruebas no modifica el cliente distribuible. |
| P1 — operación | No existe entrada normal de preparación, activación, conciliación o cambio de mes. El mantenimiento compartido y las CLI de prueba siguen limitados a emuladores. La creación ordinaria de una iglesia no prepara automáticamente el libro V1 completo. | Autorizar operador, herramienta y permisos de mantenimiento reales, plan de preparación/adopción y calendario mensual; mantener la habilitación apagada hasta verificar cada iglesia. |
| P1 — pendientes | La intención persistida conserva las versiones originales. Si cambia período o acceso antes del commit, el reintento puede quedar rechazado definitivamente. El cliente conserva el pendiente y bloquea otro envío; no hay cancelación/resolución terminal en el contrato actual. | Definir y autorizar una resolución segura de intenciones sin recibo y el procedimiento para usuarios afectados. No borrar pendientes ni crear nuevos IDs ante un resultado incierto. |
| P1 — destino y reglas reales | Solo se conocen archivos locales. No se conoce el estado desplegado, IAM, APIs, cuotas, soporte de runtime en el destino ni la revisión de reglas que existe allí. | Preflight posterior expresamente autorizado. No inferir que las reglas locales ya están publicadas ni que el alias local autoriza operar ese proyecto. |

El problema de privacidad es un desacuerdo entre garantías del callable y acceso
directo permitido, no un fallo del emulador: las 46 pruebas históricas de reglas
aprueban esa política vigente. Ninguna de esas reglas fue cambiada aquí.

## C. Despliegue, habilitación y reversión — SOLO DOCUMENTADO

**Este procedimiento no es ejecutable con el candidato actual en Firebase real.**
Los bloqueos anteriores deben resolverse y volver a sellarse el artefacto antes de
solicitar autorización. No se incluye un comando listo para desplegar el alias
productivo. La autorización futura debe identificar proyecto explícito, iglesia,
hashes, revisión de reglas, operador, ventana, observador y plan de incidencias.

### Preparación de la autorización

1. Revisar FIN-RELEASE-4, este informe, manifiesto y ZIP. Guardar las versiones
   anteriores del backend/cliente y evidencia de reglas que el operador autorizado
   obtenga después. Nunca tratar este árbol como admin-6.
2. Resolver P0 y P1 en un alcance autorizado. Repetir Node, reglas y Flutter y el
   ensayo local de activar/desactivar/recuperar/cambiar mes sobre el candidato
   resultante. Obtener un manifiesto nuevo; estos hashes dejarían de aplicarle.
3. Confirmar compatibilidad de nombres, región `southamerica-west1`, contratos,
   moneda CLP/escala 0/zona America/Santiago, recuperación y límites. Revisar el
   servicio de mantenimiento autorizado. No usar fixtures ni CLI demo con un
   proyecto real; no establecer variables de emulador para eludir la barrera.
4. Someter a autorización el despliegue de **solo**
   `functions:finanzasV1Consultar,functions:finanzasV1Ejecutar`, con `--project`
   explícito y `--config` del artefacto revisado. No usar `--only functions`
   indiscriminadamente, no cambiar codebase ni ejecutar un despliegue global.
   Los otros 21 exports se incluyen para integridad del index, no para autorizar
   su redespliegue. Las reglas requerirán su propia autorización; no van en el
   candidato ni se despliegan implícitamente con esta secuencia.
5. Desplegar únicamente tras esa autorización futura, manteniendo los gates de
   las iglesias ausentes o falsos y sin distribuir aún el cliente habilitado.
   Validar que lectura, escritura y replay deniegan acceso con gate ausente/falso.
   No basta con verificar que las funciones aparecen en una consola.

### Preparación por iglesia — sin migración de datos reales ahora

1. Mantener `finanzas_control/publicacion_v1` ausente/falso. Revisar titular actual,
   perfil, rol, pertenenciaId, acceso y encargado vigente. Perfiles de pertenencia
   no verificable se rechazan: no inventar IDs ni abrir migración de membresía.
2. Para iglesia nueva, verificar ausencia real de historia y preparar bajo la
   herramienta autorizada configuración contable, un período, protocolo/libro,
   catálogos y saldos/resumenes coherentes. No copiar saldos o aperturas de una
   fixture; las cuentas y aperturas requieren importes aprobados por la iglesia.
   Un libro vacío debe tener secuencia 0, sin movimientos ni recibos inventados.
3. Para iglesia existente, preservar libro/recibos/marcadores/auditoría y observar
   el conjunto completo, sin rellenar huecos ni certificar procedencia histórica.
   Si existe `generacion_v2`, está fuera de V1: detener; no convertirla.
4. Pausar protocolo con el gate cerrado y conciliar. Límites de mantenimiento:
   20.000 movimientos/reversiones, 24 resúmenes, 8 MiB de lectura contabilizada y
   50 cuentas/categorías. Fuera de límites, detener; no subirlos aquí. Exigir
   `SIN_DIFERENCIAS_OBSERVADAS`, aperturas y proyección coherentes; mantener
   `certificacionHistorica:false`. No es una acreditación de la historia.
5. Inicializar incremental solo si no existe, con protocolo bloqueado en época 1;
   la transacción crea estado sellado/verificación inicial, auditoría y cambia a
   época 2 operativa. No se permite reinicializar. Si ya existe, verificar y
   conciliar antes de reanudar; no reconstruir encima de la proyección existente.
6. Validar corte/secuencia, sello, saldos por cuenta, resumen del período,
   marcadores de aperturas/reversiones y permisos, conservando informe y versiones
   observadas. Detener ante cualquier divergencia. Este informe no acredita una
   iglesia real: se usaron exclusivamente fixtures sintéticas.

### Habilitación gradual y validación

1. Tras autorización individual, elegir una iglesia piloto y una ventana observada.
   Habilitar el módulo por el mecanismo existente y preparar titular/encargado.
   Esa acción sola no crea la habilitación privada.
2. El operador de servidor autorizado crearía/actualizaría exactamente
   `iglesias/{iglesiaId}/finanzas_control/publicacion_v1` con este esquema (ejemplo
   documental, no ejecutado):

   ```json
   {"versionEsquema":1,"iglesiaId":"<iglesia autorizada>","circuito":"v1_incremental","habilitado":true}
   ```

   No se aceptan campos adicionales, otro ID, circuito o versión. Registrar fuera
   del documento la autorización, operador y marcas de tiempo, para conservar el
   esquema exacto. No hay callable de activación y no se introduce aquí.
3. Validar titular y encargado, negar miembro/líder/iglesia ajena, apertura única,
   ingreso/gasto y permisos de ajuste/catálogo/reversión; validar DTO sin privados
   y las lecturas directas según la política de reglas finalmente aprobada.
   No producir asientos ficticios en un libro real: usar operaciones reales
   expresamente autorizadas, o limitar el smoke test a lectura y rechazos.
4. Verificar respuesta perdida y reintento del mismo ID, secuencia única y recibo
   original; validar cierre/reapertura con almacenamiento del cliente soportado.
   Reconciliar y observar errores, latencia, pendientes, privacidad y saldos.
   Conservar evidencia sin tokens, correos ni datos de aportantes.
5. Ampliar iglesia por iglesia solo tras ventana acordada sin divergencias ni
   pendientes no resueltos. No hay activación global implícita por desplegar.

### Incidencia y reversión

1. Detener la ampliación. El operador autorizado pondría el gate privado en falso
   y deshabilitaría `finanzas_config/acceso.moduloHabilitado` mediante el mecanismo
   existente. **Ambas medidas:** apagar solo el gate corta callables, pero las
   reglas locales actuales siguen permitiendo lectura directa si el módulo sigue
   activo. En una pérdida de permisos, revocar también al encargado afectado.
2. Verificar denegación de consulta, escritura, replay y rutas directas. Las
   transacciones V1 releen los controles, por lo que un cambio concurrente antes
   del commit obliga a revalidar. Un commit anterior al apagado permanece válido;
   no confundirlo con uno nuevo ni prometer cancelación retroactiva.
3. Preservar intentos, recibos, movimientos, auditoría y respaldo. No borrar
   pendientes del dispositivo, no reinstalar para limpiar, no repetir con otro
   ID, no reescribir saldos, ni restaurar una base antigua encima de commits.
4. Conciliar bajo pausa e identificar por UID/solicitudId/contexto si hubo commit.
   La recuperación de un recibo necesita autorización vigente y gate habilitado;
   durante la pausa puede quedar bloqueada. Un operador no debe reenviar en nombre
   de un usuario distinto ni trasladar pendientes a otra iglesia/pertenencia.
5. Si procede revertir código, usar una versión anterior previamente identificada
   y autorizada, mantener el gate/módulo apagados y verificar compatibilidad con
   recibos ya confirmados. No volver al escritor que reconstruye un libro limitado
   ni a época 1 sobre historia incremental. Corregir operaciones contables con la
   reversión autorizada normal, nunca borrándolas.
6. Reanudar solo con causa resuelta, conciliación aprobada, revisión de pendientes
   y autorización nueva. Si no existe una ruta segura de resolución, conservar
   pausada la iglesia y comunicar la incidencia.

## D. Continuidad mensual y recuperación

No hay cron ni avance por reloj. Al llegar noviembre, octubre permanece abierto
hasta una acción de mantenimiento; una fecha de noviembre se rechaza. La pantalla
propone la fecha del dispositivo: un cambio de calendario puede producir ese
rechazo. El mantenimiento permite cualquier período válido posterior sin resumen
destino existente, no exige el inmediatamente siguiente. El procedimiento debe
exigir el mes consecutivo y registrar la aprobación; el sistema no constituye
un cierre/aprobación contable formal ni un flujo V2.

Antes del avance: cerrar el gate, conciliar, resolver todos los pendientes y
comprobar recibos. `cambiarPeriodo` revalida titular/permiso/configuración de acceso,
protocolo y proyección; actualiza atómicamente período abierto, proyección sellada,
saldos iniciales de cuentas y resumen destino, y crea auditoría. Conserva secuencia,
acumulados, movimientos y resumen anterior. Las cuentas arrastran su saldo; los
totales del nuevo período comienzan de nuevo. La reversión de un movimiento del
mes anterior se registra en el nuevo, sin alterar el original ni su resumen.
No se ofrece reapertura del mes anterior con esta función.

El ensayo normal verifica octubre→noviembre, arrastre de 9.985, resumen anterior
intacto, replay de recibo de octubre y reversión en noviembre, con conciliación
independiente. También verifica el caso adverso: una intención de octubre sin
commit conserva su documento pero no puede ejecutarse tras avanzar a noviembre.
No se considera recuperación exitosa ni se borra. **No efectuar el cambio de mes
con pendientes sin resolver.** Incluso un intento rechazado después de capturar
intención conserva versiones: no puede reciclarse tras cambiar el período.

El servicio Flutter persiste antes de HTTP, reutiliza ID/cuerpo/contexto y escribe
recibo local antes de vaciar el pendiente. Excepciones/resultados inciertos lo
conservan, otra cuenta no lo recupera y el bloqueo por UID evita doble envío.
La prueba conectada descarta la respuesta de un commit real, recrea servicio y
almacén desde archivo con flush, obtiene `historica:true` y añade un solo
movimiento. Se prueba reinicio de instancias con persistencia en disco, no un
reinicio físico de Android/iOS ni el almacén seguro nativo de un dispositivo.
El transporte de prueba adapta explícitamente nombres demo→V1; no acredita la
conexión del cliente distribuible actual a esos nombres.

Recuperar siempre depende de Auth, titular, permiso, pertenencia y configuración
vigentes, además del gate/protocolo/proyecciones coherentes. Revocación, módulo
apagado, cambio de iglesia o pertenencia no se eluden por tener un recibo anterior.
Una precondición inmutable vencida sin recibo requiere el procedimiento aún
pendiente de autorización, no una nueva solicitud automática.

## Autorización, clientes antiguos y privacidad

En cada intento transaccional normal se obtiene UID de `request.auth`, perfil de
servidor, iglesia/adminUid y perfil del titular, pertenenciaId, acceso actual,
permiso específico y gate de esquema exacto. Titular tiene permisos contables;
encargado solo leer, ingresos/gastos, transferir y preparar cierre en la tabla de
permisos; esto no implementa un callable de cierre. Líder o servidor no designado
se rechazan. No se confía en roles/flags enviados por el cliente.

Captura/escritor usan versiones observadas e intenciones inmutables. El wrapper
normal valida también replay antes de devolver recibos. El cursor queda ligado
a UID, iglesia, pertenencia, corte y límite; los IDs y transacciones aíslan
iglesias. La auditoría y recibo se confirman atómicamente con el movimiento; la
reversión conserva el original y usa marcador único.

El DTO de consulta excluye privados, responsable/UID, huella, precondiciones y
solicitudId. El replay devuelve confirmación/ID/secuencia, no recibo íntegro. Las
rutas de control, intenciones y recibos no se abren al cliente. **Esta garantía
del DTO no corrige la lectura directa completa de movimientos/auditoría permitida
por las reglas.** El gate privado no debe presentarse como control de toda lectura.

Los callables administrativos antiguos de encargado/módulo, rol e ingreso se
mantienen y se ejercitan en el ensayo. Todos los exports preexistentes conservan
sus bytes y dependencias. No se demuestra aquí un recorrido de interfaz de cada
módulo ajeno. El V1 exige `historialPaginado:true`; un cliente antiguo que intente
consumir ese endpoint sin el contrato se rechaza de forma explícita, no recibe
un historial parcial. Los nombres demo no son alias desplegables de V1.

## Diferencias Firebase observadas solo en archivos locales

| Aspecto | Demo | Configuración publicable local |
| --- | --- | --- |
| Proyecto | `demo-fesync` fijo; fixtures sintéticas | `.firebaserc` y opciones cliente señalan `fesync-app-2026`; destino no consultado ni autorizado |
| Transporte | Auth 9098 / Firestore 8088; Functions demo 5008 y entrada normal de ensayo 5018 | Región `southamerica-west1`; sin selección de emuladores en release |
| Backend | Config de ensayo codebase `fesync-normal-release-local` | Candidato sin codebase alternativo; no copiar el codebase de ensayo al despliegue |
| Cliente | `FESYNC_FINANZAS_DEMO=true`, solo debug, host local permitido; FCM desactivado y Storage local sin servicio | Opciones Firebase ordinarias y FCM usuales; servicio financiero aún conserva nombres demo |
| Permiso de ejecución V1 | Barrera demo y gate por iglesia | Barrera real aún rechaza antes de Firestore incluso con gate true |
| Preparación | Admin SDK local y fixtures | Sin herramienta normal de bootstrap/mantenimiento/activación real autorizada |
| Reglas | Archivo local probado en 8098 y ensayo en 8088 | Estado remoto desconocido; candidato no contiene ni cambia reglas |

Los archivos debug de Android y FirebaseOptions demo no se incluyen en el paquete
Functions. No se usa `.firebaserc` para elegir un destino implícito. No se
consultaron credenciales, cuentas IAM ni consola real.

## E. Validación y preservación

| Validación final | Resultado |
| --- | --- |
| `npm.cmd test` | 1.779 aprobadas, cero fallos/omisiones |
| Entrada normal en demo-fesync | 25 aprobadas (24 escenarios y contenedor), cero fallos/omisiones |
| Reglas financieras aisladas | 46 aprobadas, cero fallos/omisiones |
| Flutter general | 447 aprobadas y dos omisiones intencionales de emuladores |
| Flutter conectado: recuperación desde disco | Una aprobada, saldo 10.198 → 10.187, un movimiento |
| Flutter analyze con prueba nueva | Cero incidencias |

[Resultados finales](fin_release_5_2026-10-26/validacion.json),
[Node](fin_release_5_2026-10-26/npm-test-final.log),
[reglas](fin_release_5_2026-10-26/reglas.log),
[Flutter general](fin_release_5_2026-10-26/flutter-test-final.log),
[análisis con prueba nueva](fin_release_5_2026-10-26/flutter-analyze-recovery.log),
[integración final](fin_release_5_2026-10-26/emulador-validacion-final.log),
[escenarios estructurados](fin_release_5_2026-10-26/emulador.json) y
[recuperación Flutter](fin_release_5_2026-10-26/flutter-recuperacion.json).

Se conservan logs de intentos anteriores: descubrimiento Functions agotó 10 s;
otro arranque Java no alcanzó 8088 en 60 s dentro del sandbox. El ensayo final
usa 60 s de descubrimiento y acceso local ampliado para las herramientas ya
instaladas. Flutter inicialmente no pudo escribir el lockfile del SDK fuera del
workspace; las ejecuciones finales tuvieron ese acceso. No se cambió runtime
para acomodar pruebas. Un intento mensual del test reutilizaba una intención
con precondiciones anteriores; se corrigió la expectativa del test y se añadió
la evidencia negativa explícita, sin regenerar precondiciones en el backend.

[Respaldo SHA-256 verificado](fin_release_5_2026-10-26/respaldo.json) de 624 rutas
iniciales (623 archivos y una eliminación), incluidos untracked e informes anteriores, más diff/índice/HEAD/rama
en el directorio temporal indicado. Conserva la eliminación Kotlin inicial.
[Integridad final](fin_release_5_2026-10-26/integridad.json) compara todos los bytes
iniciales, archivos faltantes y HEAD/rama/índice;
[estado Git](fin_release_5_2026-10-26/git-status.txt).
`git diff --check` sigue señalando únicamente el espacio preexistente de
`functions/index.js:2037`, que no se tocó.
De los archivos iniciales, 622 conservan sus bytes y solo cambia el harness
`test/finanzas_release3/integracion.cjs`; no falta ningún archivo inicial.

Cambios de esta intervención: documentación/artefacto, harness de ensayo local,
extensión optativa de escenarios FIN-RELEASE-5 en el test normal compartido,
prueba del paquete y prueba Flutter de recuperación. No hay corrección del
backend ni rediseño: los bloqueos requieren decisiones/autorizaciones explícitas
fuera del alcance de una corrección pequeña. V2, admin-6, Work, inventarios y
migración de membresía permanecen intactos.

Para repetir solo localmente, con herramientas ya instaladas:

```powershell
node test/finanzas_release5/paquete.cjs
npm.cmd --prefix functions test
node test/finanzas_release5/iniciar.cjs
node test/finanzas_release5/reglas.cjs
```

Los ejecutores rechazan proyectos/credenciales alternativos y puertos ocupados;
no vacían Firestore 8088 ni reinician infraestructura ajena. Un locator local
obsoleto con conexión rechazada no se trata como emulador vivo. Las reglas usan
8098 aislado. Estos comandos no publican ni habilitan usuarios reales.

## F. Decisión técnica

**BLOQUEADO**, por privacidad de lecturas directas, barrera exclusiva de emulador,
cliente con endpoints demo y operación real de preparación/cambio mensual y
resolución de pendientes aún no autorizada. El paquete permite revisar archivos,
contratos y procedimiento; no permite afirmar que Finanzas V1 esté publicable
para uso real. No se solicita autorización de despliegue mientras subsistan esos
bloqueos.
