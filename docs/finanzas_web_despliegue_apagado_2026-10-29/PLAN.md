# Ejecución apagada preparada; pendiente de autorización

Proyecto `fesync-app-2026`; iglesia `8IYVbD8z9U3noEYzkpUZ`; región `southamerica-west1`. No se ejecutó ningún despliegue ni consulta remota en esta preparación. No se repitieron pruebas aprobadas.

## Decisión e impacto real

Se puede autorizar la publicación apagada por etapas. **No puede garantizarse continuidad completa de clientes antiguos si se actualizan las dos Functions de ingreso.** El Web live queda intacto, pero Functions y reglas son compartidos por todos los clientes/iglesias. Antes de la etapa 4 hace falta aceptar expresamente esta transición y asegurar distribución del cliente compatible para los perfiles que reciban generación. Sin esa aceptación, detener tras el canal piloto: quedará disponible el cliente apagado, pero no se declarará completa la publicación de sus contratos de ingreso.

| Actualización | Compatibilidad y efecto |
| --- | --- |
| `registrarNuevaIglesiaSegura` | Conserva campos y resultado `ok/iglesiaId`; acepta ausencia de `solicitudId`. Usa transacción, genera `pertenenciaId` servidor y, con ID de solicitud, comprobante idempotente. La validación de perfil/código ahora ocurre dentro de la transacción; puede terminar por conflicto. No migra titulares existentes. |
| `vincularUsuarioConCodigo` | Conserva ingreso por código y resultado, acepta ausencia de `solicitudId`, genera nueva pertenencia servidor al vincular. No vuelve a vincular un perfil ya congregado. Conserva aviso posterior al commit; una falla push no revierte el ingreso. No migra miembros ya vinculados. |

En ambas: enviar `pertenenciaId` desde cliente se rechaza; `solicitudId` presente debe cumplir el contrato. Un cliente sin ese ID no obtiene recuperación idempotente por recibo: tras respuesta perdida puede encontrar que ya pertenece. Tras alta/revinculación, salida, expulsión y cambio de rol del perfil protegido requieren callables y cliente compatible; los escritores directos antiguos son denegados. Quien administre esos perfiles también debe usar cliente compatible. Los perfiles que siguen sin la clave conservan únicamente las operaciones legacy acotadas de las reglas. Esto no prueba compatibilidad de clientes externos ni permite quitar una generación para volver al flujo antiguo.

No se limita la generación a la iglesia piloto, ni se alteran handlers para lograrlo. Si la condición es cero restricciones nuevas para todos los clientes viejos, **la etapa 4 queda bloqueada**; una aceptación de riesgo no equivale a demostrar compatibilidad total.

## Componentes y revisiones exactas

El [manifiesto](manifest.json) enumera los 79 archivos y cada SHA-256. Digest de esta preparación: `e0adf6f2836dcf3f06200c15dadf39ef321d57ebd332ea90aed06ba8b1aa8525`. Base validada: `6c67b428b54354a46da364172f47030274d28125be4b8bbde488a89bb0748b6f`.

Se reutilizan sus fuentes y Web compilado **sin cambios**. Solo se añade `.env.fesync-app-2026` con entorno publicable, proyecto fijo y `FINANZAS_V1_SERVIDOR_HABILITADO=false`; `firebase.json` añade `.env*` a exclusiones de carga. El CLI consume ese archivo para configuración, sin incluirlo en el código subido. No contiene secretos. Una junction local reutiliza `functions/node_modules` ya instalado; queda excluida de la carga. No se instaló ni actualizó ninguna dependencia. El ensamblado anterior se conserva íntegro.

| Revisión | SHA-256 |
| --- | --- |
| `functions/index.js` | `832499f7633c7064b7a970cd5939dea48ce4da93d3420f2ad588f7ad0186e58a` |
| `firestore.rules` | `16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a` |
| `reglas-exactas.patch` | `0f4e704ad6d58f8c88a29e89705d433dd65d4aa9477bcadc5f98f7fa5872c6ec` |
| `firebase.json` | `6bf4def2b401df5ec8185613ada6269862f7ae22e49c5d0f35d21b47ae1e0d98` |
| Entorno servidor apagado | `8d89d00624a67979c39b034798b17a6fa993a95318b7842d58ae10a9c9e57bde` |

