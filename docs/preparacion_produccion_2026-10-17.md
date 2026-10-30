# FeSync — preparación técnica para producción

Fecha: 17 de octubre de 2026. Estado: **NO APTO PARA AUTORIZAR DESPLIEGUE**.
Trabajo exclusivamente local con datos ficticios y proyecto `demo-fesync`.
No se desplegó, consultó ni modificó Firebase de producción; tampoco se ejecutó
una migración real, se crearon commits o se cambió de rama.

## 1. Estado recibido, respaldo y conservación

- Archivo recibido: `fesync(1).zip`, 175.170.905 bytes, 27.573 entradas.
- SHA-256: `05999b8fc271f443714eb270d63da6a906afa640c3ca73eb772dbbe6b2002970`.
- CRC de todas las entradas comprobado. Original intacto y separado de la copia de trabajo.
- Rama: `integration/adora-live`; HEAD: `01223cd` — Mejorar Capacitaciones con categorias y archivos.
- Estado inicial con `git status --porcelain=v1 -uall`: 202 entradas, 127 modificadas y 75 sin seguimiento.
- Se conservaron los diffs del árbol de trabajo y del índice y un inventario SHA-256
  de los 16.018 archivos regulares extraídos fuera de `.git`.
- Los 22 enlaces de plugins generados de Linux/Windows no se materializaron: apuntan
  a instalaciones externas del equipo original. Sus entradas permanecen en el ZIP.
- `git fsck --full --no-reflogs` terminó con código 0; informa árboles colgantes
  preexistentes, que se conservaron. No se efectuó limpieza de objetos.
- Adora Live, Capacitaciones, Finanzas, reglas y todos los cambios recibidos se
  conservaron como base. La comparación final se hace contra el ZIP recibido,
  no solo contra HEAD, para distinguir este encargo del trabajo acumulado.

El ZIP respalda código e historial Git; **no es un respaldo de datos Firebase**.
La restauración verificada aquí es extracción y comparación del código. IAM,
exportaciones administradas y restauración real de datos requieren otro entorno.

## 2. Correcciones realizadas

### Recuperación de ingreso incierto

`CoordinadorIngreso` distinguía errores definitivos del envío actual, pero podía
marcar rechazada una intención cuyo envío anterior tenía resultado incierto.
Ejemplo: commit remoto, respuesta perdida y luego rechazo de Auth al reintentar.
Ese rechazo no prueba que el primer envío nunca ocurrió.

Ahora solo el primer envío puede finalizar como rechazado por esos códigos. Tras
incertidumbre se conserva el identificador y se exige reconciliar. La marca
persistida permite mantener esta protección después de reiniciar la aplicación.
Se añadieron ocho regresiones: cuatro códigos, con y sin reinicio, respuesta
perdida después del efecto remoto, cambio de parámetros bloqueado y recuperación
posterior con la clave original. **Estas pruebas Flutter no se ejecutaron aquí**.

### Limpieza FCM conservadora

En el código recibido, la limpieza de un dispositivo inválido borraba su documento
sin releer el token. La limpieza del campo legado comparaba mediante una lectura
y escribía después, dejando una carrera. Se reprodujeron ambos riesgos con dobles
del código original: una respuesta tardía podía retirar el token renovado.

El helper `functions/fcm_limpieza.js` relee y compara dentro de una transacción,
elimina únicamente el token enviado que todavía coincide y no recrea documentos
ausentes. No cambia el contrato cliente, la selección de destinatarios ni la
arquitectura de notificaciones. Doce pruebas Node y dos pruebas de Firestore
emulado cubren preservación de renovación, ausencia, tipos y reintento transaccional.
Esto **no** acredita entrega FCM, aislamiento por instalación/período ni retirada
de mensajes ya enviados.

### Dependencias y diagnóstico

- `crypto` declarado directamente en pubspec, conservando 3.0.7 en el lock.
  Se retiraron las tres supresiones de dependencia transitiva correspondiente.
