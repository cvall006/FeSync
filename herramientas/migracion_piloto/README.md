# Piloto unitario de pertenencia

Reutiliza `functions/migraciones/pertenencia_ejecucion.js`; no ejecutar el
migrador demo contra un proyecto real quitando sus guardas.

El [informe del piloto](../../docs/membresia_piloto_2026-10-28.md) contiene
hashes, evidencia, recuperación y autorizaciones pendientes. Los comandos reales
están en un archivo `.txt` expresamente documentado; no se han ejecutado.

Ensayo local con dependencias ya instaladas y puertos libres:

```powershell
node test/membresia_piloto/iniciar.cjs
node test/membresia_piloto/reglas.cjs
```

Los launchers arrancan exclusivamente infraestructura propia demo-fesync y
detienen la suite ante fallos. Las fixtures borran únicamente su base local;
el launcher no reutiliza sesiones ajenas. No importan datos reales.

CLI: `preparar`, `dry-run`, `aplicar`, `verificar`, `verificar-respaldo` y
`recuperar-respaldo`; siempre `--proyecto` y `--directorio` explícitos. `aplicar`
exige `--confirmar` con el hash del dry-run vigente. No hay modo force, lista de
usuarios ni restauración automática de Firestore. Los archivos no se sobrescriben.

Para un nuevo ensayo preservar primero la evidencia anterior: los resultados demo
usan rutas fijas. La selección/manifiesto reales, respaldos y preparación deben
permanecer en carpeta privada con ACL del operador, fuera de Git/Hosting.
