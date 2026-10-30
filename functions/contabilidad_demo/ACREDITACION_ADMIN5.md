# FIN-7C.4E.1F — admin-5, acreditación de software sin activación

Se incorpora `inventarios/runtime_5.json` y se selecciona explícitamente admin-5
en `inventarios/registro.json`. No se modifica ningún JS productivo: acreditador,
transición, los seis módulos de FIN-7C.4E.1E, los cinco del preparador anterior,
adaptadores, protocolo, proyecciones, conciliación, membresía y endpoints conservan
sus bytes. No se crean activadores ni se habilita operativo_v2.

## Alcance exacto e identidades

El inventario contiene **34 JS**: los 22 de base, las seis adiciones ya cubiertas
por admin-4 y los seis módulos de `contabilidad_preparacion_acreditada_demo/`:
`entorno.js`, `estado.js`, `evidencia.js`, `preparacion.js`, `runtime.js` y
`verificacion.js`. Cada ruta y SHA-256 real consta en runtime_5.json; no se
admiten comodines, archivos futuros o coincidencias parciales.

| Identidad / objeto | SHA-256 |
| --- | --- |
| Descriptor admin-5 | `7ad0783cedd1a11589656c3701f464f89d547e7d7df2ef2a3bcf3ecef860a2b1` |
| Runtime administrativo admin-5 | `175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720` |
| Admin-4 conservado | `1a03015eefe6e518182dcecde115ca47afc56dfe5768a644d7aeb73ed451b9b7` |
| Admin-3 conservado | `4b3ac2baa2dace9ba5908464372f85360fc1e05b9cc527dde3dd8c16143ee86c` |
| Admin-2 conservado | `0fad7c6373d9dfb79ab460b31e4ce7de8af0887565773f4c7e479ade75285c8f` |
| Legado conservado | `76a34072faaad2db2e0ca2e9d9802e7df512193de1c33ee0106747670905f89d` |
| Registro admin-4 capturado sin cambios | `5ea83c890e99688379b6a3b33e5ed7bd66f71ccb64cb63c0e378eac955ca1de4` |

El cierre transitivo de preparación y verificación nuevas contiene 20 JS: los
seis nuevos, `contabilidad_generaciones_v2_demo/{fuente,modelo,util}.js`, diez
módulos financieros y `pertenencia.js`. Se verifica con imports estáticos y
hashes exactos. El inventario sigue exigiendo las 34 fuentes completas, no solo
ese cierre. `FUTURO_INVENTARIO.md` de FIN-7C.4E.1E coincide con los 34 JS reales;
su hash de registro describe el estado previo y se conserva como evidencia
histórica, no como descripción del registro administrativo nuevo.

El contrato continúa en versión 2, `identidad-2-economia-1`. La identidad es:

```text
SHA256("fesync-inventario-runtime-2\0" || bytes(runtime_5.json)
       || bytes(entorno.js) || bytes(fuentes.js) || bytes(transicion.js))
```

Los tres JS administrativos se concatenan en orden lexicográfico. Descriptor y
registro son archivos revisados: no hay regenerador o aprobación automática.
El registro fija el hash del descriptor, pero no participa en esa fórmula; el
descriptor no contiene su propio hash. Los módulos acreditados no contienen la
huella admin-5. Por ello no hay ciclo de hashes ni autorreferencia.
Node, módulos nativos, SDK, node_modules, CLI, Java y sistema operativo quedan
fuera de esta fórmula. La raíz de confianza es local, no una firma externa ni
defensa contra quien pueda sustituir simultáneamente código, política y datos.

## Compatibilidad administrativa conservada

Admin-5 declara compatibles explícitos legado/admin-2/admin-3/admin-4. Antes de
aceptar cualquiera de esas identidades, el verificador exige igualdad de TODO
el árbol actual con admin-5, reproduce los componentes originales y comprueba
íntegramente cada descriptor compatible y todas sus fuentes compartidas.
No se modificaron fuentes_v1.json, legado_1.json, cambios_identidad_2.json o
runtime_2/3/4.json, ni la política ejecutable que verifica su equivalencia.

| Estado persistido | Resultado bajo runtime admin-5 |
| --- | --- |
| D2 legado original sin etiquetas | Acepta solo identidad, esquema, procedimiento, algoritmo y época originales |
| D2 admin-2/admin-3/admin-4 auténtico | Consulta/reanuda con identidad original; no reetiqueta |
| D2 nuevo admin-5 | El motor D2 existente verifica runtime y persiste su identidad admin-5 real |
| Huella, inventario, contexto o versión desconocidos | Rechaza sin reparación |
| Sobre PENDIENTE del preparador anterior | No se convierte en D2 ni en evidencia admin-5 |
| Evidencia FIN-7C.4E.1E de ensayo local | Sigue siendo local; no obtiene acreditación administrativa o elegibilidad |

