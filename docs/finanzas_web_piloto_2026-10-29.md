# Finanzas Web: continuación mínima del piloto

**BLOQUEADO para usar Finanzas real hoy. No hace falta una migración masiva ni otro backend; falta preparar de forma autorizada al operador financiero y publicar el candidato existente.** La alternativa mínima propuesta conserva el Hosting habitual y ofrece el Web actual en una URL piloto separada. No se ha creado esa URL ni comprobado su login real.

Se revisaron el candidato Web, el preflight Firebase y los informes de membresía legacy, inventario y piloto del 28/10. Se continuó desde sus artefactos, sin reconstruir fases anteriores ni consultar Firebase real. El inventario remoto es una fotografía anterior, no una comprobación de estado actual.

## Qué se puede reutilizar

- Backend V1 y pantallas Flutter actuales, incluida configuración, pendientes y mantenimiento. No hace falta crear endpoints ni pantallas.
- [Paquete candidato](finanzas_web_candidato_2026-10-28/paquete/firebase.json): 78 archivos íntegros; las 34 fuentes de Functions/reglas empaquetadas coinciden con las locales. Digest `6c67b428b54354a46da364172f47030274d28125be4b8bbde488a89bb0748b6f`.
- [Plan selectivo existente](finanzas_web_candidato_2026-10-28/plan-despliegue.json), validado offline sin regenerarlo ni ejecutar CLI.

El cliente empaquetado tiene `FESYNC_FINANZAS_CLIENTE_HABILITADO=false`. Es revisable y publicable apagado, **no un cliente financiero operativo**. Tras autorización de activación habrá que compilar una variante release con ese flag verdadero y volver a ensamblar/verificar Hosting, excluyendo `finanzas_demo.html`. No publicar directamente el build intermedio ni cambiar silenciosamente el paquete/hash anterior.

## Despliegue mínimo

Proyecto `fesync-app-2026`, región `southamerica-west1`. Cantidades según el inventario anterior; revalidarlas antes de autorizar ejecución.

| Alcance | Revisión necesaria |
| --- | --- |
| Finanzas exclusivamente | Crear `finanzasV1Consultar`, `finanzasV1Ejecutar`, `actualizarEncargadoFinanciero`, `actualizarEstadoModuloFinanzas` |
| Dependencias del Web existente | Crear además `consultarEstadoSolicitudIngreso`, `desvincularMiembroIglesia`, `consultarEstadoSolicitudDesvinculacion`, `recuperarContextoSolicitudDesvinculacion`, `obtenerContextoCambioRolMiembro`, `actualizarRolMiembro` |
| Ingreso compatible y generación servidor | Actualizar expresamente `registrarNuevaIglesiaSegura`, `vincularUsuarioConCodigo` |
| Firestore | Publicar la revisión del candidato: protección de pertenencia con excepción legacy acotada, lecturas financieras restringidas y denegación de acceso directo al libro/recibos/auditoría |
| Cliente | Publicar variante de `lib/main.dart` en URL piloto, conservando Hosting live; verificar acceso Auth de esa URL antes de preparar usuarios |

**Plan mínimo ya validado para el Web completo: diez creaciones y dos actualizaciones, conservando las otras once Functions remotas.** Cuatro Functions son el mínimo financiero, no una publicación completa del cliente actual. Reducir el plan a cuatro requeriría recortar o aceptar acciones del Web sin servicio; no se propone ese cambio.

`finanzasV1Ejecutar` transporta también resolución de pendientes y mantenimiento y delega en V1. No seleccionar los alias `finanzasV1ResolverSolicitud`/`finanzasV1Mantener`. No desplegar Storage, Functions generales, V2 ni módulos adicionales. El parche del piloto de membresía, por sí solo, no incorpora las lecturas financieras del candidato y no sustituye estas reglas.

## Legacy sin migración masiva

**Sí, como coexistencia de clientes.** Los perfiles sin la clave `pertenenciaId` pueden seguir usando los flujos antiguos de salida/roles/expulsión permitidos por las reglas del candidato en el Web habitual. El cliente nuevo sigue exigiendo generación; una URL separada evita imponerlo a todos. No se afirma compatibilidad de consumidores ajenos al repositorio.

Las reglas y el backend son compartidos: una URL piloto no aísla datos. Si se asigna generación, o se crea/revincula un perfil con los handlers nuevos, ese perfil pasa a necesitar el cliente compatible para las acciones protegidas. También quien administre esos perfiles debe usar el cliente compatible. Una pestaña vieja no se actualiza por publicar otro Web.

**No se puede usar Finanzas sin una generación válida del actor.** La autorización del servidor rechaza `PERTENENCIA_NO_VERIFICABLE`; no corresponde quitar esa condición ni permitir al cliente inventar IDs. El inventario previo de 35 perfiles encontró cero con ID válido en formato; no acredita el estado actual ni habilita ninguno.

Para reducir trabajo, comenzar con **el titular de una sola iglesia, sin designar encargado**, siempre tras verificar identidad/rol/iglesia. Preparar únicamente su pertenencia actual, si sigue ausente, con el motor servidor existente, selección y versión exactas, respaldo y comprobante transaccional. No modificar iglesia, rol, titularidad ni IDs previos. El titular puede operar sin encargado y es necesario para mantenimiento.

