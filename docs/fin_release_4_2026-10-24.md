# FIN-RELEASE-4: backend compartido fuera de pruebas, sin despliegue

El backend incremental V1 queda en **`functions/finanzas_v1/`** y es utilizado
por los dos callables normales y por los ejecutores demo. La entrada normal ya
no importa código desde `functions/test`, directa ni transitivamente. Se
conservan el mismo motor económico, contratos, IDs, recibos y controles.

La suite Node completa vuelve a pasar legítimamente: **1.778 aprobadas, cero
fallos**. La compatibilidad administrativa se prueba contra sus fuentes
históricas exactas. **El árbol nuevo sigue rechazado como admin-6**; no obtiene
una acreditación histórica por pasar estas pruebas. No está listo para producción.

## Preservación y diff

Respaldo SHA-256 verificado de **592 archivos locales**, incluidos untracked,
informes y evidencias anteriores, en
`C:\Users\igles\AppData\Local\Temp\fesync-fin-release4-20261025004440`.
Incluye estado Git, diff de trabajo/índice, HEAD y rama; conserva la eliminación
Kotlin previa. No se borró ningún archivo inicial.

Hay **14 archivos existentes modificados y 578 idénticos**. `functions/index.js`,
`functions/finanzas.js`, todo `finanzas_core`, reglas, V2, preparadores,
inventarios, Work, migración/membresía, código Flutter de la aplicación y
dependencias mantienen sus bytes de FIN-RELEASE-3. HEAD, rama e índice siguen
iguales.

[Respaldo](fin_release_4_2026-10-24/respaldo.json),
[integridad y lista exacta de archivos](fin_release_4_2026-10-24/integridad.json),
[diff de esta intervención](fin_release_4_2026-10-24/cambios.patch),
[estado Git](fin_release_4_2026-10-24/git-status.txt) y
[HEAD/rama/índice](fin_release_4_2026-10-24/git-integridad.json).

## Organización del código

| Módulo compartido | Responsabilidad |
| --- | --- |
| `api.js` | Consulta autorizada, DTO y cursor del historial |
| `solicitudes.js` | Captura persistente de intención, precondiciones, permisos por acción y respuesta callable |
| `adaptador.js` | Escritor incremental atómico |
| `catalogos.js` | Cuentas/categorías y límites 50/50 |
| `comun.js` | Contexto transaccional, protocolo, verificación y estado |
| `entorno.js` | Barrera exclusiva de emuladores demo |
| `mantenimiento.js` | Pausa, adopción, conciliación y continuidad mensual; no se exporta como callable |

`finanzas_publicacion.js` importa estos módulos y conserva las barreras añadidas
en FIN-RELEASE-3. La tabla de permisos por acción se comparte con captura y
adaptador. La decisión de autorización sigue en `finanzas_core/autorizacion.js`;
los cálculos siguen en las mismas funciones puras, `proyecciones.js` y
`conciliacion.js`. No se agrega otro motor.

El API demo conserva únicamente su consulta antigua e inicialización de fixture
y delega la ejecución/captura al código compartido. Las cinco rutas anteriores
`functions/test/finanzas_v1_incremental/*` quedan como reexportaciones; se verifica
que devuelven los mismos módulos. Los ejecutores demo/CLI también importan la
ubicación nueva. La inicialización de fixtures no pertenece al cierre de
dependencias normal y el API incremental solo expone consultar/ejecutar.

La captura de solicitudes, construcción de contexto y barrera de entorno se
extrajeron conservando literalmente sus cuerpos, normalizando finales de línea.
[Comprobación de extracción](fin_release_4_2026-10-24/extraccion.json).
Además, el adaptador compartido recuperó un recibo realmente confirmado durante
FIN-RELEASE-3 sin modificar recibo ni movimiento.
[Compatibilidad del recibo](fin_release_4_2026-10-24/recibo-release3.json).

## Habilitación y seguridad

La habilitación privada `finanzas_control/publicacion_v1` sigue ausente/apagada
por defecto y no tiene un callable de activación. Solo las fixtures ficticias
locales la crean mediante Admin SDK. Activar el módulo antiguo o enviar flags/
roles desde el cliente no concede esa habilitación.

