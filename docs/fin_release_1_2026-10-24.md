# FIN-RELEASE-1: preparación sin despliegue

Finanzas V1 es reutilizable y está integrado al Dashboard, pero **todavía no es
publicable**. Esta revisión no exportó endpoints financieros nuevos, no habilitó
el módulo en producción y no cambió el motor ni sus límites.

Se revisaron el [informe de consolidación](fin_mvp_consolidacion_2026-10-24.md),
el estado Git y las entradas reales del repositorio. Los cambios locales previos
se conservaron: de 544 archivos iniciales, 538 quedaron idénticos y solo cambiaron
los seis indicados abajo; no se eliminó ninguno.
[Comparación SHA-256](fin_release_1_2026-10-24/integridad.json).

## Entrada mínima y reutilización

| Callable | Runtime demo | Entrada normal `functions/index.js` |
| --- | --- | --- |
| `finanzasMvpConsultar` | Sí: contexto, permisos, catálogo, resumen e historial | No exportado |
| `finanzasMvpInicializar` | Sí: libro vacío CLP y período inicial; exige fixture autorizada | No exportado |
| `finanzasMvpEjecutar` | Sí: las ocho operaciones V1 | No exportado |
| `actualizarEncargadoFinanciero` | Reutiliza `functions/finanzas.js` | Ya conectado |
| `actualizarEstadoModuloFinanzas` | Reutiliza `functions/finanzas.js` | Ya conectado |

Los tres primeros son el mínimo para el flujo actual; los otros dos ya existen.
Conservar nombres y contrato evita romper el cliente FIN-MVP. La región actual
es `southamerica-west1`.

Para una integración futura se debe **extraer la misma fábrica `crearApi`** de
`functions/test/finanzas_mvp_runtime/api.js` a un módulo privado normal, manteniendo
el runtime demo como adaptador. Reutilizar `crearAdaptadorFirestore`, autorización,
asientos, correcciones, recibos y protocolo V1. No importar el `index.js` demo
desde la entrada normal: inicializa Admin para `demo-fesync` y exige emuladores.
Tampoco quitar su guardia para desplegarlo.

El inicializador real necesita conservar autorización de titular, módulo
habilitado, libro vacío, ausencia de V2 y prohibición de reinicializar. El marcador
`finanzas_mvp_fixtures` debe seguir siendo exclusivo de pruebas: no copiarlo a
producción ni introducir otro mecanismo de acreditación. Nada de esta extracción
o futura exportación se implementó todavía.

## Autorización y escritura revisadas

La identidad procede de `request.auth`, nunca del formulario. Dentro del mismo
intento transaccional se leen actor, iglesia, titular y configuración de acceso.
Se exige titular coherente con `adminUid`, rol y congregación; pertenencia vigente
y su ID; módulo habilitado; y, para el encargado, designación vigente. El encargado
solo obtiene lectura, ingresos/gastos, transferencia y preparación de cierre;
ese último permiso no significa que exista un flujo público de cierre.

El escritor vuelve a comprobar permisos y versiones, período y protocolo
`operativo_v1`, versión 1, época 1. Conserva secuencia, huella, original inmutable,
control de reversión única, recibo e idempotencia. Movimiento, saldos, resumen y
auditoría se escriben desde servidor en una transacción. Flutter solo llama
callables y persiste intenciones/recibos **locales**; no escribe documentos
financieros con el SDK cliente. Las reglas locales deniegan esas escrituras.

La desvinculación del backend actual coordina revocación financiera. Algunos
comentarios históricos aún describen una situación anterior; la conclusión se
basó en código y pruebas actuales. No se consultaron reglas ni datos desplegados.

## Bloqueos para publicar