El [ejecutor piloto de membresía](membresia_piloto_2026-10-28.md) **excluye titulares y encargados**: el manifiesto anterior de un miembro común no habilita a un operador financiero. No reutilizarlo ni quitarle sus exclusiones. Falta concretar/revisar la ejecución administrativa autorizada para ese titular con el mismo motor; aquí no se implementó, no se obtuvo identidad y no se continuó ADC. Si no se autoriza una preparación puntual y no existe ya una pertenencia acreditada, el piloto permanece bloqueado.

## Privacidad, preparación y activación

Conservar autorización transaccional del actor/titular/encargo vigente, contexto de pertenencia, recibos originales y revocación. El flag cliente no concede permisos. El entorno global del servidor, el gate privado por iglesia y el acceso del módulo son barreras distintas; ninguna debe habilitar otras iglesias por arrastre. Las reglas deniegan lecturas/escrituras directas de movimientos, cierres, auditoría, recibos e intenciones; algunas lecturas de configuración/catálogos son permitidas por su política y no dependen del gate privado.

El estado real del libro piloto no se conoce. Autorizar primero una revisión privada acotada y respaldo. Un libro existente requiere pausa autorizada antes de abrir el circuito y verificación V1; uno vacío necesita preparación/inicialización verificable. No reemplazar saldos ni acreditar historia por suposición. El mantenimiento también necesita entorno/gate habilitados: no proponer pausar por callable con ambos apagados. Su apertura debe coordinarse con el protocolo bloqueado y el titular preparado.

Riesgos pendientes: transición de clientes protegidos; inventario/reglas remotos desactualizados; login en URL piloto sin comprobar; identidad operadora no resuelta; estado y límites del libro desconocidos. Ante incidentes, detener ampliación y pausar/apagar bajo autorización; conservar commits, recibos y pendientes. No borrar generaciones ni restaurar reglas que permitan fabricarlas. Apagar global/gate también bloquea recuperación.

## Pruebas de esta continuación

- Integridad SHA-256 del paquete y fuentes y validación selectiva offline: aprobadas. [Resultado](finanzas_web_piloto_2026-10-29/revision-offline.json).
- `node --test functions/test/finanzas_autorizacion.test.js functions/test/finanzas_web_contrato.test.js`: **57 aprobadas**, cero fallos. [Log](finanzas_web_piloto_2026-10-29/node.log).
- Flutter acotado (`finanzas_web_contrato_test.dart`, `salida_voluntaria_test.dart`): **no ejecutado con éxito**. El wrapper quedó sin iniciar pruebas y se detuvo únicamente su proceso propio. La invocación directa del SDK instalado terminó con salida 1 por falta de permisos de escritura del SDK fuera del workspace; [diagnóstico](finanzas_web_piloto_2026-10-29/flutter-directo.log). No se instalaron dependencias ni se cambiaron permisos. Las pruebas Flutter del candidato anterior son antecedente, no una aprobación nueva.

Las 103 pruebas de reglas y el recorrido Chrome del candidato son evidencia anterior revisada, no pruebas reejecutadas hoy. No se repitieron suites completas, build Web, Android ni emuladores, porque no cambió producto.

## Autorizaciones necesarias, en orden

1. Identificar iglesia/titular piloto y autorizar revalidación remota mínima de inventario, reglas, identidad/pertenencia/acceso y estado financiero necesario, con respaldo privado. No leer datos de otras iglesias por comodidad.
2. Aprobar las diez creaciones, dos actualizaciones, revisión exacta de Firestore y publicación en URL piloto; conservar live y comprobar login. Primero desplegar apagado. Sin despliegue general ni Storage.
3. Si falta generación, aprobar preparación **únicamente del titular seleccionado** y el mecanismo administrativo revisado para ejecutarla, con permisos mínimos e identidad autorizada. No obliga a migrar al resto; no requiere instalar gcloud. La identidad para ejecutar sigue pendiente y no se presupone ADC disponible.
4. Aprobar preparación/verificación del libro y, por separado, activación de esa sola iglesia: nuevo artefacto Web con flag cliente, entorno servidor y gate privado/acceso coordinados. Verificar lectura/rechazos sin asientos ficticios. Movimientos reales requieren el alcance autorizado correspondiente.

## Cambios locales y Git

Solo se añaden este informe y su evidencia. No se modificaron fuentes de producto, reglas, configs, paquetes anteriores, migradores ni dependencias. Rama `integration/adora-live`, HEAD `01223cd990312677ebbef2892ae7e99b1109e272`; índice inicialmente sin cambios. El árbol ya contenía 23 rutas versionadas modificadas/eliminadas y numerosos archivos sin seguimiento: se preservan, sin reset, checkout, limpieza ni commit. El archivo Adora abierto no se tocó.

Sin despliegues, migraciones reales, habilitación financiera, instalaciones, gcloud ni continuación de ADC. V2, inventarios, Work y módulos ajenos intactos.