También sigue intacta la barrera que exige `demo-fesync`, Auth 9098, Firestore
8088, `FUNCTIONS_EMULATOR=true` y ausencia de credenciales reales. Un despliegue
futuro de estos bytes no activa Finanzas: fuera de ese entorno se rechaza antes
de acceder a Firestore. No se cambió la conexión productiva Flutter.

Cada intento de intención, escritura, lectura y replay revalida Auth/UID de
servidor, titular, pertenencia, encargado vigente, permiso específico, módulo,
habilitación privada, protocolo y proyecciones/período. El cliente no determina
su autorización. Se mantienen idempotencia, atomicidad, sobregiro, original
intacto y marcador único de reversión, cursor estable e aislamiento de iglesias.
Los DTO no devuelven aportantes privados, auditoría o recibos completos.

## Los 34 fallos administrativos

Se revisó cada fallo anterior: 32 de inventarios versionados y dos de transición.
Eran incompatibilidades al solicitar una identidad histórica sobre el árbol nuevo;
algunas pruebas negativas abortaban antes de alcanzar la alteración que debían
comprobar. Una aserción también comparaba el hash del `index.js` nuevo con el antiguo.
[Causa por prueba](fin_release_4_2026-10-24/causa-por-prueba.json).

Ahora esas pruebas cargan un árbol temporal histórico real:

- El `index.js` anterior se recuperó del respaldo previo a FIN-RELEASE-3. Sus bytes
  coinciden con el hash **ya existente** en `fuentes_v1.json`; se conserva como
  `functions/test/fixtures/index_admin6.js.txt`, sin ejecutarlo.
- Las otras fuentes solo se copian si coinciden con los hashes existentes. Los
  descriptores, registro, verificadores y políticas originales se mantienen intactos.
- El verificador original valida el conjunto exacto de 39 fuentes y sus módulos
  administrativos, y reproduce la identidad admin-6
  `16d281e09313a4a6f80f37b4d686d70fa5135e1e43e120ed91923bf5393b92e1`.
- Las **118 pruebas históricas**, incluidas negativas de hashes, archivos,
  descriptores y checkpoints, pasan contra esa fuente. No se eliminan negativas,
  no se simula una aceptación del árbol actual ni se cambian checkpoints.
- Pruebas nuevas exigen que el verificador y la capacidad administrativa del árbol
  actual sigan rechazando admin-6. Ningún byte nuevo se etiqueta como antiguo.

El helper es exclusivo de pruebas; no importa desde los callables. No hay
inventario admin-7, descriptor administrativo nuevo, preparador nuevo ni cambio
de identidad. [Impacto previo](fin_release_4_2026-10-24/impacto_previo.md) y
[fixture histórica](../functions/test/fixtures/README.md).

## Pruebas reales

| Ejecución | Resultado |
| --- | --- |
| `npm.cmd test` completo | **1.778 aprobadas**, cero fallos/omisiones; salida 0 |
| Entrada normal en Firebase Emulator | **19 aprobadas**: 18 escenarios y contenedor; cero fallos/omisiones |
| Reglas financieras, Firestore aislado 8098 | **46 aprobadas**, cero fallos/omisiones; salida 0 |
| `flutter test --no-pub --reporter expanded` | **447 aprobadas**, dos omisiones intencionales de pruebas con emuladores |
| Flutter conectado a emuladores, ejecución aparte | **1 aprobada**, salida 0 |
| `flutter analyze --no-pub`, después del ajuste final | **No issues found**, salida 0 |

La entrada normal verificó habilitación ausente/falsa y fixture habilitada, Auth,
titular y encargado con sus atribuciones, miembro/líder rechazados, cuentas,
categorías, apertura, ingreso, gasto, transferencia, ajuste, reversión,
concurrencia sin sobregiro, idempotencia, duplicados concurrentes, respuesta
perdida después del commit, revocación incluso entre intención y escritura,
cambio de iglesia/pertenencia, aislamiento, privacidad, proyecciones/protocolo/
período inválidos y barreras también al recuperar recibos.

