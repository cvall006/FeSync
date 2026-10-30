# Migración administrativa de pertenenciaId — SOLO EMULADORES

Herramienta local de FeSync para `demo-fesync`, Firestore en `127.0.0.1:8088` y
base `(default)`. No tiene destino configurable, modo de producción, credenciales,
deploy, importación de archivos ni inicialización de la aplicación Flutter.

Reutiliza **sin modificar** el motor `functions/migraciones/pertenencia_ejecucion.js`,
el clasificador y el simulador actuales. No cambia contratos de membresía, fuentes
financieros FIN-2 a FIN-5, Flutter, reglas ni configuración Firebase existente.
Las únicas escrituras de la herramienta son:

- Asignación de `pertenenciaId` en un perfil candidato, mediante el motor original.
- Creación de `migraciones_pertenencia/{uid}`, en el mismo commit que el ID.
- Coordinación privada en `herramienta_migracion_demo/{checkpoint}`.

No modifica roles, iglesias, titularidad, tokens o permisos financieros. El
adaptador transaccional restringe explícitamente las rutas y escrituras del motor.
Las fixtures de pruebas crean/cambian exclusivamente datos sintéticos; esos
cambios no forman parte del algoritmo administrativo.

## Procedencia y revisión

Base recibida: `FeSync_Work_FIN5_20261017.zip`.
SHA-256: `6d7104ccb06e6db711060657fdd86d3960088b1c300490a8ca9cfa6b81302715`.
CRC correcto y 7.043 entradas verificadas contra el manifiesto incluido en el ZIP.
La entrada del manifiesto no se incluye a sí misma. Se preservó el ZIP original.

Rama `integration/adora-live`, HEAD `01223cd990312677ebbef2892ae7e99b1109e272`.
La evidencia recibida registra 18 modificados y 97 entradas sin seguimiento con
la configuración de líneas de Windows. La comparación de fuentes se realiza por
bytes contra el ZIP; no se confunden diferencias de CRLF con cambios de negocio.
No se creó un commit ni se cambió de rama o se aplicó un parche a archivos existentes.

Se revisó el plan `FeSync_plan_transicion_migracion.md` entregado en la conversación.
Su pendiente de recepción queda cubierto por este nuevo ZIP; no se tomó como base
la copia anterior de Work. El plan no se implementa como herramienta real de producción.

## Requisitos

- Node 24 y dependencias exactas de `functions/package-lock.json`, incluidas las de desarrollo.
- Java 21 y Firebase CLI local compatible con Node 24. La validación utiliza CLI 15.34.0.
- Para la regresión de reglas: dependencias del lockfile en `test/capacitaciones_rules/`.
- Puertos locales 8088, 9098, 9198, 4408, 4508 y 9150 disponibles.

La herramienta no instala paquetes ni autentica al operador. Si falta una
dependencia, detener y preparar el entorno local fuera de cualquier producción.
Para reconstruir las dependencias desde los locks en una copia independiente:

```powershell
npm.cmd --prefix functions ci --ignore-scripts
npm.cmd --prefix test/capacitaciones_rules ci --ignore-scripts
```

Las guardas rechazan proyectos ajenos, hosts no canónicos, otra base, variables
de credenciales conocidas y FIREBASE_CONFIG con campos adicionales. No buscan ADC:
Firestore utiliza un cliente OAuth vacío explícito y el host local sin TLS.
Una terminal con configuración de otro proyecto se rechaza; no quitar guardas.

## Uso operativo en demo

Trabajar desde la raíz de **la copia independiente**. No utilizar datos reales,
ni siquiera importados previamente al emulador. La sesión comienza vacía; las
fixtures se preparan por separado en los ensayos. No se puebla ni borra la base
automáticamente al ejecutar un modo administrativo.

### Terminal A: sesión de Emulator Suite

```powershell
node herramientas/migracion_demo/iniciar.js
```

Arranca Auth, Firestore y Storage con la configuración nueva y fija
`firebase.migracion-admin-demo.json`. No inicia Functions, no exporta triggers ni
necesita FCM. El entorno CLI es mínimo, con configuración temporal aislada y
FIREBASE_CONFIG explícito que contiene únicamente el proyecto demo. No reutiliza
sesiones de Firebase CLI del usuario ni añade destinos alternativos.

### Terminal B: operaciones

Preparar una terminal local sin credenciales y establecer:

```powershell
$env:GCLOUD_PROJECT = 'demo-fesync'
$env:GOOGLE_CLOUD_PROJECT = 'demo-fesync'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088'
$env:FIREBASE_CONFIG = '{"projectId":"demo-fesync"}'

node herramientas/migracion_demo/cli.js preflight
node herramientas/migracion_demo/cli.js simular --limite 100
node herramientas/migracion_demo/cli.js aplicar --checkpoint ensayo-01 --lote 5
node herramientas/migracion_demo/cli.js reanudar --checkpoint ensayo-01 --lote 5
node herramientas/migracion_demo/cli.js verificar --checkpoint ensayo-01 --limite 100
```

En Bash usar `export VARIABLE=valor` en lugar de las asignaciones PowerShell.
El proyecto y host no son argumentos de la herramienta. No existen flags de
credenciales, importación, reset, cambio de destino o desbloqueo forzado.

| Modo | Comportamiento |
| --- | --- |
| preflight | Comprueba guardas, configuración efectiva y una lectura acotada; no crea checkpoint |
| simular | Reutiliza simulador, con páginas de hasta 20; solo lecturas y métricas |
| aplicar | Crea un checkpoint nuevo; rechaza uno existente, incluso completado |
| reanudar | Exige checkpoint existente y conserva cursor/selección/versiones originales |
| verificar | Recorre perfiles y comprobantes de forma acotada; consulta el checkpoint si se indica; no repara ni escribe |

Una invocación de aplicar/reanudar procesa **como máximo un lote**. Repetir reanudar
explícitamente hasta `completa:true`, revisando los resultados. Para un repaso
desde el inicio, elegir un checkpoint nuevo; no borrar ni reutilizar el anterior.

| Opción | Predeterminado | Límite |
| --- | ---: | --- |
| --lote | 5 | Entero 1–20; perfiles por invocación de aplicación |
| --limite | 100 | Entero 1–2000; perfiles/comprobantes por recorrido de lectura |
| --reserva-ms | 15000 | Entero 1000–60000; duración renovada en cambios de checkpoint |
| --checkpoint | Sin valor | Obligatorio para aplicar/reanudar; letra inicial y hasta 48 caracteres ASCII de letras minúsculas, números, guion o guion bajo |

No se imprime el nombre del checkpoint ni identificadores de los perfiles. Usar
nombres impersonales. Un límite alcanzado nunca representa cobertura completa.
La reserva no impone un límite de tiempo total al SDK: una solicitud puede tardar
más y perder la reserva, dejando una confirmación por conciliar.

## Checkpoint, dos operadores y reanudación

El documento privado conserva la selección exacta antes del motor, incluyendo
UID, iglesia y updateTime con segundos/nanosegundos, además de cursor, estado,
propietario aleatorio, generación `epoca`, vencimiento y huella de código.
No almacena formularios, nombres, correos, tokens ni documentos financieros.

La huella vincula el motor, generador/clasificador/simulador y protocolo de la
herramienta. Normaliza CRLF a LF para no cambiar por el sistema operativo. Si
cambia código relevante, un checkpoint anterior se rechaza; no existe opción de
aceptar una huella incompatible silenciosamente.

La reserva se adquiere en transacción y usa `readTime` del servidor local, no
el reloj del operador. Otro operador sobre el mismo checkpoint recibe
`CHECKPOINT_OCUPADO` mientras siga vigente. Después del vencimiento puede tomarlo
mediante reanudar, incrementando la generación y conservando la selección original.

La comprobación de propietario, generación y selección forma parte de **la misma
transacción Firestore que ejecuta el motor**. No es solo un lock en memoria o una
comprobación previa vulnerable a carreras. El cambio de propietario obliga a
revalidar la transacción anterior. El dueño viejo tampoco puede avanzar el cursor
ni liberar una reserva del dueño nuevo. Dos checkpoints distintos pueden competir
por un perfil: el motor original sigue decidiendo una única asignación.

Se avanza el cursor solo después de un resultado verificable no conflictivo.
Error, conflicto o revisión del candidato dejan selección y versión intactas.
Una actualización auxiliar puede invalidar la selección: reanudar no toma otra
versión automáticamente. El recorrido sigue clasificando los no candidatos sin
repararlos y cuenta los que requieren revisión.

### Caída después del commit

1. Mantener abierto el emulador. Conservar checkpoint y comprobante.
2. Si la reserva todavía figura activa, esperar a que venza; no editarla.
3. Ejecutar reanudar con el mismo nombre. No volver a aplicar ni crear otra clave
   para ocultar el resultado incierto.
4. La selección original puede devolver omitido porque el primer proceso ya
   confirmó. No renueva ID ni comprobante. Verificar la evidencia persistente.
