# FIN-7C.4D.2: ensayo administrativo privado de contabilidad

> FIN-7C.4E.1C.2: el runtime actual es **admin-4**, que acredita las cinco fuentes
> existentes del preparador aislado. Se conservan legado, admin-2 y admin-3 y
> todos sus contratos históricos. No hay activación V2 ni reetiquetado de
> checkpoints. Ver [ACREDITACION_ADMIN4.md](ACREDITACION_ADMIN4.md).

> Actualización FIN-7C.4E.1B: runtime actual **admin-3**, con V2 acreditado como
> fuente pero sin activación ni cambio del motor D2. Se conservan las identidades
> legado y admin-2. Ver [ACREDITACION_ADMIN3.md](ACREDITACION_ADMIN3.md) para hashes,
> tratamiento de fallos, compatibilidad y contrato pendiente de generaciones.
> Las secciones históricas siguientes describen el estado de cada fase anterior.

Actualizacion FIN-7C.4E.0B: la identificacion de software ahora distingue runtime
actual e identidad historica. Los requisitos operativos de D.2 siguen vigentes;
las comparaciones de huella descritas inicialmente se sustituyen exclusivamente
por la politica cerrada siguiente. Ver tambien COMPATIBILIDAD_INVENTARIOS.md.

Exclusivamente `demo-fesync`, Firestore Emulator en `127.0.0.1:8088`. No hay
endpoint, adaptador V2, activacion, despliegue ni variante de produccion.
No utiliza la herramienta de membresia Work. Todos los datos de las pruebas
son ficticios y se destruyen al cerrar el emulador.

## Ejecutar las pruebas

Desde la raiz, con Node, Java y Firebase CLI YA instalados:

    node test/finanzas_transicion_demo/iniciar.js

El ejecutor rechaza argumentos, proyectos alternativos, credenciales y puertos
ocupados. Inicia un emulador nuevo, copia reglas/configuracion exactas a un
directorio temporal y ejecuta secuencialmente la nueva suite administrativa y
la suite financiera existente, incluidas sus guardas y regresiones de reglas.
No importa datos existentes ni se conecta a un emulador que ya este escuchando.
No debe ejecutarse junto a la herramienta Work ni otra suite en esos puertos.
El SDK Admin se crea solo despues de comprobar el entorno, sin ADC y con host,
puerto, proyecto y SSL explicitos. Se revisa tambien el cliente inyectado.

    cd functions
    npm.cmd test

No hay instalacion de dependencias. `node --check` se aplica a todos los JS nuevos.
Los logs de infraestructura y pruebas quedan en el directorio temporal local.

## Precondiciones que NO deben confundirse con pruebas de seguridad

El emulador omite IAM y no permite enumerar o excluir todos los clientes Admin.
`custodia` representa una declaracion RESPONSABLE del operador local: emulador
exclusivo y nuevo, acceso administrativo local y escritores conocidos. Esas
banderas NO autentican a un usuario de FeSync, NO verifican IAM real ni prueban
ausencia de otro proceso Admin. La herramienta no concede privilegios Firebase.
Su unica ejecucion automatizada soportada es el ejecutor de pruebas que crea y
posee el emulador nuevo. Si no puede acreditarse esa custodia externa, DETENERSE
antes de construir la herramienta o inicializar datos. No ejecutar sobre un
emulador compartido, importado o de procedencia desconocida.

`fuentes_v1.json` fija SHA-256 de los 22 archivos JS servidor existentes revisados.
La verificacion detecta archivos nuevos, cambios y enlaces en esas fuentes, sin
modificarlas. Excluye dependencias, tests y este directorio administrativo, cuya
huella de software tambien queda vinculada a la ejecucion. No es una firma ni
un detector de procesos/credenciales externas. Actualizar el inventario requiere
revision humana de TODOS los escritores; no regenerarlo para sortear un rechazo.
Las modificaciones legitimas de Work u otro desarrollo pueden bloquear el
preflight y deben revisarse, nunca sobrescribirse.

El escritor monetario conocido es el adaptador V1 con sus ocho operaciones y
su lectura de protocolo transaccional. Las funciones de acceso y membresia
escriben acceso/elegibilidad/auditoria administrativa, no el libro; continuan
revocando permisos y no participan en el corte monetario. Los tests/sembradores
Admin solo actuan bajo la custodia del ejecutor. Un cliente Admin ajeno puede
ignorar el protocolo: no se promete proteccion frente a ese actor privilegiado.

