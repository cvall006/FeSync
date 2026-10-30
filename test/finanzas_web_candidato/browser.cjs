'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process');
const {CDP}=require('./cdp.cjs');
const root=path.resolve(__dirname,'../..'),build=path.join(root,'build/finanzas_web_demo_candidato');
const out=path.join(root,'docs/finanzas_web_candidato_2026-10-28/browser');
async function main(){
  if(process.argv.length!==2)throw Error('Sin destinos alternativos');
  await new Promise((r,j)=>{const probe=net.createServer();probe.once('error',j);probe.listen(9228,'127.0.0.1',()=>probe.close(r));});
  fs.mkdirSync(out,{recursive:true});
  const js=fs.readFileSync(path.join(build,'main.dart.js'),'utf8');
  if(!js.includes('demo-fesync')||!js.includes('finanzasV1Ejecutar'))throw Error('Compilación demo requerida');
  const html=fs.readFileSync(path.join(root,'web/finanzas_demo.html'),'utf8').replaceAll(':5008',':5018');
  const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const mime={'.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store');
    if(req.url==='/'||req.url==='/index.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    if(req.url==='/flutter_bootstrap.js'){
      const bootstrap=fs.readFileSync(path.join(build,'flutter_bootstrap.js'),'utf8');
      res.setHeader('Content-Type','application/javascript');
      res.end(bootstrap.replace(/_flutter\.loader\.load\([\s\S]*$/,
        '_flutter.loader.load({config:{canvasKitBaseUrl:"canvaskit/"}});'));return;
    }
    const name=path.resolve(build,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!name.startsWith(build+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(name)]||'application/octet-stream');fs.createReadStream(name).pipe(res);
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(8878,'127.0.0.1',r);});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fesync-web-demo-chrome-'));
  const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9228','--user-data-dir='+profile,
    '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',
    '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--window-size=1200,1000','about:blank'],{windowsHide:true,stdio:'ignore'});
  let targets;for(let i=0;i<40;i++){try{targets=await(await fetch('http://127.0.0.1:9228/json')).json();if(targets.length)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!targets?.length)throw Error('Chrome CDP no disponible');
  const target=targets.find(t=>t.type==='page'),cdp=await CDP.connect(target.webSocketDebuggerUrl);
  const network=[],errors=[];
  const save=()=>fs.writeFileSync(path.join(out,'red.json'),JSON.stringify({proyecto:'demo-fesync',proxyExternoBloqueado:true,network,errors},null,2));
  cdp.on('Runtime.exceptionThrown',p=>{errors.push(p.exceptionDetails.text);save();});
  cdp.on('Fetch.requestPaused',async p=>{
    const url=new URL(p.request.url);
    if(url.hostname==='127.0.0.1'&&['8878','8088','9098','5018'].includes(url.port)){
      network.push({origen:url.origin,ruta:url.pathname,accion:'local'});save();
      await cdp.send('Fetch.continueRequest',{requestId:p.requestId});return;
    }
    // Solo bibliotecas/fonts públicos. El navegador no tiene salida externa:
    // se entregan bytes estáticos por CDP, nunca credenciales ni llamadas Firebase.
    if(p.request.method==='GET'&&url.protocol==='https:'&&
      ((url.hostname==='www.gstatic.com'&&/^\/firebasejs\/\d+\.\d+\.\d+\/firebase-[a-z-]+\.js$/.test(url.pathname))||url.hostname==='fonts.gstatic.com')){
      const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('SDK estático no disponible '+response.status);
      const bytes=Buffer.from(await response.arrayBuffer());
      network.push({origen:url.origin,ruta:url.pathname,accion:'biblioteca-estatica-publica',bytes:bytes.length});save();
      await cdp.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:200,responseHeaders:[
        {name:'Content-Type',value:response.headers.get('content-type')||'application/javascript'},
        {name:'Access-Control-Allow-Origin',value:'*'}],body:bytes.toString('base64')});return;
    }
    network.push({origen:url.origin,ruta:url.pathname,accion:'bloqueada'});save();
    await cdp.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'});
  });
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1200,height:1000,deviceScaleFactor:1,mobile:false});
  fs.writeFileSync(path.join(out,'cdp.json'),JSON.stringify({webSocketDebuggerUrl:target.webSocketDebuggerUrl,browserPid:browser.pid,profile},null,2));
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:8878/'});console.log('BROWSER_DEMO_LISTO: CDP local 9228, servicios locales, sin salida Firebase externa.');
  const deadline=Date.now()+30*60*1000;
  while(Date.now()<deadline&&!fs.existsSync(path.join(out,'finalizar-browser')))await new Promise(r=>setTimeout(r,1000));
  save();await cdp.send('Browser.close').catch(()=>{});cdp.close();server.close();
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
