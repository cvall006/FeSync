# Preflight Firebase real — 28 de octubre de 2026

**BLOQUEADO para solicitar el despliegue del candidato actual como Finanzas Web utilizable.** Los bloqueos son dependencias y compatibilidad; **la firma Android no es necesaria para Web**. Hubo permisos suficientes para las lecturas autorizadas.

## Configuración real comprobada

Proyecto exclusivo **fesync-app-2026**, número **336914296469**, estado `ACTIVE`. [Respuestas sanitizadas, nombres/regiones completos y registro de consultas](firebase_preflight_2026-10-28/resultado-remoto.json).

| Recurso | Resultado remoto y diferencia local |
| --- | --- |
| Firestore Rules | Release `cloud.firestore`, ruleset `26a2c1e2-5ea0-4d03-bf30-b19ac39873af`, actualizado `2026-10-13T01:23:28.514049Z`. Difiere de las reglas locales. |
| Storage Rules | Ruleset `17da719d-7b65-4cbd-8dae-c0dec608e214`, actualizado `2026-10-13T01:23:27.276823Z`; bucket `fesync-app-2026.firebasestorage.app`. **Idéntico byte a byte** al local; no requiere despliegue por este cambio. |
| Functions | **13**, todas `GEN_2`, `ACTIVE`, `nodejs24`, región **southamerica-west1**. Ninguna financiera V1. El index local tiene 25 exports; faltan 12 en remoto. |
| Hosting | Sitio `fesync-app-2026`, canal `live`, versión **504bdb13ab09a0ac**, release `1791855420658000` del `2026-10-13T01:37:00.658Z`. Rewrite SPA `** → /index.html`, equivalente al local. No se descargó ni ejecutó el cliente servido. |
| Facturación/APIs | `billingEnabled=true`. Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, Firestore, Rules y Hosting habilitadas. Sin cambios de plan, APIs o cuotas. |

## Bloqueos concretos, por prioridad

1. **Pertenencia y clientes antiguos.** Las reglas remotas permiten modificar `pertenenciaId` del perfil propio conservando `iglesiaId`/`rolGlobal`. V1 utiliza ese identificador para autorización e idempotencia: no habilitarlo con esa mutabilidad. Es análisis del código desplegado, sin probar escrituras reales. Las reglas locales protegen los tres campos, pero también eliminan las escrituras cliente para salida/expulsión/roles. El cliente de HEAD, por ejemplo, sale eliminando `iglesiaId`/`rolGlobal` directamente: esa operación quedaría denegada. **Desplegar todas las reglas locales implica una transición de compatibilidad; añadir solo las reglas financieras deja pendiente la protección de pertenencia.**
2. **Dos callables son insuficientes.** Además de `finanzasV1Consultar` y `finanzasV1Ejecutar`, Flutter necesita `finanzasV1ResolverSolicitud` para pendientes y `finanzasV1Mantener` para preparación/pausa/continuidad mensual. Los cuatro están ausentes. También faltan `actualizarEncargadoFinanciero` y `actualizarEstadoModuloFinanzas`, usados por la configuración financiera.
3. **El Web completo tiene otras dependencias ausentes:** `consultarEstadoSolicitudIngreso`, `desvincularMiembroIglesia`, `consultarEstadoSolicitudDesvinculacion`, `recuperarContextoSolicitudDesvinculacion`, `obtenerContextoCambioRolMiembro` y `actualizarRolMiembro`. El código local las referencia. Listar los endpoints existentes no acredita sus contratos nuevos: no se invocaron ni descargaron sus fuentes. No se implementó ni desplegó trabajo de membresía.
4. **Preparación real no acreditada:** perfiles, gates, períodos y proyecciones de iglesias quedaron fuera de la consulta autorizada. No se presume que falten ni que estén correctos; su validación necesitará autorización adicional antes de activar un piloto.

**Comparación FIN6:** no se encontró desplegada la apertura financiera que FIN6 corrigió localmente. Las reglas remotas son anteriores al bloque financiero y deniegan esas rutas por comodín, incluidos movimientos, cierres, auditoría, recibos e intenciones. También deniegan catálogos y `finanzas_config/acceso`, cuyas lecturas restringidas necesita el cliente nuevo para verificar acceso. Las reglas locales conservan privados los primeros y permiten esas lecturas limitadas. Esto no afirma existencia o contenido de documentos reales. [Diff exacto](firebase_preflight_2026-10-28/firestore-remoto-local.patch) y [hashes/comparación](firebase_preflight_2026-10-28/comparacion.json).