1. **Capacidad global del libro.** Continúan 50 cuentas, 50 categorías y 200
   movimientos, contando todas las fechas y meses. Cada escritura monetaria lee
   y reconstruye el historial completo. Con 199 movimientos se admite el número
   200; con 200 se rechaza cualquier movimiento nuevo, incluida una anulación.
   El original no se elimina para liberar cupo. Abrir otro mes tampoco lo libera.
   La consulta aún puede leer exactamente 200; crear catálogo conserva sus propios
   límites. No se amplió ninguna constante.
2. **También hay límites de tamaño.** El adaptador limita lecturas a 2 MiB y la
   consulta demo limita cada colección a un cuarto de ese tamaño. Subir 200 no
   elimina esos límites ni el coste de reconstrucción y contención del historial.
3. **Recuperación pendiente.** El adaptador admite replay de un recibo confirmado
   propio, pero el wrapper `ejecutar` comprueba autorización/contexto antes de
   llegar a él. Tras revocación o cambio de pertenencia puede impedir recuperar
   ese resultado histórico. El cliente conserva la intención ante cualquier
   excepción y bloquea nuevas solicitudes; no debe borrarse ni regenerarse la
   clave para sortear el problema.
4. **Continuidad mensual.** El inicializador abre un solo mes y no hay callable
   normal/MVP para avanzar el período. Los validadores permiten como máximo un
   mes abierto. Se necesita una operación administrativa de período, con los
   validadores existentes, antes de prometer uso continuo. Cambiar de mes no es
   una solución al límite global de movimientos.
5. **Entrada real y cliente publicable pendientes.** Faltan la extracción anterior,
   la consulta paginada compatible, la separación de persistencia por proyecto y
   la validación Android ya documentada. No se produjeron APK ni capturas Android
   en esta tarea.

La prueba nueva reproduce el gasto número 200 y verifica que su anulación falla
en octubre y noviembre, sin escrituras adicionales ni cambios al original. Es
una prueba Node con doble MVCC, no una medición de carga sobre Firestore real.

## Cambio mínimo propuesto para crecer dentro de V1

Modificar el **adaptador V1 existente**, sin otro motor ni colecciones V2:

- Sustituir la lectura de todo `finanzas_movimientos` en cada escritura por
  lecturas acotadas de control, cuentas/categoría necesarias, saldos y resumen
  del período; para anular, leer original y `finanzas_reversiones/<originalId>`.
  Actualizar saldos y resumen por el delta del nuevo asiento, con enteros seguros,
  dentro de la misma transacción que crea movimiento, auditoría y recibo.
- Mantener todas las comprobaciones de autorización, versiones, protocolo,
  apertura única, saldo, secuencia y reversión única. Los saldos y resúmenes V1
  existentes serán la base; no convertirlos al formato de proyecciones V2 ni
  añadir marcadores para habilitar el escritor.
- Separar historial y totales: paginar por secuencia con cursor estable, obteniendo
  los totales de saldos/resumen del servidor. Nunca calcular el saldo con una
  página de historial ni truncar silenciosamente la respuesta a clientes antiguos.
  Reutilizar la pantalla de historial con carga de páginas, sin rediseñarla.

No se implementó esta modificación porque sustituye invariantes del escritor;
no es un cambio pequeño y autocontenido. Antes de quitar el tope, las pruebas deben
demostrar operación 201 y anulación 202, concurrencia en la frontera, replay sin
duplicados, reversión de otro mes, revocación concurrente y paridad de saldos y
resúmenes con `calcularLibro`. El catálogo puede seguir acotado a 50/50 inicialmente.

## Conexión y clientes anteriores

Se reforzó el arranque Flutter: un `FESYNC_EMULATOR_HOST` no vacío sin activar
`FESYNC_FINANZAS_DEMO` ahora falla **antes de inicializar Firebase**. También se
comprueban demo solo en debug y host local. El arranque normal sin ambas banderas
conserva `DefaultFirebaseOptions`; no se ejecutó esa variante contra Firebase real.
Android debug mantiene proyecto/paquete ficticios y puertos locales. La página y
el worker de Work quedaron intactos; la demo web sigue requiriendo su servidor
aislado. No existe fallback automático a producción si falla un emulador.

