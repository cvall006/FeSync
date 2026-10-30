# FIN-7C.4E.1H — puente administrativo candidato, V2 inactivo

Procedimiento independiente `preparacion_v2_procedencia_administrativa_1`.
Implementado para ensayo local; todavía NO acreditado administrativamente.
La generación de un ensayo sigue inactiva y nunca es elegible para activación.
No se registra admin-6 ni se cambia ningún inventario o módulo existente.

## Dos capacidades separadas

`runtime.autorizarEnsayo({manifiesto: Buffer, sha256Autorizado})` comprueba
exactamente las fuentes del manifiesto local y emite una capacidad opaca en
WeakMap privada. La política del ejecutor fija por revisión un digest independiente;
no se genera al iniciar. El llamador no puede añadir campos administrativos.
La identidad emitida es `CANDIDATO_LOCAL_NO_ACREDITADO`, contrato local 1,
inventario `ensayo-fin-1H-1`, acreditación `PENDIENTE`. Conocer o recalcular hashes
solo permite ensayos locales; no concede acreditación administrativa.

`runtime.autorizarAdministrativo({inventarioId})` es el punto de entrada nuevo
para una acreditación FUTURA. No recibe descriptor, huella, contexto, verificador
inyectado ni callback de acreditación. Llama internamente a
`contabilidad_demo/fuentes.obtenerContextoFuentes(id)`, que comprueba registro,
descriptor revisado, fuentes administrativas y TODO el árbol. Solo después emite
la capacidad privada con la identidad real que devolvió ese verificador.
Al revalidar exige el mismo id, contrato e identidad exactos. No hay fallback a
ensayo en esta vía. Hoy admin-5 rechaza el árbol ampliado y un id nuevo no registrado
también se rechaza; no existe una ejecución administrativa nueva autorizada.

Los descriptores publicados se mantienen intactos. Que el código contenga una
rama para la futura acreditación no implica que esa rama haya podido acreditarse
ni probarse positivamente con un runtime administrativo real en esta entrega.

## Autorización operativa y límites de confianza

`crearPreparador({db, runtime, env, custodia:{verificar}})` y
`crearVerificador` exigen una capacidad del módulo nuevo. No sirven una cadena,
un objeto con huella, el contexto D2 ni la capacidad del preparador antiguo.
La verificación del software es independiente de la autorización operativa:
custodia es una capacidad del ejecutor local de confianza, con comprobación
sincrónica estricta. No representa autenticación de un usuario remoto ni IAM.

Verificar fuentes antes de importar el SDK; usar proceso nuevo, raíz de software
inmóvil y custodia exclusiva de todo el emulador durante la ejecución. El lanzador
hace preflight antes del SDK y cada operación vuelve a comprobar las fuentes.
Node y el cargador deben ser de confianza: no hay attestation de bytecode ni
protección frente a quien sustituya módulos cargados, FS, política o datos dentro
del mismo proceso. Esta limitación impide presentar hashes como prueba autónoma
de ejecución. No se soportan inyección por NODE_OPTIONS ni rutas enlazadas.
El runtime exige además su ubicación exacta dentro de functions: trasladarlo a
test, node_modules u otro directorio excluido rechaza antes de emitir capacidad.

El proyecto debe ser demo-fesync, host 127.0.0.1:8088, base (default), sin SSL,
credenciales, configuración de otro proyecto o emuladores Auth/Functions.
El SDK lo construye el ejecutor después del preflight; los módulos no lo importan.
Node/SDK/dependencias/CLI/Java/SO quedan fuera de la huella administrativa actual.

La fuente debe conservar protocolo bloqueado, época 1 y ausencia de puntero V2.
Las transacciones vuelven a leer esas condiciones, datos, recibos y versiones.
Se rechaza cualquier cerrojo existente de D2, preparador anterior o preparador
local con procedencia. No se libera ni adopta un cerrojo, incluso si corresponde
a una ejecución terminada. Su eventual recuperación exige otro alcance revisado.
Los módulos anteriores no conocen el cerrojo nuevo: la exclusión entre versiones
depende además de la custodia externa. No ejecutar ambos procedimientos a la vez.