Seleccionar admin-4 explícitamente sobre el árbol ampliado sigue rechazando:
su inventario exacto espera 28 JS. No es un alias del runtime actual. Sus
documentos se recuperan mediante la compatibilidad explícita de admin-5 o el
software original verificado bajo custodia. Las pruebas ejecutan el código
original con su registro capturado para producir historia real en el emulador,
no copian una huella sobre ejecuciones nuevas para fabricar procedencia.

## Qué acredita admin-5 y qué falta

**Admin-5 acredita el software de FIN-7C.4E.1E, pero ese procedimiento todavía
no consume ni persiste una capacidad administrativa admin-5.** Su runtime usa
una WeakMap privada y devuelve obligatoriamente `ENSAYO_LOCAL_FIJADO`, inventario
`ensayo-fin-1E-1`, contrato 1 y `acreditacionAdministrativa:'PENDIENTE'`.
Entregarle el contexto de fuentes admin-5 como si fuera su capacidad se rechaza
antes de tocar DB. El verificador mantiene `elegibleActivacion:false`.

La excepción prevista en la fase 2.11 del encargo se aplica sin cambiar la lógica
del preparador: no se atribuye a nuevas evidencias locales una procedencia
administrativa que su contrato no almacena. En cambio, el motor D2 sí consume
obtenerContextoFuentes y sus nuevas ejecuciones D2 pueden declarar admin-5;
no se confunde ese procedimiento con la preparación FIN-7C.4E.1E.

El mínimo pendiente es un contrato/procedimiento revisado que reciba una
identidad administrativa realmente verificada antes del SDK, vincule el runtime
de creación con la nueva ejecución, cerrojo y evidencia final, y defina su
recuperación y compatibilidad sin reinterpretar sobres locales. Cambiar los JS
ahora acreditados requerirá otra identidad revisada; no se debe actualizar este
descriptor publicado para ocultar ese cambio. No se implementa aquí ese enlace.

### Política local y evidencia histórica

El manifiesto local incluye el hash de registro.json. Registrar admin-5 cambia
legítimamente ese componente, aunque el código del preparador no cambie.
Se conserva byte por byte el manifiesto original como
`test/contabilidad_preparacion_acreditada_aislado/runtime_ensayo_admin4.json`,
con digest `c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2`.

El arnés actual fija tras revisión otro manifiesto local de 44 componentes,
digest `755eb57a6874f0d8ed0f0e80dc4e2187509844a076ffdaf7b988565672a8f9a6`.
Solo cambia el hash del registro. El arnés también exige admin-5 completo antes
de importar SDKs, cubriendo el descriptor nuevo que el runtime local antiguo no
enumera. Ni esa comprobación ni el digest nuevo se presentan como identidad de
creación de evidencias anteriores. Los ejecutores del preparador C.1 pasan de
seleccionar admin-4 a exigir explícitamente admin-5, sin selector automático.

Las pruebas conservan una copia histórica exacta del software y registro para
crear evidencia local original y verificarla en su contexto original. Sobre el
árbol actual, la política vieja y esa evidencia no se adoptan; se rechazan sin
escrituras y permanecen PENDIENTE. No se inventa un alias o traducción de hashes.

## Respaldo y validación

Antes de editar se censaron 23.104 archivos regulares (524.918.029 bytes) y
22 enlaces sin seguirlos. El respaldo externo privado está en:

`C:/Users/igles/AppData/Local/Temp/fesync-pre-1F-ptQ3w3/`

`archivos-completos.tar` contiene todos los archivos, incluidos `.git`, índice,
tracked modificados, untracked, ignorados y dependencias. Se extrajo y comparó
cada archivo con SHA-256, y el origen volvió a cotejarse antes de editar. Los
22 destinos de enlaces se preservan en manifest.json y se cotejaron sin seguir
destinos externos; no se afirma haber restaurado enlaces Windows sin privilegios.
SHA-256 del TAR: `65bfe366c2b2c369514fcc6da2da4a1042d572a642c39a21363fa21eb60eb2ae`.
El primer archivo TAR recursivo se detuvo por su recorrido lento; no se usa como
respaldo verificado. Se sustituyó por el archivo de lista explícita sin recursión
descrito arriba. No se limpió el repositorio. No es respaldo de datos Firebase.

