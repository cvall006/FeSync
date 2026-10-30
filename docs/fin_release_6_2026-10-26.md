# FIN-RELEASE-6 — privacidad financiera

**Exposición cerrada en las reglas locales. Sin despliegue.** El cambio de
`firestore.rules` sustituye tres condiciones de lectura por `false`: movimientos,
cierres y auditoría. Esas rutas quedan reservadas al servidor, sin excepciones
por rol ni habilitación. Todas sus escrituras continúan denegadas al cliente.
No cambia ningún backend, motor contable ni código de aplicación.

El estado de las reglas realmente desplegadas es **desconocido**: no se consultó
Firebase real. Este resultado no afirma que se haya corregido una exposición
remota ni que existan datos financieros reales afectados.

## Rutas y permisos antes/después

Todas las rutas de esta tabla, salvo las globales indicadas, están bajo
`iglesias/{iglesiaId}/`.

| Ruta | Lectura anterior | Lectura local corregida |
| --- | --- | --- |
| `finanzas_movimientos/{id}` | `get/list` del documento completo, incluidos `privado.aportante`, responsable, huella y precondiciones, para titular/encargado con módulo activo | Ningún cliente; consulta financiera mediante callable y DTO filtrado |
| `finanzas_auditoria/{id}` | `get/list` completos para los mismos actores, incluida identidad del responsable/actor y datos de auditoría | Ningún cliente |
| `finanzas_cierres/{id}` | `get/list` completos para los mismos actores, sin restricciones sobre los campos documentales | Ningún cliente; no se añade un API de cierres V1 |
| `finanzas_cuentas/{id}`, `finanzas_categorias/{id}` | `get/list` para titular/encargado con módulo activo | Igual; catálogos existentes, sin nueva habilitación genérica |
| `finanzas_config/acceso` | `get` para titular válido incluso sin módulo activo; encargado solo con acceso vigente y módulo activo | Igual; no se puede enumerar `finanzas_config` ni leer otro documento |
| `finanzas_elegibilidad/{uid}` | Solo `get` propio con pertenencia a la iglesia, incluso si la señal está deshabilitada | Igual; no concede acceso al libro ni permite enumeración |
| `finanzas_control`, `finanzas_saldos`, `finanzas_resumenes`, `finanzas_aperturas`, `finanzas_reversiones` | Denegadas por cierre de rutas | Igual; `get/list`, consultas filtradas y escrituras verificadas como denegadas |
| Global: `operaciones_financieras/{uid}/solicitudes/{id}` | Recibos íntegros denegados incluso a su dueño | Igual |
| Global: `finanzas_mvp_solicitudes/{uid}/solicitudes/{id}` | Intenciones y precondiciones denegadas incluso a su dueño | Igual |
| Rutas financieras desconocidas/anidadas | Denegadas por los comodines de cierre | Igual |

Antes, `puedeLeerFinanzas()` exigía perfil de la misma iglesia, iglesia con
`adminUid` válido, perfil del titular en esa iglesia con rol `admin_iglesia`,
documento de acceso y `moduloHabilitado == true`. Después aceptaba al titular
real o al UID designado como encargado. No bastaba tener rol administrativo
antiguo, ser líder o miembro sin designación. La función **no exigía** gate
`finanzas_control/publicacion_v1`, época/proyección, período, pertenenciaId de
generación ni el contrato del callable. Los permisos `get/list` daban acceso a
todo el documento, sin proyección de campos.

La reproducción de las reglas iniciales obtuvo documentos y colecciones de las
tres rutas con gate ausente y falso, para titular y encargado. Los documentos
son sintéticos: movimientos y auditoría corresponden a rutas/campos del backend;
el caso de cierres prueba que la autorización anterior dejaba pasar el documento
completo sin filtrar sus campos, no que se haya encontrado un cierre real con
aportantes. Se incluye cierres porque conserva la misma vía directa de lectura
del libro y no hay consumidor directo en el cliente actual que deba preservarse.

## Diff mínimo

[Diff exacto respecto del inicio de FIN-RELEASE-6](fin_release_6_2026-10-26/reglas.patch)
y [verificación del cambio acotado](fin_release_6_2026-10-26/delta-minimo.json).
Se conservan finales CRLF y todos los bytes fuera de estas tres condiciones y un
comentario. El diff frente a HEAD incluye trabajo anterior y **no representa**
solo esta corrección.

```diff
 match /finanzas_movimientos/{movimientoId} {
-  allow get, list: if puedeLeerFinanzas();
+  // El documento completo contiene datos privados. Lectura solo vía callable.
+  allow get, list: if false;
 match /finanzas_cierres/{cierreId} {
-  allow get, list: if puedeLeerFinanzas();
+  allow get, list: if false;
 match /finanzas_auditoria/{eventoId} {
-  allow get, list: if puedeLeerFinanzas();
+  allow get, list: if false;
```