- `google-auth-library` declarado como dependencia de desarrollo de Functions,
  en la misma versión instalada 10.9.1. Las pruebas lo importan directamente;
  no se actualizó Firebase Admin ni Firebase Functions.
- Diagnóstico cerrado por etapa de preparación, Auth, callable y fixtures:
  solo fase y código permitido, nunca mensaje, stack, documentos, rutas o tokens.
  El ejecutor sanitizado conserva esos diagnósticos y sigue deteniendo la corrida
  cuando una suite falla. No se añadieron reintentos automáticos de suites.
- Nueva carrera del ensayo con salida y reingreso **a otra iglesia**, pendiente
  de ejecutar con Functions Emulator. Los motores productivos de migración no cambiaron.

## 3. Pruebas y límites de esta ejecución

| Validación | Resultado | Alcance |
| --- | --- | --- |
| Node antes de modificar | 481 aprobadas, 0 fallidas | Lógica, dobles y guardas |
| Node final | 495 aprobadas, 0 fallidas, 0 omitidas | Incluye 12 de FCM y 2 de diagnóstico nuevas |
| Firestore + Storage finales | 104 aprobadas, 0 fallidas, 0 omitidas | Suites completas de la tabla siguiente |
| Ensayo operativo seleccionado | 6 aprobadas, 0 fallidas | Simulación, lotes, repaso, interrupción/reanudación, dos coordinadores y checkpoint; selección explícita, no suite completa |
| Guardas del ensayo final | 7 aprobadas, 0 fallidas | Rechazo de proyectos, hosts y credenciales no admitidos |
| Sintaxis JS modificados/nuevos | Verificación local | No sustituye pruebas funcionales |
| Dependencias Node directas | `npm ls --depth=0` correcto | Admin 13.10.0, Functions 6.6.0, Google Auth 10.9.1 |
| Flutter | NO EJECUTADO | No hay SDK Flutter/Dart compatible en el contenedor |
| Suite completa con Functions | BLOQUEADA POR ENTORNO | Socket Unix del runtime rechazado con EPERM |

Desglose de las 104 pruebas emuladas aprobadas:

| Suite | Aprobadas |
| --- | ---: |
| Simulador de pertenencia | 3 |
| Motor de pertenencia | 12 |
| FCM: limpieza condicional en Firestore | 2 |
| Reglas de membresía/perfiles 6B | 33 |
| Reglas financieras | 46 |
| Capacitaciones y Storage | 8 |

Herramientas de esta validación: Node 24.19.0, Firebase CLI 15.34.0, JRE
Zulu 21.0.6, Firestore Emulator 1.22.0 y Storage Rules Runtime 1.1.3.
Herramientas instaladas fuera del repositorio; JARs comprobados contra los hashes
publicados por la CLI. No se cambiaron `.firebaserc`, `firebase.json` ni las reglas.

Los seis escenarios operativos se seleccionaron por nombre de forma explícita,
con Auth, Firestore y Storage reales de Emulator Suite, sin Functions. Comprueban
recuperación del checkpoint y asignaciones en demo; no comprueban callables ni
restauración de exportaciones reales. No sumar corridas repetidas como escenarios
distintos. El total de 495 Node tampoco sustituye los casos de integración.

### Repetición pendiente en un entorno compatible

Desde una copia independiente del repositorio, con Node 24, Java 21, Firebase CLI
compatible con Node 24 y Flutter compatible con el SDK Dart exigido en pubspec:

```powershell
npm.cmd --prefix functions test
node test/pertenencia_migracion/iniciar_ensayo.js
flutter pub get --enforce-lockfile
flutter analyze --no-pub
flutter test --no-pub
```

El ejecutor protegido fija demo-fesync y excluye FCM. No sustituirlo por un comando
de despliegue ni lanzar la aplicación normal contra su configuración real. No
ejecutar suites a la vez sobre los mismos puertos. La suite completa ampliada
añade un caso de reingreso a otra iglesia y dos de limpieza FCM a los 168 previos:
171 casos nominales, **pendientes de verificación como recorrido completo**.
El widget_test recibido solo prueba una pantalla mínima y no acredita el arranque
real de FeSync. Las pruebas de dispositivos y entrega de notificaciones requieren
otra validación autorizada y separada.

