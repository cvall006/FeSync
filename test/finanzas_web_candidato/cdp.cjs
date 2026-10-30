'use strict';
// Cliente CDP local, sin dependencias instaladas ni acceso a Firebase.
class CDP {
  constructor(socket){this.socket=socket;this.n=0;this.pending=new Map();this.handlers={};
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);
      if(m.id){const p=this.pending.get(m.id);this.pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
      else for(const f of this.handlers[m.method]||[])Promise.resolve(f(m.params)).catch(e=>console.error('CDP: '+e.message));});}
  static async connect(url){if(!url.startsWith('ws://127.0.0.1:9228/'))throw Error('Solo CDP local');
    const socket=new WebSocket(url);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});return new CDP(socket);}
  on(name,handler){(this.handlers[name]??=[]).push(handler);}
  send(method,params={}){const id=++this.n;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
  close(){this.socket.close();}
}
module.exports={CDP};
