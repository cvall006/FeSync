# FIN-7C.4E.1C.2 — Acreditación admin-4, sin activación

## Cambio aprobado

Se acredita el contenido existente de los cinco módulos de
`contabilidad_generaciones_v2_demo/` mediante `inventarios/runtime_4.json`.
`registro.json` selecciona admin-4 para nuevas ejecuciones; conserva las entradas
admin-2/admin-3. No cambia ningún byte de `fuentes.js`, `transicion.js`,
`entorno.js`, `fuentes_v1.json`, descriptores históricos, preparador o adaptadores.
El árbol exacto tiene 28 fuentes: 22 base, V2 ya acreditado y cinco del preparador.
No se aceptan comodines, rutas futuras ni hashes calculados y aprobados sin revisión.

La revisión del preparador conserva guardas demo, bloqueo transaccional,
reconstrucción con conciliación/proyecciones existentes, recibos y reservas
reales, validación del mismo corte, lotes acotados, reconsulta completa del
destino y fencing. No inicializa SDK ni contiene endpoints, activación, puntero
activo, notificaciones o escrituras económicas V1. Todas sus dependencias JS
transitivas están incluidas en el inventario; una prueba recorre sus imports
estáticos y compara contenido. Node y sus módulos nativos, SDK y node_modules
no quedan autenticados por esta fórmula; no se cambiaron dependencias/lockfiles.

El cierre de imports de `preparacion.js` contiene sus cinco módulos, más
`finanzas_core/{adaptador_firestore_v2,asientos,autorizacion,categorias,
conciliacion,configuracion,cuentas,dinero,operaciones,proyecciones}.js` y
`pertenencia.js`: 16 JS en total. Los once anteriores ya estaban cubiertos;
sus bytes permanecen intactos. La acreditación completa sigue exigiendo las
28 fuentes, no solamente ese cierre parcial.

## Identidades reproducibles

| Objeto | SHA-256 / identidad |
| --- | --- |
| Descriptor admin-4 | `ea82fa5adf0dd29f9ff1b69bd017c805e6ca3b2da1fcbe54b731fc8e39e755c2` |
| Runtime admin-4 | `1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7` |
| Runtime admin-3 conservado | `4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c` |
| Runtime admin-2 conservado | `0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f` |
| Legado conservado | `76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d` |
| Registro admin-3 capturado antes del cambio | `6030b171bcf086be3b794858a886b9e6d598c87add787414330bb2f315cf829d` |

Cada archivo nuevo tiene su SHA-256 real en `runtime_4.json`; el descriptor
conserva los hashes originales de base, archivo histórico y parche de identidad.
La fórmula sigue siendo:

```text
SHA256("fesync-inventario-runtime-2\0" || bytes(runtime_4.json)
       || bytes(entorno.js) || bytes(fuentes.js) || bytes(transicion.js))
```

No hay autorreferencia: el descriptor no contiene su propio hash; el registro
lo fija y no participa en las identidades. Los módulos acreditados tampoco
contienen el hash de admin-4. No se modifica el acreditador ni su propio hash.
No hay comando de autoactualización. Código y registro revisados siguen siendo
raíz de confianza local, no firma externa ni defensa frente a sustituir todo
el repositorio por parte de un operador malicioso.

## Compatibilidad de ejecución y checkpoint

| Estado persistido | Runtime admin-4 |
| --- | --- |
| D2 legado sin etiquetas y huella original exacta | Admite esquema/procedimiento/algoritmo originales, época 1 y generación inactiva |
| D2 admin-2 con huella y etiquetas originales | Reanuda sin reetiquetar |
| D2 admin-3 con huella y etiquetas originales | Reanuda sin reetiquetar |
| D2 nuevo admin-4 | Crea con identidad propia; mantiene contrato de inventario 2, procedimiento 1 y algoritmo 1 |
| Huella desconocida, etiqueta parcial, iglesia/época/procedimiento incoherentes | Rechaza sin reparar |
| Checkpoint del preparador aislado presentado como D2 | Rechaza: son procedimientos y esquemas diferentes |

Todo el árbol actual se coteja primero contra admin-4, y los descriptores
compatibles se verifican íntegramente. La relación declarada no sustituye esa
igualdad exacta ni autoriza cambios económicos. Elegir expresamente admin-2 o
admin-3 en este árbol ampliado rechaza; no son alias del runtime admin-4. Sus
ejecuciones se recuperan usando la compatibilidad explícita de admin-4 o el
software original verificado bajo custodia, nunca copiando huellas.