Intentos fallidos conservados, sin contarlos como aprobados:

1. CLI 15.34.0 con Java 17: rechazado antes de ejecutar pruebas.
2. CLI 14.15.0: descarga inicial fallida; con JAR verificado arranca servicios,
   pero no admite Node 24. Functions no carga: 7 guardas pasan y los 17 escenarios
   de membresía fallan. Es un fallo nuevo y explicado de infraestructura; **no es
   evidencia de la causa del incidente histórico 6C.2**.
3. CLI 15.34.0 y Java 21: permiso de ejecución perdido en el shim extraído de
   `node_modules/.bin/firebase-functions`. Corregido solo en la copia local de dependencias.
4. Arranque siguiente: el contenedor rechaza los sockets Unix del runtime de
   Functions con EPERM. Se interrumpió esa corrida; no se presenta como éxito.
5. La ruta separada de Firestore/Storage terminó limpia y apagó sus emuladores.

Los logs 6C.2 recibidos contienen una corrida aprobada de 146 pruebas. La primera
corrida fallida histórica no conserva detalle suficiente. Las dos corridas de
168 documentadas en 6D.1 son antecedentes recibidos, no resultados repetidos aquí.
La intermitencia histórica continúa **ABIERTA, causa no acreditada**. No atribuirla
a Auth, tiempo de espera, caché o versión CLI solo por similitud del número 17.

## 4. Matriz priorizada de riesgos y compatibilidad

P0 bloquea publicación; P1 requiere resolución o aceptación explícita del riesgo.

| Prioridad | Riesgo real / evidencia | Mitigación y criterio de cierre |
| --- | --- | --- |
| P0 | Falta validar Flutter final y el recorrido real de callables en este entorno | Ejecutar en equipo con Flutter compatible, Node 24, Java 21 y sockets permitidos. Ocho regresiones nuevas, suites Flutter relevantes y ensayo completo ampliado sin fallos |
| P0 | Clientes antiguos escriben salida, expulsión y roles por SDK; 6B los deniega | Inventariar binarios, publicar cliente compatible y aprobar fecha/canal de transición antes de activar reglas. No abrir excepciones de seguridad |
| P0 | Perfiles legados sin ID no pueden usar APIs dependientes del período | Inventario autorizado, simulación, migración administrativa separada y revisión de anomalías antes del cambio de clientes |
| P0 | No existe ejecutor real de migración ni restauración operativa validada | Diseñar/revisar herramienta independiente; ensayo con datos sintéticos, IAM mínimo, backups restaurables, responsables y aprobación de ventana |
| P0 | Designaciones financieras históricas pueden sobrevivir rutas antiguas | Auditar configuración/membresía antes de habilitar Finanzas. Resolver cada designación sin presumir que 6B sanea datos pasados |
| P1 | IDs existentes de formato válido no prueban origen servidor | Cotejar procedencia con evidencia autorizada; no renovar/borrar IDs ni crear comprobantes de origen artificialmente |
| P1 | Los 17 fallos históricos no tienen causa acreditada | Corridas frías independientes con diagnóstico por etapa y versiones registradas; si reaparece, detener, preservar evidencia y analizar antes de repetir |
| P1 | Solicitudes legadas de ingreso sin solicitudId no tienen recibo idempotente | Mantener API compatible durante transición. No prometer idempotencia a esos clientes; retiro de soporte requiere aprobación |
| P1 | Dispositivos FCM sin período y mensajes en tránsito | Avisos genéricos sin contenido sensible; revalidar permisos al abrir. Una futura solución versionada requiere diseño aparte |
| P1 | Almacén local sin CAS entre procesos/pestañas/dispositivos | Un escritor por almacén, recuperación explícita, sin TTL ni otra clave automática. Validar almacenamiento nativo y operación con varias pestañas |
| P1 | Solicitudes financieras administrativas no llevan período/versiones de intención | El servidor valida autoridad y miembro actuales, pero no vincula una designación tardía al período visto al decidir. No habilitar uso financiero sin revisar este escenario; cualquier cambio de contrato se aprueba aparte |
| P1 | Las pasadas de migración no son una foto global | Repaso completo, simulación final y conciliación de conflictos; un coordinador por checkpoint |