## Web y desactivación

**Sí, el transporte permite Web release sin emuladores.** `main.dart` selecciona Firebase real con demo apagada; Functions usa los nombres normales en `southamerica-west1`. [Flutter Web se compila independientemente de Android](https://docs.flutter.dev/deployment/web).

`config/finanzas_v1/publicable.json` apunta al proyecto correcto, sin host de emulador, pero conserva **`FESYNC_FINANZAS_CLIENTE_HABILITADO=false`**. Compilar con ese archivo no ofrece Finanzas operativo. Comando preparatorio, **no ejecutado**:

```text
flutter build web --release --target=lib/main.dart --dart-define-from-file=config/finanzas_v1/publicable.json
```

El servidor local exige entorno `publicable`, proyecto coincidente y **`FINANZAS_V1_SERVIDOR_HABILITADO=true`**, además de gate privado y autorización vigente transaccional. Sin selección explícita rechaza antes de Firestore; también recuperación/mantenimiento. En remoto no existen esos cuatro endpoints y las variables financieras inspeccionadas están ausentes en las 13 Functions existentes. No se comprobaron gates documentales.

## Permisos y requisitos

Las lecturas terminaron HTTP 200. [testIamPermissions](firebase_preflight_2026-10-28/permisos.json) confirmó los **16 permisos solicitados**, incluyendo despliegue Hosting/Rules/Functions, `actAs`, Cloud Build y carga en Artifact Registry. No se asignó ningún rol. No acredita toda la cadena efectiva de cuentas de ejecución/compilación, IAM Cloud Run, cuotas o restricciones organizacionales, ni autoriza despliegues.

Functions requiere [Blaze](https://firebase.google.com/docs/functions/get-started); la facturación está habilitada. Para Hosting por CLI también se documenta [API Keys Viewer](https://firebase.google.com/docs/projects/iam/roles-predefined-product). No se consultaron valores de claves/secretos. OAuth se renovó solo en memoria; `testIamPermissions` es una consulta POST sin modificar IAM. Las demás consultas fueron GET de configuración.

## Secuencia futura mínima y reversión — solo documentada

1. Fijar un candidato compatible de cliente/reglas y el conjunto exacto de Functions; resolver los bloqueos anteriores y ensayarlos en emuladores. No relajar pertenencia para conservar clientes antiguos.
2. Obtener aprobación de revisiones/hashes y alcance. Conservar la versión Hosting y los rulesets identificados. Preparar un Web release limpio sin demo, con habilitación cliente solo según autorización.
3. Desplegar por selectores explícitos las Functions aprobadas, incluyendo recuperación/mantenimiento y dependencias autorizadas, **con servidor financiero apagado**. Evitar un despliegue general de los 25 exports.
4. Publicar únicamente las reglas Firestore compatibles aprobadas; Storage no necesita cambio. Publicar Web después de sus dependencias, manteniendo gates apagados. Validar con un plan autorizado sin asientos ficticios.
5. Preparar/verificar y habilitar un piloto solo mediante autorización independiente. Para libros existentes, el protocolo debe estar pausado mediante un procedimiento autorizado antes de abrir operaciones. El mantenimiento también exige gate/global habilitados.

**Reversión:** detener ampliación y, bajo autorización de intervención, pausar/apagar gate/global; esto también bloquea recuperación/mantenimiento. Reponer Hosting anterior o cliente compatible considerando cachés/pestañas. Conservar Functions/recibos compatibles con solicitudes emitidas; no borrar pendientes ni restaurar datos sobre commits. No restaurar ciegamente las reglas anteriores mientras V1 siga utilizable: reabrirían la mutación de pertenencia.

## Estado conservado

**903 rutas previas intactas**, HEAD `01223cd990312677ebbef2892ae7e99b1109e272`, rama `integration/adora-live` e índice preservados. Solo se añadieron este informe y su carpeta de evidencia. [Integridad](firebase_preflight_2026-10-28/integridad.json). Sin cambios de código/configuración local; sin nuevas compilaciones ni suites de pruebas. `git diff --check` conserva el espacio final preexistente de `functions/index.js:2047`.

**Sin despliegues, invocaciones de Functions, escrituras Firebase, consultas de movimientos/datos personales, activaciones, cambios IAM/secretos, commits ni cambio de rama.** Próxima acción: acordar el conjunto compatible de dependencias y reglas antes de solicitar despliegue; no publicar solamente los dos callables sobre este estado.
