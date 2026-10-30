'use strict';
const { spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const node = spawnSync(process.execPath, ['--test',path.join(__dirname,'integracion.test.js')],{stdio:'inherit',cwd:root,windowsHide:true});
if (node.status !== 0) process.exit(node.status || 1);
if (process.env.FIN_MVP_PROBAR_FLUTTER === 'true') {
  const flutter = execFileSync('where.exe',['flutter.bat'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
  const sdk = path.dirname(path.dirname(flutter));
  const dart = path.join(sdk,'bin/cache/dart-sdk/bin/dart.exe');
  const snapshot = path.join(sdk,'bin/cache/flutter_tools.snapshot');
  if (!fs.existsSync(dart)||!fs.existsSync(snapshot)) throw Error('SDK Flutter existente no disponible.');
  const result = spawnSync(dart,[snapshot,'test','--no-pub','--dart-define=FIN_MVP_EMULATOR_TEST=true',
    'test/finanzas_mvp/emulador_flutter_test.dart'],{stdio:'inherit',cwd:root,windowsHide:true});
  process.exitCode = result.status === 0 ? 0 : 1;
}
