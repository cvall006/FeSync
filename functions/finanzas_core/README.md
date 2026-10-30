# FIN-2: núcleo puro de tesorería

Solo dinero, calendario y asientos. CommonJS, Node 24 y node:test como el proyecto.
No importa Firebase ni index.js; no usa red, reloj, archivos, aleatoriedad,
persistencia, autorización, recibos, transacciones o estado global mutable.
Los únicos módulos productivos nuevos son dinero.js y asientos.js.

La sesión comprobó C:/Otro/fesync, rama integration/adora-live y un solo worktree
registrado. No hay aislamiento Git específico de Finanzas ni se puede acreditar
la ubicación de la copia de Work. El aislamiento de este paso es POR ARCHIVOS
nuevos: no modifica código compartido, configuración, dependencias o Flutter.
Antes de integrar habrá que coordinar rutas/propiedad con Work; este README no
constituye evidencia de una copia física separada.

## API de dinero.js

| Exportación | Contrato |
| --- | --- |
| CONFIGURACION_INICIAL | Objeto congelado {moneda:'CLP', escala:0, zonaHoraria:'America/Santiago'} |
| validarConfiguracion(config?) | Devuelve copia congelada; permite configuración explícita alternativa |
| validarEnteroMinor(valor) | Devuelve entero seguro con signo, incluido cero; rechaza strings, NaN, Infinity, fracciones, bigint de entrada y -0 |
| validarMontoPositivo(valor) | Entero seguro estrictamente mayor que cero |
| sumarMinor(valores) | Suma exacta de un array; vacío devuelve cero |
| restarMinor(a,b) | Resta exacta |
| desdeExacto(bigint) | Conversión a number solo dentro del rango seguro |
| fechaContableValida(fecha) | Booleano, YYYY-MM-DD gregoriano, años 0001–9999 |
| periodoValido(periodo) | Booleano, YYYY-MM |
| validarFechaYPeriodo(fecha,periodo) | Exige ambas representaciones y correspondencia exacta; devuelve copia congelada |
| ErrorContable | Error con codigo estable; no incluye los datos recibidos |
| exigir, registroExacto | Utilidades de validación compartidas por los dos módulos |

Solo entran/salen números monetarios seguros entre -Number.MAX_SAFE_INTEGER y
Number.MAX_SAFE_INTEGER. BigInt es exclusivamente interno para evitar pérdida de
precisión y permitir cancelaciones exactas: sumarMinor([MAX,1,-1]) devuelve MAX.
Se verifica el resultado final, no cada prefijo de la suma. No se intenta recuperar
precisión que el llamador haya perdido ANTES de invocar el núcleo.

No hay parser de moneda localizada ni conversión de unidades. Por ejemplo CLP
10000 son diez mil pesos; una configuración explícita USD/escala 2 interpreta
1050 como 10,50. El código monetario valida estructura de tres letras mayúsculas,
no existencia en un catálogo mundial; escala permitida 0–6 y CLP exige cero.
El integrador deberá definir las monedas admitidas. No hay cambio de divisas.

La zona explícita se valida con Intl del runtime instalado. No se formatean fechas
con la zona local ni se convierte la fecha contable a un instante. El calendario
se calcula aritméticamente, sin Date, normalización de fechas imposibles ni reloj.
No se decide qué período está abierto ni si una fecha es futura.

## API de asientos.js

Una cuenta de entrada contiene exactamente {id,moneda,escala}. No es una cuenta
persistente ni acredita pertenencia, existencia real, autorización o saldo disponible.
El catálogo de un libro es homogéneo y sin IDs repetidos. IDs: texto no vacío de
hasta 128 caracteres, sin espacios extremos, diagonales, controles o reservados
de la forma __...__. Las entradas son mapas de datos y arrays ordinarios, no proxies.

Los constructores simples reciben:

```js
{ id, fechaContable, periodoId, cuenta, montoMinor, configuracion? }
```

- crearIngreso: una pata positiva; monto positivo.
- crearGasto: una pata negativa; el monto de entrada sigue siendo positivo.
- crearApertura: una pata patrimonial positiva, nunca ingreso operativo.
- crearAjuste: una pata patrimonial con monto positivo o negativo, distinto de cero.
- crearTransferencia: sustituye cuenta por origen/destino; monto positivo,
  cuentas distintas, misma moneda/escala y patas opuestas.
- revertirMovimiento({id,fechaContable,periodoId,original,cuentas,configuracion?}):
  crea patas inversas con otro ID, conserva clase y vincula reversaDe. Fecha no
  anterior al original. No modifica original ni permite cadenas de reversas.
- validarMovimiento(m,{cuentas,configuracion?,original?}): valida y devuelve copia
  profundamente congelada. Para una reversa exige su original.
- calcularLibro({movimientos,cuentas,periodoId?,configuracion?}): reconstruye saldos
  y resultados validando TODO el libro, originales y reversas incluidos.

Un movimiento retornado contiene exactamente id, clase, moneda, escala, zonaHoraria,
fechaContable, periodoId, asientos y reversaDe (null para originales). Cada asiento
contiene {cuentaId,deltaMinor}. No incorpora todavía actor, donante, categoría,
motivo, aprobación o metadatos persistentes: esos contratos corresponden a etapas
posteriores. Los campos desconocidos se rechazan, no se ignoran.

calcularLibro devuelve moneda/escala/zonaHoraria/periodoId, saldoInicialPorCuenta,
saldoFinalPorCuenta, saldoInicialMinor, saldoFinalMinor, ingresosNetosMinor,
gastosNetosMinor, resultadoMinor, aperturasNetasMinor y ajustesNetosMinor.

Con periodoId: inicial incluye fechas anteriores al mes, final incluye hasta ese
mes, y los rubros corresponden SOLO al mes. Sin filtro: inicial cero, final y
rubros de todo el libro. El catálogo incluye también cuentas sin movimientos,
con saldo cero. No pasar una página o un mes prefiltrado: faltarían originales
para verificar reversas y datos para reconstruir el saldo inicial.

## Invariantes

- Transferencia: dos cuentas distintas y suma cero. No altera ingreso, gasto ni
  consolidado. Una transferencia adulterada se rechaza al validar/reconstruir.
- Apertura/ajuste no forman parte del resultado operativo. Una apertura por
  cuenta y sin movimientos de fecha anterior; no se exige apertura para usar
  una cuenta de saldo inicial cero. Apertura cero no crea asiento; se rechaza.
- IDs de movimiento únicos, originales presentes y máximo una reversa por
  original en el libro proporcionado. Reversa con misma clase, cuentas e importes
  exactamente opuestos, sin exigir que el array tenga el mismo orden de patas.
- El original revertido SIGUE sumándose junto a su reversa: nunca se elimina
  del cálculo ni se vuelve a descontar por una bandera anulado.
- Gastos netos = menos la suma de patas clase gasto (incluidas sus reversas).
  Ingresos netos = suma de patas clase ingreso (incluidas sus reversas).
- Resultado = ingresos netos - gastos netos.
- Saldo final = saldo inicial + resultado + aperturas netas + ajustes netos.
- Una reversa en otro mes reduce su rubro en ese otro mes; no reescribe historia.
- Entradas intactas, salidas propias congeladas, resultado determinista y orden
  de entradas irrelevante para la reconstrucción.

No se valida solvencia, cierres, autorización, concurrencia o integridad contra
Firestore. Los saldos pueden ser negativos. La unicidad se comprueba solo en el
libro recibido: no es idempotencia entre procesos o solicitudes. Misma fecha no
determina orden intradía de apertura. No hay libro mayor patrimonial completo,
intereses, impuestos, conciliación bancaria, redondeo ni conversión monetaria.

## Ejemplos

```js
const { crearIngreso, crearGasto, crearTransferencia,
  revertirMovimiento, calcularLibro } = require('./asientos');
const caja = { id: 'caja', moneda: 'CLP', escala: 0 };
const banco = { id: 'banco', moneda: 'CLP', escala: 0 };
const cuentas = [caja, banco];
const fecha = { fechaContable: '2026-10-17', periodoId: '2026-10' };
const ingreso = crearIngreso({ id: 'i', ...fecha, cuenta: caja, montoMinor: 10000 });
const gasto = crearGasto({ id: 'g', ...fecha, cuenta: caja, montoMinor: 4000 });
const traslado = crearTransferencia({ id: 't', ...fecha,
  origen: caja, destino: banco, montoMinor: 4000 });
const resultado = calcularLibro({ movimientos: [ingreso, gasto, traslado], cuentas });
// caja: 2000, banco: 4000, consolidado: 6000, resultado operativo: 6000.
const reversa = revertirMovimiento({ id: 'r', ...fecha, original: gasto, cuentas });
const corregido = calcularLibro({ movimientos: [ingreso, gasto, traslado, reversa], cuentas });
// caja: 6000, banco: 4000, consolidado: 10000; gastos netos: 0.
```

## Validación

Desde functions/: npm.cmd test. Sin instalaciones ni Firebase real.
Pruebas nuevas: test/finanzas_dinero.test.js y test/finanzas_asientos.test.js.
Incluyen casos límite, siglos bisiestos, procesos con TZ distintas, VM sin reloj
ni dependencias, inmutabilidad y propiedades con muestras deterministas.
No sustituyen pruebas de persistencia/autorización, que no existen en FIN-2.

## FIN-3: autorización contable pura

autorizacion.js añade una evaluación aislada y exigirPermisoContable. NO cambia
las Functions actuales ni sus contratos, no exporta endpoints, no lee Firestore
y no sustituye el control de configuración de acceso existente.

```js
const { evaluarAutorizacionContable, exigirPermisoContable,
  OPERACIONES_CONTABLES } = require('./autorizacion');
const contexto = {
  auth: { uid: 'actor' }, // Proyectar EXCLUSIVAMENTE desde request.auth del servidor.
  iglesiaId: 'iglesia',
  perfilActor: { id: 'actor', datos: {
    iglesiaId: 'iglesia', rolGlobal: 'servidor', pertenenciaId: 'a'.repeat(64),
  } },
  iglesia: { id: 'iglesia', datos: { adminUid: 'titular' } },
  perfilTitular: { id: 'titular', datos: {
    iglesiaId: 'iglesia', rolGlobal: 'admin_iglesia',
  } },
  acceso: { id: 'acceso', iglesiaId: 'iglesia',
    version: '1700000000:123456789',
    datos: { moduloHabilitado: true, encargadoUid: 'actor' },
  },
  pertenenciaIdEsperada: 'a'.repeat(64),
  versionAccesoEsperada: '1700000000:123456789',
};
const decision = evaluarAutorizacionContable(contexto);
// { autorizado:true, motivo:'AUTORIZADO', permisos:{...} }
exigirPermisoContable(contexto, 'registrarIngresosGastos'); // devuelve decisión.
// exigirPermisoContable(contexto, 'aprobarCierre') lanza ErrorContable.
```

La pureza NO acredita procedencia de Auth o snapshots: un mapa arbitrario no es
una sesión autenticada. El futuro adaptador de servidor debe ignorar Auth/UID/rol
aportados en request.data y proyectar únicamente request.auth, documentos de sus
rutas conocidas y updateTime del mismo intento de transacción. Documento ausente
se representa como null y deniega. Datos incompletos o incoherentes nunca conceden.
No usar request.data como contexto, una bandera isAdmin o claims de roles.

Las envolturas de documentos son datos explícitos, no snapshots Firebase. Las
claves superiores y envolturas son estrictas; los mapas datos pueden conservar
auxiliares del perfil/documento, sin que se utilicen para otorgar permisos.
Las entradas son mapas/arrays de datos ordinarios, sin getters ni proxies.

| Operación exportada en OPERACIONES_CONTABLES | Titular | Encargado vigente |
| --- | --- | --- |
| leer, registrarIngresosGastos, transferir, prepararCierre | Sí | Sí |
| administrarCatalogos, registrarAjustes, anularMovimientos | Sí | No |
| aprobarCierre, reabrirCierre, administrarConfiguracion | Sí | No |

Todos los permisos de esta tabla exigen módulo explícitamente habilitado, pertenencia
actual y titular válido. Los existentes callables administrativos de acceso, que
pueden configurar con el módulo apagado, permanecen intactos. Esta nueva API no los
reemplaza ni concede una excepción implícita de inicialización contable apagada.

Invariantes de la evaluación:

- Auth.uid coincide exactamente con el ID documental del perfil actor.
- Perfil actor, iglesia y ruta de acceso pertenecen a la misma iglesia.
- adminUid identifica un perfil titular existente, con iglesia y rol coherentes.
- Ser líder/servidor no concede derechos; solo su designación vigente como encargado.
- Un actor con rol admin_iglesia que no sea titular se considera incoherente, aunque
  figure designado. No se recuperan privilegios de un administrador anterior.
- Un antiguo titular correctamente degradado por transferencia puede conservar
  una designación independiente, pero solo con permisos de encargado.
- El actor requiere pertenenciaId válido y coincidente con la precondición original.
  Se reutiliza pertenenciaIdValido de pertenencia.js, sin generar IDs ni alterar ese módulo.
- El titular ajeno solo aporta iglesia/rol/adminUid como en las reglas actuales;
  no se inventa su pertenenciaId. Si ese titular es el actor, sí debe tener ID válido.
- acceso requiere encargadoUid explícito (null si no hay encargado), booleano
  estricto y versión updateTime canónica segundos:nanosegundos. La versión debe
  coincidir exactamente, incluso tras revocar y volver a designar al mismo UID.
  No se añade un campo de versión a los documentos compartidos.
- finanzas_elegibilidad no se consulta ni admite como autoridad. Solo sirve para
  descubrimiento en el diseño existente.
- evaluar devuelve resultado/permisos congelados, sin documentos, UID o tokens.
  No conserva caché. exigir lanza CONTABILIDAD_NO_AUTORIZADA o
  OPERACION_CONTABLE_INVALIDA; no usa HttpsError ni SDKs.