## API administrativa inyectable

`crearTransicionDemo({db, env, custodia})` comprueba entorno, destino del cliente,
declaracion de custodia e inventario. No inicializa Admin internamente.

- `preflight(iglesiaId)`: solo lectura, devuelve estado `pendiente` y conteos.
  Exige protocolo operativo V1 valido, FIN-3, controles, limites, catalogos,
  reservas, aperturas y recibos privados coherentes. Rechaza ejecuciones o
  generaciones anteriores, incluidas huerfanas sin cerrojo.
- `inicializarProtocolo(iglesiaId)`: accion explicita, solo para bootstrap de
  libro VACIO en el emulador nuevo bajo custodia. Exige ausencia de protocolo,
  cerrojo, ejecuciones, generaciones y todos los catalogos/movimientos. Crea
  version 1, epoca 1, `operativo_v1` mediante create. No repara ni migra un libro
  existente, no infiere procedencia a partir de ausencia y no es parte implicita
  de `iniciar`. Una fuente existente sin protocolo se rechaza.
- `iniciar(parametros)`: en UNA transaccion vuelve a leer el protocolo, fuente y
  cerrojo, fija el corte y crea ejecucion/generacion inicial inactiva. Bloquea V1
  en ese mismo commit. Confirmar el bloqueo significa esperar ese commit, no
  iniciar la llamada. La repeticion de la misma identidad recupera el estado;
  otra identidad/operador no sustituye al propietario.
- `avanzar(parametros, fenceEsperado)`: pagina historica o lote de proyecciones.
  Protocolo bloqueado, identidad, epoca, software, corte y fence se comprueban
  dentro de la MISMA transaccion que sus escrituras. No hay lecturas posteriores
  a la primera escritura. Incrementa fence y checkpoint junto al lote. Una
  respuesta perdida se recupera reenviando el MISMO fence; solo el paso inmediato
  ya confirmado devuelve historia sin acumular otra vez. Fences anteriores se
  rechazan. Dos ejecutores del mismo checkpoint obtienen un avance y su replay.

Parametros completos y estrictos:

    {
      iglesiaId, ejecucionId, operador, periodos,
      pagina: 1..50, lote: 1..25
    }

`operador` es una capacidad privada aleatoria de 256 bits, generada y conservada
por el operador confiable antes de llamar. La biblioteca no genera identidades
ni las imprime. Solo conserva su SHA-256. Las pruebas usan valores ficticios.
Iglesia/ejecucion admiten `[A-Za-z0-9_-]`, maximo 64 caracteres. `periodos` es una
lista explicita YYYY-MM, sin duplicados, maximo 24; debe cubrir los movimientos y
proyecciones requeridas, nunca se infiere del reloj del equipo. Cambiar operador,
periodos, tamanos o version de software no permite reutilizar el checkpoint.

## Documentos privados separados

Debajo de `iglesias/{iglesiaId}`:

- `finanzas_control/protocolo`: contrato estricto de cuatro campos FIN-7C.4D.1.
  Solo cambia a `bloqueado`. No se agregan campos FIN-3 ni se activa V2.
- `finanzas_transicion_demo/cerrojo`: ejecucion, propietario y fence monotonico.
- `finanzas_ejecuciones_demo/{ejecucionId}`: estado, identidad, version del
  procedimiento/algoritmo/software, epoca, corte, manifest de referencias
  observadas y versiones, checkpoint puro, cursor y lote confirmado.
- `finanzas_generaciones_demo/{ejecucionId}`: metadatos y `activa: false`.
  Subcolecciones `saldos/{cuentaId}`, `periodos/{YYYY-MM}` y
  `cuentas_periodo/{hashDePeriodoYCuenta}` contienen la generacion separada.

Las rutas quedan denegadas por el comodin privado existente para SDK cliente;
se prueba sin cambiar reglas. El checkpoint elimina actor, donante, motivo,
descripcion y tokens. Los manifest guardan hashes de referencias observadas y
updateTime real, no UID en claro de recibos. Ningun hash creado aqui se presenta
como hash de origen o prueba criptografica del historico. Los recibos V1 se leen
desde su ruta privada exacta y se cotejan con sus movimientos/entidades: no se
fabrican, reparan ni copian a una ruta publica. Fuentes legadas sin metadatos
suficientes se rechazan para revision.

## Conciliacion y generacion

