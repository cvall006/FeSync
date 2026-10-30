'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),mode=process.argv[2];
if(!['flutter','reglas'].includes(mode))throw Error('Solo pruebas locales');
const log=fs.openSync(path.join(__dirname,mode==='flutter'?'pruebas-flutter.log':'pruebas-reglas.log'),'wx');
const program=mode==='flutter'?'C:/Otro/flutter/bin/cache/dart-sdk/bin/dart.exe':process.execPath;
const args=mode==='flutter'?['C:/Otro/flutter/bin/cache/flutter_tools.snapshot','test','--no-pub','test/escuela_asignaciones_service_test.dart','test/escuela_asignaciones_screen_test.dart']:['test/escuela_rules/ejecutar.cjs'];
const child=spawn(program,args,{cwd:root,env:process.env,stdio:['ignore',log,log],windowsHide:true});
child.once('error',e=>{console.error(e.message);process.exitCode=1;});child.once('exit',code=>{fs.closeSync(log);console.log(mode+': '+(code===0?'APROBADO':'FALLO '+code));process.exitCode=code===0?0:1;});
