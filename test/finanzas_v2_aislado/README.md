# FIN-7C.4E.1A — Gastos V2 aislados

Experimento privado, sin endpoints, acreditación, activación administrativa ni
despliegue. Solo registra gastos. Ningún módulo inventariado importa el archivo
nuevo. No cambia V1, reglas, FIN-2 a FIN-6, proyecciones, conciliación o Work.

## API

`crearAdaptadorFirestoreV2({db, FieldValue}).ejecutar(entrada)` se exporta desde
`functions/finanzas_core/adaptador_firestore_v2.js`. No inicializa Admin SDK.

La entrada contiene exactamente:

```js
{
  auth: { uid }, // Del contexto Auth validado por el futuro servidor, nunca data.auth.
  operacion: 'gasto',
  contextoV2: { versionContrato: 1, epoca: 1, generacionId: 'sintetica' },
  solicitud: {
    versionEsquema: 1, solicitudId, iglesiaId, cuentaId, categoriaId,
    montoMinor: 4000, fechaContable: '2026-10-17', periodoId: '2026-10',
    precondiciones: {
      pertenenciaId, acceso, iglesia, cuenta, categoria, configuracion, controlPeriodo
    }
    // descripcion opcional: texto NFC de hasta 240 caracteres.
  }
}
```

Las versiones son `updateTime` canónicos `segundos:nanosegundos`. El período de
pertenencia y las versiones son precondiciones de intención, nunca autorización.
El adaptador privado recibe Auth explícito porque no es un callable; el futuro
envoltorio deberá autenticarlo y proyectarlo separadamente del payload cliente.
Solo CLP/0/America/Santiago. Se reutilizan `prepararGasto`, su autorización FIN-3
y `proyectarMovimiento`; no se recalcula la política económica en este módulo.

Respuesta mínima: `{estado:'CONFIRMADA', historica, versionEsquema,
movimientoId, secuencia}`. Errores propios conservan `ErrorContable.codigo`.
Errores ajenos se convierten en `RESULTADO_INCIERTO`, incluido transporte tras
commit. El llamador debe conservar la solicitud original y reintentar con la
misma clave; este módulo no implementa almacenamiento cliente o reconciliador UI.

## Contrato documental experimental

`I = iglesias/{iglesiaId}`, `G = I/finanzas_generaciones_demo/{generacionId}`.
Todos los documentos experimentales de generación llevan la cabecera exacta:
`versionEsquema:2`, `iglesiaId`, `epoca`, `generacionId`,
`contrato:'gastos_v2_aislado_1'`.

| Ruta | Contenido adicional |
|---|---|
| `I/finanzas_control/protocolo` | Contrato existente de cuatro campos: versión 1, iglesia, época esperada, estado `operativo_v2` |
| `I/finanzas_control/generacion_v2` | Solo cabecera experimental; puntero activo único |
| `G` | Cabecera y `activa:true` |
| `G/control/libro` | `revision`, `ultimoMovimientoId` globales |
| `G/consolidados/CLP` | Mismas referencias globales, `datos` = acumulado de proyecciones |
| `G/periodos/{periodoId}` | Mismas referencias globales, `periodoId`, `datos` = resumen del período de proyecciones |
| `G/saldos/{cuentaId}` | `proyeccion` = saldo FIN-7C.4B; `huboMovimientos`, `aperturaRegistrada`, `solicitudesInciertas` |

Se leen además los documentos vigentes del actor, iglesia, titular, acceso,
configuración, período abierto y solo la cuenta y categoría afectadas. Los
catálogos conservan sus envoltorios V1 `{cuenta}` y `{categoria}`. No se consulta
elegibilidad. Faltantes o estados incompatibles se rechazan, nunca se inicializan.

**Las generaciones D2 actuales no cumplen este contrato.** Sus saldos no tienen
las referencias/revisiones completas de FIN-7C.4B; falta también el estado global
incremental y el puntero activo. Este paso no los completa, transforma o activa.
Los valores activos de las pruebas son exclusivamente fixtures ficticios en
demo-fesync. No constituyen una transición D2 ni una acreditación administrativa.

## Commit y recibos

Una transacción nueva lee todos los documentos antes de escribir y confirma
exactamente siete documentos: movimiento append-only en `I/finanzas_movimientos`,
saldo afectado, resumen, consolidado, control global, auditoría en
`I/finanzas_auditoria` y recibo en
`operaciones_financieras/{uid}/solicitudes/{solicitudId}`.

La revisión global avanza una unidad y es la secuencia del nuevo movimiento.
El ID de movimiento es SHA-256 determinista del dominio V2, UID autenticado,
iglesia y solicitud. La huella canónica liga todo el payload y contexto V2.
No se crean IDs aleatorios, notificaciones ni efectos externos en el callback;
`serverTimestamp()` es un sentinel resuelto por el commit.