El corte contiene secuencia y updateTime segundos:nanosegundos del control real.
Cada paso vuelve a observar las colecciones V1 acotadas y sus versiones, incluidos
recibos, reservas y marcadores. Se comparan con el manifest fijado al bloquear;
queries transaccionales detectan altas/bajas y conflictos en el commit. No se
adopta una nueva seleccion al reintentar. Un cambio auxiliar en una fuente del
manifest tambien detiene la ejecucion: es una politica conservadora.

Las paginas reales usan `orderBy(secuencia), orderBy(__name__)` y cursor exclusivo
(secuencia, ID). El checkpoint persistido reconstruye el prefijo mediante
`conciliacion.js`; esa biblioteca usa `proyecciones.js`. La fase de preparacion
vuelve a validar el checkpoint contra el mismo contexto y proyecciones V1.
Discontinuidades, duplicados, cambios de fuente, saldo/resumen o marcador
incoherente impiden continuar. No se modifica ningun importe historico.

Un libro completamente vacio puede carecer de resumen V1. Solo en ese caso se
admite la incidencia explicita `RESUMEN_AUSENTE` del conciliador para construir
una generacion cero; no se inventa una observacion V1 ni se altera su reporte.
Las demas incidencias de fin de lectura rechazan. Se exige clasificacion y
procedencia suficientes para todos los movimientos existentes.

Los saldos y resumenes de generacion proceden de la reconstruccion validada.
Los resultados por cuenta reutilizan `calcularLibro` sobre movimientos COMPLETOS
que tocan la cuenta, manteniendo originales y reversas. Transferencias conservan
ambas patas y su neto por cuenta se obtiene con FIN-2; no son ingreso/gasto. Se
incluyen saldos inicial/final, ingresos/gastos netos, resultado, aperturas,
ajustes y transferencias netas, tambien para reversas entre meses.

Cada lote crea documentos nuevos y avanza checkpoint/fence atomicamente. Antes
del ultimo commit se verifica exhaustivamente el contenido preparado contra el
mismo corte, incluidos documentos extra/ausentes. `verificada` sigue significando
generacion INACTIVA observada en ese corte: no certifica procedencia historica
ni autoriza escribir, navegar o activar V2. La certificacion historica del
conciliador permanece false. No existe puntero de generacion activa.

## Estados y recuperacion

`pendiente` es el resultado sin escrituras de preflight; `bloqueada` es el primer
checkpoint persistido. Continua por `conciliando`, `preparando` y `verificada`.
Una divergencia determinista registra `fallida` con codigo acotado, conservando
checkpoint/evidencia y bloqueo. Errores de transporte o commit se propagan:
no se convierten en ausencia ni autorizan otro intento con identidad diferente.

Interrupcion antes del commit: reenviar identidad y fence originales. Respuesta
perdida tras commit: el mismo fence recupera el paso historico sin duplicacion.
Reiniciar el proceso/herramienta conserva todo el progreso en el emulador mientras
su proceso siga vivo. Cerrar el emulador sin exportacion pierde los datos demo;
no hay garantia de durabilidad entre cierres ni almacenamiento local de la
capacidad del operador. Perder esa capacidad bloquea recuperacion automatica.

No hay takeover por TTL, liberacion automatica, cancelacion destructiva ni
reseteo de epoca. El cerrojo se conserva tambien al verificar; esta herramienta
solo prepara UNA generacion inicial. Ante fallida, software distinto o capacidad
perdida, detenerse, conservar fuentes y comprobantes privados y revisar fuera
de banda. Una intervencion o nueva generacion requiere otro procedimiento
revisado. Nunca borrar y recrear protocolo/cerrojo, cambiar el owner ni quitar
guardas para superar el problema. En el ensayo desechable se puede reiniciar
TODO el emulador con fixtures nuevos; eso no es recuperacion de produccion.

## Limites y garantias pendientes

No se retiran limites V1 50 cuentas/50 categorias/200 movimientos ni se ofrece
un escritor incremental V2. Lectura auxiliar: hasta 24 resumenes, 200 marcadores,
50 aperturas y 50 reservas de cada catalogo; 2 MiB de fuente, manifest 256 KB,
checkpoint 800 KB. Lotes maximo 25 documentos mas ejecucion/cerrojo/metadatos.
El control estricto de limites puede detener un ensayo en vez de truncar datos.