### Comportamiento por tipo de cliente/perfil

| Cliente o perfil | Backend compatible | Reglas 6B | Resultado previsto |
| --- | --- | --- | --- |
| Flutter recibido + ID válido | Callables de ingreso/salida/expulsión/roles | Conserva lecturas y bloquea cambios SDK | Contratos alineados por revisión; QA Flutter y callables finales pendiente |
| Cliente antiguo que escribe pertenencia/roles | La compatibilidad de ingreso no cambia | Escritura denegada | Aviso previo, actualización y soporte; no publicar reglas aisladas |
| Perfil legado sin ID | Ingreso nuevo no reemplaza membresía activa | Lecturas/auxiliares vinculados conservados | Migrar antes de usar salida/roles nuevos |
| Perfil con ID inválido o administración incoherente | Rechazos conservadores | Sin reparación cliente | Revisión humana; no normalización automática |
| Solicitud confirmada de período anterior | Reconciliación histórica | No autoriza el período actual | Consultar estado, no inferir permisos del recibo |
| Pérdida o restauración de almacenamiento local | No prueba ausencia remota | Sin fallback | Revisar estado servidor y confirmar otra intención solo cuando corresponda |

Los documentos 6A/6B conservan afirmaciones históricas sobre Flutter y Finanzas.
Para el estado recibido y este cierre, usar esta matriz y los archivos actuales;
por ejemplo, el editor de roles recibido ya usa RolesService y guarda descripción
separadamente. No implementar un segundo editor ni otro callable de roles.

## 5. Solicitudes persistentes: límites y operación

- Ingreso: una intención por UID, huella de parámetros y clave persistida antes
  de enviar. Incertidumbre, ausencia de recibo y ausencia local no autorizan otra
  identidad automática. El reintento conserva la intención original.
- Desvinculación: claves por actor/objetivo y contexto de período; índice de hasta
  64 referencias de expulsión por actor. Al llenarse se podan solo referencias
  confirmadas, no pendientes inciertas ni sus recibos. La referencia huérfana o
  corrupta bloquea; no se asume que nunca se envió.
- Roles: una solicitud por par actor/objetivo, payload original y versiones
  exactas con nanosegundos. El reintento no consulta contexto nuevo para cambiar
  silenciosamente la intención. CONFIRMADA es historia, no permiso actual.
- Serialización solo dentro de un isolate. No se demuestra exclusión entre dos
  procesos, pestañas o dispositivos. La cola de roles y el número de objetivos
  persistidos no tienen un límite global; tampoco hay TTL de recibos servidor.
- No purgar recibos ni añadir TTL: borrarlos puede permitir reutilizar solicitudes.
  Un sistema de compactación necesitaría una marca permanente y diseño separado.
- Antes de publicar: probar secure storage nativo, reinicio real, cuenta distinta,
  desinstalación/restauración, acceso bloqueado al llavero, 64 pendientes y varias
  pestañas. Los dobles de almacenamiento no validan esas propiedades del dispositivo.

## 6. Migración y recuperación propuestas — SIN EJECUCIÓN REAL

### Alternativas

1. **Recomendada:** herramienta administrativa separada, un operador y un proceso
   por checkpoint, lotes pequeños y ventana coordinada. Reutiliza el motor probado
   sin reutilizar ni quitar las guardas de los ejecutores demo.
2. Migración perezosa dentro de callables: reduce barrido, pero cambia autorización,
   latencia y el tratamiento de legados. Requiere diseño/contratos y aprobación.
