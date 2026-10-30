# Rechazos reales de inventario en FIN-7C.4E.1H

npm.cmd test sobre el arbol ampliado: 1759 pruebas, 1727 aprobadas y 32 fallidas.
Cero omitidas/canceladas. Las 32 terminan en DEMO_FUENTES_NO_ACREDITADAS.
Los cinco JS candidatos no estan incluidos en admin-5. No se modifica el inventario
ni se eliminan negativas para hacer pasar estas pruebas. No se declara Node verde.

El mismo comando sobre la copia exacta previa: 1759/1759, sin fallos/omisiones.
Las corridas corresponden a arboles distintos y se informan por separado.

| # | Caso fallido en el arbol ampliado | Causa observada |
| --- | --- | --- |
| 1 | V1 se reproduce con bytes originales; runtime actual tiene otra identidad  | DEMO_FUENTES_NO_ACREDITADAS |
| 2 | Identidad acreditada sin mutar metadatos, legado=false  | DEMO_FUENTES_NO_ACREDITADAS |
| 3 | Identidad acreditada sin mutar metadatos, legado=true  | DEMO_FUENTES_NO_ACREDITADAS |
| 4 | Checkpoint historico alterado: huella historica desconocida  | DEMO_FUENTES_NO_ACREDITADAS |
| 5 | Checkpoint historico alterado: iglesia  | DEMO_FUENTES_NO_ACREDITADAS |
| 6 | Checkpoint historico alterado: epoca  | DEMO_FUENTES_NO_ACREDITADAS |
| 7 | Checkpoint historico alterado: algoritmo  | DEMO_FUENTES_NO_ACREDITADAS |
| 8 | Checkpoint historico alterado: procedimiento  | DEMO_FUENTES_NO_ACREDITADAS |
| 9 | Checkpoint historico alterado: generacion activa  | DEMO_FUENTES_NO_ACREDITADAS |
| 10 | Checkpoint historico alterado: etiqueta parcial  | DEMO_FUENTES_NO_ACREDITADAS |
| 11 | Checkpoint historico alterado: inventario falso  | DEMO_FUENTES_NO_ACREDITADAS |
| 12 | Ampliacion sintetica explicita y completa permite identidad anterior sin reetiquetar  | DEMO_FUENTES_NO_ACREDITADAS |
| 13 | admin-3 reproduce huella admin-2 y acepta su historia sin cambiar datos  | DEMO_FUENTES_NO_ACREDITADAS |
| 14 | admin-3 tiene huella propia y cubre exactamente base mas V2 y mismos JS administrativos  | DEMO_FUENTES_NO_ACREDITADAS |
| 15 | historia admin-2 incoherente rechaza: huella diferente  | DEMO_FUENTES_NO_ACREDITADAS |
| 16 | historia admin-2 incoherente rechaza: iglesia diferente  | DEMO_FUENTES_NO_ACREDITADAS |
| 17 | historia admin-2 incoherente rechaza: epoca diferente  | DEMO_FUENTES_NO_ACREDITADAS |
| 18 | historia admin-2 incoherente rechaza: procedimiento diferente  | DEMO_FUENTES_NO_ACREDITADAS |
| 19 | historia admin-2 incoherente rechaza: inventario desconocido  | DEMO_FUENTES_NO_ACREDITADAS |
| 20 | admin-4 contiene exactamente las fuentes revisadas y tiene identidad propia  | DEMO_FUENTES_NO_ACREDITADAS |
| 21 | admin-4 admite historia admin-3 exacta sin reetiquetar; admin-3 no es alias del arbol nuevo  | DEMO_FUENTES_NO_ACREDITADAS |
| 22 | compatibilidad admin-3 no se infiere si un descriptor no la declara  | DEMO_FUENTES_NO_ACREDITADAS |
| 23 | Checkpoint admin-4 alterado rechaza sin reinterpretar: huella falsificada  | DEMO_FUENTES_NO_ACREDITADAS |
| 24 | Checkpoint admin-4 alterado rechaza sin reinterpretar: iglesia ajena  | DEMO_FUENTES_NO_ACREDITADAS |
| 25 | Checkpoint admin-4 alterado rechaza sin reinterpretar: epoca distinta  | DEMO_FUENTES_NO_ACREDITADAS |
| 26 | admin-5 acredita exactamente 34 fuentes sin cambiar descriptores anteriores  | DEMO_FUENTES_NO_ACREDITADAS |
| 27 | admin-5 conserva identidad D2 original admin-2  | DEMO_FUENTES_NO_ACREDITADAS |
| 28 | admin-5 conserva identidad D2 original admin-3  | DEMO_FUENTES_NO_ACREDITADAS |
| 29 | admin-5 conserva identidad D2 original admin-4  | DEMO_FUENTES_NO_ACREDITADAS |
| 30 | acreditar codigo no convierte la capacidad local ni acepta admin-5 como capacidad del preparador  | DEMO_FUENTES_NO_ACREDITADAS |
| 31 | Guardas no abren red ni inicializan Firebase  | DEMO_FUENTES_NO_ACREDITADAS |
| 32 | Inventario revisado coincide con fuentes actuales, sin modificar archivos  | DEMO_FUENTES_NO_ACREDITADAS |

Log completo: TEMP/fesync-1H-node-actual-final.log.
No se atribuyen fallos nuevos al nucleo economico; las regresiones anteriores se
ejecutan tambien sobre la copia respaldada con su inventario original intacto.