Dependencias de integración con Work: campos/rutas usuarios_globales, adminUid,
rolGlobal, iglesiaId, pertenenciaId y configuración de acceso. La migración de
perfiles legados y revocación transaccional de designación deben estar acreditadas
antes de publicar operaciones contables. Formato válido del ID no acredita su
procedencia ni corrige una designación histórica mal conservada. No se implementa
otro sistema de membresía ni se modifica su contrato para resolverlo aquí.

El resultado NO es un token reutilizable. Releer documentos y evaluar EN CADA
intento transaccional; completar todas las lecturas antes de escribir. Conservar
las precondiciones originales al reintentar una solicitud incierta: no sustituirlas
por versiones actuales para forzar permiso. Concurrencia, procedencia de snapshots,
idempotencia y persistencia siguen pendientes. Esta API no puede garantizarlas sola.

## FIN-3: configuración inicial y período

configuracion.js solo valida/produce datos, nunca escribe ni autoriza al actor.
El documento contable se distingue de finanzas_config/acceso y contiene exactamente:

```js
const propuesta = { versionEsquema: 1, iglesiaId: 'iglesia',
  moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' };
const estadoLibro = { iglesiaId: 'iglesia', huboMovimientos: false, periodosAbiertos: [] };
const { validarConfiguracionInicial, exigirPeriodoContableAbierto } = require('./configuracion');
const plan = validarConfiguracionInicial({ iglesiaId: 'iglesia', propuesta,
  estadoLibro, primerPeriodo: '2026-10' });
// plan.configuracion: copia de propuesta; plan.control:
// {versionEsquema:1, iglesiaId:'iglesia', periodoAbierto:'2026-10'}.
// No se ha creado ningún documento ni se ha abierto realmente el período.
exigirPeriodoContableAbierto({ iglesiaId:'iglesia', huboMovimientos:true,
  periodosAbiertos:['2026-10'] }, 'iglesia', '2026-10'); // '2026-10'
```

| Exportación | Contrato |
| --- | --- |
| validarConfiguracionContable(config, iglesiaId) | Copia congelada, esquema 1 y CLP/0/Santiago exactos |
| validarEstadoLibro(estado, iglesiaId) | Valida historial explícito y máximo un período abierto; devuelve periodoAbierto o null |
| validarConfiguracionInicial({iglesiaId,propuesta,estadoLibro,primerPeriodo}) | Exige historial vacío y ningún período abierto; devuelve plan de configuración/control |
| validarCambioConfiguracion({iglesiaId,actual,propuesta,estadoLibro}) | Rechaza incompatibilidades, otra iglesia o versión; tras historial bloquea moneda/escala/zona |
| exigirPeriodoContableAbierto(estado, iglesiaId, periodoEsperado) | Exige un período abierto que coincida exactamente |

V1 admite solo CLP/0/Santiago, también antes del primer movimiento. El soporte
monetario configurable genérico de FIN-2 no autoriza una configuración operativa
alternativa V1. No hay campos editables adicionales: una propuesta idéntica permite
validación repetida; otra moneda/zona o esquema necesita diseño/migración explícitos.

huboMovimientos es un dato HISTÓRICO confiable que el futuro adaptador debe obtener
del servidor dentro de la transacción; no del cliente ni inferido del saldo actual.
Anular movimientos, cerrar un mes o dejar saldo cero no lo restablece a false.
Si falta o su tipo es ambiguo, se rechaza. Estado de otra iglesia también se rechaza.

El control persistente futuro debe ser único por iglesia; el estado suministrado
debe incluir todos sus períodos abiertos. Esta validación pura no puede detectar
documentos que un llamador haya omitido. Cero períodos representa ausencia de uno
abierto, no permiso para registrar; dos se rechazan, incluso si repiten el mismo mes.
Período no vive dentro del documento de configuración monetaria, sino en control.

No se ejecutan transiciones abierto/en revisión/cerrado, aprobación ni reapertura;
tampoco se decide por reloj qué mes corresponde. Autorizar al actor no basta para
registrar: la futura operación debe exigir además período abierto y coherencia de
configuración en su transacción. Una inicialización parcial/configuración ausente
con movimientos históricos se rechaza, sin reparar ni migrar silenciosamente.

Pruebas añadidas: test/finanzas_autorizacion.test.js y test/finanzas_configuracion.test.js.
Se ejecutan con npm.cmd test desde functions/, sin nuevas dependencias ni Firebase real.
Usan contextos ficticios, pruebas de permisos, versiones, historial, períodos,
suplantación, inmutabilidad y VM sin reloj ni SDKs. No prueban transacciones reales
ni constituyen autorización para integrar endpoints o publicar este componente.

## FIN-4: cuentas y categorías puras

cuentas.js y categorias.js no importan SDKs, no persisten, no autorizan actores,
no generan identificadores y no consultan el reloj. Reutilizan ErrorContable,
validadores de dinero y asientos FIN-2. FIN-3 sigue siendo la única política de
autorización; administrar catálogos exigirá su permiso administrarCatalogos.

### Documentos de catálogo V1

```js
const cuenta = {
  versionEsquema: 1, id: 'caja', iglesiaId: 'iglesia', codigo: 'CAJA',
  nombre: 'Caja principal', tipo: 'caja', moneda: 'CLP', escala: 0, estado: 'activa',
};
const categoria = {
  versionEsquema: 1, id: 'ofrendas', iglesiaId: 'iglesia', codigo: 'OFRENDAS',
  nombre: 'Ofrendas', naturaleza: 'ingreso', tipoIngreso: 'ofrendas', estado: 'activa',
};
```

Son esquemas exactos: no admiten saldo, rol, identidad del actor ni campos
ignorados. Un adaptador futuro deberá separar metadatos de persistencia de esta
proyección del dominio; no pasar snapshots Firebase directamente.

- ID documental: string de 1–128 unidades UTF-16, sin slash, controles ni nombres
  reservados. Iglesia: ID explícito, máximo 1500 bytes, coherente con el documento.
- Código canónico: 1–32 caracteres, primera letra A–Z y resto A–Z, 0–9 o guion bajo.
  No se normaliza ni cambia silenciosamente. Es inmutable desde la creación,
  incluso antes de usarlo; no se recicla al archivar. Unicidad separada para el
  catálogo de cuentas y el de categorías de cada iglesia, incluidos archivados.
- Nombre: 1–80 puntos de código, NFC, sin espacios exteriores, controles,
  caracteres de formato invisibles ni sustitutos Unicode inválidos.
- Estado: activa o archivada. V1 crea activo y trata el archivo como terminal;
  no existe eliminación ni reactivación. Una futura reactivación requiere diseño.
- Cuenta: caja o banco, exclusivamente CLP y escala 0. Tipo puede cambiar antes
  del primer uso si no hay solicitudes inciertas. Tras uso, tipo/moneda/escala son
  inmutables; moneda/escala alternativas tampoco se admiten antes del uso en V1.
- Categoría: naturaleza ingreso o gasto. Ingresos usan tipoIngreso diezmos,
  ofrendas, donaciones u otros. Gastos configurables llevan tipoIngreso null.
  Puede haber varias categorías del mismo tipo de ingreso con códigos distintos.
  Naturaleza y tipoIngreso quedan fijados tras uso o con incertidumbre pendiente.
- Transferencias, aperturas y ajustes patrimoniales no reciben categoría. Sus
  códigos canónicos básicos también están reservados. Una etiqueta libre nunca
  cambia la clase contable del movimiento.

### API de cuentas

| Exportación | Contrato |
| --- | --- |
| validarCuenta(cuenta, iglesiaId) | Valida esquema, iglesia y campos; devuelve copia congelada |
| validarCatalogoCuentas(cuentas, iglesiaId) | Valida lista completa y unicidad de IDs/códigos; copias congeladas |
| validarEstadoCuenta(estado, cuenta) | Valida estado observado de la cuenta exacta |
| crearCuenta({iglesiaId,cuenta,catalogo}) | Exige cuenta activa e identidad/código nuevos |
| actualizarCuenta({iglesiaId,actual,propuesta,catalogo,estadoCuenta}) | Valida actualización completa sin mutar el original; comprueba que actual coincide con catálogo |
| cuentaParaNuevoMovimiento(cuenta, iglesiaId) | Exige activa; devuelve {id,moneda,escala} compatible con FIN-2 |
| validarAperturaCuenta({iglesiaId,cuenta,estadoCuenta,movimiento}) | Exige apertura inicial única y válida según FIN-2; devuelve movimiento validado |

```js
const cuentas = require('./cuentas');
const asientos = require('./asientos');
const nueva = cuentas.crearCuenta({ iglesiaId: 'iglesia', cuenta, catalogo: [] });
const estadoCuenta = { iglesiaId: 'iglesia', cuentaId: 'caja', huboMovimientos: false,
  saldoMinor: 0, solicitudesInciertas: 0, aperturaRegistrada: false };
const movimiento = asientos.crearApertura({ id: 'apertura-inicial',
  fechaContable: '2026-10-01', periodoId: '2026-10', montoMinor: 10000,
  cuenta: cuentas.cuentaParaNuevoMovimiento(nueva, 'iglesia') });
const apertura = cuentas.validarAperturaCuenta({ iglesiaId: 'iglesia',
  cuenta: nueva, estadoCuenta, movimiento });
// Ninguna llamada escribe, reserva el código ni registra la apertura.
```

Estado de cuenta requiere todos los campos del ejemplo. saldoMinor es observación
confiable del libro, no una propuesta editable. Los importes son enteros seguros,
sin -0. solicitudesInciertas es un contador entero no negativo; no admite null
como cero. Sin historial, saldo debe ser cero y aperturaRegistrada false.

Archivar exige saldo exactamente cero y ninguna solicitud incierta. Un saldo
negativo tampoco permite archivo. Apertura exige cuenta activa, sin movimientos
previos de ninguna clase, sin apertura histórica y sin incertidumbre. FIN-2 exige
monto positivo: una cuenta a saldo inicial cero no necesita movimiento de apertura.
Revertir una apertura no elimina el marcador histórico ni habilita otra apertura.

### API de categorías

| Exportación | Contrato |
| --- | --- |
| TIPOS_INGRESO | Lista congelada con los cuatro tipos admitidos |
| validarCategoria(categoria, iglesiaId) | Valida esquema e iglesia; devuelve copia congelada |
| validarCatalogoCategorias(categorias, iglesiaId) | Valida lista completa e IDs/códigos únicos |
| crearCategoria({iglesiaId,categoria,catalogo}) | Exige activa e identidad/código nuevos |
| actualizarCategoria({iglesiaId,actual,propuesta,catalogo,estadoUso}) | Conserva identidad e historia; valida contexto observado |
| categoriaParaNuevoMovimiento({iglesiaId,categoria,clase}) | Exige activa y naturaleza coincidente con ingreso/gasto |
| categoriasIngresoIniciales(iglesiaId) | Devuelve cuatro propuestas deterministas; no inicializa Firestore |

estadoUso tiene exactamente {iglesiaId,categoriaId,huboMovimientos,solicitudesInciertas}.
Se puede archivar una categoría utilizada, pero nunca con incertidumbre pendiente.
El nombre puede editarse conservando ID/código; naturaleza/tipo histórico no.
No se elimina, reetiqueta ni recalcula ningún movimiento anterior.

### Contrato pendiente para Firebase y concurrencia

Estas funciones no pueden probar que un catálogo está completo, que una cuenta
no tiene historia o que un contador es real. Reciben observaciones explícitas del
servidor, nunca saldo/historial/listas suministrados como autoridad por un cliente.
huboMovimientos y aperturaRegistrada son hechos históricos permanentes: saldo
cero, anulación o cierre mensual no los restablecen.

La futura Function deberá leer Auth y documentos vigentes en cada intento de
transacción, aplicar FIN-3, configuración/período FIN-3 y las validaciones FIN-4,
antes de escribir. Todos los documentos deben pertenecer a la misma iglesia.
La cuenta/categoría observada debe coincidir con actual, pero comparar objetos
no acredita por sí solo versiones Firestore ni procedencia.

Para unicidad concurrente se necesitará una reserva privada con ID determinista
por iglesia/tipo de catálogo/código, conservada al archivar, o un control
transaccional equivalente. Una consulta/lista cliente no reserva nada.
La primera apertura deberá crear un marcador permanente por cuenta en el mismo
commit que movimiento/asientos y control de saldo. Dos validaciones sobre el
mismo estado anterior pueden pasar: solo el conflicto transaccional y la relectura
del marcador impiden confirmar dos aperturas. No se implementan reservas aquí.

Archivar, registrar uso y modificar catálogos deberán leer/escribir controles
compartidos para que una carrera obligue a revalidar saldo, actividad, historial
y solicitudes sin resultado confirmado. Los contadores requerirán mantenimiento
servidor coherente con recibos/idempotencia; no existe ese subsistema en FIN-4.

Las proyecciones para NUEVOS movimientos comprueban actividad. Para reconstruir
historia, los catálogos deben incluir archivados y FIN-2 debe recibir referencias
{id,moneda,escala} sin exigir actividad actual. Reversas futuras deberán copiar la
clasificación original y tener una política explícita para cuentas archivadas;
esta API no autoriza excepciones ni modifica FIN-2 para implementarlas.

Las pruebas nuevas cubren valores inválidos, historia, aislamiento, duplicados,
aperturas, inmutabilidad, propiedades y relecturas concurrentes modeladas, además
de ejecución en VM sin SDKs, filesystem, red ni reloj. No son transacciones reales.
Persistencia, endpoints, auditoría y pruebas de integración Firebase quedan pendientes.

## FIN-5: preparación pura de ingresos y gastos

operaciones.js exporta prepararIngreso({solicitud,contexto}) y
prepararGasto({solicitud,contexto}). Ambas validan y devuelven una propuesta privada
inmutable; nunca registran una operación, confirman un recibo ni modifican cuentas.
No hay API de transferencias, ajustes, aperturas o anulaciones en este módulo.

