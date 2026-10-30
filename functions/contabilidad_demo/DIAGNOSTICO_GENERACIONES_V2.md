# FIN-7C.4E.1C — Diagnóstico y bloqueo de acreditación

Estado: detenido ANTES de implementar código. Solo se agrega este documento.
No se crean generador, fuentes administrativas, inventario admin-4, checkpoints,
generaciones o activaciones. Se mantienen los archivos y contratos existentes.

## Bloqueo concreto

El cálculo de una proyección inicial compatible es posible con las bibliotecas
existentes. El bloqueo previo es cómo acreditar y ejecutar la NUEVA herramienta
sin presentar admin-3 como identidad de código que nunca incluyó.

En `fuentes.js:57-59` el conjunto de módulos administrativos en la raíz es
exactamente `fuentes.js`, `transicion.js`, `entorno.js`. Un cuarto JS produce
`DEMO_RUNTIME_NO_ACREDITADO`, incluso antes de cargar el descriptor. Un descriptor
nuevo no puede añadirlo: `fuentes.js:72-73` exige exactamente esas tres claves y
sus hashes contra los archivos actuales. El recorrido de fuentes excluye TODO
`contabilidad_demo`, por lo que colocar el generador en una subcarpeta no lo
acredita. Que esa ubicación no dispare rechazo no significa que esté cubierta.

Agregar el generador como fuente fuera de ese directorio pero bajo `functions`
también cambia el árbol exacto de 23 fuentes y exige otro inventario aprobado.
No se elige esa ubicación como forma de eludir la dependencia.

Modificar el verificador cambia sus propios bytes. Al comprobar compatibilidad,
`cargar` compara los JS actuales con los hashes originales de admin-2 y admin-3.
Con un verificador nuevo, esa comprobación deja de cumplirse. No se soluciona
actualizando los descriptores históricos: eso destruiría sus identidades.
Modificar el motor también rompe la prueba completa del parche de identidad
de nueve sustituciones de `fuentes.js:76-88` y su contrato fijado por hash.

El registro actual no contiene admin-4. No hay todavía fuentes finales ni una
identidad acreditada que cubra el generador adicional. Por eso no se
implementa una herramienta parcialmente operativa ni se simula acreditación para
demostrar escrituras del SDK. Tampoco se amplía automáticamente la lista de JS.

### Comprobaciones sin editar archivos

1. El verificador real reproduce admin-3:
   `4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c`.
2. Seleccionar `admin-4` devuelve `DEMO_INVENTARIO_DESCONOCIDO`.
3. Una vista de listado SOLO en memoria, en un proceso Node desechable, añade
   el nombre de un cuarto módulo administrativo hipotético. El verificador real
   devuelve `DEMO_RUNTIME_NO_ACREDITADO`. No se creó el archivo ni su hash.
4. Restaurado el listado, se reproduce exactamente la misma identidad admin-3.

No es una prueba de un generador nuevo, de una identidad admin-4 ni de una
reanudación con ese software. Es evidencia negativa de la guarda vigente.

## Comparación campo por campo

`I = iglesias/{iglesiaId}` y `G = I/finanzas_generaciones_demo/{generacionId}`.

