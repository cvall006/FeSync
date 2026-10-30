# FIN-7C.4E.1H — implementación candidata y validación

Se implementó un procedimiento aislado nuevo, sin modificar el preparador actual
ni otro archivo previo. El puente se ensayó con Firestore Emulator real, no solo
con dobles. Todavía no está acreditado administrativamente y sus ensayos siguen
PENDIENTE, activa:false y elegibleActivacion:false.

## Alcance y decisión de inspección

Se contrastaron DIAGNOSTICO_ENLACE_ADMIN5.md, ACREDITACION_ADMIN5.md, registro,
descriptores, fuentes.js, runtime, preparación, estado, evidencia y verificación
anteriores. El preparador anterior usa una WeakMap privada local: no es posible
pasarle un contexto administrativo. El nuevo punto de entrada y capacidad propia
resuelven el diseño sin editar esos módulos acreditados.

La vía administrativa recibe únicamente un selector de inventario; verifica sus
fuentes internamente y no acepta descriptor, huella o contexto arbitrario como
autoridad. Hoy el selector admin-5 rechaza los cinco JS añadidos. No se registra
otra identidad, altera ese rechazo ni utiliza una acreditación simulada como real.
La vía positiva administrativa queda pendiente de una acreditación posterior
explícita; esa garantía NO se declara probada por el ensayo local.

El arnés fija una política de ensayo de 50 componentes: 39 JS del árbol ampliado
y 11 componentes administrativos/metadatos. Su digest local es
`7fd4230de6414d577b91bb8850472727b6c0b8bd0bc56c4b0c672e231b8abd3b`.
Ese digest identifica el candidato local, nunca admin-5 ni un futuro admin-6.
No existe generador o aprobador de hashes en el arranque.

## Archivos y hashes del procedimiento nuevo

| Archivo | SHA-256 |
| --- | --- |
| runtime.js | 625a55599d43560a0542a392feaf69f14cb6beab9997bb4d58e4a8cfad76a254 |
| evidencia.js | 627bb2fc1e2fea27f6493a93b1c02a893d384b76d2c23a43bb761e24041df888 |
| estado.js | f2d1c0e2b7558a3f8512066f468aa82d472ac1ef6293cdf37cfae50dd85509b0 |
| preparacion.js | c9a5d5ebcb9376da38bd43060b3ffc29d95e751969fc98d9c04c5fa7a6cec956 |
| verificacion.js | a2f25a94bc9a869c03c2d344c8db15a124dc20350bfdf545c5941cda146a29a5 |

[FUENTES_CANDIDATAS.json](FUENTES_CANDIDATAS.json) enumera esos hashes, el cierre
transitivo de 21 JS, las 39 fuentes completas y los tres JS administrativos.
Es un informe sin autoridad administrativa. La huella administrativa admin-5 y
su descriptor conservan sus bytes e identidades; no describen el nuevo árbol.

[README.md](README.md) define API, contrato de persistencia, custodia y futura
acreditación. Las pruebas y política nuevas están en
`test/contabilidad_preparacion_v2_admin_aislado/`; no se modifican pruebas previas.

## Validación ejecutada del puente

| Comando / ámbito | Resultado real |
| --- | --- |
| node test/contabilidad_preparacion_v2_admin_aislado/iniciar.js | 68/68: 20 guardas y 48 escenarios SDK/Firestore; cero fallos, omisiones o cancelaciones. |
| node --test test/contabilidad_preparacion_v2_admin_aislado/guardas.test.js | 20/20; subconjunto de las 68, no se suma otra vez. |
| npm.cmd test, functions del árbol actual ampliado | 1.727 aprobadas y 32 fallidas, de 1.759; cero omitidas/canceladas. |
| npm.cmd test, copia exacta anterior | 1.759/1.759; cero fallos/omisiones/cancelaciones. |
| node --check | Los 10 JS nuevos correctos. |
| Preparador anterior con procedencia, copia anterior | 75/75; cero fallos/omisiones/cancelaciones. |
| Preparador anterior de generaciones V2, copia anterior | 58/58; cero fallos/omisiones/cancelaciones. |
| Compatibilidad histórica administrativa, copia anterior | 25/25; cero fallos/omisiones/cancelaciones. |
| Administrativas D2, copia anterior | 28/28; cero fallos/omisiones/cancelaciones. |
| FIN-7, copia anterior | 211/211, incluidas 46/46 de reglas anidadas; cero fallos/omisiones/cancelaciones. |

El Node del árbol actual NO está verde. Los 32 fallos son
DEMO_FUENTES_NO_ACREDITADAS al exigir el inventario admin-5 exacto, que no contiene
los cinco JS nuevos. Cada caso consta en
[FALLOS_INVENTARIO.md](../../test/contabilidad_preparacion_v2_admin_aislado/FALLOS_INVENTARIO.md).
No se eliminan negativas, actualizan huellas ni relajan fuentes para ocultarlo.
Los resultados de la copia anterior comprueban conservación, no acreditan adiciones.

Los 48 escenarios SDK nuevos verifican datos y versiones reales de Firestore:
recibos V1, libro mixto y vacío, reversas, sello, corte, iglesia/época/algoritmo,
runtime alterado, evidencia manipulada, documentos ausentes/extra/reescritos,
generación parcial, operadores concurrentes, fence repetido, respuesta perdida,
atomicidad, bloqueo V1/V2, reanudación y verificador sin escrituras.
La prueba instrumentada confirma que ni FS ni custodia se invocan dentro del
callback transaccional. Las comprobaciones de fuentes adulteradas usan dobles FS
sin editar archivos; no se confunden con la integración real de persistencia.