Se componen directamente dinero/asientos FIN-2, autorización/configuración FIN-3
y cuentas/categorías FIN-4. La autorización usa exigirPermisoContable con
registrarIngresosGastos; no hay una segunda política de roles ni excepción para
un titular con módulo apagado. Una confirmación histórica no es autoridad actual.

### Contrato de entrada

solicitud es un mapa exacto con estos campos obligatorios:

```js
const solicitud = {
  versionEsquema: 1, solicitudId: 's'.repeat(32), idMovimiento: 'movimiento-ejemplo',
  iglesiaId: 'iglesia', cuentaId: 'caja', categoriaId: 'ofrendas',
  montoMinor: 10000, fechaContable: '2026-10-17', periodoId: '2026-10',
  precondiciones: {
    pertenenciaId: 'a'.repeat(64), acceso: '1700000000:123456789',
    iglesia: '1700000000:123456789', cuenta: '1700000000:123456789',
    categoria: '1700000000:123456789', configuracion: '1700000000:123456789',
    controlPeriodo: '1700000000:123456789',
  },
};
```

Los IDs y versiones de ese ejemplo son ficticios, explícitos; el módulo no los
genera. solicitudId admite 16–128 caracteres A–Z/a–z/0–9/guion/guion bajo.
idMovimiento/cuentaId/categoriaId son IDs documentales estrictos de hasta 128
unidades UTF-16, sin slash, controles, espacios exteriores o nombres reservados.
iglesiaId debe coincidir con la iglesia validada por FIN-3 y FIN-3 configuración.
La versión de esquema no tiene valor predeterminado ni acepta strings.

Opcionales: descripcion, string NFC de 1–240 puntos de código sin controles ni
espacios exteriores. Solo ingresos admiten aportante: omitido o null significa
anónimo; de otro modo debe ser exactamente {nombre}, string NFC de 1–120 puntos
de código. No se requiere ni acepta UID de aportante, email, documento de identidad,
token o formulario adicional. descripcion presente con null/vacío se rechaza.
Todos los campos desconocidos, getters y estructuras ambiguas se rechazan.

contexto exige exactamente:

| Campo | Fuente requerida para el futuro adaptador |
| --- | --- |
| autorizacion | Contexto FIN-3 vigente del mismo intento, Auth desde request.auth |
| configuracion | Configuración contable FIN-3 de esa iglesia, esquema 1, CLP/0/Santiago |
| estadoLibro | {iglesiaId,huboMovimientos,periodosAbiertos} según FIN-3 |
| cuenta | Documento de catálogo FIN-4 con ID/iglesia coincidentes con solicitud |
| categoria | Documento FIN-4 activo con ID/iglesia y naturaleza coincidentes |
| estadoCuenta | Estado FIN-4 completo: saldo e historial del libro, no del cliente |
| versiones | Mapa exacto {iglesia,cuenta,categoria,configuracion,controlPeriodo} de versiones actuales |

Versiones son strings updateTime canónicos segundos:nanosegundos, con límites de
Timestamp Firestore, sin ceros de relleno ni pérdida de nanosegundos. No son nuevos
campos persistentes de esos documentos. precondiciones debe conservar las versiones
observadas al decidir la intención y el período de pertenencia original.

FIN-3 valida sus propias precondiciones de acceso y pertenencia; FIN-5 exige además
que coincidan con las de solicitud. Cada versión actual debe coincidir con su
precondición original. No refrescar precondiciones al reintentar para forzar paso.
Incluso una modificación auxiliar del catálogo provoca rechazo conservador.
El cambio de titularidad de ida y vuelta o cierre/reapertura del mismo mes se
detecta mediante las versiones originales de iglesia/control, cuando el adaptador
aporta las versiones auténticas. Un reingreso no habilita la intención anterior.

### Reglas y propuesta

- Monto estrictamente positivo, entero seguro CLP, escala cero, sin coerción.
- Cuenta y categoría activas. Un gasto requiere categoría de gasto; un ingreso,
  categoría de ingreso con uno de los cuatro tipos FIN-4.
- Fecha real YYYY-MM-DD y período YYYY-MM coincidentes. Debe haber un único
  período abierto que coincida; no se consulta reloj ni zona del dispositivo.
- Saldo observado seguro y asociado a la cuenta/iglesia. Gasto exige saldo mayor
  o igual al monto. Ingreso suma y gasto resta con BigInt a través de FIN-2,
  rechazando desbordamientos. No existe una excepción de sobregiro.
- Historia de cuenta implica historia del libro. Incertidumbre de cuenta bloquea
  nuevas propuestas: el adaptador deberá resolver el recibo original primero.
- No se exige apertura previa para un primer ingreso a cuenta cero. Tampoco se
  inventa un marcador de apertura o se reinicia historia.

```js
const { prepararIngreso } = require('./operaciones');
// contextoVigente debe construirse con los documentos y estados de la tabla.
const propuesta = prepararIngreso({ solicitud, contexto: contextoVigente });
// propuesta.movimiento es el movimiento exacto FIN-2, clase ingreso, sin extras.
// propuesta.saldoPropuesto = {iglesiaId,cuentaId,anteriorMinor,nuevoMinor}.
// propuesta.clasificacion = {cuentaId,categoriaId,naturaleza,tipoIngreso}.
// propuesta.responsable = {uid,pertenenciaId}, tomados SOLO de autorización.
// propuesta.privado.aportante contiene null o una copia del nombre opcional.
```

La raíz contiene además versionEsquema, iglesiaId, solicitudId, descripcion y
precondiciones. Todo el árbol está congelado y no comparte objetos mutables con
las entradas. movimiento mantiene el esquema FIN-2 y se puede reconstruir con
calcularLibro sin mezclar metadatos o contar aperturas/transferencias como ingreso.
saldoPropuesto es cálculo, no permiso ni instrucción para un update independiente.
No se generan timestamps de servidor, secuencias, claves o estados CONFIRMADA.

La propuesta completa es PRIVADA, incluido el nombre opcional y la descripción.
No se generan proyecciones públicas. Un adaptador no deberá escribir datos del
aportante en perfiles congregacionales, reportes públicos, auditorías generales,
mensajes FCM o logs. La biblioteca no registra ningún dato ni llama a Firebase.

### Idempotencia y atomicidad pendientes

La pureza no autentica mapas ni demuestra origen, vigencia o completitud de las
lecturas. Una propuesta válida no es un token reutilizable. Antes de persistir,
el futuro adaptador deberá:

1. Obtener actor de Firebase Auth e ignorar actorUid/rol aportados como autoridad.
   Leer documentos de rutas conocidas y construir las proyecciones explícitas.
2. Buscar un recibo privado ligado a actor/iglesia/tipo/solicitudId persistente.
   Acreditar el período original y una huella canónica del payload completo,
   incluidos monto, destino, fecha, datos opcionales y precondiciones. La misma
   clave con payload diferente debe rechazarse. No guardar aportante en claro
   dentro de recibos ni exponer huellas; diseñar su protección al implementar.
3. Si existe recibo confirmado, reconciliar la operación original sin nuevas
   escrituras. Ese resultado histórico no permite nuevas operaciones ni acceso
   financiero actual. Ausencia de recibo o timeout no autoriza otra clave automática.
4. En cada intento transaccional, leer estado vigente de autorización, catálogos,
   configuración, período, saldo, resumen y recibo antes de cualquier escritura.
   Mantener precondiciones de intención; volver a calcular con el saldo auténtico.
5. Validar mediante FIN-5 y comprobar unicidad de idMovimiento y recibo. Reservar
   las identidades de forma atómica; FIN-5 no mantiene memoria de claves usadas.
6. Confirmar movimiento/asientos, saldo, resumen, marcadores de uso histórico,
   auditoría privada y recibo en el MISMO commit. Los resúmenes/consolidaciones
   requieren sus propias sumas exactas con FIN-2 y lecturas transaccionales.
   Usar controles compartidos con archivo/cierre/cambio de catálogo para que las
   carreras obliguen a revalidar. No aplicar saldoPropuesto después del commit.

solicitudId debe conservarse en reintentos y reinicios; no se implementa aquí su
almacenamiento, canonización/huella, retención de recibos o recuperación remota.
Una intención nueva requiere decisión explícita; no se implementa ningún endpoint
ni se modifican los contratos de ingreso/membresía existentes para reutilizarlos.

Las pruebas FIN-5 incluyen autorización integrada con FIN-3, contexto modificado,
datos privados acotados, saldos exactos, inmutabilidad, propiedades y VM que bloquea
SDKs, red, filesystem, reloj, aleatoriedad y logs. Las carreras se modelan con
observaciones nuevas; no son pruebas Firestore ni garantía de commit concurrente.

## FIN-6: transferencias, reversiones y ajustes

correcciones.js añade prepararTransferencia, prepararReversion y prepararAjuste.
Cada función recibe {solicitud,contexto} y devuelve únicamente una propuesta
privada, determinista y congelada. operaciones.js y las APIs FIN-2 a FIN-5 no se
modifican. No hay persistencia, endpoints, reloj, IDs generados ni logs.

| API | Permiso FIN-3 | Campos específicos de solicitud |
| --- | --- | --- |
| prepararTransferencia | transferir | origenId, destinoId, montoMinor positivo |
| prepararReversion | anularMovimientos | originalId, motivo, referenciaAuditoria |
| prepararAjuste | registrarAjustes | cuentaId, deltaMinor distinto de cero, motivo, referenciaAuditoria |

FIN-3 exige módulo activo, iglesia/pertenencia vigentes y titular coherente.
El encargado designado puede transferir. Solo el titular administra reversiones
y ajustes según esa política; no se duplican condiciones de rol en FIN-6.
Una confirmación histórica nunca otorga esos permisos actuales.

### Contexto y precondiciones

Campos comunes obligatorios de solicitud: versionEsquema=1, solicitudId,
idMovimiento, iglesiaId, fechaContable, periodoId y precondiciones. IDs y
solicitudId tienen los mismos formatos/límites FIN-5; campos adicionales se
rechazan. motivo exige 1–240 puntos de código NFC, sin espacios exteriores ni
controles. referenciaAuditoria es un ID explícito, no prueba de autoridad ni
un evento ya creado. Transferencia no recibe categoría ni motivo en V1.

contexto tiene exactamente autorizacion (contrato FIN-3), configuracion,
estadoLibro (contratos FIN-3), versiones y cuentas. Reversión añade original.
versiones contiene {iglesia,configuracion,controlPeriodo}, updateTime canónicos
segundos:nanosegundos sin redondear. Cada elemento de cuentas tiene esta forma:

```js
const observacionCuenta = {
  cuenta: cuentaFIN4, estado: estadoCuentaFIN4, version: '1700000000:123456789',
};
const precondiciones = {
  pertenenciaId: 'a'.repeat(64), acceso: '1700000000:123456789',
  iglesia: '1700000000:123456789', configuracion: '1700000000:123456789',
  controlPeriodo: '1700000000:123456789',
  cuentas: [
    { cuentaId: 'caja', version: '1700000000:123456789' },
    { cuentaId: 'banco', version: '1700000000:123456789' },
  ],
};
```

Estos datos ilustrativos no son versiones inventadas por la biblioteca. El futuro
adaptador debe obtener versiones auténticas de sus snapshots y conservar las de
la intención original en cada reintento. Solo se aceptan una o dos cuentas según
la operación, sin duplicados, extras ni precondiciones de cuentas ignoradas.

### Transferencia y ajuste

Transferencia exige dos cuentas diferentes, activas, de la misma iglesia y CLP/0.
Construye con FIN-2 dos asientos opuestos. No tiene categoría, ingreso/gasto ni
resultado operativo; no duplica el movimiento como dos ingresos independientes.
El origen necesita saldo suficiente y el destino no puede desbordarse.

Ajuste exige una cuenta activa y deltaMinor entero seguro positivo o negativo.
Usa crearAjuste de FIN-2; solo afecta patrimonio/ajustes, nunca ingresos o gastos.
No existe actualización arbitraria del saldo ni excepción de sobregiro. Ambos
casos producen nuevos movimientos en el único período abierto válido.

### Original confirmado y reversión exacta

La observación adicional contexto.original es una envoltura del futuro adaptador,
NO un nuevo contrato persistente ni una bandera de cliente que acredite ejecución:

```js
const original = {
  iglesiaId: 'iglesia', version: '1700000000:123456789', estado: 'confirmado',
  movimiento: movimientoOriginalFIN2,
  clasificacion: clasificacionOriginalFIN5, // null para transferencia.
  reversion: { version: null, movimientoId: null },
};
// Además de los campos comunes, precondiciones incluye:
const originalEsperado = { version: '1700000000:123456789', versionReversion: null };
// solicitud.precondiciones.original = originalEsperado.
```

Clasificación de ingreso/gasto tiene exactamente {cuentaId,categoriaId,naturaleza,
tipoIngreso}, copiada del histórico y coherente con él. No se consulta ni exige
actividad de la categoría actual para reescribir esa clasificación. No se acepta
categoría, monto, cuentas o fecha originales desde solicitud como sustitutos.
La fecha nueva sí se recibe explícitamente y debe ser igual o posterior al
original, y pertenecer al período actualmente abierto.

Se admiten originales confirmados de ingreso, gasto o transferencia, sin reversaDe,
de la iglesia solicitada y con versión exacta. Son obligatorios el control de
reversión, su versión observada y la precondición original. null como versión
representa AUSENCIA observada del documento de control; no es permiso para omitir
su lectura transaccional. Un control existente puede tener versión y movimientoId
null; si ya identifica una reversión, siempre se rechaza, aunque se refresque la
precondición. Original ausente/incierto/incoherente o control modificado se deniega.

FIN-2 construye asientos exactamente opuestos y conserva reversaDe. El original
permanece intacto y se incluye junto a la contrapartida al reconstruir el libro:
no excluirlo ni restar otra vez su monto. FIN-2 también rechaza dos reversas del
mismo original al validar el libro completo.