Se probaron **200, 201 y reversión 202**, y **1.001 históricos sintéticos más
gasto 1.002 y reversión 1.003** desde los callables normales. Se paginaron los
1.003 sin saltos/duplicados y se concilió por separado contra saldos y resultados.
El resultado fue `SIN_DIFERENCIAS_OBSERVADAS`, con `certificacionHistorica: false`.

La prueba Flutter ejecutó la pantalla y servicio existentes con HTTP real hacia
Auth 9098 y Functions normales 5018; el transporte se inyectó solo en el test,
sin modificar el cliente productivo. Registró un gasto de CLP 17 (saldo
10.181 → 10.164, secuencia 201), dejó la intención resuelta y cargó otra página
desde el botón de historial. No se afirma una prueba nueva de Chrome o Android
ni del transporte nativo Firebase de un dispositivo.

El primer intento de esa prueba falló porque intentaba localizar un botón aún no
construido por `ListView`. Se corrigió el desplazamiento del test, conservando el
gasto ya confirmado y sin reiniciar la fixture. Se repitió solo la prueba
conectada; no se cambió interfaz ni motor para hacerla pasar. El log inicial
conserva ese fallo junto con las 19 pruebas Node aprobadas.

Las reglas se probaron en **8098**, donde su suite puede vaciar su propia base;
nunca se vació el Firestore 8088 existente. Se añadió solo una selección
restringida de puerto al harness de reglas, sin cambiar `firestore.rules`.
Los emuladores adicionales se cerraron. La demo anterior continúa con ocho
movimientos y **CLP 118.600** en puerto 5008.

[Node completo](fin_release_4_2026-10-24/npm-test.log),
[integración normal y primer intento Flutter](fin_release_4_2026-10-24/emulador-inicial.log),
[escenarios](fin_release_4_2026-10-24/emulador.json),
[reglas](fin_release_4_2026-10-24/reglas.log),
[Flutter general](fin_release_4_2026-10-24/flutter-test.log),
[Flutter conectado aprobado](fin_release_4_2026-10-24/flutter-emulador-final.log),
[evidencia Flutter](fin_release_4_2026-10-24/flutter-emulador.json),
[análisis final](fin_release_4_2026-10-24/flutter-analyze-final.log) y
[demo anterior](fin_release_4_2026-10-24/demo-anterior.json).

## Riesgos y siguiente paso mínimo

No quedan fallos en las suites ejecutadas. Esto no concede una capacidad
administrativa al árbol nuevo: los procedimientos históricos siguen bloqueados
en él y requieren su fuente histórica autorizada. No se inició otra acreditación.

Antes de publicar falta revisar el paquete final y autorizar una política de
entorno productivo que mantenga apagada la habilitación privada por defecto,
además de preparar la adopción/conciliación del libro y la conexión explícita del
cliente a los nombres normales. El **siguiente paso mínimo** es esa revisión del
artefacto y del procedimiento de activación, sin desplegar ni cambiar aún las
barreras de este circuito.

Siguen los límites 50 cuentas/50 categorías, mantenimiento de 20.000 documentos/
24 períodos/8 MiB, páginas conservadas en memoria del cliente y recuperación
sujeta a autorización/pertenencia vigentes. La conciliación acredita consistencia
observada, no procedencia histórica. El espacio final preexistente de Work en
`functions/index.js:2037` sigue señalado por `git diff --check`; no se tocó.

Para repetir solo en demo, con herramientas ya instaladas:

```powershell
node test/finanzas_release4/iniciar.cjs
node test/finanzas_release4/reglas.cjs
```

El primer comando conserva Auth/Firestore existentes y usa Functions normales en
5018; también puede iniciar la infraestructura local si no existe. El segundo
usa una base aislada en 8098. No admiten proyectos ni credenciales alternativos.

Sin producción, despliegues, instalaciones, commits o cambios de rama. Se detuvo
el trabajo al completar **FIN-RELEASE-4**.
