# FIN-7C.4E.0: diagnostico y propuesta, sin cambios de comportamiento

> FIN-7C.4E.1I: admin-6 acredita exactamente 39 fuentes, con los cinco JS del
> puente aislado y los 34 hashes anteriores intactos. Declara compatibilidad D2
> explícita con legado/admin-2/admin-3/admin-4/admin-5; no convierte evidencias
> locales PENDIENTE. El puente conserva su código y puede recibir una capacidad
> administrativa auténtica mediante su API existente, para ejecuciones NUEVAS.
> Acreditación, integridad y elegibilidad de activación siguen siendo distintas.
> [ACREDITACION_ADMIN6.md](ACREDITACION_ADMIN6.md) fija alcance y resultados actuales;
> las notas inferiores conservan el contexto histórico de cada fase.

> FIN-7C.4E.1F: admin-5 acredita exactamente 34 fuentes y conserva las cuatro
> identidades anteriores sin modificar código productivo. La evidencia de
> FIN-7C.4E.1E sigue siendo de ensayo local, sin conversión a admin-5 ni
> elegibilidad automática. [ACREDITACION_ADMIN5.md](ACREDITACION_ADMIN5.md)
> documenta el alcance, hashes, compatibilidad, pruebas y enlace pendiente.

> FIN-7C.4E.1C.2: admin-4 extiende el inventario exacto a 28 fuentes, sin cambiar
> acreditador, transición, algoritmos o identidades anteriores. Declara compatibilidad
> D2 con legado/admin-2/admin-3; no convierte el checkpoint del preparador aislado
> en D2. [ACREDITACION_ADMIN4.md](ACREDITACION_ADMIN4.md) fija hashes, límites y
> pruebas. Las afirmaciones siguientes conservan el contexto de sus fases históricas.

> Actualización FIN-7C.4E.1B: se aplica el mecanismo existente de ampliación
> explícita mediante admin-3, sin editar verificador o motor. El legado y admin-2
> conservan bytes e identidades originales. [ACREDITACION_ADMIN3.md](ACREDITACION_ADMIN3.md)
> documenta la acreditación real de V2; las afirmaciones de archivo inexistente
> o pendiente más abajo son evidencia histórica de las fases E.0/E.0B.

> Actualizacion FIN-7C.4E.0B: el alcance fue ampliado posteriormente y se
> implemento el contrato descrito al final de este documento. El diagnostico
> siguiente se conserva como evidencia de FIN-7C.4E.0; sus afirmaciones de
> implementacion detenida corresponden exclusivamente a aquella fase.

Estado: implementacion detenida en la inspeccion por insuficiencia del alcance.
Este documento NO registra un inventario nuevo ni habilita compatibilidad.
No se modificaron fuentes.js, fuentes_v1.json, transicion.js ni checkpoints.
No se creo el adaptador V2 y no se accedio a Firebase.

## Contrato observado

`fuentes.js` recorre los JS bajo functions, excluyendo test, node_modules y el
directorio contabilidad_demo. Compara exactamente rutas y SHA-256 con los 22
registros de fuentes_v1.json. Rechaza archivos extra, ausentes, modificados y
enlaces; no hay selector de inventario. Los archivos financieros, membresia,
roles, index y motor de migracion incluidos siguen cubiertos.

Los archivos administrativos estan excluidos del recorrido, pero tres de ellos
SI participan en la identidad retornada. La formula actual es:

    SHA256(
      UTF8(JSON.stringify(JSON.parse(fuentes_v1.json))) ||
      bytes(transicion.js) || bytes(entorno.js) || bytes(fuentes.js)
    )

El orden de claves del JSON parseado afecta la identidad; sus espacios externos
no se incluyen. Los tres JS se incluyen como bytes exactos. Un comentario o un
cambio de fin de linea en fuentes.js cambia la identidad, aunque no cambie las
validaciones. Preservar solo fuentes_v1.json no preserva esa huella.

La huella no incorpora directamente iglesia, generacion, epoca ni protocolo;
esos vinculos se validan aparte en transicion.js. Los auxiliares administrativos
adicionales no quedan automaticamente incluidos en la formula actual.

`crearTransicionDemo` llama SIN parametros a verificarFuentes una sola vez al
construirse, antes de leer una ejecucion. El rechazo impide construir la
herramienta y afecta a TODOS sus metodos: preflight, inicializacion, iniciar y
avanzar. La huella resultante queda capturada en el closure.

Las ejecuciones existentes guardan versionEsquema=1, versionProcedimiento=1,
versionAlgoritmo=1, huellaSoftware, identidad de parametros, propietario,
fence, epoca, corte, manifiesto observado, cursor y checkpoint. La generacion
tambien guarda huellaSoftware y debe permanecer inactiva. No existe inventarioId
ni un selector de politica de compatibilidad por ejecucion.

