# Operación local de V1 incremental

Solo `demo-fesync`, Firestore 8088, Auth 9098 y Functions 5008. No se exportaron
funciones públicas normales. El libro habitual `fin_mvp_demo` conserva sus ocho
movimientos, saldo 118.600 y época 1. Los ensayos crean otras iglesias `fin_release2_*`.

## Inicialización de un libro V1 existente

Requisitos: titular vigente, módulo habilitado, configuración CLP V1, catálogo
y saldos coherentes, resumen del período abierto y marcadores de apertura/reversa.
Un libro vacío debe haber creado su cuenta y resumen cero por el circuito V1;
este procedimiento no inventa documentos faltantes ni repara divergencias.

1. Preparar respaldo del estado que se va a ensayar. El respaldo de código de
   esta intervención está indicado en el informe; no es una exportación Firestore.
2. Autenticarse con un titular ficticio de la fixture. Pausar el protocolo V1
   existente dentro de una transacción autorizada. Los escritores anteriores
   también leen ese documento y dejan de poder confirmar operaciones nuevas.
3. Conciliar: el lector usa páginas de 250 documentos ordenadas por ID y cursor
   DocumentSnapshot. Así también observa documentos sin secuencia y empates que
   un cursor basado solo en secuencia podría ocultar. En memoria los ordena por
   secuencia/ID y entrega las páginas a `conciliarPaginas` sin alterar los documentos.
4. La lectura y comparación se realizan en una transacción Firestore con protocolo
   bloqueado. Se comparan secuencia completa, saldos, resúmenes, aperturas y marcadores
   de reversión. `conciliacion.js` sigue devolviendo `certificacionHistorica: false`:
   se comprueba consistencia observada al corte, no procedencia histórica universal.
5. Inicializar repite la lectura/conciliación para evitar adoptar un informe viejo.
   Solo con resultado sin diferencias y sin una proyección incremental previa crea
   `finanzas_control/incremental_v1`, añade auditoría y activa protocolo V1, época 2.
   No modifica movimientos, recibos ni checkpoints existentes; tampoco sustituye
   saldos o importes del resumen durante la adopción inicial.
6. El escritor antiguo exige época 1 y queda rechazado. El nuevo exige época 2,
   proyección inicial verificada, checksum y revisión coincidentes con el control.
   El checksum detecta alteraciones del estado; no acredita el historial por sí solo.

Si la conciliación falla, el protocolo queda bloqueado. No hay reinicialización,
reparación automática ni cambio automático de época a partir de datos parciales.

Ejemplo para una **fixture V1 aún no migrada**, reemplazando los valores:

```powershell
$iglesiaDemo = 'fin_fixture_a_revisar'
$correoDemo = 'titular@fixture.demo'
node test/finanzas_v1_incremental/mantenimiento.cjs --accion pausar --iglesia $iglesiaDemo --correo $correoDemo
node test/finanzas_v1_incremental/mantenimiento.cjs --accion conciliar --iglesia $iglesiaDemo --correo $correoDemo
node test/finanzas_v1_incremental/mantenimiento.cjs --accion inicializar --iglesia $iglesiaDemo --correo $correoDemo
```

La herramienta usa exclusivamente la contraseña ficticia `SoloDemo123!`, exige
correo `.demo` e iglesia `fin_*` y rechaza variables de proyecto/credenciales ajenas.
No acepta un JSON del cliente afirmando que una proyección está verificada.

## Conciliación posterior y cambio de período

Para un libro ya incremental: `pausar`, `conciliar`, revisar el resultado y
`reanudar`. Reanudar vuelve a conciliar en su propia transacción y solo habilita
época 2 sin diferencias. No se sobrescribe el estado inicial existente.

```powershell
node test/finanzas_v1_incremental/mantenimiento.cjs --accion pausar --iglesia $iglesiaDemo --correo $correoDemo
node test/finanzas_v1_incremental/mantenimiento.cjs --accion conciliar --iglesia $iglesiaDemo --correo $correoDemo
node test/finanzas_v1_incremental/mantenimiento.cjs --accion reanudar --iglesia $iglesiaDemo --correo $correoDemo
```

El cambio de mes exige titular, época 2 operativa y proyección/resumen actual
coherentes. Solo avanza hacia un período nuevo; crea su resumen trasladando los
saldos actuales como iniciales mediante los estados matemáticos existentes.
No reescribe importes del mes anterior. La reversión de un movimiento anterior
se contabiliza en el mes abierto y conserva el original.

```powershell
node test/finanzas_v1_incremental/mantenimiento.cjs --accion periodo --iglesia $iglesiaDemo --correo $correoDemo --periodo 2026-11
```

Crear una cuenta después de varios meses extiende los mapas de los resúmenes
anteriores con cero para esa cuenta nueva; no modifica sus importes o secuencias.

## Límites y recuperación

- Se mantienen 50 cuentas y 50 categorías. No existe el tope 200 en el nuevo
  escritor; no se modificó la constante del adaptador anterior.
- Mantenimiento conserva los límites de las bibliotecas: 20.000 documentos,
  24 períodos y, en el lector, 8 MiB de historial. Superarlos rechaza la operación;
  no produce una conciliación parcial válida. Crear cuenta extiende hasta 24
  resúmenes existentes. El ensayo mayor realizado fue de 1.001 históricos.
- Una proyección ausente, no verificada, con checksum/revisión divergente o un
  saldo/resumen necesario inconsistente impide la escritura. Una alteración de
  un documento histórico que no interviene en una operación se detecta en la
  conciliación completa, no se promete detectarla leyendo solo la proyección.
- No volver a época 1 después de escribir incrementalmente ni borrar el documento
  incremental para resembrarlo. Investigar y conciliar las divergencias con el
  protocolo bloqueado.
- Conservar la solicitud original ante una respuesta incierta. El wrapper MVP
  aún comprueba autorización vigente antes del replay: recuperar una intención
  tras revocación/cambio de pertenencia sigue siendo una limitación previa.

## Historial y compatibilidad

El cliente envía `historialPaginado: true`. La respuesta incluye hasta 50 movimientos,
`historial.corte`, `cursorSiguiente` y `hayMas`. El cursor queda ligado a iglesia,
usuario, pertenencia y tamaño de página; el servidor reautoriza cada petición.
El historial mantiene el corte inicial aunque lleguen operaciones nuevas. Los
totales son actuales de la consulta, no una suma de la página ni una reconstrucción
del corte histórico. La UI indica «Historial hasta #…».

Una aplicación sin soporte paginado recibe
`CLIENTE_HISTORIAL_PAGINADO_REQUERIDO` en época 2. En época 1 se conserva la consulta
anterior, aceptando también la nueva capacidad declarada. Se debe actualizar
cliente y runtime demo juntos; no truncar silenciosamente al cliente antiguo.

Solo se proyectan campos públicos de movimiento, clasificación y descripción.
No se devuelven responsable, huella, precondiciones, solicitud ni datos privados.
El cliente conserva en memoria las páginas cargadas; no se ensayó el rendimiento
de toda una historia extensa en un teléfono físico.

## Repetición del ensayo

Con los emuladores locales ya activos, sin reiniciar ni vaciar la demo anterior:

```powershell
node --test test/finanzas_v1_incremental/integracion.cjs
node test/finanzas_v1_incremental/http.cjs
```

El primer comando crea fixtures nuevas con identificador único. El segundo
comprueba los callables demo por HTTP y que la fixture anterior sigue intacta.
Los datos son efímeros. No se ejecutan migraciones ni despliegues de producción.
