# FIN-MVP: validación local del 23 de octubre de 2026

Se continuó desde los cambios locales existentes. La integración FIN-MVP funciona
con Auth, Functions y Firestore Emulator en `demo-fesync`. No se reimplementó el
módulo ni se repitió el respaldo completo. No hubo despliegues ni commits.

## Correcciones realizadas

Solo se modificaron dos archivos de pruebas:

- `test/finanzas_mvp/iniciar.js`: conserva `PROGRAMFILES(X86)` en el entorno
  filtrado. Flutter la necesita para detectar las herramientas de Windows;
  su ausencia impedía iniciar la prueba de interfaz.
- `test/finanzas_mvp/emulador_flutter_test.dart`: utiliza un binding que permite
  HTTP real únicamente al activar `FIN_MVP_EMULATOR_TEST`. El binding habitual
  interceptaba las peticiones y devolvía HTTP 400 con cuerpo vacío. Se conserva
  la validación de host `127.0.0.1` y puertos locales 9098/5008.

La corrección de revocación ya estaba presente y se confirmó contra el backend:
`accion: 'revocar'` con `encargadoUid: null`. Tras revocar, tanto la consulta del
encargado como su intento de ingreso devuelven `PERMISSION_DENIED`. Cambiar la
pertenencia del administrador hace rechazar el contexto anterior con
`PERTENENCIA_ANTERIOR`.

## Resultados

| Validación | Resultado |
| --- | --- |
| `npm.cmd test` desde `functions/` | 1.770 aprobadas; cero fallidas u omitidas; salida 0 |
| `node test/finanzas_mvp/iniciar.js --pruebas --flutter` | 12 pruebas de servidor y 1 de interfaz aprobadas; salida 0 |
| `flutter.bat test --no-pub --reporter expanded` | 437 aprobadas; cero fallidas; 1 omitida; salida 0 |
| `flutter.bat analyze --no-pub` sobre el estado final | Cero errores y advertencias; 5 avisos informativos de estilo; salida 1 |
| `node --check test/finanzas_mvp/iniciar.js` | Correcto |

La prueba omitida en la suite Flutter general requiere
`FIN_MVP_EMULATOR_TEST=true`; se ejecutó y aprobó por separado dentro de la
integración anterior. `--no-pub` utiliza las dependencias existentes.

Funcionan en los escenarios probados:

- Autorización de titular y encargado; rechazo de usuarios sin token, miembros,
  líderes sin designación y contextos de otra iglesia.
- Inicialización exclusiva de la fixture autorizada, sin reiniciar un libro
  existente; bloqueo de operaciones V1 y comprobación de ausencia de V2.
- Creación de caja, banco y categorías de diezmos, ofrendas, donaciones, otros
  ingresos y gastos.
- Saldo inicial, ingresos, gastos, transferencias, reversión y ajuste, con
  restricciones del encargado y conservación del historial.
- Solicitud concurrente duplicada con un único resultado; recuperación de una
  respuesta perdida conservando la solicitud y sus precondiciones originales.
- Rechazo de campos de confianza suministrados por el cliente, saldo insuficiente
  y escrituras directas a saldos e intenciones del servidor.
- Interfaz real y servicio FIN-MVP contra HTTP local de Auth y callables V1:
  crea Caja UI, registra CLP 5.000 de diezmo y CLP 1.200 de gasto, verifica
  el incremento neto de CLP 3.800, el historial y la ausencia de solicitud pendiente.

## Incidencias de ejecución y límites

Los primeros intentos de Flutter no iniciaron por falta de acceso a los archivos
de bloqueo del SDK externo al workspace. También se probaron los dos fallos del
ejecutor descritos arriba antes de corregirlos. La ejecución integrada final y
la suite Flutter completa usaron acceso ampliado aprobado automáticamente.
Los emuladores finalizaron normalmente; su SIGINT al cierre no es un fallo de prueba.

La prueba de interfaz inyecta el transporte HTTP local y almacenamiento en
memoria. No acredita por sí sola la persistencia del almacén seguro del dispositivo,
la compilación web ni un recorrido manual completo en navegador o dispositivo.
Tampoco se ejecutaron las suites independientes de integración V2; V2 se conservó.

## Pendiente

- Cinco avisos `curly_braces_in_flow_control_structures` en
  `lib/modules/finanzas/finanzas_mvp_screen.dart`, líneas 92, 331, 337, 348 y 362.
  Son informativos, pero hacen que `flutter analyze` termine con salida 1.
  Se dejaron intactos porque se pidió corregir únicamente errores reales.
- `git diff --check` detecta un espacio final preexistente en
  `functions/index.js:2021`; se conserva para no alterar Work.
- Validación manual en navegador/dispositivo y del almacenamiento seguro real,
  si se requiere ampliar la evidencia más allá de estas pruebas locales.

## Conservación

Se registraron huellas SHA-256 de los 442 archivos existentes no ignorados al
inicio y se compararon al finalizar. Los únicos cambios de esos archivos son los
dos ajustes de pruebas descritos arriba; se añadió este informe.
V2, Work, `firestore.rules`, las dependencias y el código del módulo conservan
el contenido recibido. Las modificaciones locales anteriores siguen presentes.

Logs de la ejecución integrada aprobada:
`C:/Users/igles/AppData/Local/Temp/fesync-fin-mvp-PDKgoN/`.
