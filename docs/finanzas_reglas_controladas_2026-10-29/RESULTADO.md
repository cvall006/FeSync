# Reglas Firestore publicadas y verificadas

Proyecto `fesync-app-2026`, release `cloud.firestore`. Solo se publicaron reglas Firestore, con salida CLI **0**. No se continuó a otra etapa.

- Ruleset efectivo: `projects/fesync-app-2026/rulesets/a8314ca6-cb38-49f1-81c9-28216a197d19`.
- Actualizado `2026-10-30T02:35:34.102114Z`, equivalente a **29/10/2026 23:35:34 en Santiago**.
- SHA-256 exacto: `16b392f3b000b352e6c80b501447dba34928d28edebf3fed1f5026dcf46db56a`, igual al candidato previamente revisado y al archivo probado localmente.
- Ruleset anterior respaldado: `26a2c1e2-5ea0-4d03-bf30-b19ac39873af`, SHA-256 `8398b1200abe8f2b5c1f879bcf866566b7f1d0c68e55c6b37893117ae6d324f0`; coincidió con el snapshot documentado antes de publicar.

## Compatibilidad comprobada

Se descargaron solo los ZIP de código de las dos Functions antiguas, ligados a las generaciones de sus fuentes y revisiones desplegadas:

| Function sin actualizar | Revisión conservada |
| --- | --- |
| `registrarNuevaIglesiaSegura` | `registrarnuevaiglesiasegura-00002-pal` |
| `vincularUsuarioConCodigo` | `vincularusuarioconcodigo-00002-heq` |

Los dos index descargados son idénticos y no contienen `pertenenciaId`. Sus altas nuevas no lo generan; sus escrituras usan merge y no eliminan una clave preexistente. Publicar reglas no asigna pertenencias ni convierte automáticamente las altas de estos handlers en perfiles protegidos. No se ejecutaron esas Functions en producción.

**104 comprobaciones locales aprobadas:** 46 permisos financieros, 13 privacidad, 33 pertenencia, 11 compatibilidad y un recorrido completo con las fuentes realmente desplegadas. Este último comprobó alta de iglesia/miembro sin generación, edición de perfil/token, roles servidor/líder, expulsión, reingreso, salida, transferencia administrativa y salida posterior del antiguo titular. Usó los payloads de las pantallas legacy de HEAD como referencia del cliente habitual. No se descargó ni ejecutó el JavaScript servido por Hosting; no se afirma cobertura de consumidores externos.

Todas las escrituras de prueba fueron sintéticas, en `demo-fesync` y Firestore local `127.0.0.1:8098`; los procesos de pruebas bloquearon sockets externos. Se cerró el emulador propio. No se consultó el contenido de perfiles reales ni se ejecutaron operaciones reales de membresía o financieras.

**Restricciones deliberadas:** perfiles con la clave `pertenenciaId` presente, incluso nula, no pueden usar salida/expulsión/cambio de rol mediante escrituras directas antiguas ni borrar su generación. Necesitan cliente compatible para acciones protegidas. El cliente habitual tampoco puede fabricar generaciones ni elevar roles. Los perfiles sin esa clave conservan las operaciones legacy comprobadas. No se encontró una interrupción nueva en esos flujos; la futura preparación de cualquier perfil debe coordinarse con el cliente compatible. Esta prueba no es un inventario nuevo del estado de todos los usuarios reales.

## Privacidad y verificación posterior

Las reglas efectivas son idénticas byte a byte a las probadas: movimientos, cierres, auditoría, controles, saldos y recibos continúan sin acceso directo cliente; no se abrieron escrituras financieras. Se mantienen las lecturas de acceso/catálogos/descubrimiento que el candidato autoriza para los roles correspondientes; el apagado no se presenta como ocultación de toda metadata.

La comparación posterior confirmó las **23 Functions intactas**, incluyendo las 13 originales y las diez nuevas. Los dos callables V1 mantienen `FINANZAS_V1_SERVIDOR_HABILITADO=false`; no se modificaron flags, gates, acceso, perfiles o libros. La comprobación de permisos posterior fue por identidad del archivo efectivo con las reglas ensayadas, sin intentar lecturas o escrituras de documentos reales.

La guardia de publicación solo permitió compilar las reglas, crear su ruleset y actualizar `cloud.firestore`; comprobó de nuevo el ruleset previo antes de cada mutación. No permitió modificar Functions, Hosting, Storage, IAM, APIs, índices ni datos. No hubo diferencias remotas inesperadas.

## Respaldo y reversión

`respaldo-remoto.json` conserva el release/ruleset originales y `respaldo-remoto.rules` sus bytes; su hash se volvió a verificar al terminar. `firebase.reversion.json` selecciona exclusivamente ese respaldo. `reversion-solo-documentada.ps1.txt` contiene el comando de restauración y la comprobación del hash efectivo posterior. La restauración por CLI puede crear otro ID de ruleset con el contenido original exacto.

No se ejecutó reversión porque la publicación y verificación terminaron correctamente. Antes de una reversión futura se debe confirmar Finanzas apagado y revisar si ya existen perfiles preparados: volver a la regla anterior permitiría editar generaciones. No borrar pertenencias ni recibos para hacer viable esa vuelta. Si la preparación/activación ya comenzó, detener y revisar una corrección compatible en lugar de restaurar ciegamente.

## Incidencias locales resueltas

El primer recorrido del arnés VM falló porque Firestore exige una Promise del realm anfitrión; se normalizó únicamente esa frontera del arnés, sin modificar las fuentes desplegadas, y se repitió solo ese caso con resultado aprobado. No se presenta esa primera pasada como exitosa. El primer intento del ejecutor de publicación se detuvo antes de consultar/publicar por leer logs PowerShell UTF-16 como UTF-8; se corrigió únicamente la lectura y se conservaron los diagnósticos. Ninguno de esos errores cambió producto o datos.

Evidencia: `reglas.log` (103 aprobadas antes del fallo del arnés), `reglas-legacy.log` (recorrido corregido aprobado), `flujo-legacy.json`, `preflight.json`, `antes-deploy.json`, `guardia.jsonl`, `salida-cli.json` y `verificacion-final.json`.

Sin cambios de Functions, Hosting/live, Storage, IAM, datos, titular/libro piloto, activación financiera, commits o rama. V2, Work, inventarios y módulos ajenos intactos. La siguiente etapa permanece pendiente de autorización explícita.
