'use strict';
// Preload solo de pruebas. Ningún socket TCP externo queda permitido.
const net=require('node:net'),http2=require('node:http2');
const permitidos=new Set(['127.0.0.1','localhost','::1']);
const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  const [options]=Array.isArray(args[0])?args[0]:net._normalizeArgs(args);
  const host=options.host??'localhost';
  if(!permitidos.has(host))throw Error('RED_EXTERNA_PROHIBIDA: '+host);
  return original.apply(this,args);
};
const conectar=http2.connect;
http2.connect=function(authority,...args){
  const host=new URL(authority.toString()).hostname;
  if(!permitidos.has(host))throw Error('RED_EXTERNA_PROHIBIDA: '+host);
  return conectar.call(this,authority,...args);
};
