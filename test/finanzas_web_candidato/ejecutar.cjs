'use strict';
const path=require('node:path'),fs=require('node:fs'),{spawnSync,execFileSync}=require('node:child_process');
require('../../functions/finanzas_v1/entorno').entorno();
if(process.argv.length!==2)throw Error('Sin argumentos alternativos');
const root=path.resolve(__dirname,'../..');
const r=spawnSync(process.execPath,['--test',path.join(root,'test/finanzas_release3/integracion.cjs')],
  {cwd:root,env:{...process.env,FIN_RELEASE_ETAPA:'9',FIN_CANDIDATO_WEB:'true'},stdio:'inherit',windowsHide:true});
if(r.status!==0)process.exit(r.status||1);
const ingreso=spawnSync(process.execPath,['--test',path.join(__dirname,'ingreso.test.cjs')],
  {cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
if(ingreso.status!==0)process.exit(ingreso.status||1);
const flutter=execFileSync('where.exe',['flutter.bat'],{encoding:'utf8'}).trim().split(/\r?\n/)[0],sdk=path.dirname(path.dirname(flutter));
const dart=path.join(sdk,'bin/cache/dart-sdk/bin/dart.exe'),snapshot=path.join(sdk,'bin/cache/flutter_tools.snapshot');
if(!fs.existsSync(dart)||!fs.existsSync(snapshot))throw Error('SDK instalado requerido');
const ui=spawnSync(dart,[snapshot,'test','--no-pub','--reporter','expanded',
  '--dart-define=FIN_WEB_CANDIDATO_TEST=true','--dart-define-from-file=config/finanzas_v1/emulador.json','test/finanzas_web_candidato/operaciones_flutter_test.dart'],
{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
process.exitCode=ui.status===0?0:1;