| Aspecto | Generación D2 actual | Exigencia del escritor V2 |
|---|---|---|
| Documento G | Esquema 2, inventario/huella, procedimiento/algoritmo, corte, huella observada, estado, época, activa=false | Cabecera EXACTA: esquema 2, iglesiaId, época, generacionId, contrato `gastos_v2_aislado_1`, y activa=true al ESCRIBIR |
| Evidencia administrativa | Está en G y ejecución D2 | No cabe como campos extra en G; necesita ejecución/evidencia separadas para respetar `registroExacto` |
| Protocolo | Versión 1, época 1, estado bloqueado | Misma versión, época de intención coincidente y estado operativo_v2 para ESCRIBIR |
| Puntero activo | No existe | `I/finanzas_control/generacion_v2`, con cabecera exacta y generación/época coincidentes |
| Control global de generación | No existe `G/control/libro` | Cabecera, revision, ultimoMovimientoId |
| Consolidado | Reconstrucción global en checkpoint; no documento incremental de G | `G/consolidados/CLP`: cabecera, revision, ultimoMovimientoId, datos con los siete totales globales |
| Saldo | `G/saldos/{id}`: cuentaId, saldoMinor, huboMovimientos, ultimaSecuencia, aperturaRegistrada | Cabecera; proyeccion exacta FIN-7C.4B; huboMovimientos; aperturaRegistrada; solicitudesInciertas |
| Referencia de cuenta | Tiene secuencia del último toque, sin su ID ni período de proyección | Revision del último toque e ID REAL correspondiente; cero/null solo sin historia demostrada |
| Proyección de cuenta | No guarda el estado completo de FIN-7C.4B | Esquema 1, iglesiaId, cuentaId, periodoId, revision, ultimoMovimientoId, saldoMinor, saldoInicialPeriodoMinor, saldoFinalPeriodoMinor |
| Resumen | `G/periodos/{mes}` es resultado FIN-2 con configuración, mapas de saldos y totales | Cabecera, revision GLOBAL, ultimoMovimientoId GLOBAL, periodoId y datos con periodoId más siete totales; sin campos extra |
| Resumen por cuenta | `G/cuentas_periodo/{hash}` | No es leído por el escritor actual; no sustituye su proyeccion de saldo |
| Secuencia | Corte V1 y versiones en ejecución/checkpoint | Revision global = secuencia del corte; próxima escritura suma uno en el mismo commit |
| Período | Hasta 24 períodos explícitos reconstruidos, incluidos cerrados | Solo el período abierto vigente para escribir; resumen/saldo deben corresponder a él |
| Época | Fijada a 1 por D2 y protocolo V1 | Debe coincidir en protocolo, intención, generación, puntero y proyecciones; no se incrementa por conveniencia |

Preparar una generación requiere `activa:false`, sin puntero activo y protocolo
bloqueado. Por tanto, ser compatible en estructura no la hace ESCRIBIBLE: el
adaptador debe continuar rechazándola. No se cambia temporalmente a operativo_v2
para validar una salida administrativa real de este procedimiento.

## Otras restricciones verificadas

`crearTransicionDemo.iniciar` no sirve como generador de segunda generación:
exige operativo_v1 y ausencia de cerrojo, ejecuciones y generaciones. Una D2
existente deja protocolo bloqueado y conserva esos documentos. Reutilizar su
ejecucionId, liberar su cerrojo o modificarla para hacer pasar el preflight
violaría la conservación exigida. Se necesita una operación separada.

`conciliacion.js` valida secuencias, reversas, aperturas, clasificaciones,
versiones, saldos, resúmenes y marcadores. Su salida reduce las referencias
incrementales: no expone todos los `ultimoMovimientoId` por cuenta o estados
completos de FIN-7C.4B. No corresponde rellenarlos con el último movimiento
global. Deben obtenerse del libro reconstruido y sus asientos reales.

La reconstrucción y comparación conservan `certificacionHistorica:false`.
Ni un hash, ni el saldo materializado ni la declaración de pausa demuestran
ausencia de un cliente Admin externo. El emulador no prueba IAM. La exclusión
administrativa sigue siendo una precondición de custodia local explícita.

## Cambio mínimo recomendado antes del generador

La ampliación existente SÍ permite una solución futura sin cambiar el verificador:
ubicar módulos nuevos en `functions/contabilidad_generaciones_v2_demo/`, que no
está excluida del recorrido, y acreditarlos mediante `adicionales` de un descriptor
posterior admin-4. No es una imposibilidad de compatibilidad; es una dependencia
de acreditación pendiente. No hace falta crear un cuarto JS en la raíz antigua.

Esta es la opción mínima recomendada. La entrega debe coordinar código final e
inventario revisado antes de su ejecución. El descriptor deberá conservar todos
los hashes base y administrativos existentes, incorporar los hashes REALES de
cada módulo nuevo y declarar explícitamente legado-1, admin-2 y admin-3 como
compatibles solo para reanudar su procedimiento D2 original. El verificador ya
comprueba que el árbol actual completo coincida y que las fuentes compartidas
no cambien. No se registra aquí admin-4 ni se inventan hashes para código futuro.

El procedimiento nuevo debe tener identidad de operación, ejecución/checkpoint
y evidencia propios. No debe interpretar un checkpoint D2 como si hubiera sido
creado por el nuevo preparador. Fuentes, transicion, entorno e inventarios
históricos pueden permanecer idénticos, sin introducir ciclos de hashes:
el descriptor contiene hashes de módulos que no contienen su propio hash;
el registro fija el descriptor; las identidades anteriores no incorporan entradas
posteriores del registro. La fórmula de inventario puede seguir siendo la de E.0B.