El runtime demo ahora rechaza además `GOOGLE_CLOUD_PROJECT` contradictorio y
`GOOGLE_OAUTH_ACCESS_TOKEN`, igualando esas comprobaciones con el lanzador local.

Compatibilidad que debe conservar la futura integración:

- Mantener nombres RPC, parámetros, IDs de solicitud, recibos y esquema contable
  V1. Un cambio de paginación requiere negociación explícita del contrato; el
  cliente viejo no sabe cargar páginas. Mantener su contrato dentro de su capacidad
  y pedir actualización fuera de ella, sin presentar historial parcial como completo.
- Las claves locales `finanzas-mvp-demo-pendiente-$uid` y recibos solo incluyen UID.
  Antes de uso real deben distinguir proyecto y conservar o recuperar las
  intenciones anteriores de forma verificable. No atribuir una intención antigua
  a otro proyecto por coincidencia de UID ni borrar pendientes automáticamente.
- Los perfiles legados sin `pertenenciaId` válido no acceden a Finanzas. Las reglas
  locales actuales también rechazan cambios directos de membresía/rol de clientes
  antiguos. No reabrir esas escrituras para compatibilidad; revisar los clientes
  y las herramientas existentes de pertenencia sin ejecutar migraciones reales aquí.
- La recuperación del recibo confirmado debe ser una lectura histórica propia,
  separada de permitir nuevas escrituras tras revocación. Se puede resolver en el
  flujo existente, sin un nuevo sistema de permisos ni de acreditación.

## Cambios y resultados reales

Solo se modificaron:

- `functions/test/finanzas_mvp_runtime/api.js` y su prueba
  `functions/test/finanzas_mvp.test.js`: comprobaciones de entorno contradictorio.
- `lib/core/services/firebase_emulator_bootstrap.dart`, `lib/main.dart` y
  `test/firebase_emulator_bootstrap_test.dart`: validación previa a inicializar SDK.
- `functions/test/finanzas_adaptador_firestore.test.js`: prueba del bloqueo de
  anulación al agotar los 200 movimientos, sin cambiar el adaptador.

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` | **1.771 aprobadas**, cero fallos/omisiones |
| `flutter test --no-pub --reporter expanded` | **443 aprobadas**, 1 omisión intencional del test activable de emuladores |
| `flutter analyze --no-pub` | **No issues found** |
| Consultas HTTP a Auth/Functions Emulator | Titular autorizado; miembro y encargado revocado rechazados; sin Auth rechazado; pertenencia anterior rechazada |

La consulta del titular conserva **8 movimientos y CLP 118.600**. La comprobación
HTTP no escribió documentos financieros ni reinició la fixture. No se repitió la
prueba visual ni se declara una nueva prueba Android.

[Node](fin_release_1_2026-10-24/npm-test.log),
[pruebas focalizadas](fin_release_1_2026-10-24/node-focused.log),
[Flutter](fin_release_1_2026-10-24/flutter-test.log),
[análisis](fin_release_1_2026-10-24/flutter-analyze.log) y
[consultas al emulador](fin_release_1_2026-10-24/emulator-readonly.json).

Reglas, V2, inventarios, Work, entrada Functions normal y dependencias permanecen
intactos respecto al inicio. Persiste el espacio final previo en
`functions/index.js:2021`. Sin despliegues, acceso a producción, instalaciones,
commits ni cambio de rama.

**Siguiente paso concreto:** implementar y verificar escritura incremental más
consulta paginada en este mismo V1, con los casos 201/202 anteriores. Después,
extraer la fábrica reutilizada para conectar los tres RPC, resolver recuperación,
período y compatibilidad de pendientes, y validar Android antes de solicitar una
publicación. Exportar ahora los RPC demo dejaría intactos los bloqueos detectados.
