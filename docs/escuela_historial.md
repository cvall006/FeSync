# Historial y seguimiento de Escuela Bíblica

Dentro de Escuela se añaden las entradas «Mi formación bíblica» y «Seguimiento
de alumnos». La primera consulta únicamente los documentos del usuario actual;
la segunda requiere `admin_iglesia` o `lider_area` y permite buscar participantes,
filtrar ciclos y abrir el historial completo de un alumno.

Se mantienen las rutas existentes:

`iglesias/{iglesiaId}/escuela_ciclos/{cicloId}/asignaciones/{hermanoUid}`

La asignación actual conserva sus campos y añade opcionalmente
`historialModulos`, una lista de registros anteriores. Al cambiar de módulo,
la transacción agrega una copia exacta del registro vigente, con su estado,
identidad, títulos, fechas, responsables y revisión. El módulo nuevo comienza
pendiente. Los cambios de estado de la asignación actual no alteran esa lista.
Las reglas exigen la conservación exacta del historial: no basta con ocultar
los controles en Flutter.

No hay migración ni colección nueva. Los documentos anteriores se leen como
una única asignación registrada. No se pueden reconstruir módulos que ya fueron
sobrescritos antes de este cambio. Las notas y asistencias antiguas no se
interpretan como estados ni se trasladan automáticamente.

El progreso es completados / registros asignados, incluyendo registros previos
y actual; no usa todo el catálogo como denominador. Un módulo repetido en otro
ciclo tiene su registro independiente. Cerrar un ciclo conserva sus datos. Los
ciclos eliminados lógicamente siguen ocultos, según el comportamiento existente.

Para acotar el tamaño del documento, cada asignación admite hasta 100 registros
anteriores además del actual. Al alcanzar ese límite se exige otro ciclo; nunca
se trunca ni se borra el historial.

La lectura general de asignaciones queda limitada a administradores y líderes
vigentes de la iglesia. Un miembro puede obtener exclusivamente su documento
por UID en cada ciclo. No se usan consultas globales ni índices nuevos. El
seguimiento muestra también participantes históricos aunque ya no aparezcan
en la lista actual de miembros; utiliza las identidades y nombres registrados.

Antes de publicar deberá coordinarse el cliente con estas reglas. Los clientes
antiguos pueden seguir actualizando estados, pero sus cambios de módulo que
omitan conservar el registro anterior serán rechazados. No se ejecutó ningún
despliegue ni operación con datos reales durante la implementación.

Pruebas focalizadas:

```powershell
flutter test --no-pub test/escuela_historial_test.dart test/escuela_asignaciones_service_test.dart test/escuela_asignaciones_screen_test.dart test/escuela_hermanos_servidor_test.dart
node test/escuela_rules/ejecutar.cjs
```
