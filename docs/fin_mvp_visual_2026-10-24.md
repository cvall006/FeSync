# FeSync FIN-MVP: prueba visual y ajustes finales

Validación iniciada el 23 y cerrada el 24 de octubre de 2026. Se continuó desde
los cambios locales existentes, sin reconstruir el módulo ni repetir el respaldo.
El administrador completó el flujo financiero V1 dentro de FeSync con Firebase
Emulator `demo-fesync`.

## Navegador y aislamiento

Se utilizó Chrome real en modo headless, controlado por CDP: inicio de sesión,
clics, escritura en campos, navegación y capturas de la aplicación Flutter web
compilada. Se inspeccionaron capturas reales. No se presenta una prueba de widgets
como sustituto de la interacción con el navegador.

La demo final usa `lib/main_finanzas_demo.dart`, Auth `127.0.0.1:9098`, Firestore
`127.0.0.1:8088` y Functions `127.0.0.1:5008`. La página aislada
`web/finanzas_demo.html` y su servidor local aplican CSP, impiden service workers
y rechazan una compilación que no contenga las credenciales ficticias de demo.
No se modificaron la página ni el worker de Work.

Durante la exploración inicial se detectó que la página habitual registraba el
worker de Work configurado para producción. También hubo un intento de preflight
`OPTIONS` a Identity Toolkit público, bloqueado por CDP antes de continuar la
petición. Se abandonó esa entrada y se pasó al servidor aislado en `localhost`.
Se conservaron esos intentos y las excepciones anteriores en la evidencia; no
se ocultan como si toda la sesión hubiera sido limpia.

La recarga aislada confirmó proyecto `demo-fesync`, Auth Emulator, cero workers
registrados y respuesta 404 para el worker. La fase final completa registró
1.427 solicitudes, cero solicitudes a servicios públicos Firebase y cero nuevas
excepciones. Los recursos públicos de SDK y fuentes se distinguen de los
servicios de datos. No se realizaron operaciones con datos de Firebase real.

Evidencia: [aislamiento](fin_mvp_visual_2026-10-23/aislamiento-red.json),
[fases de red](fin_mvp_visual_2026-10-23/fases-red.json) y
[traza del navegador](fin_mvp_visual_2026-10-23/browser-evidence.json).

## Recorrido financiero ejecutado

El titular ingresó desde la navegación de FeSync, inicializó el libro autorizado
en CLP, escala 0, zona `America/Santiago` y período `2026-10`, y creó dos cuentas
y tres categorías. Se registraron estas cinco operaciones mediante formularios:

| Operación | CLP |
| --- | ---: |
| Saldo inicial en Caja principal | 100.000 |
| Diezmo | 25.000 |
| Ofrenda | 5.000 |
| Gasto | 12.000 |
| Transferencia de Caja a Banco principal | 30.000 |

El resultado fue Caja **88.000**, Banco **30.000**, total **118.000**; ingresos
mensuales **30.000** y gastos **12.000**. Se abrieron cuentas, categorías,
historial y detalle del diezmo. La consulta al backend confirmó cinco movimientos,
su secuencia, asientos y clasificación de diezmo/ofrenda; sin duplicados ni
solicitud pendiente. La transferencia no incrementó ingresos ni gastos.

Evidencia: [configuración](fin_mvp_visual_2026-10-23/04-configuracion-inicial.png),
[cuentas](fin_mvp_visual_2026-10-23/17-saldos-cuentas.png),
[resumen mensual](fin_mvp_visual_2026-10-23/16-resumen-mensual.png),
[historial](fin_mvp_visual_2026-10-23/18-historial.png),
[detalle](fin_mvp_visual_2026-10-23/19-detalle-diezmo.png) y
[resultado del libro](fin_mvp_visual_2026-10-23/libro-verificado.json).

## Roles, revocación y errores

- Titular: Finanzas visible y operaciones administrativas habilitadas.
- Encargado financiero: Finanzas visible; ingreso, gasto y transferencia
  habilitados; ajuste deshabilitado.
- Miembro sin permiso: Finanzas ausente en la navegación.
- Revocación con un formulario abierto: al confirmar se cerró sin enviar una
  operación. Un intento nuevo directo del mismo usuario recibió
  `functions/permission-denied`; al volver al panel, Finanzas estaba oculto.
  No hubo nuevas excepciones ni asientos. La designación y revocación se hicieron
  mediante el callable administrativo existente, dentro del emulador.
- Volver al panel como titular volvió a comprobar el acceso sin excepciones.

Se probaron campos vacíos, código inválido, monto cero, monto decimal `1.5` y
fecha inválida/fuera del período. No produjeron movimientos. Se inyectó además un
fallo real de red en la consulta local: apareció un mensaje en español y,
restablecida la conexión, Actualizar recuperó el total de 118.000 sin escrituras.

Evidencia: [miembro](fin_mvp_visual_2026-10-23/24-miembro-sin-finanzas.png),
[encargado](fin_mvp_visual_2026-10-23/26-encargado-permisos.png),
[revocación visible](fin_mvp_visual_2026-10-23/29-revocacion-operacion-bloqueada.png),
[revocación verificada](fin_mvp_visual_2026-10-23/revocacion-verificada.json),
[retorno verificado](fin_mvp_visual_2026-10-23/retorno-verificado.json),
[error de red](fin_mvp_visual_2026-10-23/41-error-conexion-local.png) y
[recuperación](fin_mvp_visual_2026-10-23/conectividad-verificada.json).

