# Preparador V2 aislado — FIN-7C.4E.1C.1

Solo para ensayos ficticios en `demo-fesync`, Firestore Emulator en
`127.0.0.1:8088`. **No acreditado, no activador y no herramienta de producción.**
No importa `contabilidad_demo/fuentes.js`, `transicion.js` ni inventarios.
No inicializa Firebase Admin: recibe un cliente ya conectado al emulador.

## Contrato

```js
const { crearPreparadorDemo } = require('./preparacion');
const preparador = crearPreparadorDemo({
  db, env,
  custodia: { verificar: () => ejecutorLocalConservaCustodia },
});
const parametros = {
  iglesiaId, ejecucionId, generacionId,
  operador, // capacidad local de 64 caracteres hexadecimales, conservar privadamente
  epoca: 1, periodoId: '2026-11', pagina: 2, lote: 2,
};
let resultado = await preparador.iniciar(parametros);
while (!['preparada', 'fallida'].includes(resultado.estado)) {
  resultado = await preparador.avanzar(parametros, resultado.fence);
}
```

El ejemplo supone que el ejecutor ya comprobó entorno, conexión y custodia.
No debe utilizarse con credenciales ni clientes remotos. `entorno.js` rechaza
proyectos, hosts, credenciales, bases alternativas y servicios no permitidos.
Las dos variables de proyecto y la variable de emulador deben ser explícitas.

Los parámetros son estrictos; no se aceptan identidades administrativas del
cliente. La capacidad del operador se transforma en huella para persistirla.
Conservar los parámetros originales y el último `fence`: un resultado incierto
se recupera con `iniciar` o repitiendo el paso, nunca inventando otra ejecución.
Una segunda identidad no puede apropiarse del cerrojo. No hay robo por vencimiento,
TTL, liberación automática ni desbloqueo al finalizar.

El resultado mínimo contiene `estado`, `fence`, `preparados`, `activa:false`,
`acreditacion:'PENDIENTE'` y un código de error opcional. No devuelve documentos,
UID, aportantes, importes ni huellas privadas. Los estados son `conciliando`,
`preparando`, `preparada` y `fallida`. Errores inesperados del SDK o transporte
producen `PREP_RESULTADO_INCIERTO`; no se convierten en ausencia o éxito.

## Corte, escrituras y recuperación

Cada transacción vuelve a leer el protocolo bloqueado, ausencia de puntero activo,
configuración, control, libro y proyecciones V1. Valida recibos reales, reservas,
aperturas y marcadores; no fabrica sus equivalentes si faltan. Reutiliza
`conciliacion.js` y `proyecciones.js`; no replica fórmulas económicas.
La huella del corte incluye contenido y `updateTime` exacto de los documentos.
El checkpoint se contrasta con una reconstrucción del prefijo real antes de avanzar.

Rutas nuevas bajo `iglesias/{iglesiaId}`:

| Ruta | Contenido |
| --- | --- |
| `finanzas_preparaciones_v2_demo/{ejecucionId}` | Checkpoint privado versionado, corte, identidad, estado y fence |
| `finanzas_preparaciones_v2_control/cerrojo` | Propiedad exclusiva y fence |
| `finanzas_generaciones_demo/{generacionId}` | Cabecera V2 exacta, siempre inactiva |
| `.../{generacionId}/control/libro` | Secuencia y referencia global |
| `.../{generacionId}/consolidados/CLP` | Proyección consolidada |
| `.../{generacionId}/periodos/{periodoId}` | Proyección del período abierto solicitado |
| `.../{generacionId}/saldos/{cuentaId}` | Proyección, revisión y última referencia de cada cuenta |

La cabecera usa el contrato real `gastos_v2_aislado_1`. Las revisiones y últimas
referencias se derivan del libro, sin timestamps o recibos históricos ficticios.
Los períodos anteriores se concilian; el destino materializa el período abierto
requerido por este escritor, no crea una API de reportes históricos.

Se usan `create` para destinos nuevos y escrituras atómicas de lote/checkpoint/
cerrojo, después de todas las lecturas. Una respuesta perdida puede reconciliarse
sin duplicación. Antes de declarar o volver a devolver `preparada` se comprueba
el conjunto exacto de documentos esperados. Ante divergencias detectadas durante
el avance se conserva el checkpoint y se registra `fallida` cuando es seguro;
errores previos de fuente/protocolo rechazan sin escribir. Nunca autocorrige.

## Límites y exclusión

Se conservan 50 cuentas, 50 categorías y 200 movimientos. Fuente canónica de
hasta 2 MiB, checkpoint de hasta 800.000 bytes, hasta 24 períodos, página de
1–50 movimientos y lote de 1–25 documentos. La observación de antecedentes D2
admite hasta ocho generaciones y ocho ejecuciones ajenas. No es una solución
de escalabilidad ni una migración V2 general.

`custodia.verificar` pertenece al ejecutor local de confianza, no es una bandera
de autorización Firebase. El arnés abre un emulador propio y exige puertos libres;
el protocolo bloqueado excluye a escritores V1/V2 cooperantes. Firestore Emulator
no proporciona IAM para probar exclusión absoluta de otros clientes Admin.
El listado de nombres de subcolecciones usa `listCollections` fuera de transacción
(el SDK no ofrece su equivalente transaccional); la custodia es indispensable
frente a una creación concurrente por otro Admin. Las colecciones conocidas sí
se validan transaccionalmente. Sin custodia verificable, no ejecutar.

No modifica V1, D2, sus checkpoints, protocolo ni puntero activo. No otorga
autorización financiera ni habilita al escritor V2. Los checkpoints se recuperan
si los datos del emulador subsisten; el arnés desechable no garantiza persistencia
después de cerrar el proceso del emulador. No imprimir las capacidades ni datos.

## Pruebas y acreditación pendiente

Desde la raíz, sin emuladores concurrentes:

```powershell
node test/contabilidad_generaciones_v2_aislado/iniciar.js
```

El arnés exige herramientas y dependencias ya instaladas; no descarga paquetes.
Usa Admin SDK real, transacciones y reglas reales del emulador, con datos ficticios.
Los antecedentes D2 de esta suite son fixtures sintéticas respaldadas por un libro
V1 y checkpoint calculados realmente: no constituyen una ejecución acreditada D2.
Se comprueba su conservación de contenido y versión documental.

Se leen los documentos V2 mediante SDK y se valida su forma/proyección pura.
El adaptador V2 real continúa rechazando el protocolo bloqueado. **No se prueba
un gasto V2 de extremo a extremo ni se activa temporalmente para conseguirlo.**

Fuentes nuevas que deberán revisarse para una futura acreditación explícita:
`entorno.js`, `fuente.js`, `modelo.js`, `preparacion.js` y `util.js`, junto con sus
dependencias financieras existentes, ejecutor y pruebas. No se registra admin-4,
hash de software futuro o compatibilidad histórica nueva. Las huellas de corte
y operación son evidencia de datos, no acreditación del runtime.

Agregar estas fuentes provoca legítimamente `DEMO_FUENTES_NO_ACREDITADAS` en
las suites administrativas sujetas al inventario actual. No se modifica ni
omite esa guarda. Véase el informe de pruebas del directorio de integración.
