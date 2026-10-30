# Fallos reales de npm.cmd test

Corrida final: 1.745 pruebas, 1.718 aprobadas, 27 fallidas, cero omitidas/canceladas.
Codigo de salida 1. Los 27 fallos terminan en DEMO_FUENTES_NO_ACREDITADAS.
No se alteraron guardas, expectativas o inventarios. Las fuentes nuevas no estan administrativamente acreditadas.

1. V1 se reproduce con bytes originales; runtime actual tiene otra identidad (27.2367ms)
   test\finanzas_inventarios_versionados.test.js:19:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
2. Identidad acreditada sin mutar metadatos, legado=false (14.6171ms)
   test\finanzas_inventarios_versionados.test.js:26:37; codigo: DEMO_FUENTES_NO_ACREDITADAS.
3. Identidad acreditada sin mutar metadatos, legado=true (12.1881ms)
   test\finanzas_inventarios_versionados.test.js:26:37; codigo: DEMO_FUENTES_NO_ACREDITADAS.
4. Checkpoint historico alterado: huella historica desconocida (9.9657ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
5. Checkpoint historico alterado: iglesia (12.5769ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
6. Checkpoint historico alterado: epoca (7.6031ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
7. Checkpoint historico alterado: algoritmo (10.9611ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
8. Checkpoint historico alterado: procedimiento (12.2658ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
9. Checkpoint historico alterado: generacion activa (10.1788ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
10. Checkpoint historico alterado: etiqueta parcial (13.3933ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
11. Checkpoint historico alterado: inventario falso (12.1156ms)
   test\finanzas_inventarios_versionados.test.js:62:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
12. Ampliacion sintetica explicita y completa permite identidad anterior sin reetiquetar (29.7002ms)
   test\finanzas_inventarios_versionados.test.js:93:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
13. admin-3 reproduce huella admin-2 y acepta su historia sin cambiar datos (11.519ms)
   test\finanzas_inventarios_versionados.test.js:134:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
14. admin-3 tiene huella propia y cubre exactamente base mas V2 y mismos JS administrativos (10.8239ms)
   test\finanzas_inventarios_versionados.test.js:141:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
15. historia admin-2 incoherente rechaza: huella diferente (11.8832ms)
   test\finanzas_inventarios_versionados.test.js:158:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
16. historia admin-2 incoherente rechaza: iglesia diferente (12.6771ms)
   test\finanzas_inventarios_versionados.test.js:158:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
17. historia admin-2 incoherente rechaza: epoca diferente (16.6887ms)
   test\finanzas_inventarios_versionados.test.js:158:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
18. historia admin-2 incoherente rechaza: procedimiento diferente (13.085ms)
   test\finanzas_inventarios_versionados.test.js:158:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
19. historia admin-2 incoherente rechaza: inventario desconocido (11.7736ms)
   test\finanzas_inventarios_versionados.test.js:158:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
20. admin-4 contiene exactamente las fuentes revisadas y tiene identidad propia (8.7957ms)
   test\finanzas_inventarios_versionados.test.js:164:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
21. admin-4 admite historia admin-3 exacta sin reetiquetar; admin-3 no es alias del arbol nuevo (13.9194ms)
   test\finanzas_inventarios_versionados.test.js:195:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
22. compatibilidad admin-3 no se infiere si un descriptor no la declara (20.0441ms)
   test\finanzas_inventarios_versionados.test.js:202:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
23. Checkpoint admin-4 alterado rechaza sin reinterpretar: huella falsificada (13.242ms)
   test\finanzas_inventarios_versionados.test.js:217:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
24. Checkpoint admin-4 alterado rechaza sin reinterpretar: iglesia ajena (10.4768ms)
   test\finanzas_inventarios_versionados.test.js:217:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
25. Checkpoint admin-4 alterado rechaza sin reinterpretar: epoca distinta (12.3855ms)
   test\finanzas_inventarios_versionados.test.js:217:4; codigo: DEMO_FUENTES_NO_ACREDITADAS.
26. Guardas no abren red ni inicializan Firebase (18.9273ms)
   test\finanzas_transicion_demo.test.js:10:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
27. Inventario revisado coincide con fuentes actuales, sin modificar archivos (13.3056ms)
   test\finanzas_transicion_demo.test.js:37:1; codigo: DEMO_FUENTES_NO_ACREDITADAS.
