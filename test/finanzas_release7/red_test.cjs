'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
// Incluso si el guard regresara, esta autoprueba nunca abre sockets reales.
const net=require('node:net'),http2=require('node:http2');
net.Socket.prototype.connect=function(){throw Error('BASE_NO_DEBE_EJECUTARSE');};
http2.connect=function(){throw Error('BASE_NO_DEBE_EJECUTARSE');};
require('./red_local.cjs');
test('Guardia local impide TCP y HTTP2 externos antes de conectar',()=>{
  for(const host of ['externo.invalid','otro.invalid','8.8.8.8']){
    assert.throws(()=>net.connect({host,port:443}),/RED_EXTERNA_PROHIBIDA/);
    assert.throws(()=>net.connect(443,host),/RED_EXTERNA_PROHIBIDA/);
    assert.throws(()=>http2.connect('https://'+host),/RED_EXTERNA_PROHIBIDA/);
  }
  assert.throws(()=>net.connect({host:'127.0.0.1',port:8088}),/BASE_NO_DEBE_EJECUTARSE/);
});