Validaciones finales ejecutadas:

| Suite | Resultado real |
| --- | --- |
| npm.cmd test completo | 1.759/1.759 aprobadas; cero fallidas/omitidas/canceladas |
| Acreditación y guardas enfocadas | 113/113 (81 inventarios y 32 guardas locales; subconjuntos de las suites completas) |
| Compatibilidad histórica, Firestore Emulator | 25/25, incluidas nuevas recuperaciones admin-4 bajo admin-5 |
| Administrativas D2 existentes | 28/28 |
| Regresiones FIN-7 | 211/211 |
| Reglas financieras anidadas | 46/46; no se suman otra vez a FIN-7 |
| Preparador con procedencia FIN-7C.4E.1E | 75/75 (32 comprobaciones locales y 43 escenarios SDK/emulador), sin fallos/omisiones/cancelaciones |
| Preparador anterior FIN-7C.4E.1C.1 | 58/58 con preflight admin-5, manteniendo el sobre PENDIENTE; cero fallidas/omitidas/canceladas |
| Integración V2 aislada existente | 39/39, incluidas las guardas y el caso antes rechazado por inventario; cero fallidas/omitidas/canceladas |
| node --check | 46 JS correctos: 37 productivos sin cambios y nueve JS de pruebas/arnés modificados |

El ensayo incluye evidencia creada por el software local original, con el
manifiesto original fijado, y verifica su conservación sin reetiquetado. El
verificador actual y D2 rechazan adoptarla como evidencia admin-5. Se confirman
fencing, respuesta perdida, rechazo de fuentes/corte/documentos alterados,
verificador sin escrituras, protocolo bloqueado y generaciones nuevas inactivas.
Las capturas históricas fijan su digest antes de usar sus rutas para copiar
software, y el software copiado vuelve a verificarse antes de importar SDKs.

Las 14 pruebas Node adicionales son seis alteraciones de las fuentes nuevas,
una alteración del descriptor 5 y siete comprobaciones de inventario/cierre/
compatibilidad/capacidad. No se retiraron casos anteriores. Los ejecutores no
omiten errores de inventario ni silencian resultados. Todas las corridas finales
terminaron con código 0; siempre hubo un único emulador a la vez. Los escenarios
V2 activos son fixtures sintéticas existentes, no activaciones administrativas
del preparador. No hubo fallos, cancelaciones u omisiones en las corridas finales.

Este paso no autoriza producción, activación, migraciones reales o elegibilidad
de generaciones. Los PERMISSION_DENIED de pruebas negativas y SIGINT de cierre
normal del emulador se distinguen de fallos de pruebas.

## Auditoria individual de las 28 fallas anteriores

Se revisaron las excepciones reales de los logs conservados de FIN-7C.4E.1E.
Cada caso terminaba en DEMO_FUENTES_NO_ACREDITADAS durante el preflight,
antes de sus aserciones principales. No se encontro un error economico oculto.
La tabla describe el tratamiento, sin eliminar ni omitir casos negativos.