**Diez creaciones exactas:** `consultarEstadoSolicitudIngreso`, `desvincularMiembroIglesia`, `consultarEstadoSolicitudDesvinculacion`, `recuperarContextoSolicitudDesvinculacion`, `obtenerContextoCambioRolMiembro`, `actualizarRolMiembro`, `actualizarEncargadoFinanciero`, `actualizarEstadoModuloFinanzas`, `finanzasV1Consultar`, `finanzasV1Ejecutar`.

**Dos actualizaciones exactas:** las de ingreso de la tabla anterior. Se conservan las otras once Functions; no se seleccionan alias `finanzasV1ResolverSolicitud`/`finanzasV1Mantener`. Su lógica se transporta por `finanzasV1Ejecutar`. Tener 25 exports dentro del index no autoriza desplegarlos todos.

**Reglas:** el [parche exacto](reglas-exactas.patch) compara con snapshot remoto SHA-256 `8398b1200abe8f2b5c1f879bcf866566b7f1d0c68e55c6b37893117ae6d324f0`, confirmado en la última lectura autorizada; ruleset `26a2c1e2-5ea0-4d03-bf30-b19ac39873af`. Protege iglesia/rol/pertenencia frente al cliente y conserva excepción solo cuando la clave pertenencia está ausente antes y después. Rechaza fabricar, borrar o degradar generaciones; salida legacy solo servidor/líder y administración legacy limitada a la misma iglesia, sin titular ni otros campos.

Movimientos, cierres, auditoría, controles, saldos y recibos siguen sin lectura/escritura directa cliente; no hay reglas Storage nuevas. Se permiten las lecturas de acceso/catálogos previstas para titular/encargado y descubrimiento individual de elegibilidad: servidor apagado no se presenta como bloqueo absoluto de toda metadata. La autorización transaccional financiera y el gate privado no cambian. Configuración de módulo/encargado y membresía son endpoints administrativos vigentes: el apagado financiero no impide sus mutaciones autorizadas. No invocarlos para probar el despliegue.

## Orden, detenciones y reversión

Los [comandos](comandos-solo-documentados.ps1.txt) están separados y no se ejecutan en bloque. Cada salida exige revisar antes de continuar. No usar `--force`, `functions` general ni `firebase deploy --only hosting`.

