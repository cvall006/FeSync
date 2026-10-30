# Validación FIN-7C.4E.1E

Rama conservada: `integration/adora-live`.
HEAD conservado: `01223cd990312677ebbef2892ae7e99b1109e272`.
No se cambió staging, código anterior, dependencias, reglas, Flutter, membresía
o inventarios administrativos. No hubo producción, despliegue o activación V2.

## Protección previa

Se respaldaron los 383 archivos existentes versionados o sin seguimiento y
`.git/index` / `.git/HEAD` antes de crear archivos nuevos. El respaldo está fuera
del repositorio, en:

`C:/Users/igles/AppData/Local/Temp/fesync-pre-1E-a1355e862b1146c89a9e88e04426ff2e/`

Incluye `repositorio.tar`, manifiesto SHA-256, lista de archivos, estado Git y
extracción verificada por contenido de sus 385 entradas. No incluye un respaldo
de datos Firebase ni dependencias/ignorados ajenos al alcance. Es un respaldo
privado temporal; conservarlo externamente si se requiere retención duradera.

SHA-256 del TAR:
`0d07c14835c1e264a7c8559d868acbeb8db5f99478098ab02906c3b6ea2240e2`

## Resultados reales

- `npm.cmd test` final: 1.745 ejecutadas, 1.718 aprobadas, 27 fallidas,
  cero omitidas/canceladas, salida 1. Los 27 fallos son
  `DEMO_FUENTES_NO_ACREDITADAS`: 25 en inventarios versionados y dos en
  transición demo. [FALLOS_NODE.md](FALLOS_NODE.md) enumera todos los casos,
  ubicaciones y códigos de la corrida final. No se modifican para obtener verde.
- `node --check`: 11 JS nuevos correctos (seis módulos y cinco del arnés).
- Cierre estático de imports de preparación y verificación: 20 JS,
  todos cubiertos por el manifiesto local de 44 archivos.
- Ensayo final aislado con SDK real: **72/72**, cero fallidas, omitidas o
  canceladas, salida 0. Incluye 30 guardas/comprobaciones locales y 42 casos
  de integración con Firestore Emulator. El caso de archivo extra usa una vista
  de filesystem simulada en VM; no se presenta como transacción real.
- El cambio concurrente de protocolo antes del commit provocó revalidación y
  rechazo sin crear generación, ejecución o cerrojo. Es un intercalado concreto
  con bloqueo/contención del SDK, no una prueba exhaustiva de concurrencia.
- Regresión V1 existente, `node test/finanzas_contabilidad_integracion/iniciar.js`:
  **211/211** aprobadas, cero fallidas, omitidas o canceladas, salida 0.
  Incluye el verificador de las **46/46** reglas financieras anidadas; esas 46
  no se suman como si fueran otros 46 casos independientes del ejecutor V1.
- Regresión V2 existente, `node test/finanzas_v2_aislado/iniciar.js`:
  **38 aprobadas / 1 fallida de 39**, cero omitidas/canceladas, salida 1.
  El único fallo es `admin-4 reconoce los bytes V2 acreditados; no habilita
  generaciones`, `integracion.test.js:191`, por
  `DEMO_FUENTES_NO_ACREDITADAS`. Los demás casos, incluidas las guardas,
  escrituras SDK, idempotencia y concurrencia, aprobaron. No se presenta la
  suite completa como verde. Sus generaciones activas son fixtures sintéticas
  existentes: no representan activación administrativa de una generación nueva
  de este procedimiento.

Identidad local fijada para el ensayo final (no identidad administrativa):
`c232d55251b48e60adaf924bdc3d93632a0f4681d2a297a98e85a4c1eecf4ea2`.
Las regresiones V1/V2 se ejecutan secuencialmente después del cierre de ese
emulador, sin compartir puertos ni cambiar sus ejecutores.

El bloque administrativo general y el preparador antiguo seleccionan admin-4;
no se les atribuye una reejecución satisfactoria sobre este árbol ampliado.
La prueba histórica nueva usa el software original completo aislado y verificado,
no una excepción del acreditador actual.

## Conservación y cierre

La comparación final SHA-256 confirmó intactos los 383 archivos previos,
`.git/index` y `.git/HEAD`: **385 entradas, cero diferencias**. Se volvió a medir
el TAR y coincide con el hash documentado. Se agregan exclusivamente 17 archivos
en los dos directorios autorizados: seis módulos, cinco JS de pruebas/arnés,
un manifiesto local y cinco documentos. No hay archivos nuevos fuera de alcance.
Git conserva 18 tracked modificados, cero staged y pasa de 173 a 190 untracked.

La identidad administrativa admin-4, sus descriptores, código, checkpoints y
herramienta de membresía no se reescriben. El árbol ampliado sigue rechazado
por sus guardas hasta una acreditación futura revisada. No se crea runtime_5.json.
La lista exacta de 34 JS candidatos, con sus SHA-256 reales y diez componentes
adicionales revisables, se entrega en
[FUTURO_INVENTARIO.md](../../functions/contabilidad_preparacion_acreditada_demo/FUTURO_INVENTARIO.md).

FIN-7C.4E.1E queda implementado y validado como procedimiento de ensayo local con
procedencia persistida. Continúan pendientes la acreditación administrativa,
el vínculo aprobado entre identidades, activación, conciliación mixta V1/V2,
recuperación posterior a escrituras V2 y controles reales de producción.
No se avanza a ninguna de esas etapas.

## Incidencias conservadas

Un sondeo inicial de los metadatos de la CLI intentó leer su configuración global
y recibió EPERM. El arnés lee ahora exclusivamente el JSON instalado de versiones
del emulador y usa configuración temporal externa; no accede a credenciales.

El primer arranque llegó a iniciar el emulador pero rechazó la configuración
FIREBASE_CONFIG ampliada por la CLI, antes de cargar pruebas/SDK. Se fijó en el
arnés la configuración admitida `{projectId:'demo-fesync'}`. No se relajó la guarda.

La primera corrida completa aprobó 68/70 y falló dos aserciones de pruebas que
suponían que un set idéntico cambia updateTime. El emulador conserva la versión
en ese caso. Se corrigieron las fixtures para cambiar/restaurar el contenido,
manteniendo la exigencia de rechazo de una versión realmente distinta. No se
rebajó la comparación del verificador. Se añadió después el rechazo de fuentes
extra en subdirectorios, el vínculo ultimoPaso/fence y un escenario concurrente.

No se presentan las inyecciones de transporte/commit como fallos reales de
infraestructura ni las fixtures sintéticas como activaciones acreditadas.
El SIGINT del emulador al finalizar corresponde a su apagado normal.