| # | Caso previo | Causa observada | Tratamiento |
| --- | --- | --- | --- |
| 1 | V1 se reproduce con bytes originales; runtime actual tiene otra identidad | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Expectativa de runtime actual pasa a admin-5; reproduccion legado intacta. |
| 2 | Identidad acreditada sin mutar metadatos, legado=false | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 3 | Identidad acreditada sin mutar metadatos, legado=true | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 4 | Checkpoint historico alterado: huella historica desconocida | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 5 | Checkpoint historico alterado: iglesia | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 6 | Checkpoint historico alterado: epoca | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 7 | Checkpoint historico alterado: algoritmo | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 8 | Checkpoint historico alterado: procedimiento | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 9 | Checkpoint historico alterado: generacion activa | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 10 | Checkpoint historico alterado: etiqueta parcial | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 11 | Checkpoint historico alterado: inventario falso | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 12 | Ampliacion sintetica explicita y completa permite identidad anterior sin reetiquetar | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Fixture virtual parte del inventario actual completo; negativos de adiciones intactos. |
| 13 | admin-3 reproduce huella admin-2 y acepta su historia sin cambiar datos | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 14 | admin-3 tiene huella propia y cubre exactamente base mas V2 y mismos JS administrativos | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 15 | historia admin-2 incoherente rechaza: huella diferente | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 16 | historia admin-2 incoherente rechaza: iglesia diferente | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 17 | historia admin-2 incoherente rechaza: epoca diferente | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 18 | historia admin-2 incoherente rechaza: procedimiento diferente | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 19 | historia admin-2 incoherente rechaza: inventario desconocido | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 20 | admin-4 contiene exactamente las fuentes revisadas y tiene identidad propia | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Se conserva reproduccion exacta H4; el runtime actual tiene H5 distinta. |
| 21 | admin-4 admite historia admin-3 exacta sin reetiquetar; admin-3 no es alias del arbol nuevo | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 22 | compatibilidad admin-3 no se infiere si un descriptor no la declara | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Negativo consulta politica virtual admin-5 sin compatibilidad; sigue denegando. |
| 23 | Checkpoint admin-4 alterado rechaza sin reinterpretar: huella falsificada | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Pareja historica admin-4 explicita; no se usa por error una pareja nueva admin-5. |
| 24 | Checkpoint admin-4 alterado rechaza sin reinterpretar: iglesia ajena | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Pareja historica admin-4 explicita; iglesia adulterada sigue denegada. |
| 25 | Checkpoint admin-4 alterado rechaza sin reinterpretar: epoca distinta | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Pareja historica admin-4 explicita; epoca adulterada sigue denegada. |
| 26 | Guardas no abren red ni inicializan Firebase | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 27 | Inventario revisado coincide con fuentes actuales, sin modificar archivos | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Acreditacion del arbol completo; se conservan sus aserciones y rechazos. |
| 28 | admin-4 reconoce los bytes V2 acreditados; no habilita generaciones | DEMO_FUENTES_NO_ACREDITADAS, seis JS extra fuera de admin-4 | Expectativa de runtime vigente pasa a admin-5; guardas y escritor intactos. |

## Cierre y diff acotado

Se compararon por SHA-256 los 23.104 archivos regulares del respaldo completo: 23.092 permanecen intactos y solamente cambian los 12 archivos autorizados siguientes. Los 22 enlaces conservan sus destinos. No se detectaron cambios fuera de alcance.

- `functions/contabilidad_demo/COMPATIBILIDAD_INVENTARIOS.md`.
- `functions/contabilidad_demo/inventarios/registro.json`.
- `functions/contabilidad_demo/test/integracion.test.js`.
- `functions/test/finanzas_inventarios_versionados.test.js`.
- `test/contabilidad_generaciones_v2_aislado/ejecutar.js`.
- `test/contabilidad_generaciones_v2_aislado/iniciar.js`.
- `test/contabilidad_preparacion_acreditada_aislado/autorizacion.js`.
- `test/contabilidad_preparacion_acreditada_aislado/guardas.test.js`.
- `test/contabilidad_preparacion_acreditada_aislado/iniciar.js`.
- `test/contabilidad_preparacion_acreditada_aislado/integracion.test.js`.
- `test/contabilidad_preparacion_acreditada_aislado/runtime_ensayo.json`.
- `test/finanzas_v2_aislado/integracion.test.js`.

Se agregan cuatro archivos:

- `functions/contabilidad_demo/ACREDITACION_ADMIN5.md`.
- `functions/contabilidad_demo/inventarios/runtime_5.json`.
- `functions/contabilidad_demo/test/registro_admin4.json`.
- `test/contabilidad_preparacion_acreditada_aislado/runtime_ensayo_admin4.json`.

Los 400 archivos de proyecto previos incluyen 388 intactos y los 12 cambios autorizados. Los 37 JS productivos (34 inventariados y tres administrativos) permanecen byte por byte intactos, incluidos todos los modulos del preparador FIN-7C.4E.1E. Se conservan rama integration/adora-live, HEAD 01223cd990312677ebbef2892ae7e99b1109e272 e indice Git. No hay staged o commits nuevos. El estado pasa de 18 tracked modificados y 190 untracked a 18 tracked modificados y 194 untracked; los cambios locales previos se conservan.

El diff de esta entrega contra el respaldo previo, incluido lo que ya era untracked, esta en `C:/Users/igles/AppData/Local/Temp/fesync-pre-1F-ptQ3w3/cambios-fin-1F.diff`. La verificacion completa esta junto a el en verificacion-final.json. El diff no compara solamente contra HEAD, evitando atribuir a esta entrega trabajo local anterior.

Las pruebas se ejecutaron con herramientas y dependencias existentes. No se instalaron paquetes, cambiaron reglas/Flutter/membresia o endpoints, accedio a produccion, desplego, migro datos reales, activo V2 o concedio elegibilidad. Los datos de prueba se limitaron a emuladores demo-fesync desechables. Se detiene el trabajo al concluir FIN-7C.4E.1F.
