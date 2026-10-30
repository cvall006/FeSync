# Carga masiva de Escuela Bíblica

Publicada en producción el 30 de octubre de 2026 por autorización expresa.
No se ejecutaron migraciones ni cargas de avances de prueba en datos reales.

- Aplicación habitual: https://fesync-app-2026.web.app
- Versión Hosting: `b1b4ba69de31b647`.
- JavaScript: `main.escuela-516d575d269a5eaa.dart.js`.
- Function nueva: `escuelaCargarModulos`, región `southamerica-west1`, revisión
  `escuelacargarmodulos-00001-qud`.
- Las 23 Functions anteriores conservaron exactamente sus configuraciones y
  revisiones. Total posterior: 24 Functions.
- Reglas sin cambios: `2d89f491-625a-4986-8df4-fe42a68892d1`.
- Versión Hosting recuperable anterior: `e8c5ec03728fbb5f`.

Se comprobaron hashes remotos, arranque real en Chrome, pantalla de login Google
sin errores de ejecución, rechazo HTTP 401 sin Auth y con token inválido, CORS
desde live e invocador público únicamente del servicio callable nuevo. No se
utilizó una sesión de administrador para crear registros en producción. Las
pruebas de carga autorizada, historial y concurrencia se hicieron en local.
Evidencias y reversión de Hosting:
`docs/escuela_carga_publicacion_2026-10-30/`.

## Uso

Asignaciones de Escuela → Carga masiva. Administrador o líder vigente elige un
ciclo abierto, varios hermanos activos y el estado deseado de cada módulo.
«No asignar» excluye el módulo. Seleccionar todos incluye a todos los hermanos,
incluso si hay una búsqueda visible. La vista previa no escribe. Guardar pide
confirmación y vuelve a verificar el estado real antes de escribir.

El catálogo existente es de la iglesia, no pertenece a un ciclo. Se reutiliza
para el ciclo elegido sin copiar módulos ni crear relaciones nuevas. Los ciclos
cerrados o eliminados conservan su historial y no admiten cargas. Para cargar
antecedentes se necesita un ciclo abierto. No se deducen avances de evaluaciones
legacy ni se inventan fechas históricas: autor y fecha corresponden a la carga.

## Contrato y conciliación

Se mantiene `iglesias/{iglesia}/escuela_ciclos/{ciclo}/asignaciones/{uid}`:
registro actual más `historialModulos`. No hay colecciones ni índices nuevos.
El último módulo nuevo de la selección queda como actual; los demás quedan en
el historial existente y ambos se ven en Mi formación y Seguimiento.

El callable `escuelaCargarModulos` valida Firebase Auth y relee dentro de cada
transacción el perfil del actor, su rol admin_iglesia/lider_area, la iglesia del
alumno, el ciclo abierto y los módulos de esa iglesia. Reutiliza el contrato de
Escuela (pertenencia actual por `usuarios_globales.iglesiaId`, incluidos perfiles
legacy); no exige ni migra la generación financiera `pertenenciaId`.

Por cada pareja alumno/módulo busca tanto el registro actual como el historial:

- Ausente: crea el registro con el estado solicitado.
- Todos los registros existentes tienen el estado solicitado: omite sin escribir.
- Alguno tiene otro estado: informa conflicto y conserva todos los registros.

Una transacción guarda todos los módulos nuevos de un alumno, preservando sus
registros previos. Los conflictos no impiden crear otros módulos ausentes de ese
alumno. Un error de validación o el límite del historial impiden escribir para
ese alumno. No hay atomicidad global entre alumnos: el resultado detalla la
carga parcial. Transacciones concurrentes releen antes de confirmar.

Máximo 30 módulos por carga y 30 alumnos por petición. El cliente divide más
alumnos en peticiones consecutivas desde una sola acción. Cada transacción
escribe un único documento y conserva el límite existente de 100 registros
archivados más uno actual. No se trocean escrituras de un mismo alumno.

Una respuesta de transporte incierta detiene las peticiones restantes. Revisar
de nuevo consulta el servidor y concilia también los módulos archivados: lo ya
confirmado pasa a omitido y no vuelve a crearse. No hay un paso intermedio que
asigne pendiente antes de completar; así el reintento no modifica pendientes
ajenos. Si otro administrador cambió un estado, se informa conflicto.

Las reglas Firestore existentes siguen negando escrituras de miembros y lectura
entre iglesias. No se amplían para permitir al cliente fabricar historiales;
la escritura masiva se realiza exclusivamente por el callable con Admin SDK y
sus verificaciones transaccionales. Las reglas de lectura existentes protegen
el resultado. No se modificaron reglas para esta carga.

## Validación local focalizada

```powershell
node --test functions/test/escuela_carga_masiva.test.js
flutter test --no-pub test/escuela_carga_masiva_test.dart test/escuela_asignaciones_screen_test.dart test/escuela_historial_test.dart
node test/escuela_rules/ejecutar.cjs
dart analyze lib/modules/escuela test/escuela_carga_masiva_test.dart
```

El ejecutor de reglas usa únicamente el emulador instalado y el proyecto
`demo-fesync-escuela`, sin credenciales de producción. Incluye el callable real
contra Firestore emulado, dos cargas concurrentes, lectura propia/general,
denegación de escritura común y aislamiento. Las pruebas unitarias incluyen
respuesta perdida tras commit, lotes interrumpidos y conciliación de reintento.

## Procedimiento de publicación utilizado

1. Respaldar la versión Hosting live y verificar proyecto y reglas actuales.
2. Desplegar **únicamente** el nuevo callable, heredando southamerica-west1:
   `firebase deploy --project fesync-app-2026 --only functions:escuelaCargarModulos`.
   No usar despliegue global de Functions. Verificar configuración y acceso Auth.
3. Compilar Web conservando las definiciones vigentes de Finanzas
   (`FESYNC_FINANZAS_DEMO=false`, `FESYNC_FINANZAS_TRANSPORTE=publicable`,
   `FESYNC_FINANZAS_PROYECTO=fesync-app-2026`,
   `FESYNC_FINANZAS_CLIENTE_HABILITADO=true`). Preparar el artefacto con identidad
   de versión y prevención de caché siguiendo la publicación Web existente.
4. Publicar únicamente Hosting de ese artefacto y comprobar login, acceso de
   administrador/líder y preview sin crear avances ficticios en producción.
   No hacen falta reglas, índices, migraciones ni despliegues de otras Functions.
5. Si falla el cliente, restaurar la referencia Hosting anterior. Los datos usan
   el mismo esquema y el cliente anterior puede leerlos. No eliminar registros
   históricos como mecanismo de reversión.