La acreditación del código NO transforma el sobre del preparador aislado en
un checkpoint D2/admin-4. Sus registros y respuestas mantienen el campo histórico
`acreditacion: 'PENDIENTE'`, el procedimiento `preparacion_v2_aislada_1` y sus
verificaciones propias de fuente/checkpoint. No almacenan una huella de runtime;
por tanto, no prueban por sí solos qué software los creó. No se reescriben ni se
añaden metadatos a los ya existentes. Para ejecutar bajo esta acreditación se
debe validar `obtenerContextoFuentes()` antes de construir el preparador/SDK, bajo
custodia del árbol revisado. La prueba integrada realiza ese preflight y conserva
el estado del procedimiento aislado; no añade un fallback de autorización.
Un futuro enlace persistido de runtime en ese sobre exige otro alcance explícito.
Los ejecutores aislados `iniciar.js` y `ejecutar.js` ahora exigen expresamente
`obtenerContextoFuentes('admin-4')` antes de arrancar emulador/importar SDKs.
No se permite omitir el rechazo de inventario para ejecutar esta versión del ensayo.
Los archivos de pruebas/ejecutores siguen fuera del inventario de fuentes;
no se les atribuye una identidad productiva ni se modifica el código acreditado.

## Historia real del emulador

`test/registro_admin3.json` es copia exacta del registro anterior. La VM de
pruebas ejecuta los bytes originales acreditados para crear checkpoints legado,
admin-2 y admin-3 realmente en Firestore Emulator. Presenta exclusivamente a ese
runtime histórico su árbol original de 22 o 23 fuentes y registro capturado;
no cambia filtros o archivos del verificador operativo. Antes, admin-4 verifica
las 28 fuentes reales completas. No se fabrican checkpoints copiando una huella
sobre una ejecución nueva. Se comprueban contenido y updateTime en reconsultas,
avance ordinario conservando identidad, respuesta perdida y fencing.

Se prueba además el preparador sin cambios sobre un libro real V1 y una D2
auténtica producida por el motor admin-3, conservando D2, su checkpoint y V1.
La nueva generación queda inactiva, protocolo bloqueado y puntero ausente.
La suite aislada de 58 casos conserva sus fixtures D2 sintéticas: no se cambia
esa descripción ni se las presenta como ejecuciones históricas acreditadas.

## Revisión individual de los 22 fallos anteriores

Se revisaron los registros conservados de C.1, incluyendo el código y origen
de cada excepción. Los 22 terminaban en `DEMO_FUENTES_NO_ACREDITADAS` antes de
alcanzar sus comprobaciones principales. No había un fallo contable oculto.

| # | Caso previo | Tratamiento |
| --- | --- | --- |
| 1 | V1 reproduce bytes originales / identidad actual distinta | Runtime actual esperado admin-4; reproducción original intacta |
| 2 | Identidad sin mutar, legado=false | Vuelve a alcanzar sus aserciones, sin rebajarlas |
| 3 | Identidad sin mutar, legado=true | Igual; identidad histórica conservada |
| 4 | Checkpoint: huella histórica desconocida | Negativo intacto |
| 5 | Checkpoint: iglesia | Negativo intacto |
| 6 | Checkpoint: época | Negativo intacto |
| 7 | Checkpoint: algoritmo | Negativo intacto |
| 8 | Checkpoint: procedimiento | Negativo intacto |
| 9 | Checkpoint: generación activa | Negativo intacto |
| 10 | Checkpoint: etiqueta parcial | Negativo intacto |
| 11 | Checkpoint: inventario falso | Negativo intacto |
| 12 | Ampliación sintética explícita | Fixture parte del inventario actual completo; desconocidos siguen rechazados |
| 13 | Historia admin-2 aceptada | Mismo contrato y datos, ahora bajo runtime admin-4 |
| 14 | admin-3 tiene huella propia | Reproduce H3 con su descriptor original; ya no confunde H3 con runtime actual |
| 15 | Historia admin-2: huella diferente | Negativo intacto |
| 16 | Historia admin-2: iglesia diferente | Negativo intacto |
| 17 | Historia admin-2: época diferente | Negativo intacto |
| 18 | Historia admin-2: procedimiento diferente | Negativo intacto |
| 19 | Historia admin-2: inventario desconocido | Negativo intacto |
| 20 | Guardas sin red ni inicialización Firebase | Se alcanza constructor con fuentes acreditadas; guardas intactas |
| 21 | Inventario revisado coincide con fuentes | Igualdad exacta conservada |
| 22 | Integración V2 reconoce runtime acreditado | Espera admin-4; escritor y guardas sin cambios |

