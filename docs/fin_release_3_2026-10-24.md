# FIN-RELEASE-3: entrada normal de Functions validada en demo-fesync

El circuito incremental V1 se ejecutó desde **`functions/index.js`**, mediante
`finanzasV1Consultar` y `finanzasV1Ejecutar`, en Firebase Emulator. Se reutilizó
sin modificar el backend validado en FIN-RELEASE-2. No se habilitó ejecución
productiva ni se cambió la conexión Flutter. **No está listo para producción**:
la suite completa Node termina con rechazos administrativos legítimos.

## Cambios exactos y preservación

Se respaldaron y verificaron SHA-256 de **575 archivos locales no ignorados**,
incluidos los cambios previos y los informes/evidencias de FIN-RELEASE-2.
También se conservaron diff de trabajo/índice, HEAD, rama y la eliminación Kotlin
que ya existía. Ruta: `C:\Users\igles\AppData\Local\Temp\fesync-fin-release3-20261025002720`.
[Respaldo](fin_release_3_2026-10-24/respaldo.json).

Solo cambió un archivo existente: `functions/index.js`, con **16 líneas añadidas**
para dos exportaciones independientes. Quitando ese bloque, la entrada coincide
con el respaldo, normalizando únicamente finales de línea. Los 574 archivos
restantes mantienen sus bytes. Los callables antiguos conservan sus nombres,
opciones, dependencias y cuerpos. `functions/finanzas.js` permanece intacto.

Archivos nuevos de código/configuración:

- `functions/finanzas_publicacion.js`: conexión al backend existente y barreras de servidor.
- `functions/test/finanzas_publicacion.test.js`: tres pruebas unitarias/de entrada.
- `firebase.finanzas-release.json`: configuración local, entrada normal, puerto 5018.
- `test/finanzas_release3/iniciar.cjs`: lanzador seguro con infraestructura instalada.
- `test/finanzas_release3/integracion.cjs`: cliente HTTP local y escenarios de integración.

No cambian motor económico, API/adaptador incremental, reglas, Flutter, V2,
preparadores, inventarios, herramientas Work, manifiestos de dependencias ni locks.
[Integridad y hashes](fin_release_3_2026-10-24/integridad.json),
[diff de esta intervención](fin_release_3_2026-10-24/cambios.patch),
[estado Git completo](fin_release_3_2026-10-24/git-status.txt) y
[rama conservada](fin_release_3_2026-10-24/rama.txt).
El diff usa el respaldo local como origen; no representa todos los cambios previos.

## Contrato y controles

| Callable nuevo | Uso |
| --- | --- |
| `finanzasV1Consultar` | Cuentas, categorías, saldos, resumen actual e historial paginado |
| `finanzasV1Ejecutar` | Crear cuenta/categoría, apertura, ingreso, gasto, transferencia, ajuste y reversión |

Se conservan los contratos de FIN-RELEASE-2. Consulta exige
`historialPaginado: true`, límite 1–50 y cursor ligado a iglesia/usuario/pertenencia/
corte/tamaño. Las escrituras reciben `solicitudId`, `contexto`, `operacion` y
`campos`. Los campos económicos y sus validaciones provienen del API anterior.
No hay nuevos callables de inicialización, migración, conciliación o activación.

Firebase valida el token Auth en el callable. El UID se toma de `request.auth`,
nunca de Flutter. Cada intento transaccional vuelve a leer perfil, pertenencia,
titular, acceso y permiso específico. Se conserva la distinción de atribuciones:
el encargado puede leer, registrar ingresos/gastos y transferir; no administrar
catálogos, aperturas, ajustes o reversiones.

Hay dos bloqueos independientes del módulo habilitado:

1. El backend sigue exigiendo exclusivamente `demo-fesync`, Auth 9098, Firestore
   8088, `FUNCTIONS_EMULATOR=true` y ausencia de credenciales reales. Se comprueba
   antes de consultar Firestore. La carga/descubrimiento de las otras funciones
   no depende de habilitar este circuito.
2. Debe existir un documento privado
   `iglesias/{iglesiaId}/finanzas_control/publicacion_v1`, exactamente:

   ```json
   {
     "versionEsquema": 1,
     "iglesiaId": "ID_DE_LA_FIXTURE_LOCAL",
     "circuito": "v1_incremental",
     "habilitado": true
   }
   ```

Ausencia, `false`, iglesia/esquema/circuito incorrectos o campos adicionales
bloquean. El cliente no puede leer/escribir ese documento con las reglas actuales;
se verificó un rechazo HTTP 403 incluso con el token del administrador. Los
callables anteriores de habilitar módulo/designar encargado no crean este permiso.
Solo las fixtures ficticias del ensayo reciben el documento mediante Admin SDK
local. No existe activación mediante flags del cliente o un nuevo callable.

La barrera lee también protocolo **V1 época 2**, control, estado incremental,
configuración, período abierto y resumen. Rechaza estados ausentes, checksum/
revisiones divergentes, período incoherente y presencia de generación V2.
Estos controles se hacen en **las mismas transacciones** de intención, escritor
y consulta; también antes de devolver un recibo confirmado. Se probaron cambios
de habilitación y revocación entre intención y escritura.

Los movimientos, saldos, resumen, auditoría, recibo y marcadores siguen siendo
escrituras atómicas del adaptador existente. Se mantienen solicitud persistida,
hashes, IDs, recibos y recuperación por repetición de la misma solicitud. No se
leen todos los movimientos en cada escritura ni se duplican fórmulas contables.
Las barreras nuevas añaden lecturas acotadas de control/autorización: las 15
lecturas del escritor desnudo medidas en FIN-RELEASE-2 no representan el coste
completo de esta entrada protegida.

