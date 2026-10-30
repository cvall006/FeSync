# Ensayo aislado de generaciones V2

FIN-7C.4E.1C.1. Ejecutar desde la raíz:

```powershell
node test/contabilidad_generaciones_v2_aislado/iniciar.js
```

No pasar argumentos ni credenciales. El ejecutor exige `demo-fesync`, comprueba
puertos libres y abre Firestore Emulator dedicado. Usa una copia temporal exacta
de las reglas existentes y su configuración de pruebas; no altera esos archivos.
No ejecuta Functions, Auth, Messaging ni llamadas FCM. El SDK cliente de reglas
usa identidades ficticias del entorno de pruebas.

## Cobertura observada

| Grupo | Verificación |
| --- | --- |
| Guardas | Proyecto, host, credenciales, variables, cliente remoto, parámetros y custodia |
| Fuente | Libro vacío y mixto generado con adaptador V1 real; recibos y reservas reales |
| Economía | Aperturas, ingresos, gastos, transferencias, ajustes y reversas de tres clases entre períodos |
| Destino | Campos V2 exactos, secuencia, revisión global y por cuenta, referencias y proyecciones |
| Preservación | Documentos V1 y fixtures D2 conservan contenido y updateTime |
| Divergencias | Saldos, resúmenes, marcadores, movimiento ausente y solicitudes inciertas |
| Recuperación | Interrupción antes de commit y respuesta perdida después de inicio, página o lote |
| Concurrencia | Dos operadores rechazados por propiedad; dos avances con mismo fence aplican una sola página |
| SDK real | Callback reintentado mediante ABORTED inyectado; lecturas preceden escrituras; fallo sin commit parcial |
| Manipulación | Checkpoint, iglesia, época, etiqueta preparada, contexto, documentos faltantes y subcolecciones extra |
| Bloqueo | Protocolo bloqueado, puntero ausente, custodia vigente; V1 y V2 no contabilizan nuevas operaciones |
| Privacidad | Respuesta mínima, escrituras y lecturas cliente de las nuevas rutas privadas denegadas |

La concurrencia descrita corresponde a intercalaciones concretas observadas,
no a una demostración exhaustiva de todos los órdenes posibles. ABORTED y pérdidas
de respuesta son fallos inyectados alrededor de transacciones SDK reales.
Los fixtures D2 son sintéticos, respaldados por conciliación del libro real; no
se ejecuta ni se acredita el preparador administrativo histórico.

El adaptador V2 real rechaza el bloqueo antes de consumir la generación. Las
lecturas SDK de los documentos generados y una propuesta pura comprueban la
forma y los cálculos sin sortear esa guarda. Queda pendiente una prueba completa
del escritor cuando una fase posterior autorice acreditación y activación.

La custodia es operativa en el emulador desechable. No representa IAM ni identidad
física de operador. Tampoco garantiza recuperación después de destruir los datos
del emulador. Consultar los límites y el contrato en
[README del preparador](../../functions/contabilidad_generaciones_v2_demo/README.md).

## Resultados finales

La corrida final de esta suite aprobó **58/58**: 25 pruebas de guardas y
33 escenarios con SDK/Firestore Emulator; cero fallidas, omitidas o canceladas.
Una primera corrida de desarrollo había aprobado 51/51; después se añadieron
validaciones de reconsulta y siete escenarios, todos incluidos en la corrida final.
`node --check` aprobó los diez archivos JavaScript nuevos.

Las 54 pruebas unitarias existentes del adaptador V2 aprobaron sin modificaciones.
`npm.cmd test` ejecutó 1.732 pruebas: **1.711 aprobadas y 21 fallidas**. Los 21
fallos reportan `DEMO_FUENTES_NO_ACREDITADAS` porque los cinco nuevos módulos no
pertenecen al inventario admin-3. No se actualizó el inventario ni se omitieron
esas pruebas; la suite administrativa general no está aprobada con este runtime.

La integración financiera V1 aprobó **211/211** pruebas; dentro de esa ejecución
su regresión anidada de reglas financieras aprobó **46/46**. No se modificaron
las reglas ni las expectativas de esas suites. Los emuladores se ejecutaron
secuencialmente, sin compartir puertos entre suites.

La integración V2 existente ejecutó **39** pruebas: **38 aprobadas y 1 fallida**.
El único fallo es `admin-3 reconoce los bytes V2 acreditados; no habilita
generaciones`, con `DEMO_FUENTES_NO_ACREDITADAS`. Los escenarios restantes,
incluidos SDK real, idempotencia y concurrencia, aprobaron. Este resultado no
equivale a una aprobación completa de la suite V2 ni a acreditación administrativa.

Las comprobaciones SHA-256 de los **367 archivos preexistentes** no detectaron
cambios. Rama y HEAD se conservaron. Git únicamente añade los dos directorios de
este paso a las entradas locales que ya existían. No hubo despliegue, instalación,
acceso a producción, modificación de inventarios ni acreditación admin-4.
El aviso SIGINT del emulador al cerrar corresponde al apagado de cada ejecución;
la salida de código 1 de npm y de la integración V2 se conserva como fallo.
