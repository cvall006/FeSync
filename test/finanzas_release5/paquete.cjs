'use strict';
// Preparación offline: no carga index.js, SDKs ni herramientas de despliegue.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), source = path.join(root, 'functions');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function inventario() {
  const seen = new Set(), external = new Set();
  function visit(file) {
    const abs = require.resolve(file), rel = path.relative(source, abs).replaceAll('\\', '/');
    if (rel.startsWith('../') || path.isAbsolute(rel) || /(^|\/)(test|fixtures|node_modules)(\/|$)/.test(rel) ||
        /(^|\/)contabilidad_.*demo\//.test(rel)) throw Error('Dependencia no publicable: '+rel);
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!abs.endsWith('.js')) return;
    const code = fs.readFileSync(abs, 'utf8'), imports = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)];
    if ((code.match(/\brequire\s*\(/g)||[]).length !== imports.length || /\bimport\s*\(/.test(code)) {
      throw Error('Import dinámico: '+rel);
    }
    for (const [,name] of imports) {
      if (name.startsWith('.')) visit(path.resolve(path.dirname(abs), name));
      else external.add(name);
    }
  }
  visit(path.join(source,'index.js'));
  // Incluye TODO V1, aun mantenimiento que no es exportado por index.js.
  for (const file of fs.readdirSync(path.join(source,'finanzas_v1'))) visit(path.join(source,'finanzas_v1',file));
  for (const f of ['package.json','package-lock.json']) seen.add(f);
  const pkg = JSON.parse(fs.readFileSync(path.join(source,'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(source,'package-lock.json')));
  for (const name of external) {
    if (name.startsWith('node:')) continue;
    const dependency = name.startsWith('@') ? name.split('/').slice(0,2).join('/') : name.split('/')[0];
    if (!pkg.dependencies[dependency]) throw Error('Dependencia runtime no declarada: '+name);
  }
  if (JSON.stringify(pkg.dependencies) !== JSON.stringify(lock.packages[''].dependencies)) throw Error('Lock divergente');
  for (const [name,p] of Object.entries(lock.packages)) {
    if (p.link || /^(file:|link:|[A-Za-z]:[\\/])/.test(p.resolved||'')) throw Error('Dependencia local: '+name);
  }
  const files = [...seen].sort().map(file => {
    const bytes = fs.readFileSync(path.join(source,file));
    return {path:file,bytes:bytes.length,sha256:sha(bytes)};
  });
  return {files,external:[...external].sort(),node:pkg.engines.node,
    exports:[...fs.readFileSync(path.join(source,'index.js'),'utf8').matchAll(/exports\.(\w+)\s*=/g)].map(m=>m[1]).sort()};
}
function preparar() {
  const data = inventario(), out = path.join(root,'docs/fin_release_5_2026-10-26');
  const stage = path.join(out,'paquete'), runtime = path.join(stage,'functions');
  // Solo crea o verifica bytes iguales: nunca borra ni pisa un artefacto distinto.
  function write(file,bytes) {
    if (fs.existsSync(file)) { if (!fs.readFileSync(file).equals(bytes)) throw Error('Artefacto existente distinto: '+file); }
    else { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,bytes); }
  }
  for (const f of data.files) write(path.join(runtime,f.path),fs.readFileSync(path.join(source,f.path)));
  const config = Buffer.from(JSON.stringify({functions:{source:'functions',ignore:['node_modules','.git','firebase-debug.log','firebase-debug.*.log']}},null,2)+'\n');
  write(path.join(stage,'firebase.json'),config);
  const manifest = {...data,config:{path:'firebase.json',sha256:sha(config)},
    digest:sha(JSON.stringify(data.files)),estado:'BLOQUEADO_PARA_ACTIVACION_REAL',
    restricciones:['Sin despliegue','Sin reglas','Sin fixtures','Sin credenciales','Barrera demo preservada']};
  fs.writeFileSync(path.join(out,'paquete-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({files:data.files.length,digest:manifest.digest,exports:data.exports.length}));
}
if (require.main === module) preparar();
module.exports = {inventario};
