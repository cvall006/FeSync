# FIN-7C.4E.1G — Caso B: enlace administrativo pendiente

Fecha: 2026-10-23. Esta entrega contiene únicamente este diagnóstico y diseño.
No implementa el enlace, acredita software nuevo ni crea generaciones.

## Conclusión y evidencia del contrato actual

Admin-5 acredita exactamente 34 fuentes, pero no existe una API que permita
crear una preparación FIN-7C.4E.1E con procedencia administrativa admin-5.
Revisados ACREDITACION_ADMIN5.md, COMPATIBILIDAD_INVENTARIOS.md, registro,
descriptores, fuentes.js y los módulos del preparador, corresponde el CASO B.

| Evidencia actual | Consecuencia |
| --- | --- |
| `contabilidad_preparacion_acreditada_demo/runtime.js:7,47-57` | WeakMap privada; solo emite capacidad opaca local, identidad ENSAYO_LOCAL_FIJADO, contrato 1, acreditación PENDIENTE. No admite identidad administrativa inyectada. |
| `contabilidad_preparacion_acreditada_demo/preparacion.js:10-18,26,56` | Exige esa capacidad al construir contexto y vuelve a comprobar fuentes antes de iniciar y avanzar. El runtime local queda capturado y persistido. |
| `test/contabilidad_preparacion_acreditada_aislado/autorizacion.js:7-12` | El ejecutor fija el manifiesto local y verifica además admin-5 antes del SDK; devuelve la capacidad local. Verificar ambos no cambia su identidad. |
| `contabilidad_preparacion_acreditada_demo/evidencia.js:5-19` | Procedimiento preparacion_v2_procedencia_ensayo_1, esquema y evidencia 1; sobre exacto, sin campo administrativo extensible. |
| `contabilidad_preparacion_acreditada_demo/estado.js:29-36` | Cerrojo, cabecera y ejecución deben coincidir exactamente; tampoco permite añadir etiquetas a la generación existente. |
| `contabilidad_preparacion_acreditada_demo/verificacion.js:10-24` | Reconstruye evidencia en transacción de lectura; resultado siempre PENDIENTE, activa:false, elegibleActivacion:false. |
| `contabilidad_demo/fuentes.js:96,107-124` | Verifica árbol exacto y compatibilidad explícita. comprobarEjecucion valida el contrato D2; no autoriza el sobre del preparador local. |

Se obtuvo el contexto auténtico mediante obtenerContextoFuentes('admin-5') y se
entregó a contexto({runtime,db}) con un cliente vigilado en memoria: rechazo
E_RUNTIME_NO_AUTORIZADO, cero accesos a propiedades/métodos del cliente. No se
importó SDK ni se consultó Firestore para esta comprobación. D2 puede crear
ejecuciones D2 admin-5; eso no produce evidencia administrativa de preparación V2.

Una primera instrumentación ad hoc falló porque colocaba un getter que lanzaba
en el argumento db: la desestructuración de parámetros lo evalúa antes del cuerpo.
Se corrigió el instrumento colocando el detector en el cliente. Ese fallo de la
sonda queda declarado; no fue un fallo de la suite ni un defecto del preparador.

## Qué está comprobado y qué no

| Plano | Estado verificado en esta entrega |
| --- | --- |
| Código acreditado | Árbol admin-5 exacto y compatibilidad administrativa comprobados por el verificador y las pruebas Node. |
| Ejecución real | Se ejecutaron pruebas locales y la sonda de rechazo. No se ejecutó una preparación nueva. |
| Evidencia persistida | No se leyó ni escribió evidencia remota. El código vigente define evidencia local PENDIENTE; no se certifica aquí una generación concreta. |
| Elegibilidad | El verificador vigente devuelve false. La integridad o acreditación del software no concede activación. |

