'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
process.env.FIREBASE_CONFIG='{"projectId":"demo-fesync"}';
require('../../herramientas/migracion_demo/entorno').validarEntorno();
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/membresia_legacy_2026-10-28');
const suites=process.env.LEGACY_SOLO_PUENTE==='true'?['test/membresia_legacy/puente.test.cjs']:
 ['herramientas/migracion_demo/test/seguridad.test.js','herramientas/migracion_demo/test/integracion.test.js',
 'test/pertenencia_migracion/integracion.test.js','test/pertenencia_migracion/ejecucion.test.js','test/membresia_legacy/puente.test.cjs'];
for(const file of suites){
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(root,file)],{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(out,path.basename(file)+'.log'),(r.stdout||'')+(r.stderr||''));
 console.log(file+' -> '+r.status+' '+(r.stdout||'').split('\n').filter(s=>/^# (tests|pass|fail|skipped)/.test(s)).join('; '));
 if(r.status!==0){console.error((r.stdout||'')+(r.stderr||''));process.exit(1);}
}
const {actor,cliente,password}=require('./soporte.cjs');
(async()=>{
 const db=cliente(),admin=await actor('titular_browser'),miembro=await actor('miembro_browser'),iglesiaId='legacy_browser_'+Date.now();
 await db.doc(`iglesias/${iglesiaId}`).create({adminUid:admin.uid,nombre:'Legacy solo demo',codigoAcceso:iglesiaId,modulosActivos:{}});
 for(const p of [admin,miembro])await db.doc(`usuarios_globales/${p.uid}`).create({iglesiaId,rolGlobal:p===admin?'admin_iglesia':'servidor',nombre:'Demo Legacy',email:p.email,temaOscuro:false});
 fs.writeFileSync(path.join(out,'browser/fixture.json'),JSON.stringify({proyecto:'demo-fesync',iglesiaId,miembro:{uid:miembro.uid,email:miembro.email},admin:{uid:admin.uid,email:admin.email},password},null,2));
 console.log('LEGACY_BROWSER_LISTO; emuladores propios en espera.');
 const hasta=Date.now()+30*60*1000;
 while(Date.now()<hasta&&!fs.existsSync(path.join(out,'finalizar')))await new Promise(r=>setTimeout(r,1000));
 await db.terminate();
})().catch(e=>{console.error(e);process.exitCode=1;});