No se añade un permiso por gate, rol o claim que vuelva a abrir esas rutas. Las
reglas de cuentas/categorías/configuración/señal, perfiles y módulos anteriores
se mantienen. Las escrituras financieras siguen siendo de servidor: ninguna
condición de escritura fue ampliada.

`storage.rules` queda idéntico. Sus únicas rutas habilitadas corresponden a
fotografías de usuarios y materiales de capacitaciones; el resto se deniega.
No hay uso de Storage financiero en el cliente/backend V1 inspeccionado ni una
ruta financiera de objetos abierta demostrada. No se amplió el alcance a
rediseñar esas rutas ni se presume el contenido de un bucket remoto.

## Evidencia y pruebas

| Validación final | Resultado |
| --- | --- |
| Reproducción de reglas anteriores | 2 aprobadas; exposición reproducida |
| Reglas corregidas | 46 financieras + 13 privacidad/regresión + 33 pertenencia = **92 aprobadas** |
| `npm.cmd test` | **1.779 aprobadas** |
| Integración de entrada normal | **25 aprobadas**, 24 escenarios y contenedor |
| Flutter relevante | **177 aprobadas** |
| Flutter conectado a emuladores | **1 aprobada**, recuperación con un solo movimiento |
| `flutter analyze --no-pub` | **Sin incidencias** |

Todas las ejecuciones finales terminaron con salida 0, sin fallos ni omisiones.

- [Antes: reproducción sobre snapshot inicial](fin_release_6_2026-10-26/reglas-antes.log).
  Dos pruebas confirman acceso completo a las tres colecciones, para titular y
  encargado, con gate ausente y falso.
- [Después: reglas y regresiones](fin_release_6_2026-10-26/reglas-final.log).
  Se conservan las 46 pruebas financieras; las dos expectativas que antes
  permitían libro/auditoría ahora comprueban denegación y preservan las lecturas
  válidas de catálogos/configuración. No se eliminó ninguna prueba negativa.
  Se añaden 13 pruebas de privacidad/regresión y se ejecutan las 33 de pertenencia.
- [Integración normal y Flutter conectado](fin_release_6_2026-10-26/integracion-final.log),
  [escenarios](fin_release_6_2026-10-26/emulador.json) y
  [recuperación persistida](fin_release_6_2026-10-26/flutter-recuperacion.json).
- [Node completo](fin_release_6_2026-10-26/npm-test.log),
  [Flutter relevante](fin_release_6_2026-10-26/flutter-relevante.log),
  [análisis](fin_release_6_2026-10-26/flutter-analyze.log) y
  [resultados estructurados](fin_release_6_2026-10-26/validacion.json).

La matriz negativa cubre titular, encargado vigente, encargado sin designación,
miembro, líder, otra iglesia, usuario sin perfil y no autenticado. Incluye
documentos individuales, listado, consulta filtrada y `collectionGroup`, más
lecturas/escrituras con gate true/false. Se prueba revocación sobre la misma
instancia de cliente que antes tenía acceso, así como recibos/intenciones
existentes pertenecientes al propio UID.

La integración conserva el backend original y autentica por Auth Emulator. Con
gate ausente se niega el callable; al habilitar solo la fixture sintética se
permite consulta filtrada, gasto y replay, pero Firestore REST con token cliente
sigue devolviendo 403 para movimientos, auditoría y recibos. No se usa el éxito
de Admin SDK como prueba de permisos cliente: sus escrituras y lecturas son del
servidor, mientras los rechazos se comprueban con SDK/REST autenticados.

El mismo ensayo mantiene pruebas de titular/encargado vigentes, miembro/líder
rechazados, revocación incluso entre intención y commit, titular incoherente,
iglesia/pertenencia anterior, aislamiento, gate apagado, permisos por acción,
proyecciones/período, paginación y privacidad del DTO. Continúa comprobando
mensualidad, idempotencia, respuesta perdida y libro superior a 1.000 movimientos.
La prueba Flutter recrea servicio y almacén de archivo, recupera un commit por
el mismo ID y confirma un solo movimiento. El transporte de prueba adapta
nombres demo a V1; no se modificó el transporte de la aplicación distribuible ni
se afirma un reinicio físico o prueba del almacén seguro de Android/iOS.

Los ensayos usan exclusivamente `demo-fesync`: reglas en 8098 aislado, integración
en Auth 9098/Firestore 8088/Functions 5018. Las suites que limpian su base se
ejecutan secuencialmente en 8098 y no vacían el Firestore de integración. Los
ejecutores rechazan credenciales y proyectos alternativos y no descargan ni
instalan herramientas. Las reglas anteriores se cargan solo desde el snapshot
local al solicitar explícitamente `--antes`, dentro del emulador aislado.

## Compatibilidad e impacto concreto

La pantalla financiera utiliza callables para consulta/escritura y acceso directo
al documento conocido de configuración; no consulta directamente el libro,
auditoría ni cierres. El Dashboard conserva el documento de iglesia, perfil y
señal propia. Todo ese acceso permanece autorizado bajo sus condiciones previas.

