'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const correccion=process.argv[2]==='pendiente';assert.ok(process.argv.length===2||(correccion&&process.argv.length===3));
const root=path.resolve(__dirname,'../..'),build=path.join(root,'build/finanzas_web_piloto_activo'),stage=path.join(__dirname,correccion?'activo-correccion-pendiente':'activo-con-acceso');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceBefore=JSON.parse(fs.readFileSync(path.join(__dirname,'activacion-preflight.json'))).fuentes,changed='lib/modules/finanzas/finanzas_mantenimiento_screen.dart';
for(const f of sourceBefore){const b=fs.readFileSync(path.join(root,f.path));if(f.path===changed){assert.equal(sha(fs.readFileSync(path.join(__dirname,'mantenimiento-antes-activacion.dart.txt'))),f.sha256);assert.notEqual(sha(b),f.sha256);}else assert.equal(sha(b),f.sha256,'FUENTE_AJENA_CAMBIADA: '+f.path);}
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../finanzas_web_despliegue_apagado_2026-10-29/manifest.json'))),web=JSON.parse(fs.readFileSync(path.join(__dirname,'web-publicado.json')));
if(correccion){const published=JSON.parse(fs.readFileSync(path.join(__dirname,'cliente-activo-publicado.json')));assert.equal(sha(fs.readFileSync(path.join(__dirname,'mantenimiento-antes-correccion-pendiente.dart.txt'))),published.cambioCliente.despues);}
assert.ok(!fs.existsSync(stage),'STAGE_YA_EXISTE');fs.mkdirSync(path.join(stage,'hosting'),{recursive:true});
const files=[];for(const f of old.files.filter(f=>f.path.startsWith('hosting/'))){const rel=f.path.slice(8);assert.ok(!rel.includes('finanzas_demo'));const b=fs.readFileSync(path.join(build,rel)),sha256=crypto.createHash('sha256').update(b).digest('hex'),dest=path.join(stage,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b,{flag:'wx'});files.push({path:f.path,sha256,bytes:b.length});}
assert.equal(files.length,43);assert.notEqual(files.find(f=>f.path==='hosting/main.dart.js').sha256,old.files.find(f=>f.path==='hosting/main.dart.js').sha256);
const manifest={proyecto:'fesync-app-2026',canal:'finanzas-piloto-8iyv',expira:web.expira,clienteHabilitado:true,cambioCliente:{path:changed,antes:sourceBefore.find(f=>f.path===changed).sha256,despues:sha(fs.readFileSync(path.join(root,changed))),motivo:'Boton de activacion en mantenimiento usando actualizarEstadoModuloFinanzas y Auth titular existentes.'},config:{FESYNC_FINANZAS_DEMO:'false',FESYNC_FINANZAS_TRANSPORTE:'publicable',FESYNC_FINANZAS_PROYECTO:'fesync-app-2026',FESYNC_FINANZAS_CLIENTE_HABILITADO:'true'},files};
fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
if(correccion){manifest.cambioCliente.motivo='Permitir activar el modulo con mantenimiento pendiente, preservando la solicitud y su resolucion por servidor.';fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
fs.copyFileSync(path.join(__dirname,'firebase.hosting.json'),path.join(stage,'firebase.hosting.json'));
let guard=fs.readFileSync(path.join(__dirname,'guardia-hosting.cjs'),'utf8');guard=guard.replace("path.resolve(__dirname,'../finanzas_web_despliegue_apagado_2026-10-29/manifest.json')","path.join(__dirname,'manifest.json')");
guard=guard.replace("let ok=['GET'",`if(host==='firebasehosting.googleapis.com'&&method==='PATCH'&&norm==='sites/'+P+'/channels/'+C){
 if(Object.keys(b).length!==1||!b.ttl)process.exit(86);
 const current=await original.call(this,{...o,method:'GET',body:undefined,queryParams:undefined});
 if(current.body?.expireTime!==m.expira)process.exit(86);
 record({caducidadConservada:m.expira,method:'GET',host,path:p});return current;
}
let ok=['GET'`);
fs.writeFileSync(path.join(stage,'guardia.cjs'),guard,{flag:'wx'});
const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'comando.json'))),args=[...previous.args];args[1]=path.join(stage,'guardia.cjs');args[args.indexOf('--config')+1]=path.join(stage,'firebase.hosting.json');
fs.writeFileSync(path.join(stage,'comando.json'),JSON.stringify({programa:previous.programa,args},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({preparado:true,archivos:files.length,main:files.find(f=>f.path==='hosting/main.dart.js'),clienteHabilitado:true,expiraConservada:web.expira}));