## Persistencia y evidencia

Rutas nuevas, bajo iglesias/{iglesiaId}:

- `finanzas_preparaciones_admin_v2_demo/{ejecucionId}`: sobre esquema 2.
- `finanzas_preparaciones_admin_v2_control/cerrojo`: exclusión, propietario y fence.
- `finanzas_evidencias_admin_v2_demo/{ejecucionId}`: evidencia esquema 2.

Destino NUEVO `finanzas_generaciones_demo/{generacionId}` con cabecera V2 exacta
existente y activa:false. No se amplía esa cabecera con etiquetas administrativas.
No se escribe en movimientos, saldos V1, recibos, checkpoints históricos,
protocolo o puntero activo. El destino ocupado o con descendientes extra se rechaza.

El sobre y el sello vinculan iglesia, ejecución, generación, época, período,
parámetros/operador normalizados, algoritmo económico 1, procedimiento 1, runtime,
corte con secuencia y versión, manifiesto que incluye comprobantes del mismo corte,
checkpoint, fence y documentos preparados con sus versiones y hashes reales.
Los estados son conciliando, preparando, verificando, verificada o fallida.
El último lote confirmado deja verificando; una transacción posterior relee las
versiones reales y sella junto con el avance del sobre y del cerrojo.

Cada operación revalida runtime, entorno, cliente y custodia FUERA del callback.
Dentro solo hay lecturas/escrituras del mismo intento transaccional y validaciones
puras, incluida consulta de la WeakMap. No hay FS, llamadas a custodia o SDK externo
en el callback. El listado de subcolecciones queda fuera bajo custodia, porque el
SDK no ofrece listado transaccional de esos nombres.

Mismo fence repetido tras respuesta perdida devuelve el commit previo sin aplicar
otra vez; fence ajeno y otro operador se rechazan. No se roban cerrojos por TTL.
Una evidencia incompleta, algoritmo/contexto alterado o documento reescrito se
rechaza, aunque el contenido económico final aparente coincidir.

El verificador es exclusivamente de lectura. Devuelve por separado
`runtimeCreacion`, `runtimeVerificador`, `acreditacionAdministrativa`, activa:false
y elegibleActivacion:false. Esta primera versión exige identidad de creación
exacta: no admite reanudación bajo otro runtime ni compatibilidad implícita.
En ensayo devuelve PENDIENTE. DATOS_Y_VINCULO_VERIFICADOS no equivale a activación.
Los sobres locales, D2 y checkpoints anteriores no se reinterpretan ni rellenan.

## Futura acreditación explícita

Cinco JS nuevos requieren revisión: runtime.js, evidencia.js, estado.js,
preparacion.js y verificacion.js. El cierre de dependencias y los SHA-256 reales
se publican en FUENTES_CANDIDATAS.json, que es un informe, NO un inventario autorizado.
Incluye fuentes transitivas ya existentes y la llamada administrativa a fuentes.js.
La selección administrativa seguirá exigiendo TODO el árbol, no solo ese cierre.

El paso posterior deberá revisar estos módulos y los arneses, aprobar un descriptor
nuevo con los 39 JS del árbol ampliado y los tres JS administrativos originales,
preservar todos los descriptores y hashes anteriores y solo entonces registrar una
identidad distinta de admin-5. El nombre admin-6 es una propuesta, sin registro ni
autorización aquí. Revisar también políticas locales que fijan el hash del registro.
El descriptor excluye su propio hash y los módulos no contienen la huella final.

La compatibilidad D2 del nuevo inventario no autoriza convertir evidencia local.
Una ejecución real del procedimiento administrativo debe crearse DESPUÉS de su
acreditación, con generación nueva, y pasar las pruebas positivas de identidad
real persistida. No se puede rebautizar un ensayo previo. Una nueva identidad
tampoco autoriza producción, despliegue, operativo_v2 o activación.

Para ensayar con las herramientas existentes:

```powershell
node --test test/contabilidad_preparacion_v2_admin_aislado/guardas.test.js
node test/contabilidad_preparacion_v2_admin_aislado/iniciar.js
```

Los resultados, fallos y alcance exacto de esta entrega constan en RESULTADOS.md.
