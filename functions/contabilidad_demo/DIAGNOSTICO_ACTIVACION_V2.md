# FIN-7C.4E.1D — Bloqueo por evidencia de procedencia

Estado: **detenido antes de implementar un verificador o modificar software**.
Se añade solamente este diagnóstico. No se crean generaciones, comprobantes,
inventarios, identidades, endpoints o activadores en este paso. Las pruebas
existentes utilizan sus propios datos ficticios y emuladores desechables.

## Decisión

**No hay una generación cuya elegibilidad para activación pueda acreditarse con
el contrato actual.** Esto no afirma que se haya consultado un inventario de
generaciones de producción: no se accede a Firebase real. Puede demostrarse
coherencia matemática de una generación preparada en demo, pero falta el vínculo
persistido y verificable entre esa generación y el runtime que la preparó.

Se aplica la condición de parada expresa del paso: si falta evidencia de
procedencia o se requiere cambiar archivos acreditados, documentar el cambio
mínimo antes de modificar código. Un verificador de solo lectura podría emitir
«datos consistentes; procedencia no acreditada», pero no cumplir el caso positivo
de elegibilidad solicitado. No se implementa una aceptación parcial presentada
como elegibilidad ni un verificador que copie el resultado del preflight actual
como si certificara retrospectivamente una ejecución anterior.

## Significado exacto de PENDIENTE

`contabilidad_generaciones_v2_demo/preparacion.js` exige siempre
`acreditacion === 'PENDIENTE'`, incluso en una ejecución terminada. Su estado
operativo puede ser `conciliando`, `preparando`, `preparada` o `fallida`.
Por tanto, `PENDIENTE` no significa necesariamente que falten documentos:
`estado: 'preparada'` indica que el contrato aislado completó sus controles,
pero **no es un certificado de procedencia de software ni permiso de activación**.

El sobre no contiene `huellaSoftware`, `inventarioId`, versión de contrato de
inventario ni los campos raíz `versionProcedimiento` / `versionAlgoritmo`. Sí contiene
`procedimiento: 'preparacion_v2_aislada_1'`, esquema 1 y un checkpoint anidado
del conciliador con `versionAlgoritmo: 1`. Esa versión identifica la conciliación
pura; no identifica el software administrativo que generó los documentos V2.
El hash `identidad` vincula parámetros/capacidad del operador, no código.

El preflight admin-4 de los ejecutores acredita los bytes actuales antes de
arrancar/importar SDKs. Su resultado no se almacena junto a la ejecución,
cerrojo o generación. Ejecutarlo ahora no demuestra quién creó un documento
ya existente. La igualdad de datos reconstruidos tampoco acredita su creador.
Un Admin externo puede escribir datos iguales o falsificar campos; el emulador
no demuestra IAM ni exclusión física de ese Admin.
Agregar identificadores en una fase posterior tampoco convertiría esa evidencia
en firma externa o prueba contra un Admin malicioso; seguiría dependiendo de
fuentes revisadas y custodia efectiva del ensayo.

`registroExacto` del preparador rechaza campos adicionales y su comparación
exige PENDIENTE. Añadir al sobre una huella o cambiar esa etiqueta manualmente
rompería el contrato y la recuperación. No se realiza esa modificación.

## Comparación de contratos vigentes

`I = iglesias/{iglesiaId}` y `G = I/finanzas_generaciones_demo/{generacionId}`.

