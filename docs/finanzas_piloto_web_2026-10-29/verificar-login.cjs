'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
const {CDP}=require('../../test/finanzas_web_candidato/cdp.cjs');
async function main(){
const web=JSON.parse(fs.readFileSync(path.join(__dirname,'web-publicado.json')));if(!/^https:\/\/fesync-app-2026--finanzas-piloto-8iyv-[a-z0-9]+\.web\.app$/.test(web.url))throw Error('URL inesperada');
await new Promise((r,j)=>{const s=net.createServer();s.once('error',j);s.listen(9228,'127.0.0.1',()=>s.close(r));});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fesync-piloto-login-'));
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9228','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--window-size=1200,1000','about:blank'],{windowsHide:true,stdio:'ignore'});
let c;const network=[],errors=[],consoleAuthErrors=[];
try{let targets;for(let i=0;i<40;i++){try{targets=await(await fetch('http://127.0.0.1:9228/json')).json();if(targets.length)break;}catch{}await new Promise(r=>setTimeout(r,250));}
if(!targets?.length)throw Error('CDP no disponible');c=await CDP.connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Network.enable');
c.on('Runtime.exceptionThrown',p=>errors.push(p.exceptionDetails.text));
c.on('Runtime.consoleAPICalled',p=>{const s=(p.args||[]).map(a=>a.value??a.description??'').join(' ');if(/unauthorized-domain|dominio.*autoriz/i.test(s))consoleAuthErrors.push(s);});
c.on('Fetch.requestPaused',async p=>{const u=new URL(p.request.url);const allowed=p.request.method==='GET'&&(u.origin===web.url||u.hostname==='www.gstatic.com'||u.hostname==='fonts.gstatic.com'||u.hostname==='fonts.googleapis.com'||u.hostname==='apis.google.com'&&u.pathname.startsWith('/js/')||u.hostname==='fesync-app-2026.firebaseapp.com'&&u.pathname.startsWith('/__/auth/')||u.hostname==='identitytoolkit.googleapis.com'&&u.pathname==='/v1/projects'||u.hostname==='accounts.google.com');network.push({method:p.request.method,host:u.hostname,path:u.pathname,allowed});await c.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:p.requestId}:{requestId:p.requestId,errorReason:'BlockedByClient'});});
await c.send('Fetch.enable',{patterns:[{urlPattern:'http*'}]});await c.send('Page.navigate',{url:web.url+'/'});
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,500));await c.eval('document.querySelector("flt-semantics-placeholder")?.click()');const text=await c.eval('document.body.innerText');if(/Google/.test(text))break;}
const before=await c.eval('document.body.innerText');fs.writeFileSync(path.join(__dirname,'login-inicial.txt'),before);
const controls=await c.eval('JSON.stringify([...document.querySelectorAll("[role=button]")].map(e=>({text:e.textContent,label:e.getAttribute("aria-label")})))');
const box=await c.eval('(()=>{const e=[...document.querySelectorAll("[role=button]")].find(e=>/Google/.test(e.textContent+" "+e.getAttribute("aria-label")));return e?.getBoundingClientRect().toJSON()})()');
if(!box)throw Error('Control Google no encontrado; inspeccionar captura');
for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x+box.width/2,y:box.y+box.height/2,button:'left',clickCount:1});
let text='';for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));text=await c.eval('document.body.innerText');if(/unauthorized-domain|dominio.*autoriz|domain.*authoriz/i.test(text))break;}
const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'login.png'),Buffer.from(shot.data,'base64'));
const result={url:web.url,text,controls:JSON.parse(controls),errors,consoleAuthErrors,network,loginExitoso:false,dominioAuthAutorizado:web.dominioAuthAutorizado,cuentaGoogleNecesitaDominio:true,perfilNavegadorNuevo:true,credencialesIntroducidas:false,documentosFinancierosConsultados:false};
fs.writeFileSync(path.join(__dirname,'login-browser.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({url:web.url,text,errors,loginExitoso:false,dominioAuthAutorizado:web.dominioAuthAutorizado}));
}finally{if(c){await c.send('Browser.close').catch(()=>{});c.close();}else browser.kill();}
}
main().catch(e=>{console.error('LOGIN_DETENIDO: '+e.message);process.exitCode=1;});