También se actualizó la prueba de parche económico incompatible para dirigir
su descriptor virtual al runtime actual. Sigue exigiendo rechazo aunque se
recalculen coherentemente los hashes de la fixture. No se modificó el contrato
de parches ni se quitaron pruebas negativas. Se amplía alteración individual a
las cinco nuevas fuentes y al descriptor 4.

## Respaldo, límites y siguiente etapa

Antes de editar se creó un TAR privado fuera del árbol, con .git, archivos staged,
untracked e ignorados, cachés y dependencias existentes: 23.038 archivos regulares,
550.148.608 bytes. La extracción se cotejó archivo por archivo contra SHA-256.
Sus 22 enlaces se documentaron sin seguir destinos externos. SHA-256 del TAR:
`dd71a9bc4270c49f9181d893e474f7b6f75073745a0efc950d3b77f2bde3e70a`.
El respaldo es privado y no un paquete para compartir; no se publican sus datos.

Se mantienen límites 50/50/200, custodia operativa del emulador, ausencia de
prueba IAM, listado de subcolecciones fuera de transacción y ausencia de garantía
de durabilidad después de destruir el emulador. Las carreras probadas son
intercalaciones concretas; ABORTED, interrupciones y pérdidas de respuesta son
inyecciones expresas alrededor de SDK real, no fallos de infraestructura ocultos.

No se activa V2 ni se autoriza un gasto sobre generaciones preparadas. El siguiente
paso debe definir y probar separadamente activación y vínculo de evidencia,
con autorización expresa. Esta acreditación no habilita producción.

## Validación

`npm.cmd test` final: **1.745/1.745**, cero fallidas, canceladas u omitidas.
Incluye 13 casos nuevos respecto de las 1.732 anteriores. Las pruebas de
inventarios suman 67; no son 67 pruebas de Firestore real. Una corrida intermedia
aprobó 1.742 antes de añadir los tres negativos específicos de checkpoint admin-4.

La integración histórica real aprobó **23/23** (cuatro casos nuevos), incluidas
las tres identidades anteriores, nuevas ejecuciones D2 admin-4 y preparación V2
sin activar desde D2 auténtica. La ejecución encadena las 28 administrativas y
las regresiones FIN-7, manteniendo un único emulador a la vez.

Las administrativas D2 aprobaron **28/28** y FIN-7 **211/211**, con **46/46**
regresiones de reglas anidadas. Cero fallidas, canceladas u omitidas. Las 46
no se suman a las 211 como si fueran casos independientes del ejecutor.
Los `PERMISSION_DENIED` registrados corresponden a casos negativos esperados;
el SIGINT corresponde al apagado normal del emulador después de código 0.

El preparador aislado aprobó **58/58** con el preflight admin-4 activo: 25 guardas
y 33 escenarios SDK/Firestore Emulator. No modifica el contenido económico del
preparador ni sus checkpoints. Se ejecutó después del cierre del emulador del
bloque administrativo, y V2 usa otro emulador después de cerrar el del preparador.

La comprobación SHA-256 de los 379 archivos preexistentes mantiene 371 intactos;
ocho cambian dentro del alcance autorizado. Se añaden descriptor 4, registro
histórico de pruebas admin-3 y este documento: once archivos en el diff acotado.
Adaptadores, cinco módulos del preparador, acreditador, transición, inventarios
históricos, Work, reglas y Flutter permanecen intactos. Índice y HEAD conservan
también sus bytes; rama `integration/adora-live`, HEAD `01223cd990312677ebbef2892ae7e99b1109e272`.

V2 aislado aprobó **39/39**: su comprobación de fuentes reconoce admin-4 y
conserva las pruebas de escritor, autorización, concurrencia y recibos. Con ello,
los 22 rechazos anteriores quedan resueltos sin suprimir casos. No hubo fallos,
cancelaciones u omisiones en las corridas finales.

`node --check` aprobó los cinco JS de pruebas/ejecutores modificados. No se
hicieron despliegues, instalaciones, commits, cambios de rama, migraciones
reales o activaciones administrativas. La siguiente etapa continúa pendiente
de autorización y diseño; estas pruebas no acreditan una migración de producción.