El cierre de imports relativos estáticos de preparación y verificación contiene
20 JS: seis del procedimiento local, fuente/modelo/util del preparador anterior,
diez financieros y pertenencia.js. Se recorrió y cotejó contra el inventario;
los 20 están incluidos en sus 34 fuentes. El inventario completo se exige siempre,
no solo ese cierre. Los tres JS administrativos participan adicionalmente en la
identidad. Node, SDK, dependencias, CLI, Java y SO no quedan acreditados por esa
huella. La raíz de confianza sigue siendo la política local revisada y la custodia.

SHA-256 descriptor runtime_5.json:
`7ad0783cedd1a11589656c3701f464f89d547e7d7df2ef2a3bcf3ecef860a2b1`.
Identidad administrativa reproducida:
`175206badd4b89e6c61b0549d79198d617d121d5f3c5afd8d84d7ff2b5982720`.
No se modifica el descriptor ni se copia esa huella en documentos de ejecución.

## Extensión mínima propuesta, todavía sin implementar

Crear en un alcance posterior el módulo independiente
`functions/contabilidad_preparacion_v2_admin_demo/`, conservando íntegros los
procedimientos, inventarios y documentos anteriores. Archivos exactos propuestos:

| Archivo futuro | Responsabilidad |
| --- | --- |
| `runtime.js` | Exigir selector explícito de identidad revisada y verificar inventario completo antes del SDK; emitir capacidad privada del procedimiento nuevo, revalidable antes de cada operación. |
| `evidencia.js` | Contrato preparacion_v2_procedencia_administrativa_1, esquema de sobre 2, procedimiento 1, evidencia 2, algoritmo económico 1; validación exacta y sello canónico propios. |
| `estado.js` | Referencias privadas nuevas, comprobación de sobre/cerrojo/checkpoint, documentos esperados, versiones y reconstrucción del sello. |
| `preparacion.js` | Iniciar/avanzar bajo runtime real verificado, exclusión externa, protocolo bloqueado, fencing, transacciones e idempotencia. |
| `verificacion.js` | Lectura exclusiva; separar integridad, acreditación de procedencia, identidad de creación e identidad del verificador. Siempre elegibleActivacion:false. |
| `README.md` | Contrato, límites, recuperación, custodia y procedimiento de ejecución revisado. |

Reutilizar únicamente lectores/modelo/util del preparador anterior, entorno demo
existente y núcleo puro cuyo cierre haya sido revisado. No envolver el preparador
local para reetiquetar su respuesta: su capability y esquema no sirven al contrato
nuevo. No modificar adaptadores, conciliador, protocolo, D2 ni los seis JS locales.

La integración futura debe usar estas colecciones privadas nuevas, bajo
`iglesias/{iglesiaId}`:

- `finanzas_preparaciones_admin_v2_demo/{ejecucionId}`.
- `finanzas_preparaciones_admin_v2_control/cerrojo`.
- `finanzas_evidencias_admin_v2_demo/{ejecucionId}`.

El destino seguirá siendo una NUEVA generación
`finanzas_generaciones_demo/{generacionId}`, con la cabecera V2 exacta existente
y activa:false. Identidad administrativa y enlace residen en el sobre y evidencia,
sin campos extra en esa cabecera. Rechazar destinos ocupados, huérfanos o locales.
Para proteger la exclusión entre procedimientos, exigir custodia externa y
comprobar también los controles de preparación existentes; no bastará un cerrojo
nuevo independiente. El lector compartido debe revisarse para esas comprobaciones;
si no las cubre, añadir las lecturas en estado.js del módulo nuevo.

El sobre vinculará iglesia, ejecución, generación, época, período, parámetros y
operador normalizados, procedimiento/algoritmo, corte con secuencia, manifiesto de
fuente y comprobantes del mismo corte, identidad completa del runtime de creación
(id, contrato y huella), checkpoint y fence. La evidencia final incluirá ese vínculo,
hash del checkpoint y rutas/versiones/contenidos de todos los documentos preparados.
Solo se sella tras releer documentos ya confirmados; no se hashean timestamps
todavía pendientes. Ejecución, evidencia y cerrojo deberán coincidir exactamente.

