# Diez Functions creadas; Finanzas permanece apagado

Proyecto `fesync-app-2026`, regi?n `southamerica-west1`. Despliegue selectivo completado, salida CLI 0. Paquete `e0adf6f2836dcf3f06200c15dadf39ef321d57ebd332ea90aed06ba8b1aa8525`.

## Identidades y cambios IAM

- `pubsub.googleapis.com`: `service-336914296469@gcp-sa-pubsub.iam.gserviceaccount.com`, uniqueId `116156112137535035310`.
- `eventarc.googleapis.com`: `service-336914296469@gcp-sa-eventarc.iam.gserviceaccount.com`, uniqueId `106938031272745348243`.

Las dos llamadas generateServiceIdentity devolvieron los agentes esperados. No es posible distinguir si fueron creados en la primera llamada o ya exist?an: las lecturas IAM previas devolvieron 404/403. El CLI volvi? a solicitar esas mismas identidades durante el despliegue.

La pol?tica IAM de proyecto se ley? antes/despu?s de la generaci?n y al terminar el despliegue: cero bindings a?adidos/eliminados, con la misma huella normalizada. No hubo concesiones manuales de proyecto ni cambios de roles a cuentas de servicio. En cada uno de los diez servicios Cloud Run nuevos se verific? exclusivamente el binding `roles/run.invoker` ? `allUsers`, sin condiciones ni bindings adicionales. No se abri? ning?n servicio auxiliar.

## Functions nuevas verificadas ACTIVE

| Function | Revisi?n Cloud Run | Servicio |
| --- | --- | --- |
| `actualizarEncargadoFinanciero` | `actualizarencargadofinanciero-00001-mip` | `actualizarencargadofinanciero` |
| `actualizarEstadoModuloFinanzas` | `actualizarestadomodulofinanzas-00001-hid` | `actualizarestadomodulofinanzas` |
| `actualizarRolMiembro` | `actualizarrolmiembro-00001-yaq` | `actualizarrolmiembro` |
| `consultarEstadoSolicitudDesvinculacion` | `consultarestadosolicituddesvinculacion-00001-puf` | `consultarestadosolicituddesvinculacion` |
| `consultarEstadoSolicitudIngreso` | `consultarestadosolicitudingreso-00001-far` | `consultarestadosolicitudingreso` |
| `desvincularMiembroIglesia` | `desvincularmiembroiglesia-00001-gig` | `desvincularmiembroiglesia` |
| `finanzasV1Consultar` | `finanzasv1consultar-00001-win` | `finanzasv1consultar` |
| `finanzasV1Ejecutar` | `finanzasv1ejecutar-00001-vuc` | `finanzasv1ejecutar` |
| `obtenerContextoCambioRolMiembro` | `obtenercontextocambiorolmiembro-00001-nuc` | `obtenercontextocambiorolmiembro` |
| `recuperarContextoSolicitudDesvinculacion` | `recuperarcontextosolicituddesvinculacion-00001-yox` | `recuperarcontextosolicituddesvinculacion` |

Todas: GEN_2, Node 24, regi?n autorizada. Sus variables efectivas son `FINANZAS_V1_ENTORNO=publicable`, `FINANZAS_V1_PROYECTO=fesync-app-2026`, `FINANZAS_V1_SERVIDOR_HABILITADO=false`. El cliente del paquete tambi?n sigue false. No se tocaron gates ni acceso de ninguna iglesia.

## Conservaci?n y verificaciones

Las 13 Functions anteriores conservan configuraci?n normalizada completa, revisi?n, fecha y estado ACTIVE; est?n enumeradas en `verificacion-final.json`. Incluye registrarNuevaIglesiaSegura y vincularUsuarioConCodigo, sin actualizaci?n. Los 25 exports empaquetados no se desplegaron: se crearon solo los diez seleccionados.

No se invoc? ninguna Function ni se consultaron documentos financieros. Se verific? exclusivamente configuraci?n, estados y pol?ticas. Las 391 pruebas locales de seguridad y rechazo sin Auth corresponden al intento autorizado anterior y se reutilizaron; no se repitieron.

La guardia local limit? llamadas mutantes a creaci?n de las diez Functions con flags false, upload del c?digo, generaci?n de los dos agentes y las diez pol?ticas de invocaci?n. Deneg? el primer intento antes de crear recursos por un GET de metadatos de la base Firestore. Se permiti? ?nicamente esa ruta de configuraci?n, manteniendo bloqueadas rutas de documentos; el segundo intento complet?. El timeout del chequeo informativo de versi?n NPM no requiri? instalar dependencias ni impidi? el deploy. Se conservan logs y auditor?a de ambos intentos.

No se modificaron reglas Firestore/Storage, Hosting/live, datos, titulares, pertenencias, libros, m?dulos ajenos, IAM manual de proyecto, commits ni rama.

## Pr?xima acci?n m?nima

Solicitar autorizaci?n independiente para publicar exclusivamente la revisi?n Firestore compatible del plan y verificar su hash efectivo. Mantener Finanzas apagado. Hosting piloto y preparaci?n del titular/libro permanecen pendientes y requieren nuevas autorizaciones. No se contin?a a ninguna de esas etapas.

Evidencia: `resultado-identidades.json`, `preflight-2.json`, `guardia.jsonl`, `salida-cli-2.json` (0) y `verificacion-final.json` (completa=true).
