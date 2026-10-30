# Impacto identificado antes de editar código

Respaldo verificado de 575 archivos, con sus cambios locales previos, en la ruta
registrada en `respaldo.json`. Se conserva la eliminación previa de la sesión
Kotlin. No se cambian rama, índice ni commits.

`functions/index.js` pertenece al inventario histórico `fuentes_v1.json`.
Agregar dos exportaciones cambia sus bytes y deja de satisfacer la identidad
histórica. Agregar un módulo de conexión fuera de `functions/test` también cambia
el conjunto enumerado por las guardas administrativas. Estos rechazos son
esperables y se informarán: no se regeneran inventarios, no se alteran hashes ni
se debilitan pruebas o guardas para aceptarlos. Ninguna acreditación anterior
describe los bytes nuevos.

Se reutilizan sin cambios el API, adaptador, catálogos y funciones económicas
incrementales de FIN-RELEASE-2. La conexión normal solo agrega autorización de
servidor y un documento privado de habilitación, leído en cada intento
transaccional, incluido el reintento de un recibo confirmado. No exporta
inicialización, fixtures, migración ni mantenimiento.

El circuito nuevo conserva el bloqueo estricto del backend a `demo-fesync`,
Firestore 8088, Auth 9098 y `FUNCTIONS_EMULATOR=true`, sin credenciales reales.
No se habilita ejecución productiva. El documento adicional de habilitación
está denegado a clientes por las reglas actuales de `finanzas_control`; no se
necesita modificarlas. Los callables antiguos y la conexión Flutter quedan
intactos.

Se prevén dos callables nuevos: `finanzasV1Consultar` (saldos/resumen/catálogos e
historial paginado) y `finanzasV1Ejecutar` (las ocho acciones existentes).
La habilitación privada es independiente del módulo financiero y exige también
protocolo V1 época 2 y proyecciones inicializadas/verificadas. Por defecto no
existe, por lo que bloquea. No hay un callable para activarla.
