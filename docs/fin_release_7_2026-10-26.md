# FIN-RELEASE-7 — transporte financiero normal

**Transporte normal integrado; configuración publicable preparada y apagada.**
Se reutilizan `FinanzasMvpService`, la pantalla existente y el backend incremental
compartido. No hay otro motor, otra pantalla financiera ni herramientas
administrativas nuevas. No hubo despliegue, habilitación real ni consulta de
datos de producción. La publicación operativa continúa pendiente.

## Contratos y cliente

Los dos exports normales de `functions/index.js` conservan región
`southamerica-west1` y sus nombres:

| Callable | Entrada | Resultado |
| --- | --- | --- |
| `finanzasV1Consultar` | `historialPaginado:true`; opcionales `contexto`, `limite` (1–50), `cursor` | Contexto obtenido por servidor, permisos, configuración, saldos, resumen y página filtrada con cursor/corte estable |
| `finanzasV1Ejecutar` | Exactamente `solicitudId`, `contexto`, `operacion`, `campos` | Confirmación y datos de resultado según operación; en movimientos, ID/secuencia y `historica` para replay |

Las operaciones siguen siendo cuentas, categorías, apertura, ingreso, gasto,
transferencia, ajuste y reversión. No se añade un callable de inicialización,
activación, auditoría, mantenimiento o cierre. La identidad procede de Auth;
`contexto.iglesiaId/pertenenciaId` es una precondición contrastada con el perfil
actual del servidor, nunca una selección de autorización del cliente.

El servicio usa ahora los nombres V1, también al paginar y recuperar. Continúa
guardando la intención antes de HTTP, conserva el mismo ID/cuerpo/contexto y
escribe el recibo local antes de vaciar el pendiente confirmado. El prefijo de
almacenamiento demo se mantiene para recuperar los pendientes ya existentes.
El modo publicable usa un espacio separado por proyecto
`finanzas-v1-{proyecto}`, sin trasladar intenciones demo a otro entorno.

La pantalla conserva operaciones, permisos y navegación. Se retira el botón que
invocaba `finanzasMvpInicializar`: no existe en la entrada normal. El método
anterior se conserva como rechazo explícito sin llamadas remotas, y la pantalla
indica que la preparación necesita un operador autorizado. La etiqueta demo se
muestra únicamente en demo; el acceso del Dashboard deja de etiquetarse como demo
en todos los entornos. No se implementa aquí ese procedimiento administrativo.

## Selección explícita y prevención de conexiones reales

[Configuración demo](../config/finanzas_v1/emulador.json),
[configuración cliente publicable apagada](../config/finanzas_v1/publicable.json)
y [plantilla de servidor apagada](../config/finanzas_v1/servidor-publicable.env.example).

| Selección | Comportamiento |
| --- | --- |
| Cliente sin selección financiera | Deshabilitado; no se llama a Functions financiero |
| Demo explícita | App `demo-fesync`, debug, host loopback permitido; Auth 9098, Firestore 8088 y Functions **normal 5018** |
| Cliente publicable | Requiere release, proyecto explícito coincidente, demo apagada y permiso local explícito; la configuración entregada contiene permiso `false` |
| Servidor sin selección real | Fuera del circuito demo estricto rechaza antes de Firestore |
| Servidor publicable | Requiere modo `publicable`, proyecto explícito coincidente y `FINANZAS_V1_SERVIDOR_HABILITADO=true`; la plantilla entregada contiene `false` |

En desarrollo `lib/main.dart` exige demo en **todas** las plataformas, antes de
inicializar Firebase, ampliando la restricción que antes solo cubría Android.
El bootstrap conecta todos los SDK necesarios al proyecto ficticio y desactiva
FCM; Storage conserva su destino local sin servicio. Una combinación contradictoria
de host/demo/transporte o demo en release se rechaza antes de inicializar SDKs.
El servicio vuelve a seleccionar explícitamente Functions Emulator en cada
llamada demo; no depende de que la instancia Functions conserve una selección
anterior. Se rechazan proyectos distintos de demo y hosts remotos en ese modo.

