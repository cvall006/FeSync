# Ensayo operativo 6D.1: exclusivamente emuladores

Esta infraestructura NO es una herramienta de migración real y no está lista
para producción. No crea endpoints, credenciales ni ejecutores de proyectos reales.
No se modifican los módulos de migración ni las funciones públicas o las reglas.

## Ejecución protegida

Desde la raíz, con Firebase CLI y Java ya instalados:

```powershell
node test/pertenencia_migracion/iniciar_ensayo.js
```

El arranque no admite argumentos, proyectos alternativos o credenciales declaradas.
Solo hereda variables indispensables del sistema, usa configuración CLI temporal
vacía y fija demo-fesync y los hosts 127.0.0.1:9098/8088/5008/9198 para Auth,
Firestore, Functions y Storage. Reutiliza firebase.desvinculacion-test.json.
El runtime de pruebas excluye triggers y bloquea Firebase Messaging: no hay FCM.
No descarga dependencias. Las guardas se ejecutan antes de importar SDKs y antes
de cada operación del coordinador, que también verifica el db local explícito.

La base demo se vacía entre escenarios. No ejecutar junto a otras suites que usen
esos puertos. Las identidades Auth y los perfiles son ficticios y desechables.
El Admin SDK usa Auth vacío explícito, sin buscar ADC ni credenciales del operador.
Los callables se invocan por HTTP con ID tokens de Auth Emulator; no se sustituyen
sus handlers. Las comprobaciones cliente usan la API REST real de Firestore con
esos tokens y las reglas locales cargadas por Emulator Suite.

El ejecutor captura diagnósticos TAP en memoria y emite únicamente contadores,
categorías, resultado y ordinales de escenarios fallidos. No imprime assertions
que puedan contener documentos, UIDs, tokens o identificadores de pertenencia.
Ante un fallo detiene esa corrida y no ejecuta una repetición automática.
El escenario se localiza por suite y ordinal en el archivo correspondiente;
el tipo de fallo y código estándar ayudan a distinguir hooks e infraestructura.

## Procedimiento ensayado

1. Crear once perfiles ficticios: tres candidatos (titular, líder y servidor),
   tres omitidos y cinco en revisión. IDs existentes válidos/incorrectos, null,
   iglesia inexistente, rol desconocido y administración incoherente se conservan.
2. Simular con páginas de dos perfiles. Comparar contenido y updateTime de toda
   la base antes/después: cero escrituras, cero comprobantes y solo métricas.
3. Ejecutar lotes de hasta dos perfiles. El motor original vuelve a validar cada
   selección dentro de su transacción y asigna ID/comprobante atómicamente.
4. Guardar selección exacta antes del motor en ensayos_pertenencia/{corrida},
   exclusivamente en demo. Avanzar cursor exclusivo después del resultado.
5. Interrumpir después de un commit y antes de avanzar el punto de control.
   Reanudar leyendo ese documento, sin estado de cursor en memoria. Repetir
   la misma selección no renueva ID ni comprobante. Un error/conflicto detiene
   el avance y conserva la selección: no se refrescan versiones silenciosamente.
6. Verificar ID, origen/versionado del comprobante, updateTime común de commit,
   versión anterior exacta y conservación de todos los campos originales.
7. Ejecutar otro recorrido completo con checkpoint independiente; cero nuevos
   migrados. Simulación posterior: cero candidatos, mismas anomalías sin reparar.

Los checkpoints contienen metadatos privados de prueba, nunca se imprimen ni se
exportan en métricas. El proceso mantiene a lo sumo una selección y dos procesados
por lote; máximo treinta lotes por invocación. El límite detiene, no oculta trabajo.
Las métricas del proceso NO son un registro de commits: una confirmación perdida
puede observarse luego como omitida. El inventario persistente de comprobantes es
la evidencia de asignaciones, no sumar callbacks o reintentos de transacciones.

## Matriz de escenarios

