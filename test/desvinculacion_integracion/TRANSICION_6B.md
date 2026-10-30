# FeSync 6B — cierre local de pertenencia por SDK

**Solo local, sin despliegue.** Se modifica únicamente la autorización de escritura
del documento usuarios_globales/{uid}. Finanzas, Capacitaciones, Storage, las
lecturas y los permisos de dispositivos conservan sus reglas anteriores.

## Política

Ambas vías de update (propietario y administrador de otro perfil) exigen que
diff().affectedKeys() no incluya iglesiaId, rolGlobal ni pertenenciaId. Cubre
adición, modificación, cambio de tipo y eliminación, tanto en update como merge,
reemplazo, batch y transacción cliente. create y delete siguen denegados.
Los comodines generales continúan denegando accesos; la subcolección dispositivos
no concede permiso para escribir el documento padre.

El propietario vinculado conserva edición auxiliar (nombre, descripción, foto,
tema, contadores y FCM). Un administrador conserva edición de descripción ajena.
Reenviar valores idénticos de pertenencia no es una alteración y puede acompañar
una edición auxiliar permitida. Reemplazar el perfil conservando exactamente los
tres campos protegidos también puede estar permitido; no se bloquea el método
set en sí, sino cualquier alteración de pertenencia.

La ausencia de pertenenciaId en un perfil legado no se corrige ni se exige para
leer o editar auxiliares. No se permite añadirlo desde cliente. Las restricciones
auxiliares de perfiles ya desvinculados/incompletos no se amplían en este paso.

## Compatibilidad y bloqueos antes de publicar

| Flujo | Efecto de publicar estas reglas en el futuro |
| --- | --- |
| PerfilScreen antiguo: limpieza FCM seguida de update que elimina iglesiaId/rolGlobal | permission-denied al salir; la limpieza previa podría haber desactivado sus notificaciones aunque siga vinculado |
| GestionMiembrosScreen antiguo: update que elimina iglesiaId/rolGlobal/descripcion | Expulsión denegada, sin cambios parciales del perfil |
| Selector de rol servidor/lider_area en Gestión de Miembros, **también en el Flutter actual** | Cambiar rolGlobal falla y tampoco guarda la descripción enviada en esa escritura; requiere futura operación segura de servidor o coordinación de interfaz |
| Guardar descripción reenviando el mismo rol | Permitido dentro de los permisos auxiliares existentes |
| Escritura completa con datos de pertenencia obsoletos | Denegada; no restaura iglesia, rol o período antiguos |
| Salida/expulsión nuevas mediante coordinador y callable | Funciona con período válido; transacción Admin SDK no queda limitada por estas reglas |
| Perfil legado sin ID que intenta salida por callable | failed-precondition; requiere preparación/migración previa, sin fallback cliente |
| Lectura propia/congregacional y edición auxiliar de legado vinculado | Conservadas; no se exige pertenenciaId |
| Creación, vinculación y transferencia por callables existentes | Conservadas mediante Admin SDK |

No se conocen las versiones exactas instaladas: la incompatibilidad se identifica
por esos patrones de código, no se afirma que todos los binarios publicados sean
iguales. No publicar reglas aisladamente: coordinar backend, migración/preparación
de legados, actualización de clientes y resolución del editor de roles. La política
de actualización obligatoria/soporte a clientes viejos queda pendiente de decisión.
No se añade una excepción cliente, ni se implementa un nuevo callable de roles.

## Validación

Reutilizar `node test/desvinculacion_integracion/iniciar.js`: demo-fesync obligatorio,
Auth/Functions/Firestore/Storage locales, datos ficticios y FCM bloqueado.
La suite de perfiles cubre actores, legados, update/merge/reemplazo, cambios
combinados, batches, transacciones y lecturas acotadas. La integración real verifica
denegación REST de las rutas antiguas y salida/expulsión por callable, revocación
atómica y reingreso sin recuperar la designación revocada.

Resultado final: **119 pruebas emuladas aprobadas, 0 fallidas**: 17 de callables
reales, 33 de reglas de perfiles, 46 de Finanzas, 8 de Capacitaciones/Storage y
15 de simulador/motor de pertenencia. Reglas compiladas y ejecutor final con
código 0. `npm.cmd test` en functions/: **406 aprobadas, 0 fallidas** (lógica pura,
dobles y guardias, no integración). Los dos JS afectados pasan `node --check`.
El diff de reglas respecto del inicio de 6B afecta solo el bloque de perfiles;
el resto de reglas se comprobó idéntico. No se instalaron dependencias.

El cierre evita nuevas omisiones de revocación por estas rutas de perfil; no sanea
designaciones antiguas ya existentes ni demuestra procedencia de IDs por formato.
Los dispositivos FCM sin período, mensajes en tránsito y demás riesgos de 6A
continúan pendientes. No se declara seguridad global ni preparación de producción.
