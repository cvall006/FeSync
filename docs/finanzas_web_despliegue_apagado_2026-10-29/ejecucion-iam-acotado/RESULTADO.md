# Detención antes del CLI: identidades administradas no verificables

**Cero Functions creadas, cero revisiones nuevas, cero políticas IAM aplicadas.** El ejecutor se detuvo en su preflight y no llegó a invocar Firebase CLI. No hay despliegue parcial.

El paquete de 79 archivos conserva digest `e0adf6f2836dcf3f06200c15dadf39ef321d57ebd332ea90aed06ba8b1aa8525`; las fuentes locales usadas por las pruebas coinciden con el runtime empaquetado. Los diez handlers devuelven `unauthenticated` sin Auth antes de tocar DB (`auth-local.json`). La suite local seleccionada de autorización, revocación, pertenencia e aislamiento terminó con 391 aprobadas y cero fallos (`seguridad-local.log`). El middleware `onCall` del SDK valida Firebase ID tokens con `verifyIdToken` y rechaza tokens inválidos; no se sustituyó por un handler HTTP sin validación. Las consultas históricas de recibos siguen limitadas al actor y no conceden autorización para ejecutar operaciones nuevas.

Se revalidó en producción que las diez propuestas no existen, y que las 13 anteriores conservan nombres, estado ACTIVE, revisiones y fechas de actualización. Las siete APIs verificadas están habilitadas. El paquete mantiene servidor `publicable/fesync-app-2026/false` y cliente false. No se desplegó una configuración nueva.

## Bloqueo exacto y límite de lo comprobado

La consulta IAM a `projects/fesync-app-2026/serviceAccounts/service-336914296469@gcp-sa-pubsub.iam.gserviceaccount.com` devolvió 404. Las consultas globales `projects/-/serviceAccounts/...` para Pub/Sub y Eventarc devolvieron 403 (`agentes-comprobacion.json`). **No se afirma que las identidades falten ni que el operador necesariamente carezca de permisos de despliegue**; esas respuestas impiden acreditar su existencia con las lecturas intentadas.

El CLI instalado solicita incondicionalmente `generateServiceIdentity` para Pub/Sub y Eventarc al preparar Functions Gen 2 (`firebase-tools/lib/deploy/functions/prepare.js`, `ensureAllRequiredAPIsEnabled`). Esa operación puede generar una identidad administrada si no existe. No es el binding `roles/run.invoker` de los diez servicios nuevos. Ante la autorización IAM expresamente acotada a ese binding y la existencia no acreditada de los agentes, no se llamó al generador ni al CLI. No se cambiaron roles, cuentas de servicio, permisos de proyecto ni APIs para salvar el bloqueo.

Se preparó una guardia local de solicitudes CLI para impedir PATCH/DELETE de Functions, IAM de proyecto/cuentas de servicio, habilitación de APIs, políticas de artefactos y `setIamPolicy` fuera de los diez servicios nuevos. No fue necesario ejecutarla: el preflight se detuvo antes. No se alteró el CLI instalado ni el candidato para omitir sus pasos.

## Siguiente acción mínima

Resolver exclusivamente este requisito de identidades administradas: acreditar su existencia con una identidad ya autorizada que pueda consultar esos dos agentes, **o autorizar expresamente las dos llamadas estándar `generateServiceIdentity` de Pub/Sub y Eventarc en el proyecto**, indicando si se permite generarlas cuando estén ausentes. Esa autorización no debe incluir cambios de roles ni IAM de proyecto: si aparece tal requisito, detener nuevamente. No se recomienda conceder Owner/Editor ni abrir otros servicios como solución.

No se presume esta autorización a partir de la de invocación pública. No se realizaron consultas de datos ni invocaciones financieras reales; tampoco reglas, Hosting, las dos Functions de ingreso, preparación de perfiles/libros, activaciones, commits ni cambios de rama. Las revisiones exactas de las 13 Functions y el cierre están en `resultado-final.json`.
