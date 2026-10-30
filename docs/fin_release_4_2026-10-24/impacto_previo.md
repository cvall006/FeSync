# Impacto previo a la consolidación

Respaldo verificable de 592 archivos locales, incluidos untracked e informes
anteriores, registrado en `respaldo.json`. Se conserva la eliminación Kotlin previa.

La lógica incremental se extraerá de `functions/test` a `functions/finanzas_v1`.
Se mantendrán reexportaciones de compatibilidad, sin duplicar el motor. Se
separará la captura de solicitudes de las consultas/fixtures antiguas del demo.
Las funciones económicas de `finanzas_core` no cambian. La habilitación privada
y la barrera de entorno seguirán apagando el circuito fuera del emulador demo.

El árbol actual ya no corresponde a admin-6; añadir módulos productivos tampoco
lo convierte en ese runtime histórico. No se modifican `contabilidad_demo`, V2,
preparadores, hashes, registros ni checkpoints. Sus guardas seguirán rechazando
el árbol actual.

Para probar compatibilidad histórica se usará una fixture aislada con las fuentes
exactas de los inventarios existentes. El index.js original se recupera del
respaldo anterior a FIN-RELEASE-3 y debe coincidir con el hash ya acreditado en
`fuentes_v1.json`. Las demás fuentes se copian solo si sus bytes coinciden con
los hashes existentes; el verificador original confirma la identidad admin-6.
No se emite inventario nuevo ni se pasan bytes nuevos como antiguos. Las pruebas
negativas se conservan y se verifica por separado el rechazo del árbol actual.

Las pruebas de reglas que borran la base se ejecutarán en otro emulador aislado,
nunca sobre el Firestore 8088 que conserva las demos existentes. No se cambian
las reglas. Las pruebas Flutter adicionales usarán únicamente Auth local y los
callables normales en demo-fesync.
