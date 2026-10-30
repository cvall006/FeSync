# Ensayo FIN-7C.4E.1E

Ejecutar desde la raíz, con dependencias, CLI y emulador ya instalados:

```powershell
node test/contabilidad_preparacion_acreditada_aislado/iniciar.js
```

El arnés verifica el manifiesto local fijado antes de importar SDKs o iniciar
infraestructura. Rechaza argumentos, credenciales, proyectos alternativos,
configuraciones incompatibles y puertos ocupados. Utiliza un emulador nuevo
demo-fesync; no se conecta a uno que ya tenga datos. No instala paquetes ni
descarga el emulador: exige el JAR en la caché de la CLI existente.
Los logs, reglas/configuración copiadas y software histórico se escriben solo
en un directorio temporal externo, indicado al arrancar.

El ejecutor copia las 28 fuentes originales admin-4 y sus componentes de
acreditación byte por byte a una carpeta privada temporal. El verificador
ORIGINAL verifica su árbol completo sin filtros, VM ni cambios de fuentes.
Esa copia se usa exclusivamente para crear una D2 auténtica de ensayo y demostrar
que la preparación nueva conserva documentos y updateTime de D2 y V1.
El árbol actual ampliado sigue rechazado por admin-4. Esta copia histórica no
acredita el nuevo procedimiento ni se usa para aceptar fuentes nuevas.

Las demás fixtures D2 de `soporte.js` anterior se conservan expresamente como
sintéticas, construidas a partir de commits V1 reales. No se les atribuye una
procedencia administrativa original. Todos los datos son ficticios y desechables.

La suite comprueba libro vacío y mixto, reversiones entre períodos, procedencia
local válida, rechazo de PENDIENTE, estados parciales, omisiones/adiciones y
alteraciones, versiones documentales, contexto/algoritmo/runtime, fencing,
concurrencia, respuesta perdida, atomicidad de lotes, verificador sin escrituras,
exclusión de V1/V2 y conservación histórica. Las pérdidas de respuesta y fallos
de commit se inyectan explícitamente alrededor del SDK real. No se prometen
todos los intercalados ni durabilidad después de destruir el emulador.

`runtime_ensayo.json` es una política estática de ENSAYO, no runtime_5.json ni
registro administrativo. `autorizacion.js` fija su digest literal revisado;
no contiene un mecanismo de aceptar automáticamente hashes encontrados.
Las pruebas y SDK no pertenecen al inventario administrativo de producción.

Las regresiones generales se ejecutan sin modificar sus guardas:

```powershell
cd functions
npm.cmd test
```

Se espera rechazo de las fuentes nuevas por el inventario oficial pendiente.
Los fallos reales y resultados, sin convertirlos en omisiones, se detallan en
[RESULTADOS.md](RESULTADOS.md).
