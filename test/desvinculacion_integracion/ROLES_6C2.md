# FeSync 6C.2 — cambios de rol contra emuladores

Desde la raíz, con las dependencias ya instaladas:

```powershell
node test/desvinculacion_integracion/iniciar.js
npm.cmd --prefix functions test
```

La configuración existente basta; no se modifica firebase.json, reglas ni backend.
La lista de exportaciones del runtime de pruebas incorpora los dos callables reales
de roles en southamerica-west1. El ejecutor añade roles.test.js secuencialmente,
porque las suites vacían el mismo Firestore emulado con fixtures ficticias.

## Aislamiento y método

- Guardia antes de importar SDKs: exclusivamente demo-fesync y hosts locales
  esperados de Auth, Functions, Firestore y Storage. Rechaza credenciales,
  proyectos ajenos y variables de emulador ausentes.
- El ejecutor no hereda variables privadas del IDE ni una sesión Firebase CLI.
- Identidades anónimas creadas mediante Firebase Auth SDK conectado al emulador.
  Tokens solo en RAM; sin nombres/correos reales, credenciales ni logs de tokens.
- Callables por protocolo HTTP real del emulador, con esos ID tokens. No se invocan
  handlers internos ni se sustituyen las transacciones, updateTime o Auth por dobles.
- Fixtures y verificaciones con Admin SDK exclusivamente local, sin ADC.
- Lecturas y escrituras cliente mediante Firebase Firestore SDK real, conectado
  a Auth Emulator; no identidades ficticias de rules-unit-testing en esta suite.
- Triggers de notificación excluidos y getMessaging bloqueado en el runtime.
  La entrega FCM queda fuera de la prueba.

## Escenarios

| Escenario | Comprobación |
| --- | --- |
| Contexto legítimo | Coincide exactamente con updateTime de perfil/iglesia, segundos y nanosegundos; fotografía de base sin escrituras |
| Cambios en ambos sentidos | Solo cambia rolGlobal; perfil, auditoría y recibo comparten updateTime de commit |
| Finanzas y auxiliares | Descripción, período, iglesia, preferencias, token y documentos financieros mantienen contenido y versión; el encargado conserva acceso como líder o servidor |
| Actores sin autoridad | Líder, servidor, encargado, antiguo administrador y usuario externo reciben permission-denied |
| Contexto no permanente | Perder titularidad después de leerlo impide aplicarlo |
| Objetivo administrativo/legado | Se rechaza titular y perfil administrativo incoherente; ausencia de ID exige migración |
| Precisión de versiones | Alterar un nanosegundo, conservando el mismo milisegundo, produce aborted sin escrituras |
| Edición auxiliar posterior | Descripción modificada invalida el contexto, sin sobrescribirla |
| Rol y transferencia ida/vuelta | Operaciones reales invalidan la versión previa aunque vuelva el mismo rol/titular |
| Rol coincidente | Solo recibo, sin actualizar perfil ni crear auditoría de cambio |
| Repetición y clave reutilizada | Replay histórico sin escrituras; otros parámetros con la misma clave se rechazan |
| Repetición concurrente | Un solo recibo y una sola auditoría |
| Transferencia concurrente | Cambio anterior al traspaso o rechazo; no restituye autoridad al actor anterior |
| Salida y expulsión concurrentes | No restauran pertenencia; revocación financiera permanece efectiva |
| Salida/reingreso concurrentes | La solicitud anterior no cambia el rol del nuevo período |
| Nuevo período o iglesia | Solicitud aún no ejecutada se rechaza; recibo confirmado solo devuelve historia sin mutaciones |
| Recibos y auditoría privada | SDK cliente no obtiene, enumera, crea, modifica o elimina recibos; auditoría no legible/escribible por cliente, ni por titular |
| Reglas 6B | El SDK sigue sin poder cambiar rolGlobal directamente |

**El contexto es una precondición de concurrencia, nunca autorización permanente.**
La autorización se vuelve a comprobar en servidor para cada ejecución nueva.
CONFIRMADA describe la solicitud original; no acredita rol, pertenencia o permisos
actuales. No se elimina un recibo para permitir aplicar otra vez la misma intención.

Las carreras son solicitudes HTTP solapadas y aceptan resultados serializables;
no se instrumenta código productivo para imponer un orden interno ni se afirma
que cada ejecución haya provocado un reintento de Firestore. La prueba no cubre
todos los interleavings, producción, Flutter ni persistencia nativa del cliente.
Se mantienen pendientes la adaptación Flutter, migración, transición de clientes
antiguos y autorización coordinada de publicación. No se realiza ningún deploy.

## Resultados de esta validación

| Suite | Aprobadas | Fallidas |
| --- | ---: | ---: |
| Roles contra Auth/Functions/Firestore emulados | 27 | 0 |
| Membresía integrada | 17 | 0 |
| Simulador y motor de migración | 15 | 0 |
| Reglas de perfiles 6B | 33 | 0 |
| Reglas de Finanzas | 46 | 0 |
| Capacitaciones y Storage | 8 | 0 |
| **Total con emuladores** | **146** | **0** |
| Node completo (`npm.cmd test` en functions, principalmente dobles) | 481 | 0 |

`node --check` aprobó los tres JS nuevos o modificados. La guardia rechazó
ejecuciones con otro proyecto y sin variables de emulador antes de importar SDKs.
Los hashes de roles.js, index.js, membresia.js, finanzas.js y ambas reglas
permanecieron iguales a los observados al iniciar este paso.

Incidencia: un primer arranque terminó con 17 fallos en la suite preexistente de
membresía, antes de alcanzar roles. No se conservó suficiente detalle para
determinar su causa. La repetición registrada, sin cambios productivos, completó
las 146 pruebas con código de salida 0. El fallo inicial no se reprodujo y su
causa queda sin confirmar; no se atribuye a un defecto específico ni se oculta
como una ejecución aprobada.
