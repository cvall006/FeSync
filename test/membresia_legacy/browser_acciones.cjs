'use strict';
const fs=require('node:fs'),path=require('node:path'),{CDP}=require('../finanzas_web_candidato/cdp.cjs');
const out=path.resolve(__dirname,'../../docs/membresia_legacy_2026-10-28/browser');
async function main(){
  const c=await CDP.connect(JSON.parse(fs.readFileSync(path.join(out,'cdp.json'))).webSocketDebuggerUrl);
  try{
    if(await c.eval('location.href')!=='http://127.0.0.1:8878/')throw Error('Solo página demo local');
    const [accion,valor,contenido]=process.argv.slice(2);
    await new Promise(r=>setTimeout(r,300));
    if(accion==='punto'){
      const x=Number(valor),y=Number(contenido);
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1200||y<0||y>1000)throw Error('Coordenadas inválidas');
      for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
    }else if(accion==='pulsar'){
      const box=await c.eval(`(()=>{const x=[...document.querySelectorAll('[role=button],[role=combobox],[role=option]')].filter(e=>e.textContent.trim().split(String.fromCharCode(10)).join(' ')===${JSON.stringify(valor)}||e.getAttribute('aria-label')===${JSON.stringify(valor)});return x.at(-1)?.getBoundingClientRect().toJSON()})()`);
      if(!box)throw Error('Control no encontrado: '+valor);
      for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x+box.width/2,y:box.y+box.height/2,button:'left',clickCount:1});
    }else if(accion==='campo'){
      const box=await c.eval(`(()=>{const x=[...document.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(valor)});return x?.getBoundingClientRect().toJSON()})()`);
      if(!box)throw Error('Campo no encontrado: '+valor);
      for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x+box.width/2,y:box.y+box.height/2,button:'left',clickCount:1});
      await new Promise(r=>setTimeout(r,200));
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
      await c.send('Input.insertText',{text:contenido});
    }else if(accion==='estado'){
      if(!/^[a-z0-9_-]+$/.test(valor))throw Error('Etiqueta inválida');
      const text=await c.eval('document.body.innerText');
      const elements=await c.eval(`JSON.stringify([...document.querySelectorAll('input,[role=button],[role=combobox],[role=option]')].map(e=>({text:e.textContent,label:e.getAttribute('aria-label'),value:e.type==='password'?'(demo)':e.value,role:e.getAttribute('role')})))`);
      const p=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,valor+'.png'),Buffer.from(p.data,'base64'));
      fs.writeFileSync(path.join(out,valor+'.json'),JSON.stringify({text,elements:JSON.parse(elements)},null,2));console.log(text);console.log(elements);
    }else throw Error('Acción no admitida');
    if(accion!=='estado')await new Promise(r=>setTimeout(r,400));
  }finally{c.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