Aunque la salida se escribe por lotes y el libro se pagina, se releen las fuentes
V1 acotadas por cada paso y el conciliador revalida prefijos. Coste/memoria crecen
con N; la preparacion de resumenes por cuenta/mes puede costar O(N*A*P) por lote.
Es deliberadamente un bootstrap acotado comprobable, NO la arquitectura de
escritura escalable ni una migracion de produccion. Las pruebas no demuestran
cuotas, IAM, indices de produccion ni todas las intercalaciones posibles.

No hay efectos externos en los callbacks de esta herramienta. Las inyecciones
de fallo, respuestas perdidas y carreras estan SOLO en las pruebas. Las carreras
de las regresiones V1 y de la herramienta se describen por separado en los
resultados. Un bloqueo no congela mensajes FCM en transito ni auditoria de acceso.

Una futura herramienta de produccion necesita autorizacion, respaldo y plan de
restauracion, custodia verificable de escritores/operadores, permisos IAM,
conservacion de capacidades y evidencia, recuperacion auditada, migracion de
esquema y activacion separada. No se obtiene quitando las guardas demo.

## Evidencia de validacion FIN-7C.4D.2

- `npm.cmd test` desde functions: 1624 aprobadas (27 nuevas, 1597 regresiones),
  cero fallidas, omitidas o canceladas.
- Corrida estable del ejecutor: 28 pruebas administrativas reales, 211 pruebas
  existentes de integracion/guardas/verificador y 46 regresiones reales de reglas.
  Cero fallidas u omitidas. No se editaron archivos durante esa corrida.
- `node --check`: correcto en los siete JS nuevos. Los 336 archivos anteriores
  permanecen identicos por SHA-256; se agregan solo los nueve archivos declarados.
- Primer arranque: rechazo de infraestructura ANTES de ejecutar pruebas porque
  Firebase CLI inyectaba campos adicionales en FIREBASE_CONFIG. Se inspecciono
  la CLI instalada y se corrigio solo el ejecutor nuevo para proporcionar desde
  el inicio la configuracion demo estricta. No se amplio la guarda de destinos.
- Corridas intermedias: 14 y 26 escenarios administrativos aprobaron con las
  regresiones. Se ampliaron pruebas y se revisaron huellas/software, resumenes
  por cuenta, integridad de checkpoints y huerfanas. La corrida estable final
  valida los 28 escenarios y todo el codigo final, sin reintentos artificiales.
- Los PERMISSION_DENIED del SDK cliente corresponden a pruebas negativas que
  aprobaron; SIGINT corresponde al cierre normal del emulador tras codigo 0.

En las tres carreras de la herramienta el bloqueo administrativo se confirma y
el escritor V1 iniciado concurrentemente rechaza; en las tres carreras de las
regresiones V1 el escritor se serializa ANTES del bloqueo y se compara updateTime.
Los ABORTED y las perdidas de respuesta se inyectan explicitamente en pruebas;
no son fallos espontaneos de red. Los escenarios de recuperacion reconstruyen
la herramienta contra el checkpoint persistido, sin matar un proceso del SO;
la durabilidad entre cierres/exportaciones del emulador no queda demostrada.
No se demuestra ausencia de un Admin externo ni concurrencia exhaustiva.

Matriz administrativa: libro vacio; mixto de seis clases y reversa posterior;
paginas de 1/50; dos operadores y dos ejecutores del mismo checkpoint; otra
ejecucion simultanea; interrupciones antes/despues del commit de pagina y lote;
fuentes alteradas/ausentes; saldo, movimiento y marcador matematicamente
incoherentes antes del corte; recibo incoherente; checkpoint alterado; generacion
con documento eliminado; protocolo ausente/epoca incompatible; aislamiento y
rutas privadas; tres bloqueos concurrentes; revocacion de acceso durante pausa;
ejecucion y generacion huerfanas sin cerrojo. Generaciones siempre inactivas.

## Compatibilidad versionada FIN-7C.4E.0B

Ejecutor ampliado, solo emulador demo nuevo y con todas las suites secuenciales:

    node functions/contabilidad_demo/test/iniciar.js

Ejecuta pruebas nuevas de checkpoints historicos, las 28 administrativas
existentes y la integracion FIN-7 con guardas y reglas. Rechaza puertos ocupados,
proyectos reales, credenciales y hosts alternativos; no instala herramientas.