| Escenario | Evidencia |
| --- | --- |
| Candidato ordinario y titular legado | ID válido, comprobante privado y auxiliares intactos |
| Sin iglesia, ID existente válido/inválido, null, rol/iglesia/admin incoherentes | Ninguna reparación ni escritura de perfil |
| Simulación y verificación posterior | Cero escrituras iniciales; 3 candidatos pasan a 0 y quedan 3 comprobantes |
| Repetición | Versiones de perfiles/comprobantes intactas |
| Interrupción post-commit | Reanudación conserva la selección; no duplica ID ni comprobante |
| Dos coordinadores | Checkpoints distintos, una asignación por perfil y tres comprobantes totales |
| Perfil sin ID | Salida/roles bloqueados hasta migración |
| Rol posterior | Callable real funciona; designación financiera se conserva |
| Salida/expulsión posteriores | Callable real, revocación financiera/eligibilidad y retiro FCM legado en el mismo commit |
| Selección anterior + salida/reingreso/rol/transferencia | Motor en espera no sobrescribe el resultado de callables reales |
| Transferencia de legado antes de leer | Versión original entra en conflicto sin asignación |
| Conflicto durante reanudación | Checkpoint y selección no avanzan ni cambian |
| Comprobantes privados y 6B | Lectura/listado/escritura/borrado cliente denegados; membresía/rol no editables directamente |
| Aislamiento | Proyectos/hosts ajenos, credenciales declaradas y variables ausentes rechazados |

Las regresiones incluyen membresía, roles, simulador, motor, reglas 6B, Finanzas
y Capacitaciones/Storage. npm.cmd test en functions conserva su alcance unitario
con dobles; no se presenta como sustituto de estas pruebas integradas.

## Concurrencia y límites no demostrados

Dos migradores usan checkpoints distintos y compiten con transacciones reales.
No hay protocolo distribuido para dos procesos que escriban el MISMO checkpoint:
el ensayo requiere un coordinador por checkpoint. La exclusión local es de un proceso.
Las barreras de prueba esperan ANTES de la primera lectura transaccional y permiten
completar cambios reales por callable antes de liberar el motor; no son dobles de
Firestore. Prueban ese orden específico, no todos los interleavings ni una caída
real del sistema operativo. Los bloqueos/reintentos del SDK se prueban además en
las suites existentes; no se afirma haber inducido cada orden de commit posible.
El reingreso coordinado con el motor usa la misma iglesia. No se fuerza aquí una
carrera del motor con un reingreso a otra iglesia ni una modificación bajo su lock
de lectura. Las regresiones de roles cubren cambios de iglesia, con otro alcance.

Un candidato legado no puede salir/cambiar rol por las nuevas APIs sin ID: se prueba
ese bloqueo. Para la carrera con salida/reingreso se deja una selección antigua
en espera, un segundo motor migra, y los callables ejecutan salida/reingreso antes
de liberar el primero. No se permite un fallback de escritura cliente.

La paginación no es una fotografía global: inserciones detrás del cursor o cambios
posteriores pueden escapar a una pasada. Se requiere repaso completo y simulación
final, además de revisión explícita de conflictos. Un ID preexistente con buen
formato no acredita origen servidor. Tras un reingreso, el comprobante de migración
es histórico y no debe confundirse con el ID del nuevo período.

## Antes de una eventual migración real

Requiere otro diseño y autorización explícita, con inventario y simulación revisados,
ventana operativa, responsables y criterio de parada. No copiar este ejecutor
eliminando sus guardas ni cambiarle el proyecto. Probar y revisar una herramienta
administrativa separada, con IAM mínimo, acceso temporal y credenciales externas
al repositorio; nunca claves en código, argumentos, capturas o logs.

Definir por separado capacidades de lectura (perfiles, iglesias y comprobantes),
escritura del motor y respaldo/restauración. Admin SDK omite Security Rules: el
código y los controles operativos deben limitar qué campos/rutas se tocan; no
afirmar que las reglas protegen una herramienta administrativa. Evitar permisos
de propietario general, separar operador/aprobador y auditar ejecución sin PII.