3. Migración distribuida con leases: útil a mayor escala, añade coordinación y
   recuperación. No necesaria sin evidencia de volumen; no implementada aquí.

### Preparación

1. Obtener autorización de lectura, responsables, alcance, entorno y ventana.
2. Inventariar perfiles/iglesias/IDs, versiones de clientes y designaciones
   financieras. Clasificar candidatos, omitidos, revisión y conflictos.
3. Revisar simulación completa; documentar cobertura y cursores. No resolver
   anomalías mediante cambios automáticos de rol, iglesia o ID existente.
4. Definir respaldo de datos y metadatos y probar restauración en proyecto aislado.
   Registrar timestamp, integridad, exclusiones y cambios concurrentes admitidos.
5. Validar la herramienta administrativa separada, permisos mínimos temporales y
   ausencia de credenciales en código/logs. Admin SDK omite Security Rules.
6. Ensayar con datos sintéticos la interrupción después del commit y antes del
   checkpoint, el conflicto, la reanudación y la conservación de comprobantes.

### Durante una futura ventana autorizada

1. Conservar la selección exacta y su versión antes del motor. Un coordinador
   por checkpoint; no dos procesos compartiendo el mismo documento de control.
2. Revalidar perfil, iglesia, administración, versión exacta y ausencia del campo
   dentro de la transacción. Asignar ID y comprobante atómicamente.
3. Avanzar checkpoint solo tras resultado verificable. Ante error/conflicto,
   detener: no refrescar versión o selección silenciosamente.
4. Tras confirmación perdida, repetir la misma selección y verificar comprobante.
   Una omisión posterior no prueba que el primer intento no confirmó.
5. Conciliar documentos persistentes, no sumar callbacks del SDK. Repasar desde
   el principio y repetir simulación; las inserciones detrás del cursor pueden escapar.

### Recuperación

- Detener escritores/operador según el alcance aprobado y conservar checkpoint,
  selección, versiones y evidencia sin PII en el informe.
- Si el commit está confirmado, reanudar sin renovar ID/comprobante. Si hay
  conflicto o estado ambiguo, conciliar y revisar antes de avanzar.
- No borrar IDs/recibos/comprobantes como compensación; no restaurar perfiles
  individuales de forma que reaparezcan roles o designaciones revocadas.
- La restauración completa puede revertir nuevas membresías y revocaciones:
  requiere evaluación del delta posterior al respaldo y autorización específica.
- El ensayo no demuestra durabilidad, cuotas, IAM o recuperación gestionada real.

## 7. Transición y orden de despliegue propuestos

Esto es un plan para revisión humana, no una instrucción de ejecutar despliegues.

1. **Cerrar QA:** Flutter, callables reales, ensayo ampliado, almacenamiento nativo,
   clientes antiguos y notificaciones. Conservar resultados por suite y versión.
2. **Inventario y comunicación:** identificar versiones en uso, anunciar ventana,
   explicar qué acciones requieren actualizar y preparar soporte para legados.
3. **Backend aditivo compatible:** revisar artefacto que mantiene ingreso legado
   y añade recibos/callables seguros. Aprobar publicación por separado.
4. **Preparar datos:** respaldo restaurado en aislamiento, simulación y herramienta
   administrativa autorizadas; migración revisada y anomalías resueltas.
5. **Cliente compatible:** distribución progresiva con recuperación persistente y
   soporte. Medir adopción usando fuentes autorizadas; no inventar porcentajes.
6. **Reglas protectoras:** activación coordinada tras aprobar el corte de clientes
   antiguos. Hasta cerrar las rutas antiguas, Finanzas no se declara listo para habilitar.
7. **Validación de ventana:** comprobar ingreso, salida, expulsión, revocación,
   cambio de rol, lectura financiera autorizada/denegada y Capacitaciones.
8. **Observación:** errores de callables por código, conflictos, recibos inciertos,
   denegaciones y fallos de persistencia, sin registrar datos personales o tokens.

