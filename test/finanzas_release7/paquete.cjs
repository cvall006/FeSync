'use strict';
// Ensamble offline del runtime normal; no ejecuta index, SDKs o CLI de deploy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inventario}=require('../finanzas_release5/paquete.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/fin_release_7_2026-10-26');
const manifest=inventario(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function escribir(file,bytes){
  if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(bytes))throw Error('Candidato existente diferente: '+file);}
  else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
}
for(const f of manifest.files)escribir(path.join(out,'paquete/functions',f.path),fs.readFileSync(path.join(root,'functions',f.path)));
const config=Buffer.from(JSON.stringify({functions:{source:'functions',ignore:['node_modules','.git','firebase-debug.log','firebase-debug.*.log']}},null,2)+'\n');
escribir(path.join(out,'paquete/firebase.json'),config);
const configuraciones=['publicable.json','servidor-publicable.env.example'].map(name=>{
  const file=path.join(root,'config/finanzas_v1',name),bytes=fs.readFileSync(file);
  return {path:'config/finanzas_v1/'+name,sha256:sha(bytes)};
});
const cliente=['lib/main.dart','lib/core/services/firebase_emulator_bootstrap.dart',
  'lib/modules/finanzas/finanzas_mvp_service.dart','lib/modules/finanzas/finanzas_mvp_screen.dart',
  'lib/modules/finanzas/finanzas_transporte_config.dart'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const reporte={...manifest,configuraciones,cliente,firebaseConfigSha256:sha(config),digest:sha(JSON.stringify(manifest.files)),
  estado:'PREPARADO_SIN_HABILITACION_REAL',desplegado:false};
fs.writeFileSync(path.join(out,'paquete-manifest.json'),JSON.stringify(reporte,null,2));
console.log({files:manifest.files.length,exports:manifest.exports.length,digest:reporte.digest});
