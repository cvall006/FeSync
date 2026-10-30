# Fuente histórica de index.js

`index_admin6.js.txt` contiene los bytes anteriores a FIN-RELEASE-3, recuperados
del respaldo verificable `fesync-fin-release3-20261025002720/files/functions/index.js`.
Su SHA-256 es el **ya existente** en `contabilidad_demo/fuentes_v1.json`:
`94cdbd1b987a70a13be6e608347da962de877300ee3a1d7dd3e8d1ad67868f23`.

El helper de pruebas construye un árbol histórico temporal con las demás fuentes
solo si coinciden con los hashes existentes. El verificador original debe validar
el conjunto completo y la identidad admin-6. No se ejecuta este index ni se carga
desde los callables. No es otro motor, inventario o acreditación: es una fixture
de bytes históricos para probar las identidades y checkpoints anteriores.

El árbol normal sigue rechazado por las guardas históricas. Ningún byte nuevo se
acepta como antiguo; tampoco se parchean los verificadores o módulos V2.
