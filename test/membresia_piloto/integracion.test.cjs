'use strict';
const {test,before,after,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync,execFileSync}=require('node:child_process');
const c=require('../../herramientas/migracion_piloto/contrato.cjs'),{crear}=require('../../herramientas/migracion_piloto/ejecutor.cjs'),{conectar}=require('../../herramientas/migracion_piloto/cli.cjs');
const {actor,call}=require('../membresia_legacy/soporte.cjs');
c.proyecto('demo-fesync');let ad,db,titular,miembro,m,dir;
const out=path.resolve(__dirname,'../../docs/membresia_piloto_2026-10-28');
before(async()=>{ad=await conectar('demo-fesync');db=ad.db;});after(async()=>ad.cerrar());
beforeEach(async()=>{
 const r=await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents',{method:'DELETE'});assert.equal(r.ok,true);
 titular=await actor('titular_piloto');miembro=await actor('miembro_piloto');
 await db.doc('iglesias/a').create({adminUid:titular.uid,nombre:'Solo demo',codigoAcceso:'PILOTO'});
 await db.doc(`usuarios_globales/${titular.uid}`).create({iglesiaId:'a',rolGlobal:'admin_iglesia'});
 await db.doc(`usuarios_globales/${miembro.uid}`).create({iglesiaId:'a',rolGlobal:'servidor',nombre:'Conservar fixture',preferencias:{tema:'claro'}});
 const s=await db.doc(`usuarios_globales/${miembro.uid}`).get();
 m={version:1,proyecto:'demo-fesync',loteId:'piloto-demo',seleccion:{uid:miembro.uid,iglesiaId:'a',version:c.version(s)}};
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'piloto-unitario-'));
});
const sinId=async()=>assert.equal(Object.hasOwn((await db.doc(`usuarios_globales/${miembro.uid}`).get()).data(),'pertenenciaId'),false);
const cli=(...args)=>spawnSync(process.execPath,[path.resolve(__dirname,'../../herramientas/migracion_piloto/cli.cjs'),...args],{env:process.env,encoding:'utf8',windowsHide:true});
test('Piloto CLI completo: seleccion uno, dry-run, respaldo, aplicacion, reintento y salida normal',async()=>{
 const ps=`$a=New-Object System.Security.AccessControl.DirectorySecurity;$s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$r=New-Object System.Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit, ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath '${dir.replaceAll("'","''")}' -AclObject $a`;
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true});
 const snap=await db.doc(`usuarios_globales/${miembro.uid}`).get();
 const iso=new Date(snap.updateTime.seconds*1000).toISOString().replace('.000Z','.'+String(snap.updateTime.nanoseconds).padStart(9,'0')+'Z');
 const reporte={proyecto:'demo-fesync',primerLoteSugerido:[miembro.uid],candidatos:[{uid:miembro.uid,iglesiaId:'a',versionPerfil:iso,rolGlobal:'servidor',esTitular:false,esEncargado:false,estado:'migrable'}]};
 fs.writeFileSync(path.join(dir,'seleccion.json'),JSON.stringify(reporte));
 let r=cli('preparar','--proyecto','demo-fesync','--directorio',dir,'--reporte',path.join(dir,'seleccion.json'),'--lote','piloto-demo');assert.equal(r.status,0,r.stderr);
 r=cli('aplicar','--proyecto','demo-fesync','--directorio',dir,'--confirmar','no-dry-run');assert.notEqual(r.status,0);await sinId();
 r=cli('dry-run','--proyecto','demo-fesync','--directorio',dir);assert.equal(r.status,0,r.stderr);const d=JSON.parse(r.stdout);await sinId();
 assert.equal(fs.readFileSync(path.join(dir,'respaldo.json'),'utf8'),fs.readFileSync(path.join(dir,'respaldo.copia.json'),'utf8'));
 r=cli('aplicar','--proyecto','demo-fesync','--directorio',dir,'--confirmar',d.confirmacion);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).estado,'CONFIRMADO');
 const ref=db.doc(`usuarios_globales/${miembro.uid}`),s=await ref.get(),com=await db.doc(`migraciones_pertenencia/${miembro.uid}`).get();
 assert.match(s.data().pertenenciaId,/^[a-f0-9]{64}$/);assert.equal(s.data().nombre,'Conservar fixture');assert.deepEqual(s.data().preferencias,{tema:'claro'});assert.deepEqual(s.updateTime,com.updateTime);
 r=cli('aplicar','--proyecto','demo-fesync','--directorio',dir,'--confirmar',d.confirmacion);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).resultadoMotor,'omitido');assert.deepEqual((await ref.get()).updateTime,s.updateTime);
 // Recuperacion del archivo local desde la copia: ninguna escritura Firebase.
 fs.renameSync(path.join(dir,'respaldo.json'),path.join(dir,'respaldo.original.json'));
 r=cli('recuperar-respaldo','--proyecto','demo-fesync','--directorio',dir);assert.equal(r.status,0,r.stderr);
 assert.equal(fs.readFileSync(path.join(dir,'respaldo.json'),'utf8'),fs.readFileSync(path.join(dir,'respaldo.original.json'),'utf8'));
 const salida=await call('desvincularMiembroIglesia',miembro,{iglesiaId:'a',uidObjetivo:miembro.uid,accion:'salir',pertenenciaId:s.data().pertenenciaId,solicitudId:'piloto_salida_normal_123456'});
 assert.equal(salida.status,200,JSON.stringify(salida));const final=(await ref.get()).data();assert.equal(final.iglesiaId,undefined);assert.equal(final.rolGlobal,undefined);assert.equal(final.pertenenciaId,s.data().pertenenciaId);
 fs.mkdirSync(path.join(out,'demo'),{recursive:true});for(const file of ['manifiesto.json','dry-run.json','respaldo.json','respaldo.copia.json'])fs.copyFileSync(path.join(dir,file),path.join(out,'demo',file));
 fs.writeFileSync(path.join(out,'demo/resultado.json'),JSON.stringify({proyecto:'demo-fesync',perfilesMigrados:1,reintentoSinNuevaAsignacion:true,respaldoRestauradoLocalmente:true,salidaEntradaNormal:true,pertenenciaConservadaTrasSalida:true,recibosMigracion:(await db.collection('migraciones_pertenencia').get()).size},null,2));
});
test('Respuesta perdida despues del commit: verificacion y reintento recuperan la misma pertenencia',async()=>{
 const d=await ad.ejecutor.dryRun(m,dir),original=db.runTransaction.bind(db);let perder=true;
 db.runTransaction=async(fn,opts)=>{const r=await original(fn,opts);if(!opts?.readOnly&&perder){perder=false;throw Error('Respuesta descartada post-commit');}return r;};
 let r;try{r=await ad.ejecutor.aplicar(m,dir,d.confirmacion);}finally{db.runTransaction=original;}
 assert.equal(r.estado,'DETENIDO_VERIFICAR');const p=await db.doc(`usuarios_globales/${miembro.uid}`).get();
 assert.equal((await ad.ejecutor.verificar(m,dir)).estado,'CONFIRMADO');assert.equal((await ad.ejecutor.aplicar(m,dir,d.confirmacion)).estado,'CONFIRMADO');assert.deepEqual((await db.doc(`usuarios_globales/${miembro.uid}`).get()).updateTime,p.updateTime);
});
test('Titular, encargado de esta/otra iglesia y perfil sin pertenencia se excluyen',async()=>{
 await db.doc('iglesias/b').create({adminUid:miembro.uid});await assert.rejects(ad.ejecutor.dryRun(m,dir),/TITULAR_EXCLUIDO/);await db.doc('iglesias/b').delete();
 for(const id of ['a','b']){if(id==='b')await db.doc('iglesias/b').create({adminUid:'otro_titular_sintetico'});await db.doc(`iglesias/${id}/finanzas_config/acceso`).set({encargadoUid:miembro.uid});await assert.rejects(ad.ejecutor.dryRun(m,dir),/ENCARGADO_EXCLUIDO/);await db.doc(`iglesias/${id}/finanzas_config/acceso`).delete();}
 await db.doc(`usuarios_globales/${miembro.uid}`).set({nombre:'Sin iglesia'});await assert.rejects(ad.ejecutor.dryRun(m,dir),/PRECONDICION_MEMBRESIA/);await sinId();
});
test('Designacion o iglesia cambiadas despues del dry-run: transaccion rechaza sin asignacion',async()=>{
 const d=await ad.ejecutor.dryRun(m,dir);await db.doc('iglesias/a/finanzas_config/acceso').set({encargadoUid:miembro.uid});
 assert.equal((await ad.ejecutor.aplicar(m,dir,d.confirmacion)).estado,'DETENIDO_VERIFICAR');await sinId();
 await db.doc('iglesias/a/finanzas_config/acceso').delete();await db.doc(`usuarios_globales/${miembro.uid}`).update({iglesiaId:'otra'});
 assert.equal((await ad.ejecutor.aplicar(m,dir,d.confirmacion)).estado,'DETENIDO_VERIFICAR');await sinId();
});
test('Identidad revocada despues de dry-run bloquea aplicacion',async()=>{
 const d=await ad.ejecutor.dryRun(m,dir);
 const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/demo-fesync/accounts:update',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({localId:miembro.uid,disableUser:true})});assert.equal(r.ok,true);
 await assert.rejects(ad.ejecutor.aplicar(m,dir,d.confirmacion),/IDENTIDAD_NO_VIGENTE/);await sinId();
});
test('Respaldo alterado y cambio de manifiesto no pueden ejecutar',async()=>{
 const d=await ad.ejecutor.dryRun(m,dir);await assert.rejects(ad.ejecutor.aplicar({...m,seleccion:{...m.seleccion,uid:titular.uid}},dir,d.confirmacion),/ARTEFACTOS_NO_COINCIDEN/);
 const file=path.join(dir,'respaldo.json'),b=JSON.parse(fs.readFileSync(file));b.payload.estado.perfil.datos.iglesiaId='otra';fs.writeFileSync(file,JSON.stringify(b));
 await assert.rejects(ad.ejecutor.aplicar(m,dir,d.confirmacion),/INTEGRIDAD_INVALIDA/);await sinId();
});
test('Revocacion observada dentro del intento transaccional tambien impide encolar escritura',async()=>{
 let llamadas=0;
 const e=crear({db,FieldValue:ad.FieldValue,proyecto:'demo-fesync',reglasActuales:ad.reglasActuales,authActual:async uid=>({uid,disabled:++llamadas>=3})});
 const d=await e.dryRun(m,dir);
 assert.equal((await e.aplicar(m,dir,d.confirmacion)).estado,'DETENIDO_VERIFICAR');assert.ok(llamadas>=3);await sinId();
});
test('Dry-run vencido y reglas no protegidas se rechazan',async()=>{
 let clock=Date.now();const e=crear({db,FieldValue:ad.FieldValue,proyecto:'demo-fesync',authActual:ad.authActual,reglasActuales:ad.reglasActuales,ahora:()=>clock});
 const d=await e.dryRun(m,dir);clock+=11*60*1000;assert.equal((await e.aplicar(m,dir,d.confirmacion)).estado,'DETENIDO_VERIFICAR');await sinId();
 const inseguro=crear({db,FieldValue:ad.FieldValue,proyecto:'demo-fesync',authActual:ad.authActual,reglasActuales:async()=>c.sha('reglas inseguras')});await assert.rejects(inseguro.dryRun(m,fs.mkdtempSync(path.join(os.tmpdir(),'piloto-inseguro-'))),/REGLAS_NO_PROTEGIDAS/);
});
