# FIN-7C.4E.1B — Acreditación local admin-3, sin activación

## Decisión revisada

Se incorpora únicamente `finanzas_core/adaptador_firestore_v2.js` a un descriptor
nuevo `inventarios/runtime_3.json`. Se selecciona `admin-3` para nuevas ejecuciones
en `inventarios/registro.json`, conservando la entrada y bytes de `runtime_2.json`.
No se modifican `fuentes.js`, `transicion.js`, `entorno.js`, `fuentes_v1.json`,
el parche de identidad, los bytes históricos ni ningún escritor financiero.

El inventario exacto contiene las 22 fuentes base más una adición. Las dependencias
JS del adaptador (`dinero`, `operaciones`, `proyecciones` y sus dependencias)
ya están en esas 22 fuentes. El descriptor verifica además los tres JS
administrativos, el archivo histórico, inventario base y contrato de identidad.
No hay import de V2 desde el runtime administrativo, index, V1 o sus dependencias.
Los ejecutores y pruebas no forman parte del inventario productivo de fuentes.

El código V2 fue revisado sin modificarlo: solo gasto, reutilización FIN-3/FIN-5
y proyecciones puras, lecturas documentales transaccionales antes de escrituras,
precondiciones de época/generación, autorización vigente, recibos propios y sin
efectos externos. No contiene inicialización Admin, endpoint ni activador.
Continúan todos sus límites y dependencias de integridad histórica de E.1A.

## Huellas y reproducción

| Objeto | SHA-256 / identidad |
|---|---|
| Adaptador V2, bytes reales | `f6accb70c8fd0f9aceec554ae7860421d08eac0343f6ee7f572020208d1bdab2` |
| Descriptor runtime_3.json | `0bf0d7d73ffa3fe8eb9a1e1e913d4dec5041983a1766ae3b26c58ddd44c58fdf` |
| Identidad admin-3 | `4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c` |
| Descriptor admin-2, conservado | `c4d3279e32bacb8514f54f076614dfe0d7505238e85f6b2789c5de4dc807e1a4` |
| Identidad admin-2, conservada | `0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f` |
| Identidad legado-1, conservada | `76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d` |
| fuentes_v1.json, conservado | `8687f7eb5798728deea4b43cd6f32f9c664889c0f926f46a7d22c1270efd90a4` |

Se midió el adaptador existente, se escribió el descriptor explícito con ese
hash y los mismos componentes administrativos/base del descriptor 2; después
se midió el descriptor 3 para registrarlo. No se regeneraron hashes anteriores
o huellas persistidas. No se acreditó código inexistente o una ruta comodín.

La fórmula del contrato permanece:

```text
SHA256("fesync-inventario-runtime-2\0" || bytes(descriptor seleccionado)
       || bytes(entorno.js) || bytes(fuentes.js) || bytes(transicion.js))
```

El orden administrativo es lexicográfico. La versión de contrato continúa en 2:
no hay nueva semántica de identidad o de transición. `admin-3` es otra identidad
de contenido, no una reutilización nominal de `admin-2`. La comprobación real:

```powershell
node -e "console.log(require('./functions/contabilidad_demo/fuentes').obtenerContextoFuentes())"
```

El registro no participa en la fórmula de una identidad. El descriptor referencia
hashes de código que no contienen su propio hash ni el del descriptor. No se
modificó el código acreditador, por lo que no aparece ciclo de autorreferencia.
El registro y código revisados son raíz de confianza local, no firma externa;
no resisten a quien pueda sustituir todo el árbol y sus referencias.
No se acreditan binarios Node, SDK instalado o node_modules por esta fórmula;
no se alteraron dependencias ni lockfiles. La validación usa Node v24.20.0 y
las dependencias existentes. Una publicación necesita controles adicionales.

## Compatibilidad cerrada

| Identidad persistida | Runtime admin-3 |
|---|---|
| Legado original sin etiquetas, huella exacta en ejecución y generación | Admite solo esquema/procedimiento/algoritmo originales, época 1, ruta coherente y generación inactiva |
| admin-2 con etiquetas y huella original exacta | Admite bajo el mismo contrato original; conserva identidad y contenido histórico |
| admin-3 con etiquetas y nueva huella exacta | Admite nuevas ejecuciones con el mismo motor D2 y generaciones inactivas |
| Huella desconocida, etiquetas parciales, época/ruta/contrato distintos | Rechaza sin reparación automática |