La regresión de reglas verifica consulta de miembros acotada por iglesia,
perfil propio/ajeno de la misma iglesia, edición auxiliar de perfil y señal
propia. También lectura de miembro y escritura de líder en Agenda, Turnos,
Capacitaciones, Escuela/evaluaciones y Adora; Comunidad conserva creación y
edición del autor. Se mantienen rechazos cruzados y las 33 pruebas de protección
de pertenencia/roles, perfiles heredados y edición auxiliar. Flutter verifica
pantallas/servicios de Finanzas, permisos, roles, gestión de miembros y salida
voluntaria. No se presenta esto como un recorrido visual nuevo de cada módulo.

Los callables antiguos de módulo/encargado, roles e ingreso se ejercitan dentro
de la integración normal, y todos los exports/runtime conservan sus bytes. No
se cambia autorización de backend: cada consulta/escritura/replay normal sigue
revalidando UID de Auth, iglesia y perfil actuales, titular real o encargo vigente,
permiso, pertenencia y gate/protocolo/proyección/período en la transacción.

**Impacto intencional:** cualquier cliente antiguo o herramienta cliente que
leyera directamente movimientos, auditoría o cierres recibirá permiso denegado,
incluso si usa una cuenta titular. No se conserva ese acceso porque el documento
completo elude el filtrado. V1 mantiene su consulta paginada filtrada; no se crea
un endpoint nuevo de auditoría/cierres. Los consumidores externos no presentes
en este repositorio no fueron inventariados mediante producción. Catálogos y
configuración conservan el acceso necesario; el gate privado no controla esas
lecturas preservadas y no debe describirse como un bloqueo de toda la metadata.

## Archivos y preservación

[Respaldo verificado](fin_release_6_2026-10-26/respaldo.json),
[integridad respecto del estado inicial](fin_release_6_2026-10-26/integridad.json),
[archivos nuevos](fin_release_6_2026-10-26/archivos-nuevos.json) y
[estado Git](fin_release_6_2026-10-26/git-status.txt).

Archivos existentes modificados en esta intervención:

1. `firestore.rules`: tres lecturas denegadas y un comentario.
2. `test/finanzas_rules/finanzas.test.js`: actualiza las dos expectativas positivas
   del libro y conserva las 46 pruebas.
3. `test/finanzas_rules/pertenencia.test.js`: permite únicamente el puerto aislado
   8098 además del histórico 8088 para reutilizar la suite sin tocar otra base.
4. `test/finanzas_release3/integracion.cjs`: agrega selección FIN-RELEASE-6,
   conserva los escenarios anteriores y verifica los rechazos REST junto con
   el acceso callable autorizado.

Los archivos nuevos son ejecutores locales, matriz de privacidad, prueba Flutter
conectada y documentación/evidencias bajo `test/finanzas_release6/` y
`docs/fin_release_6_2026-10-26*`. No se modifican los informes ni artefactos de
FIN-RELEASE-5: son evidencia histórica, no una descripción de las reglas corregidas.
No se crea otro paquete Functions: su runtime sigue idéntico al revisado.

HEAD, rama e índice permanecen iguales. Se conserva la eliminación Kotlin inicial.
De las 677 rutas iniciales, 672 archivos conservan sus bytes, cambian los cuatro
archivos enumerados y se mantiene una eliminación previa; no falta ningún archivo.
El aviso de `git diff --check` en `functions/index.js:2037` es previo y no se tocó.
No hay cambios en Storage, dependencias, motor contable, V2, inventarios, Work,
migración de membresía ni cliente productivo.

Para repetir localmente con herramientas ya instaladas:

```powershell
node test/finanzas_release6/reglas.cjs --antes
node test/finanzas_release6/reglas.cjs
node test/finanzas_release6/iniciar.cjs
npm.cmd --prefix functions test
```

## Riesgos restantes antes de publicar

1. Esta corrección es local y no cambia el estado remoto desconocido. Un futuro
   despliegue de reglas requiere autorización expresa y una revisión del diff
   completo frente a la versión remota autorizada, que aquí no se consultó.
2. Permanecen los bloqueos de FIN-RELEASE-5 sobre entorno exclusivo de emuladores,
   nombres demo del cliente, preparación/mantenimiento reales y resolución de
   intenciones sin commit con precondiciones vencidas. No se resuelven en este alcance.
3. Los clientes que dependan de lectura directa del libro requieren el transporte
   filtrado autorizado; no se debe reabrir la regla para mantener ese comportamiento.
4. Las reglas corregidas impiden nuevas lecturas de servidor por esas rutas;
   no eliminan copias que un cliente hubiera obtenido antes. No se investigó
   producción ni se afirma una filtración real o su alcance.

**FIN-RELEASE-6 finalizado. Privacidad directa corregida localmente; publicación
real continúa bloqueada por los asuntos restantes.** Sin despliegues, consultas
a Firebase real, habilitación de usuarios reales, commits ni cambios de rama.
