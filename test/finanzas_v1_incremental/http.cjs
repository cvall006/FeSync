'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const evidencia=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/fin_release_2_2026-10-24/emulador.json'),'utf8'));
async function login(email){
 const r=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'SoloDemo123!',returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);return(await r.json()).idToken;
}
async function query(token,data){
 const r=await fetch('http://127.0.0.1:5008/demo-fesync/southamerica-west1/finanzasMvpConsultar',{
  method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(90000)});
 return r.json();
}
(async()=>{
 const antiguo=await query(await login('admin@finanzas.demo'),{historialPaginado:true});
 assert.equal(antiguo.result.movimientos.length,8);assert.equal(antiguo.result.saldoTotalMinor,118600);
 const token=await login(evidencia.fixturePrincipal.correo);
 const primera=await query(token,{historialPaginado:true,limite:17});assert.ok(primera.result,JSON.stringify(primera.error));
 assert.equal(primera.result.versionConsulta,'v1_incremental_paginado');assert.equal(primera.result.movimientos.length,17);
 const segunda=await query(token,{historialPaginado:true,limite:17,cursor:primera.result.historial.cursorSiguiente});
 assert.equal(segunda.result.movimientos.length,17);
 const ids=[...primera.result.movimientos,...segunda.result.movimientos].map(m=>m.id);assert.equal(new Set(ids).size,34);
 const clienteViejo=await query(token,{});assert.equal(clienteViejo.error.message,'CLIENTE_HISTORIAL_PAGINADO_REQUERIDO');
 const sinAuth=await query(null,{historialPaginado:true});assert.equal(sinAuth.error.status,'UNAUTHENTICATED');
 const proof={project:'demo-fesync',functionsPort:5008,legacy:{movimientos:8,total:118600},
  incremental:{iglesiaId:evidencia.fixturePrincipal.iglesiaId,corte:primera.result.historial.corte,filas:34,sinDuplicados:true,
  saldo:primera.result.saldoTotalMinor},clienteViejo:clienteViejo.error.message,sinAuth:sinAuth.error.status,escriturasFinancieras:0};
 fs.writeFileSync(path.resolve(__dirname,'../../docs/fin_release_2_2026-10-24/http.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e.message);process.exitCode=1});