0. **Antes de ejecutar:** verificar manifiesto local, revalidar inventario de configuración sin documentos financieros, confirmar mismas reglas remotas y live `504bdb13ab09a0ac`, y registrar revisiones de ambas Functions. Detener ante diferencias, permisos faltantes, necesidad de nuevas herramientas/credenciales, habilitación de APIs, IAM adicional o políticas de limpieza de artefactos. La autorización propuesta no incluye esos cambios. No modificar el proyecto para salvar el bloqueo.
1. **Diez creaciones apagadas.** Verificar nombres, región, runtime Node 24, estado ACTIVE y variables efectivas `publicable/fesync-app-2026/false`. Conservar las otras Functions. Ante fallo parcial, registrar cuáles quedaron creadas, detener; no borrar ni desplegar el resto por arrastre. No hay datos a revertir por estos comandos; no se invocan los handlers.
2. **Reglas Firestore.** Confirmar hash del ruleset efectivo. Debe ocurrir antes de nuevas generaciones. Ante fallo, detener: las operaciones financieras permanecen apagadas. Si la revisión publicada causa un problema, conservar protección de pertenencia y privacidad y revisar una corrección mínima; no se preautoriza volver al snapshot antiguo que permite editar generaciones. No se dispone de evidencia global para afirmar que restaurarlo sea seguro.
3. **Hosting piloto apagado.** Canal `finanzas-piloto-8iyv`, site `fesync-app-2026`, caducidad solicitada **7 días desde la publicación**, URL y expiración exactas se registran al crear. `--no-authorized-domains` evita adiciones y limpiezas automáticas de dominios Auth. Verificar que live mantiene versión/release y que la versión piloto contiene el Web manifestado, sin `finanzas_demo.html`, con cliente `false`. Comprobar login con la cuenta autorizada sin crear/vincular/salir/cambiar roles ni entrar en acciones que escriban. Si el método requiere otro dominio, detener y pedir adición exclusiva de ese hostname; no modificar proveedores/redirecciones por comodidad. Login puede producir registros normales de sesión del proveedor, por lo que debe autorizarse como smoke de autenticación. Ante fallo, detener y dejar caducar el canal; no restaurar live porque no se modificó. Borrar un canal también puede modificar Auth mediante CLI: no es reversión automática autorizada. No desplegar de nuevo para extender TTL sin autorización.
4. **Dos actualizaciones, solo tras aceptar transición global.** Confirmar reglas protectoras, disponibilidad del cliente compatible y comunicación de actualización obligatoria a nuevas altas/revinculaciones y quienes las administren. Si esto no está resuelto, no ejecutar. Tras actualizar, verificar estado/revisiones/env de ambos y conservar las otras once Functions. No crear una iglesia ni vincular una cuenta como smoke real. Ante actualización parcial, detener y conservar la evidencia; no rehacer el ingreso ni cambiar datos para comprobarlo.

**Límite de reversión de Functions:** no se archivaron las fuentes remotas anteriores y no se acredita una ruta de restauración de esas dos revisiones mediante el CLI disponible. No se debe prometer un rollback instantáneo ni usar HEAD como supuesto código remoto. Si se exige reversión de código garantizada antes de etapa 4, detener hasta obtener y revisar el artefacto anterior mediante una autorización acotada. Un rollback futuro no puede eliminar pertenencias/recibos emitidos ni volver a escritores incompatibles con ellos. Las diez Functions nuevas pueden permanecer apagadas; borrarlas no está incluido.

No se modifica ningún documento de acceso, gate, pertenencia, libro o proyección del piloto. El titular sigue pendiente de preparación y el libro de comprobación/preparación/inicialización bajo autorización futura. No se realiza conciliación: lee información financiera fuera del alcance actual.

## Autorización concreta que falta

Texto para autorizar las etapas 0–3:

> Autorizo en fesync-app-2026 la revalidación de configuración sin datos financieros y, si coincide con el plan, ejecutar las diez creaciones exactas, las reglas Firestore manifestadas y publicar únicamente el canal finanzas-piloto-8iyv por siete días, usando el paquete e0adf6f2836dcf3f06200c15dadf39ef321d57ebd332ea90aed06ba8b1aa8525. Cliente y servidor Finanzas deben quedar apagados. Autorizo comprobar configuración, integridad, permanencia de live y login de la cuenta piloto sin operaciones de negocio. No autorizo sincronizar dominios Auth, actualizar las dos Functions de ingreso, preparar datos, activar Finanzas, cambiar IAM/APIs ni modificar live. Detener ante cualquier diferencia.

La etapa 4 necesita además:

> Autorizo actualizar exclusivamente registrarNuevaIglesiaSegura y vincularUsuarioConCodigo a las revisiones de ese mismo paquete. Acepto que generan pertenencias protegidas para altas/revinculaciones de todo el proyecto, que clientes antiguos requieren actualización para las acciones protegidas y que no está preparado un rollback inmediato de fuentes remotas. Confirmo que está resuelta la distribución del cliente compatible a esos usuarios y administradores. Si no puede acreditarse esa transición, detener sin ejecutar esta etapa.

La segunda autorización no se presume a partir de la primera. No se solicitó ni ejecutó ninguna todavía. Todos los archivos añadidos son preparación local; no hay cambios en producto, paquete anterior, dependencias, Git HEAD/índice, V2, Work, inventarios ni módulos ajenos.