Un original de mes cerrado se revierte con una contrapartida en un mes abierto.
No se reescribe el saldo, categoría ni resultado del mes cerrado. La contrapartida
afecta los netos del mes nuevo con signo opuesto; su clase FIN-2 sigue siendo
ingreso/gasto/transferencia y tipoOperacion identifica reversion. Todas las cuentas
afectadas deben estar activas en V1 y acreditar uso histórico. No se reactiva una
cuenta archivada automáticamente. La reversión de aperturas, ajustes y reversas
de reversas queda bloqueada: requiere una política excepcional futura específica.

### Resultado y garantías pendientes

La propuesta contiene versionEsquema, iglesiaId, solicitudId, tipoOperacion,
movimiento (esquema exacto FIN-2), clasificacion, responsable derivado de FIN-3,
precondiciones, motivo, referenciaAuditoria, saldosPropuestos y controlReversion.
Campos no aplicables son null. controlReversion contiene originalId,
versionOriginal, versionControlAnterior y reversionId, y SOLO describe una reserva
propuesta; no cambia el control observado.

Cada saldo propuesto tiene {iglesiaId,cuentaId,anteriorMinor,nuevoMinor}. Toda salida
de dinero requiere saldo suficiente; las sumas se hacen con helpers exactos FIN-2
y rechazan desbordamientos. Estados con solicitudes inciertas se bloquean antes
de preparar otra operación; primero hay que reconciliar su recibo. No se aceptan
saldos o confirmaciones de cliente como autoridad ni se aplican saldos después
de un commit. El historial de cuenta debe ser coherente con el libro.

Un adaptador futuro debe leer TODOS los documentos antes de escribir, reautorizar
en cada intento transaccional y coordinar cierres/archivo/transferencia de titularidad
mediante versiones y controles compartidos. Transferencia exige leer y actualizar
AMBOS saldos en el mismo commit. Reversión exige comprobar el original confirmado
y crear/actualizar condicionalmente un marcador privado único por iglesia/original
en el mismo commit que contrapartida, saldos, resumen, auditoría y recibo. Si el
marcador no existía, usar creación exclusiva; si existía, acreditar su versión.

Dos preparaciones con la misma observación antigua pueden ser válidas: FIN-6 no
crea un bloqueo global ni recuerda propuestas. La unicidad real depende del commit
atómico de ese marcador y de la relectura tras conflicto. Un reintento confirmado
debe reconciliar el recibo propio, sin intentar otra reversa o refrescar versiones.
Se mantienen las precondiciones de idempotencia FIN-5: clave persistente, payload
canónico completo, rechazo de clave con datos diferentes y recibos privados sin
TTL que permita reutilización. Auditoría conserva motivo, referencia y enlaces al
original sin publicar datos personales. No se implementa ese adaptador aquí.

Pruebas: transferencias en ambos sentidos, cancelación exacta, contrapartida de
período cerrado, doble reversa modelada/libro completo, límites y propiedades,
autorización FIN-3, precondiciones, inmutabilidad y VM sin efectos secundarios.
Son pruebas puras y de observaciones concurrentes modeladas, no pruebas Firebase.

## FIN-7A: adaptador Firestore privado, solo gastos

`adaptador_firestore.js` exporta `crearAdaptadorFirestore({db, FieldValue})` y
`LIMITES` congelado. No inicializa Admin, no autentica tokens, no publica un
callable y no importa servicios de red. El futuro servidor debe inyectar Admin
Firestore y FieldValue, y construir `auth: {uid: request.auth.uid}` desde Firebase
Auth verificado. Nunca tomar ese objeto de request.data. No invocarlo desde Flutter.

Se eligió la variante mínima de UNA operación monetaria permitida por FIN-7A:
`adaptador.ejecutar({auth: {uid}, operacion: 'gasto', solicitud})`.
Ingresos, altas de cuentas/categorías, aperturas, transferencias, ajustes, reversas
y cierres se rechazan explícitamente antes de abrir una transacción. FIN-2 a FIN-6
permanecen intactos. No existe todavía un bootstrap productivo de estos documentos.

### Solicitud y respuesta

La solicitud tiene exactamente los campos FIN-5, EXCEPTO idMovimiento, que no se
acepta del cliente: versionEsquema=1, solicitudId, iglesiaId, cuentaId, categoriaId,
montoMinor, fechaContable, periodoId, precondiciones y descripcion opcional.
precondiciones exige pertenenciaId y las seis versiones canónicas updateTime
`segundos:nanosegundos`: acceso, iglesia, cuenta, categoria, configuracion y
controlPeriodo. Son precondiciones originales de la intención, nunca autoridad.
El adaptador lee los documentos y reutiliza FIN-3 y prepararGasto de FIN-5.
No admite aportantes en un gasto ni actorUid, roles, saldo o IDs de movimiento
en la solicitud. IDs documentales/UID se limitan aquí a 128 caracteres, claves
de solicitud a 16..128 caracteres `[A-Za-z0-9_-]`, formulario a 16 KiB.

Ejemplo (el llamador conserva solicitudId y TODAS las precondiciones al reintentar):

```js
const adaptador = crearAdaptadorFirestore({ db, FieldValue });
const resultado = await adaptador.ejecutar({
  auth: { uid: request.auth.uid }, // proviene del contexto autenticado
  operacion: 'gasto',
  solicitud: {
    versionEsquema: 1, solicitudId: clavePersistida,
    iglesiaId, cuentaId, categoriaId, montoMinor: 4000,
    fechaContable: '2026-10-17', periodoId: '2026-10',
    precondiciones: precondicionesOriginales,
  },
});
```

Respuesta mínima congelada: `{estado:'CONFIRMADA', historica:boolean,
movimientoId, secuencia}`. historica=true significa recibo propio confirmado y
movimiento asociado, no autorización vigente, saldo actual o permiso de navegación.
Se permite recuperar ese resultado propio incluso después de una revocación o
salida. Cualquier NUEVA operación requiere autorización vigente en transacción.

Errores de dominio usan ErrorContable.codigo. Una excepción ajena durante la
transacción se sanitiza como RESULTADO_INCIERTO: podría haberse confirmado antes
de perder la respuesta. No implica ausencia de ejecución. Reintentar únicamente
la misma clave y payload; nunca generar otra automáticamente. No hay consulta
pública de recibos ni persistencia cliente implementada en esta fase.

### Esquema privado del adaptador (nuevo; sin migración automática)

Todas las rutas financieras siguientes dependen de `iglesias/{iglesiaId}/`:

| Documento | Datos mínimos |
| --- | --- |
| finanzas_config/acceso | Contrato existente, sin cambios: moduloHabilitado, encargadoUid |
| finanzas_config/contabilidad | Configuración exacta FIN-3: versionEsquema, iglesiaId, moneda, escala, zonaHoraria |
| finanzas_cuentas/{id} | `{cuenta: CuentaFIN4}`; cuenta.id debe coincidir con el ID documental |
| finanzas_categorias/{id} | `{categoria: CategoriaFIN4}`; categoria.id debe coincidir con el ID documental |
| finanzas_control/libro | versionEsquema, iglesiaId, ultimaSecuencia, huboMovimientos |
| finanzas_control/periodo | versionEsquema, iglesiaId, periodosAbiertos (máximo uno, FIN-3) |
| finanzas_saldos/{cuentaId} | EstadoCuenta FIN-4 más versionEsquema y ultimaSecuencia de esa cuenta |
| finanzas_resumenes/{periodoId} | versionEsquema, iglesiaId, periodoId, ultimaSecuencia global y datos=calcularLibro del mes |
| finanzas_movimientos/{idServidor} | versionEsquema, iglesiaId, secuencia, estado confirmado, movimiento FIN-2, clasificacion, responsable, solicitudId, huella, descripcion, privado, precondiciones, fechaCreacion |
| finanzas_auditoria/{idServidor} | Evento gasto_registrado, responsable, movimientoId, solicitudId, secuencia y fechaCreacion; sin formulario ni aportante |

Recibo fuera de esas colecciones:
`operaciones_financieras/{uidAutenticado}/solicitudes/{solicitudId}`.
Contiene versionEsquema, uid, operacion, iglesiaId, solicitudId, huella, pertenenciaId,
movimientoId, estado confirmado, secuencia y fechaCreacion. No borrar por TTL:
su pérdida permitiría perder evidencia de idempotencia. No se guardan códigos,
credenciales ni datos del aportante. La huella SHA-256 cubre UID, operación y
payload completo con claves ordenadas; ausencia de descripcion difiere de una
descripcion suministrada. Clave reutilizada con otra iglesia/payload se rechaza.
No se comparte namespace con recibos de membresía.

ID de movimiento/auditoría: SHA-256 determinista, con dominio propio, UID,
iglesia y solicitudId. No hay generadores aleatorios ni contadores externos
dentro de callbacks reintentables. fechaCreacion/fechaActualizacion usan el
sentinel FieldValue.serverTimestamp dentro del commit; no reloj local.
Controles, saldos, resúmenes y catálogos envolventes conservan campos auxiliares;
la configuración monetaria FIN-3 conserva su estructura exacta.

Las reglas actuales, inspeccionadas sin modificarlas, niegan escrituras cliente
en rutas financieras y acceso cliente a recibos/controles/saldos/resúmenes por
denegación general. Solo acceso es legible dentro de finanzas_config según sus
reglas actuales. Esto no se ha vuelto a comprobar con emuladores en FIN-7A.
Admin SDK ignora reglas: el futuro callable debe ejecutar este protocolo, no
escrituras administrativas independientes. Ninguna colección pública recibe datos.

### Commit, verificación y límites

Cada intento lee recibo, actor, iglesia, titular, acceso, configuración, control
de libro, control de período, resumen y catálogos/libro/saldos completos antes de
escribir. Se valida autorización FIN-3 antes de consultar el libro. La versión
de acceso y pertenencia originales impiden actualizar silenciosamente una intención
tras revocación, transferencia o reingreso. Elegibilidad no concede autoridad.

El libro debe tener secuencias contiguas 1..N y concordar con el control.
calcularLibro FIN-2 reconstruye TODOS los saldos y el resumen del mes, incluidos
originales y contrapartidas. Se comparan saldos, historial, apertura y última
secuencia de CADA cuenta. Resumen existente incoherente, libro incompleto o saldo
adulterado bloquean; no se reparan. Un resumen ausente puede crearse solo desde
esa reconstrucción completa. No se admiten movimientos de meses posteriores al
período solicitado. La suficiencia se comprueba sobre saldo vigente total, no
como prohibición de saldo histórico diario negativo al retrofechar un gasto.

Se realiza un único commit de seis escrituras: movimiento nuevo, saldo de cuenta,
resumen mensual, control global, auditoría nueva y recibo nuevo. create impide
reemplazar historia. El control de período NO se modifica al registrar un gasto,
de modo que un gasto concurrente pueda reintentarse contra saldo actualizado;
un cierre futuro debe actualizar ese control y respetar el protocolo compartido.
La última secuencia global serializa gastos; genera contención por iglesia.

Límites fijos de este adaptador mínimo: 50 cuentas, 50 categorías, 50 saldos y
200 movimientos totales por iglesia. Consultas limitadas a máximo+1 detectan
truncamiento; al llegar a 200 se bloquean nuevas operaciones, no los recibos
históricos. El JSON agregado leído se limita a 2 MiB DESPUÉS de recibir snapshots;
no es un límite de transporte ni de memoria previa de Admin SDK. El número de
documentos sí está acotado (hasta 364 snapshots por intento, incluidos centinelas
y titular separado), y hay seis escrituras. Consultas vacías y reintentos también
tienen costo. No se promete escalabilidad: sustituir reconstrucción completa
requiere checkpoints/reconciliación verificados y otra fase de diseño/pruebas.
No hay consultas filtradas ni necesidad de índices compuestos nuevos.

### Garantías y pendientes

| Alcance | Estado FIN-7A |
| --- | --- |
| Gasto autorizado, pertenencia/versiones, no sobregiro concurrente | Implementado y probado con doble MVCC |
| Commit movimiento/saldo/resumen/control/auditoría/recibo | Implementado; falta validación en Firestore Emulator |
| Repetición/timeout después del commit y payload diferente | Implementado; misma intención/clave, sin nueva escritura |
| Verificación de saldos contra libro | Implementada con límites explícitos; sin reparación |
| Duplicados de códigos/aperturas/reversas existentes | Detectados en catálogos/libro completo; se bloquea el gasto |
| Altas y reservas de código, apertura única al crear, marcador de reversión | PENDIENTES: operaciones no implementadas, no garantías de escritura ofrecidas |
| Ingresos/aportantes, transferencias, ajustes, cierres | PENDIENTES: rechazados, sin persistencia parcial |
| Bootstrap, migraciones, lectura de contexto para cliente y endpoints | PENDIENTES, sin despliegue |

Todo escritor futuro de catálogos, saldos, períodos y libro deberá integrarse en
el mismo protocolo transaccional. No se garantiza consistencia frente a procesos
Admin externos que lo eludan, ni se sustituye la revisión de designaciones
históricas y migración de pertenencia. No se alteran contratos existentes de
configuración financiera o membresía.

Las pruebas usan un doble MVCC que verifica barrera lectura/escritura, consultas
con fantasmas, conflictos/reintentos y commit atómico; no ejercitan reglas, bloqueos
pessimistas, índices, timestamps ni límites reales del SDK/Firestore. Esa integración
con demo-fesync debe completarse antes de publicar cualquier endpoint.

## FIN-7C.1: altas y aperturas transaccionales

Esta ampliación del MISMO adaptador privado sustituye el alcance «solo gastos»
de FIN-7A para tres operaciones nuevas: `crearCuenta`, `crearCategoria` y
`apertura`. El contrato de gasto, su huella y la fórmula de sus IDs permanecen
compatibles. No se modifican FIN-2 a FIN-6, configuración de acceso, membresía,
reglas, Functions públicas, inicialización de Admin ni dependencias.

### Entradas estrictas y permisos

