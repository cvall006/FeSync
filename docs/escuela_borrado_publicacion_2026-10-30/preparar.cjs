'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const old=path.resolve(__dirname,'../escuela_publicacion_2026-10-30');
let source=fs.readFileSync(path.join(old,'publicar.cjs'),'utf8');
const start=source.indexOf('function sources(){'),end=source.indexOf('async function state()',start);assert.ok(start>0&&end>start);
const replacement=`function sources(){
 const base=path.join(root,'docs/escuela_publicacion_2026-10-30'),baseline=JSON.parse(fs.readFileSync(path.join(base,'fuentes.json'))),published=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 const changed=new Set(['lib/modules/escuela/escuela_asignaciones_service.dart','lib/modules/escuela/escuela_asignaciones_screen.dart']);
 for(const f of baseline)if(!changed.has(f.path))assert.equal(sha(fs.readFileSync(path.join(root,f.path))),f.sha256,'FUENTE_AJENA_CAMBIO: '+f.path);
 const all=baseline.map(f=>({path:f.path,sha256:sha(fs.readFileSync(path.join(root,f.path)))}));
 const local=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),old=fs.readFileSync(path.join(base,'candidato.rules'),'utf8');
 const strip=s=>{const a=s.indexOf('      // Ciclos y asignaciones manuales.'),b=s.indexOf('      match /escuela_modulos/{moduloId}',a);assert.ok(a>=0&&b>a);return s.slice(0,a)+s.slice(b);};
 assert.equal(strip(local),strip(old),'REGLAS_AJENAS_CAMBIARON');return{all,local,old,published};
}
`;
source=source.slice(0,start)+replacement+source.slice(end);
source=source.replaceAll('d7f4534574425d51','4cc5ab04201e525e').replaceAll('a8314ca6-cb38-49f1-81c9-28216a197d19','6a928b08-d3f9-4267-9aa4-6b79aaeb2703').replaceAll('build/escuela_web_publicable','build/escuela_borrado_publicable').replace('/pass 20/','/pass 28/');
fs.writeFileSync(path.join(__dirname,'publicar.cjs'),source,{flag:'wx'});
for(const name of ['guardia-hosting.cjs','revertir.cjs','verificar-local.cjs','comprobar-arranque.cjs']){
 const s=fs.readFileSync(path.join(old,name),'utf8').replaceAll('d7f4534574425d51','4cc5ab04201e525e');fs.writeFileSync(path.join(__dirname,name),s,{flag:'wx'});
}
console.log('Ejecución selectiva preparada: reglas y Hosting, sin datos ni Functions.');