El DTO no devuelve aportante privado, responsable, huellas, precondiciones,
solicitudes, recibos completos ni auditoría. Solo devuelve confirmación mínima
de la propia operación e historial financiero público autorizado. No se cambiaron
las políticas existentes de lectura directa de Firestore.

## Pruebas reales

| Ejecución | Resultado |
| --- | --- |
| Entrada normal con Auth/Functions/Firestore Emulator | **17 aprobadas**, 16 escenarios más contenedor; cero fallos/omisiones |
| `npm.cmd test`, desde `functions` | **1.740 aprobadas, 34 fallidas**, de 1.774; salida 1 |
| `flutter test --no-pub --reporter expanded` | **447 aprobadas**, una omisión intencional anterior |
| `flutter analyze --no-pub` | **No issues found**, salida 0 |

La integración verificó Auth ausente/token inválido, titular/encargado autorizados,
miembro/líder rechazados, todas las operaciones V1, privacidad del DTO,
idempotencia, solicitudes duplicadas concurrentes, cuerpo HTTP descartado por el
cliente y pérdida de transporte inyectada después de un commit SDK real.
También dos gastos HTTP concurrentes sin sobregiro, reversión sin modificar el
original, revocación mediante callable existente, cambio de iglesia/pertenencia,
aislamiento de cursores, módulo deshabilitado, titular incoherente y rechazo de
protocolo/proyecciones/configuración/resumen/período inválidos, incluido replay.

Se inicializaron 1.001 movimientos sintéticos por el procedimiento anterior y se
ejecutaron **gasto 1.002 y reversión 1.003 por los callables normales**. Los 1.003
resultados se paginaron completos, sin duplicados ni saltos, con saldo CLP 11.000.
La conciliación independiente del historial contra saldos/resúmenes/marcadores y
estado incremental terminó `SIN_DIFERENCIAS_OBSERVADAS` en ambos libros de ensayo.
`certificacionHistorica` sigue siendo **false**: no se acredita procedencia histórica.

Por HTTP también funcionaron los callables antiguos de designación financiera,
estado del módulo, contexto de rol y consulta de solicitud de ingreso. La demo
previa siguió respondiendo en puerto 5008 con ocho movimientos y **CLP 118.600**.
[Demo anterior conservada](fin_release_3_2026-10-24/demo-anterior.json).

Se reutilizaron los Auth/Firestore anteriores sin reiniciarlos ni vaciarlos. Se
levantó una segunda instancia Functions en 5018, hub 4418, con locator temporal
separado. Los triggers Firestore de esa segunda instancia no se registraron
contra el emulador externo; no se ensayaron notificaciones/FCM. La segunda instancia
se cerró al terminar; la infraestructura anterior permanece activa.

[Escenarios y resultados](fin_release_3_2026-10-24/emulador.json),
[log completo de integración](fin_release_3_2026-10-24/emulador-final.log),
[infraestructura](fin_release_3_2026-10-24/infraestructura.json),
[Node](fin_release_3_2026-10-24/npm-test.log),
[Flutter](fin_release_3_2026-10-24/flutter-test.log) y
[análisis](fin_release_3_2026-10-24/flutter-analyze.log).

## Rechazos administrativos y pendientes

Los **34 fallos Node** están exclusivamente en `finanzas_inventarios_versionados`
(32) y `finanzas_transicion_demo` (2). La identidad histórica enumera un conjunto
exacto de fuentes: el cambio requerido de `index.js` y el módulo nuevo no
corresponden a esos bytes. Aparecen `DEMO_FUENTES_NO_ACREDITADAS` y aserciones de
hash/contrato que dependen de esa identidad. No son una suite verde ni se ocultan.
[Clasificación de los fallos](fin_release_3_2026-10-24/fallos-administrativos.json).

El impacto se documentó [antes de editar](fin_release_3_2026-10-24/impacto_previo.md).
No se tocaron hashes, inventarios ni guardas; no se crearon acreditaciones nuevas.
Las acreditaciones anteriores no describen estos bytes nuevos. Resolver esa
incompatibilidad administrativa mediante un procedimiento expresamente autorizado
es un bloqueo para publicación, fuera de esta intervención.

También quedan pendientes la promoción controlada del runtime ahora reutilizado
desde `functions/test`, su revisión de empaquetado/configuración productiva y una
decisión explícita sobre habilitación futura. La conexión productiva Flutter no
se cambió y no se considera validada contra estos nombres nuevos. Siguen los
límites de mantenimiento 20.000 documentos/24 períodos/8 MiB y los límites 50/50
de catálogos, y la recuperación exige autorización/pertenencia vigentes. No hubo
prueba Android nueva ni acreditación histórica a partir de una proyección aislada.

El `git diff --check` señala únicamente el espacio final preexistente de Work en
`functions/index.js`, ahora línea 2037 por la inserción. No se corrigió código ajeno.

Para repetir exclusivamente en demo, con dependencias/emulador ya instalados:

```powershell
node test/finanzas_release3/iniciar.cjs
```

El lanzador crea fixtures nuevas, conserva la infraestructura previa si coincide
con `demo-fesync` y rechaza puertos ocupados incompatibles. No acepta proyecto ni
credenciales alternativos. Si no hay infraestructura previa inicia la suite local
completa en los puertos configurados. No es un comando de despliegue.

No se accedió a producción, no se desplegó, no se instalaron dependencias, no se
hicieron commits ni se cambió de rama. FIN-RELEASE-3 se cierra con la ejecución
local demostrada y los bloqueos indicados; no se inicia otra fase administrativa/V2.