Se conserva `ejecutar({auth:{uid}, operacion, solicitud})`. Auth procede únicamente
del futuro contexto Firebase autenticado. Todas las solicitudes incluyen
versionEsquema=1, solicitudId persistente, iglesiaId, periodoId y precondiciones.
No se acepta actorUid/rol, ID de entidad, estado, saldo ni timestamps del cliente.

| Operación | Campos adicionales de solicitud | Precondiciones exactas | Permiso FIN-3 |
| --- | --- | --- | --- |
| crearCuenta | cuenta:{codigo,nombre,tipo} | pertenenciaId, acceso, iglesia, configuracion, controlPeriodo | administrarCatalogos |
| crearCategoria | categoria:{codigo,nombre,naturaleza,tipoIngreso} | pertenenciaId, acceso, iglesia, configuracion, controlPeriodo | administrarCatalogos |
| apertura | cuentaId, montoMinor, fechaContable; descripcion opcional | pertenenciaId, acceso, iglesia, cuenta, configuracion, controlPeriodo | registrarAjustes |

Las versiones son updateTime canónicos segundos:nanosegundos. pertenenciaId
es la precondición del período ORIGINAL de pertenencia. No se refrescan versiones
al reintentar, ni se usa elegibilidad como autoridad. Se exige en cada intento
transaccional perfil actual, titular coherente y módulo explícitamente habilitado.
FIN-3 concede ambos permisos administrativos solo al titular; encargado, líder
y servidor no pueden realizar estas operaciones. Para apertura se reutiliza
registrarAjustes porque es una operación patrimonial administrativa, sin inventar
un permiso nuevo o autorizar al encargado por registrarIngresosGastos.

Ejemplo de alta (el llamador conserva clave y precondiciones):

```js
const resultado = await adaptador.ejecutar({
  auth: { uid: request.auth.uid },
  operacion: 'crearCuenta',
  solicitud: {
    versionEsquema: 1, solicitudId: clavePersistida, iglesiaId,
    periodoId: '2026-10', precondiciones: contextoOriginal,
    cuenta: { codigo: 'BANCO', nombre: 'Banco', tipo: 'banco' },
  },
});
// {estado:'CONFIRMADA', historica:false, cuentaId: idDerivadoPorServidor}
```

Tipos de cuenta: caja/banco; CLP y escala cero se toman de configuración válida,
con estado inicial activa y saldo cero. Categorías: ingreso con tipoIngreso
diezmos/ofrendas/donaciones/otros, o gasto con tipoIngreso=null; activa al crear.
Se reutilizan crearCuenta/crearCategoria de FIN-4, incluidos códigos canónicos,
nombre, naturaleza y detección de duplicados del catálogo completo.
No se permite reabrir una cuenta archivada o editar una existente con estas altas.

Apertura exige monto entero seguro POSITIVO (cero no genera movimiento), fecha
real dentro del período abierto, cuenta activa, saldo cero, sin historial previo,
sin apertura y sin solicitudes inciertas. Se construye con crearApertura FIN-2 y
se verifica con validarAperturaCuenta FIN-4. No es ingreso ni categoría:
clasificacion={cuentaId,categoriaId:null,naturaleza:'patrimonial',tipoIngreso:null}.
La apertura modifica aperturasNetasMinor y saldo, nunca ingresosNetosMinor o
resultado operativo. El libro completo se reconstruye antes y después de proponerla.

### Reservas y atomicidad

Nuevos documentos privados bajo iglesias/{iglesiaId}:

| Ruta | Contenido mínimo |
| --- | --- |
| finanzas_reservas_cuentas/{codigo} | versionEsquema, iglesiaId, codigo, entidadId, fechaCreacion |
| finanzas_reservas_categorias/{codigo} | versionEsquema, iglesiaId, codigo, entidadId, fechaCreacion |
| finanzas_aperturas/{cuentaId} | versionEsquema, iglesiaId, cuentaId, movimientoId, secuencia, fechaCreacion |

Se leen antes de escribir y se crean con precondición de ausencia. No hay rutas
cliente nuevas: la denegación general existente impide get/list y escritura SDK
cliente en estas rutas. El emulador verificó denegación get al administrador.
No se borran reservas ni marcadores para reutilizar códigos o abrir otra vez.
Si un catálogo legado tiene código sin reserva, FIN-4 también impide duplicarlo;
no se crean reservas retrospectivas. Una apertura histórica sin marcador sigue
bloqueada por el libro, aperturaRegistrada y huboMovimientos. Documentos
incoherentes se rechazan; no hay reparación ni adopción silenciosa.

| Operación | Escrituras del MISMO commit |
| --- | --- |
| crearCuenta | Cuenta, reserva, saldo cero, resumen del período, control global, auditoría y recibo: 7 |
| crearCategoria | Categoría, reserva, control global, auditoría y recibo: 5 |
| apertura | Movimiento, saldo, resumen, control global, auditoría, recibo y marcador: 7 |

Las altas no incrementan ultimaSecuencia monetaria ni crean movimientos.
Actualizan fechaActualizacion del control global leído para serializar límites
de catálogo y proyecciones frente a otras altas, aperturas y gastos. Las altas
de cuenta incorporan su saldo cero al mapa del resumen actual: no adulteran
historia, no alteran resúmenes de otros meses y no dejan una proyección que
bloquee el gasto siguiente. Resumen existente incorrecto se rechaza antes.
Se requiere el único período abierto incluso para altas, como restricción
conservadora V1. Bootstrap de configuración/control de período sigue pendiente.

Todas las lecturas preceden las escrituras. Validadores, reconstrucción y
sentinels no generan efectos externos; cualquier error aborta el commit entero.
Se conserva la política RESULTADO_INCIERTO y reintento con la MISMA intención.
No hay una escritura posterior para completar reservas, auditoría o saldos.

### Recibos e historia

Se conserva operaciones_financieras/{uid}/solicitudes/{solicitudId}. La huella
canónica incluye UID, tipo y payload original completo. La clave no se puede
reutilizar con diferente nombre/código/monto/iglesia/operación/contexto.
Las tres operaciones nuevas usan IDs SHA-256 con dominio propio por operación;
el dominio de gasto permanece finanzas-gasto-v1. No hay aleatoriedad dentro
de callbacks reintentables ni IDs de entidad arbitrarios desde cliente.

Recibos de altas usan operacion=crearCuenta/crearCategoria y secuencia=null;
movimientoId conserva su nombre interno pero representa el ID de entidad, NO
un movimiento monetario. Se valida recibo y entidad correspondiente antes de
devolver {estado:'CONFIRMADA',historica:true,cuentaId|categoriaId}. Recibos de
apertura usan operacion=apertura, movimientoId y secuencia monetaria positiva,
igual que su respuesta. No se renuevan autorizaciones por una confirmación
histórica propia; la repetición no escribe ni reaplica una apertura.

Auditorías de alta guardan evento, responsable, entidadId, solicitudId y fecha,
sin copiar el formulario. Apertura usa apertura_registrada y los campos de
trazabilidad de gasto. Se mantiene lectura financiera autorizada FIN-7B.1 y
ninguna escritura cliente. Recibos siguen privados incluso para el titular.

### Validación y límites FIN-7C.1

- npm.cmd test: 1.181 aprobadas, 0 fallidas, 0 omitidas. Suite del adaptador:
  120 pruebas frente a 78 anteriores (incremento neto 42; incluye ajuste de
  expectativas de operaciones ahora implementadas).
- Firestore Emulator demo-fesync, ejecutor protegido existente: 67 aprobadas,
  0 fallidas, 0 omitidas (55 escenarios integrados, 11 guardas y 1 verificador
  de regresiones). Incluye 18 escenarios integrados nuevos.
- Regresiones financieras existentes: 46 aprobadas, 0 fallidas, ejecutadas
  secuencialmente en el mismo emulador y contabilizadas aparte.
- node --check sobre JS afectados. No hubo fallos funcionales en esta fase.

Se observaron carreras reales de códigos duplicados y aperturas de una misma
cuenta: solo una operación confirmó. Atomicidad se verificó con updateTime común
en los siete documentos de apertura y en la cuenta/reserva/saldo/resumen de un
alta. Timeout posterior al commit y errores de SDK fueron inyectados; no se
presentan como fallos naturales de red o proceso. No se demuestra concurrencia
exhaustiva. El doble MVCC mantiene comprobación de lecturas antes de escrituras.

Permanecen 50 cuentas, 50 categorías, 50 saldos, 200 movimientos por iglesia,
16 KiB de solicitud y 2 MiB agregados de snapshots después de recibidos.
La nueva reserva añade como máximo una lectura a la cota anterior (hasta 365
snapshots incluyendo centinelas). La contención global y la reconstrucción
completa siguen siendo límites deliberados; no se retiraron para facilitar pruebas.
Las altas se bloquean al llegar a su cupo; las aperturas consumen un movimiento
de los 200. Replay histórico no consume cupos ni secuencias.

Pendientes: persistencia de ingresos, edición/archivado/eliminación, transferencias,
ajustes ordinarios, reversas/marcadores, cierres/reapertura, migración/bootstrap,
obtención pública de contexto, endpoints e integración Flutter. Edición y archivo
se rechazan como OPERACION_NO_IMPLEMENTADA: no se ofrece una implementación
parcial que pueda alterar códigos o naturalezas históricas. Admin SDK externo
puede eludir reglas; todo futuro escritor debe compartir este protocolo.
No hay despliegue ni autorización para producción.

## FIN-7C.2: ingresos transaccionales privados

`adaptador.ejecutar({auth:{uid}, operacion:'ingreso', solicitud})` añade persistencia
de ingresos reutilizando prepararIngreso de FIN-5, la política FIN-3 y el mismo
protocolo transaccional del gasto. No modifica los contratos de gasto, altas o
apertura ni los módulos puros. Sin endpoints, nuevas reglas o cambios de cliente.

### Solicitud y autorización

La solicitud exige exactamente versionEsquema=1, solicitudId, iglesiaId,
cuentaId, categoriaId, montoMinor, fechaContable, periodoId y precondiciones.
Admite descripcion opcional (contrato FIN-5) y aportante opcional. Las
precondiciones son las mismas de gasto: pertenenciaId original y versiones
updateTime canónicas acceso, iglesia, cuenta, categoria, configuracion y
controlPeriodo. Se mantienen invariables en todos los reintentos.

```js
const resultado = await adaptador.ejecutar({
  auth: { uid: request.auth.uid }, // exclusivamente contexto Auth verificado
  operacion: 'ingreso',
  solicitud: {
    versionEsquema: 1, solicitudId: clavePersistida,
    iglesiaId, cuentaId, categoriaId, montoMinor: 10000,
    fechaContable: '2026-10-17', periodoId: '2026-10',
    precondiciones: contextoOriginal,
    // aportante omitido o null: ingreso anónimo; no requiere cuenta Auth.
  },
});
```

Solo cuenta activa CLP/0 y categoría activa de naturaleza ingreso, con
tipoIngreso diezmos/ofrendas/donaciones/otros según el catálogo observado en
transacción. Fecha válida en el único período abierto, monto entero seguro
estrictamente positivo y esquema/configuración vigentes. No se acepta moneda
arbitraria, saldo, actorUid, rol, IDs de movimiento o campos desconocidos.

FIN-3 exige permiso registrarIngresosGastos con documentos reales leídos en cada
intento: titular coherente o encargado vigente, pertenencia actual coincidente
con la intención original y módulo explícitamente habilitado. Rol de líder o
servidor solo no concede permiso; elegibilidad no es autoridad. Revocación,
desvinculación, transferencia o versión cambiada no refrescan la intención.

### Aportante y privacidad

Si se suministra aportante, solo se permite `{nombre}`: texto NFC, recortado,
sin caracteres de control y de 1..120 puntos de código. Null u omisión permiten
ingreso anónimo. No se aceptan correo, RUT, UID, teléfono, dirección ni formularios
libres. Esa validación ocurre antes de canonicalizar/capturar la entrada para
evitar getters o estructuras no válidas; FIN-5 la vuelve a validar al preparar.

El nombre se conserva únicamente en movimiento.privado.aportante, dentro de la
colección financiera privada. No se copia a asientos, saldos, resúmenes, auditoría,
perfiles, recibos ni respuesta; el adaptador no registra logs. El recibo privado
contiene la huella SHA-256 del payload completo, no el nombre en claro. No existe
una copia pública del recibo. Nombres de aportantes no son necesarios para
reconstruir el libro o calcular resultados.

Las reglas financieras existentes permiten leer movimientos y auditoría a los
responsables vigentes con módulo habilitado; NO proporcionan confidencialidad
del aportante frente a esos responsables. Recibos/saldos/resúmenes permanecen
denegados por SDK cliente según el esquema actual. No hay nuevas rutas públicas.
La prueba real compara documentos persistidos y lecturas SDK autorizadas/no
autorizadas; no afirma retirar información previamente descargada en un equipo.

### Commit, idempotencia y límites

Ingreso crea seis escrituras en el MISMO commit: movimiento FIN-2 positivo,
saldo actualizado, resumen mensual, control global, evento ingreso_registrado y
recibo privado. Todas las lecturas preceden a escrituras. El control compartido
serializa la secuencia y obliga a recalcular saldos tras conflictos, evitando
perder deltas de dos ingresos simultáneos. Se verifica el libro completo y todas
las proyecciones previas antes de aplicar el cambio. Sumas de saldo, resultados
y consolidado usan los helpers seguros y rechazan desbordamiento, sin redondeos.
Aperturas existentes siguen siendo patrimoniales, nunca ingresos operativos.

La huella canónica incluye operación ingreso, actor autenticado y payload
original completo, incluido aportante si existe. Su ID usa el dominio servidor
finanzas-ingreso-v1; no cambia dominios/IDs de operaciones anteriores. Repetición
confirmada devuelve la historia propia con el mismo movimientoId y secuencia,
sin escribir. Misma clave con monto, descripción, nombre, contexto o naturaleza
de operación distintos se rechaza. Omitir aportante y suministrar null son
payloads distintos: el llamador conserva la representación original.