Para desarrollo, después de iniciar los emuladores normales, el arranque existente
puede usar:

```powershell
flutter run -t lib/main.dart --dart-define-from-file=config/finanzas_v1/emulador.json
```

No se ejecutó ese comando contra un dispositivo durante esta intervención. El
ensayo automatizado usa la misma selección y ejecuta `main()` desde el test.
La compatibilidad de `FESYNC_FINANZAS_DEMO=true` se conserva: selecciona transporte
emulado por defecto si no se proporciona otro modo explícito. Los antiguos
ejecutores demo de 5008 no son el destino de esta entrada; se usa el ejecutor de
FIN-RELEASE-7, con Functions normales en 5018. Los informes/artefactos anteriores
permanecen como evidencia histórica, no como instrucciones actualizadas de arranque.

Las configuraciones publicables separadas no contienen API keys, credenciales,
fixtures, rutas temporales, URLs locales ni endpoints demo. Contienen solo
selección/proyecto y habilitación falsa. No se modifican las opciones Firebase
preexistentes del resto de FeSync. La plantilla de servidor no se copia a
`functions/.env`: prepararla no aplica variables a un despliegue existente.

## Runtime no emulado y barreras conservadas

`finanzas_v1/entorno.js` separa `entornoOperacion` de la barrera estricta
`entorno`. Consulta, captura, escritor y catálogos usan la primera. Mantenimiento
conserva la segunda **sin cambiar sus bytes ni su política**.

En modo publicable, las operaciones no necesitan Auth/Firestore/Functions Emulator.
Exigen proyecto de servidor válido, no ficticio, coincidente con `GCLOUD_PROJECT`
y con `GOOGLE_CLOUD_PROJECT` si existe; si existe `FIREBASE_CONFIG`, su `projectId`
debe coincidir. Se rechazan variables de emulador, tokens manuales y rutas de
credenciales. La autorización de una identidad de servicio gestionada sigue
correspondiendo al entorno de despliegue futuro, no a una clave incluida aquí.

Antes de cualquier lectura de Firestore, la envoltura normal vuelve a comprobar
entorno y Auth. El código transaccional que protege cada consulta, captura,
escritura y replay permanece igual: UID y perfil actuales, iglesia/titular real,
encargo vigente y permiso por acción, pertenencia y versiones actuales, módulo,
gate privado exacto `publicacion_v1`, protocolo de época 2, proyección sellada,
configuración y resumen/período coherentes. V2 sigue rechazado en el circuito V1.
Flags, roles o identidades incluidos en el formulario no conceden permiso.

La habilitación global de servidor **no reemplaza** la habilitación privada por
iglesia. Ausente, falsa o malformada sigue denegando lectura/escritura/replay.
No se crea automáticamente al desplegar ni existe una ruta cliente que la active.
Las pruebas de modo publicable usan un DB transaccional local de prueba, sin SDK
de red: aun simulando la habilitación global, el gate ausente/falso impide las
operaciones y no produce escrituras. No se conectó el modo publicable a Firebase
real ni se afirma un ensayo de infraestructura Cloud desplegada.

## Evidencia y validación

| Ejecución | Resultado |
| --- | --- |
| `npm.cmd test` final | **1.783 aprobadas**, cero fallos/omisiones |
| Reglas locales | **92 aprobadas**: 46 financieras, 13 privacidad/regresión y 33 pertenencia |
| Integración normal final | **25 aprobadas**, 24 escenarios y contenedor |
| Flutter general | **450 aprobadas**, cinco omisiones intencionales de emuladores |
| Flutter relevante tras el último refuerzo de transporte | **20 aprobadas** |
| Configuración y bloqueo de `main` sin demo | **4 aprobadas** |
| Navegación conectada desde `main.dart` | **1 aprobada** |
| Autoprueba de bloqueo TCP/HTTP2 | **1 aprobada**, sin sockets reales |
| Flutter analyze de cierre | **Sin incidencias** |