`iniciar` para una ejecucion existente y `avanzar` comparan por igualdad exacta
la huella almacenada con la huella del closure. Avanzar exige ademas la misma
huella en la generacion. Propietario, identidad de parametros, corte, epoca y
fence son controles separados; no reemplazan esa comparacion.

## Bloqueo confirmado sin editar archivos

En memoria se calculo la formula actual y se comparo con el resultado real:

    76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d

Agregar unicamente un comentario hipotetico a los bytes del verificador produjo:

    d5935d56728a996407537e9e703bad9db6c1f478787f313b4efcf6dfd0945691

La igualdad usada por el consumidor pasa a ser falsa. No se creo el archivo
candidato, no se simulo un checkpoint remoto y no se leyo ni escribio Firestore.
La prueba demuestra el cambio de identidad y la incompatibilidad de la
comparacion, no una reanudacion integrada de una ejecucion antigua.

Editar solamente fuentes.js no permite al consumidor elegir entre una ejecucion
historica y una nueva: devuelve una sola cadena antes de conocer el checkpoint.
Devolver siempre la huella vieja calculada con bytes archivados ocultaria que
el consumidor ejecuta otra politica de verificacion. Aceptar ambas de forma
global, filtrar archivos nuevos o ignorar la huella debilitaria los controles.
Duplicar el motor de transicion como workaround tampoco constituye el cambio
minimo y complicaria acreditar que el contrato antiguo permanece inalterado.

El cambio necesario esta en transicion.js, que NO esta autorizado en este paso.
Se aplica la condicion de parada de la fase 2: propuesta sin parche incompatible.

## Estrategia propuesta para un siguiente alcance coordinado

1. Conservar fuentes_v1.json byte por byte. Archivar de forma verificable los
   bytes/descriptor originales necesarios para reproducir su huella historica.
   Una huella conocida representa la identidad de creacion, no debe presentarse
   como huella del runtime nuevo.
2. Introducir inventarios y descriptores inmutables versionados, con un registro
   explicito revisado. Separar: identidad historica de ejecucion, version del
   inventario, identidad de runtime actual y relacion de compatibilidad aprobada.
   El descriptor del runtime debe cubrir tambien sus modulos administrativos
   auxiliares, no solo los tres archivos actuales.
3. Cambiar minimamente el consumidor transicion.js para seleccionar/validar la
   politica DESPUES de leer ejecucion y generacion, dentro de la transaccion.
   Mantener intactos autorizacion de custodia, proyecto/host, protocolo, propietario,
   fencing, corte, seleccion original y reanudacion idempotente.
4. Reconocer legado sin inventarioId solo por una combinacion explicita de
   versionEsquema=1, versionProcedimiento=1, versionAlgoritmo=1 y huella historica
   acreditada coincidente en ejecucion y generacion. Ausencia del campo por si
   sola NO significa V1. No aceptar huellas hexadecimales desconocidas por formato.
5. Para legado, validar una relacion de compatibilidad DECLARADA entre esa
   identidad historica y el runtime aprobado. No cambiar huellaSoftware,
   identificadores, parametros ni contenido persistido para adaptar metadatos.
   La reanudacion ordinaria solo podra avanzar segun el contrato original. No
   rellenar campos de version ni migrar registros antiguos al leerlos.
6. Las nuevas ejecuciones deben declarar inventarioId y version de procedimiento
   propios y registrar la identidad completa de su runtime de creacion. No
   reutilizar la identidad V1 como etiqueta para software nuevo. El checkpoint
   puro del conciliador conserva su contrato; el vinculo de inventario corresponde
   al contenedor de ejecucion/generacion, no requiere modificar FIN-2 a FIN-6.
7. Rechazar inventarios desconocidos, descriptores alterados, fuentes compartidas
   modificadas, archivos adicionales no registrados, estados ambiguos y relaciones
   de compatibilidad inexistentes. Una modificacion del algoritmo/procedimiento
   no se acepta bajo una excepcion generica para agregar archivos.

La compatibilidad debe probar equivalencia del camino historico de transicion,
no solo coincidencia del calculo monetario. No se propone bajar version, copiar
una huella sobre un checkpoint ni actualizar automaticamente el registro.

## Incorporacion futura del escritor V2

Se identifica expresamente como candidato futuro:

    functions/finanzas_core/adaptador_firestore_v2.js

Estado de ese candidato: PENDIENTE, no existente, sin hash acreditado. Este
documento NO constituye una excepcion de ruta ni una autorizacion de contenido.
Si aparece antes de aprobar un inventario que contenga su SHA-256 real, debe
seguir provocando rechazo.