La aceptación exige TODOS los bytes del árbol actual acreditados por admin-3,
además de validar íntegramente los descriptores anteriores y conservar todas
sus fuentes compartidas. No basta una coincidencia parcial o número de versión.
Una fuente nueva no registrada o cualquier fuente alterada vuelve a rechazar.

Seleccionar explícitamente `inventarioId:'admin-2'` en el árbol ampliado rechaza:
ese runtime espera 22 fuentes y aquí hay 23. La recuperación de datos admin-2
se hace seleccionando admin-3, que acredita explícitamente su compatibilidad;
no se devuelve la huella vieja como si fuera la del runtime actual.

`iniciar` histórico sigue siendo lectura, sin cambiar updateTime. `avanzar`
realiza únicamente progreso ordinario con el mismo fence, corte, selección y
propietario; conserva identidad e inventario originales. No hay migración o
reetiquetado de checkpoints, recibos o generaciones. Las identidades no
acreditadas conservan el procedimiento de recuperación conservadora de
COMPATIBILIDAD_INVENTARIOS.md, sin quitar guardas ni copiar huellas.

## Tratamiento individual de los 15 fallos E.1A

| Prueba anterior | Resolución legítima |
|---|---|
| V1 reproduce bytes originales / identidad actual distinta | La nueva fuente queda acreditada; expectativa de identidad actual pasa a admin-3 |
| Identidad sin mutar, legado=false | Solo acreditación; se conserva comprobación negativa y de inmutabilidad |
| Identidad sin mutar, legado=true | Solo acreditación; se conserva huella histórica |
| Histórico alterado: huella desconocida | Solo acreditación; el checkpoint alterado sigue rechazado |
| Histórico alterado: iglesia | Solo acreditación; sigue rechazado |
| Histórico alterado: época | Solo acreditación; sigue rechazado |
| Histórico alterado: algoritmo | Solo acreditación; sigue rechazado |
| Histórico alterado: procedimiento | Solo acreditación; sigue rechazado |
| Histórico alterado: generación activa | Solo acreditación; sigue rechazada |
| Histórico alterado: etiqueta parcial | Solo acreditación; sigue rechazada |
| Histórico alterado: inventario falso | Solo acreditación; sigue rechazado |
| Ampliación sintética acreditada | La fixture extiende admin-3 conservando su V2 ya acreditado y declara compatibilidad anterior; no elimina el caso de JS desconocido |
| V2 pendiente / archivo inexistente | Expectativa obsoleta sustituida por existencia y SHA real acreditado, con descriptor admin-2 intacto |
| Guardas sin red / construcción del runtime | Solo acreditación; guardas originales intactas |
| Inventario revisado coincide con fuentes | Solo acreditación; igualdad exacta intacta |

En la suite aislada V2, el caso de rechazo del archivo no acreditado también
quedó obsoleto: ahora verifica admin-3. Se mantienen y amplían negativos para
archivos adicionales no acreditados y alteración de cada fuente, incluido V2.
La prueba de parche económico diferente conserva su rechazo, dirigiendo su
fixture de descriptor al runtime actual, sin modificar el contrato de parches.

## Pruebas históricas auténticas y límites

Las pruebas crean checkpoints ficticios nuevos en un Firestore Emulator dedicado
usando los bytes originales del legado y admin-2, y después los reanudan bajo
admin-3. No fabrican historia sustituyendo huellas de ejecuciones actuales.
`test/registro_admin2.json` es una copia exacta del registro capturado ANTES de
esta acreditación, SHA-256
`f870f107f5ce281755d73227343aae673159ca912ff2a9575c9edc160a7dfa0b`.

Una VM exclusiva de pruebas presenta al runtime histórico su árbol original de
22 fuentes y registro original. Antes se exige que el verificador ACTUAL valide
las 23 fuentes reales completas, incluido V2. Para admin-2 se cotejan además
sus tres JS administrativos contra el descriptor original y se reproduce su
identidad exacta conocida. La vista histórica no se usa en código operativo,
ni cambia filtros, guardas o inventarios del verificador actual.

