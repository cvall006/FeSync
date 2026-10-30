# FIN-7C.4E.1E — procedencia persistente, sin activación

Procedimiento nuevo y privado para Firestore Emulator, `demo-fesync`, host
`127.0.0.1:8088`, base `(default)`. No inicializa SDK, no tiene endpoints,
activador, migración real o variante de producción. Los módulos anteriores
permanecen intactos. No interpreta sobres D2 o PENDIENTE como este procedimiento.

## Raíz de confianza y acreditación diferida

`runtime.js` exige bytes de un manifiesto y un SHA-256 fijado por un ejecutor
de confianza antes de la ejecución. No calcula una autorización a partir de las
fuentes encontradas. Compara rutas exactas y contenido, rechaza enlaces y emite
una capacidad opaca mantenida en WeakMap; un objeto con campos similares no sirve.
Antes de importar SDKs, el arnés verifica el manifiesto estático revisado
`test/contabilidad_preparacion_acreditada_aislado/runtime_ensayo.json` contra el
digest literal de `autorizacion.js`. No hay comando de autoactualización.
El constructor y cada llamada vuelven a cotejar las fuentes antes de operar.
Los callbacks transaccionales solo comprueban la capacidad ya capturada.

La identidad es `ENSAYO_LOCAL_FIJADO`, inventario `ensayo-fin-1E-1`, contrato 1.
Su digest identifica exactamente el manifiesto del ensayo; no es la fórmula de
identidad administrativa. Persiste también `inventarioCandidato: 'admin-5'` y
`acreditacionAdministrativa: 'PENDIENTE'`. NO se ha registrado admin-5 ni se
reutiliza admin-4. No hay un hash administrativo admin-5 publicado por este paso.
Una futura acreditación debe revisar el código, la política y compatibilidad
explícita; no puede renombrar registros del ensayo o acreditar retrospectivamente
su procedencia. El verificador solo acepta la identidad local fijada por su
propio ejecutor autorizado, no una identidad presentada por el documento.

Esto es procedencia verificable bajo custodia local del ensayo. No es firma
externa ni prueba frente a quien pueda controlar simultáneamente código,
manifiesto, política, Firestore y evidencia. Node, Java, Firebase CLI, SDK,
node_modules y el sistema operativo quedan fuera de esta fórmula. La carga
de módulos y la ausencia de otros Admin forman parte de la custodia externa.

## API y rutas

El ejecutor importa primero `runtime.js`, autoriza el manifiesto y solo entonces
importa SDKs y construye el cliente local. Pasa la capacidad como `runtime` a
`crearPreparador` y `crearVerificador`, junto a `db`, `env` y
`custodia: { verificar: () => booleanoSincrono }`.

Se conservan los parámetros estrictos del preparador aislado: iglesiaId,
ejecucionId, generacionId, capacidad operador hexadecimal de 64 caracteres,
epoca 1, periodoId, pagina 1–50 y lote 1–25. El operador se persiste hasheado.
El llamador conserva la misma intención y el fence para reintentar; no hay TTL,
robo de cerrojo, liberación automática ni creación automática de otro ID.

Debajo de `iglesias/{iglesiaId}` se escriben únicamente:

| Ruta | Propósito |
| --- | --- |
| `finanzas_preparaciones_procedencia_demo/{ejecucionId}` | Sobre nuevo, corte, runtime, checkpoint y estado |
| `finanzas_preparaciones_procedencia_control/cerrojo` | Operador, ejecución, generación, runtime y fence |
| `finanzas_evidencias_preparacion_demo/{ejecucionId}` | Evidencia final privada e inmutable mediante create |
| `finanzas_generaciones_demo/{generacionId}` | Cabecera V2 exacta, `activa:false` |
| `.../{generacionId}/{control,consolidados,periodos,saldos}/...` | Documentos de proyección V2 |