Se comparte el espacio de claves de recibos V1: nunca se sobrescriben recibos.
Un recibo V1 idéntico se valida con su huella e ID originales y su movimiento;
se devuelve historia con cero escrituras. Un recibo V2 exige también generación,
época y contrato coincidentes. Payload distinto o registro incompatible rechaza.
Un replay confirmado no consulta permisos actuales ni protocolo: solo acredita
una operación histórica propia, sin conceder acceso vigente o un saldo actual.

Los recibos, proyecciones y controles siguen denegados al SDK cliente por las
reglas existentes. La auditoría conserva lectura financiera autorizada y ninguna
escritura cliente. No se copian descripciones a auditoría ni datos de aportantes.

## Ejecución segura de pruebas

```powershell
node --test functions/test/finanzas_adaptador_firestore_v2.test.js
node test/finanzas_v2_aislado/iniciar.js
# Después del cierre del emulador anterior:
node test/finanzas_contabilidad_integracion/iniciar.js
cd functions
npm.cmd test
```

El ejecutor aislado usa CLI, JAR y dependencias ya instaladas. Exige demo-fesync,
Firestore `127.0.0.1:8088`, sin credenciales o destinos alternativos. Verifica
puertos libres (8088/4408/4508/9150), copia reglas/configuración existentes a TEMP
y ejecuta solo Firestore. No inicia Auth, Functions o Messaging ni usa ADC;
el cliente Admin real se crea con host/SSL/proyecto explícitos y OAuth vacío.
Los contextos SDK cliente usan únicamente el emulador de reglas.

Solo se borran y siembran datos ficticios del emulador dedicado. Las consultas
históricas y escrituras por lotes de 400 documentos pertenecen al montaje y a la
verificación externa de fixtures, nunca al callback del adaptador.

## Evidencia y límites

- 54 pruebas unitarias nuevas con dobles MVCC: permisos, datos, historia V1,
  reintentos, captura antes de await, lecturas antes de escrituras y atomicidad.
- 39 pruebas/guardas aisladas: 27 escenarios con SDK real y 12 guardas locales.
  Se comprueba un commit común mediante `updateTime` de los siete documentos.
- Regresiones V1: **211/211** escenarios/guardas/verificador, más **46/46**
  pruebas de reglas financieras ejecutadas por el verificador, sin modificarlas.
- Libros ficticios de 201 y 1.001 movimientos: **17 lecturas por intento** para
  titular y 18 para encargado. El replay usa 2 lecturas, sin escrituras. Los
  reintentos del SDK multiplican el costo por intento, no por tamaño del libro.
- Dos gastos simultáneos con fondos para uno: uno confirma y otro rechaza.
  Carreras reales observadas con revocación y transferencia admiten solo el
  orden transaccional válido. No se afirma cobertura exhaustiva de intercalados.
  ABORTED y respuesta perdida son fallos explícitamente simulados sobre SDK real.
- `npm.cmd test`: **1.707 aprobadas / 15 fallidas**, 1.722 totales. Catorce
  fallos provienen de `DEMO_FUENTES_NO_ACREDITADAS`; otro esperaba que aún no
  existiera el archivo V2. Son incompatibilidades esperadas con E.1A, no una
  acreditación. La suite administrativa no se presenta como aprobada.
- La primera ejecución aislada tuvo 36/36; después se añadieron tres escenarios
  y se verificó 39/39. Una expectativa unitaria de desarrollo nombraba
  `DESBORDAMIENTO_MINOR`; se corrigió al contrato FIN-2 `DESBORDAMIENTO`.

Las proyecciones acreditan consistencia local, **no integridad histórica**.
La procedencia del estado inicial, conciliación, custodia de escritores Admin,
acreditación final, activación y migración de generaciones requieren E.1B y
pasos posteriores. No hay hashes ficticios o inventarios modificados aquí.
No se acredita continuidad histórica comparando solo un saldo materializado.

El control, consolidado y resumen son documentos calientes compartidos: cada
gasto de una iglesia los bloquea/actualiza. No hay garantía de throughput de
producción; el SDK puede agotar reintentos. Las pruebas de 1.001 movimientos
demuestran lecturas constantes, no capacidad operativa o costos completos.

V1 conserva sus límites 50/50/200. Este experimento solo consume una cuenta y
una categoría existentes, sin habilitar altas o escrituras V2 de otros tipos.
No crea períodos, no cambia al siguiente mes y rechaza proyecciones que no
correspondan al único período abierto. Se mantiene límite de payload de 16 KiB
y lecturas de 2 MiB; desbordamientos de dinero/revisión bloquean la operación.
No hay aperturas, ingresos, transferencias, reversas, ajustes, cierres ni
reparación de proyecciones V2. El código no está listo para publicar.
