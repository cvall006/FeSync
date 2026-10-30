# Puente de migración legacy y salida normal

Reutiliza el migrador y el motor existentes sin modificarlos. Solo `demo-fesync`,
con Auth 9098, Firestore 8088 y Functions 5018. No necesita credenciales.

Desde la raíz, en una sesión local limpia y sin otros emuladores en esos puertos:

```powershell
node test/membresia_legacy/iniciar.cjs
```

Ejecuta guardas, migrador, simulador, motor y las seis pruebas del puente,
secuencialmente. Sus pruebas existentes limpian la base **local propia**. Al acabar
prepara perfiles nuevos para Chrome y espera el archivo de cierre hasta 30 minutos.
`--puente` ejecuta solo las seis nuevas pruebas antes de esa fixture.
`reglas.cjs` ejecuta las 103 reglas pertinentes en otra instancia aislada (8098).

Para repetir preservando evidencia, guardar primero toda la carpeta de resultados
`docs/membresia_legacy_2026-10-28/` y retirar únicamente sus señales de cierre
`finalizar` y `browser/finalizar-browser`. Las salidas de la suite utilizan nombres
fijos. No borrar ni mover recursivamente carpetas calculadas o sesiones ajenas.

El ensayo Chrome requiere la compilación demo ya existente
`build/finanzas_web_demo_candidato`, Chrome instalado y puertos 8878/9228 libres:

```powershell
node test/membresia_legacy/browser.cjs
node test/membresia_legacy/browser_acciones.cjs estado login
```

Activar accesibilidad Flutter mediante el placeholder semántico en CDP. Usar solo
las credenciales ficticias de `browser/fixture.json`. Navegar Dashboard → Perfil →
Salir, documentar el aviso y verificar que todavía no se invocó la salida.

```powershell
$env:NODE_OPTIONS='--require=C:/Otro/fesync/test/finanzas_release7/red_local.cjs'
node test/membresia_legacy/control.cjs migrar
```

Volver al Dashboard y repetir Perfil → Salir; el cliente debe mostrar el ingreso a
congregación. Verificar el recibo real local:

```powershell
node test/membresia_legacy/control.cjs verificar
Set-Content docs/membresia_legacy_2026-10-28/browser/finalizar-browser terminado
Set-Content docs/membresia_legacy_2026-10-28/finalizar terminado
```

No son comandos de producción. El informe documenta límites y autorizaciones
pendientes; no retirar guardas del migrador para llevarlo a un proyecto real.