`iniciar(parametros)` crea únicamente destinos ausentes; su repetición valida y
consulta sin reescribir. `avanzar(parametros, fence)` progresa en lotes con
checkpoint y cerrojo en el mismo commit. El resultado expone estado, fence,
cantidad preparada y condición local pendiente; no devuelve fuente privada.
`verificar(parametros)` usa una transacción sin escrituras y devuelve
`DATOS_Y_VINCULO_VERIFICADOS_EN_ENSAYO`, `elegibleActivacion:false` y
`acreditacionAdministrativa:PENDIENTE`. Los errores de transporte no se convierten
en ausencia o divergencia: `E_LECTURA_INCIERTA` / `E_RESULTADO_INCIERTO`.

## Corte, reconstrucción y sellado

Se reutilizan `fuente.js` y `modelo.js` del procedimiento aislado como lectores
y constructores puros/transaccionales; no se llama su coordinador para crear
una ejecución antigua. Se reutilizan conciliación y proyecciones existentes,
sin duplicar fórmulas económicas. V1, recibos reales, reservas, aperturas,
marcadores y proyecciones deben conciliar contra el mismo corte y sus versiones.
Cada avance reconstruye y compara el prefijo del checkpoint; no lo adopta
ciegamente. Los parámetros, runtime, manifiesto y corte permanecen vinculados.

Estados: `conciliando` → `preparando` → `verificando` → `verificada`.
Las divergencias detectadas al procesar el destino pueden dejar `fallida`, sin
repararlo ni eliminar evidencia. Los errores de identidad/fuente previos a ese
punto rechazan sin modificar registros. No hay éxito para una generación parcial.

El último lote NO sella la evidencia: deja `verificando`. En una transacción
posterior se reconsultan cabecera y conjunto exacto de documentos ya confirmados,
incluido su updateTime real, y se cotejan sus contenidos reconstruidos.
`evidencia.js` ordena canónicamente rutas, hashes y versiones. El sello incluye
vínculo completo, procedimiento/esquema/algoritmo/evidencia versión 1, corte,
runtime, parámetros hasheados, checkpoint y fence final.
Se crean evidencia y estado `verificada` junto al avance de fence en un commit.
No se incluye en el hash el updateTime todavía desconocido de ese commit ni
timestamps de servidor pendientes. La evidencia se comprueba exactamente, no
solo recalculando el hash aportado por el documento.

El verificador vuelve a leer fuente, corte, checkpoint, cerrojo, generación y
evidencia en una transacción sin escrituras. Rechaza cambios de versión incluso
si el contenido materializado es igual. `verificada` describe este procedimiento
local; nunca autoriza un gasto V2 ni certifica el creador de registros antiguos.

## Exclusión y límites

En cada intento transaccional se exige protocolo bloqueado y ausencia del
puntero V2. Los escritores cooperantes V1/V2 leen ese mismo protocolo y rechazan
operaciones nuevas. La autorización de miembros/roles no se congela ni se cambia.
Un Admin externo no queda excluido por un documento de bloqueo: es indispensable
custodia exclusiva del emulador y de sus escritores.

Firestore no permite listar nombres de subcolecciones en transacción. Ese
listado se hace bajo custodia, incluyendo padres inexistentes con descendientes
huérfanos, y se rechazan colecciones desconocidas o anidadas. Los documentos
conocidos sí se leen dentro de la transacción. No se afirma una foto global frente
a un Admin concurrente no cooperante.

Se mantienen 50 cuentas, 50 categorías, 200 movimientos, 24 períodos, fuente de
2 MiB y checkpoint/evidencia de hasta 800.000 bytes. La salida materializa el
período abierto y las cuentas; no es una API histórica ni un sistema escalable.
Se observan antecedentes D2 para detectar cambios, pero no se presentan como
una ejecución de origen acreditada. Una futura exigencia de D2 como origen de
activación necesita una referencia explícita y versionada distinta.

No se escribe protocolo, puntero, datos V1, D2 o checkpoints anteriores. Nunca
se cambia a operativo_v2. La conciliación actual continúa limitada a historia
V1: el soporte de libros mixtos V1/V2 y la activación/recuperación quedan fuera.

El inventario exacto candidato, dependencias y límites de revisión se encuentran
en [FUTURO_INVENTARIO.md](FUTURO_INVENTARIO.md). La validación real de este paso
se documenta en el directorio de la suite aislada.
