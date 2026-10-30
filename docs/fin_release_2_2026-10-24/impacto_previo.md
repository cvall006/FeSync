# Impacto identificado antes de editar FIN-RELEASE-2

Respaldo de 547 archivos locales no ignorados, diff de trabajo e índice, estado,
HEAD y rama en `C:\Users\igles\AppData\Local\Temp\fesync-fin-release2-20261024-203456`.
Incluye archivos versionados y nuevos; las eliminaciones previas constan en el
estado Git. Se excluyen cachés y dependencias ignoradas.

`functions/finanzas_core/adaptador_firestore.js`, `proyecciones.js` y
`conciliacion.js` aparecen en inventarios históricos. Modificarlos invalidaría
esas identidades y afectaría ensayos administrativos. No se editarán.

`contabilidad_demo/fuentes.js` y
`contabilidad_preparacion_acreditada_demo/runtime.js` excluyen `functions/test`
de su enumeración del runtime. La implementación incremental se ubicará en esa
zona de pruebas, como V1 exclusivo de emuladores. No se regenerarán inventarios.
La entrada pública `functions/index.js`, reglas, V2, preparadores y Work no cambian.

El cambio de escritor usará el protocolo existente con época V1 2, después de
pausar y conciliar el libro. El escritor anterior exige época 1 y quedará
rechazado. No se concederá autoridad histórica a una proyección ni a su checksum:
la conciliación separada conserva `certificacionHistorica: false`.
