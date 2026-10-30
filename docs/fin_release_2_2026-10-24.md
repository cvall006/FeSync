# FIN-RELEASE-2 completado en demo-fesync

Se implementó V1 incremental y se demostró **movimiento 200, gasto 201 y reversión
del 201 como 202 con Firestore Emulator**. También se inicializaron 1.001 históricos
sintéticos, se registraron gasto 1.002 y reversión 1.003 y se paginaron los 1.003
movimientos sin duplicados. No se aumentó la constante 200 del adaptador anterior.

## Respaldo, inventarios y alcance

Respaldo de 547 archivos locales no ignorados, diff de trabajo/índice, HEAD, rama
y eliminaciones previas en:
`C:\Users\igles\AppData\Local\Temp\fesync-fin-release2-20261024-203456`.
Se verificaron sus 547 hashes, sin diferencias.
[Verificación](fin_release_2_2026-10-24/respaldo-verificado.json).

Antes de editar se identificó que adaptador original y funciones puras pertenecen
a inventarios históricos. Se conservaron sus bytes. La nueva implementación está
en `functions/test/finanzas_v1_incremental/`, área explícitamente excluida de esos
inventarios, y se conecta únicamente al runtime demo después de una migración
controlada del libro. No se creó admin-7 ni se regeneraron acreditaciones.
[Impacto previo](fin_release_2_2026-10-24/impacto_previo.md).

La comparación final conserva 543 de los 547 archivos iniciales idénticos; solo
cambian cuatro archivos existentes y no se elimina ninguno. Reglas, V2,
preparadores, inventarios, Work, dependencias y `functions/index.js` quedan intactos.
[Integridad](fin_release_2_2026-10-24/integridad.json).

## Implementación y lecturas

Se reutilizan `operaciones.js`, `correcciones.js`, cuentas/categorías, asientos,
`proyecciones.js` y `conciliacion.js`. No hay fórmulas contables alternativas.
La transacción ordinaria lee autorización, protocolo, controles, estado incremental,
resumen y las cuentas/saldos/categoría necesarios; una reversión añade original y
marcador. Movimiento, saldos, resumen, estado, control, auditoría, recibo y marcadores
se confirman atómicamente. No se consulta el historial completo para escribir.

Lecturas de documentos instrumentadas en el SDK, contando también accesos a
documentos ausentes; no constituyen una estimación de facturación:

| Transacción medida | Documentos | Consultas de colección |
| --- | ---: | ---: |
| Escritor anterior: movimiento 200, con 199 históricos | **215** | **4** |
| Escritor incremental: gasto 201 | **15** | **0** |
| Escritor incremental: gasto 1.002 | **15** | **0** |
| Captura previa de intención, titular, gasto 201 | **8** | **0** |

Las 15 lecturas corresponden al escritor, no a toda la llamada: se conserva la
transacción previa de intención y el selector demo añade dos lecturas fuera del
escritor. Los reintentos pueden repetir lecturas. La proyección incluye hasta 50
estados de cuenta, por lo que su tamaño también permanece acotado.
[Medición y resultados](fin_release_2_2026-10-24/emulador.json).

Funcionan las ocho acciones V1: crear cuenta, crear categoría, apertura, ingreso,
gasto, transferencia, ajuste y reversión. Se conservan cupos 50/50, códigos únicos,
apertura única, prevención de sobregiro, enteros seguros, recibos e identidad de
solicitudes anteriores. El original de una reversión permanece intacto y se crea
un marcador único por original.

## Adopción y conciliación

El [procedimiento operativo](fin_release_2_2026-10-24/procedimiento.md) define
pausa, conciliación, inicialización, reanudación y cambio de mes. Inicializar vuelve
a observar el libro completo en una transacción con el escritor pausado; verifica
historial, saldos, resúmenes y marcadores antes de crear el estado incremental.
No sobrescribe movimientos, recibos ni checkpoints. La activación usa **V1 época 2**:
el escritor antiguo de época 1 queda rechazado y no puede dejar la proyección atrasada.

La conciliación posterior es un procedimiento separado. Usa el lector por páginas
y `conciliarPaginas`, compara contra los documentos persistidos y contra el estado
incremental. Se probaron divergencias, documentos sin secuencia y secuencias
duplicadas al borde de una página. Un fallo mantiene el protocolo bloqueado y
rechaza inicializar/reanudar. No hay reparación automática ni reinicialización.

`certificacionHistorica` permanece **false**. El resultado prueba consistencia
observada al corte y la pausa del escritor bajo este protocolo; ni la proyección
aislada ni su checksum acreditan por sí solos toda la historia o su procedencia.

## Paginación y Flutter

Los callables demo seleccionan el escritor por época del protocolo. La fixture
anterior `fin_mvp_demo` sigue en época 1, con ocho movimientos y **CLP 118.600**;
no se migró ni se reinició. Los nuevos ensayos usan otras iglesias.

