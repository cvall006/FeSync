'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../herramientas/migracion_piloto/contrato.cjs'),{argumentos}=require('../../herramientas/migracion_piloto/cli.cjs');
const env={GCLOUD_PROJECT:'demo-fesync',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098'};
test('Proyecto explicito, destinos cruzados y falta de emuladores fallan cerrados',()=>{
 assert.equal(c.proyecto('demo-fesync',env),'demo-fesync');assert.equal(c.proyecto('fesync-app-2026',{}),'fesync-app-2026');
 for(const p of ['',undefined,'otro','fesync-app-2026.evil'])assert.throws(()=>c.proyecto(p,{}));
 assert.throws(()=>c.proyecto('fesync-app-2026',env));assert.throws(()=>c.proyecto('demo-fesync',{}));
 assert.throws(()=>c.proyecto('demo-fesync',{...env,GOOGLE_APPLICATION_CREDENTIALS:'prohibido'}));
 assert.throws(()=>c.proyecto('fesync-app-2026',{GCLOUD_PROJECT:'otro'}));
});
test('Seleccion cerrada solo uno; no titulares/roles/parametros alternativos enviados en manifiesto',()=>{
 const m={version:1,proyecto:'demo-fesync',loteId:'piloto',seleccion:{uid:'uno',iglesiaId:'a',version:'1:2'}};
 assert.deepEqual(c.manifiesto(m,'demo-fesync'),m);
 for(const extra of [{proyecto:'otro'},{seleccion:[m.seleccion]},{seleccion:{...m.seleccion,rolGlobal:'servidor'}},{uids:['uno','dos']}])assert.throws(()=>c.manifiesto({...m,...extra},'demo-fesync'));
});
test('CLI no acepta escritura implicita ni proyecto omitido o flags extras',()=>{
 for(const args of [[],['aplicar','--proyecto','demo-fesync','--directorio','x'],['dry-run','--directorio','x'],['aplicar','--force','true'],['restaurar','--proyecto','fesync-app-2026']])assert.throws(()=>argumentos(args));
 assert.equal(argumentos(['aplicar','--proyecto','demo-fesync','--directorio','x','--confirmar','abc']).modo,'aplicar');
});
test('Integridad detecta cambios y version ISO conserva nanosegundos',()=>{
 const s=c.sellar({iglesiaId:'a',campoAusente:true});assert.deepEqual(c.abrirSobre(s),s.payload);
 assert.throws(()=>c.abrirSobre({...s,payload:{...s.payload,iglesiaId:'b'}}));
 assert.equal(c.versionIso('2026-10-29T00:18:03.123456789Z').split(':')[1],'123456789');
});
test('Parche solo cambia el bloque de perfiles y conserva el resto del snapshot remoto',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const leer=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
 const fuera=s=>s.replace(/    match \/usuarios_globales\/\{userId\} \{[\s\S]*?(?=    \/\*\r?\n     \* =+\r?\n     \* IGLESIAS)/,'BLOQUE_PERFILES\n');
 const remoto=leer('docs/membresia_verificacion_2026-10-28/remotas-0.rules'),parche=leer('docs/membresia_piloto_2026-10-28/firestore.piloto.rules');
 assert.notEqual(remoto,parche);assert.equal(fuera(remoto),fuera(parche));
});