| Aspecto | D2 administrativo | Preparador aislado | Escritor V2 / falta para elegibilidad |
| --- | --- | --- | --- |
| Identidad de software | Huella, inventario y contrato en ejecución/G; legado sin etiquetas bajo reglas específicas | No persistida; preflight externo admin-4 | El escritor no verifica procedencia administrativa; debe validarse antes de activar |
| Algoritmo | Procedimiento/algoritmo 1 explícitos | Procedimiento textual; algoritmo 1 en conciliador anidado | Falta identidad/versionado del procedimiento de preparación vinculado a evidencia |
| Estado terminal | `verificada` y G inactiva | `preparada`, acreditación PENDIENTE, G inactiva | No existe un contrato de aprobación/activación que una ambos estados |
| Generación | ID derivado de ejecución D2 | ID destino explícito, nuevo y distinto | Cabecera exacta de esquema 2, iglesia, época, generación, contrato `gastos_v2_aislado_1` |
| Época | 1 | 1 | Debe coincidir con protocolo, intención, puntero y todos los documentos |
| Corte | Secuencia V1 y versión exacta del control, manifiesto | Mismo corte revalidado por transacción y checkpoint | Falta recibo versionado de verificación final ligado a ejecución/generación/runtime |
| Revisión global | Reconstrucción D2; salida distinta de V2 | Control, consolidado y resumen con revisión/último ID global reales | Coincidencia exacta entre esos tres; no rellenar desde saldo materializado |
| Revisión de cuenta | Última secuencia sin proyección V2 completa | Último movimiento que toca cada cuenta, con su ID | Coincidencia con libro y proyección del período abierto |
| Períodos | Resúmenes D2 y cuentas por período | Concilia historia y materializa período abierto V2 | No copiar resúmenes D2 como si fueran el esquema incremental V2 |
| Fencing | Cerrojo D2 y propietario propios | Cerrojo de preparación y propietario propios | No intercambiar capacidades ni adoptar el checkpoint del otro procedimiento |
| Vinculación D2 | Identidad y estado de su propia ejecución | Observa padres D2 en el manifiesto; no acredita una ejecución D2 concreta como origen | Si D2 es precondición de activación, validar referencia, identidad, estado, corte y versión explícitos |

`activa:false` es la condición correcta antes de activar, no un defecto del
formato preparado. El bloqueo de elegibilidad es la evidencia ausente y el
contrato de activación aún no implementado.

El preparador reconstruye mediante `conciliacion.js` y `proyecciones.js`;
comprueba V1, recibos reales, reservas, aperturas, marcadores, saldos y resúmenes.
Revalida el checkpoint contra el prefijo real y comprueba los documentos exactos
del destino antes de ratificar `preparada`. Esto es evidencia de coherencia de
datos en un corte, no procedencia acreditada. El conciliador conserva
`certificacionHistorica: false`.

`fuentes.comprobarEjecucion` solo admite sobres D2 con su contrato original.
Rechaza el sobre del preparador. Copiarle los metadatos de D2 no es integración
compatible: falsearía la procedencia y mezclaría algoritmos y formatos.

## Protocolo y caminos de escritura

| Escritor | Rutas / control relevante |
| --- | --- |
| Adaptador V1 | Cuentas, categorías, reservas, aperturas, movimientos, saldos, resúmenes, control, marcadores, auditoría y recibos; todas sus nuevas operaciones exigen protocolo `operativo_v1` en la misma transacción |
| D2 `transicion.js` | Protocolo (bootstrap explícito/entrada a bloqueado), cerrojo D2, ejecución y generaciones D2; lotes y fence comparten commit, nunca activa V2 |
| Preparador aislado | `finanzas_preparaciones_v2_demo`, `finanzas_preparaciones_v2_control/cerrojo` y G nueva con control/consolidado/período/saldos; exige bloqueado y ausencia de puntero activo |
| Adaptador V2 | Movimientos compartidos, proyecciones de G, auditoría y recibos; nuevas operaciones exigen `operativo_v2`, puntero coherente y `G.activa === true` |
| Configuración/membresía/roles | Pueden cambiar autorización, pertenencia, acceso, elegibilidad y auditoría administrativa; el bloqueo contable no congela esos datos ni sustituye FIN-3 |
| Admin externo | Puede escribir cualquier ruta directamente; las reglas cliente no protegen frente al Admin SDK |

Los recibos históricos confirmados pueden devolverse sin crear una operación
económica nueva; esa lectura no concede autorización vigente. La exclusión es
operativa, con custodia del emulador, control de versiones y fencing para
escritores cooperantes. No se promete excluir cualquier Admin con un documento
de bloqueo. El listado de nombres de subcolecciones fuera de transacción sigue
requiriendo esa custodia. No se han encontrado activadores en el código productivo
inspeccionado; el estado `operativo_v2` está reconocido como estado, no como
procedimiento de activación implementado.