El lanzador construye además una copia admin-5 exacta, cotejada antes de importar
su software, y crea con ella evidencia local auténtica del procedimiento previo.
El puente rechaza adoptarla y conserva datos/updateTime. Esa evidencia continúa
PENDIENTE. No se copian huellas administrativas para fabricar procedencia.

Todas las generaciones preparadas por el puente permanecieron inactivas, sin
puntero activo y con protocolo bloqueado. No se ejecuta la suite SDK de gastos V2
que construye fixtures válidas activa:true y operativo_v2. Se excluye de este
alcance para mantener la preparación inactiva; no se atribuyen sus 39 casos a esta
entrega. El adaptador sí está cubierto por Node y por rechazos SDK bajo bloqueo.
Para impedir ese paso pendiente del planificador externo, se colocó una guarda
temporal en el lanzador de la COPIA de regresiones: registró NO EJECUTADO y salió
con código 2. Por eso el planificador global devolvió 1, aunque las tres corridas
históricas ejecutadas salieron 0. No representa un fallo de sus pruebas ni una
corrida V2 aprobada. El lanzador temporal fue restaurado y los 405 archivos de
esa copia volvieron a cotejarse con el respaldo. El repositorio no se modificó.
Las regresiones históricas pueden construir estados deliberadamente inválidos
para probar rechazos; eso no activa una generación preparada por el puente.

## Preservación

Rama integration/adora-live, HEAD 01223cd990312677ebbef2892ae7e99b1109e272.
Inicialmente 18 tracked modificados, 195 untracked individuales y staged vacío.
Respaldo verificado antes de editar, incluidos los 405 archivos tracked/untracked,
índice, HEAD, estado y diffs staged/unstaged:
`C:/Users/igles/AppData/Local/Temp/fesync-pre-1H-0StKuT/`.
SHA-256 de manifest.json:
`009bd4f4a17aa9bcb3830c2a78e6969975aa85e51d9f46a082310b6ff7f12dfb`.
No se presenta como nuevo respaldo de dependencias ignoradas ni datos Firebase.

La copia para regresiones está en
`C:/Users/igles/AppData/Local/Temp/fesync-1H-regresiones-A0LwnG/`.
Se restauran los archivos previos desde el respaldo verificado y se enlazan las
dependencias existentes. No se instala ni descarga software. No se filtra el árbol
actual al verificarlo: se comprueban dos raíces de software distintas y explícitas.

La comparación final, SHA de cada archivo previo/nuevo, estado Git y diff exclusivo
de esta fase se conservan en el respaldo externo como verificacion-final.json,
estado-final.txt y cambios-fin-1H.diff. Los únicos añadidos del repositorio están
en los dos directorios nuevos autorizados. Los archivos previos, los 37 JS ya
acreditados y todos los inventarios permanecen byte por byte intactos.

## Garantías y siguiente acreditación

Se ensayaron integridad, vinculación e idempotencia del procedimiento candidato.
No se acreditó una nueva ejecución administrativa. La confianza depende del
ejecutor/cargador local y custodia externa; no existe attestation criptográfica
contra un operador que sustituya código cargado, política y datos simultáneamente.
Los cerrojos ajenos se rechazan incluso terminados; no hay recuperación automática.

El próximo alcance debe revisar los cinco módulos y su cierre completo, acreditar
el árbol de 39 fuentes con una identidad nueva separada de admin-5, conservar
descriptores anteriores y revisar compatibilidad D2 y políticas de ensayo afectadas.
Solo después podrá producirse una ejecución administrativa NUEVA y probarse
positivamente su identidad real persistida. Una evidencia local previa no se
convierte en administrativa por registrar después otro inventario.

No se añade esa identidad, crea activador, habilita operativo_v2 en el procedimiento,
accede a producción, despliega, migra datos reales, instala paquetes, cambia de rama,
crea commits o modifica reglas, Flutter, Work, endpoints o núcleo financiero.

## Cierre de FIN-7C.4E.1H

La corrida final completa, despues de endurecer ubicacion y ancestros enlazados,
termino con 68/68 aprobadas. La corrida preliminar de 66 casos tambien paso, pero
no se suma al resultado final. Las 20 guardas actuales incluyen dos negativas
para impedir que codigo trasladado a directorios excluidos o metadatos enlazados
se presenten como runtime cubierto. No se modifica ningun JS despues de esta corrida.

Logs finales en TEMP: fesync-1H-puente-final.log, fesync-1H-node-actual-final.log,
fesync-1H-node-base.log, fesync-1H-preparador-previo.log, fesync-1H-admin.log,
fesync-1H-generaciones-previas.log y fesync-1H-v2.log (exclusion explicita).

Estado final esperado y cotejado al cerrar: los 405 archivos previos identicos,
16 archivos nuevos, 18 tracked modificados preexistentes, 211 untracked y staged
vacio; rama, HEAD, indice y diff tracked intactos. El detalle verificable queda
en verificacion-final.json fuera del repositorio. Se detiene el trabajo en H,
sin registrar una nueva identidad ni ejecutar preparacion administrativa acreditada.