Con el registro actual, agregar esos archivos antes de acreditar admin-4 hace
que admin-3 rechace el árbol ampliado. No se obtiene permiso de ejecución por
dejar la incorporación en una propuesta o pasando `inventarioId:'admin-4'`.
Tampoco se simula una aceptación de fuentes para demostrar escrituras reales.
El paso mínimo siguiente es una entrega coordinada del preparador y acreditación
admin-4, o dos fases explícitas de código inactivo y acreditación posterior antes
de ejecutar SDK. Esta fase se detiene conservando operativa la base admin-3.

Una alternativa que extienda el verificador actual necesita archivar/verificar
los bytes admin-2/admin-3 y una nueva prueba cerrada de compatibilidad del
verificador. Es un cambio más amplio y no se aplica como parche de este paso.

## Procedimiento propuesto, todavía NO implementado

1. Preflight acreditado, demo-fesync y host local exactos, sin credenciales;
   SDK explícito sin ADC, emulador dedicado y custodia de escritores declarada.
2. Exigir D2 origen terminal verificada e inactiva, protocolo bloqueado/época 1,
   ejecución y generación históricas coherentes y versiones/corte intactos.
   Si está incompleta, recuperar D2 con su herramienta acreditada; no transformarla.
3. Crear ejecución NUEVA y cerrojo de preparación independientes por iglesia;
   fijar operador, generación destino distinta, fuente D2, versiones, corte,
   período abierto y límites. Nunca tomar ni cambiar el cerrojo D2 original.
4. Leer libro V1 paginado en orden (secuencia, ID), con cursor exclusivo. Volver
   a validar en cada lote el mismo protocolo, corte y versiones de la fuente.
   Mantener límites acotados iniciales V1 50/50/200; no truncar silenciosamente.
5. Usar `conciliarPaginas` para rechazar fuentes, saldo/resumen o marcadores
   incoherentes y para volver a validar el checkpoint en cada reanudación.
   No copiar la reconstrucción de un checkpoint modificado sin revalidarla.
6. Reconstruir el estado incremental del único período abierto mediante
   `crearProyeccionInicial`, `crearSaldoInicial` y `proyectarMovimiento`.
   Pasar cada movimiento completo y, en reversas, su original y secuencia reales.
   No excluir el original además de aplicar su reversa ni duplicar fórmulas.
7. Derivar revisión global/última referencia del último documento del corte;
   revisión/última referencia por cuenta del último asiento que la toca.
   Saldos inicial/final, consolidado y siete totales se cotejan con FIN-2.
   Exigir período abierto no anterior a movimientos del corte; un futuro período
   en el historial impediría igualar saldo global y saldo final del período.
8. Preparar G destino con cabecera exacta y `activa:false`; control, consolidado,
   resumen del período y saldos con sus referencias exactas. Guardar evidencia
   y estado del proceso en ejecución privada aparte, no como campos extra de G.
9. Escribir lotes pequeños y acotados con `create`, nunca sobrescribir destinos;
   lecturas antes de escrituras, checkpoint/lote/fence en el mismo commit.
   Dos operadores no comparten capacidad; dos avances del mismo fence deben
   recuperar un solo lote. Sin TTL, takeover o desbloqueo automático.
10. Verificación completa contra el mismo corte y conjuntos exactos de documentos.
    Una divergencia conserva evidencia y bloqueo, sin reparar importes o D2.
    Repetir un lote confirmado devuelve historia sin duplicar IDs/documentos.
11. Finalizar solo como preparada/verificada INACTIVA. Mantener protocolo y
    ausencia de puntero activo. Activación y escritura V2 quedan fuera del alcance.

No basta comprobar que salió un documento con campos parecidos. Una futura
herramienta debe demostrar derivación desde el mismo corte y correspondencia
exacta de todos los documentos de salida sin cambiar las fuentes.

## Archivos futuros, no creados

- `functions/contabilidad_generaciones_v2_demo/preparacion.js`: nuevo proceso
  con dependencias inyectables, relecturas transaccionales, lotes y fencing.
- `functions/contabilidad_generaciones_v2_demo/entorno.js`: guardas cerradas,
  reutilizando las existentes donde corresponda, sin ampliarlas.