Las pruebas V2 existentes usan fixtures activas sintéticas de un emulador
desechable. Sus gastos no constituyen activación administrativa de generaciones
del preparador. Una nueva operación V2 sigue rechazándose bajo bloqueo; V1
también debe rechazar nuevas operaciones mientras esté bloqueado.

## Cambio mínimo propuesto, no implementado

1. Definir un sobre NUEVO de preparación con procedimiento/esquema versionados,
   huella e inventario del runtime de creación, versión del algoritmo, iglesia,
   ejecución, generación, época, operador/fence y corte/versiones originales.
   Crear generaciones nuevas; conservar íntegros los sobres PENDIENTE y D2.
2. Verificar fuentes antes de SDK y capturar identidad antes de la transacción;
   guardar la vinculación al crear la nueva ejecución. No usar el runtime del
   verificador futuro como identidad de creación de registros antiguos.
3. Definir evidencia final privada, ligada atómicamente al mismo checkpoint,
   fence, corte y conjunto exacto de documentos/versiones verificados. Si D2
   es origen exigido, ligar su ejecución/estado/identidad/versiones explícitos.
   No añadir campos a G incompatibles con su cabecera estricta V2.
4. Implementar después un verificador de solo lectura: revalidar fuente/corte,
   conciliación, recibos/marcadores, destino exacto, origen/evidencia y protocolo
   bloqueado sin puntero. Ante ausencia, divergencia o error de lectura denegar;
   diferenciar «no acreditable» de «divergente» y de error de infraestructura.
5. Mantener el protocolo, la época, el bloqueo, los límites 50/50/200 y
   `activa:false`. Un informe de elegibilidad tendría validez solo para versiones
   concretas; una activación posterior debe volver a validarlas en su commit.

Agregar campos a `preparacion.js` o modificar cualquier módulo acreditado
invalidaría admin-4. Agregar un nuevo JS bajo functions también cambia su árbol
exacto. Se requiere una identidad posterior revisada (candidata admin-5, aún
inexistente y sin hash) y una política de compatibilidad explícita. No basta
crear otro descriptor que cambie hashes de las fuentes compartidas: el contrato
vigente exige igualdad de esas fuentes al aceptar historia anterior. Preferir
un procedimiento nuevo separado y conservar los módulos admin-4 byte por byte
para que la ampliación pueda mantener su compatibilidad. Esa propuesta requiere
un alcance posterior antes de implementar/acreditar el nuevo código.

Archivos candidatos futuros: módulos nuevos de preparación/evidencia/verificación
en un directorio privado separado, pruebas aisladas, un descriptor posterior y
registro revisado. Si se eligiera modificar `contabilidad_generaciones_v2_demo/
preparacion.js`, haría falta además diseñar cómo verificar y ejecutar el runtime
histórico sin reinterpretarlo. No se propone editar adaptadores, economía,
reglas, Flutter, Work o inventarios anteriores.

Una división concreta para revisar sería
`functions/contabilidad_preparacion_acreditada_demo/{preparacion,evidencia,verificacion}.js`,
su suite aislada y `contabilidad_demo/inventarios/runtime_5.json` con actualización
revisada del registro. Son nombres propuestos, no archivos creados o acreditados.
Los ejecutores que seleccionan expresamente admin-4 también requerirían una
transición explícita para ejecutar otro árbol ampliado; no deben convertirse
en un selector automático que acepte cualquier inventario nuevo.

## Ensayo de activación reversible pendiente

Falta especificar y autorizar una operación privada demo separada que valide la
evidencia, fuente, revisiones, protocolo, capacidades y versiones en un commit
atómico de activación. No se diseña como tres escrituras independientes de
protocolo/puntero/activa. Debe tener idempotencia, fencing, recuperación de
respuesta perdida y comprobación posterior, sin efectos externos en el callback.