## Pantallas y correcciones acotadas

Se comprobaron viewports reales de 320, 390, 768 y 1.440 píxeles. Se corrigieron
etiquetas recortadas en la navegación estrecha y el mensaje de monto truncado.
Los montos muestran prefijo CLP y pesos enteros sin decimales; la presentación
actual es `CLP 118000`, sin agrupación de miles. Los campos solicitan enteros.

En `lib/modules/finanzas/finanzas_mvp_screen.dart` también se corrigieron:

- Validación de un formulario después de perder acceso: se comprueba el contexto
  antes de validar o enviar, evitando acceder a datos ya invalidados.
- Consultas simultáneas al abrir la pantalla: se serializan las recargas y se
  descartan respuestas anteriores cuando cambia el acceso.
- Invalidación del acceso en la navegación y consulta al regresar al panel.
  El callback de `setState` no devuelve un Future; el recorrido final verificó
  esta corrección después de detectar el fallo durante las pruebas.
- Mensajes de permisos y comunicación en español, ayuda de formato de fecha y
  los cinco avisos de estilo de llaves.

Se ampliaron las pruebas de pantalla para revocación con formulario abierto,
texto de error sin recortes, navegación estrecha y error de comunicación.
`test/finanzas_mvp/sesion.js` ahora indica la entrada web aislada. Los únicos
archivos nuevos de código son `web/finanzas_demo.html` y
`test/finanzas_mvp/servir_web.js`.

Capturas finales: [escritorio](fin_mvp_visual_2026-10-23/32-resumen-1440-final.png),
[768 px](fin_mvp_visual_2026-10-23/33-resumen-768-final.png),
[390 px](fin_mvp_visual_2026-10-23/34-resumen-390-final.png),
[320 px](fin_mvp_visual_2026-10-23/35-resumen-320-final.png) y
[validación legible a 320 px](fin_mvp_visual_2026-10-23/39-monto-decimal-320-final.png).

## Comprobaciones automatizadas

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test` en `functions/` | 1.770 aprobadas; cero fallos |
| `flutter test --no-pub --reporter expanded` | 439 aprobadas; 1 omitida intencionalmente |
| `flutter analyze --no-pub` | No issues found; salida 0 |
| Compilación web debug de la entrada demo | Correcta; salida 0 |
| `node --check` del servidor demo | Correcto |
| Auditoría CDP del recorrido final | Cero nuevas excepciones y cero peticiones a servicios públicos Firebase |

Logs: [Node](fin_mvp_visual_2026-10-23/node-test.log),
[Flutter](fin_mvp_visual_2026-10-23/flutter-test.log),
[análisis](fin_mvp_visual_2026-10-23/flutter-analyze.log) y
[compilación](fin_mvp_visual_2026-10-23/build-web.log).

Las 13 pruebas integradas anteriores (12 servidor + 1 interfaz) constan en el
[informe anterior](fin_mvp_validacion_2026-10-23.md); no se contabilizan como una
nueva ejecución en esta fase visual. La prueba omitida de la suite general exige
activar expresamente el entorno de emuladores y ya había pasado por separado.

## Conservación y pendientes

La comparación SHA-256 con los 443 archivos iniciales confirmó 440 intactos,
los tres cambios indicados y ningún archivo eliminado. Incluye cambios locales
previos y archivos aún no versionados. V2, inventarios, Work y reglas permanecen
intactos respecto del inicio de esta fase. También se conservaron manifiestos y
locks de dependencias. [Comprobación de integridad](fin_mvp_visual_2026-10-23/integridad-archivos.json).

El backend siguió en `operativo_v1`, versión 1 y época 1, sin documento de
generación V2 ni colecciones V2/inventarios en la fixture.
[Comprobación del protocolo](fin_mvp_visual_2026-10-23/protocolo-verificado.json).

No quedan fallos funcionales reproducidos en los escenarios ejecutados. Quedan
fuera de esta validación dispositivos físicos Android/iOS, sus teclados y otros
navegadores. La configuración comprobada fue la inicialización CLP de la fixture;
no una migración ni monedas alternativas. La agrupación visual de miles podría
mejorarse posteriormente; no se cambió la interpretación de los importes.

`git diff --check` sigue señalando un espacio final preexistente en
`functions/index.js:2021`; se conservó por estar fuera del alcance.
No se instalaron dependencias, no se desplegó y no se hicieron commits.

## Demo local para revisión

Los emuladores y el servidor web se dejaron en ejecución. El Chrome automatizado
se cerró después de guardar la evidencia. Acceso desde este equipo:

- URL: <http://localhost:7358/finanzas_demo.html>
- Titular: `admin@finanzas.demo` / `SoloDemo123!` (credenciales ficticias).
- Datos efímeros: al cerrar los emuladores no se exportan.

Para reproducir desde una sesión nueva, usar terminales separadas y dependencias
ya disponibles. No iniciar otro emulador sobre los puertos actualmente ocupados:

```powershell
node test/finanzas_mvp/iniciar.js
```

```powershell
flutter build web --debug --no-pub --no-web-resources-cdn --no-wasm-dry-run -t lib/main_finanzas_demo.dart --dart-define=FESYNC_FINANZAS_DEMO=true
node test/finanzas_mvp/servir_web.js
```