La transicion explicita futura requiere crear el candidato dentro de su alcance,
revisar escritor, imports, condiciones de protocolo/generacion y efectos; medir
el hash real; y aprobar un inventario nuevo exacto con sus pruebas. Las 22
fuentes compartidas deben seguir coincidiendo con V1 para una compatibilidad
basada solo en incorporacion de un archivo. Cambios adicionales requieren otra
revision. No acreditar un hash ficticio, comodines, coincidencia solo de nombre
o hashes calculados automaticamente y aceptados sin revision.

Este registro nuevo NO activara V2 ni declarara autorizada una generacion. V1
continuara denegando escrituras bajo operativo_v2; eso es independiente de la
compatibilidad administrativa. Work y los datos de membresia no se modifican.

## Alcance minimo adicional que falta

- Autorizar cambios acotados en functions/contabilidad_demo/transicion.js:
  seleccion de identidad/politica por ejecucion y validacion de generacion.
- Mantener autorizados fuentes.js, nuevos registros/descriptores versionados,
  pruebas y documentacion. fuentes_v1.json permanece de solo lectura.
- Permitir las pruebas integradas especificas para crear checkpoints con el
  runtime historico original y reanudarlos con el runtime compatible aprobado,
  sin modificar sus documentos para lograr la aceptacion.

No hace falta autorizar cambios de reglas, protocolo V1, motor financiero,
Flutter, membresia, Work ni crear V2 para resolver primero este contrato.

## Plan de pruebas antes de aprobar la implementacion

| Escenario | Resultado requerido |
| --- | --- |
| Inventario V1 y bytes originales | Identidad historica reproducida exactamente |
| Checkpoint V1 original, sin inventarioId | Aceptado solo por relacion explicita compatible |
| Checkpoint/huella/propietario/corte alterados | Rechazo, sin cambios de compatibilidad en datos |
| Inventario o relacion desconocidos | Rechazo |
| Archivo nuevo sin acreditar | Rechazo, tambien con nombre V2 esperado |
| Archivo inventariado modificado | Rechazo |
| Nuevo inventario explicitamente aprobado | Nueva ejecucion con identidad y version propias |
| Ampliacion aprobada con fuentes V1 intactas | Reanudacion antigua sin reetiquetado |
| Algoritmo/procedimiento incompatible | Rechazo, sin reinterpretar checkpoint |
| Dos operadores o dos avances del mismo fence | Un propietario y un avance mas replay historico |
| Respuesta perdida despues del commit | Misma identidad/fence, sin doble avance |
| Otra iglesia, proyecto o host | Rechazo |
| Ruta privada desde SDK cliente | Lectura/escritura denegadas |
| Finanzas y generaciones | Sin escrituras economicas ni activacion V2 |

La fixture historica debe producirse con los bytes originales acreditados y
conservar captura antes/despues de metadatos. No se crea sobrescribiendo la
huella de una fixture nueva. Las pruebas deben distinguir datos reales del
emulador de dobles y pruebas aritmeticas en memoria.

## Validacion de este diagnostico

Se ejecuto npm.cmd test sobre el codigo sin modificar: 1624 pruebas aprobadas,
cero fallidas u omitidas. No son pruebas de una nueva compatibilidad implementada.
No se ejecutan emuladores ni se atribuye a esta fase una reanudacion integrada
despues de ampliar el inventario: esa implementacion esta detenida.

El unico cambio de este paso es este documento. La huella actual y las guardas
de fuentes siguen siendo las originales; fuentes_v1.json permanece intacto.

## Resolucion FIN-7C.4E.0B

Se conserva fuentes_v1.json integro. inventarios/legado_1.json archiva los bytes
originales en base64 de fuentes.js, transicion.js y entorno.js, junto al SHA-256
del inventario y la identidad historica. El verificador reproduce la formula
original y exige exactamente la identidad publicada 76a34072...7670905f89d.
No se acepta una lista de cadenas hexadecimales por declaracion: deben acreditarse
los componentes originales y reproducirse esa identidad completa.

El runtime admin-2 tiene una identidad NUEVA. Su descriptor runtime_2.json fija
hashes exactos de los tres JS administrativos, del archivo historico, del
inventario base y del contrato de cambios. registro.json fija por id el archivo
de descriptor y su SHA-256. No se buscan descriptores automaticamente ni se
admite una version solo por su numero. Cambiar codigo o descriptor sin una
acreditacion revisada rechaza la construccion de la herramienta.

