'use strict';
// Genera un plan offline. No importa SDKs ni ejecuta Firebase CLI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const nuevas=['consultarEstadoSolicitudIngreso','desvincularMiembroIglesia','consultarEstadoSolicitudDesvinculacion',
  'recuperarContextoSolicitudDesvinculacion','obtenerContextoCambioRolMiembro','actualizarRolMiembro',
  'actualizarEncargadoFinanciero','actualizarEstadoModuloFinanzas','finanzasV1Consultar','finanzasV1Ejecutar'];
const actualizar=['registrarNuevaIglesiaSegura','vincularUsuarioConCodigo'];
const alias=['finanzasV1ResolverSolicitud','finanzasV1Mantener'];
function validar(plan,remotas,locales){
  assert.equal(plan.proyecto,'fesync-app-2026');assert.equal(plan.region,'southamerica-west1');
  assert.deepEqual(plan.crear,nuevas);assert.deepEqual(plan.actualizar,actualizar);
  const elegidas=[...plan.crear,...plan.actualizar];assert.equal(new Set(elegidas).size,elegidas.length);
  assert.deepEqual(plan.eliminar,[]);
  for(const n of elegidas){assert.match(n,/^[A-Za-z][A-Za-z0-9]+$/);assert.ok(locales.includes(n));}
  for(const n of plan.crear)assert.ok(!remotas.includes(n),'Creación ya existente: '+n);
  for(const n of plan.actualizar)assert.ok(remotas.includes(n),'Actualización no existente: '+n);
  assert.deepEqual(plan.conservar,remotas.filter(n=>!actualizar.includes(n)));
  for(const n of plan.conservar)assert.ok(!elegidas.includes(n));
  assert.deepEqual(plan.selectores,elegidas.map(n=>'functions:'+n));
  assert.equal(plan.selectores.some(s=>s==='functions'||s.includes('*')),false);
  return true;
}
function preparar(){
  const snapshot=JSON.parse(fs.readFileSync(path.join(root,'docs/firebase_preflight_2026-10-28/resultado-remoto.json')));
  assert.equal(snapshot.project,'fesync-app-2026');assert.equal(snapshot.complete,true);
  const remotas=snapshot.functions.map(f=>f.name.split('/').pop());
  assert.equal(remotas.length,13);assert.ok(snapshot.functions.every(f=>f.name.includes('/locations/southamerica-west1/')));
  const locales=[...fs.readFileSync(path.join(root,'functions/index.js'),'utf8').matchAll(/exports\.(\w+)\s*=/g)].map(m=>m[1]);
  const plan={proyecto:snapshot.project,region:'southamerica-west1',crear:nuevas,actualizar,
    motivoActualizaciones:'Contrato con solicitudId opcional, recibos y generación servidor; mantiene entrada sin solicitudId de clientes antiguos.',
    conservar:remotas.filter(n=>!actualizar.includes(n)),eliminar:[],aliasCompatibilidadNoSeleccionados:alias,
    selectores:[...nuevas,...actualizar].map(n=>'functions:'+n),
    servidorHabilitado:false,clienteHabilitado:false,ejecutado:false};
  validar(plan,remotas,locales);
  const dart=[];function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(p.endsWith('.dart'))dart.push(fs.readFileSync(p,'utf8'));}}
  walk(path.join(root,'lib'));const codigo=dart.join('\n');
  const dependencias=locales.filter(n=>!alias.includes(n)&&new RegExp(`['"]${n}['"]`).test(codigo));
  const presentes=new Set([...remotas,...plan.crear]);
  assert.ok(dependencias.every(n=>presentes.has(n)),'Dependencia cliente sin despliegue propuesto');
  plan.dependenciasCliente=dependencias;
  const out=path.join(root,'docs/finanzas_web_candidato_2026-10-28');
  fs.writeFileSync(path.join(out,'plan-despliegue.json'),JSON.stringify(plan,null,2));
  fs.writeFileSync(path.join(out,'selectores-solo-documentados.txt'),
    '# SOLO DOCUMENTADO. Requiere autorización explícita; no ejecutar desde este script.\n'+
    'firebase deploy --project fesync-app-2026 --only '+plan.selectores.join(',')+'\n');
  console.log(JSON.stringify({crear:plan.crear.length,actualizar:plan.actualizar,conservar:plan.conservar.length,
    dependenciasCliente:plan.dependenciasCliente.length,eliminar:[],ejecutado:false}));
  return plan;
}
if(require.main===module){if(process.argv.length!==2)throw Error('Sin argumentos de ejecución remota');preparar();}
module.exports={validar,preparar};