La reversibilidad no puede prometerse simplemente volviendo a `operativo_v1`:
V2 escribe el libro compartido pero actualiza proyecciones/control de G, no las
proyecciones/control V1 originales. Antes del primer movimiento V2 podría
examinarse una retirada controlada si se demuestra que el corte no cambió.
Después de un commit económico V2, bloquear y conciliar; hacen falta otro
procedimiento y pruebas para volver a V1. No borrar movimientos, recibos ni
restaurar proyecciones viejas sobre historia nueva. Tampoco incrementar época
por conveniencia: V1 y los preparadores actuales están limitados a época 1.

Hay otra incompatibilidad concreta para recuperación después del primer gasto:
`finanzas_core/conciliacion.js`, en `normalizar`, exige documentos históricos
con `versionEsquema === 1`; el escritor V2 crea movimientos de esquema 2.
El conciliador actual no acredita un libro mixto V1/V2. Antes de un ensayo que
incluya escrituras V2 hace falta un lector/conciliador versionado apropiado y
pruebas de recuperación sobre ambos esquemas. No cambiar etiquetas históricas
ni presentar un documento esquema 2 como si fuera esquema 1 para eludirlo.
Esta fase no modifica ese conciliador ni duplica su lógica económica.

Pruebas futuras necesarias: procedencia válida del procedimiento nuevo y
negativos para PENDIENTE, origen desconocido, generación parcial, alteración de
huellas/corte/versiones/iglesia/época; divergencias y documentos extra/ausentes;
dos operadores; commit con respuesta perdida; exclusión de escritores y cambio
de autorización; activación atómica y retirada antes/después del primer gasto,
con los límites anteriores. Estos casos positivos de elegibilidad/activación
NO se implementan ni se atribuyen a las regresiones existentes de este paso.

## Validación de esta fase

Se ejecutaron regresiones existentes sin cambiar código o pruebas:

| Suite ejecutada en este paso | Aprobadas | Fallidas / omitidas |
| --- | ---: | ---: |
| `npm.cmd test` completo | 1.745 | 0 / 0 |
| Compatibilidad histórica con Firestore real | 23 | 0 / 0 |
| Administrativas D2 con Firestore real | 28 | 0 / 0 |
| FIN-7, integración/guardas/verificador | 211 | 0 / 0 |
| Reglas financieras anidadas en FIN-7 | 46 | 0 / 0 |
| Integración V2 aislada existente | 39 | 0 / 0 |

Las 46 reglas no se suman a las 211 como si fueran otra ejecución del verificador.
El bloque administrativo/FIN-7 comparte secuencialmente un único emulador
dedicado demo-fesync y luego lo cierra. V2 usa otro emulador después de ese cierre;
terminó con código 0, sin omisiones o cancelaciones. No se presenta una suite anterior ni
un fixture activo V2 como prueba de elegibilidad del preparador.

`node --check` pasó sobre diez JS existentes de referencia (cinco del preparador,
fuentes/transición/entorno administrativos, protocolo y adaptador V2). No hay
verificador nuevo al que atribuir compilación o pruebas. Las pruebas nuevas
de elegibilidad quedan bloqueadas, no omitidas mediante cambios al ejecutor.

Se revisó el TAR privado anterior de C.2: SHA-256
`dd71a9bc4270c49f9181d893e474f7b6f75073745a0efc950d3b77f2bde3e70a`
coincide. Ese respaldo es previo a la acreditación admin-4, no una imagen actual
post-C.2. Para este diagnóstico se censaron los 382 archivos actuales antes de
editar; su SHA-256 permanece intacto. Solo se añade este documento.
Rama `integration/adora-live` y HEAD `01223cd990312677ebbef2892ae7e99b1109e272`
conservados, junto al índice y los cambios locales previos. Admin-4 sigue siendo
`1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7`;
no se registró otra identidad ni se modificó inventario alguno.

Los `PERMISSION_DENIED` de escrituras cliente negativas son esperados y el SIGINT
corresponde al apagado del emulador tras éxito. No hubo despliegue, producción,
instalaciones, commits o migraciones reales. El bloqueo de contrato sigue vigente
aunque las regresiones sean satisfactorias.