`obtenerContextoFuentes(inventarioId?)` valida el registro cerrado y devuelve
huellaSoftware actual, identidadHistorica, metadatos de ejecucion nueva y una
comprobacion pura de compatibilidad. `verificarFuentes(inventarioId?)` conserva
su retorno string, pero representa la identidad del runtime ACTUAL, nunca la
historica por alias. El constructor admite inventarioId como opcion del operador
local, no como autoridad Firebase ni parametro de usuario de la aplicacion.
Id desconocido, incluido seleccionar legado-1 como si fuese un runtime actual,
se rechaza. legado-1 es una identidad de creacion archivada, no otro runtime
que se ejecuta implicitamente.

Registro real: inventarios/registro.json. Solo admin-2 esta acreditado como
runtime; su descriptor fija bytes reales, no hashes de archivos inexistentes.
El inventario base fuentes_v1.json se conserva integro. legado_1.json permite
reproducir la identidad original desde sus tres archivos archivados. Las nueve
sustituciones del contrato cambios_identidad_2.json tienen hash propio fijo en
el verificador y prueban que el resto de transicion.js coincide con el original.
No se puede acreditar otro comportamiento editando solo descriptores/hashes.

Las ejecuciones nuevas guardan inventarioId=admin-2 y versionContratoInventario=2
en ejecucion y generacion. Las antiguas SIN esas etiquetas solo se admiten si
AMBOS documentos tienen la identidad historica acreditada y el contrato original
coherente. Sus huellas no se actualizan, las etiquetas no se rellenan y no hay
migracion de checkpoints. La consulta iniciar no escribe; avanzar conserva
metadatos y realiza solo el avance ordinario original. El verificador rechaza
identidades desconocidas o incompatibles, aunque declaren los mismos numeros.

Los descriptores publicados son inmutables. Para incorporar una fuente futura
se requiere otra version explicitamente registrada, hashes reales, compatibilidad
declarada y validacion exacta del arbol actual completo, ademas de conservar las
fuentes compartidas y el motor. Cambiar calculo/lecturas/escrituras exige otro
contrato revisado. No hay comando automatico para regenerar hashes.

V2 sigue pendiente, sin archivo, hash acreditado, endpoints o activacion. Los
tests de ampliacion de inventario usan fuentes sinteticas SOLO en memoria;
no equivalen a acreditar el futuro adaptador. La recuperacion con originales
no acreditados se bloquea; el procedimiento conservador de respaldo original
y sus limites se documenta en COMPATIBILIDAD_INVENTARIOS.md.

### Evidencia final FIN-7C.4E.0B

Identidad historica conservada:
76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d.
Identidad del runtime final admin-2:
0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f.
fuentes_v1.json conserva SHA-256
8687f7eb5798728deea4b43cd6f32f9c664889c0f926f46a7d22c1270efd90a4.

Validacion final: 1668 Node (44 nuevas y 1624 regresiones), 13 pruebas nuevas
de checkpoints con Firestore real, 28 administrativas anteriores, 211 de
integracion/guardas/verificador financiero y 46 regresiones reales de reglas.
Cero fallidas, omitidas o canceladas en la corrida final. No se editaron fuentes
ni descriptores durante ella. node --check correcto en los JS afectados.

Incidencias conservadas: la primera suite detecto una expectativa antigua de
codigo de error al alterar fuentes_v1.json; el rechazo ahora ocurre antes como
DEMO_HISTORICO_NO_ACREDITADO. Se actualizo esa expectativa exacta y se agregaron
casos independientes para archivos nuevos/alterados. Una prueba negativa nueva
fallo inicialmente porque un contrato distinto podia acreditarse cambiando
descriptores y sus hashes. Se corrigio el verificador fijando el hash del parche
de identidad revisado; la prueba ahora exige y obtiene rechazo aun con hashes
de descriptor coherentemente recalculados. Se reviso el descriptor del candidato
en desarrollo tras esa correccion; no se modifico ninguna huella persistida de
ejecucion. Los candidatos de prueba no constituyen identidades publicadas.

Los PERMISSION_DENIED son rechazos esperados en pruebas negativas. SIGINT fue
el cierre normal del emulador tras codigo 0. Interrupciones/perdida de respuesta
fueron inyectadas antes/despues del commit; las carreras de fencing usaron
transacciones reales. No se probo matar procesos del SO, durabilidad al cerrar
el emulador ni concurrencia exhaustiva. La ampliacion de inventario futuro
se comprobo solo con archivos/descriptores sinteticos en memoria. No hubo
activacion V2, lecturas de produccion ni migracion de checkpoints.
