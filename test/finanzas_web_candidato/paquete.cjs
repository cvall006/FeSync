'use strict';
// Ensamble local, sin SDKs ni comandos de despliegue. Solo copia el inventario validado.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {inventario}=require('../finanzas_release5/paquete.cjs');
const {preparar}=require('../../herramientas/finanzas_web_plan.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/finanzas_web_candidato_2026-10-28');
const stage=path.join(out,'paquete'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(process.argv.length!==2)throw Error('No ejecuta despliegues ni admite destinos');
const plan=preparar(),runtime=inventario(),entries=[];
function write(rel,bytes){const dest=path.join(stage,rel);if(fs.existsSync(dest)){
  if(!fs.readFileSync(dest).equals(bytes))throw Error('Candidato existente distinto: '+rel);
}else{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
entries.push({path:rel,bytes:bytes.length,sha256:sha(bytes)});}
for(const f of runtime.files)write('functions/'+f.path,fs.readFileSync(path.join(root,'functions',f.path)));
for(const f of ['firestore.rules','storage.rules'])write(f,fs.readFileSync(path.join(root,f)));
const config=JSON.parse(fs.readFileSync(path.join(root,'config/finanzas_v1/publicable.json')));
assert.equal(config.FESYNC_FINANZAS_DEMO,'false');assert.equal(config.FESYNC_FINANZAS_CLIENTE_HABILITADO,'false');
assert.equal(config.FESYNC_FINANZAS_PROYECTO,'fesync-app-2026');assert.equal(config.FESYNC_EMULATOR_HOST,undefined);
const build=path.join(root,'build/finanzas_web_candidato'),excluidos=[];
function web(dir,rel=''){
  for(const f of fs.readdirSync(dir,{withFileTypes:true})){
    const r=path.posix.join(rel,f.name),abs=path.join(dir,f.name);
    if(f.isDirectory()){web(abs,r);continue;}
    const bytes=fs.readFileSync(abs);
    if(r==='finanzas_demo.html'||f.name.startsWith('.')){excluidos.push({path:r,sha256:sha(bytes)});continue;}
    if(/\.(html|js|json|txt)$/.test(r))assert.equal(/https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?|demo-fesync|finanzasMvp(?:Consultar|Ejecutar)/.test(bytes.toString('utf8')),false,'Endpoint demo en '+r);
    write('hosting/'+r,bytes);
  }
}
web(build);
const firebase={functions:{source:'functions',ignore:['node_modules','.git','firebase-debug.log','firebase-debug.*.log']},
  firestore:{rules:'firestore.rules'},hosting:{site:'fesync-app-2026',public:'hosting',ignore:['**/.*'],
    headers:[{source:'/index.html',headers:[{key:'Cache-Control',value:'no-cache'}]},
      {source:'/flutter_bootstrap.js',headers:[{key:'Cache-Control',value:'no-cache'}]}],
    rewrites:[{source:'**',destination:'/index.html'}]}};
write('firebase.json',Buffer.from(JSON.stringify(firebase,null,2)+'\n'));
for(const f of entries)assert.equal(sha(fs.readFileSync(path.join(stage,f.path))),f.sha256);
const manifest={estado:'CANDIDATO_WEB_APAGADO_SIN_DESPLIEGUE',proyecto:plan.proyecto,region:plan.region,
  runtime:runtime.files.length,exportsIncluidos:runtime.exports,selectores:plan.selectores,
  configuracion:config,excluidosWeb:excluidos,files:entries,digest:sha(JSON.stringify(entries)),
  cuentasRealesConsultadas:false,desplegado:false};
fs.writeFileSync(path.join(out,'paquete-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({archivos:entries.length,runtime:runtime.files.length,excluidos,digest:manifest.digest,desplegado:false}));