Si los clientes antiguos no pueden actualizarse, **posponer el corte y Finanzas**.
No se pueden prometer simultáneamente escrituras SDK antiguas operativas y cierre
de esas mismas rutas. La política de versión mínima y su fecha requieren aprobación.

## 8. Reversión y criterios de parada

- Parar ante pérdida de acceso inesperada, aumento no explicado de denegaciones,
  invariantes rotas, doble pertenencia, revocación incompleta o conflicto sin conciliar.
- Preferir detener nuevas operaciones afectadas y una corrección hacia adelante.
  Conservar lecturas/autenticación y ofrecer soporte según el incidente.
- No devolver reglas a una versión que permita escrituras de membresía inseguras.
- Un rollback de backend debe conservar soporte para las claves y recibos ya
  emitidos. Un cliente anterior que escribe por SDK no es un rollback compatible.
- Restaurar binarios/reglas y restaurar datos son decisiones distintas. Ninguna
  reversión de código demuestra que deba restaurarse una copia de datos anterior.
- Respaldar el estado incidente antes de cualquier recuperación real autorizada;
  conciliar operaciones posteriores al respaldo y registrar quién aprueba y ejecuta.

## 9. Mitigaciones temporales FCM

Ya implementada y validada: eliminación condicional y transaccional del token
invalidado, preservando una renovación concurrente.

Antes de publicar, aprobar y verificar avisos genéricos sin nombres, contenido
congregacional privado ni información financiera; mantener solo identificadores
mínimos de navegación compatibles y revalidar acceso al abrir desde servidor.
No confiar en que el push acredita membresía. No enviar datos sensibles como
alternativa a leerlos bajo reglas. Los mensajes en tránsito no se retiran por
salir, expulsar o cerrar sesión.

No se añadieron períodos a los dispositivos ni se cambiaron reglas de tokens:
eso requiere una transición versionada. Si no puede aceptarse el riesgo residual,
recomendar suspender los avisos afectados en una publicación autorizada, en lugar
de introducir permisos temporales o reconstruir todas las notificaciones aquí.

## 10. Aprobaciones y trabajo pendiente concreto

### Requieren aprobación humana

- Despliegues de backend, Flutter, reglas y cualquier acceso/migración de producción.
- Política de soporte a clientes antiguos, versión mínima, fecha y comunicación.
- Herramienta administrativa real, IAM temporal, respaldo/restauración y ventana.
- Tratamiento de IDs de procedencia no acreditada y anomalías administrativas.
- Cualquier cambio incompatible en APIs o datos, incluido período de una intención financiera.
- Mitigaciones de contenido/suspensión de push y aceptación del riesgo FCM residual.
- Activación de Finanzas y aceptación documentada de riesgos pendientes.

### Antes de producción

- [ ] Ejecutar las ocho nuevas regresiones Flutter y todas las suites relevantes;
  correr análisis estático y compilar para las plataformas que se distribuirán.
- [ ] Ejecutar el ensayo completo ampliado en entorno que admita Functions Emulator.
- [ ] Revisar la nueva carrera de migración con reingreso a otra iglesia.
- [ ] Recopilar evidencia suficiente de los 17 fallos históricos si reaparecen;
  documentar explícitamente su no reproducción si no reaparecen.
- [ ] Probar persistencia nativa y operación con más de una pestaña/dispositivo.
- [ ] Inventariar versiones instaladas y probar los binarios antiguos concretos.
- [ ] Diseñar, revisar y ensayar la herramienta real de migración y su recuperación.
- [ ] Resolver procedencia de IDs, anomalías y designaciones financieras heredadas.
- [ ] Revisar solicitudes administrativas financieras tardías sin cambiar contrato unilateralmente.
- [ ] Validar mitigaciones FCM en dispositivos reales, sin datos sensibles.
- [ ] Aprobar orden de publicación, responsables, ventana y criterios de reversión.

**Este cierre prepara código y evidencia local; no acredita preparación completa
para producción ni elimina los bloqueos que dependen de otro entorno o aprobación.**