Las suites finales terminaron con salida 0. Las pruebas relevantes/configuración
se solapan con la suite general y no se suman como pruebas únicas adicionales.

[Resultados estructurados](fin_release_7_2026-10-26/validacion.json),
[Node final](fin_release_7_2026-10-26/npm-test-final.log),
[reglas](fin_release_7_2026-10-26/reglas.log),
[Flutter general](fin_release_7_2026-10-26/flutter-test.log),
[Flutter relevante final](fin_release_7_2026-10-26/flutter-relevante-final.log),
[configuración y bloqueo de main](fin_release_7_2026-10-26/flutter-config-final.log),
[análisis](fin_release_7_2026-10-26/flutter-analyze-cierre.log),
[integración final](fin_release_7_2026-10-26/integracion-final.log),
[escenarios](fin_release_7_2026-10-26/emulador.json) y
[navegación y destinos de red](fin_release_7_2026-10-26/flutter-navegacion.json).

La integración normal conserva 24 escenarios más contenedor: gate apagado y
fixture habilitada, ocho acciones, paginación, más de 1.000 movimientos,
idempotencia, concurrencia, respuesta perdida, revocación actual y entre captura
y commit, miembro/líder, otra iglesia/pertenencia, titular incoherente, privacidad,
continuidad mensual y adopción verificada. Las reglas corregidas de FIN-RELEASE-6
se ejecutan sin cambios: 46 financieras, 13 de privacidad/regresión y 33 de
pertenencia. Las rutas privadas siguen respondiendo 403, también con gate activo.

El nuevo ensayo Flutter ejecuta `lib/main.dart::main()`, RootGate, Dashboard y la
pantalla financiera reales, con `FinanzasMvpService()` **sin inyectar llamadas ni
renombrar endpoints**. Comprueba selección SDK de región/origen normal, abre la
pantalla desde la tarjeta, consulta, registra un gasto, descarta su respuesta,
recrea el servicio, recupera el recibo y pagina. Se observa saldo 10.198 → 10.187,
un movimiento y replay histórico. El almacenamiento se sustituye en el canal de
plataforma del test; no se afirma un reinicio físico ni prueba del almacén seguro
nativo. Las operaciones restantes se ejercitan por los callables en la suite Node
y las pantallas existentes en Flutter general/relevante.

Los plugins FlutterFire usan adaptadores de plataforma exclusivos de prueba que
envían HTTP real a Auth, Firestore y Functions Emulator y comprueban los parámetros
recibidos del SDK. No se sustituye autorización backend ni se inyecta un servicio
financiero en la interfaz. Esto verifica la integración de aplicación y contrato;
**no acredita los binarios nativos Firebase de Android/iOS ni un navegador nuevo**.

La prueba Flutter permite únicamente HTTP a `127.0.0.1` en 9098/8088/5018, rechaza
redirecciones y registra esos tres destinos. El preload Node del ensayo final
bloquea sockets TCP y HTTP2 fuera de loopback, incluido el caso de argumentos ya
normalizados. [Autoprueba del guard](fin_release_7_2026-10-26/red-test-final.log).
No se observan conexiones a servicios Firebase externos en el circuito final
validado. El aislamiento se refiere a los procesos/rutas ensayados, no a una
captura global de tráfico del sistema operativo ni a otras aplicaciones del PC.

Se conservan los intentos anteriores: el primer descubrimiento de Functions agotó
su timeout y la integración falló porque no había funciones cargadas. El siguiente
completó contratos y navegación. Una autoprueba adicional detectó que el guard de
sockets no reconocía argumentos normalizados y produjo un intento TCP fallido,
sin envío de petición Firebase ni consulta de datos; no se usa ese intento como
evidencia de aislamiento. Se corrigió y se repitió la integración completa. La
autoprueba final sustituye además la conexión base para no abrir sockets aun si
el guard volviera a fallar. No se ocultaron esos logs ni se relajó el backend.