Timeout posterior al commit o error de transporte mantienen RESULTADO_INCIERTO:
no significan operación ausente ni autorizan otra clave. Un callback reintentado
no notifica, envía FCM, genera IDs aleatorios ni produce otros efectos externos.
La futura integración cliente debe persistir la misma intención hasta reconciliarla.

Se conservan límites: 50 cuentas, 50 categorías, 50 saldos y 200 movimientos por
iglesia; 16 KiB por solicitud y 2 MiB de snapshots agregados después de recibidos.
Cada ingreso consume un movimiento del cupo total junto a gastos y aperturas;
al alcanzar 200 se bloquean operaciones nuevas, pero no replay de recibos. No se
introducen paginación parcial del libro, nuevos índices ni escalabilidad implícita.
Permanecen contención del control global y costo de reconstrucción completa.

Transferencias, reversas, edición/archivo, cierres y demás operaciones pendientes
no se habilitan. No se modificaron configuración de acceso, membresía, migración
demo, roles, Flutter ni reglas. No hay autorización de despliegue o producción.

### Validación FIN-7C.2

| Validación | Aprobadas | Fallidas / omitidas |
| --- | --- | --- |
| npm.cmd test desde functions | 1.224 | 0 / 0 |
| Suite del adaptador incluida en Node | 163 | 0 / 0 |
| Ejecutor financiero protegido con Firestore Emulator demo-fesync | 87 | 0 / 0 |
| Regresiones existentes de reglas financieras, ejecutadas secuencialmente | 46 | 0 / 0 |
| node --check de JS afectados | Correcto | Sin errores |

Incremento neto Node: 43 frente a FIN-7C.1 (44 escenarios nuevos y eliminación de
la expectativa histórica «ingreso no implementado»). El ejecutor suma 20 casos
integrados nuevos: 75 escenarios integrados, 11 guardas puras y 1 verificador
de regresiones; las 46 reglas hijas se cuentan por separado, no dentro de esos 87.

Con Admin SDK y snapshots reales se observó updateTime común en los seis
documentos del commit para cada tipo de ingreso, acumulación correcta de dos
ingresos simultáneos, replay sin escrituras, respuesta perdida tras commit y
rechazo sin cambios parciales ante validación fallida del SDK. La reconstrucción
desde el libro coincide con saldos y resumen. Se verificó nombre del aportante
solo en movimiento privado y recibos denegados incluso a responsables financieros.
Se preservaron regresiones de gastos, catálogos, aperturas y auditoría autorizada.

La pérdida de respuesta, ABORTED y error SDK son inyecciones identificadas en las
pruebas. La transferencia administrativa se intercala antes de la primera lectura
del callback para comprobar un orden concreto; el doble MVCC también verifica
invalidación tras conflicto. No se demuestra concurrencia exhaustiva ni todos los
órdenes de transferencia/locks, caídas del proceso o particiones de red. No hubo
fallos de pruebas ni reejecuciones para ocultarlos en FIN-7C.2. La salida SIGINT al
apagar Firestore Emulator corresponde a su cierre normal por la CLI.

## FIN-7C.3A: transferencias internas persistentes

El adaptador privado admite `operacion: 'transferencia'`. Reutiliza
`prepararTransferencia` de FIN-6 y el permiso `transferir` de FIN-3, sin endpoints
nuevos ni cambios de reglas. Ejemplo del contrato (las versiones deben proceder
de los snapshots originales; `auth` procede del contexto autenticado del futuro
adaptador de transporte, nunca de un payload cliente):

```js
await adaptador.ejecutar({
  auth: { uid: uidAutenticado },
  operacion: 'transferencia',
  solicitud: {
    versionEsquema: 1, solicitudId, iglesiaId,
    fechaContable: '2026-10-17', periodoId: '2026-10',
    origenId: 'caja', destinoId: 'banco', montoMinor: 4000,
    precondiciones: {
      pertenenciaId, acceso: versionAcceso,
      iglesia: versionIglesia, configuracion: versionConfiguracion,
      controlPeriodo: versionPeriodo,
      cuentas: [
        { cuentaId: 'caja', version: versionCaja },
        { cuentaId: 'banco', version: versionBanco },
      ],
    },
  },
});
```

No se aceptan categoriaId, aportante, descripcion, saldos, actorUid ni campos
adicionales. Las dos cuentas deben ser distintas, activas, CLP y de la iglesia
indicada; deben coincidir sus versiones originales. El origen debe disponer del
monto completo, sin sobregiro ni solicitudes inciertas en cualquiera de las
cuentas. Se exige pertenencia vigente, designacion financiera o titularidad
coherente, habilitacion explicita y periodo abierto; las versiones no se
refrescan silenciosamente ante un conflicto. Elegibilidad no es autorizacion.

Un movimiento `clase: 'transferencia'` contiene dos asientos opuestos, con suma
cero, `clasificacion: null`, `descripcion: null` y `privado.aportante: null`.
No incrementa ingresos, gastos ni resultado operativo; conserva el consolidado.
Sus siete documentos se confirman juntos: movimiento, ambos saldos, resumen,
control global, evento `transferencia_registrada` y recibo privado. Las lecturas
de autorizacion, catalogos, saldos y libro preceden a todas las escrituras. Se
reconstruye el libro completo y se rechazan controles/proyecciones incoherentes,
sumas inseguras y desbordamientos, incluso en destino y consolidado.

El ID determinista usa el dominio `finanzas-transferencia-v1`, fuera del callback
reintentable. La huella canonica incluye operacion, actor y payload original
completo. Misma clave y payload confirmado devuelve la historia sin escrituras;
payload diferente se rechaza. El replay historico no concede autorizacion actual.
Tras `RESULTADO_INCIERTO`, el llamador conserva solicitudId y payload para
reconciliar: no crea otra intencion automaticamente. No hay FCM, notificaciones,
aleatoriedad ni otros efectos externos dentro de la transaccion.

Permanecen los limites de 50 cuentas, 50 categorias, 50 saldos, 200 movimientos,
16 KiB de solicitud y 2 MiB de snapshots agregados recibidos. Una transferencia
consume un movimiento del cupo total; el replay confirmado no consume otro.
La serializacion por control global evita perder deltas entre transferencias y
gastos que siguen este protocolo; no cubre otros escritores Admin que lo eludan.
No se habilitan reversas, ajustes persistentes, edicion/archivo ni cierres.
Recibos siguen denegados a SDK cliente; auditoria conserva lectura restringida
a responsables vigentes segun las reglas existentes. No hay cambio de privacidad,
persistencia cliente, interfaz, membresia ni herramienta de migracion de Work.

### Validacion FIN-7C.3A

Las pruebas unitarias modelan conflictos MVCC, cambio de titularidad, versiones,
fondos limitados y desbordamientos. La integracion usa Admin SDK, snapshots,
timestamps y commits reales exclusivamente en Firestore Emulator `demo-fesync`.
La perdida de respuesta, ABORTED y el error SDK previo al commit se inyectan de
forma identificada; no representan cortes reales de red o caidas del proceso.
Las carreras con otra transferencia y con un gasto demuestran los ordenes
observados, no concurrencia exhaustiva. El cambio de titularidad real se prueba
antes de la lectura de autorizacion; el doble MVCC cubre su conflicto posterior.
Esto no autoriza despliegue ni acredita seguridad global de notificaciones.

| Validacion | Aprobadas | Fallidas / omitidas |
| --- | --- | --- |
| npm.cmd test desde functions | 1.266 | 0 / 0 |
| Suite del adaptador incluida en Node | 205 | 0 / 0 |
| Ejecutor financiero protegido demo-fesync | 111 | 0 / 0 |
| Reglas financieras, ejecutadas secuencialmente | 46 | 0 / 0 |
| node --check de los tres JS afectados | Correcto | Sin errores |

Incremento neto Node: 42 (43 casos nuevos y retiro de la expectativa anterior de
transferencia no implementada). El ejecutor suma 24 escenarios nuevos: ahora
99 escenarios integrados, 11 guardas puras y 1 verificador de regresiones; las
46 reglas hijas se cuentan por separado. No hubo fallos ni reejecuciones de
suites para ocultarlos. SIGINT al terminar corresponde al cierre del emulador.

## FIN-7C.3B: anulaciones por reversion y ajustes patrimoniales

El adaptador privado añade `operacion: 'reversion'` y `operacion: 'ajuste'`.
Reutiliza `prepararReversion` / `prepararAjuste` de FIN-6 y los permisos FIN-3
`anularMovimientos` / `registrarAjustes`: exclusivamente administrador titular
coherente con pertenencia vigente y modulo habilitado. El encargado no tiene
estos permisos. No hay callable, persistencia cliente ni cambios en reglas.

### Contratos de entrada

Se conserva `ejecutar({ auth: { uid }, operacion, solicitud })`: `auth` debe
proyectarse de Firebase Auth en el futuro transporte servidor, nunca del cliente.
Ambas solicitudes requieren versionEsquema 1, solicitudId persistente, iglesiaId,
fechaContable, periodoId, motivo y referenciaAuditoria. Motivo: texto NFC sin
controles, sin espacios externos, de 1..240 puntos de codigo y hasta 480 unidades
UTF-16. ReferenciaAuditoria es un identificador de trazabilidad, NO prueba de
autorizacion ni orden de editar otro documento. No se infieren IDs ni versiones.

Ejemplos de los payloads adicionales a ese contexto comun:

```js
// Ajuste patrimonial: deltaMinor entero seguro, distinto de cero.
const ajuste = {
  ...contextoComun, cuentaId: 'caja', deltaMinor: -1000,
  precondiciones: {
    ...versionesComunes,
    cuentas: [{ cuentaId: 'caja', version: versionCaja }],
  },
};
// Anulacion: el ID solo selecciona el original; el servidor acredita su estado.
const reversion = {
  ...contextoComun, originalId,
  precondiciones: {
    ...versionesComunes,
    cuentas: cuentasOriginales.map(c => ({ cuentaId: c.id, version: c.version })),
    original: { version: versionMovimientoOriginal, versionReversion: null },
  },
};
// versionesComunes = { pertenenciaId, acceso, iglesia, configuracion, controlPeriodo };
// Versiones: updateTime original canonico segundos:nanosegundos.
```

Ajuste no acepta montoMinor, categoria, aportante o saldo. Reversion no acepta
asientos, cuenta alternativa, marcas de confirmacion ni IDs de movimiento nuevo.
Se rechazan campos extra, getters y estructuras ambiguas antes de canonicalizar.
Las precondiciones de cuentas cubren exactamente las cuentas del original real;
no se eligen cuentas a debitar a partir de una lista cliente incompleta. Un
marcador ausente tiene versionReversion null; cualquier marcador existente o
contrapartida ya presente en el libro bloquea otra solicitud de anulacion.

### Libro, periodos y marcador unico

FIN-6 solo permite originales confirmados de ingreso, gasto o transferencia,
sin reversaDe. Se conserva su documento y updateTime sin editarlo. La nueva
contrapartida conserva su clase y clasificacion, con `reversaDe: originalId` y
asientos exactamente opuestos. No existe una clase economica nueva llamada
reversion. Original y contrapartida se cuentan una vez cada uno; no se excluye
ni vuelve a descontar el original por un estado de anulacion.

Se puede anular un original de mes cerrado en el unico mes abierto, con fecha
igual o posterior al original. No se reescriben el original ni el resumen del
mes cerrado. El mes abierto recibe el efecto contrario (por ejemplo, gasto
neto negativo por la anulacion de un gasto anterior). El libro completo permite
acreditar el original aunque no pertenezca al mes consultado.

El nuevo documento privado
`iglesias/{iglesiaId}/finanzas_reversiones/{originalId}` contiene versionEsquema,
iglesiaId, originalId, versionOriginal, versionControlAnterior (null), reversionId,
secuencia y fechaCreacion de servidor. Se lee antes de escribir y se crea con
precondicion de inexistencia en el MISMO commit. Una reversa de una cuenta
confirma siete documentos; una de transferencia, ocho: marcador, contrapartida,
uno/dos saldos, resumen, control, auditoria y recibo. Otra clave para ese original
se rechaza, incluso tras un conflicto transaccional. Una marca huerfana bloquea
la operacion; no se corrigen inconsistencias automaticamente. El libro tambien
rechaza contrapartidas duplicadas aunque falte una marca.

Los ajustes confirman seis documentos: movimiento, saldo, resumen, control,
auditoria y recibo. Clase ajuste, clasificacion null: sus deltas se acumulan en
ajustesNetosMinor; nunca son ingreso/gasto ni alteran resultado operativo.
Ajuste negativo y toda contrapartida debitora exigen saldo suficiente. Las cuentas
deben seguir activas, sin solicitudes inciertas y con moneda CLP/escala cero.
Se reconstruyen libro y proyecciones, validando limites y aritmetica segura.

### Privacidad, idempotencia y limites

Motivo y referencia se conservan solamente en `movimiento.privado`, junto a
aportante null. No se copian a resúmenes, saldos, auditoria, recibos, perfiles o
respuesta. Auditoria registra `reversion_registrada` (incluye originalId) o
`ajuste_registrado`, responsable, solicitud y secuencia. Las reglas existentes
permiten leer movimientos y auditoria a responsables financieros autorizados;
el motivo NO es confidencial frente a esos responsables. Recibos y marcadores
permanecen denegados al SDK cliente, incluso al titular; no hay copias publicas.

IDs deterministas en dominios `finanzas-reversion-v1` / `finanzas-ajuste-v1` y
huella canonica del payload original completo, sin modificar dominios previos.
Repeticion confirmada con igual clave/payload devuelve historia sin escrituras;
cambio de motivo, contexto, naturaleza u otro parametro rechaza el recibo.
Confirmacion historica no concede autoridad vigente. Ante RESULTADO_INCIERTO,
conservar la misma solicitud: no demuestra ausencia ni habilita una clave nueva.