5. Si hay conflicto, corrupción o huella distinta, detener y revisar. No borrar
   IDs, comprobantes o checkpoints como compensación.

La prueba de caída mata realmente un proceso hijo después del commit y antes
del avance del checkpoint. Se ensayan tanto propietarios concurrentes como un
propietario viejo que vuelve después de un takeover. No se pretende haber probado
todos los órdenes posibles de red, bloqueos o caída del sistema operativo.

## Resultados, privacidad y códigos de salida

La CLI imprime JSON con métricas agregadas, estados o códigos cerrados. No muestra
mensajes originales de excepciones, stacks, documentos, rutas privadas ni tokens.
Preflight añade constantes del entorno demo y una huella de código, sin datos personales.
Los checkpoints/comprobantes son privados bajo las reglas existentes, sin modificarlas.

- `0`: operación finalizada; en simulación/verificación, **completa significa
  cobertura del recorrido**, no ausencia de anomalías ni autorización de producción.
- `2`: lote/recorrido incompleto o checkpoint aún no completado. Reanudar/revisar límites.
- `3`: ejecución detenida por error/conflicto/revisión del candidato.
- `20`: guarda, argumento, conexión local, checkpoint, reserva o cierre fallidos.

Las métricas de la invocación no son un ledger de commits. No sumar reintentos,
callbacks o repeticiones como asignaciones distintas. Verificar comprobantes.
`requiereRevision` separa anomalías observadas de cobertura del recorrido.
Un comprobante histórico no acredita legitimidad ni permisos del período actual.

| Error/estado | Tratamiento |
| --- | --- |
| CREDENCIALES_PROHIBIDAS, PROYECTO_PROHIBIDO, HOST_PROHIBIDO, BASE_PROHIBIDA, CONFIG_PROHIBIDA | No se opera. Usar entorno demo limpio; no relajar guardas |
| ENTORNO_INCOMPLETO, CLIENTE_PROHIBIDO | Revisar variables/destino y versión SDK; no usar configuración de la app |
| ARGUMENTOS_INVALIDOS, OPCIONES_INVALIDAS, CHECKPOINT_NOMBRE_INVALIDO | Corregir entrada antes de cualquier nueva operación |
| CHECKPOINT_EXISTE / CHECKPOINT_AUSENTE | Elegir el modo correcto; no sobreescribir o reconstruir historia |
| CHECKPOINT_OCUPADO | Otro propietario conserva la reserva; esperar/revisar, sin force |
| RESERVA_PERDIDA, SELECCION_CAMBIADA | Operador actual detenido; conciliar estado persistente, no avanzar desde memoria |
| CHECKPOINT_INVALIDO, EPOCA_AGOTADA, RELOJ_SERVIDOR_AUSENTE | No recuperable automáticamente. Preservar evidencia y revisar |
| CONFLICTO, REVISION | No refrescar versión ni sanear datos automáticamente; revisar selección y origen |
| ERROR_MOTOR, ERROR_LOCAL, CIERRE_LOCAL_FALLIDO | Resultado potencialmente incierto; conservar selección, verificar/reanudar con precaución |
| RUTA_PROHIBIDA, ESCRITURA_PROHIBIDA | El adaptador bloquea la operación; el motor informa error genérico y no se permite una escritura fuera de alcance |

## Pruebas

No ejecutar junto con otra suite o sesión que utilice los mismos puertos/datos.
El modo de pruebas **vacía exclusivamente el demo local entre escenarios**:

```powershell
node herramientas/migracion_demo/iniciar.js pruebas
npm.cmd --prefix functions test
```

El ejecutor incluye guardas nuevas, integración de la herramienta y regresión
existente del simulador/motor/reglas 6B/Finanzas/Capacitaciones/Storage, todas
secuenciales. La salida se limita a contadores, ordinales y categorías de fallo;
una suite fallida detiene la corrida sin repetición automática. No ejecuta Flutter.

Los ganchos programáticos de antes/después del motor se reservan a las pruebas de
fallos; no están expuestos por la CLI ni modifican handlers o transacciones del motor.
La carrera de reingreso de la herramienta usa cambios de estado de fixtures por
SDK contra Firestore real del emulador. **No se presenta como un nuevo ensayo de
callables Auth/Functions**. El historial de 171 escenarios recibido tiene otro alcance.

## Límites y trabajo antes de cualquier diseño de producción

- Solo demo local; ni IAM, cuotas, durabilidad, respaldo gestionado ni recuperación
  de datos reales quedan acreditados. Preflight no certifica seguridad global.