## Paquete revisable e integridad

[Runtime candidato y configuración Functions](fin_release_7_2026-10-26/paquete/firebase.json)
y [manifiesto con hashes](fin_release_7_2026-10-26/paquete-manifest.json).
El ensamble offline contiene 29 fuentes/archivos de Functions, todos los módulos
V1 y los 23 exports originales. Incluye mantenimiento como fuente conservada,
pero no lo exporta ni lo habilita fuera de demo. No incluye fixtures, tests,
herramientas demo, credenciales ni `node_modules`; las dependencias de ejecución
se resuelven desde el lock intacto. Las referencias a emuladores en la validación
compartida no constituyen un servicio requerido para la rama publicable.

El manifiesto incluye hashes de las configuraciones publicables y de los cinco
archivos de aplicación del transporte. No se ejecutó CLI de deploy ni se usó el
directorio amplio de Functions como sustituto del cierre revisado. El artefacto
de FIN-RELEASE-5 se conserva intacto y ya no describe estos bytes nuevos.

[Respaldo inicial verificado](fin_release_7_2026-10-26/respaldo.json),
[integridad final](fin_release_7_2026-10-26/integridad.json),
[diff de esta intervención](fin_release_7_2026-10-26/intervencion.patch),
[archivos nuevos](fin_release_7_2026-10-26/archivos-nuevos.json) y
[estado Git](fin_release_7_2026-10-26/git-status.txt).

Los 13 archivos existentes modificados son: `finanzas_publicacion.js`, seis
archivos de `finanzas_v1` distintos de mantenimiento; bootstrap Firebase,
`lib/main.dart`, servicio/pantalla financieros; test de pantalla y harness de
integración normal. Los nuevos archivos son configuración de transporte y
plantillas, pruebas/ejecutores locales y este informe con evidencia. Las listas
exactas y hashes están en integridad/manifiesto.

Permanecen iguales HEAD, rama e índice; también reglas Firestore/Storage,
`functions/index.js`, dependencias, motor `finanzas_core`, mantenimiento, V2,
inventarios, Work, migración de membresía e informes previos. Se conserva la
eliminación Kotlin inicial. El único aviso de `git diff --check` continúa siendo
el espacio preexistente de `functions/index.js:2037`.
De las 699 rutas iniciales, 685 archivos conservan sus bytes, cambian los 13
enumerados y se mantiene una eliminación previa; no falta ningún archivo inicial.

## Riesgos restantes y próxima acción

1. La preparación/adopción real, conciliación y continuidad mensual necesitan
   todavía un procedimiento y herramientas autorizados. Este trabajo no los abre.
2. Una intención sin commit puede quedar bloqueada por cambio de período/acceso.
   Se conserva y no se repite con otro ID; falta una resolución operativa aprobada.
3. Las reglas remotas, destino desplegado, IAM y estado de datos reales son
   desconocidos. La corrección local de privacidad no equivale a reglas desplegadas.
4. Falta un smoke test del transporte nativo del dispositivo soportado contra
   emuladores y la autorización expresa para cualquier configuración/uso real.
   Cliente y servidor publicables permanecen apagados, además del gate por iglesia.

La próxima acción es revisar y autorizar el alcance operativo que falta, sin
habilitar Finanzas ni copiar estas plantillas a un despliegue por iniciativa del
cliente. No se solicita aquí autorización de publicación ni se continúa otra fase.

Para repetir los ensayos locales con herramientas ya instaladas:

```powershell
node test/finanzas_release7/iniciar.cjs
node test/finanzas_release7/reglas.cjs
node --test test/finanzas_release7/red_test.cjs
npm.cmd --prefix functions test
node test/finanzas_release7/paquete.cjs
```

**FIN-RELEASE-7 finalizado. Sin despliegues de Functions/reglas/cliente, acceso a
producción, habilitación de iglesia real, dependencias nuevas, commits ni cambio
de rama.**