La equivalencia del motor se acredita aplicando nueve sustituciones literales
revisadas a los bytes historicos de transicion.js y comparando el resultado
COMPLETO con el actual. Solo se normalizan CRLF/LF para esa comparacion de motor;
la identidad de runtime usa bytes reales. El contrato de sustituciones tiene su
propio hash fijo en el verificador: actualizar descriptores y hashes NO permite
acreditar un parche distinto. Las sustituciones solo cambian import/seleccion
de identidad, metadatos de nuevas ejecuciones y comprobaciones de identidad.
Las lecturas economicas, consultas, calculos, lotes, escritura, fencing y
recuperacion del motor quedan iguales. Las 22 fuentes compartidas siguen
verificadas de forma exacta. entorno.js debe ser byte por byte el original.

El consumidor obtiene un contexto de fuentes fuera de la transaccion. Dentro
de iniciar/avanzar usa su comprobacion PURA de identidad sobre ejecucion y
generacion ya leidas, sin acceder a archivos ni otros servicios en el callback.
La politica actual admite dos identidades:

- Legado sin etiquetas en AMBOS documentos, con la identidad historica exacta,
  esquema/procedimiento/algoritmo originales y epoca/ruta coherentes. Sus
  huellas, identificadores y etiquetas ausentes permanecen como estaban.
- admin-2, con inventarioId y versionContratoInventario=2 explicitos en AMBOS
  documentos y la huella exacta del descriptor y runtime acreditados.

Etiquetas parciales, inventarios desconocidos, huellas distintas, cambio de
iglesia/epoca, algoritmo o procedimiento y generaciones activas se rechazan.
iniciar sobre legado aceptado es solo consulta y no cambia ni updateTime.
avanzar conserva los metadatos historicos y solo realiza el progreso ordinario
del contrato original; no migra el checkpoint ni rellena etiquetas nuevas.

El cambio en versionContratoInventario no cambia versionProcedimiento=1 ni
versionAlgoritmo=1: estas dos siguen describiendo el motor y el estado economico
sin cambios, cuya equivalencia se verifica. La version de identidad se distingue
explicitamente en registros nuevos. V2 contable sigue sin existir ni activarse.

### Extensiones futuras y rechazos

Una version futura debe tener descriptor nuevo e inmutable, su id registrado y
hashes reales de TODO su arbol de fuentes, incluyendo adiciones. El registro
puede elegir un actual nuevo sin cambiar descriptores publicados. La identidad
de un descriptor no incluye entradas ajenas del registro, para que agregar una
version no reescriba la identidad de otra.

El descriptor seleccionado declara compatibles explicitos. Para versiones
anteriores registradas se verifican sus descriptores originales, el mismo motor
acreditado y todas sus fuentes compartidas. La aceptacion NO se basa solo en un
subconjunto: se compara tambien TODO el arbol real con el inventario actual
seleccionado, y cada adicion debe tener hash acreditado. Si cambia el motor o
una fuente protegida por V1, este contrato no sirve y la reanudacion se bloquea.
No basta actualizar numeros, hashes declarados o la lista de compatibles.

El archivo adaptador_firestore_v2.js figura SOLO en pendientes, sin hash y sin
excepcion de lectura. No existe. Su aparicion no acreditada sigue bloqueando.
La prueba de ampliacion usa un archivo ficticio enteramente simulado en memoria;
no agrega un inventario real, no calcula un hash ficticio para V2 y no demuestra
todavia la compatibilidad de un escritor V2 futuro. Acreditacion de fuentes y
autorizacion para ejecutar un escritor son controles diferentes.

Los JSON revisados y el verificador constituyen una raiz local de confianza del
operador. No son una firma ni una defensa contra alguien que pueda sustituir
todo el codigo y todas sus referencias. Se mantienen custodia externa del
emulador, guardas de destino y rechazo de fuentes no revisadas. No hay comando
de actualizacion automatica de hashes. Toda futura acreditacion requiere revision.

### Recuperacion conservadora

Una identidad no acreditada permanece bloqueada. No copiar la huella aceptada
sobre el registro ni borrar etiquetas, cambiar la epoca o reemplazar el owner.
Conservar ejecucion, generacion, protocolo, checkpoint y fuente economica.
Para un runtime antiguo distinto, localizar y verificar su respaldo original;
preparar una copia de software aislada sin tocar el repositorio vigente y,
bajo custodia exclusiva, utilizarla contra el estado demo original que siga
siendo coherente, con la capacidad original del operador. No se proporciona
un restaurador automatico ni se garantiza que exportar/importar el emulador
conserve updateTime, corte y versiones. Si no puede acreditarse el original o
su estado, detenerse para una recuperacion revisada. No se reinterpretan datos.

Las pruebas ejecutan los bytes historicos acreditados para crear checkpoints
REALES en Firestore Emulator y despues los reanudan con el runtime actual.
No sustituyen una huella en una fixture nueva para fabricar el caso historico.