- Cerrar/reiniciar el emulador sin preservar su estado pierde datos y checkpoints.
  Esta herramienta no exporta/importa ni recupera el proceso entero de Emulator Suite.
- No hay una fotografía global: cambios detrás del cursor requieren repaso y
  simulación final. Lecturas y verificación son acotadas, no atómicas entre sí.
- El motor conserva IDs existentes e inconsistencias; formato válido no demuestra
  origen servidor. No crea recibos de ingreso ni inventa períodos pasados.
- No resuelve clientes antiguos, distribución, FCM, designaciones históricas,
  transición de reglas o FIN-4/FIN-5. No modifica permisos para facilitar ensayos.
- La reserva protege operadores que usan esta herramienta; un desarrollador con
  acceso Admin directo al emulador puede alterar sus documentos. No es un modelo
  de autorización administrativa de producción.
- La comprobación del cliente usa propiedades internas del SDK normalizadas en
  la versión instalada; una actualización requiere revalidar y puede fallar cerrada.
- No se ensayaron dispositivos, Windows nativo, FCM ni cada interleaving. La caída
  probada es del proceso coordinador, con el emulador permaneciendo activo.
- Antes de producción: otro diseño y herramienta independiente, autorización
  explícita, IAM temporal, responsables, inventario, respaldo/restauración probada,
  control de versiones, auditoría y estrategia de recuperación de permisos.
  **No crear una variante real quitando estas guardas o cambiando demo-fesync.**


## Validación registrada en este encargo

| Suite | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Node existente de la base FIN-5 (`functions`) | 940 | 0 | 0 |
| Guardas de la herramienta | 26 | 0 | 0 |
| Integración nueva de la herramienta | 21 | 0 | 0 |
| Regresión existente con emuladores | 104 | 0 | 0 |

El ejecutor demo final terminó con código 0: 151 casos en total, de los cuales
26 son guardas locales y 125 utilizan servicios emulados. No se suman otra vez
los intentos o corridas parciales previos. El Node 940 se ejecutó sobre esta base
vigente; los logs históricos 691/431/171 recibidos no se presentan como reejecutados.
No se ejecutaron nuevas pruebas Flutter ni el ensayo de Functions completo.

Las 21 pruebas nuevas incluyen los cinco modos CLI entre procesos, límites,
lecturas sin escrituras, invariantes de perfiles/iglesias/Finanzas ficticia,
repetición, repaso, conflicto y versiones originales, reingreso a la misma/otra
iglesia mediante fixtures, comprobante existente, dos coordinadores independientes,
reserva ocupada también entre dos procesos independientes, fencing tras takeover, caída real post-commit, corrupción,
historia de comprobantes, protección de datos en stdout y reglas privadas con Auth
sintético. Los campos/versiones previos de iglesias y centinelas financieros se
compararon antes/después; no basta solo la ausencia de errores.

Herramientas: Node 24.19.0, Firebase CLI 15.34.0, JRE Zulu 21.0.6,
Firestore Emulator 1.22.0, Storage Rules Runtime 1.1.3. Las descargas de los JARs
se verificaron contra SHA-256 publicados por la CLI; las dependencias se instalaron
por los lockfiles existentes, sin modificarlos.

Incidencias de preparación conservadas:

1. Descarga CLI del JAR fallida: se obtuvo el mismo JAR oficial y se comprobó su hash.
2. JRE reutilizada inválida (`ClassFormatError`): se preparó una JRE independiente
   desde un archivo cuya integridad fue verificada. No se cambió código para ocultarlo.
3. La CLI inyectaba FIREBASE_CONFIG con campos adicionales: la guarda abortó.
   El launcher ahora proporciona explícitamente solo demo-fesync; no se relajó la guarda.
4. Al añadir la regresión, una guarda heredada exigió el host Functions. Se declara
   el host fijo 127.0.0.1:5008 sin iniciar Functions ni llamarlo; la regresión posterior pasó.
5. En la corrida final Storage emitió un aviso de evaluación `Null value error`
   en storage.rules:48. Las 104 regresiones aprobaron; el aviso queda registrado,
   sin modificar reglas ni atribuirle una causa productiva no demostrada.

**Cierre:** todos los archivos fuente/configuración anteriores permanecen idénticos
por SHA-256; los 30 archivos con rutas financieras del árbol recibido se conservaron.
Solo se añaden la herramienta, sus pruebas/documentación y una configuración nueva
para emuladores. No se operó sobre el repositorio principal, producción o datos reales.
