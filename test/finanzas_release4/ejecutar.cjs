'use strict';
const path = require('node:path'), fs = require('node:fs');
const { spawnSync, execFileSync } = require('node:child_process');
require('../../functions/finanzas_v1/entorno').entorno();
const root = path.resolve(__dirname,'../..');
const soloFlutter = process.argv.length === 3 && process.argv[2] === '--flutter';
if(!soloFlutter && process.argv.length !== 2) throw Error('Argumentos no admitidos.');
if(!soloFlutter) {
  const node = spawnSync(process.execPath,['--test',path.join(root,'test/finanzas_release3/integracion.cjs')],
    {cwd:root,env:{...process.env,FIN_RELEASE_ETAPA:'4'},stdio:'inherit',windowsHide:true});
  if(node.status !== 0) process.exit(node.status || 1);
}
const flutter = execFileSync('where.exe',['flutter.bat'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
const sdk = path.dirname(path.dirname(flutter));
const dart = path.join(sdk,'bin/cache/dart-sdk/bin/dart.exe');
const snapshot = path.join(sdk,'bin/cache/flutter_tools.snapshot');
if(!fs.existsSync(dart)||!fs.existsSync(snapshot)) throw Error('Falta el SDK instalado. No se instalará.');
const result = spawnSync(dart,[snapshot,'test','--no-pub','--reporter','expanded',
  '--dart-define=FIN_RELEASE4_EMULATOR_TEST=true','test/finanzas_release4/emulador_flutter_test.dart'],
{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
process.exitCode = result.status === 0 ? 0 : 1;