Se prueban lectura sin reescritura, interrupciones antes/después de commit,
misma clave/fence, competencia de operadores y dos avances, huellas desconocidas
y ruta/época/protocolo/checkpoint incoherentes. Los errores y pérdida de respuesta
son inyecciones explícitas sobre SDK real. No se demuestra todo intercalado,
durabilidad tras matar procesos o exportación/importación de updateTime.

## Generaciones D2: incompatibilidad conservada

La acreditación no cambia la salida D2. Continúa en `activa:false`, protocolo
bloqueado y sin puntero activo. Sus `saldos` solo contienen cuenta, saldo,
apertura/historial y secuencia; faltan las proyecciones y referencias completas
de E.1A. Sus resúmenes FIN-2 tampoco son el estado incremental exacto esperado.
El adaptador V2 sigue rechazando estos datos. No se rellenan campos, inventan
IDs/revisiones, acreditan procedencias o activan generaciones.

Un paso posterior deberá diseñar y verificar, bajo bloqueo y mismo corte:

1. Cabeceras y contrato V2 explícitos para generación y eventual puntero.
2. Control global y consolidado con revisión/secuencia e ID último acreditados
   por la reconstrucción; no inferidos solo de saldos materializados.
3. Resumen del único período abierto y saldos por cuenta compatibles con
   `proyecciones.js`: revisiones/última referencia reales, saldos inicial/final
   del período, apertura e incertidumbres acreditables. Cero/null solo si la
   ausencia histórica está demostrada.
4. Conciliación contra libro, recibos, corte y versiones originales, detección
   de divergencias y confirmación de exclusión de todos los escritores.
5. Un procedimiento de activación separado, autorizado y probado. No se
   implementa ni ejecuta aquí. La acreditación de código no autoriza esa acción.

Los fixtures activos de E.1A siguen siendo exclusivamente datos sintéticos de
pruebas aisladas. No representan activaciones administrativas o una migración.

## Validación

Ejecutores secuenciales, exclusivamente demo-fesync, sin credenciales:

```powershell
cd functions
npm.cmd test
cd ..
node functions/contabilidad_demo/test/iniciar.js
# Esperar su cierre antes de iniciar el siguiente emulador.
node test/finanzas_v2_aislado/iniciar.js
```

Resultados finales, sin fallos, omisiones o cancelaciones:

| Suite | Aprobadas |
|---|---:|
| `npm.cmd test` completo | 1.732 |
| Compatibilidad histórica con Firestore real | 19 |
| Administrativas D2 anteriores con Firestore real | 28 |
| Integración/guardas/verificador FIN-7 | 211 |
| Reglas financieras, ejecutadas por el verificador anterior | 46 |
| V2 aislado, guardas y comprobación de inventario | 39 |

Node incluye diez casos adicionales de acreditación/compatibilidad respecto
de E.1A y sus 54 unitarias V2 con dobles. La suite aislada conserva 12 guardas
locales y 27 escenarios (26 con comprobaciones SDK reales y uno de inventario).
Los 211 FIN-7 incluyen sus guardas y el verificador de las 46 reglas; las cifras
se muestran separadas para no confundir pruebas anidadas con casos independientes.
No se presentan dobles o una verificación de archivos como concurrencia real.

Las tres suites administrativas/FIN-7 se ejecutaron secuencialmente en un
Firestore Emulator nuevo; después de su cierre se ejecutó V2 en otro emulador
nuevo de los mismos puertos. No hubo reintentos artificiales de pruebas fallidas
ni cambios de fuentes/descriptores durante estas corridas. ABORTED y respuesta
perdida son escenarios inyectados expresamente; los reintentos de transacción
del SDK forman parte del mecanismo probado.

`node --check` correcto en los tres JS de pruebas modificados. Los 357 archivos
preexistentes fuera del alcance conservan su SHA-256, incluidos ambos adaptadores,
los tres JS administrativos, inventario base, descriptor admin-2 y Work. Solo
cambian seis archivos autorizados y se añaden descriptor 3, registro histórico
de pruebas y este documento. Rama y HEAD conservados, sin staging ni commits.

Los PERMISSION_DENIED de pruebas negativas fueron esperados; SIGINT corresponde
al cierre normal de los emuladores tras código 0. No se usó producción, deploy,
instalación de dependencias, datos reales o activación administrativa V2.
Este paso acredita fuentes para el ensayo demo, no preparación para producción.
