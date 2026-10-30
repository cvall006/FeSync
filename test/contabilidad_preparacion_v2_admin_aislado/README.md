# Ensayo FIN-7C.4E.1H

`node iniciar.js` crea un Firestore Emulator demo-fesync desechable en TEMP, sin
instalar paquetes o descargar el JAR, y ejecuta guardas e integración en serie.
Requiere puertos libres, Firebase CLI/JAR/Java y dependencias ya presentes.
No debe ejecutarse contra un emulador compartido o con datos que deban conservarse.

La política local runtime_ensayo.json fija fuentes exactas y su digest está
incluido literalmente en autorizacion.js. Es una autorización de ENSAYO LOCAL,
no un inventario administrativo. Ni el lanzador ni el runtime regeneran esa política.
Una modificación requiere revisión independiente antes de cambiarla.

Las pruebas SDK siembran operaciones V1 reales con sus recibos, bloquean el libro,
preparan únicamente generaciones nuevas y comprueban versiones/sellos, fencing,
respuesta perdida, divergencias y ausencia de escrituras históricas. Las etiquetas
D2 sintéticas de la fixture son explícitas; no se presentan como D2 acreditada.
El lanzador crea además una copia admin-5 exacta y verificada para producir
evidencia PENDIENTE auténtica con el procedimiento anterior y comprobar que el
puente no la modifica ni adopta.

Las pruebas de runtime adulterado usan dobles de FS sin cambiar archivos reales.
La exclusión operativa es custodia del arnés, no prueba de IAM contra otro Admin.
La vía administrativa positiva permanece bloqueada hasta una acreditación posterior.
La suite SDK no se omite silenciosamente: ejecutarla sin emulador falla.