Las páginas tienen corte y cursor estables por secuencia, autorización vigente
en cada consulta y exclusión explícita de campos privados. Se exige la capacidad
`historialPaginado: true`, evitando entregar una historia parcial como completa
a clientes antiguos. La pantalla existente añade «Cargar más movimientos» y el
corte; descarta respuestas de otra revisión/contexto y rechaza páginas duplicadas.

Se ejecutó Chrome real sobre `lib/main.dart`: login, Dashboard, Finanzas, cinco
páginas del libro de 211 movimientos hasta su apertura original, regreso al panel
y consulta de la demo anterior. Se inspeccionaron capturas. Cero excepciones de
aplicación y cero solicitudes a servicios Firebase de producción en esa sesión.

[Dashboard](fin_release_2_2026-10-24/01-dashboard-incremental.png),
[resumen](fin_release_2_2026-10-24/02-resumen-incremental.png),
[botón paginado](fin_release_2_2026-10-24/03-historial-primera-pagina.png),
[apertura al final](fin_release_2_2026-10-24/04-historial-hasta-apertura.png),
[demo anterior](fin_release_2_2026-10-24/05-mvp-original-conservado.png) y
[evidencia de navegación](fin_release_2_2026-10-24/navegacion.json).

## Pruebas realizadas

| Ejecución | Resultado |
| --- | --- |
| Firestore Emulator, ejecutor aislado | **14 aprobadas**: 13 escenarios y contenedor; cero fallos/omisiones |
| `npm.cmd test` | **1.771 aprobadas**, cero fallos/omisiones |
| `flutter test --no-pub --reporter expanded` | **447 aprobadas**, 1 omisión intencional del test activable anterior de emuladores |
| `flutter analyze --no-pub` | **No issues found** |
| Web debug, entrada habitual `lib/main.dart`, sin pub | Compilación correcta |
| Callables por HTTP con Auth/Functions Emulator | Dos páginas sin duplicados; rechazo de cliente antiguo y sin Auth; demo anterior intacta |
| CLI local de conciliación | Resultado sin diferencias en fixture de 50 cuentas/50 categorías |

Los escenarios verifican 200/201/202; original y recibo anteriores conservados;
replay anterior después del cambio de escritor; paginación con altas concurrentes;
respuesta perdida inyectada después del commit real; solicitudes concurrentes
duplicadas; dos gastos simultáneos sin sobregiro; revocación; aislamiento entre
iglesias; transferencia; las ocho acciones; cupos 50/50; cambio de mes y reversión
entre períodos; proyección ausente/corrupta; rechazo de una adopción divergente;
historia alterada; conciliación separada y 1.003 resultados paginados.

[Integración](fin_release_2_2026-10-24/emulador-final.log),
[Node](fin_release_2_2026-10-24/npm-test-final.log),
[Flutter](fin_release_2_2026-10-24/flutter-test-final.log),
[análisis](fin_release_2_2026-10-24/flutter-analyze-final.log),
[compilación](fin_release_2_2026-10-24/build-web.log),
[HTTP](fin_release_2_2026-10-24/http.json) y
[CLI](fin_release_2_2026-10-24/cli-conciliacion.json).

No aparecieron fallos de inventarios administrativos en la suite Node. No se
ejecutaron preparadores/activaciones V2. Las identidades históricas conservadas
corresponden a sus bytes anteriores: **no acreditan el código incremental nuevo**.

## Archivos y limitaciones

Existentes modificados: `functions/test/finanzas_mvp_runtime/api.js` e `index.js`
(inyección y selección demo por época/capacidad), y
`lib/modules/finanzas/finanzas_mvp_service.dart` y `finanzas_mvp_screen.dart`
(solicitud y carga de páginas). Los archivos nuevos son cinco módulos privados
en `functions/test/finanzas_v1_incremental/`, tres ejecutores locales en
`test/finanzas_v1_incremental/` y la prueba Flutter de paginación.

[Diff de esta intervención contra el respaldo](fin_release_2_2026-10-24/cambios.patch),
[estado Git completo](fin_release_2_2026-10-24/git-status.txt) y
[rama conservada](fin_release_2_2026-10-24/rama.txt).
Sigue el espacio final preexistente en `functions/index.js:2021`, fuera del alcance.

Límites explícitos: mantenimiento hasta 20.000 documentos/24 períodos/8 MiB,
sin afirmar una validación de carga mayor a 1.001 históricos; creación de cuenta
extiende como máximo 24 resúmenes; las páginas cargadas se conservan en memoria
del cliente. El wrapper MVP mantiene la limitación previa de recuperación tras
revocación/cambio de pertenencia y las claves locales aún no distinguen proyecto.
No hubo nueva prueba Android física. Estos puntos no se presentan como resueltos
ni como autorización de publicación.

No se instalaron dependencias, no se accedió a producción, no se desplegó, no se
hicieron commits ni se cambió de rama. El servidor web y los emuladores se dejaron
disponibles; Chrome automatizado se cerró. Se detuvo el trabajo al completar
**FIN-RELEASE-2**, sin iniciar otra fase administrativa o V2.
