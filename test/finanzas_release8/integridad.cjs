'use strict';
// Solo lectura del repositorio. Escribe evidencias propias de FIN8, nunca Git.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/fin_release_8_2026-10-26');
const inicial=JSON.parse(fs.readFileSync(path.join(out,'estado-inicial.json'),'utf8'));
const backup=JSON.parse(fs.readFileSync(path.join(out,'respaldo.json'),'utf8')).backup;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
const normal=s=>s.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trim();
const anteriores=new Set(inicial.map(x=>x.path)),modificados=[],faltantes=[];
let sinCambios=0,patch='';
for(const x of inicial){
  const actual=path.join(root,x.path);
  if(!fs.existsSync(actual)){
    if(x.deleted===true){sinCambios++;continue;}
    faltantes.push(x.path);continue;
  }
  if(hash(actual)===x.sha256){sinCambios++;continue;}
  modificados.push({path:x.path,antes:x.sha256,despues:hash(actual)});
  const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--',path.join(backup,'files',x.path),actual],
    {cwd:root,encoding:'utf8',windowsHide:true});
  if(![0,1].includes(diff.status))throw Error('No se pudo comparar '+x.path+': '+diff.stderr);
  patch+=diff.stdout;
}
const iguales={};
for(const [key,args,file]of [['HEAD',['rev-parse','HEAD'],'head.txt'],['rama',['branch','--show-current'],'branch.txt'],
  ['indice',['ls-files','--stage'],'index-tree.txt']]){
  iguales[key]=normal(git(...args))===normal(fs.readFileSync(path.join(backup,file),'utf8'));
}
const nuevas=git('ls-files','--others','--exclude-standard','-z').split('\0').filter(p=>p&&!anteriores.has(p));
const nuevasFuente=nuevas.filter(p=>!p.startsWith('docs/fin_release_8_2026-10-26/'));
const evidencia={backup,rutasIniciales:inicial.length,sinCambios,modificados,faltantes,iguales,
  nuevasFuente:nuevasFuente.map(p=>({path:p,sha256:hash(path.join(root,p))})),
  reglasSinCambios:!modificados.some(x=>['firestore.rules','storage.rules'].includes(x.path)),
  configuracionPublicableSinCambios:!modificados.some(x=>x.path.startsWith('config/finanzas_v1/')),
  gitDiffCheck:spawnSync('git',['diff','--check'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout};
fs.writeFileSync(path.join(out,'integridad.json'),JSON.stringify(evidencia,null,2)+'\n');
fs.writeFileSync(path.join(out,'intervencion.patch'),patch);
fs.writeFileSync(path.join(out,'git-status.txt'),git('status','--short'));
const runtime=require('../finanzas_release5/paquete.cjs').inventario();
fs.writeFileSync(path.join(out,'runtime-manifest.json'),JSON.stringify({
  ...runtime,estado:'CONFIGURACION_PUBLICABLE_DESACTIVADA',
  nota:'Manifiesto offline del código actual; no modifica paquetes anteriores ni ejecuta despliegues.'
},null,2)+'\n');
if(faltantes.length||Object.values(iguales).some(v=>!v))throw Error('No se preservó el estado original');
console.log(JSON.stringify({rutas:inicial.length,sinCambios,modificados:modificados.map(x=>x.path),
  nuevasFuente,iguales,reglasSinCambios:evidencia.reglasSinCambios},null,2));