Todos los documentos vigentes se leen dentro del intento transaccional antes
de cualquier escritura. No hay efectos externos, FCM, aleatoriedad o escrituras
posteriores al commit. Permanecen 50 cuentas, 50 categorias, 50 saldos y 200
movimientos totales; 16 KiB de solicitud y 2 MiB de snapshots agregados recibidos.
Cada contrapartida/ajuste ocupa un movimiento: al llegar a 200 tampoco se puede
anular con otra clave, pero el replay confirmado sigue disponible. El limite es
una restriccion operativa pendiente de resolver antes de produccion, no un cierre
contable automatico. No se implementan eliminacion, archivo, reapertura o cierre.

La atomicidad y la unicidad requieren que todos los futuros escritores Admin
sigan este protocolo; Admin SDK no queda restringido por Security Rules. No se
afirma concurrencia exhaustiva ni disponibilidad ante toda particion de red.

### Evidencia y limites de las pruebas FIN-7C.3B

La suite Node completa obtuvo 1.337 aprobadas, cero fallidas u omitidas. Incluye
276 del adaptador: incremento neto de 71 respecto de FIN-7C.3A (73 casos nuevos
y retiro de dos expectativas de operaciones antes no implementadas).

La primera ejecucion integrada obtuvo 145 aprobadas, una fallida y cuatro
omitidas por la parada ante fallo. Causa comprobada en la prueba de falta de
saldo: el ajuste previo y la posterior reversa compartian accidentalmente la
misma solicitudId. El rechazo RECIBO_NO_COINCIDE fue correcto. Se corrigio solo
la prueba usando una clave distinta para la nueva intencion de reversa, sin
modificar el adaptador para eludir la validacion. Las regresiones de reglas no
se ejecutaron en esa primera pasada. Tras esa correccion, una segunda ejecucion
completa obtuvo 150 aprobadas, cero fallidas y cero omitidas, incluyendo todos
los escenarios detenidos anteriormente; las 46 regresiones de reglas tambien
aprobaron sin fallos u omisiones. No se realizaron reintentos ciegos de pruebas.

Las pruebas integradas comparan updateTime de todos los documentos del commit y
del original sin cambios, reconstruyen saldos/resumen desde el libro y verifican
SDK cliente bajo reglas reales. Pérdida de respuesta, ABORTED y error SDK son
inyecciones explicitas; las carreras de solicitudes usan transacciones reales.
Los dobles MVCC modelan ademas cambio de titularidad durante el intento; la
integracion prueba cambio de titularidad antes de ejecutar la correccion. No
se demuestra toda intercalacion posible ni recuperacion durable de un cliente.

| Validacion final | Aprobadas | Fallidas / omitidas |
| --- | --- | --- |
| npm.cmd test desde functions | 1.337 | 0 / 0 |
| Suite del adaptador, incluida en Node | 276 | 0 / 0 |
| Ejecutor financiero demo-fesync | 150 | 0 / 0 |
| Reglas financieras, secuenciales | 46 | 0 / 0 |
| node --check de los tres JS afectados | Correcto | Sin errores |

El ejecutor contiene 138 escenarios integrados, 11 guardas puras y un
verificador de regresiones. Son 39 escenarios nuevos respecto de FIN-7C.3A;
las 46 reglas hijas se cuentan aparte. SIGINT al cerrar el emulador es su
apagado normal por la CLI. No se utilizaron servicios Firebase reales.

## FIN-7C.4B: proyecciones incrementales puras

`proyecciones.js` exporta tres funciones deterministas, sin Firebase, reloj,
generacion de IDs, hashes, checkpoints ni estado mutable de modulo:

| API | Entrada | Salida |
| --- | --- | --- |
| crearProyeccionInicial | iglesiaId, configuracion monetaria explicita, periodoId | Agregado vacio, revision 0, ultimoMovimientoId null |
| crearSaldoInicial | iglesiaId, cuentaId, periodoId | Cuenta sin movimientos, saldos cero y referencia null |
| proyectarMovimiento | estadoAnterior, cuentasAnteriores, movimiento, original, aplicacion | estado, cuentas afectadas, controlReversion o null |

Son tipos nuevos de calculo en memoria, versionEsquema 1; NO cambian esquemas
Firestore, configuracion FIN-3 ni el adaptador actual. Los objetos y arrays
devueltos estan congelados; no se conservan referencias mutables a las entradas.
No se guardan movimientos anteriores dentro de la proyeccion.

### Estado y ejemplo

El estado contiene iglesiaId, configuracion {moneda, escala, zonaHoraria},
revision, ultimoMovimientoId, acumulado y periodo. Se exige CLP/escala cero y
zona valida explicita. Cada agregado tiene saldoInicialMinor, saldoFinalMinor,
ingresosNetosMinor, gastosNetosMinor, resultadoMinor, aperturasNetasMinor y
ajustesNetosMinor; periodo tambien contiene periodoId. El saldo inicial del
acumulado de todo el libro es cero. El del mes incluye los movimientos previos.

Cada cuenta contiene versionEsquema, iglesiaId, cuentaId, periodoId, revision,
ultimoMovimientoId, saldoMinor global, saldoInicialPeriodoMinor y
saldoFinalPeriodoMinor. Solo se suministran y devuelven las 1..2 cuentas
afectadas, con referencias de revision localmente coherentes con el agregado.
Las revisiones de cuentas no afectadas no se actualizan y pueden tener huecos.

```js
const { crearIngreso } = require('./asientos');
const { crearProyeccionInicial, crearSaldoInicial, proyectarMovimiento } = require('./proyecciones');
const configuracion = { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' };
const estadoAnterior = crearProyeccionInicial({ iglesiaId: 'iglesia', configuracion, periodoId: '2026-10' });
const caja = crearSaldoInicial({ iglesiaId: 'iglesia', cuentaId: 'caja', periodoId: '2026-10' });
const movimiento = crearIngreso({ id: 'movimiento-explicito', fechaContable: '2026-10-17', periodoId: '2026-10',
  cuenta: { id: 'caja', moneda: 'CLP', escala: 0 }, montoMinor: 10000, configuracion });
const propuesta = proyectarMovimiento({ estadoAnterior, cuentasAnteriores: [caja], movimiento, original: null,
  aplicacion: { revisionAnterior: 0, revisionNueva: 1, movimientoId: movimiento.id } });
// propuesta.estado.periodo.resultadoMinor === 10000
// propuesta.cuentas[0].saldoMinor === 10000
```

El movimiento es el objeto FIN-2 exacto, por ejemplo `plan.movimiento` de FIN-5,
FIN-6 o la envoltura privada del adaptador. No se recibe el formulario, Auth,
aportante, motivo ni documento Firestore completo. Para una reversa, original
es obligatorio: {movimiento: originalReal, revision: revisionOriginal,
reversionId: null}. La revision debe acreditar una aplicacion anterior y las
cuentas deben haber observado al menos esa revision. Un marcador no nulo
rechaza otra reversa. La salida propone {originalId, revisionOriginal,
reversionId}; NO confirma ni persiste un marcador.

### Equivalencia y periodos

Se reutilizan validarMovimiento y calcularLibro de FIN-2: para un movimiento
normal, el delta se obtiene del libro aislado [movimiento]; para una reversa,
de [original, reversa] menos [original]. Esos conjuntos tienen como maximo dos
movimientos. No se suman subtotales de paginas ni se recorre el libro anterior.
La clasificacion y los signos economicos proceden de FIN-2, sin otra tabla de
formulas para ingreso, gasto, apertura, ajuste o transferencia.

El estado nuevo agrega esos deltas al anterior mediante aritmetica exacta y
comprueba enteros seguros en agregados y cuentas. Se verifica:

```text
resultado = ingresosNetos - gastosNetos
saldoFinal = saldoInicial + ingresosNetos - gastosNetos + aperturasNetas + ajustesNetos
```

Transferencia: cambia dos saldos, sin cambiar consolidado o resultado.
Apertura/ajuste: patrimonio, sin resultado ordinario. Reversa: la clase sigue
siendo la original, con asientos opuestos; no se excluye el original ademas
de aplicar su contrapartida. En otro mes, la contrapartida cambia los netos
de ese mes sin quitar el efecto del original del saldo inicial.

El periodo consultado es fijo y explicito: movimientos anteriores actualizan
sus saldos inicial/final, los del mismo mes tambien sus netos, y los posteriores
solo el acumulado global. Esto reproduce la semantica de calcularLibro, NO
autoriza escribir en meses cerrados. No se cambia el periodo de una proyeccion
existente: otro periodo requiere su propio estado y reconstruccion o base
acreditada futura; cambiar solo la etiqueta de un resumen no lo convierte.

Como FIN-2, esta capa matematica admite saldos negativos; el no sobregiro sigue
siendo una precondicion financiera de FIN-5/FIN-6 y del futuro adaptador.
Las reversas admitidas se restringen a ingreso, gasto y transferencia conforme
a FIN-6; apertura, ajuste y reversa de reversa se rechazan. No se modifica la
capacidad matematica mas amplia de FIN-2 ni ninguno de sus contratos.

### Aplicacion unica y frontera de confianza

aplicacion requiere revisionAnterior, revisionNueva y movimientoId explicitamente
aportados: nueva = anterior + 1, anterior coincide con el estado e ID coincide
con el movimiento. Revision vencida, salto, referencia incoherente o ID de la
ultima aplicacion repetido se rechazan. Revision inicial 0 significa vacio,
no una secuencia o timestamp de servidor inventados. La equivalencia no acepta
estados incompletos, campos extra, accesores, moneda incorrecta ni desbordamientos.

Recalcular sobre el MISMO estado devuelve la MISMA propuesta sin mutarlo.
Aplicar la misma revision al estado resultante se rechaza. Esto no es un recibo
idempotente persistente: un llamador que omita historia y suministre una revision
nueva con una observacion falsa no queda autenticado por esta biblioteca.
Unicidad de IDs antiguos, marcadores de reversa, apertura unica, pertenencia,
permisos, periodos abiertos y concurrencia necesitan documentos vigentes y
transacciones posteriores. La igualdad local de agregados tampoco acredita
la suma de todas las cuentas no suministradas ni integridad/procedencia historica.

No hay nueva persistencia, integracion V2, conciliacion o eliminacion de limites.
Se conservan 50/50/200 en el adaptador, asi como archivos de Work, reglas y Flutter.

### Validacion FIN-7C.4B

98 pruebas nuevas: operaciones y reversas, propuestas reales FIN-5/FIN-6,
periodos distintos, estados invalidos, referencias, congelacion, determinismo,
limites y desbordamientos. Cuatro semillas fijas y tres periodos comparan cada
prefijo de secuencias mixtas contra el libro completo (93 movimientos por
secuencia); otro caso procesa 1001 movimientos ficticios exclusivamente en memoria.
No se encontraron diferencias matematicas en los casos admitidos comparados.

Una primera ejecucion se detuvo por un error de sintaxis en el archivo nuevo,
corregido antes de ejecutar los escenarios. La suite nueva posterior aprobo
96 casos; se añadieron dos casos FIN-5 y se ejecuto la suite Node completa:
1.435 aprobadas (98 nuevas y 1.337 regresiones), cero fallidas u omitidas.
node --check correcto para ambos archivos nuevos. No se ejecutaron emuladores;
150 integradas y 46 reglas son evidencias anteriores, no reejecutadas aqui.

## FIN-7C.4C: conciliador historico paginado de solo lectura

`conciliacion.js` exporta `conciliarPaginas`, `VERSION_ALGORITMO = 1` y LIMITES.
Es logica pura: recibe observaciones, sin importar Admin SDK, lector remoto,
sistema de archivos, reloj, credenciales o generadores. No tiene escrituras,
endpoints, reparaciones, hashes retrospectivos ni modificacion del libro.

### Contrato explicito de observaciones V1

```js
const resultado = conciliarPaginas({
  contexto: {
    iglesiaId, configuracion: { moneda: 'CLP', escala: 0, zonaHoraria: 'America/Santiago' },
    cuentas: [{ id: 'caja', moneda: 'CLP', escala: 0 }],
    periodos: ['2026-10', '2026-11'],
    controlInicial: { version: versionControlInicial, datos: datosControlLibroV1 },
    modoLectura: 'BEST_EFFORT', // O PAUSA_EXTERNA_DECLARADA, nunca verificada aqui.
  },
  checkpoint: null, // En reanudacion: resultado anterior, completo y sin modificar.
  paginas: [pagina1, pagina2],
  finDelListado: true,
  controlFinal: { version: versionControlFinal, datos: datosControlLibroFinalV1 },
  proyecciones: {
    corte: { secuencia: secuenciaDelCorte, versionControl: versionControlInicial },
    saldos: [{ cuentaId: 'caja', datos: datosSaldoV1 }],
    resumenes: [{ periodoId: '2026-10', datos: datosResumenV1 }],
    marcadores: [{ originalId, datos: datosMarcadorReversionV1 }],
  },
});
```

Cada documento de una pagina tiene `{id, version, datos}`. datos es la envoltura
V1 real: versionEsquema, iglesiaId, secuencia, estado confirmado, movimiento
FIN-2 y clasificacion cuando exista. Version procede de updateTime observado,
en formato canonico segundos:nanosegundos. La biblioteca no lo genera ni
consulta. Campos auxiliares, responsable, aportante, motivo, tokens y huellas
de solicitudes no se copian al checkpoint ni al reporte.

El control real V1 contiene ultimaSecuencia y huboMovimientos; otros campos
auxiliares no son evidencia contable. El objeto corte de proyecciones es una
etiqueta de observacion del llamador, NO un campo nuevo de Firestore ni una
prueba de snapshot consistente. controlFinal o proyecciones pueden ser null:
se informa falta de evidencia, sin inventar un libro vacio o una comparacion.
marcadores null significa NO observados; [] declara un listado completo vacio.
Se exige catalogo completo de referencias de cuentas al corte. No se comprueba
existencia/procedencia del catalogo de categorias ni autorizacion historica.

### Orden, acumuladores y reanudacion