Verificar fuentes antes de cargar el SDK y al comenzar/reanudar cada operación,
fuera del callback transaccional. Durante la transacción comprobar el vínculo,
el protocolo bloqueado, la ausencia de puntero activo, corte, fuente y fence.
Custodia debe mantener inmóviles el árbol revisado y los escritores administrativos
durante toda la ejecución: rehashear archivos no acredita módulos previamente
cargados desde bytes distintos. Arrancar un proceso nuevo desde el árbol verificado;
rechazar sustituciones de módulos y carga previa incompatible. No se promete una
prueba criptográfica de ejecución frente a quien controle código, política y datos.

Reintento del mismo fence después de un commit perdido devuelve el resultado
ya confirmado sin duplicar escrituras. Dos operadores no podrán compartir ni robar
cerrojo; no introducir caducidad automática. Incompletitud, discrepancia contable,
lectura incierta o identidad desconocida nunca producirán resultado completo.
El verificador no reparará datos ni actualizará cerrojos o inventarios.

No se admite extensión in situ del sobre PENDIENTE. El procedimiento nuevo
rechazará esos sobres como procedencia administrativa y no los adoptará. Su
consulta histórica seguirá en el procedimiento original y su contexto auténtico.
Para la primera versión nueva, reanudar solo con identidad de creación exacta;
una compatibilidad posterior requiere revisión explícita del procedimiento.

## Acreditación posterior, sin identidad nueva en esta entrega

1. Revisar este diseño y autorizar por separado implementación y acreditación.
2. Implementar y probar el candidato en copia aislada del árbol. Mientras no esté
   acreditado, todo ensayo debe etiquetarse como candidato no acreditado, nunca
   como admin-5. No ejecutar preparación administrativa en el árbol vigente.
3. Añadir JS dentro de functions cambiará su conjunto exacto: admin-5 DEBE rechazar
   ese árbol ampliado. No eludir el rechazo moviendo módulos a directorios excluidos.
4. Revisar cierre completo, cargador y contrato; fijar hashes reales en un descriptor
   NUEVO e inmutable. Una identidad posterior podría denominarse admin-6, pero el
   nombre y aprobación están pendientes: no hay registro ni acreditación aquí.
   Incluir todos los módulos nuevos; conservar los 34 hashes y tres JS administrativos.
   El mecanismo actual de adicionales admite el nuevo directorio; verificarlo en
   pruebas antes de aprobar. El descriptor no contiene su propio hash y los módulos
   no incorporan la huella final: la política del ejecutor selecciona el id revisado.
5. Solo tras revisión explícita, registrar el descriptor y su digest en registro.json,
   declarar compatibilidad administrativa revisada y acreditar el árbol completo.
   Preservar runtime_2/3/4/5.json, legado y la identidad de cada creación histórica.
   Compatibilidad D2 no implica compatibilidad del nuevo procedimiento.
6. Ajustar bajo revisión los arneses locales afectados por el hash de registro;
   archivar sus políticas originales y jamás reetiquetar evidencias históricas.
7. Ejecutar entonces una generación sintética NUEVA con el runtime ya acreditado,
   verificar el vínculo persistido y conservar evidencia de las pruebas. Sin activar.

## Pruebas de aceptación definidas para esa implementación

Archivos futuros en `test/contabilidad_preparacion_v2_admin_aislado/`:
`autorizacion.js`, `guardas.test.js`, `integracion.test.js`, `ejecutar.js`,
`iniciar.js` y `README.md`. El lanzador solo admitirá demo-fesync y emulador local,
sin credenciales, con custodia explícita y dependencias existentes.