- `functions/contabilidad_demo/inventarios/runtime_4.json`: descriptor posterior
  propuesto, solo con hashes reales una vez revisadas las fuentes finales.
- `functions/contabilidad_demo/inventarios/registro.json`: futura incorporación
  explícita de admin-4, sin editar entradas o descriptores históricos.
- `functions/test/finanzas_generaciones_v2_demo.test.js`: pruebas aisladas puras
  y de concurrencia con dobles.
- `test/finanzas_generaciones_v2_demo/`: integración SDK real y ejecutor protegido.

No se propone editar adaptadores, bibliotecas FIN-2 a FIN-6, proyecciones,
conciliación, protocolo, reglas, Flutter o Work. Tampoco los inventarios históricos.

## Matriz de aceptación pendiente

| Escenario nuevo | Resultado necesario, aún no demostrado |
|---|---|
| D2 origen | Datos, checkpoint, referencias y updateTime originales intactos |
| Seis clases de movimientos y reversas entre períodos | Igualdad con FIN-2 y proyecciones, sin doble aplicación |
| Referencias globales y por cuenta | IDs/secuencias reales; cero/null solo para historia vacía |
| Saldo/resumen corrupto, hueco de secuencia o movimiento incoherente | Rechazo, evidencia y bloqueo; sin reparación |
| Checkpoint manipulado | Revalidación rechaza, sin adoptar corte o fuente nuevos |
| Dos operadores / mismo fence | Una propiedad, un lote y replay sin duplicación |
| Interrupción antes/después de commit | Misma identidad, selección y fence originales |
| Nueva generación | Esquema V2 exacto pero inactiva; sin puntero o cambio a operativo_v2 |
| Identidad no acreditada | Rechazo antes de SDK; ninguna escritura |
| Legado/admin-2/admin-3 | Bytes e identidades conservados, sin reetiquetado |

Las regresiones existentes no acreditan estos escenarios de una herramienta que
no existe. Se distinguen las validaciones de la base actual de las pruebas
bloqueadas por falta del contrato/acreditación de la nueva operación.

## Validación de esta fase

Se ejecutaron las suites existentes, sin modificar código ni pruebas:

| Suite realmente ejecutada | Aprobadas | Fallidas/omitidas |
|---|---:|---:|
| npm.cmd test completo | 1.732 | 0 |
| Compatibilidad histórica, Firestore Emulator real | 19 | 0 |
| Administrativas D2, Firestore Emulator real | 28 | 0 |
| Integración/guardas/verificador FIN-7 | 211 | 0 |
| Reglas financieras, ejecutadas por el verificador anterior | 46 | 0 |
| Suite V2 aislada con guardas e inventario | 39 | 0 |

Las 46 reglas son una suite anidada invocada por el verificador incluido en las
211: las cifras no se suman como si fueran pruebas independientes del ejecutor.
La suite V2 incluye 12 guardas locales y 27 escenarios; uno de estos últimos
valida fuentes y los otros 26 tienen comprobaciones SDK reales sobre fixtures.
Node incluye pruebas con dobles: no se presentan como integración de Firestore.

Se ejecutó primero el bloque administrativo/FIN-7 y, tras cerrar su emulador,
V2 aislado en otro emulador dedicado. Solo demo-fesync, datos ficticios, sin
credenciales, FCM o Firebase real. PERMISSION_DENIED de casos negativos y SIGINT
del cierre normal tras código 0 no son fallos ocultados. No hubo repetición
artificial de una prueba fallida.

`node --check` pasó en los ocho JS inspeccionados (dos adaptadores, proyecciones,
conciliación, protocolo, fuentes, transición y entorno). No hay JS nuevos o
modificados. Los 366 archivos preexistentes conservan su SHA-256. Solo se añade
este documento; rama integration/adora-live y HEAD 01223cd se conservan, sin
staging ni commits. El diff se limita a documentación.

Las pruebas del NUEVO preparador no se implementaron ni ejecutaron: quedan
pendientes por la dependencia de acreditación descrita. No se atribuye a esta
fase una generación compatible creada, un lote nuevo recuperado, admin-4
acreditado o una activación administrativa. El resultado es un diagnóstico
verificado y una propuesta de siguiente entrega coordinada, no FIN-7C.4E.1C
implementado como herramienta operativa.