El prefijo siempre comienza en secuencia 1 y exige consecutividad, unicidad
de ID y pertenencia a iglesia. El cursor exclusivo contiene secuencia e ID,
con rango procesado explicito. Un lector futuro debera ordenar por secuencia
y desempatar por ID documental, limitar a la secuencia del corte y leer despues
del cursor. Esta biblioteca NO ejecuta esas consultas ni acredita su origen.
Una pagina vacia no demuestra EOF: ademas se exige finDelListado y alcanzar
exactamente ultimaSecuencia. Pagina repetida, hueco, duplicado y desorden se
diagnostican sin volver a aplicar los importes. Se detiene en el primer
documento historico invalido y conserva solo el prefijo valido para relectura.
No se presenta el resto del libro como revisado.

FIN-2 valida asientos y contrapartidas; FIN-7C.4B mantiene saldos y resultados
incrementales por los periodos solicitados. Se comprueban apertura unica,
fechas compatibles con apertura, reversas unicas y referencias de originales
anteriores. No se excluye el original al aplicar una reversa. Los signos y
resultados provienen de las funciones existentes, sin otra formula economica.
Se reconstruye el consolidado de todo el prefijo y resumenes SOLO de los meses
explicitamente solicitados; no se asume que esa seleccion abarque todo mes
historico. No se autorizan operaciones ni se revisan recibos privados o Auth.

El checkpoint contiene contexto normalizado, versionAlgoritmo, observaciones
economicas minimas, cursor, rango y reconstruccion. Puede exportarse como JSON
por el llamador: la biblioteca no guarda archivos. Reanudar vuelve a procesar
el prefijo desde cero y exige igualdad de reconstruccion, cursor, rango y
contexto. Rechaza alteraciones incoherentes, datos de otra iglesia, version
incompatible y accesores. El checkpoint no contiene claves, nombres, motivo,
aportante ni IDs de actor; sigue conteniendo importes e identificadores del
libro y requiere almacenamiento privado por su futuro consumidor.

Esta comprobacion NO autentica un archivo externo: quien altere coherentemente
observaciones y reconstruccion puede producir otro checkpoint matematicamente
valido. No hay firma, MAC, hash retrospectivo ni evidencia de procedencia.
La relectura de fuentes confiables y la custodia de los checkpoints siguen
pendientes de un adaptador posterior; no se afirma seguridad de produccion.

### Comparacion, diagnosticos y consistencia

Se comparan saldo, huboMovimientos, aperturaRegistrada y ultimaSecuencia por
cuenta; escala, moneda, zona, saldos inicial/final, resultados y mapas por cuenta
del resumen; y el vinculo unico del marcador con original, versionOriginal,
reversionId, secuencia, iglesia y versionControlAnterior null. Se conserva la
secuencia de un resumen cerrado: no se exige que sea la secuencia global mas
reciente, sino la ultima secuencia observada hasta ese mes conforme al flujo V1.

Un resumen viejo que carezca de una cuenta incorporada despues se informa como
campo ausente, sin rellenarlo silenciosamente con cero. Clasificacion ausente
en documentos legados permite calculo economico pero deja datos insuficientes;
clasificacion contradictoria, asientos invalidos o marcador incoherente producen
inconsistencia. Marcador ausente en listado declarado completo contradice el
contrato transaccional V1; marcador no observado es informacion insuficiente.
Version de snapshot ausente no se inventa ni se confunde con corrupcion monetaria.

La salida incluye checkpoint y reporte: estado DIVERGENCIAS,
DATOS_INSUFICIENTES o SIN_DIFERENCIAS_OBSERVADAS; rango, corte, reconstruccion e
incidencias ordenadas por referencia y codigo, con valores esperados/observados
cuando procede. No se registran logs. Las diferencias se refieren exclusivamente
a las observaciones suministradas, no acreditan fraude ni procedencia remota.
Entradas y documentos se conservan sin mutar ni congelar; salida congelada.

Solo se comparan proyecciones con prefijo completo, control inicial/final igual
y etiqueta de corte coincidente. Si cambian control o corte, se pospone la
comparacion; no se declara divergencia financiera por comparar instantes distintos.
BEST_EFFORT siempre deja constancia de consistencia insuficiente. La pausa externa
solo se DECLARA y certificacionHistorica es SIEMPRE false, tambien cuando no se
observan diferencias. completoHastaCorte describe cobertura de secuencias, no
snapshot global certificado ni historial completo fuera de ese corte.

V1 no ofrece fence o pausa obligatoria para todos los escritores Admin. Una
conciliacion definitiva requerira detener externamente todos los escritores,
usar fuentes confiables y observar controles, catalogo, paginas, proyecciones y
marcadores en ese mismo intervalo; controlFinal debe leerse al terminar todas
esas observaciones. Version de control igual es necesaria, no prueba de esas
condiciones. Ni siquiera eso protege contra una reescritura administrativa
coordinada del historico. Falta implementar y validar ese ejecutor/control;
esta fase no resuelve ese bloqueo ni produce un certificado historico.

### Presupuestos y evidencia FIN-7C.4C

Limites propios de esta utilidad: 500 documentos por pagina, 2000 paginas por
llamada, 20000 movimientos acumulados, 1000 referencias de cuentas y 24 periodos.
NO retiran los limites 50/50/200 del adaptador. El checkpoint conserva el prefijo
economico, por lo que memoria crece con N. Cada reanudacion revalida ese prefijo:
coste O(N por periodos), y muchas llamadas de una pagina pueden tener coste
cuadratico total. Es una primera referencia comprobable V1, no el conciliador
de memoria constante ni el protocolo V2 del diseno. No sirve para una migracion
de produccion ni corrige libros al alcanzar un limite.

68 pruebas nuevas incluyen 0, 1, 3, 201, 1001 y 10000 movimientos ficticios,
distintas particiones de paginas, equivalencia con calcularLibro, reanudacion
JSON, corrupcion de saldos/resumenes/marcadores, secuencias, clasificaciones,
reversas entre meses, ausencia de evidencia e inmutabilidad.
Primera ejecucion: 51 aprobadas y 11 fallidas por intentar corromper fixtures
congelados devueltos por FIN-2. Se corrigieron solo las copias de prueba y la
independencia de las observaciones inicial/final del control. La suite siguiente
aprobo 63 casos; se añadieron cinco casos de evidencia insuficiente y la suite
Node completa aprobo 1.503 (68 nuevas y 1.435 regresiones), cero fallidas u
omitidas. node --check correcto en ambos JS nuevos. Sin emuladores ni Firebase
real; las 150 integradas y 46 reglas anteriores no se reejecutaron en esta fase.


## FIN-7C.4D.1: protocolo privado para escritores contables V1

Documento separado de FIN-3: iglesias/{iglesiaId}/finanzas_control/protocolo.
Contrato estricto, sin campos adicionales:

    { iglesiaId, versionProtocolo: 1, epoca: 1, estado: 'operativo_v1' }

protocolo.js exporta exigirEscrituraV1(datos, iglesiaId), PROTOCOLO_V1 y ESTADOS.
No lee Firestore, no inicializa documentos, no cambia estados ni autoriza actores.
Esta compilacion fija version 1 y epoca 1; no adopta automaticamente una epoca
remota. bloqueado, transicion y operativo_v2 son estados reconocidos que DENIEGAN
escrituras V1. Estado desconocido, formato extra/incompleto, version o epoca
incompatible, iglesia incorrecta y documento ausente tambien deniegan. No existe
compatibilidad implicita por ausencia, tampoco para libros vacios o al borrar el
documento despues de inicializar. No se implementa ni activa V2.

### Conjunto de escritores y punto de coordinacion

crearAdaptadorFirestore.ejecutar conserva la API y comprueba el protocolo en el
punto comun a crearCuenta, crearCategoria, apertura, ingreso, gasto, transferencia,
reversion y ajuste. La lectura documental se realiza dentro de la misma
transaccion, despues de buscar recibo y antes de autorizar/preparar escrituras.
Una escritura del protocolo participa en la serializacion de Firestore: el
escritor contable confirma antes del bloqueo, o debe reintentar/releer y denegar
si el bloqueo ya se confirmo. No se declara pausa hasta que el commit de bloqueo
se confirma. Una comprobacion fuera de la transaccion no sustituye esta lectura.
No se escribe el protocolo en cada asiento ni se generan efectos externos.

Recibo existente e identico: se comprueban recibo y entidad/movimiento original
y se devuelve CONFIRMADA historica sin escrituras, incluso bloqueado, ausente o
en otra epoca. No es acceso vigente, saldo actual ni permiso para otra operacion.
Payload distinto sigue rechazado. Sin recibo confirmado, no hay excepcion.
FIN-3, pertenencia, precondiciones, reservas, apertura unica, marcadores de
reversion y limites 50/50/200 permanecen intactos.

Auditoria de escritores: el adaptador es el unico escritor contable productivo
observado de movimientos, saldos, resumenes, catalogos, reservas y marcadores.
functions/finanzas.js y la revocacion desde membresia escriben acceso,
elegibilidad y su propia auditoria administrativa. No escriben el libro ni
proyecciones y NO se bloquean: deben poder seguir revocando permisos. El
adaptador sigue leyendo acceso, perfiles e iglesia dentro de cada transaccion.
Este protocolo pausa contabilidad V1; NO congela toda la coleccion de auditoria
ni configuracion de acceso. Los sembradores/herramientas demo y cualquier Admin
externo tampoco quedan encerrados por Security Rules. Una futura conciliacion
que incluya auditoria administrativa requerira coordinacion adicional. No hay
endpoints contables publicos en index.js. No se cambian los otros escritores.

Las reglas vigentes deniegan lecturas y escrituras cliente de finanzas_control
por defecto, incluido el protocolo. Las pruebas verifican get/list/create o
reemplazo/update/merge/delete para administrador, encargado, ajeno y sin sesion.
Admin SDK las omite: un administrador de infraestructura que borre y recree
operativo_v1 en epoca 1 puede quitar una pausa. La custodia y coordinacion de
esos escritores privilegiados es una precondicion, no una garantia de Rules.

### Inicializacion segura propuesta, no ejecutor de migracion

1. Solo en demo-fesync, con hosts locales y variables de emulador verificadas,
   detener todos los escritores Admin contables y verificar que no queda una
   instancia anterior del adaptador que desconozca el protocolo. Conservar
   fuentes/comprobantes para recuperacion; ningun dato real se migra aqui.
2. Cargar esta version en TODOS esos escritores. Mientras no exista protocolo,
   operaciones nuevas fallan cerradas; la consulta historica no escribe.
3. Una operacion administrativa confiable y separada debera leer en una
   transaccion el protocolo y controles del libro. Solo si no existe y la
   instalacion nunca tuvo otra epoca, crear (create, no set/merge) el documento
   version 1, epoca 1, operativo_v1. Revalidar iglesia, esquema e integridad del
   libro; si existe protocolo, conservarlo y detener inicializacion automatica.
   No se proporciona aqui un script ni se ejecuta inicializacion sobre datos
   existentes: solo fixtures ficticios de pruebas.
4. Para pausar, el futuro operador debera leer y comparar version/epoca/estado
   esperados dentro de una transaccion y actualizar a bloqueado. Esperar el
   commit antes de conciliar. No borrar/recrear para desbloquear ni restaurar
   operativo_v1 silenciosamente; no reutilizar epoca 1 tras una transicion.
5. Un cambio de epoca o reanudacion requiere otro paso revisado que coordine
   operadores, respalde/revalide documentos y pruebe el nuevo contrato. Esta
   compilacion no continua en epoca 2. No hay control de operador/fencing de
   herramientas, generaciones, migracion de proyecciones ni activacion V2.

Aunque el campo epoca es explicito, no se ofrece una API de transicion o un
servicio de custodia contra ABA de operadores Admin: la garantia implementada
es el conflicto/lock documental de cada commit V1 contra un bloqueo mantenido.
Una futura herramienta no puede usar desaparicion del documento como prueba de
primera inicializacion; requiere evidencia y autorizacion externa. Una escritura
Admin que ignore este protocolo queda fuera de esta garantia. Este apartado
sustituye solo la observacion anterior FIN-7C.4C de que no habia fence obligatorio
para el adaptador; no convierte al conciliador puro en certificacion historica.

### Verificacion y limites de evidencia

Pruebas unitarias con doble MVCC modelan bloqueo entre lectura y commit para
los ocho tipos; pruebas reales usan SDK Admin contra Firestore Emulator
exclusivamente demo-fesync. Se comprueban orden de commit frente a bloqueo,
operacion iniciada antes de leer un bloqueo ya confirmado y ABORTED inyectado
para obligar a un nuevo intento que relee protocolo. Este ultimo no es una
carrera espontanea observada. Los ordenes observados no demuestran todas las
intercalaciones posibles ni sustituyen limites de contencion del servicio real.
No se elimina el coste O(historial) ni los limites 50/50/200. Sin cambios en
reglas, FIN-3, algoritmos FIN-2 a FIN-6, conciliador o proyecciones; sin endpoints,
Firebase real, despliegue ni activacion del modulo para usuarios.


Evidencia ejecutada FIN-7C.4D.1: npm.cmd test desde functions aprobo 1597
(94 nuevas, 1503 regresiones), cero fallidas/omitidas. La primera invocacion npm
se hizo por error desde la raiz sin package.json y no ejecuto pruebas; se
corrigio el directorio. El ejecutor financiero protegido aprobo 211 pruebas
(199 escenarios, 11 guardas y 1 verificador final), incluidas 61 nuevas, mas
46 regresiones reales de reglas en el mismo emulador. Cero fallidas/omitidas.
En las tres carreras reales (gasto, transferencia y reversion) el escritor
confirmo antes del bloqueo, con un intento, y updateTime verifico ese orden.
Tres casos adicionales ganan el bloqueo antes de leer; otros tres reintentan
tras ABORTED inyectado y rechazan al releer. No se presenta el ABORTED inyectado
como conflicto espontaneo. Se comprobaron los cinco JS con node --check.
El emulador termino con codigo 0; SIGINT corresponde al cierre normal del
servicio por el ejecutor. No se repitieron suites para ocultar fallos.