| Escenario futuro | Resultado exigido |
| --- | --- |
| Identidad realmente revisada y árbol completo | Capacidad administrativa privada y vínculo persistido en una generación nueva. |
| Copia de huella, objeto similar, módulo cargado distinto o fuentes alteradas | Rechazo antes de preparar datos; volver a comprobar al reanudar. |
| PENDIENTE histórico, etiqueta parcial o identidad desconocida | Rechazo sin escrituras ni adopción. |
| Iglesia, generación, época, corte/secuencia, algoritmo o runtime alterados | Rechazo del sobre, checkpoint o evidencia. |
| Comprobante cambiado, ausente, ajeno al corte o divergencia contable | Rechazo; evidencia parcial nunca completa. |
| Respuesta perdida/reintento de fence | Un único commit económico; resultado reproducible. |
| Operadores simultáneos y procedimientos distintos | Exclusión global bajo custodia y controles cruzados; sin doble preparación. |
| Destino extra, huérfano o generación ocupada | Rechazo conservador. |
| Verificador válido/inválido/error de lectura | Cero create/set/update/delete; ninguna reparación. |
| Protocolo o puntero alterados durante preparación | Rechazo; V1 bloqueado, V2 inactivo, sin concesión de elegibilidad. |
| Legado/admin-2/admin-3/admin-4/admin-5 | Identidades reproducidas y D2 histórico recuperable sin reetiquetar. |
| Nuevo árbol bajo selector admin-5 | Rechazo por adiciones; jamás aceptar implícitamente otra versión. |

Ejecutar además Node completo y regresiones existentes de compatibilidad, D2,
FIN-7/reglas anidadas, ambos preparadores y adaptador V2. No convertir resultados
anteriores en resultados de la implementación futura.

## Validación real FIN-7C.4E.1G

- `npm.cmd test` en functions: 1.759/1.759, cero fallos/omisiones/cancelaciones.
- `node --test test/contabilidad_preparacion_acreditada_aislado/guardas.test.js`:
  32/32, cero fallos/omisiones/cancelaciones.
- Sonda en memoria: runtime admin-5 auténtico, rechazo de capacidad administrativa
  por el contrato local y cierre transitivo de 20 fuentes comprobados.
- No se ejecutaron emuladores ni suites SDK en esta fase B documental. Los
  25/28/211/46/75/58/39 de admin-5 son resultados de FIN-7C.4E.1F, no de esta entrega.
- Un comando inicial de búsqueda usó expansión de llaves no válida en PowerShell;
  se corrigió la búsqueda. No produjo cambios ni afecta las suites.

## Preservación y diff

Rama integration/adora-live; HEAD 01223cd990312677ebbef2892ae7e99b1109e272.
Antes de editar: 18 tracked modificados, 194 untracked individuales, staged vacío.
Respaldo externo verificado de los 404 archivos tracked/untracked presentes,
índice, HEAD, diff staged/unstaged y estado:
`C:/Users/igles/AppData/Local/Temp/fesync-pre-1G-4F1Kkn/`.
No se afirma haber recopiado dependencias ignoradas en este respaldo de estado Git.
SHA-256 manifest.json:
`3b4c18273bf950e7e112584c3cf1d69bc295149da6fb76e2c31633298d7c8b7e`.

El único archivo añadido por esta fase es este documento. La comparación final
contra respaldo debe confirmar los 404 archivos anteriores idénticos, índice y
HEAD intactos, mismo diff tracked, ningún staged y 195 untracked. El diff propio
y los hashes finales se conservan en el respaldo externo como cambios-fin-1G.diff
y verificacion-final.json; el SHA de este documento se entrega por separado para
evitar autorreferencia. Los logs están en TEMP/fesync-1G-node.log y
TEMP/fesync-1G-guardas.log.

Sin cambios de software, inventarios, checkpoints, Work, Flutter, reglas o
funciones públicas. Sin instalación, commits, cambio de rama, producción,
migraciones, nuevas generaciones, activación ni despliegue. Se detiene esta fase
con el diseño; su implementación y acreditación posterior quedan pendientes.