Respaldar datos y metadatos con un mecanismo autorizado, registrar alcance/punto
temporal y comprobar restauración en un entorno aislado antes de empezar. El
emulador no valida IAM, recuperación real, cuotas, durabilidad ni exportaciones
gestionadas. Una restauración completa puede revertir nuevas pertenencias o
revocaciones: no restaurar perfiles individualmente ni borrar IDs/comprobantes
como compensación automática. Detener, reconciliar y autorizar recuperación.

Coordinar despliegue de backend compatible y reglas protectoras con la transición
de clientes: las versiones antiguas que escriben membresía/roles directamente
fallarán bajo 6B. Los legados sin ID requieren migración antes de usar los nuevos
callables dependientes del período. No abrir temporalmente permisos para evitarlos.
También siguen pendientes procedencia de IDs existentes, solicitudes tardías de
clientes antiguos, almacenamiento nativo del cliente y arquitectura FCM versionada.
Nada de este ensayo autoriza desplegar, migrar datos reales o publicar Finanzas.

La intermitencia de los 17 fallos iniciales de membresía de 6C.2 permanece sin causa
acreditada. Las corridas limpias de este paso y sus resultados se registran abajo;
que no reaparezca no demuestra que esté resuelta.

## Resultados

Validación local del 17 de octubre de 2026:

| Validación | Aprobadas | Fallidas |
| --- | ---: | ---: |
| npm.cmd test (functions, principalmente dobles) | 481 | 0 |
| Corrida limpia 2: emuladores nuevos | 168 | 0 |
| Corrida limpia 3: emuladores nuevos, mismo código y orden | 168 | 0 |

Cada corrida final contiene 161 escenarios con emuladores y 7 guardas locales:

| Suite | Aprobadas por corrida |
| --- | ---: |
| Guardas del ensayo | 7 |
| Membresía (primera suite con callables, sin calentamiento previo del ensayo) | 17 |
| Ensayo operativo nuevo | 15 |
| Roles | 27 |
| Simulador existente | 3 |
| Motor existente | 12 |
| Reglas 6B | 33 |
| Reglas Finanzas | 46 |
| Capacitaciones y Storage | 8 |

Las dos corridas finalizaron con código 0, sin pruebas omitidas, y apagaron los
emuladores antes del siguiente arranque. Son repeticiones de los mismos escenarios,
no 336 escenarios distintos. Cada conjunto principal ficticio produjo la misma
métrica: 11 perfiles, 3 candidatos, 3 omitidos, 5 en revisión; después, 0 candidatos
y 3 comprobantes. Los IDs/resultados individuales no forman parte del informe.

Incidencia inicial conservada: la corrida 1 falló en la infraestructura NUEVA:
6 guardas aprobadas y, en el ensayo, 5 aprobadas/10 fallidas. No llegó a ejecutar
las regresiones de membresía. La guarda del db consultaba `_settings.host`, pero
el SDK instalado normaliza ese destino como `_settings.servicePath` y `port`.
Una inspección sin red confirmó esa representación. Se corrigió exclusivamente
la guarda nueva para exigir 127.0.0.1:8088, ssl:false y demo-fesync, y se añadió
otra prueba de rechazo de endpoint externo. No se relajó el destino ni se cambió
el motor. No se cuenta el intento fallido como aprobado.

Los 17 fallos de membresía de 6C.2 NO reaparecieron en las dos corridas limpias.
Su causa original sigue sin determinarse; estos resultados no la resuelven ni
justifican atribuirla a timeout, Auth, caché o un defecto productivo concreto.

`node --check` aprobó los cinco JS nuevos. Los hashes de los tres módulos de
migración, index.js, membresia.js, roles.js, finanzas.js y ambas reglas coinciden
con los del inicio. El diff de archivos previamente existentes tampoco cambió.
Solo se añaden infraestructura de pruebas y este documento. No se instalaron
dependencias, no se desplegó y no se accedió a un proyecto real.
